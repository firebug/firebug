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
    "firebug/cookies/menuUtils",
    "firebug/cookies/templates",
    "firebug/cookies/cookieUtils",
    "firebug/cookies/cookie",
    "firebug/cookies/breakpoints",
    "firebug/cookies/cookieObserver",
    "firebug/cookies/cookieClipboard",
    "firebug/chrome/tabWatcher",
    "firebug/cookies/cookieModule",
],
function(Xpcom, Obj, Locale, Domplate, Dom, Options, Persist, Str, Http, Css, Events,
    BaseObserver, MenuUtils, Templates, CookieUtils, Cookie, Breakpoints, CookieObserver,
    CookieClipboard, TabWatcher, FireCookieModel) {

// ********************************************************************************************* //

with (Domplate) {

/**
 * @author <a href="mailto:odvarko@gmail.com">Jan Odvarko</a>
 * @namespace Holds all functionality related to the Firecookie extension.
 * There are no global objects defined to avoid collisions with other
 * extensions.
 * 
 * Compatibility:
 * - The official minimum required Firebug version is 1.4
 * 
 * 1) context.getName() has been introduced in Firebug 1.4. But this is only
 *    used for tracing.
 * 2) getWindowForRequest & getTabIdForWindow are now expected to exists (Firebug 1.3).
 * 3) getWindowForRequest & getTabIdForWindow don't exists (Firebug 1.8).
 */

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// Interfaces
const nsISupportsWeakReference = Ci.nsISupportsWeakReference;
const nsISupports = Ci.nsISupports;
const nsICookieService = Ci.nsICookieService;
const nsICookie2 = Ci.nsICookie2;
const nsIObserver = Ci.nsIObserver;
const nsICookiePermission = Ci.nsICookiePermission;
const nsIURI = Ci.nsIURI;
const nsIPrefBranch = Ci.nsIPrefBranch;
const nsISupportsString = Ci.nsISupportsString;
const nsIPermissionManager = Ci.nsIPermissionManager;
const nsIWebProgress = Ci.nsIWebProgress;
const nsIDOMWindow = Ci.nsIDOMWindow;
const nsIInterfaceRequestor = Ci.nsIInterfaceRequestor;
const nsIHttpChannel = Ci.nsIHttpChannel;
const nsIPermission = Ci.nsIPermission;
const nsIXULAppInfo = Ci.nsIXULAppInfo;
const nsIVersionComparator = Ci.nsIVersionComparator;
const nsIFilePicker = Ci.nsIFilePicker;

// Firefox Preferences
const networkPrefDomain = "network.cookie";
const cookieBehaviorPref = "cookieBehavior";
const cookieLifeTimePref = "lifetimePolicy";

// Firecookie preferences
const clearWhenDeny = "firecookie.clearWhenDeny";
const defaultExpireTime = "firecookie.defaultExpireTime";
const removeConfirmation = "firecookie.removeConfirmation";
const removeSessionConfirmation = "firecookie.removeSessionConfirmation";

// Services
const cookieManager = Xpcom.CCSV("@mozilla.org/cookiemanager;1", "nsICookieManager2");
const cookieService = Xpcom.CCSV("@mozilla.org/cookieService;1", "nsICookieService");
const observerService = Xpcom.CCSV("@mozilla.org/observer-service;1", "nsIObserverService");
const permissionManager = Xpcom.CCSV("@mozilla.org/permissionmanager;1", "nsIPermissionManager");
const appInfo = Xpcom.CCSV("@mozilla.org/xre/app-info;1", "nsIXULAppInfo");
const versionChecker = Xpcom.CCSV("@mozilla.org/xpcom/version-comparator;1", "nsIVersionComparator");
const ioService = Xpcom.CCSV("@mozilla.org/network/io-service;1", "nsIIOService");
const dateFormat = Xpcom.CCSV("@mozilla.org/intl/scriptabledateformat;1", "nsIScriptableDateFormat");
const prompts = Xpcom.CCSV("@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");

// Preferences
const PrefService = Cc["@mozilla.org/preferences-service;1"];
const nsIPrefService = Ci.nsIPrefService;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const prefService = PrefService.getService(nsIPrefService);
const prefs = PrefService.getService(nsIPrefBranch2);

// Cookie panel ID.
const panelName = "cookies";

// Cookie status & policy
var STATUS_UNKNOWN = nsICookie2.STATUS_UNKNOWN;
var STATUS_ACCEPTED = nsICookie2.STATUS_ACCEPTED;
var STATUS_DOWNGRADED = nsICookie2.STATUS_DOWNGRADED;
var STATUS_FLAGGED = nsICookie2.STATUS_FLAGGED;
var STATUS_REJECTED = nsICookie2.STATUS_REJECTED;

var POLICY_UNKNOWN = nsICookie2.POLICY_UNKNOWN;
var POLICY_NONE = nsICookie2.POLICY_NONE;
var POLICY_NO_CONSENT = nsICookie2.POLICY_NO_CONSENT;
var POLICY_IMPLICIT_CONSENT = nsICookie2.POLICY_IMPLICIT_CONSENT;
var POLICY_NO_II = nsICookie2.POLICY_NO_II;

const permOptions =
{
    "default-session": ["firecookie.default.session", false],
    "default-third-party-session": ["firecookie.default.thirdPartySession", false],
    "default-third-party": ["firecookie.default.thirdParty", false],
    "default-allow": ["firecookie.default.allow", false],
    "default-deny": ["firecookie.default.deny", false],
    "default-warn": ["firecookie.default.warn", false],
    "host-allow-session": ["firecookie.host.session", true],
    "host-allow": ["firecookie.host.accept", true],
    "host-deny": ["firecookie.host.reject", true]
};

// ********************************************************************************************* //
// Cookie Permissions

/**
 * @class This class is responsible for managing cookie permisssions.
 */
Firebug.FireCookieModel.Perm = Obj.extend(Object,
/** @lends Firebug.FireCookieModel.Perm */
{
    onCommand: function(event, context, location)
    {
        var menu = event.target;
        this.setPermission(context, menu.value, location);
    },

    onTooltipShowing: function(tooltip, context)
    {
        if (tooltip.fcEnabled)
        {
            var host = context.window.location.host;
            tooltip.label = Locale.$STRF("firecookie.perm.manage.tooltip", [host]);
        }

        return tooltip.fcEnabled;
    },

    onPopupShowing: function(menu, context)
    {
        var permTooltip = Firebug.chrome.$("fcPermTooltip");
        permTooltip.fcEnabled = false;

        var items = menu.getElementsByTagName("menuitem");
        var location = context.browser.currentURI;

        var value = this.getPermission(location);
        var defaultValue = (value.indexOf("default") == 0) ? value : this.getDefaultPref();

        items[0].value = defaultValue;

        for (var i=0; i<items.length; i++)
        {
            var option = items[i].value;
            if (option == value)
                items[i].setAttribute("checked", "true");
            items[i].label = this.getLabel(option, location);
        }

        return true;
    },

    onPopupHiding: function(menu, context)
    {
        var permTooltip = Firebug.chrome.$("fcPermTooltip");
        permTooltip.fcEnabled = true;
        return true;
    },

    getContextMenuItems: function(cookie, target, context)
    {
        if (context.browser.currentURI.host == cookie.cookie.host)
            return null;

        var location = cookie.getURI();
        var value = this.getPermission(location);
        var defaultValue = (value.indexOf("default") == 0) ? value : this.getDefaultPref();

        var items = [];
        items.push("-");

        var menu = Firebug.chrome.$("fcPermMenuPopup");
        menu.childNodes[0].value = defaultValue;
        for (var i=0; i<menu.childNodes.length; i++)
        {
            var item = menu.childNodes[i];
            var option = item.value;

            items.push({
              label: this.getLabel(option, location),
              type: "radio",
              checked: (option == value),
              nol10n: true,
              command: Obj.bindFixed(this.onCommand, this, {target: item}, context, location),
            });
        }

        return items;
    },

    getPermission: function(location)
    {
        switch (permissionManager.testPermission(location, "cookie"))
        {
            case nsIPermissionManager.ALLOW_ACTION:
                return "host-allow";
            case nsIPermissionManager.DENY_ACTION:
                return "host-deny";
            case nsICookiePermission.ACCESS_SESSION:
                return "host-allow-session";
            default:
                return this.getDefaultPref();
        }
    },

    setPermission: function(context, option, location)
    {
        var location = location ? location : context.browser.currentURI;
        permissionManager.remove(location.host, "cookie");
        switch(option)
        {
            case "host-allow-session":
                permissionManager.add(location, "cookie", nsICookiePermission.ACCESS_SESSION);
                break;
            case "host-allow":
                permissionManager.add(location, "cookie", permissionManager.ALLOW_ACTION); 
                break;
            case "host-deny":
                permissionManager.add(location, "cookie", permissionManager.DENY_ACTION);

            case "default-deny":
                if (Options.get(clearWhenDeny))
                    Firebug.FireCookieModel.onRemoveAll(context);
                break;
        }

        this.updatePermButton(context);
    },

    updatePermButton: function(context, chrome)
    {
        if (!chrome)
            chrome = context.chrome;

        // This is called through TabWatcher.iterateContexts and
        // "this" isn't passed along
        var oThis = Firebug.FireCookieModel.Perm;
        var location = context.browser.currentURI;
        var value = oThis.getPermission(location);

        var button = Firebug.chrome.$("fcPerm");
        button.label = oThis.getLabel(value, location);
        button.removeAttribute("disabled");
        button.setAttribute("value", value);
    },

    getLabel: function (option, location)
    {
        var optionInfo = permOptions[option];
        if (!optionInfo)
            return null;

        if (optionInfo[1])
            return Locale.$STRF(optionInfo[0], [location.host]);

        return Locale.$STR(optionInfo[0]);
    },

    getDefaultPref: function()
    {
        var behavior = getPref(networkPrefDomain, cookieBehaviorPref);
        if (typeof(behavior) == "undefined")
            behavior = 0;

        if (behavior == 2)
            return "default-deny";

        switch (getPref(networkPrefDomain, cookieLifeTimePref))
        {
            case 1: 
                return "default-warn";
            case 2: 
                return (behavior == 0) ? "default-third-party-session" :
                    "default-session";
        }

        switch (behavior)
        {
            case 0: 
                return "default-third-party";
            case 1: 
                return "default-allow";
        }

        return null;
    }
});

// ********************************************************************************************* //
// Cookie Helpers

function getCookieId(cookie)
{
    return cookie.host + cookie.path + cookie.name;
}

function parseFromString(string)
{
    var cookie = new Object();
    var pairs = string.split("; ");
    
    for (var i=0; i<pairs.length; i++)
    {
        var option = pairs[i].split("=");
        if (i == 0)
        {
            cookie.name = option[0];
            cookie.value = option[1];
        } 
        else
        {
            var name = option[0].toLowerCase();
            name = (name == "domain") ? "host" : name;
            if (name == "httponly")
            {
                cookie.isHttpOnly = true;
            }
            else if (name == "expires")
            {
                var value = option[1];
                value = value.replace(/-/g, " ");
                cookie[name] = Date.parse(value) / 1000;

                // Log error if the date isn't correctly parsed.
                if (FBTrace.DBG_COOKIES)
                {
                    var tempDate = new Date(cookie[name] * 1000);
                    if (value != tempDate.toGMTString())
                    {
                        FBTrace.sysout("cookies.parseFromString: ERROR, " + 
                            "from: " + value + 
                            ", to: " + tempDate.toGMTString() + 
                            ", cookie: " + string + 
                            "\n");
                    }
                }
            }
            else
            {
                cookie[name] = option[1];
            }
        }
    }

    return cookie;
}

function parseSentCookiesFromString(header)
{
    var cookies = [];

    if (!header)
        return cookies;

    var pairs = header.split("; ");

    for (var i=0; i<pairs.length; i++) {
        var pair = pairs[i];
        var index = pair.indexOf("=");
        if (index > 0) {
            var name = pair.substring(0, index);
            var value = pair.substr(index+1);
            if (name.length && value.length)
                cookies.push(new Cookie(CookieUtils.makeCookieObject({name: name, value: value})));
        }
    }

    return cookies;
}

// ********************************************************************************************* //
// Debug helpers

function checkList(panel)
{
    if (!FBTrace.DBG_COOKIES)
        return;

    if (!panel || !this.panelNode)
        return; 

    var row = Dom.getElementByClass(this.panelNode, "cookieRow");
    while (row)
    {
        var rep = row.repObject;
        if ((rep.cookie.name != row.firstChild.firstChild.innerHTML) ||
            (rep.cookie.path != row.childNodes[3].firstChild.innerHTML))
        {
            FBTrace("---> Check failed!\n");
            FBTrace("--->" + rep.rawHost + ", " + rep.cookie.name + ", " +
                rep.cookie.path + "\n");
            FBTrace("    " + row.firstChild.firstChild.innerHTML + ", " +
                row.childNodes[3].firstChild.innerHTML + "\n");
        }

        row = row.nextSibling;
    }

    return null;
}

// ********************************************************************************************* //
// Support for FBTraceConsole in Firebug 1.3

Firebug.FireCookieModel.TraceListener = 
{
    // Called when console window is loaded.
    onLoadConsole: function(win, rootNode)
    {
        var doc = rootNode.ownerDocument;
        var styleSheet = createStyleSheet(doc, 
            "chrome://firebug/skin/cookies/firecookieTrace.css");
        styleSheet.setAttribute("id", "fcCookieLogs");
        addStyleSheet(doc, styleSheet);
    },

    // Called when a new message is logged in to the trace-console window.
    onDump: function(message)
    {
        // Set type of the log message so, custom CSS style can be applied
        // in order to distinguishe it from other messages.
        var index = message.text.indexOf("cookies.");
        if (index == 0)
        {
            message.text = message.text.substr("cookies.".length);
            message.text = trimLeft(message.text);
            message.type = "DBG_COOKIES";
        }
    }
};

// ********************************************************************************************* //
// Custom info tab within Net panel

/**
 * @domplate Represents domplate template for cookie body that is displayed if 
 * a cookie entry in the cookie list is expanded.
 */
Firebug.FireCookieModel.NetInfoBody = domplate(Firebug.Rep,
/** @lends Firebug.FireCookieModel.NetInfoBody */
{
    tag:
        UL({"class": "netInfoCookiesList"},
            LI({"class": "netInfoCookiesGroup", $collapsed: "$cookiesInfo|hideReceivedCookies"}, 
                DIV(Locale.$STR("firecookie.netinfo.Received Cookies")),
                DIV({"class": "netInfoReceivedCookies netInfoCookies"})
            ),
            LI({"class": "netInfoCookiesGroup", $collapsed: "$cookiesInfo|hideSentCookies"}, 
                DIV(Locale.$STR("firecookie.netinfo.Sent Cookies")),
                DIV({"class": "netInfoSentCookies netInfoCookies"})
            )
        ),

    hideReceivedCookies: function(cookiesInfo)
    {
        return !cookiesInfo.receivedCookies.length;
    },

    hideSentCookies: function(cookiesInfo)
    {
        return !cookiesInfo.sentCookies.length;
    },

    // NetInfoBody listener
    initTabBody: function(infoBox, file)
    {
        var sentCookiesHeader = this.findHeader(file.requestHeaders, "Cookie");
        var receivedCookiesHeader = this.findHeader(file.responseHeaders, "Set-Cookie");

        // Create tab only if there are some cookies.
        if (sentCookiesHeader || receivedCookiesHeader)
            Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, "Cookies",
                Locale.$STR("firecookie.Panel"));
    },

    destroyTabBody: function(infoBox, file)
    {
    },

    updateTabBody: function(infoBox, file, context)
    {
        var tab = infoBox.selectedTab;
        if (tab.dataPresented || !Css.hasClass(tab, "netInfoCookiesTab"))
            return;

        tab.dataPresented = true;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.NetInfoBodyListener.updateTabBody",
                [file.requestHeaders, file.responseHeaders]);

        var sentCookiesHeader = this.findHeader(file.requestHeaders, "Cookie");
        var receivedCookiesHeader = this.findHeader(file.responseHeaders, "Set-Cookie");

        // Parse all received cookies and generate UI.
        var receivedCookies = [];
        var sentCookies = [];

        // Parse received cookies.
        if (receivedCookiesHeader) {
            var cookies = receivedCookiesHeader.split("\n");
            for (var i=0; i<cookies.length; i++) {
                var cookie = parseFromString(cookies[i]);
                if (!cookie.host)
                    cookie.host = file.request.URI.host;
                receivedCookies.push(new Cookie(CookieUtils.makeCookieObject(cookie)));
            }
        }

        // Parse sent cookies.
        sentCookies = parseSentCookiesFromString(sentCookiesHeader);

        // Create basic UI content
        var tabBody = Dom.getElementByClass(infoBox, "netInfoCookiesText");
        this.tag.replace({cookiesInfo: {
            receivedCookies: receivedCookies,
            sentCookies: sentCookies,
        }}, tabBody);

        // Generate UI for received cookies.
        if (receivedCookies.length) {
            Templates.CookieTable.render(receivedCookies,
                Dom.getElementByClass(tabBody, "netInfoReceivedCookies"));
        }

        // Generate UI for sent cookies.
        if (sentCookies.length) {
            Templates.CookieTable.render(sentCookies,
                Dom.getElementByClass(tabBody, "netInfoSentCookies"));
        }
    },

    // Helpers
    findHeader: function(headers, name)
    {
        if (!headers)
            return null;

        for (var i=0; i<headers.length; i++) {
            if (headers[i].name == name)
                return headers[i].value;
        }

        return null;
    }
});

// ********************************************************************************************* //
// Custom output in the Console panel for: document.cookie

Firebug.FireCookieModel.ConsoleListener =
{
    tag:
        DIV({_repObject: "$object"},
            DIV({"class": "documentCookieBody"})
        ),

    log: function(context, object, className, sourceLink)
    {
        //xxxHonza: chromebug says it's null sometimes.
        if (!context)
            return;

        if (object !== context.window.document.cookie)
            return;

        // Parse "document.cookie" string.
        var cookies = parseSentCookiesFromString(object);
        if (!cookies || !cookies.length)
            return;

        // Create empty log row that serves as a container for list of cookies
        // crated from the document.cookie property.
        var appendObject = Firebug.ConsolePanel.prototype.appendObject;
        var row = Firebug.ConsoleBase.logRow(appendObject, object, context,
            "documentCookie", this, null, true);

        var rowBody = Dom.getElementByClass(row, "documentCookieBody");
        Templates.CookieTable.render(cookies, rowBody);
    },

    logFormatted: function(context, objects, className, sourceLink)
    {
    }
};

// ********************************************************************************************* //
// Cookie Breakpoints

/**
 * @class Represents {@link Firebug.Debugger} listener. This listener is reponsible for
 * providing a list of cookie-breakpoints into the Breakpoints side-panel.
 */
Firebug.FireCookieModel.DebuggerListener =
{
    getBreakpoints: function(context, groups)
    {
        if (!context.cookies.breakpoints.isEmpty())
            groups.push(context.cookies.breakpoints);
    }
};

Firebug.FireCookieModel.BreakpointTemplate = domplate(Firebug.Rep,
{
    inspectable: false,

    tag:
        DIV({"class": "breakpointRow focusRow", _repObject: "$bp",
            role: "option", "aria-checked": "$bp.checked"},
            DIV({"class": "breakpointBlockHead", onclick: "$onEnable"},
                INPUT({"class": "breakpointCheckbox", type: "checkbox",
                    _checked: "$bp.checked", tabindex : "-1"}),
                SPAN("$bp|getTitle"),
                DIV({"class": "breakpointMutationType"}, "$bp|getType"),
                IMG({"class": "closeButton", src: "blank.gif", onclick: "$onRemove"})
            ),
            DIV({"class": "breakpointCode"},
                SPAN("$bp|getValue")
            )
        ),

    getTitle: function(bp)
    {
        return bp.name;
    },

    getValue: function(bp)
    {
        return bp.host + bp.path;
    },

    getType: function(bp)
    {
        return Locale.$STR("Break On Cookie Change");
    },

    onRemove: function(event)
    {
        Events.cancelEvent(event);

        var bpPanel = Firebug.getElementPanel(event.target);
        var context = bpPanel.context;

        if (!Css.hasClass(event.target, "closeButton"))
            return;

        // Remove from list of breakpoints.
        var row = Dom.getAncestorByClass(event.target, "breakpointRow");
        context.cookies.breakpoints.removeBreakpoint(row.repObject);

        // Remove from the UI.
        bpPanel.noRefresh = true;
        bpPanel.removeRow(row);
        bpPanel.noRefresh = false;

        var cookiePanel = context.getPanel(panelName, true);
        if (!cookiePanel)
            return;

        var cookie = cookiePanel.findRepObject(row.repObject);
        if (cookie)
        {
            cookie.row.removeAttribute("breakpoint");
            cookie.row.removeAttribute("disabledBreakpoint");
        }
    },

    onEnable: function(event)
    {
        var checkBox = event.target;
        if (!Css.hasClass(checkBox, "breakpointCheckbox"))
            return;

        var bp = Dom.getAncestorByClass(checkBox, "breakpointRow").repObject;
        bp.checked = checkBox.checked;

        var bpPanel = Firebug.getElementPanel(checkBox);
        var cookiePanel = bpPanel.context.getPanel(panelName, true);
        if (!cookiePanel)
            return;

        var cookie = cookiePanel.findRepObject(bp);
        if (cookie)
            cookie.row.setAttribute("disabledBreakpoint", bp.checked ? "false" : "true");
    },

    supportsObject: function(object)
    {
        return object instanceof Firebug.FireCookieModel.Breakpoint;
    }
});

// ********************************************************************************************* //
// Editor for Cookie breakpoint condition.

Firebug.FireCookieModel.ConditionEditor = function(doc)
{
    Firebug.Breakpoint.ConditionEditor.apply(this, arguments);
}

Firebug.FireCookieModel.ConditionEditor.prototype =
    domplate(Firebug.Breakpoint.ConditionEditor.prototype,
{
    endEditing: function(target, value, cancel)
    {
        if (cancel)
            return;

        var cookie = target.repObject;
        var panel = Firebug.getElementPanel(target);
        var bp = panel.context.cookies.breakpoints.findBreakpoint(cookie.cookie);
        if (bp)
            bp.condition = value;
    }
});

// ********************************************************************************************* //

/**
 * @domplate Template for cookie breakpoint displayed in the Breakpoints side
 * panel.
 */
Firebug.FireCookieModel.Breakpoint = function(cookie)
{
    this.name = cookie.name;
    this.host = cookie.host;
    this.path = cookie.path;

    this.condition = "";
    this.checked = true;

    this.onEvaluateFails = Obj.bind(this.onEvaluateFails, this);
    this.onEvaluateSucceeds =  Obj.bind(this.onEvaluateSucceeds, this);
};

Firebug.FireCookieModel.Breakpoint.prototype =
{
    evaluateCondition: function(context, cookie)
    {
        try
        {
            var scope = {};
            scope["value"] = cookie.value;
            scope["cookie"] = CookieUtils.makeCookieObject(cookie);

            // The callbacks will set this if the condition is true or if the eval faults.
            delete context.breakingCause;

            // Construct expression to evaluate. Native JSON support is available since
            // Firefox 3.5 and breakpoints since Firebug 1.5, which supports min Fx 3.5
            // So, all is good.
            var expr = "(function (){var scope = " + JSON.stringify(scope) +
                "; with (scope) { return " + this.condition + ";}})();"

            // Evaluate condition using Firebug's command line.
            var rc = Firebug.CommandLine.evaluate(expr, context, null, context.window,
                this.onEvaluateSucceeds, this.onEvaluateFails);

            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.evaluateCondition; rc " + rc, {expr: expr, scope: scope});

            return !!context.breakingCause;
        }
        catch (err)
        {
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.evaluateCondition; EXCEPTION", err);
        }

        return false;
    },

    onEvaluateSucceeds: function(result, context)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onEvaluateSucceeds; " + result, result);

        // Don't set the breakingCause if the breakpoint condition is evaluated to false.
        if (!result)
            return;

        context.breakingCause = {
            title: Locale.$STR("firecookie.Break On Cookie"),
            message: cropString(unescape(this.name + "; " + this.condition + "; "), 200)
        };
    },

    onEvaluateFails: function(result, context)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onEvaluateFails; " + result, result);

        context.breakingCause = {
            title: Locale.$STR("firecookie.Break On Cookie"),
            message: Locale.$STR("firecookie.Breakpoint condition evaluation fails"),
            prevValue: this.condition, newValue:result
        };
    }
}

function ERROR(err)
{
    if (FBTrace.DBG_ERRORS)
        FBTrace.sysout("cookies EXCEPTION " + err, err);
}

// ********************************************************************************************* //
// Firebug Registration

// For backward compatibility with Firebug 1.1
if (Firebug.ActivableModule)
    Firebug.registerActivableModule(Firebug.FireCookieModel);
else
    Firebug.registerModule(Firebug.FireCookieModel);

// Register stylesheet in Firebug. This method is introduced in Firebug 1.6
if (Firebug.registerStylesheet)
    Firebug.registerStylesheet("chrome://firebug/skin/cookies/cookies.css");

// Register breakpoint template.
Firebug.registerRep(Firebug.FireCookieModel.BreakpointTemplate);

// ********************************************************************************************* //
}});

