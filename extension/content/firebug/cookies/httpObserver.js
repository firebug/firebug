/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/xpcom",
    "firebug/cookies/baseObserver",
    "firebug/lib/http",
    "firebug/chrome/tabWatcher",
    "firebug/cookies/cookie",
    "firebug/lib/options",
    "firebug/cookies/cookieUtils",
    "firebug/lib/array",
    "firebug/chrome/firefox",
],
function(Obj, Xpcom, BaseObserver, Http, TabWatcher, Cookie, Options, CookieUtils, Arr, Firefox) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

const cookieService = Xpcom.CCSV("@mozilla.org/cookieService;1", "nsICookieService");

const panelName = "cookies";

// ********************************************************************************************* //
// HTTP observer

/**
 * @class Represents an observer for http-on-modify-request and
 * http-on-examine-response events that are dispatched
 * by Firefox when network request is executed and returned.
 */
var HttpObserver = Obj.extend(BaseObserver,
/** @lends HttpObserver */
{
    // nsIObserver
    observe: function(aSubject, aTopic, aData)
    {
        try {
            aSubject = aSubject.QueryInterface(Ci.nsIHttpChannel);
            if (aTopic == "http-on-modify-request") {
                this.onModifyRequest(aSubject);
            } else if (aTopic == "http-on-examine-response") {
                this.onExamineResponse(aSubject);
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("cookies.HttpObserver.observe; EXCEPTION " + err, err);
        }
    },

    onModifyRequest: function(request)
    {
        var name = request.URI.spec;
        var origName = request.originalURI.spec;
        var win = Http.getWindowForRequest(request);
        var tabId = Firebug.getTabIdForWindow(win);

        // Firebus's natures is to display information for a tab. So, if there
        // is no tab associated then end.
        if (!tabId)
            return;

        // Dump debug information to the console.
        if (FBTrace.DBG_COOKIES)
        {
            FBTrace.sysout("cookies.onModifyRequest: " + request.name);
            FBTrace.sysout("cookies.Cookies sent: " +
                cookieService.getCookieString(request.URI, request));
        }

        // At this moment (specified by all the conditions) FB context doesn't exists yet.
        // But the page already started loading and there are things to monitor.
        // This is why the temporary context is created. It's used as a place where to
        // store information (cookie events and hosts). All this info will be copied into
        // the real FB context when it's created (see initContext).
        if ((request.loadFlags & Ci.nsIHttpChannel.LOAD_DOCUMENT_URI) &&
            (request.loadGroup && request.loadGroup.groupObserver) &&
            (name == origName) && (win && win == win.parent))
        {
            var browser = Firefox.getBrowserForWindow(win);

            if (!Firebug.TabWatcher.shouldCreateContext(browser, name, null))
            {
                if (FBTrace.DBG_COOKIES)
                    FBTrace.sysout("cookies.onModifyRequest; Activation logic says don't create " +
                        "temp context for: " + name);
                return;
            }

            if (FBTrace.DBG_COOKIES && Firebug.CookieModule.contexts[tabId])
                FBTrace.sysout("cookies.!!! Temporary context exists for: " + tabId);

            // Create temporary context
            if (!Firebug.CookieModule.contexts[tabId])
            {
                var tempContext = new TempContext(tabId);
                Firebug.CookieModule.contexts[tabId] = tempContext;

                if (FBTrace.DBG_COOKIES)
                    FBTrace.sysout("cookies.INIT temporary context for: " + tempContext.tabId);

                tempContext.href = name;
                Firebug.CookieModule.initTempContext(tempContext);
            }
        }

        // Use the temporary context first, if it exists. There could be an old
        // context (associated with this tab) for the previous URL.
        var context = Firebug.CookieModule.contexts[tabId];
        context = context ? context : TabWatcher.getContextByWindow(win);

        // The context doesn't have to exist due to the activation support.
        if (!context)
        {
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.onModifyRequest: context is NOT available for:" +
                    request.URI.host + ", tabId: " + tabId);
            return;
        }

        // Collect all the host (redirects, iframes) as cookies for all of them
        // will be displayed.
        var activeHosts = context.cookies.activeHosts;
        var host = request.URI.host;
        if (!activeHosts[host])
        {
            activeHosts[host] = {host: host, path: request.URI.path};

            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.New host (on-modify-request): " +
                    request.URI.host + ", tabId: " + tabId, activeHosts);

            // Refresh the panel asynchronously.
            if (context instanceof Firebug.TabContext)
                context.invalidatePanels(panelName);
        }
    },

    onExamineResponse: function(request)
    {
        var win = Http.getWindowForRequest(request);
        var tabId = Firebug.getTabIdForWindow(win);
        if (!tabId)
            return;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onExamineResponse: " + request.name);

        // Do not collect received cookies if they are not necessary.
        if (!Options.get("cookies.logEvents") && !Options.get("cookies.showRejectedCookies"))
            return;

        // If logging to console is on, remember the set-cookie string, so
        // these cookies can be displayed together e.g. with rejected message.
        var setCookie;
        request.visitResponseHeaders({
            visitHeader: function(header, value) {
                if (header == "Set-Cookie")
                    setCookie = value;
            }
        });

        // Bail out if no cookies is received.
        if (!setCookie)
            return;

        // Try to get the context from the contexts array first. The TabWatacher
        // could return context for the previous page in this tab.
        var context = Firebug.CookieModule.contexts[tabId];
        context = context ? context : TabWatcher.getContextByWindow(win);

        // The context doesn't have to exist due to the activation support.
        if (!context)
        {
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.onExamineResponse: context is NOT available for:" +
                    request.URI.host + ", tabId: " + tabId);
            return;
        }

        // Associate the setCookie string with proper active host (active
        // host can be the page itself or an embedded iframe or a XHR).
        // Also remember originalURI so, the info where the cookies comes
        // from can be displayed to the user.
        var activeHosts = context.cookies.activeHosts;
        var host = request.URI.host;
        var activeHost = activeHosts[host];

        // Map of all received cookies. The key is cookie-host the value is
        // an array with all cookies with the same host.
        if (!context.cookies.activeCookies)
            context.cookies.activeCookies = [];

        if (!activeHost)
            return;

        var activeCookies = context.cookies.activeCookies;

        // xxxHonza
        // 1)the activeHost.receivedCookies array shouldn't be recreated
        // if it's already there.
        // 2) There can be more responses from the same domain (XHRs) and so,
        // more received cookies within the page life.
        // 3) The list should make sure that received cookies aren't duplicated.
        // (the same cookie can be received multiple time).
        // 4) Also, rejected cookies, are displayed in the cookie-list too and
        // these shouldn't be duplicated.
        // 5) This should be a map (key == the original host)
        //if (!activeHost.receivedCookies)
            activeHost.receivedCookies = [];

        // Parse all received cookies and store them into activeHost info.
        var cookies = setCookie.split("\n");
        for (var i=0; i<cookies.length; i++)
        {
            var cookie = CookieUtils.parseFromString(cookies[i]);
            cookie.originalURI = request.originalURI;
            if (!cookie.host)
                cookie.host = host;

            // Push into activeHosts
            var cookieWrapper = new Cookie(CookieUtils.makeCookieObject(cookie));
            activeHost.receivedCookies.push(cookieWrapper);

            // Push into activeCookies
            if (!activeCookies[cookie.host])
                activeCookies[cookie.host] = [];

            var activeCookiesForHost = activeCookies[cookie.host];
            activeCookiesForHost[CookieUtils.getCookieId(cookie)] = cookie;

            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.Cookie received: " +
                    cookie.host + ", cookie: " + cookie.name, cookie);
        }

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.Set-Cookie: " + setCookie, activeCookies);
    }
});

// ********************************************************************************************* //
// Temporary context

function TempContext(tabId)
{
    this.tabId = tabId;
    this.events = [];
}

TempContext.prototype.appendCookieEvent = function(subject, topic, data)
{
    this.events.push({subject:subject, topic:topic, data:data});
};

// ********************************************************************************************* //

return HttpObserver;

// ********************************************************************************************* //
});
