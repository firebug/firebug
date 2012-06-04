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
],
function(Xpcom, Obj, Locale, Domplate, Dom, Options, Persist, Str, Http, Css, Events,
    BaseObserver, MenuUtils, CookieReps, CookieUtils, Cookier, Breakpoints, CookieObserver,
    CookieClipboard, TabWatcher, HttpObserver, System, CookiePermissions) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

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
const observerService = Xpcom.CCSV("@mozilla.org/observer-service;1", "nsIObserverService");
const prompts = Xpcom.CCSV("@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");

// Preferences
const PrefService = Cc["@mozilla.org/preferences-service;1"];
const nsIPrefService = Ci.nsIPrefService;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const prefService = PrefService.getService(nsIPrefService);
const prefs = PrefService.getService(nsIPrefBranch2);

// Cookie panel ID.
const panelName = "cookies";

// Helper array for prematurely created contexts
var contexts = new Array();

// Extend string bundle with new strings for this extension.
// This must be done yet before domplate definitions.
Firebug.registerStringBundle("chrome://firebug/locale/cookies.properties");

// Register stylesheet in Firebug. This method is introduced in Firebug 1.6
Firebug.registerStylesheet("chrome://firebug/skin/cookies/cookies.css");

// ********************************************************************************************* //
// Module Implementation

/**
 * @module This class represents a <i>module</i> for Firecookie extension.
 * The module supports activation (enable/disable of the Cookies panel).
 * This functionality has been introduced in Firebug 1.2 and makes possible
 * to control activity of Firebug panels in order to avoid (performance) expensive
 * features.
 */
Firebug.FireCookieModel = Obj.extend(Firebug.ActivableModule,
/** @lends Firebug.FireCookieModel */
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
            FBTrace.sysout("cookies.FireCookieModel.initialize;");

        // Support for trace-console customization in Firebug 1.3
        if (Firebug.TraceModule && Firebug.TraceModule.addListener)
            Firebug.TraceModule.addListener(this.TraceListener);

        this.panelName = panelName;
        this.description = Locale.$STR("cookies.modulemanager.description");

        Firebug.ActivableModule.initialize.apply(this, arguments);

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
        Firebug.ActivableModule.initializeUI.apply(this, arguments);

        // Append the styleesheet to a new console popup panel introduced in Firebug 1.6
        this.addStyleSheet(null);

        // Console filter is available since Firebug 1.6
        if (System.checkFirebugVersion("1.6") >= 0)
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

    internationalizeUI: function()
    {
        var elements = ["fcCookiesMenu", "fcExportAll", "fcExportForSite", "fcRemoveAllSession",
            "fcRemoveAll", "fcCreate", "fcCookieViewAll", "fcCookieViewExceptions",
            "fcToolsMenu", "fcFilterMenu", "fcFilterByPath",
            "fcShowRejectedCookies", "fbConsoleFilter-cookies"];

        for (var i=0; i<elements.length; i++)
        {
            var element = Firebug.chrome.$(elements[i]);
            if (element.hasAttribute("label"))
                Locale.internationalize(element, "label");

            if (element.hasAttribute("tooltiptext"))
                Locale.internationalize(element, "tooltiptext");
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
        Firebug.ActivableModule.initContext.apply(this, arguments);

        // Unregister all observers if the panel is disabled.
        if (!this.isEnabled(context))
            this.unregisterObservers(context);
    },

    reattachContext: function(browser, context)
    {
        Firebug.ActivableModule.reattachContext.apply(this, arguments);

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
        Firebug.ActivableModule.destroyContext.apply(this, arguments);

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
        Firebug.ActivableModule.onEnablePrefChange.apply(this, arguments);

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

        return Firebug.ActivableModule.isEnabled.apply(this, arguments);
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
        if (context && System.checkFirebugVersion("1.6") < 0)
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
        if (context && System.checkFirebugVersion("1.6") < 0)
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

        return Firebug.ActivableModule.getMenuLabel.apply(this, arguments);
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
            CookieReps.CookieRow.onRemove(cookies[i]);
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
            fp.init(window, null, Ci.nsIFilePicker.modeSave);
            fp.appendFilters(Ci.nsIFilePicker.filterAll | Ci.nsIFilePicker.filterText);
            fp.filterIndex = 1;
            fp.defaultString = "cookies.txt";

            var rv = fp.show();
            if (rv == Ci.nsIFilePicker.returnOK || rv == Ci.nsIFilePicker.returnReplace)
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
            fp.init(window, null, Ci.nsIFilePicker.modeSave);
            fp.appendFilters(Ci.nsIFilePicker.filterAll | Ci.nsIFilePicker.filterText);
            fp.filterIndex = 1;
            fp.defaultString = "cookies.txt";

            var rv = fp.show();
            if (rv == Ci.nsIFilePicker.returnOK || rv == Ci.nsIFilePicker.returnReplace)
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
            FBTrace.sysout("cookies.observe: " + aTopic + ", " + aData + "\n");

        var fn = CookiePermissions.updatePermButton;
        TabWatcher.iterateContexts(fn);
    }
});

// ********************************************************************************************* //

function CookieBreakpointGroup()
{
    this.breakpoints = [];
}

CookieBreakpointGroup.prototype = Obj.extend(new Firebug.Breakpoint.BreakpointGroup(),
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
            FBTrace.sysout("cookies.observe: " + aTopic + ", " + aData + "\n");

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
// Firebug Registration

Firebug.registerActivableModule(Firebug.FireCookieModel);

// ********************************************************************************************* //
}});

