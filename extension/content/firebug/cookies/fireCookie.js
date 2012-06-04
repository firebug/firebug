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
],
function(Xpcom, Obj, Locale, Domplate, Dom, Options, Persist, Str, Http, Css, Events,
    BaseObserver, MenuUtils, Templates, CookieUtils, Cookie, Breakpoints, CookieObserver,
    CookieClipboard) {

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

// Helper array for prematurely created contexts
var contexts = new Array();

// Helper for debug logs.
if (typeof FBTrace == "undefined")
    FBTrace = { sysout: function() {} };

// Extend string bundle with new strings for this extension.
// This must be done yet before domplate definitions.
if (Firebug.registerStringBundle)
    Firebug.registerStringBundle("chrome://firebug/locale/cookies.properties");

// ********************************************************************************************* //
// JSON native support is introduced in Firefox 3.5
// It's used for cookie clipboard and also evaluating breakpoint conditions.

// Create fake object to avoid exceptions.
if (!this.JSON)
{
    this.JSON = {
        parse: function()
        {
            if (FBTrace.DBG_COOKIES || FBTrace.DBG_ERRORS)
                FBTrace.sysout("cookies.JSON; Use Firefox 3.5+ with native JSON support");
        },

        stringify: function()
        {
            if (FBTrace.DBG_COOKIES || FBTrace.DBG_ERRORS)
                FBTrace.sysout("cookies.JSON; Use Firefox 3.5+ with native JSON support");
        }
    }
}

// ********************************************************************************************* //

// TabWatcher is not global in Firebug 1.7
var TabWatcher = Firebug.TabWatcher ? Firebug.TabWatcher : top.TabWatcher;

// ********************************************************************************************* //
// Module Implementation

var BaseModule = Firebug.ActivableModule ? Firebug.ActivableModule : Firebug.Module;

/**
 * @module This class represents a <i>module</i> for Firecookie extension.
 * The module supports activation (enable/disable of the Cookies panel).
 * This functionality has been introduced in Firebug 1.2 and makes possible
 * to control activity of Firebug panels in order to avoid (performance) expensive
 * features.
 */
Firebug.FireCookieModel = Obj.extend(BaseModule,
/** @lends Firebug.FireCookieModel */
{
    // Set to true if all hooks for monitoring cookies are registered; otherwise false.
    observersRegistered: false,

    /**
     * Called by Firebug when Firefox window is opened.
     *
     * @param {String} prefDomain Preference domain (e.g. extensions.firebug)
     * @param {Array} prefNames Default Firebug preference array.
     */
    initialize: function(prefDomain, prefNames)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.FireCookieModel.initialize;");

        // Support for trace-console customization in Firebug 1.3
        if (Firebug.TraceModule && Firebug.TraceModule.addListener)
            Firebug.TraceModule.addListener(this.TraceListener);

        this.panelName = panelName;
        this.description = Locale.$STR("cookies.modulemanager.description");

        BaseModule.initialize.apply(this, arguments);

        var permTooltip = Firebug.chrome.$("fcPermTooltip");
        permTooltip.fcEnabled = true;

        // All the necessary observers are registered by default. Even if the 
        // panel can be disabled (entirely or for a specific host) there is
        // no simple way to find out this now, as the context isn't available. 
        // All will be unregistered again in the initContext (if necessary).
        // There is no big overhead, the initContext is called just after the
        // first document request.
        this.registerObservers(null);

        // Register listener for NetInfoBody (if the API is available) so,
        // a new tab (Cookies) can be appended into the Net panel request info.
        var netInfoBody = Firebug.NetMonitor.NetInfoBody;
        if ("addListener" in netInfoBody)
            netInfoBody.addListener(this.NetInfoBody);

        // Register listener within the Console panel. If document.cookie property
        // is logged, formatted output is used.
        //Firebug.Console.addListener(this.ConsoleListener);

        // Localize UI (use firecookie.properties instead of firecookie.dtd)
        // Since Firebug 1.5 there is a "internationalizeUI" message dispatched to modules so,
        // don't use the name to avoid collision.
        // Firebug 1.5+ extension should use standard "internationalizeUI" method.
        this.fcInternationalizeUI();

        // Register debugger listener for providing cookie-breakpoints.
        //Firebug.Debugger.addListener(this.DebuggerListener);

        // Dynamically overlay Break on Next button in FB 1.5.1
        // There is a small decoration coming from each panel.
        var bonStack = Firebug.chrome.$("fbBreakOnNextButtonStack");
        if (bonStack)
        {
            var image = document.createElement("image");
            image.setAttribute("id", "fbBreakOnImageCookies");
            image.setAttribute("class", "fbBreakOnImage");
            image.setAttribute("src", "chrome://firebug/skin/cookies/breakOnCookieSingle.png");
            bonStack.appendChild(image);
        }
    },

    initializeUI: function()
    {
        BaseModule.initializeUI.apply(this, arguments);

        // Append the styleesheet to a new console popup panel introduced in Firebug 1.6
        this.addStyleSheet(null);

        // Console filter is available since Firebug 1.6
        if (compareFirebugVersion("1.6") >= 0)
            Dom.collapse(Firebug.chrome.$("fbConsoleFilter-cookies"), false);
    },

    /**
     * Peforms clean up when Firebug is destroyed.
     * Called by the framework when Firebug is closed for an existing Firefox window.
     */
    shutdown: function() 
    {
        this.unregisterObservers(null);

        // Support for trace-console customization in Firebug 1.3
        if (Firebug.TraceModule && Firebug.TraceModule.removeListener)
            Firebug.TraceModule.removeListener(this.TraceListener);

        var netInfoBody = Firebug.NetMonitor.NetInfoBody;
        if ("removeListener" in netInfoBody)
            netInfoBody.removeListener(this.NetInfoBody);

        //Firebug.Console.removeListener(this.ConsoleListener);
        //Firebug.Debugger.removeListener(this.DebuggerListener);
    },

    fcInternationalizeUI: function()
    {
        var elements = ["fcCookiesMenu", "fcExportAll", "fcExportForSite", "fcRemoveAllSession",
            "fcRemoveAll", "fcCreate", "fcCookieViewAll", "fcCookieViewExceptions",
            "fcCookieHelp", "fcCookieAbout", "fcToolsMenu", "fcFilterMenu", "fcFilterByPath",
            "fcShowRejectedCookies", "fbConsoleFilter-cookies"];

        for (var i=0; i<elements.length; i++)
        {
            var element = Firebug.chrome.$(elements[i]);
            if (element.hasAttribute("label"))
                fcInternationalize(element, "label");

            if (element.hasAttribute("tooltiptext"))
                fcInternationalize(element, "tooltiptext");
        }
    },

    registerObservers: function(context)
    {
        if (this.observersRegistered)
        {
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.registerObservers; Observers ALREADY registered for: " +
                    (context ? context.getName() : ""));
            return;
        }

        observerService.addObserver(HttpObserver, "http-on-modify-request", false);
        observerService.addObserver(HttpObserver, "http-on-examine-response", false);
        observerService.addObserver(PermissionObserver, "perm-changed", false);
        registerCookieObserver(CookieObserver);
        prefs.addObserver(networkPrefDomain, PrefObserver, false);

        this.observersRegistered = true;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.ENABLE Cookies monitoring for: " +
                (context ? context.getName() : "") + "\n");
    },

    unregisterObservers: function(context)
    {
        if (!this.observersRegistered)
        {
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.registerObservers; Observers ALREADY un-registered for: " +
                    (context ? context.getName() : ""));
            return;
        }

        observerService.removeObserver(HttpObserver, "http-on-modify-request");
        observerService.removeObserver(HttpObserver, "http-on-examine-response");
        observerService.removeObserver(PermissionObserver, "perm-changed");
        unregisterCookieObserver(CookieObserver);
        prefs.removeObserver(networkPrefDomain, PrefObserver);

        this.observersRegistered = false;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.DISABLE Cookies monitoring for: " +
                (context ? context.getName() : "") + "\n");
    },

    // Helper context
    initTempContext: function(tempContext)
    {
        tempContext.cookieTempObserver = registerCookieObserver(new CookieTempObserver(tempContext));

        // Create sub-context for cookies.
        tempContext.cookies = {};
        tempContext.cookies.activeHosts = [];
    },

    destroyTempContext: function(tempContext, context)
    {
        if (!tempContext)
            return;

        if (FBTrace.DBG_COOKIES)
        {
            FBTrace.sysout("cookies.Copy " + tempContext.events.length +
                " events to real-context." + "\n");

            var message = "cookies.Copy active hosts (";
            for (var host in tempContext.cookies.activeHosts)
                message += host + ", ";
            message = message.substring(0, message.length - 2);
            message += ") from temp context into the real context.\n";
            FBTrace.sysout(message, tempContext);
        }

        // Copy all active hosts on the page. In case of redirects or embedded IFrames, there
        // can be more hosts (domains) involved on the page. Cookies must be displayed for
        // all of them.
        context.cookies.activeHosts = cloneMap(tempContext.cookies.activeHosts);

        // Clone all active (received) cookies on the page.
        // This is probably not necessary, as the first cookie is received
        // in http-on-examine-response and at that time the real context
        // is already created.
        context.cookies.activeCookies = cloneMap(tempContext.cookies.activeCookies);

        // Fire all lost cookie events (those from the temp context).
        var events = tempContext.events;
        for (var i=0; i<events.length; i++) {
            var e = events[i];
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.Fire fake cookie event: " + e.topic + ", " + e.data + "\n");
            CookieObserver.observe(e.subject, e.topic, e.data);
        }

        delete tempContext.cookies.activeHosts;
        delete tempContext.cookies.activeCookies;
        delete tempContext.cookies;

        // Unregister temporary cookie observer.
        tempContext.cookieTempObserver = unregisterCookieObserver(tempContext.cookieTempObserver);
    },

    /**
     * Called by the framework when a context is created for Firefox tab.
     * 
     *  @param {Firebug.TabContext} Context for the current Firefox tab.
     */
    initContext: function(context)
    {
        var tabId = Firebug.getTabIdForWindow(context.window);

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.INIT real context for: " + tabId + ", " +
                context.getName() + "\n");

        // Create sub-context for cookies. 
        // xxxHonza: the cookies object exists within the context even if 
        // the panel is disabled.
        context.cookies = {};
        context.cookies.activeHosts = [];

        // Initialize custom path filter for this context
        context.cookies.pathFilter = "/";

        // List of breakpoints.
        context.cookies.breakpoints = new CookieBreakpointGroup();
        context.cookies.breakpoints.load(context);

        // The temp context isn't created e.g. for empty tabs, chrome pages.
        var tempContext = contexts[tabId];
        if (tempContext)
        {
            this.destroyTempContext(tempContext, context);
            delete contexts[tabId];

            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.DESTROY temporary context, tabId: " + tempContext.tabId + "\n");
        }

        // The base class must be called after the context for Cookies panel is 
        // properly initialized. The panel can be created inside this function
        // (within Firebug.ActivableModule.enablePanel), which can result in
        // calling FireCookiePanel.initialize method. This method directly calls
        // FireCookiePanel.refresh, which needs the context.cookies object ready.
        BaseModule.initContext.apply(this, arguments);

        // Unregister all observers if the panel is disabled.
        if (!this.isEnabled(context))
            this.unregisterObservers(context);
    },

    reattachContext: function(browser, context)
    {
        BaseModule.reattachContext.apply(this, arguments);

        var chrome = context ? context.chrome : Firebug.chrome;

        // The context isn't available if FB is disabled.
        if (!context)
            return;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.reattachContext: " + context.getName());

        this.Perm.updatePermButton(context, chrome);

        // xxxHonza the panel is created here, it's overhead.
        // however the stylesheet must be appended here and the list of cookies
        // mus be refreshed otherwise, the event handlers doesn't work
        // not sure where exactly is the bug.
        var panel = context.getPanel(panelName);

        // Add styles into the panel HTML document.
        // browser.detached is not set now.
        // Issue 64: Firecookie table format breaks when switching to detatched window mode
        //if (browser.detached)
            this.addStyleSheet(panel);

        // From some reason, Firebug doesn't set the ownerPanel to the panel
        // node element. (it's properly set once the page is reloaded, but no the first time)
        // The Firebug.getElementPanel method doesn't work then. 
        // This is fixed in Firebug 1.2 (the ownerPanel is set in Initialize & reattach methods)
        if (panel)
            panel.panelNode.ownerPanel = panel;

        // Translate also in the new window.
        this.fcInternationalizeUI();

        // Refresh panel. From some reason, if FB UI is detached, all event 
        // listeners (e.g. onClick handlers registered in domplate template) 
        // are somehow damaged and not called. 
        // Workaround - if the panel is refreshed event handlers work.
        //
        // See bug http://code.google.com/p/fbug/issues/detail?id=724, console
        // has the same problem. However it can't be simply refreshed.
        // OK, this bug should be fixed (R735) since FB 1.2b4
        //panel.refresh();
    },

    destroyContext: function(context) 
    {
        BaseModule.destroyContext.apply(this, arguments);

        if (!context.cookies)
        {
            if (FBTrace.DBG_COOKIES)
            {
                var tabId = Firebug.getTabIdForWindow(context.window);
                FBTrace.sysout("cookies.DESTROY context ERROR: No context.cookies available, tabId: " +
                    tabId + ", " + context.getName());
            }
            return;
        }

        context.cookies.breakpoints.store(context);

        for (var p in context.cookies)
            delete context.cookies[p];

        delete context.cookies;

        if (FBTrace.DBG_COOKIES)
        {
            var tabId = Firebug.getTabIdForWindow(context.window);
            FBTrace.sysout("cookies.DESTROY context, tabId: " + tabId +
                ", " + context.getName());
        }
    },

    addStyleSheet: function(panel)
    {
        // Use registration function instead (introduced in Firebug 1.6)
        if (Firebug.registerStylesheet)
            return;

        function privateAppend(doc)
        {
            // Make sure the stylesheet isn't appended twice.
            if (!Firebug.chrome.$("fcStyles", doc))
            {
                var styleSheet = createStyleSheet(doc, "chrome://firebug/skin/cookies/cookies.css");
                styleSheet.setAttribute("id", "fcStyles");
                addStyleSheet(doc, styleSheet);
            }
        }

        if (panel)
            privateAppend(panel.document)

        // Firebug 1.6 introduces another panel for console preview on other panels
        // The allows to use command line in other panels too.
        var preview = Firebug.chrome.$("fbCommandPreviewBrowser");
        if (preview)
            privateAppend(preview.contentDocument);
    },

    updateOption: function(name, value)
    {
        if (name == "firecookie.clearWhenDeny")
        {
        }
        else if (name == "firecookie.LogEvents")
        {
        }
        else if (name == "consoleFilterTypes")
        {
            this.updateConsoleFilter();
        }
    },

    updateConsoleFilter: function()
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.updateConsoleFilter;");

        if (!Firebug.currentContext)
            return;

        // The panel can be disabled.
        var panel = Firebug.currentContext.getPanel("console");
        if (!panel)
            return;

        var panelNode = panel.panelNode;
        var className = "hideType-cookies";
        var filterTypes = Firebug.consoleFilterTypes;

        Css.setClass(panelNode, className);

        var positiveFilters = ["all", "cookies"];
        for (var i=0; i<positiveFilters.length; i++)
        {
            if (filterTypes.indexOf(positiveFilters[i]) >= 0)
            {
                Css.removeClass(panelNode, className);
                break;
            }
        }
    },

    showPanel: function(browser, panel)
    {
        // Update panel's toolbar
        var isCookiePanel = panel && panel.name == panelName;

        // Firebug 1.4, chrome changes.
        var chrome = browser.chrome ? browser.chrome : Firebug.chrome;

        var cookieButtons = Firebug.chrome.$("fbCookieButtons");
        Dom.collapse(cookieButtons, !isCookiePanel);

        // The console panel can be displayed sooner than the Cookies
        // panel, in such a case the Stylesheet must be ready as
        // there are cookies logs in the console.
        // Cookie table is also used within the net panel.
        if (panel && (panel.name == "console" || panel.name == "net"))
            this.addStyleSheet(panel);
    },

    watchWindow: function(context, win) 
    {
        context.window.addEventListener("beforeunload", this.onBeforeUnload, false);
    },

    onBeforeUnload: function(event) 
    {
        var view = event.target.defaultView;
        var context = TabWatcher.getContextByWindow(view);
        if (!context)
            return;

        var panel = context.getPanel(panelName, true);
        if (panel)
            panel.clear();

        if (FBTrace.DBG_COOKIES)
        {
            var tabId = Firebug.getTabIdForWindow(view);
            FBTrace.sysout("cookies.On before unload tab:  " + tabId + "\n");

            if (contexts[tabId])
                FBTrace.sysout("cookies.!!! There is a temp context leak!\n");
        }
    },

    /**
     * Creates a new cookie in the browser.
     * This method is used by {@link EditCookie} dialog and also when a cookie is
     * pasted from the clipboard.
     *
     * @param {Cookie} Cookie object with appropriate properties. See {@link Cookie} object.
     */
    createCookie: function(cookie)
    {
        try
        {
            var uri = cookie.getURI();
            if (!uri)
                return;

            var c = cookie.cookie;

            // Fix for issue 34. The domain must be included in the cookieString if it 
            // starts with "." But don't include it otherwise, since the "." would be 
            // appended by the service.
            var host = cookie.cookie.host;
            var cookieString = cookie.toString(!(host.charAt(0) == "."));

            // Fix for issue 37: httpOnly cookies, and issue 47: Cannot change the HttpOnly flag
            // HttpOnly cookies can't be changed by setCookie string
            // See also: https://bugzilla.mozilla.org/show_bug.cgi?id=178993
            //cookieService.setCookieString(uri, null, cookieString, null);

            // Doesn't work in FF4 (issue 95)
            //cookieService.setCookieStringFromHttp(uri, uri, null, cookieString,
            //    c.expires, null);

            //xxxHonza: in what cases the cookie should be removed?
            //var cm = Cc["@mozilla.org/cookiemanager;1"].getService(Ci.nsICookieManager);
            //cm.remove(c.host, c.name, c.path, false);

            var isSession = c.expires ? false : true;
            var cm2 = Cc["@mozilla.org/cookiemanager;1"].getService(Ci.nsICookieManager2);
            cm2.add(c.host, c.path, c.name, c.rawValue, c.isSecure, c.isHttpOnly, isSession,
                c.expires || Math.round((new Date()).getTime() / 1000 + 9999999999));

            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.createCookie: set cookie string: " + cookieString, cookie);
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("cookies.createCookie: set cookie string ERROR " +
                    cookieString, e);
        }
    },

    removeCookie: function(host, name, path)
    {
        cookieManager.remove(host, name, path, false);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Support for ActivableModule 1.3 - 1.5

    onPanelActivate: function(context, init, activatedPanelName)
    {
        if (activatedPanelName != panelName)
            return;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onPanelActivate: " + activatedPanelName + "," +
                init + "\n");

        this.registerObservers(context);

        top.document.getElementById("firebugStatus").setAttribute(panelName, "on");

        // Make sure the panel is refreshed (no page reload) and the cookie
        // list is displayed instead of the Panel Activation Manager.
        context.invalidatePanels(panelName);

        // Make sure the toolbar is updated.
        // xxxHonza: This should be done automatically by calling "panel.show mehtod",
        // where the visibility of the toolbar is already managed.
        // Why Firebug doesn't call show within Firebug.panelActivate?
        var panel = context.getPanel(panelName, true);
        if (panel)
            panel.showToolbarButtons("fbCookieButtons", true);
    },

    onPanelDeactivate: function(context, destroy, activatedPanelName)
    {
        this.unregisterObservers(context);

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onPanelDeactivate: " + activatedPanelName + "," +
                destroy + "\n");
    },

    onLastPanelDeactivate: function(context, destroy)
    {
        top.document.getElementById("firebugStatus").removeAttribute(panelName);

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onLastPanelDeactivate");
    },

    onEnabled: function(context)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onEnabled; " + context.getName());

        this.registerObservers(context);
    },

    onDisabled: function(context)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onDisabled; " + context.getName());

        this.unregisterObservers(context);
    },

    onEnablePrefChange: function(pref)
    {
        BaseModule.onEnablePrefChange.apply(this, arguments);

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onEnablePrefChange; " + this.isAlwaysEnabled());
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Support for ActivableModule 1.6

    /**
     * It's just here to exists (calling base class only)
     */
    isEnabled: function(context)
    {
        // For backward compatibility with Firebug 1.1. ActivableModule has been
        // introduced in Firebug 1.2.
        if (!Firebug.ActivableModule)
            return true;

        return BaseModule.isEnabled.apply(this, arguments);
    },

    /**
     * Called when an observer (e.g. panel) is added/removed into/from the model.
     * This is the moment when the model needs to decide whether to activate.
     */
    onObserverChange: function(observer)
    {
        if (this.hasObservers())
            TabWatcher.iterateContexts(Firebug.FireCookieModel.registerObservers);
        else
            TabWatcher.iterateContexts(Firebug.FireCookieModel.unregisterObservers);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Firebug suspend and resume

    onSuspendFirebug: function(context)
    {
        // The context parameter is there again in Firebug 1.6
        // see Firebug.resumeFirebug()
        if (context && compareFirebugVersion("1.6") < 0)
        {
            // Firebug 1.3
            this.unregisterObservers(context);
        }
        else
        {
            // Firebug 1.4 (context parameter doesn't exist since 1.4)
            // Suspend only if enabled.
            if (Firebug.FireCookieModel.isAlwaysEnabled())
                TabWatcher.iterateContexts(Firebug.FireCookieModel.unregisterObservers);
        }

        top.document.getElementById("firebugStatus").removeAttribute(panelName);

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onSuspendFirebug");
    },

    onResumeFirebug: function(context)
    {
        // The context parameter is there again in Firebug 1.6
        // see Firebug.resumeFirebug()
        if (context && compareFirebugVersion("1.6") < 0)
        {
            // Firebug 1.3
            this.registerObservers(context);

            if (Firebug.FireCookieModel.isEnabled(context))
                top.document.getElementById("firebugStatus").setAttribute(panelName, "on");
        }
        else
        {
            // Firebug 1.4 (context parameter doesn't exist since 1.4)
            if (Firebug.FireCookieModel.isAlwaysEnabled())
                TabWatcher.iterateContexts(Firebug.FireCookieModel.registerObservers);

            top.document.getElementById("firebugStatus").setAttribute(panelName, "on");
        }

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onResumeFirebug");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getMenuLabel: function(option, location)
    {
        var host = getURIHost(location);

        // In case of local files or system pages use this labels instead of host.
        // xxxHonza: the panel should be automatically disabled for local files
        // and system pages as there are no cookies associated.
        // These options shouldn't be available at all.
        if (isSystemURL(location.spec))
            host = Locale.$STR("firecookie.SystemPages");
        else if (!getURIHost(location))
            host = Locale.$STR("firecookie.LocalFiles");

        // Translate these two options in panel activable menu from firecookie.properties
        switch (option)
        {
        case "disable-site":
            return Locale.$STRF("cookies.HostDisable", [host]);
        case "enable-site":
            return Locale.$STRF("cookies.HostEnable", [host]);
        }

        return BaseModule.getMenuLabel.apply(this, arguments);
    },

    // xxxHonza: This method is overriden just to provide translated strings from 
    // firecookie.properties file.
    openPermissions: function(event, context)
    {
        Events.cancelEvent(event);

        var browserURI = Firebug.chrome.getBrowserURI(context);
        var host = this.getHostForURI(browserURI);

        var params = {
            permissionType: this.getPrefDomain(),
            windowTitle: Locale.$STR(this.panelName + ".Permissions"), // use FC_STR
            introText: Locale.$STR(this.panelName + ".PermissionsIntro"), // use FC_STR
            blockVisible: true,
            sessionVisible: false,
            allowVisible: true,
            prefilledHost: host,
        };

        openWindow("Browser:Permissions", "chrome://browser/content/preferences/permissions.xul",
            "", params);
    },

    // UI Commands
    onRemoveAllShowTooltip: function(tooltip, context)
    {
        tooltip.label = Locale.$STR("firecookie.removeall.tooltip");
        return true;
    },

    onRemoveAllSessionShowTooltip: function(tooltip, context)
    {
        tooltip.label = Locale.$STR("firecookie.removeallsession.tooltip");
        return true;
    },

    onRemoveAllShared: function(context, sessionOnly)
    {
        var panel = context.getPanel(panelName, true);
        if (!panel)
            return;

        var cookies = [];

        // Remove all cookies in the list. Notice that the list can be further
        // filtered by the search-box (the right side of Firebug's tab bar)
        // So, make sure in case of searching-on, only visible (matched)
        // cookies are removed.
        var searching = Css.hasClass(panel.panelNode, "searching");
        var row = Dom.getElementByClass(panel.panelNode, "cookieRow");
        while (row)
        {
            if (!searching || Css.hasClass(row, "matched"))
            {
                var cookie = row.repObject;

                // Some entries within the Cookies panel don't represent a cookie.
                if (cookie)
                {
                    // If sessionOnly flag is true, only session cookies will be removed.
                    if (sessionOnly)
                    {
                        if (!cookie.cookie.expires)
                            cookies.push(cookie);
                    }
                    else
                        cookies.push(cookie);
                }
            }

            row = row.nextSibling;
        }

        for (var i=0; i<cookies.length; i++)
            Templates.CookieRow.onRemove(cookies[i]);
    },

    onRemoveAll: function(context)
    {
        if (Options.get(removeConfirmation))
        {
            var check = {value: false};
            if (!prompts.confirmCheck(context.chrome.window, "Firecookie",
                Locale.$STR("firecookie.confirm.removeall"),
                Locale.$STR("firecookie.msg.Do not show this message again"), check))
                return;

            // Update 'Remove Cookies' confirmation option according to the value
            // of the dialog's "do not show again" checkbox.
            Opttions.set(removeConfirmation, !check.value)
        }

        Firebug.FireCookieModel.onRemoveAllShared(context, false);
    },

    onRemoveAllSession: function(context)
    {
        if (Options.get(removeSessionConfirmation))
        {
            var check = {value: false};
            if (!prompts.confirmCheck(context.chrome.window, "Firecookie",
                Locale.$STR("firecookie.confirm.removeallsession"),
                Locale.$STR("firecookie.msg.Do not show this message again"), check))
                return;

            // Update 'Remove Session Cookies' confirmation option according to the value
            // of the dialog's "do not show again" checkbox.
            Options.set(removeSessionConfirmation, !check.value)
        }

        Firebug.FireCookieModel.onRemoveAllShared(context, true);
    },

    onCreateCookieShowTooltip: function(tooltip, context)
    {
        var host = context.window.location.host;
        tooltip.label = Locale.$STRF("firecookie.createcookie.tooltip", [host]);
        return true;
    },

    onCreateCookie: function(context)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onCreateCookie");

        // There is an excepion if the window is closed or not initialized (empty tab)
        var host;
        try {
            host = context.window.location.host
        }
        catch (err) {
            alert(Locale.$STR("firecookie.message.There_is_no_active_page"));
            return;
        }

        // Name and domain.
        var cookie = new Object();
        cookie.name = this.getDefaultCookieName(context);
        cookie.host = host;

        // The edit dialog uses raw value.
        cookie.rawValue = Locale.$STR("firecookie.createcookie.defaultvalue");

        // Default path
        var path = context.window.location.pathname || "/";
        cookie.path = path.substr(0, (path.lastIndexOf("/") || 1));

        // Set defaul expiration time.
        cookie.expires = this.getDefaultCookieExpireTime();

        var params = {
          cookie: cookie,
          action: "create",
          window: context.window
        };

        var parent = context.chrome.window;
        parent.openDialog("chrome://firebug/content/cookies/editCookie.xul",
            "_blank", "chrome,centerscreen,resizable=yes,modal=yes",
            params);
    },

    getDefaultCookieName: function(context, defaultName)
    {
        var counter = 0;
        var cookieDefaultName = defaultName || "Cookie";
        var cookieName = cookieDefaultName;
        var exists = false;
        var panel = context.getPanel(panelName);

        do
        {
            exists = false;

            var row = Dom.getElementByClass(panel.panelNode, "cookieRow");
            while (row)
            {
                var rep = row.repObject;

                // If the cookie is expanded, there is a row without the repObject
                if (rep && rep.cookie.name == cookieName)
                {
                    counter++;
                    exists = true;
                    cookieName = cookieDefaultName + "-" + counter;
                    break;
                }
                row = row.nextSibling;
            }
        } while (exists)

        return cookieName;
    },

    getDefaultCookieExpireTime: function()
    {
        // Get default expire time interval (in seconds) and add it to the
        // current time.
        var defaultInterval = Options.get(defaultExpireTime);
        var now = new Date();
        now.setTime(now.getTime() + (defaultInterval * 1000));

        // Return final expiration time.
        return (now.getTime() / 1000);
    },

    /**
     * Exports all existing cookies in the browser into a cookies.txt file.
     * This action is available in the Cookies panel toolbar.
     */
    onExportAll: function(context)
    {
        try 
        {
            var fp = CCIN("@mozilla.org/filepicker;1", "nsIFilePicker");
            fp.init(window, null, nsIFilePicker.modeSave);
            fp.appendFilters(nsIFilePicker.filterAll | nsIFilePicker.filterText);
            fp.filterIndex = 1;
            fp.defaultString = "cookies.txt";

            var rv = fp.show();
            if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace)
            {
                var foStream = CCIN("@mozilla.org/network/file-output-stream;1", "nsIFileOutputStream");
                foStream.init(fp.file, 0x02 | 0x08 | 0x20, 0666, 0); // write, create, truncate

                var e = cookieManager.enumerator;
                while(e.hasMoreElements())
                {
                    var cookie = e.getNext();
                    cookie = cookie.QueryInterface(nsICookie2);
                    var cookieWrapper = new Cookie(CookieUtils.makeCookieObject(cookie));
                    var cookieInfo = cookieWrapper.toText();
                    foStream.write(cookieInfo, cookieInfo.length);
                }

                foStream.close();
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("firecookie.onExportAll EXCEPTION", err);
            alert(err.toString());
        }
    },

    onExportForSiteShowTooltip: function(tooltip, context)
    {
        var host = context.window.location.host;
        tooltip.label = Locale.$STRF("firecookie.export.Export_For_Site_Tooltip", [host]);
        return true;
    },

    /**
     * Exports cookies for the current site into a cookies.txt file
     * This action is available in the Cookies panel toolbar.
     */
    onExportForSite: function(context)
    {
        try 
        {
            var fp = CCIN("@mozilla.org/filepicker;1", "nsIFilePicker");
            fp.init(window, null, nsIFilePicker.modeSave);
            fp.appendFilters(nsIFilePicker.filterAll | nsIFilePicker.filterText);
            fp.filterIndex = 1;
            fp.defaultString = "cookies.txt";

            var rv = fp.show();
            if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace)
            {
                var foStream = CCIN("@mozilla.org/network/file-output-stream;1", "nsIFileOutputStream");
                foStream.init(fp.file, 0x02 | 0x08 | 0x20, 0666, 0); // write, create, truncate

                var panel = context.getPanel(panelName, true);
                var tbody = Dom.getElementByClass(panel.panelNode, "cookieTable").firstChild;
                for (var row = tbody.firstChild; row; row = row.nextSibling)
                {
                    if (Css.hasClass(row, "cookieRow") && row.repObject)
                    {
                        var cookieInfo = row.repObject.toText();
                        foStream.write(cookieInfo, cookieInfo.length);
                    }
                }

                foStream.close();
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("firecookie.onExportForSite EXCEPTION", err);
            alert(err.toString());
        }
    },

    onFilter: function(context, pref)
    {
        var value = Options.get(pref);
        Options.set(pref, !value);

        TabWatcher.iterateContexts(function(context)
        {
            var panel = context.getPanel(panelName, true);
            if (panel)
                panel.refresh();
        });
    },

    onFilterPopupShowing: function(menu)
    {
        var items = menu.getElementsByTagName("menuitem");
        for (var i=0; i<items.length; i++)
        {
            var item = items[i];
            var prefValue = Options.get(item.value);
            if (prefValue)
                item.setAttribute("checked", "true");
            else
                item.removeAttribute("checked");
        }

        return true;
    },

    // Custom path filter 
    onFilterPanelShowing: function(filterPanel, context)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onFilterPanelShowing ", filterPanel);

        // Initialize filter input field.
        filterPanel.init(context.cookies.pathFilter);

        // A menu does not take the keyboard focus and keyboard messages are 
        // sent to the window. In order to avoid unwante shortcuts execution
        // register a window keypress listeners for the time when the filter
        // popup is displayed and stop propagation of these events.
        // https://developer.mozilla.org/en/XUL/PopupGuide/PopupKeys
        window.addEventListener("keypress", this.onFilterKeyPress, true);
        return true;
    },

    onFilterPanelHiding: function(filterPanel, context)
    {
        window.removeEventListener("keypress", this.onFilterKeyPress, true);
        return true;
    },

    onFilterKeyPress: function(event) 
    {
        // Stop propagation of keypress events when filter popup is displayed.
        event.stopPropagation();
    },

    onFilterPanelApply: function(context)
    {
        var parentMenu = Firebug.chrome.$("fcFilterMenuPopup");
        var filterPanel = Firebug.chrome.$("fcCustomPathFilterPanel");

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onApplyPathFilter, filter: " + filterPanel.value,
                filterPanel);

        // Use the filter from panel.
        context.cookies.pathFilter = filterPanel.value;

        // Refresh cookie list.
        var panel = context.getPanel(panelName);
        panel.refresh();

        // Close menu.
        parentMenu.hidePopup();
    },

    onHelp: function(context) 
    {
        openNewTab("http://www.janodvarko.cz/firecookie");
    },

    onAbout: function(context) 
    {
        try
        {
            // Firefox 4.0 implements new AddonManager. In case of Firefox 3.6 the module
            // is not avaialble and there is an exception.
            Components.utils["import"]("resource://gre/modules/AddonManager.jsm");
        }
        catch (err)
        {
        }

        if (typeof(AddonManager) != "undefined")
        {
            AddonManager.getAddonByID("firecookie@janodvarko.cz", function(addon) {
                openDialog("chrome://mozapps/content/extensions/about.xul", "",
                "chrome,centerscreen,modal", addon);
            });
        }
        else
        {
            var extensionManager = Xpcom.CCSV("@mozilla.org/extensions/manager;1", "nsIExtensionManager");

            var parent = context.chrome.window;
            parent.openDialog("chrome://mozapps/content/extensions/about.xul", "",
                "chrome,centerscreen,modal", "urn:mozilla:item:firecookie@janodvarko.cz",
                extensionManager.datasource);
        }
    },

    onViewAll: function(context) 
    {
        parent.openDialog("chrome://browser/content/preferences/cookies.xul",
            "_blank", "chrome,resizable=yes", null);
    },

    onViewExceptions: function(context)
    {
        var params = {  
            blockVisible   : true,
            sessionVisible : true,
            allowVisible   : true,
            prefilledHost  : "",
            permissionType : "cookie",
            windowTitle    : Locale.$STR("firecookie.ExceptionsTitle"),
            introText      : Locale.$STR("firecookie.Intro")
        };

        parent.openDialog("chrome://browser/content/preferences/permissions.xul",
            "_blank","chrome,resizable=yes", params);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // FBTest

    // Expose our test list to the FBTest console for automated testing.
    onGetTestList: function(testLists)
    {
        testLists.push({
            extension: "Firecookie",
            testListURL: "chrome://firecookie/content/testList.html"
        });

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onGetTestList; ");
    }
}); 

// ********************************************************************************************* //
// Localization

function $FC_STR_BRAND(name)
{
    return document.getElementById("bundle_brand").getString(name);
}

function fcInternationalize(element, attr, args)
{
    var xulString = element.getAttribute(attr);
    var localized = args ? Locale.$STRF(xulString, args) : Locale.$STR(xulString);

    // Set localized value of the attribute.
    element.setAttribute(attr, localized);
}

// To make it available also in the editCookie.js scope
Firebug.FireCookieModel.fcInternationalize = fcInternationalize;

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
// Preference observer 
// Used till the real context isn't available (in initContext), bug if Firebug)

function CookieTempObserver(tempContext) {
    this.tempContext = tempContext;
}

CookieTempObserver.prototype = Obj.extend(BaseObserver, {
    observe: function(subject, topic, data) {
        this.tempContext.appendCookieEvent(subject, topic, data);
    }
});

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function TempContext(tabId)
{
    this.tabId = tabId;
    this.events = [];
}

TempContext.prototype.appendCookieEvent = function(subject, topic, data)
{
    this.events.push({subject:subject, topic:topic, data:data});
}

// ********************************************************************************************* //
// Preference observer

/**
 * @class Represents an observer for nsPref:changed event dispatched when 
 * an user preference is changed (e.g. using about:config)
 */
var PrefObserver = Obj.extend(BaseObserver,
/** @lends PrefObserver */
{
    observe: function(aSubject, aTopic, aData) 
    {
        if (aTopic != "nsPref:changed")
            return;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.observe: " + aTopic + ", " + aData + "\n");

        if (aData == networkPrefDomain + "." + cookieBehaviorPref || 
            aData == networkPrefDomain + "." + cookieLifeTimePref) {
            var fn = Firebug.FireCookieModel.Perm.updatePermButton;
            TabWatcher.iterateContexts(fn);
        }
    }
});

// ********************************************************************************************* //
// Permission observer

/**
 * @class Represents an observer for perm-changed event that is dispatched
 * by Firefox is cookie permissions are changed.
 */
var PermissionObserver = Obj.extend(BaseObserver,
/** @lends PermissionObserver */
{
    observe: function(aSubject, aTopic, aData) 
    {
        if (aTopic != "perm-changed")
            return;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.observe: " + aTopic + ", " + aData + "\n");

        var fn = Firebug.FireCookieModel.Perm.updatePermButton;
        TabWatcher.iterateContexts(fn);
    }
});

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
            aSubject = aSubject.QueryInterface(nsIHttpChannel);
            if (aTopic == "http-on-modify-request") {
                this.onModifyRequest(aSubject);
            } else if (aTopic == "http-on-examine-response") {
                this.onExamineResponse(aSubject);
            }
        }
        catch (err) {
            ERROR(err);
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
                cookieService.getCookieString(request.URI, request) + "\n");
        }

        // At this moment (specified by all the conditions) FB context doesn't exists yet.
        // But the page already started loading and there are things to monitor.
        // This is why the temporary context is created. It's used as a place where to 
        // store information (cookie events and hosts). All this info will be copied into
        // the real FB context when it's created (see initContext).
        if ((request.loadFlags & nsIHttpChannel.LOAD_DOCUMENT_URI) &&
            (request.loadGroup && request.loadGroup.groupObserver) &&
            (name == origName) && (win && win == win.parent))
        {
            if (FBTrace.DBG_COOKIES && contexts[tabId])
                FBTrace.sysout("cookies.!!! Temporary context exists for: " + tabId + "\n");

            // Create temporary context
            if (!contexts[tabId])
            {
                var tempContext = new TempContext(tabId);
                contexts[tabId] = tempContext;

                if (FBTrace.DBG_COOKIES)
                    FBTrace.sysout("cookies.INIT temporary context for: " + tempContext.tabId);

                Firebug.FireCookieModel.initTempContext(tempContext);
            }
        }

        // Use the temporary context first, if it exists. There could be an old
        // context (associated with this tab) for the previous URL.
        var context = contexts[tabId];
        context = context ? context : TabWatcher.getContextByWindow(win);

        // The context doesn't have to exist due to the activation support.
        if (!context)
        {
            if (FBTrace.DBG_COOKIES) 
                FBTrace.sysout("cookies.onModifyRequest: context is NOT available for:" +
                    request.URI.host + ", tabId: " + tabId + "\n");
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

        if (!logEvents())
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
        var context = contexts[tabId];
        context = context ? context : TabWatcher.getContextByWindow(win);

        // The context doesn't have to exist due to the activation support.
        if (!context)
        {
            if (FBTrace.DBG_COOKIES) 
                FBTrace.sysout("cookies.onExamineResponse: context is NOT available for:" +
                    request.URI.host + ", tabId: " + tabId + "\n");
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
            var cookie = parseFromString(cookies[i]);
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
            activeCookiesForHost[getCookieId(cookie)] = cookie;

            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.Cookie received: " +
                    cookie.host + ", cookie: " + cookie.name + "\n", cookie);
        }

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.Set-Cookie: " + setCookie + "\n", activeCookies);
    }
});

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
// Array Helpers

function cloneMap(map)
{
    var newMap = [];
    for (var item in map)
        newMap[item] = map[item];
        
    return newMap;
}

// ********************************************************************************************* //
// Preference Helpers

// This functions are different in 1.05 and 1.2
// So, this is a stable version.
function getPref(prefDomain, name)
{
    var prefName = prefDomain + "." + name;

    var type = prefs.getPrefType(prefName);
    if (type == nsIPrefBranch.PREF_STRING)
        return prefs.getCharPref(prefName);
    else if (type == nsIPrefBranch.PREF_INT)
        return prefs.getIntPref(prefName);
    else if (type == nsIPrefBranch.PREF_BOOL)
        return prefs.getBoolPref(prefName);
}

function setPref(prefDomain, name, value)
{
    var prefName = prefDomain + "." + name;

    var type = prefs.getPrefType(prefName);
    if (type == nsIPrefBranch.PREF_STRING)
        prefs.setCharPref(prefName, value);
    else if (type == nsIPrefBranch.PREF_INT)
        prefs.setIntPref(prefName, value);
    else if (type == nsIPrefBranch.PREF_BOOL)
        prefs.setBoolPref(prefName, value);
}

function logEvents()
{
    return Options.get("firecookie.logEvents");
}

// ********************************************************************************************* //
// Registration Helpers

function registerCookieObserver(observer)
{
    if (observer.registered)
        return;

    if (FBTrace.DBG_COOKIES)
        FBTrace.sysout("cookies.registerCookieObserver");

    observerService.addObserver(observer, "cookie-changed", false);
    observerService.addObserver(observer, "cookie-rejected", false);

    observer.registered = true;

    return observer;
}

function unregisterCookieObserver(observer)
{
    if (!observer.registered)
        return;

    if (FBTrace.DBG_COOKIES)
        FBTrace.sysout("cookies.unregisterCookieObserver");

    observerService.removeObserver(observer, "cookie-changed");
    observerService.removeObserver(observer, "cookie-rejected");

    observer.registered = false;
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
// Backward compatibility with Firebug 1.4
// The entire breakOnNext support was implemented in 1.5

// Fake object to allow proper parsing of the JavaScript below. Real breakpoint functionality
// is of course disabled.
var Firebug_Breakpoint = Firebug.Breakpoint ? Firebug.Breakpoint : {
    ConditionEditor: function() {},
    BreakpointGroup: function() {
        this.findBreakpoint = function() {}
    },
};

// ********************************************************************************************* //
// Editor for Cookie breakpoint condition.

Firebug.FireCookieModel.ConditionEditor = function(doc)
{
    Firebug.Breakpoint.ConditionEditor.apply(this, arguments);
}

Firebug.FireCookieModel.ConditionEditor.prototype =
    domplate(Firebug_Breakpoint.ConditionEditor.prototype,
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

function CookieBreakpointGroup()
{
    this.breakpoints = [];
}

CookieBreakpointGroup.prototype = Obj.extend(new Firebug_Breakpoint.BreakpointGroup(),
{
    name: "cookieBreakpoints",
    title: Locale.$STR("firecookie.Cookie Breakpoints"),

    addBreakpoint: function(cookie)
    {
        this.breakpoints.push(new Firebug.FireCookieModel.Breakpoint(cookie));
    },

    removeBreakpoint: function(cookie)
    {
        var bp = this.findBreakpoint(cookie);
        remove(this.breakpoints, bp);
    },

    matchBreakpoint: function(bp, args)
    {
        var cookie = args[0];
        return (bp.name == cookie.name) &&
            (bp.host == cookie.host) &&
            (bp.path == cookie.path);
    },

    // Persistence
    load: function(context)
    {
        var panelState = Persist.getPersistedState(context, panelName);
        if (panelState.breakpoints)
            this.breakpoints = panelState.breakpoints;
    },

    store: function(context)
    {
        var panelState = Persist.getPersistedState(context, panelName);
        panelState.breakpoints = this.breakpoints;
    }
});

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

// ********************************************************************************************* //
// Firebug Compatibility

// Firebug version number (float) for backward compatiability issues.
var FirebugVersion = (function initializeFirebugVersion()
{
    try
    {
        // The expected format is "1.6" or "1.6.1", these are converted to a float
        // 1.6 respective 1.61
        var version = Firebug.version;
        var parts = version.split(".");
        version = parts[0] + ".";
        for (var i=1; i<parts.length; i++)
            version += parts[i];
        return parseFloat(version);
    }
    catch (err)
    {
        if (FBTrace.DBG_COOKIES || FBTrace.DBG_ERRORS)
            FBTrace.sysout("cookies.initializeFirebugVersion; EXCEPTION " + err, err);

        // Guess Fierbug version according to the Firefox version.
        if (versionChecker.compare(appInfo.version, "3.6*") >= 0)
            return 1.6;
        else if (versionChecker.compare(appInfo.version, "3.5*") >= 0)
            return 1.5;
        else
            return 1.4;
    }
})();

/**
 * Compare expected Firebug version with the current Firebug installed.
 * @param {Object} expectedVersion Expected version of Firebug.
 * @returns
 * -1 the current version is smaller 
 *  0 the current version is the same
 *  1 the current version is bigger
 *  
 *  @example:
 *  if (compareFirebugVersion("1.6") >= 0)
 *  {
 *      // execute code for Firebug 1.6+
 *  }
 */
function compareFirebugVersion(expectedVersion)
{
    expectedVersion = parseFloat(expectedVersion);
    if (FirebugVersion > expectedVersion)
        return 1;
    else if (FirebugVersion < expectedVersion)
        return -1;

    return 0;
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

