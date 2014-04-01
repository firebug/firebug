/* See license.txt for terms of usage */

define([
    "firebug/lib/xpcom",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/domplate",
    "firebug/lib/dom",
    "firebug/lib/options",
    "firebug/lib/persist",
    "firebug/lib/string",
    "firebug/lib/http",
    "firebug/lib/css",
    "firebug/lib/events",
    "firebug/cookies/baseObserver",
    "firebug/chrome/tabWatcher",
    "firebug/cookies/cookieReps",
    "firebug/cookies/cookieUtils",
    "firebug/cookies/cookie",
    "firebug/cookies/breakpoints",
    "firebug/cookies/cookieEvents",
    "firebug/lib/array",
],
function(Xpcom, Obj, Locale, Domplate, Dom, Options, Persist, Str, Http, Css, Events,
    BaseObserver, TabWatcher, CookieReps, CookieUtils, Cookie, Breakpoints, CookieEvents, Arr) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const filterByPath = "cookies.filterByPath";

const panelName = "cookies";

const idnService = Xpcom.CCSV("@mozilla.org/network/idn-service;1", "nsIIDNService");

// ********************************************************************************************* //
// Cookie observer

/**
 * @class This class represents an observer (nsIObserver) for cookie-changed
 * and cookie-rejected events. These events are dispatche by Firefox
 * see https://developer.mozilla.org/En/Observer_Notifications.
 */
var CookieObserver = Obj.extend(BaseObserver,
/** @lends CookieObserver */
{
    // nsIObserver
    observe: function(aSubject, aTopic, aData)
    {
        try
        {
            if (!Firebug.CookieModule.isAlwaysEnabled())
                return;

            // See: https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsICookieService
            // For all possible values.
            if (aTopic == "cookie-changed")
            {
                var cookies = [];
                if (aData == "batch-deleted")
                {
                    // In this case the subject is nsIArray.
                    var enumerator = aSubject.QueryInterface(Ci.nsIArray).enumerate();
                    while (enumerator.hasMoreElements())
                        cookies.push(enumerator.getNext().QueryInterface(Ci.nsICookie2));

                    // The event will be further distributed as standard "delete" event.
                    aData = "deleted";
                }
                else
                {
                    aSubject = aSubject ? aSubject.QueryInterface(Ci.nsICookie2) : null;
                    cookies.push(aSubject);
                }

                for (var i=0; i<cookies.length; i++)
                    this.iterateContexts(this.onCookieChanged, cookies[i], aData);
            }
            else if (aTopic == "cookie-rejected")
            {
                aSubject = aSubject.QueryInterface(Ci.nsIURI);
                this.iterateContexts(this.onCookieRejected, aSubject, aData);
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("cookies.CookieObserver.observe; ERROR " +
                    aTopic + ", " + aData, err);
                FBTrace.sysout("cookies.CookieObserver.observe; subject ", aSubject);
            }
        }
    },

    iterateContexts: function(fn)
    {
        var oThis = this;
        var args = Arr.cloneArray(arguments);
        TabWatcher.iterateContexts(function(context)
        {
            args[0] = context;
            fn.apply(oThis, args);
        });
    },

    /**
     * @param {String} activeUri This object represents currently active host. Notice that there
     *      can be more active hosts (activeHosts map) on one page in case
     *      of embedded iframes or/and previous redirects.
     *      Properties:
     *      host: www.example.com
     *      path: /subdir/
     *
     * @param {String} host: Represents the host of a cookie for which
     *      we are checking if it should be displayed for the active URI.
     *
     * @param {String} path: Represents the path of a cookie for which
     *      we are checking if it should be displayed for the active URI.
     *
     * @returns {Boolean} If the method returns true the host/path belongs
     *      to the activeUri.
     */
    isHostFromURI: function(activeUri, host, cookiePath)
    {
        var pathFilter = Options.get(filterByPath);

        // Compute the default path of the cookie according to the algorithm
        // defined in RFC 6265 section 5.1.4
        //
        // Steps 2 and 3 (output "/" in case the cookie path is empty, its first
        // character is "/" or there is no more than one "/")
        if (cookiePath.length == 0 || cookiePath.charAt(0) != "/" ||
            cookiePath.lastIndexOf("/") == 0)
        {
            cookiePath = "/";
        }
        else
        {
            // Step 4 (remove slash at the end of the active path according to)
            cookiePath = cookiePath.substr(0, cookiePath.lastIndexOf("/"));
        }

        // If the path filter is on, only cookies that match given path
        // according to RFC 6265 section 5.1.4 will be displayed.
        var requestPath = activeUri.path;
        if (pathFilter && (cookiePath != requestPath && !(Str.hasPrefix(requestPath, cookiePath) &&
            (Str.endsWith(cookiePath, "/") || requestPath.substr(cookiePath.length, 1) == "/"))))
        {
            return false;
        }

        // The cookie must belong to given URI from this context,
        // otherwise it won't be displayed in this tab.
        var uri = CookieUtils.makeStrippedHost(activeUri.host);
        if (uri == host)
            return true;

        if (uri.length < host.length)
            return false;

        var h = "." + host;
        var u = "." + uri;
        if (u.substr(u.length - h.length) == h)
            return true;

        return false;
    },

    isHostFromContext: function(context, host, path)
    {
        var location;
        try
        {
            host = idnService.convertACEtoUTF8(host);
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_COOKIES)
                FBTrace.sysout("Host could not be converted to UTF-8", exc);
        }

        // Invalid in Chromebug.
        try
        {
            location = context.window.location;
            if (!location || !location.protocol)
                return;
        }
        catch (err)
        {
            return false;
        }

        if (location.protocol.indexOf("http") != 0)
            return false;

        var rawHost = CookieUtils.makeStrippedHost(host);

        // Test the current main URI first.
        // The location isn't nsIURI, so make a fake object (aka nsIURI).
        var fakeUri = {host: location.host, path: location.pathname};
        if (this.isHostFromURI(fakeUri, rawHost, path))
            return true;

        // xxxHonza
        // If the context.cookies is not initialized, it's bad. It means that
        // neither temporary context no real context has been initialized
        // One reason is that Sript model issues panel.show in onModuleActivate
        // which consequently requests a file (double load prblem), which
        // consequently rises this cookie event.
        if (!context.cookies)
            return false;

        // Now test if the cookie doesn't belong to some of the
        // activeHosts (redirects, frames).
        var activeHosts = context.cookies.activeHosts;
        for (var activeHost in activeHosts)
        {
            if (this.isHostFromURI(activeHosts[activeHost], rawHost, path))
                return true;
        }

        return false;
    },

    isCookieFromContext: function(context, cookie)
    {
        return this.isHostFromContext(context, cookie.host, cookie.path);
    },

    onCookieChanged: function(context, cookie, action)
    {
        // If the action == "cleared" the cookie is *not* set. This action is triggered
        // when all cookies are removed (cookieManager.removeAll)
        // In such a case let's displaye the event in all contexts.
        if (cookie && !this.isCookieFromContext(context, cookie))
            return;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onCookieChanged: '" + (cookie ? cookie.name : "null") +
                "', " + action);

        if (action != "cleared")
        {
            // If log into the Console tab is on, create "deleted", "added" and "changed" events.
            if (logEvents())
                this.logEvent(new CookieEvents.CookieChangedEvent(context, CookieUtils.makeCookieObject(cookie),
                    action), context, "cookie");

            // Break on cookie if "Break On" is activated or if a cookie breakpoint exist.
            Breakpoints.breakOnCookie(context, cookie, action);
        }

        switch(action)
        {
          case "deleted":
            this.onRemoveCookie(context, cookie);
            break;
          case "added":
            this.onAddCookie(context, cookie);
            break;
          case "changed":
            this.onUpdateCookie(context, cookie);
            break;
          case "cleared":
            this.onClear(context);
            return;
          case "reload":
            context.invalidatePanels(panelName);
            return;
        }
    },

    onClear: function(context)
    {
        var panel = context.getPanel(panelName);
        panel.clear();

        if (logEvents())
            this.logEvent(new CookieEvents.CookieClearedEvent(), context, "cookiesCleared");
    },

    onCookieRejected: function(context, uri)
    {
        var path = uri.path.substr(0, (uri.path.lastIndexOf("/") || 1));
        if (!this.isHostFromContext(context, uri.host, path))
            return;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onCookieRejected: " + uri.spec);

        // Mark host and all its cookies as rejected.
        // xxxHonza there was an exception "context.cookies is undefined".
        var activeHost = context.cookies.activeHosts[uri.host];
        if (activeHost)
            activeHost.rejected = true;

        var receivedCookies = activeHost ? activeHost.receivedCookies : null;
        for (var i=0; receivedCookies && i<receivedCookies.length; i++)
            receivedCookies[i].cookie.rejected = true;

        // Refresh the panel asynchronously.
        context.invalidatePanels(panelName);

        // Bail out if events are not logged into the Console.
        if (!logEvents())
            return;

        // The "cookies-rejected" event is sent even if no cookies
        // from the blocked site have been actually received.
        // So, the receivedCookies array can be null.
        // Don't display anything in the console in that case,
        // there could be a lot of "Cookie Rejected" events.
        // There would be actually one for each embedded request.
        if (!receivedCookies)
            return;

        // Create group log for list of rejected cookies.
        var groupRow = Firebug.Console.openGroup(
            [new CookieEvents.CookieRejectedEvent(context, uri)],
            context, "cookiesRejected", null, true, null, true);

        // The console can be disabled (since FB 1.2).
        if (!groupRow)
            return;

        // It's closed by default.
        Css.removeClass(groupRow, "opened");
        Firebug.Console.closeGroup(context, true);

        // Create embedded table.
        CookieReps.CookieTable.render(receivedCookies, groupRow.lastChild);
    },

    onAddCookie: function(context, cookie)
    {
        var panel = context.getPanel(panelName, true);
        var repCookie = panel ? panel.findRepObject(cookie) : null;
        if (repCookie)
        {
            this.onUpdateCookie(context, cookie);
            return;
        }

        if (!panel || !panel.table)
            return;

        var repCookie = panel ? panel.findRepObject(cookie) : null;

        cookie = new Cookie(CookieUtils.makeCookieObject(cookie));

        var tbody = panel.table.lastChild;
        var parent = tbody.lastChild ? tbody.lastChild : tbody;
        var row = CookieReps.CookieRow.cookieTag.insertRows({cookies: [cookie]}, parent)[0];

        cookie.row = row;
        row.repObject = cookie;

        //xxxHonza the new cookie should respect current sorting.
    },

    onUpdateCookie: function(context, cookie)
    {
        var panel = context.getPanel(panelName, true);

        // The table doesn't have to be initialized yet.
        if (!panel || !panel.table)
            return;

        var repCookie = panel ? panel.findRepObject(cookie) : null;
        if (!repCookie)
        {
            this.onAddCookie(context, cookie);
            return;
        }

        repCookie.cookie = CookieUtils.makeCookieObject(cookie);
        repCookie.rawHost = CookieUtils.makeStrippedHost(cookie.host);

        // These are helpers so, the XML and JSON cookies don't have to be parsed
        // again and again. But we need to reset them if the value is changed.
        repCookie.json = null;
        repCookie.xml = null;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onUpdateCookie: " + cookie.name, repCookie);

        var row = repCookie.row;
        var rowTemplate = CookieReps.CookieRow;

        if (Css.hasClass(row, "opened"))
        {
            var cookieInfoBody = Dom.getElementByClass(row.nextSibling, "cookieInfoBody");

            // Invalidate content of all tabs.
            cookieInfoBody.valuePresented = false;
            cookieInfoBody.rawValuePresented = false;
            cookieInfoBody.xmlPresented = false;
            cookieInfoBody.jsonPresented = false;

            // Update tabs visibility and content of the selected tab.
            rowTemplate.updateTabs(cookieInfoBody, repCookie, context);
            rowTemplate.updateInfo(cookieInfoBody, repCookie, context);
        }

        rowTemplate.updateRow(repCookie, context);
    },

    onRemoveCookie: function(context, cookie)
    {
        var panel = context.getPanel(panelName, true);
        var repCookie = panel ? panel.findRepObject(cookie) : null;
        if (!repCookie)
            return;

        // Remove cookie from UI.
        var row = repCookie.row;
        var parent = repCookie.row.parentNode;

        if (Css.hasClass(repCookie.row, "opened"))
            parent.removeChild(row.nextSibling);

        if (!parent)
            return;

        parent.removeChild(repCookie.row);
    },

    logEvent: function(eventObject, context, className)
    {
        // xxxHonza: if the cookie is changed befor initContext, the log in
        // console is lost.
        Firebug.Console.log(eventObject, context, className, null, true);
    }
});

// ********************************************************************************************* //
// Helpers

function logEvents()
{
    return Options.get("cookies.logEvents");
}

// ********************************************************************************************* //

return CookieObserver;

// ********************************************************************************************* //
});

