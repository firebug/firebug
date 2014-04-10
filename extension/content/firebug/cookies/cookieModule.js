/* See license.txt for terms of usage */

define([
    "firebug/chrome/activableModule",
    "firebug/chrome/rep",
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
    "firebug/lib/array",
    "firebug/cookies/baseObserver",
    "firebug/cookies/menuUtils",
    "firebug/cookies/cookieReps",
    "firebug/cookies/cookieUtils",
    "firebug/cookies/cookie",
    "firebug/cookies/breakpoints",
    "firebug/cookies/cookieObserver",
    "firebug/cookies/cookieClipboard",
    "firebug/chrome/tabWatcher",
    "firebug/cookies/httpObserver",
    "firebug/lib/system",
    "firebug/cookies/cookie",
    "firebug/cookies/cookiePermissions",
    "firebug/cookies/editCookie",
    "firebug/trace/traceListener",
    "firebug/trace/traceModule",
    "firebug/chrome/firefox",
    "firebug/debugger/breakpoints/breakpointGroup",
    "firebug/chrome/window",
    "firebug/lib/url",
    "firebug/cookies/legacy",
],
function(ActivableModule, Rep, Xpcom, Obj, Locale, Domplate, Dom, Options, Persist, Str, Http,
    Css, Events, Arr, BaseObserver, MenuUtils, CookieReps, CookieUtils, Cookier, Breakpoints,
    CookieObserver, CookieClipboard, TabWatcher, HttpObserver, System, Cookie, CookiePermissions,
    EditCookie, TraceListener, TraceModule, Firefox, BreakpointGroup, Win, Url) {

// ********************************************************************************************* //
// Constants

var {domplate, DIV, SPAN, TR, P, UL, A, BUTTON} = Domplate;

const Cc = Components.classes;
const Ci = Components.interfaces;

// Firefox Preferences
const networkPrefDomain = "network.cookie";
const cookieBehaviorPref = "cookieBehavior";
const cookieLifeTimePref = "lifetimePolicy";

// Cookies preferences
const clearWhenDeny = "cookies.clearWhenDeny";
const defaultExpireTime = "cookies.defaultExpireTime";
const removeConfirmation = "cookies.removeConfirmation";
const removeSessionConfirmation = "cookies.removeSessionConfirmation";
const JSONexport = "cookies.jsonClipboardExport";

// Services
const cookieManager = Xpcom.CCSV("@mozilla.org/cookiemanager;1", "nsICookieManager2");
const observerService = Xpcom.CCSV("@mozilla.org/observer-service;1", "nsIObserverService");
const prompts = Xpcom.CCSV("@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");

// Preferences
const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefService = PrefService.getService(Ci.nsIPrefService);
const prefs = PrefService.getService(Ci.nsIPrefBranch);

// Cookie panel ID.
const panelName = "cookies";

// Helper array for prematurely created contexts
var contexts = new Array();

// Register stylesheet in Firebug
Firebug.registerStylesheet("chrome://firebug/skin/cookies/cookies.css");
Firebug.registerStylesheet("chrome://firebug-os/skin/cookies.css");

// ********************************************************************************************* //
// Module Implementation

/**
 * @module This object represents a <i>module</i> for Cookies panel.
 * The module supports activation (enable/disable of the Cookies panel).
 * This functionality has been introduced in Firebug 1.2 and makes possible
 * to control activity of Firebug panels in order to avoid (performance) expensive
 * features.
 */
Firebug.CookieModule = Obj.extend(ActivableModule,
/** @lends Firebug.CookieModule */
{
    contexts: contexts,

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
            FBTrace.sysout("cookies.CookieModule.initialize; ");

        this.traceListener = new TraceListener("cookies.", "DBG_COOKIES", true,
            "chrome://firebug/skin/cookies/trace.css");

        TraceModule.addListener(this.traceListener);

        this.panelName = panelName;
        this.description = Locale.$STR("cookies.modulemanager.description");

        ActivableModule.initialize.apply(this, arguments);

        var permTooltip = Firebug.chrome.$("fcPermTooltip");
        permTooltip.fcEnabled = true;

        // All the necessary observers are registered by default. Even if the
        // panel can be disabled (entirely or for a specific host) there is
        // no simple way to find out this now, as the context isn't available.
        // All will be unregistered again in the initContext (if necessary).
        // There is no big overhead, the initContext is called just after the
        // first document request.
        //this.registerObservers();

        // Register listener for NetInfoBody (if the API is available) so,
        // a new tab (Cookies) can be appended into the Net panel request info.
        var netInfoBody = Firebug.NetMonitor.NetInfoBody;
        if ("addListener" in netInfoBody)
            netInfoBody.addListener(this.NetInfoBody);

        // Register listener within the Console panel. If document.cookie property
        // is logged, formatted output is used.
        //Firebug.Console.addListener(this.ConsoleListener);

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
            image.setAttribute("src", "chrome://firebug/skin/cookies/breakOnCookie.svg");
            bonStack.appendChild(image);
        }

        Firebug.registerUIListener(this);
    },

    initializeUI: function()
    {
        ActivableModule.initializeUI.apply(this, arguments);

        // Append the styleesheet to a new console popup panel introduced in Firebug 1.6
        this.addStyleSheet(null);

        Dom.collapse(Firebug.chrome.$("fbConsoleFilter-cookies"), false);
    },

    /**
     * Peforms clean up when Firebug is destroyed.
     * Called by the framework when Firebug is closed for an existing Firefox window.
     */
    shutdown: function()
    {
        this.unregisterObservers();

        // Support for trace-console customization in Firebug 1.3
        TraceModule.removeListener(this.traceListener);

        var netInfoBody = Firebug.NetMonitor.NetInfoBody;
        if ("removeListener" in netInfoBody)
            netInfoBody.removeListener(this.NetInfoBody);

        //Firebug.Console.removeListener(this.ConsoleListener);
        //Firebug.Debugger.removeListener(this.DebuggerListener);

        Firebug.unregisterUIListener(this);
    },

    registerObservers: function()
    {
        if (this.observersRegistered)
        {
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.cookieModule.registerObservers; Observers ALREADY registered");
            return;
        }

        observerService.addObserver(HttpObserver, "http-on-modify-request", false);
        observerService.addObserver(HttpObserver, "http-on-examine-response", false);
        observerService.addObserver(PermissionObserver, "perm-changed", false);
        registerCookieObserver(CookieObserver);
        prefs.addObserver(networkPrefDomain, PrefObserver, false);

        this.observersRegistered = true;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.cookieModule.registerObservers;");
    },

    unregisterObservers: function()
    {
        if (!this.observersRegistered)
        {
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.cookieModule.registerObservers; " +
                    "Observers ALREADY un-registered");
            return;
        }

        observerService.removeObserver(HttpObserver, "http-on-modify-request");
        observerService.removeObserver(HttpObserver, "http-on-examine-response");
        observerService.removeObserver(PermissionObserver, "perm-changed");
        unregisterCookieObserver(CookieObserver);
        prefs.removeObserver(networkPrefDomain, PrefObserver);

        this.observersRegistered = false;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.cookieModule.unregisterObservers;");
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
                " events to real-context.");

            var message = "cookies.Copy active hosts (";
            for (var host in tempContext.cookies.activeHosts)
                message += host + ", ";
            message = message.substring(0, message.length - 2);
            message += ") from temp context into the real context.";
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
                context.getName());

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
                FBTrace.sysout("cookies.DESTROY temporary context, tabId: " + tempContext.tabId);
        }

        // The base class must be called after the context for Cookies panel is
        // properly initialized. The panel can be created inside this function
        // (within ActivableModule.enablePanel), which can result in
        // calling CookiePanel.initialize method. This method directly calls
        // CookiePanel.refresh, which needs the context.cookies object ready.
        ActivableModule.initContext.apply(this, arguments);

        // Unregister all observers if the panel is disabled.
        if (!this.isEnabled(context))
            this.unregisterObservers(context);
    },

    destroyContext: function(context)
    {
        ActivableModule.destroyContext.apply(this, arguments);

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
            privateAppend(panel.document);

        // Firebug 1.6 introduces another panel for console preview on other panels
        // The allows to use command line in other panels too.
        var preview = Firebug.chrome.$("fbCommandPreviewBrowser");
        if (preview)
            privateAppend(preview.contentDocument);
    },

    updateOption: function(name, value)
    {
        if (name == "consoleFilterTypes")
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
        var filterTypes = Options.get("consoleFilterTypes");

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

        if (FBTrace.DBG_COOKIES || FBTrace.DBG_ERRORS)
        {
            var tabId = Firebug.getTabIdForWindow(view);

            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.On before unload tab:  " + tabId);

            if (contexts[tabId])
            {
                delete contexts[tabId];

                if (FBTrace.DBG_COOKIES)
                    FBTrace.sysout("cookies.CookieModule.onBeforeUnload; There is a temp context leak!");
            }
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

            var isSession = CookieUtils.isSessionCookie(c);
            var cm2 = Cc["@mozilla.org/cookiemanager;1"].getService(Ci.nsICookieManager2);
            cm2.add(c.host, c.path, c.name, c.rawValue, c.isSecure, c.isHttpOnly, isSession,
                c.expires || Math.round((new Date()).getTime() / 1000 + 9999999999));

            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.createCookie: set cookie string: " + cookieString, cookie);

            // xxxHonza: this shouldn't be necessary, but sometimes the CookieObserver
            // is not triggered.
            TabWatcher.iterateContexts(function(context)
            {
                context.getPanel(panelName).refresh();
            });
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

        // xxxHonza: this shouldn't be necessary, but sometimes the CookieObserver
        // is not triggered.
        TabWatcher.iterateContexts(function(context)
        {
            context.getPanel(panelName).refresh();
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Support for ActivableModule 1.6

    /**
     * It's just here to exists (calling base class only)
     */
    isEnabled: function(context)
    {
        return ActivableModule.isEnabled.apply(this, arguments);
    },

    hasContexts: function()
    {
        var ret = false;
        TabWatcher.iterateContexts(function()
        {
            ret = true;
        });
        return ret;
    },

    /**
     * Called when an observer (e.g. panel) is added/removed into/from the model.
     * This is the moment when the model needs to decide whether to activate.
     */
    onObserverChange: function(observer)
    {
        if (this.hasObservers() && this.hasContexts())
            this.registerObservers();
        else
            this.unregisterObservers();

        this.setStatus();
    },

    onSuspendFirebug: function()
    {
        this.onObserverChange();

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onSuspendFirebug");
    },

    onResumeFirebug: function(context)
    {
        this.onObserverChange();

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onResumeFirebug");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    setStatus: function()
    {
        var fbStatus = Firefox.getElementById("firebugStatus");
        if (fbStatus)
        {
            if (this.hasObservers())
                fbStatus.setAttribute(panelName, "on");
            else
                fbStatus.removeAttribute(panelName);
        }
        else
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("cookies.setStatus ERROR no firebugStatus element");
        }
    },

    getMenuLabel: function(option, location)
    {
        var host = getURIHost(location);

        // In case of local files or system pages use this labels instead of host.
        // xxxHonza: the panel should be automatically disabled for local files
        // and system pages as there are no cookies associated.
        // These options shouldn't be available at all.
        if (isSystemURL(location.spec))
            host = Locale.$STR("cookies.SystemPages");
        else if (!getURIHost(location))
            host = Locale.$STR("cookies.LocalFiles");

        // Translate these two options in panel activable menu from cookies.properties
        switch (option)
        {
        case "disable-site":
            return Locale.$STRF("cookies.HostDisable", [host]);
        case "enable-site":
            return Locale.$STRF("cookies.HostEnable", [host]);
        }

        return ActivableModule.getMenuLabel.apply(this, arguments);
    },

    // xxxHonza: This method is overriden just to provide translated strings from
    // cookies.properties file.
    openPermissions: function(event, context)
    {
        Events.cancelEvent(event);

        var browserURI = Firebug.chrome.getBrowserURI(context);
        var host = this.getHostForURI(browserURI);

        var params = {
            permissionType: this.getPrefDomain(),
            windowTitle: Locale.$STR(this.panelName + ".Permissions"),
            introText: Locale.$STR(this.panelName + ".PermissionsIntro"),
            blockVisible: true,
            sessionVisible: false,
            allowVisible: true,
            prefilledHost: host,
        };

        openWindow("Browser:Permissions", "chrome://browser/content/preferences/permissions.xul",
            "", params);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Remove Cookies

    onRemoveAllShowTooltip: function(tooltip, context)
    {
        tooltip.label = Locale.$STR("cookies.removeall.tooltip");
        return true;
    },

    onRemoveAllSessionShowTooltip: function(tooltip, context)
    {
        tooltip.label = Locale.$STR("cookies.removeallsession.tooltip");
        return true;
    },

    /**
     * Removes cookies defined for a website. This method removes all cookies for
     * the current page (including cookies from embedded iframes). The method
     * doesn't check any UI filters.
     *
     * @param {Object} context context, in which the cookies are defined
     * @param {Object} [filter] filter to define, which cookies should be removed
     *   (format: {session: true/false, host: string})
     */
    removeCookies: function(context, filter)
    {
        var panel = context.getPanel(panelName, true);
        if (!panel)
            return;

        var hosts = context.cookies.activeHosts;

        // If Firebug has been opened after page load, the activeHosts map
        // is empty since it's being initialized during the page load time
        // (in HttpObserver.onModifiedRequest).
        // Use the current window and iframes in such case (see issue 6469).
        if (!Obj.hasProperties(hosts))
        {
            hosts = {};

            Win.iterateWindows(context.window, function(win)
            {
                var host = Url.getURIHost(win.location);
                hosts[host] = true;
            });
        }

        for (var host in hosts)
        {
            var cookieEnumerator = cookieManager.getCookiesFromHost(host);
            while (cookieEnumerator.hasMoreElements())
            {
                var cookie = cookieEnumerator.getNext().QueryInterface(Ci.nsICookie2);
                this.removeCookieHelper(cookie, filter);
            }
        }
    },

    /**
     * Removes displayed cookies in the Cookies panel.
     *
     * @param {Object} context context, in which the cookies are defined
     * @param {Object} [filter] filter to define, which cookies should be removed
     *   (format: {session: true/false, host: string})
     */
    removeDisplayedCookies: function(context, filter)
    {
        var panel = context.getPanel("cookies", false);
        if (!panel)
            return;

        // Enumerate all displayed cookies and remove them step by step.
        var self = this;
        panel.enumerateCookies(function(cookie)
        {
            self.removeCookieHelper(cookie.cookie, filter);
        });
    },

    removeCookieHelper: function(cookie, filter)
    {
        // Remove the cookie only if the filter says so.
        if (!filter || ((!filter.session || cookie.isSession) &&
            (!filter.host || filter.host == cookie.host)))
        {
            cookieManager.remove(cookie.host, cookie.name, cookie.path, false);
        }
    },

    onRemoveAll: function(context)
    {
        if (Options.get(removeConfirmation))
        {
            var check = {value: false};
            var flags = prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_YES +
            prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_NO;

            if (!prompts.confirmEx(context.chrome.window, Locale.$STR("Firebug"),
                Locale.$STR("cookies.confirm.removeall"), flags, "", "", "",
                Locale.$STR("Do_not_show_this_message_again"), check) == 0)
            {
                return;
            }

            // Update 'Remove Cookies' confirmation option according to the value
            // of the dialog's "do not show again" checkbox.
            Options.set(removeConfirmation, !check.value);
        }

        Firebug.CookieModule.removeDisplayedCookies(context);
    },

    onRemoveAllSession: function(context)
    {
        if (Options.get(removeSessionConfirmation))
        {
            var check = {value: false};
            var flags = prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_YES +
                prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_NO;

            if (!prompts.confirmEx(context.chrome.window, Locale.$STR("Firebug"),
                Locale.$STR("cookies.confirm.removeallsession"), flags, "", "", "",
                Locale.$STR("Do_not_show_this_message_again"), check) == 0)
            {
                return;
            }

            // Update 'Remove Session Cookies' confirmation option according to the value
            // of the dialog's "do not show again" checkbox.
            Options.set(removeSessionConfirmation, !check.value);
        }

        Firebug.CookieModule.removeDisplayedCookies(context, {session: true});
    },

    onRemoveAllFromHost: function(context, host)
    {
        if (Options.get(removeConfirmation))
        {
            var check = {value: false};
            var flags = prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_YES +
                prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_NO;

            if (!prompts.confirmEx(context.chrome.window, Locale.$STR("Firebug"),
                Locale.$STRF("cookies.confirm.Remove_All_From_Host", [host]), flags, "", "", "",
                Locale.$STR("Do_not_show_this_message_again"), check) == 0)
            {
                return;
            }

            // Update 'Remove Cookies' confirmation option according to the value
            // of the dialog's "do not show again" checkbox.
            Options.set(removeConfirmation, !check.value);
        }

        Firebug.CookieModule.removeCookies(context, {host: host});
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Create Cookies

    onCreateCookieShowTooltip: function(tooltip, context)
    {
        var host = context.window.location.host;
        tooltip.label = Locale.$STRF("cookies.createcookie.tooltip", [host]);
        return true;
    },

    onCreateCookie: function(context)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.onCreateCookie");

        // There is an excepion if the window is closed or not initialized (empty tab)
        var host;
        try
        {
            host = context.window.location.host;
        }
        catch (err)
        {
            alert(Locale.$STR("cookies.message.There_is_no_active_page"));
            return;
        }

        // Name and domain.
        var cookie = new Object();
        cookie.name = this.getDefaultCookieName(context);
        cookie.host = host;

        // The edit dialog uses raw value.
        cookie.rawValue = Locale.$STR("cookies.createcookie.defaultvalue");

        // Default path
        var path = context.window.location.pathname || "/";
        cookie.path = path.substr(0, (path.lastIndexOf("/") || 1));

        // Set defaul expiration time.
        cookie.expires = this.getDefaultCookieExpireTime();

        var params = {
            cookie: cookie,
            action: "create",
            window: context.window,
            EditCookie: EditCookie,
            Firebug: Firebug,
            FBTrace: FBTrace,
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Exports all existing cookies in the browser into a cookies.txt file.
     * This action is available in the Cookies panel toolbar.
     */
    onExportAll: function(context)
    {
        try
        {
            var fp = Xpcom.CCIN("@mozilla.org/filepicker;1", "nsIFilePicker");
            fp.init(window, null, Ci.nsIFilePicker.modeSave);
            fp.appendFilters(Ci.nsIFilePicker.filterAll | Ci.nsIFilePicker.filterText);
            fp.filterIndex = 1;
            fp.defaultString = "cookies.txt";

            var rv = fp.show();
            if (rv == Ci.nsIFilePicker.returnOK || rv == Ci.nsIFilePicker.returnReplace)
            {
                var foStream = Xpcom.CCIN("@mozilla.org/network/file-output-stream;1", "nsIFileOutputStream");
                foStream.init(fp.file, 0x02 | 0x08 | 0x20, 0666, 0); // write, create, truncate

                var e = cookieManager.enumerator;
                while(e.hasMoreElements())
                {
                    var cookie = e.getNext();
                    cookie = cookie.QueryInterface(Ci.nsICookie2);
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
                FBTrace.sysout("cookies.onExportAll EXCEPTION", err);
        }
    },

    onExportForSiteShowTooltip: function(tooltip, context)
    {
        var host = context.window.location.host;
        tooltip.label = Locale.$STRF("cookies.export.Export_For_Site_Tooltip", [host]);
        return true;
    },

    onExportJsonForClipboardTooltip: function(tooltip, context)
    {
        var host = context.window.location.host;
        tooltip.label = Locale.$STRF("cookies.export.Export_Json_For_Clipboard_Tooltip", [host]);
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
            var fp = Xpcom.CCIN("@mozilla.org/filepicker;1", "nsIFilePicker");
            fp.init(window, null, Ci.nsIFilePicker.modeSave);
            fp.appendFilters(Ci.nsIFilePicker.filterAll | Ci.nsIFilePicker.filterText);
            fp.filterIndex = 1;
            fp.defaultString = "cookies.txt";

            var rv = fp.show();
            if (rv == Ci.nsIFilePicker.returnOK || rv == Ci.nsIFilePicker.returnReplace)
            {
                var foStream = Xpcom.CCIN("@mozilla.org/network/file-output-stream;1",
                    "nsIFileOutputStream");
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
                FBTrace.sysout("cookies.onExportForSite EXCEPTION", err);
        }
    },

    /**
     * Exports cookies for the current site into clipboard as a JSON array
     * This action is available in the Cookies panel toolbar.
     */
    onExportJsonForClipboard: function(context)
    {
        // Much of this was adapted from the "onExportForSite" function
        try
        {
            var panel = context.getPanel(panelName, true);
            var tbody = Dom.getElementByClass(panel.panelNode, "cookieTable").firstChild;
            var cookieArray = [];

            for (var row = tbody.firstChild; row; row = row.nextSibling)
            {
                if (Css.hasClass(row, "cookieRow") && row.repObject)
                {
                    // JSON.stringify was adding a backslash before each quote
                    // in the JSON output, which is not the intended output
                    //
                    // To bypass this, Firebug's .toJSON function is called on each
                    // cookie as it is inserted into the array and the backslashes
                    // are removed.
                    var formattedCookie = row.repObject.toJSON();
                    formattedCookie = formattedCookie.replace(/\\"/g,'\"');
                    cookieArray.push(formattedCookie);
                }
            }

            // Call toString on the array since all elements are JSON already
            // Prepend and append square bracked to the string and copy to clipboard
            System.copyToClipboard("[" + cookieArray.toString() + "]");
        }
        catch (err)
        {
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.onExportJsonForClipboard EXCEPTION", err);
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

    /**
     * Show or Hide JSONexport in Cookie Menu
     */
    exportJsonHandler: function(menu, context)
    {
        var menuItem = menu.ownerDocument.getElementById("fcExportJsonForClipboard");

        // collapse JSONexport menu option if the preference is false, show if true
        var showJSONexport = !Options.get(JSONexport)
        Dom.collapse(menuItem, showJSONexport);
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
            windowTitle    : Locale.$STR("cookies.ExceptionsTitle"),
            introText      : Locale.$STR("cookies.Intro")
        };

        parent.openDialog("chrome://browser/content/preferences/permissions.xul",
            "_blank","chrome,resizable=yes", params);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Console Panel Options

    /**
     * Extend Console panel's option menu.
     */
    onOptionsMenu: function(context, panel, items)
    {
        if (panel.name != "console")
            return;

        var cookies = [
            MenuUtils.optionMenu(context, "cookies.showCookieEvents",
                "cookies.tip.showCookieEvents", Firebug.prefDomain, "cookies.logEvents"),
        ];

        // The option is disabled if the panel is disabled.
        if (!this.isEnabled(context))
            cookies[0].disabled = true;

        // Append new option at the right position.
        for (var i=0; i<items.length; i++)
        {
            var item = items[i];
            if (item.option == "showStackTrace")
            {
                Arr.arrayInsert(items, i+1, cookies);
                return;
            }
        }

        // If "showStackTrace" is not there append at the end.
        Arr.arrayInsert(items, items.length, cookies);
    },
});

// ********************************************************************************************* //
// Custom info tab within Net panel

/**
 * @domplate Represents domplate template for cookie body that is displayed if
 * a cookie entry in the cookie list is expanded.
 */
Firebug.CookieModule.NetInfoBody = domplate(Rep,
/** @lends Firebug.CookieModule.NetInfoBody */
{
    tag:
        DIV({"class": "netInfoCookiesList"},
            DIV({"class": "netInfoHeadersGroup netInfoCookiesGroup", $collapsed: "$cookiesInfo|hideReceivedCookies"},
                SPAN(Locale.$STR("cookies.netinfo.Received Cookies"))
            ),
            DIV({"class": "netInfoReceivedCookies netInfoCookies"}),
            DIV({"class": "netInfoHeadersGroup netInfoCookiesGroup", $collapsed: "$cookiesInfo|hideSentCookies"},
                SPAN(Locale.$STR("cookies.netinfo.Sent Cookies"))
            ),
            DIV({"class": "netInfoSentCookies netInfoCookies"})
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
                Locale.$STR("cookies.Panel"));
    },

    destroyTabBody: function(infoBox, file)
    {
    },

    updateTabBody: function(infoBox, file, context)
    {
        var tab = infoBox.selectedTab;
        if (!tab || tab.dataPresented || !Css.hasClass(tab, "netInfoCookiesTab"))
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
                var cookie = CookieUtils.parseFromString(cookies[i]);
                if (!cookie.host)
                    cookie.host = file.request.URI.host;
                receivedCookies.push(new Cookie(CookieUtils.makeCookieObject(cookie)));
            }
        }

        // Parse sent cookies.
        sentCookies = CookieUtils.parseSentCookiesFromString(sentCookiesHeader);

        // Create basic UI content
        var tabBody = Dom.getElementByClass(infoBox, "netInfoCookiesText");
        this.tag.replace({cookiesInfo: {
            receivedCookies: receivedCookies,
            sentCookies: sentCookies,
        }}, tabBody);

        // Generate UI for received cookies.
        if (receivedCookies.length) {
            CookieReps.CookieTable.render(receivedCookies,
                Dom.getElementByClass(tabBody, "netInfoReceivedCookies"));
        }

        // Generate UI for sent cookies.
        if (sentCookies.length) {
            CookieReps.CookieTable.render(sentCookies,
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
            FBTrace.sysout("cookies.observe: " + aTopic + ", " + aData);

        var fn = Obj.bind(CookiePermissions.updatePermButton, CookiePermissions);
        TabWatcher.iterateContexts(fn);
    }
});

// ********************************************************************************************* //

function CookieBreakpointGroup()
{
    this.breakpoints = [];
}

CookieBreakpointGroup.prototype = Obj.extend(new BreakpointGroup(),
{
    name: "cookieBreakpoints",
    title: Locale.$STR("cookies.Cookie Breakpoints"),

    addBreakpoint: function(cookie)
    {
        this.breakpoints.push(new Breakpoints.Breakpoint(cookie));
    },

    removeBreakpoint: function(cookie)
    {
        var bp = this.findBreakpoint(cookie);
        Arr.remove(this.breakpoints, bp);
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
// Preference observer

// xxxHonza: is this still needed?
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
            FBTrace.sysout("cookies.observe: " + aTopic + ", " + aData);

        if (aData == networkPrefDomain + "." + cookieBehaviorPref ||
            aData == networkPrefDomain + "." + cookieLifeTimePref) {
            var fn = CookiePermissions.updatePermButton;
            TabWatcher.iterateContexts(fn);
        }
    }
});

// ********************************************************************************************* //
// Used till the real context isn't available (in initContext), bug if Firebug)

function CookieTempObserver(tempContext) {
    this.tempContext = tempContext;
}

CookieTempObserver.prototype = Obj.extend(BaseObserver, {
    observe: function(subject, topic, data) {
        this.tempContext.appendCookieEvent(subject, topic, data);
    }
});

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
// Firebug Registration

// Expose to XUL scope
Firebug.CookieModule.Perm = CookiePermissions;

// Expose for tests
Firebug.CookieModule.CookieReps = CookieReps;

Firebug.registerActivableModule(Firebug.CookieModule);

return Firebug.CookieModule;

// ********************************************************************************************* //
});
