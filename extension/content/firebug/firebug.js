/* See license.txt for terms of usage */

/**
 * Firebug module can depend only on modules that don't use the 'Firebug' namespace.
 * So, be careful before you create a new dependency.
 */
define([
    "firebug/lib/lib",
    "firebug/lib/object",
    "firebug/chrome/firefox",
    "firebug/chrome/chrome",
    "firebug/lib/domplate",
    "firebug/lib/options",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/lib/url",
    "firebug/lib/css",
    "firebug/chrome/window",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/lib/dom",
    "firebug/lib/http",
    "firebug/trace/traceListener",
    "firebug/console/commandLineExposed",
],
function(FBL, Obj, Firefox, ChromeFactory, Domplate, Options, Locale, Events,
    Wrapper, Url, Css, Win, Str, Arr, Dom, Http, TraceListener, CommandLineExposed) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const nsISupports = Ci.nsISupports;

const observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
const categoryManager = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
const promptService = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);

const versionURL = "chrome://firebug/content/branch.properties";

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

const scriptBlockSize = 20;

const PLACEMENT_NONE = 0;
const PLACEMENT_INBROWSER = 1;
const PLACEMENT_DETACHED = 2;
const PLACEMENT_MINIMIZED = 3;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

var modules = [];
var activeContexts = [];
var activableModules = [];
var panelTypes = [];
var earlyRegPanelTypes = []; // See Firebug.registerPanelType for more info
var reps = [];
var defaultRep = null;
var defaultFuncRep = null;
var menuItemControllers = [];
var panelTypeMap = {};

// ********************************************************************************************* //

//xxxHonza: we should use the existing Firebug object.
if (window.Firebug)
{
    // Stow the pre-load properties, add them back at the end
    var PreFirebug = {};
    var preFirebugKeys = Object.keys(Firebug);
    preFirebugKeys.forEach(function copyProps(key)
    {
        PreFirebug[key] = Firebug[key];
    });
}

/**
 * @class Represents the main Firebug application object. An instance of this object is
 * created for each browser window (browser.xul).
 */
window.Firebug =
{
    version: "1.13",

    dispatchName: "Firebug",
    modules: modules,
    panelTypes: panelTypes,
    earlyRegPanelTypes: earlyRegPanelTypes,
    uiListeners: [],
    reps: reps,

    stringCropLength: 50,

    isInitialized: false,
    isLoaded: false,

    migrations: {},

    // Custom stylesheets registered by extensions.
    stylesheets: [],

    // xxxHonza: hack, all "Firebug.Options" occurences should be replaced by "Options"
    Options: Options,

    viewChrome: null,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(chrome)
    {
        // This says how much time was necessary to load Firebug overlay (+ all script tags).
        FBTrace.timeEnd("SCRIPTTAG_TIME");

        // Measure the entire Firebug initialization time.
        FBTrace.time("INITIALIZATION_TIME");

        Firebug.chrome = chrome;
        Firebug.originalChrome = Firebug.chrome;

        if (FBTrace.sysout && (!FBL || !FBL.initialize))
        {
            FBTrace.sysout("Firebug is broken, FBL incomplete, if the last function is QI, " +
                "check lib.js:", FBL);
        }
        else if (FBTrace.DBG_INITIALIZE)
        {
            FBTrace.sysout("firebug.initialize FBL: " + FBL);
        }

        if (window.FBL.legacyApiPatch)
            window.FBL.legacyApiPatch(FBL, this, Firefox);

        // Till now all registered panels have been inserted into earlyRegPanelTypes.
        var tempPanelTypes = earlyRegPanelTypes;
        earlyRegPanelTypes = null;
        Firebug.completeInitialize(tempPanelTypes);
    },

    completeInitialize: function(tempPanelTypes)
    {
        if (FBL)
            FBL.initialize();  // non require.js modules

        // Append early registered panels at the end.
        panelTypes.push.apply(panelTypes, tempPanelTypes);

        // Firebug is getting option-updates from the connection so,
        // do not register it again here (see issue 6035)
        //Firebug.Options.addListener(this);

        this.isInitialized = true;

        // Distribute Firebug's preference domain as an argument (see issue 6210).
        Events.dispatch(modules, "initialize", [Options.prefDomain]);

        // This is the final of Firebug initialization.
        FBTrace.timeEnd("INITIALIZATION_TIME");
    },

    sendLoadEvent: function()
    {
        this.isLoaded = true;

        var event = document.createEvent("Events");
        event.initEvent("FirebugLoaded", true, false);

        // Send to the current window/scope (firebugFrame.xul)
        window.document.dispatchEvent(event);

        // Send to the top window/scope (browser.xul)
        if (top != window)
            top.document.dispatchEvent(event);
    },

    getVersion: function()
    {
        if (!this.fullVersion)
            this.fullVersion = this.loadVersion(versionURL);

        return this.fullVersion;
    },

    loadVersion: function(versionURL)
    {
        var content = Http.getResource(versionURL);
        if (!content)
            return "no content at "+versionURL;

        var m = /RELEASE=(.*)/.exec(content);
        if (m)
            var release = m[1];
        else
            return "no RELEASE in "+versionURL;

        m = /VERSION=(.*)/.exec(content);
        if (m)
            var version = m[1];
        else
            return "no VERSION in "+versionURL;

        return version+""+release;
    },

    /**
     *  Substitute strings in the UI, with fall back to en-US
     */
    internationalizeUI: function(doc) // TODO chrome.js
    {
        if (!doc)
            return;

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("Firebug.internationalizeUI");

        var elements = doc.getElementsByClassName("fbInternational");
        elements = Arr.cloneArray(elements);
        var attributes = ["label", "tooltiptext", "aria-label"];
        for (var i=0; i<elements.length; i++)
        {
            var element = elements[i];
            Css.removeClass(elements[i], "fbInternational");
            for (var j=0; j<attributes.length; j++)
            {
                if (element.hasAttribute(attributes[j]))
                    Locale.internationalize(element, attributes[j]);
            }
        }

        // Allow other modules to internationalize UI labels (called also for
        // detached Firebug window).
        Events.dispatch(modules, "internationalizeUI", [doc]);
    },

    /**
     * Called when the UI is ready to be initialized, once the panel browsers are loaded,
     * but before any contexts are created.
     */
    initializeUI: function(detachArgs)
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.initializeUI detachArgs:", detachArgs);

        Events.dispatch(menuItemControllers, "initialize", []);  // TODO chrome.js

        // In the case that the user opens firebug in a new window but then closes Firefox
        // window, we don't get the quitApplicationGranted event (platform is still running)
        // and we call shutdown (Firebug isDetached).
        window.addEventListener('unload', shutdownFirebug, false);

        // Initial activation of registered panel types. All panel -> module dependencies
        // should be defined now (in onActivationChange). Must be called after
        // Firebug.TabWatcher is ready.
        if (Firebug.PanelActivation)
            Firebug.PanelActivation.activatePanelTypes(panelTypes);

        // Tell the modules the UI is up.
        Events.dispatch(modules, "initializeUI", [detachArgs]);
    },

    /**
     * called in browser when Firefox closes and in externalMode when fbs gets
     * quitApplicationGranted.
     */
    shutdown: function()
    {
        if (this.isShutdown)
            return;

        this.isShutdown = true;

        this.shutdownUI();

        Events.dispatch(modules, "shutdown");

        this.Options.shutdown();
        this.Options.removeListener(this);

        this.connection.disconnect();

        this.PanelActivation.deactivatePanelTypes(panelTypes);

        // Shutdown all registered extensions.
        this.unregisterExtensions();

        if (FBTrace.DBG_OBSERVERS)
        {
            // import fbObserverService
            Components.utils.import("resource://firebug/observer-service.js");
            fbObserverService.traceStacksForTrack();
        }

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.shutdown exited ");
    },

    shutdownUI: function()  // TODO chrome.js
    {
        window.removeEventListener("unload", shutdownFirebug, false);

        Events.dispatch(modules, "disable", [Firebug.chrome]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // TODO this entire section to XULWindow

    // TODO XULWindow
    getSuspended: function()
    {
        return Firebug.StartButton.getSuspended();
    },

    // TODO XULWindow
    setSuspended: function(value)
    {
        Firebug.StartButton.setSuspended(value);
    },

    // TODO XULWindow IN detached "Activate Firebug for the current website"
    toggleSuspend: function()
    {
        // getSuspended returns non-null value if Firebug is suspended.
        if (this.getSuspended() || this.isDetached())
        {
            // Firebug is suspended now. Two possible actions have been executed:
            // 1) Firebug UI is closed and the user clicked on the status bar icon in order to
            //    show the UI and resume Firebug.
            // 2) Firebug is detached, but suspended for the current page. The user clicked
            //    either on the status bar icon or on an activation button that is displayed
            //    within detached Firebug window.
            this.toggleBar(true);
        }
        else
        {
            // The users wants to suspend Firebug, let's do it and pull down the visible UI.
            // xxxHonza: the Firebug isn't suspended if detached and the user clicks on the
            // status bar icon (the detached window should becoma blank displaying only
            // the activation button).
            this.suspend();

            // Close detached Firebug or
            // show/hide Firebug UI according to the browser.showFirebug flag.
            if (Firebug.isDetached())
                this.toggleDetachBar(false);
            else
                this.syncBar();
        }
    },

    // dispatch suspendFirebug to all windows
    suspend: function()
    {
        if (Firebug.rerun)
            return;

        Firebug.suspendFirebug();
    },

    // dispatch onSuspendFirebug to all modules
    suspendFirebug: function()
    {
        var cancelSuspend = Events.dispatch2(activableModules, "onSuspendingFirebug", []);
        if (cancelSuspend)
            return;

        this.setSuspended("suspending");

        // TODO no context arg
        var cancelSuspend = Events.dispatch2(activableModules, "onSuspendFirebug",
            [Firebug.currentContext]);

        if (cancelSuspend)
            Firebug.resume();
        else
            this.setSuspended("suspended");
    },

    resume: function()
    {
        Firebug.resumeFirebug();
    },

    resumeFirebug: function()  // dispatch onResumeFirebug to all modules
    {
        this.setSuspended("resuming");

        // TODO no context arg
        Events.dispatch(activableModules, 'onResumeFirebug', [Firebug.currentContext]);
        this.setSuspended(null);
    },

    getURLsForAllActiveContexts: function()
    {
        var contextURLSet = [];

        // create a list of all unique activeContexts
        Firebug.connection.eachContext(function createActiveContextList(context)
        {
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("context " + context.getName());

            try
            {
                var cw = context.window;
                if (cw)
                {
                    var url;
                    if (cw.closed)
                    {
                        url = "about:closed";
                    }
                    else
                    {
                        if ("location" in cw)
                            url = cw.location.toString();
                        else
                            url = context.getName();
                    }

                    if (url)
                    {
                        if (contextURLSet.indexOf(url) == -1)
                            contextURLSet.push(url);
                    }
                }
            }
            catch(e)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("firebug.getURLsForAllActiveContexts could not get " +
                        "window.location for a context", e);
            }
        });

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("active contexts urls " + contextURLSet.length);

        return contextURLSet;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Registration

    /**
     * Set a default value for a preference into the firebug preferences list.
     *
     * @param name preference name, possibly dot segmented, will be stored under
     *      extensions.firebug.<name>
     * @param value default value of preference
     * @return true if default set, else false
     */
    registerPreference: function(name, value)
    {
        Firebug.Options.register(name, value);
    },

    registerModule: function()
    {
        modules.push.apply(modules, arguments);

        // Fire the initialize event for modules that are registered later.
        if (Firebug.isInitialized)
            Events.dispatch(arguments, "initialize", []);

        if (FBTrace.DBG_REGISTRATION)
        {
            for (var i = 0; i < arguments.length; ++i)
                FBTrace.sysout("registerModule "+arguments[i].dispatchName);
        }
    },

    unregisterModule: function()
    {
        for (var i = 0; i < arguments.length; ++i)
            Arr.remove(modules, arguments[i]);

        // Fire shutdown if module was unregistered dynamically (not on Firebug shutdown).
        if (!Firebug.isShutdown)
            Events.dispatch(arguments, "shutdown", []);
    },

    registerActivableModule: function()
    {
        activableModules.push.apply(activableModules, arguments);
        this.registerModule.apply(this, arguments);
    },

    registerUIListener: function()
    {
        for (var j = 0; j < arguments.length; j++)
            Firebug.uiListeners.push(arguments[j]);
    },

    unregisterUIListener: function()
    {
        for (var i = 0; i < arguments.length; ++i)
            Arr.remove(Firebug.uiListeners, arguments[i]);
    },

    registerPanel: function()
    {
        for (var i=0; i<arguments.length; ++i)
        {
            var panelName = arguments[i].prototype.name;
            var panel = panelTypeMap[panelName];
            if (panel)
            {
                if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("firebug.registerPanel; ERROR a panel with the same " +
                        "ID already registered! " + panelName);
                }
            }
        }

        // In order to keep built in panels (like Console, Script...) be the first one
        // and insert all panels coming from extension at the end, catch any early registered
        // panel (i.e. before FBL.initialize is called, such as YSlow) in a temp array
        // that is appended at the end as soon as FBL.initialize is called.
        if (earlyRegPanelTypes)
            earlyRegPanelTypes.push.apply(earlyRegPanelTypes, arguments);
        else
            panelTypes.push.apply(panelTypes, arguments);

        for (var i=0; i<arguments.length; ++i)
            panelTypeMap[arguments[i].prototype.name] = arguments[i];

        if (FBTrace.DBG_REGISTRATION)
        {
            for (var i=0; i<arguments.length; ++i)
                FBTrace.sysout("registerPanel " + arguments[i].prototype.name);
        }

        // If Firebug is not initialized yet the UI will be updated automatically soon.
        if (!this.isInitialized)
            return;

        Firebug.chrome.syncMainPanels();
        Firebug.chrome.syncSidePanels();
    },

    unregisterPanel: function(panelType)
    {
        var panelName = panelType ? panelType.prototype.name : null;

        if (FBTrace.DBG_REGISTRATION)
        {
            FBTrace.sysout("firebug.unregisterPanel: " +
                (panelName ? panelName : "Undefined panelType"));
        }

        // Remove all instance of the panel.
        Firebug.connection.eachContext(function (context)
        {
            // An empty state can be probably used at this moment since
            // we are unregistering the panel anyway.
            var state = {}; //context.browser.persistedState;
            context.removePanel(panelType, state);
        });

        // Now remove panel-type itself.
        for (var i=0; i<panelTypes.length; i++)
        {
            if (panelTypes[i] == panelType)
            {
                panelTypes.splice(i, 1);
                break;
            }
        }

        delete panelTypeMap[panelType.prototype.name];

        // We don't have to update Firebug UI if it's just closing.
        if (this.isShutdown)
            return;

        // Make sure another panel is selected if the current one is has been removed.
        var panel = this.chrome.getSelectedPanel();
        if (panel && panel.name == panelName)
            Firebug.chrome.selectPanel("html");

        // The panel tab must be removed from the UI.
        Firebug.chrome.syncMainPanels();
        Firebug.chrome.syncSidePanels();
    },

    registerRep: function()
    {
        reps.push.apply(reps, arguments);
    },

    unregisterRep: function()
    {
        for (var i = 0; i < arguments.length; ++i)
            Arr.remove(reps, arguments[i]);
    },

    setDefaultReps: function(funcRep, rep)
    {
        defaultRep = rep;
        defaultFuncRep = funcRep;
    },

    registerStringBundle: function(bundleURI)
    {
        Locale.registerStringBundle(bundleURI);
    },

    unregisterStringBundle: function(bundleURI)
    {
        // xxxHonza: TODO:
    },

    /**
     * Allows registering of custom stylesheet coming from extension. The stylesheet is then
     * used automatially thorough Firebug UI.
     * @param {Object} styleURI URI of the stylesheet.
     */
    registerStylesheet: function(styleURI)
    {
        this.stylesheets.push(styleURI);

        // Append the stylesheet into the UI if Firebug is already loaded
        if (this.isLoaded)
            Firebug.chrome.appendStylesheet(styleURI);

        if (FBTrace.DBG_REGISTRATION)
            FBTrace.sysout("registerStylesheet " + styleURI);
    },

    unregisterStylesheet: function(styleURI)
    {
        // xxxHonza: TODO
    },

    registerMenuItem: function(menuItemController)
    {
        FBTrace.sysout("Firebug.registerMenuItem");
        menuItemControllers.push(menuItemController);
    },

    registerTracePrefix: function(prefix, type, removePrefix, styleURI)
    {
        var listener = Firebug.TraceModule.getListenerByPrefix(prefix);
        if (listener && FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("firebug.registerTracePrefix; ERROR " +
                "there is already such prefix registered!");
            return;
        }

        listener = new TraceListener(prefix, type, removePrefix, styleURI);
        Firebug.TraceModule.addListener(listener);
    },

    unregisterTracePrefix: function(prefix)
    {
        var listener = Firebug.TraceModule.getListenerByPrefix(prefix);
        if (listener)
            Firebug.TraceModule.removeListener(listener);
    },

    registerCommand: function(name, config)
    {
        return CommandLineExposed.registerCommand(name, config);
    },

    unregistereCommand: function(name)
    {
        return CommandLineExposed.unregisterCommand(name);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    getPref: function()
    {
        // TODO deprecated
        return Options.getPref.apply(Firebug.Options, arguments);
    },

    setPref: function()
    {
        // TODO deprecated
        return Options.setPref.apply(Firebug.Options, arguments);
    },

    clearPref: function()
    {
        // TODO deprecated
        return Options.clearPref.apply(Options, arguments);
    },

    prefDomain: "extensions.firebug",

    updateOption: function(name, value)
    {
        // fbtest changes options which change prefs which trigger updates in fbtrace
        if (!Firebug.chrome)
            return;

        // Distribute to the current chrome.
        Firebug.chrome.updateOption(name, value);

        // If Firebug is detached distribute also into the in-browser chrome.
        if (Firebug.chrome != Firebug.originalChrome)
            Firebug.originalChrome.updateOption(name, value);

        Events.dispatch(Firebug.modules, "updateOption", [name, value]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    shouldIgnore: function(objectChromeView)
    {
        if (objectChromeView)
        {
            var contentView = Wrapper.unwrapObject(objectChromeView);
            return (contentView && contentView.firebugIgnore);
        }
        // else don't ignore things we don't understand
    },

    setIgnored: function(objectChromeView)
    {
        if (objectChromeView)
        {
            var contentView = Wrapper.unwrapObject(objectChromeView);
            if (contentView)
                contentView.firebugIgnore = true;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Browser Bottom Bar

    // TODO XULWindow
    showBar: function(show)
    {
        var browser = Firefox.getCurrentBrowser();

        if (FBTrace.DBG_WINDOWS || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("showBar("+show+") for browser "+browser.currentURI.spec+
                " Firebug.currentContext "+Firebug.currentContext);

        Firebug.chrome.toggleOpen(show);

        if (!show)
            Firebug.Inspector.inspectNode(null);

        //xxxHonza: should be removed.
        Events.dispatch(Firebug.uiListeners, show ? "showUI" : "hideUI",
            [browser, Firebug.currentContext]);

        // Sync panel state after the showUI event is dispatched. syncPanel method calls
        // Panel.show method, which expects the active context to be already registered.
        if (show)
            Firebug.chrome.syncPanel();
        else
            Firebug.chrome.selectPanel(); // select null causes hide() on selected

        Firebug.StartButton.resetTooltip();
    },

    closeFirebug: function(userCommands)  // this is really deactivate
    {
        if (!Firebug.currentContext)
            return;

        // It looks like FBTest is calling Firebug.Activation.clearAnnotations()
        // when there is no current context.
        //throw new Error("closeFirebug ERROR: no Firebug.currentContext ");

        // Focus the browser window again
        Firebug.currentContext.window.focus();

        Firebug.connection.closeContext(Firebug.currentContext, userCommands);
        Firebug.StartButton.resetTooltip();
    },

    /**
     * Primary function to activate or minimize firebug. Used by
     * <ol>
     * <li>the status bar icon click action</li>
     * <li>the activation button (within Firebug.xul) click action</li>
     * </ol>
     * @param forceOpen: don't minimize, stay open if open.
     * @param panelName: eg 'script', to select a specific panel.
     */
    toggleBar: function(forceOpen, panelName)
    {
        if (panelName)
            Firebug.chrome.selectPanel(panelName);
        // if is deactivated.
        if (!Firebug.currentContext)
        {
            var context = Firebug.getContext();
            // Be sure the UI is open for a newly created context.
            forceOpen = true;
        }

        if (Firebug.isDetached())
        {
            //in detached mode, two possibilities exist, the firebug windows is
            // the active window of the user or no.
            if ( !Firebug.chrome.hasFocus() || forceOpen)
                Firebug.chrome.focus();
            else
                Firebug.minimizeBar();
        }
        // toggle minimize
        else if (Firebug.isMinimized())
        {
            // be careful, unMinimize func always sets placement to
            // inbrowser first then unminimizes. when we want to
            // unminimize in detached mode must call detachBar func.
            if (Firebug.framePosition == "detached")
                this.detachBar();
            else
                Firebug.unMinimize();
        }
        // else isInBrowser
        else if (!forceOpen)
        {
            Firebug.minimizeBar();
        }

        return true;
    },

    /**
     * Get context for the current website
     */
    getContext: function()
    {
        var webApp = Firebug.connection.getCurrentSelectedWebApp();
        var context = Firebug.connection.getContextByWebApp(webApp);
        // we are not debugging the selected tab.
        if (!context)
        {
            context = Firebug.connection.getOrCreateContextByWebApp(webApp);
        }
        return context;
    },

    /**
     * Primary function to re-show firebug due to visiting active site.
     * Unlike toggleBar, we are trying to obey the current placement, not change it.
     */
    showContext: function(browser, context)
    {
        // user wants detached but we are not yet
        if (Firebug.framePosition == "detached" && !Firebug.isDetached())
        {
            if (context && !Firebug.isMinimized()) // don't detach if it's minimized 2067
                this.detachBar();  //   the placement will be set once the external window opens
            else  // just make sure we are not showing
                this.showBar(false);
        }
        else if (Firebug.openMinimized() && !Firebug.isMinimized())
            this.minimizeBar();
        else if (Firebug.isMinimized())
            this.showBar(false);  // don't show, we are minimized
        else if (Firebug.isDetached())
            Firebug.chrome.syncResumeBox(context);
        else  // inBrowser
            this.showBar(context?true:false);
    },

    minimizeBar: function()  // just pull down the UI, but don't deactivate the context
    {
        if (Firebug.isDetached())
        {
            // TODO reattach

            // window is closing in detached mode
            var parent = this.getFirebugFrameParent();
            if (parent)
            {
                parent.exportFirebug();
                parent.close();
            }

            Firebug.setPlacement("minimized");
            this.showBar(false);
            Firebug.chrome.focus();
        }
        else // inBrowser -> minimized
        {
            Firebug.setPlacement("minimized");
            this.showBar(false);

            // Focus the browser window again
            if (Firebug.currentContext)
                Firebug.currentContext.window.focus();
        }
    },

    unMinimize: function()
    {
        Firebug.setPlacement("inBrowser");
        Firebug.showBar(true);
    },

    onShowDetachTooltip: function(tooltip)
    {
        tooltip.label = Firebug.isDetached() ? Locale.$STR("firebug.AttachFirebug") :
            Locale.$STR("firebug.DetachFirebug");
        return true;
    },

    /**
     * function to switch between detached and inbrowser modes.
     * @param forceOpen: should not be closed, stay open if open or open it.
     * @param reopenInBrowser: switch from detahced to inbrowser mode.
     */
    toggleDetachBar: function(forceOpen, reopenInBrowser)
    {
        //detached -> inbrowser
        if (!forceOpen && Firebug.isDetached())
        {
            var parent = this.getFirebugFrameParent();
            parent.exportFirebug();
            parent.close();

            if (reopenInBrowser)
            {
                // Is Firebug deactivated ? if yes, should be
                // activated at first, then unminimize.
                if (!Firebug.currentContext)
                {
                    var context = Firebug.getContext();
                }
                Firebug.unMinimize();
            }
            else
            {
                Firebug.minimizeBar();
            }

            Firebug.chrome.syncPositionPref();
        }
        // is minimized now but the last time that has been closed, was in detached mode,
        // so it should be returned to in browser mode because the user has pressed CTRL+F12.
        else if (Firebug.framePosition == "detached" && Firebug.isMinimized())
        {
            Firebug.unMinimize();
            Firebug.chrome.syncPositionPref();
        }
        // else is in browser mode, then switch to detached mode.
        else
        {
            this.detachBar();
        }
    },

    closeDetachedWindow: function(userCommands)
    {
        Firebug.showBar(false);

        if (Firebug.currentContext)
            ToolInterface.browser.closeContext(Firebug.currentContext, userCommands);

        // else the user closed Firebug external window while not looking at
        // a debugged web page.
        Firebug.StartButton.resetTooltip();
    },

    detachBar: function()
    {
        if (Firebug.isDetached())  // can be set true attachBrowser
        {
            Firebug.chrome.focus();
            return null;
        }

        if (Firebug.chrome.waitingForDetach)
            return null;

        Firebug.chrome.waitingForDetach = true;
        Firebug.chrome.toggleOpen(false);  // don't show in browser.xul now

        if (FBTrace.DBG_ACTIVATION)
        {
            FBTrace.sysout("Firebug.detachBar opening firebug.xul for context " +
                Firebug.currentContext.getName() );
        }

        Firebug.chrome.syncPositionPref("detached");

        return Firefox.openWindow("Firebug",
            "chrome://firebug/content/firefox/firebug.xul",
            "", {});
    },

    // show firebug if we should
    syncBar: function()
    {
        var browser = Firefox.getCurrentBrowser();

        // implicitly this is operating in the chrome of browser.xul
        this.showBar(browser && browser.showFirebug);
    },

    toggleCommandLine: function(showCommandEditor)
    {
        Options.set("commandEditor", showCommandEditor);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Returns parent of the firebugFrame.xul frame. The actual parent depends on whether
     * Firebug is attached or detached.
     *
     * attached -> browser.xul
     * detached -> firebug.xul
     */
    getFirebugFrameParent: function()
    {
        // We need firebug.xul in case of detached state. So, don't use 'top' since
        // it references browser.xul
        return Firebug.chrome.window.parent;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // deprecated

    resetAllOptions: function(confirm)
    {
        if (confirm)
        {
            var promptService = Cc["@mozilla.org/embedcomp/prompt-service;1"].
                getService(Ci.nsIPromptService);

            // Do not reset options if the user changed its mind.
            if (!promptService.confirm(null, Locale.$STR("Firebug"),
                Locale.$STR("confirmation.Reset_All_Firebug_Options")))
            {
                return;
            }
        }

        // Dispatch to non-module objects.
        Options.resetAllOptions(confirm);

        // Dispatch to all modules so that additional settings can be reset.
        Events.dispatch(modules, "resetAllOptions", []);

        // Dispatch to all modules so 'after' actions can be executed.
        Events.dispatch(modules, "afterResetAllOptions", []);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Panels

    getPanelType: function(panelName)
    {
        if (panelTypeMap.hasOwnProperty(panelName))
            return panelTypeMap[panelName];
        else
            return null;
    },

    getPanelTitle: function(panelType)
    {
        if (!panelType)
            return null;

        return panelType.prototype.title ? panelType.prototype.title
            : Locale.$STR("Panel-"+panelType.prototype.name);
    },

    getPanelTooltip: function(panelType)
    {
        var tooltip = panelType.prototype.tooltip ? panelType.prototype.tooltip
            : Locale.$STR("panel.tip."+panelType.prototype.name);
        return tooltip != panelType.prototype.name ? tooltip : this.getPanelTitle(panelType);
    },

    getMainPanelTypes: function(context)
    {
        var resultTypes = [];

        for (var i = 0; i < panelTypes.length; ++i)
        {
            var panelType = panelTypes[i];
            if (!panelType.prototype.parentPanel)
                resultTypes.push(panelType);
        }

        if (context.panelTypes)
        {
            for (var i = 0; i < context.panelTypes.length; ++i)
            {
                var panelType = context.panelTypes[i];
                if (!panelType.prototype.parentPanel)
                    resultTypes.push(panelType);
            }
        }

        resultTypes.sort(function(a, b)
        {
            return a.prototype.order < b.prototype.order ? -1 : 1;
        });

        return resultTypes;
    },

    getSidePanelTypes: function(context, mainPanel)
    {
        if (!mainPanel)
            return [];

        var resultTypes = [];

        for (var i = 0; i < panelTypes.length; ++i)
        {
            var panelType = panelTypes[i];

            if (panelType.prototype.parentPanel &&
                (panelType.prototype.parentPanel == mainPanel.name))
            {
                resultTypes.push(panelType);
            }
        }

        if (context.panelTypes)
        {
            for (var i = 0; i < context.panelTypes.length; ++i)
            {
                var panelType = context.panelTypes[i];
                if (panelType.prototype.parentPanel == mainPanel.name)
                    resultTypes.push(panelType);
            }
        }

        resultTypes.sort(function(a, b)
        {
            return a.prototype.order < b.prototype.order ? -1 : 1;
        });

        return resultTypes;
    },

    /**
     * Returns all panel types, whose activation can be toggled
     * @returns {Object} Activable panel types
     */
    getActivablePanelTypes: function()
    {
        var activablePanelTypes = [];
        for (var i = 0; i < panelTypes.length; ++i)
        {
            if (this.PanelActivation.isPanelActivable(panelTypes[i]))
                activablePanelTypes.push(panelTypes[i]);
        }

        return activablePanelTypes;
    },

    /**
     * Gets an object containing the state of the panel from the last time
     * it was displayed before one or more page reloads.
     * The 'null' return here is a too-subtle signal to the panel code in bindings.xml.
     * Note that panel.context may not have a persistedState, but in addition the persisted
     * state for panel.name may be null.
     *
     * xxxHonza: the method should never return null. The implementation should
     * just use: Persist.getPersistedState() method.
     */
    getPanelState: function(panel)
    {
        var persistedState = panel.context.persistedState;
        if (!persistedState || !persistedState.panelState)
            return null;

        return persistedState.panelState[panel.name];
    },

    showPanel: function(browser, panel)
    {
        // The panel may be null
        Events.dispatch(modules, "showPanel", [browser, panel]);
    },

    showSidePanel: function(browser, sidePanel)
    {
        Events.dispatch(modules, "showSidePanel", [browser, sidePanel]);
    },

    eachPanel: function(callback)
    {
        Firebug.connection.eachContext(function iteratePanels(context)
        {
            var rc = context.eachPanelInContext(callback);
            if (rc)
                return rc;
        });
    },

    dispatchToPanels: function(fName, args)
    {
        Firebug.eachPanel( function dispatchToPanel(panel)
        {
            if (panel[fName])
                return panel[fName].apply(panel,args);
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    dispatch: function(listeners, eventId, args)
    {
        Events.dispatch(listeners, eventId, args);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // URL mapping

    getObjectByURL: function(context, url)
    {
        for (var i = 0; i < modules.length; ++i)
        {
            var object = modules[i].getObjectByURL(context, url);
            if (object)
                return object;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Reps

    getRep: function(object, context)
    {
        var type = typeof(object);
        if (type == 'object' && object instanceof String)
            type = 'string';

        for (var i = 0; i < reps.length; ++i)
        {
            var rep = reps[i];
            try
            {
                if (rep.supportsObject(object, type, (context?context:Firebug.currentContext) ))
                {
                    //if (FBTrace.DBG_DOM)
                    //    FBTrace.sysout("getRep type: "+type+" object: "+object, rep);
                    return rep;
                }
            }
            catch (exc)
            {
                if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("firebug.getRep FAILS: "+ exc, exc);
                    FBTrace.sysout("firebug.getRep reps["+i+"/"+reps.length+"]: "+
                        (typeof(reps[i])), reps[i]);
                }
            }
        }

        //if (FBTrace.DBG_DOM)
        //    FBTrace.sysout("getRep default type: "+type+" object: "+object, rep);

        return (type == "function") ? defaultFuncRep : defaultRep;
    },

    getRepObject: function(node)
    {
        var target = null;
        for (var child = node; child; child = child.parentNode)
        {
            if (Css.hasClass(child, "repTarget"))
                target = child;

            if (child.repObject != null)
            {
                if (!target && Css.hasClass(child, "repIgnore"))
                    break;
                else
                    return child.repObject;
            }
        }
    },

    /**
     * The child node that has a repObject
     */
    getRepNode: function(node)
    {
        for (var child = node; child; child = child.parentNode)
        {
            if (child.repObject != null)
                return child;
        }
    },

    getElementByRepObject: function(element, object)
    {
        for (var child = element.firstChild; child; child = child.nextSibling)
        {
            if (child.repObject === object)
                return child;
        }
    },

    /**
     * Takes an element from a panel document and finds the owning panel.
     */
    getElementPanel: function(element)
    {
        for (; element; element = element.parentNode)
        {
            if (element.ownerPanel)
                return element.ownerPanel;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // nsISupports

    QueryInterface : function(iid)
    {
        if (iid.equals(nsISupports))
        {
            return this;
        }

        throw Components.results.NS_NOINTERFACE;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Placement

    isDetached: function()
    {
        return Firebug.placement == PLACEMENT_DETACHED;
    },

    isMinimized: function()
    {
        return Firebug.placement == PLACEMENT_MINIMIZED;
    },

    isInBrowser: function()
    {
        return Firebug.placement == PLACEMENT_INBROWSER;
    },

    placements: ["none", "inBrowser", "detached", "minimized"],

    placement: 1,

    setPlacement: function(toPlacement)
    {
        // TODO : This should probably be an event so others can link into this
        Firebug.chrome.$("fbSearchBox").hideOptions();

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.setPlacement from " + Firebug.getPlacement() + " to " +
                toPlacement + " with chrome " + Firebug.chrome.window.location);

        for (var i=0; i<Firebug.placements.length; i++)
        {
            if (toPlacement == Firebug.placements[i])
            {
                if (Firebug.placement != i) // then we are changing the value
                {
                    Firebug.placement = i;
                    delete Firebug.previousPlacement;
                    Options.set("previousPlacement", Firebug.placement);
                    Firebug.StartButton.resetTooltip();
                }
                return Firebug.placement;
            }
        }
        throw new Error("Firebug.setPlacement cannot match "+toPlacement+" as a placement");
    },

    getPlacement: function()
    {
        return Firebug.placements[Firebug.placement];
    },

    openMinimized: function()
    {
        if (!Firebug.previousPlacement)
            Firebug.previousPlacement = Options.get("previousPlacement");

        return (Firebug.previousPlacement && (Firebug.previousPlacement == PLACEMENT_MINIMIZED) );
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Firebug.TabWatcher Listener

    getContextType: function()
    {
        return Firebug.TabContext;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * This method syncs the UI to a context
     * @param context to become the active and visible context
     */
    selectContext: function(context)
    {
        this.showContext(context.browser, context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    focusBrowserTab: function(win)    // TODO move to FBL
    {
        Firefox.selectTabByWindow(win);
        this.chrome.focus();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // FBTest

    // Expose our test list to the FBTest console for automated testing.
    onGetTestList: function(testLists)
    {
        testLists.push({
            extension: "Firebug",
            testListURL: "http://getfirebug.com/tests/head/firebug.html"
        });
    }
};

// ********************************************************************************************* //
// API for Greasemonkey, Jetpack and other Firefox extensions

/**
 * @param global wrapped up global: outer window or sandbox
 * @return a |console| object for the window
 */
Firebug.getConsoleByGlobal = function getConsoleByGlobal(global)
{
    try
    {
        if (!(global instanceof Window))
            throw new Error("global is not a Window object");
        var win = Wrapper.wrapObject(global);
        return Firebug.Console.getExposedConsole(win);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("Firebug.getConsoleByGlobal FAILS " + exc, exc);
    }
};

// ********************************************************************************************* //

/**
 * Support for listeners registration. This object is also extended by Firebug.Module,
 * so all modules supports listening automatically. Note that an array of listeners is
 * created for each intance of a module within the initialize method. Thus all derived
 * module classes must ensure that the Firebug.Module.initialize method is called for the
 * super class.
 */
Firebug.Listener = function()
{
    // The array is created when the first listeners is added.
    // It can't be created here since derived objects would share
    // the same array.
    this.fbListeners = null;
};

Firebug.Listener.prototype =
{
    addListener: function(listener)
    {
        if (!listener)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("firebug.Listener.addListener; ERROR null listener registered.");
            return;
        }

        // Delay the creation until the objects are created so 'this' causes new array
        // for this object (e.g. module, panel, etc.)
        if (!this.fbListeners)
            this.fbListeners = [];

        this.fbListeners.push(listener);
    },

    removeListener: function(listener)
    {
        // if this.fbListeners is null, remove is being called with no add
        Arr.remove(this.fbListeners, listener);
    },

    dispatch: function(eventName, args)
    {
        if (this.fbListeners && this.fbListeners.length > 0)
            Events.dispatch(this.fbListeners, eventName, args);
    },

    dispatch2: function(eventName, args)
    {
        if (this.fbListeners && this.fbListeners.length > 0)
            return Events.dispatch2(this.fbListeners, eventName, args);
    }
};

// ********************************************************************************************* //

/**
 * @module Base class for all modules. Every derived module object must be registered using
 * <code>Firebug.registerModule</code> method. There is always one instance of a module object
 * per browser window.
 */
Firebug.Module = Obj.extend(new Firebug.Listener(),
/** @lends Firebug.Module */
{
    /**
     * Called by Firebug when Firefox window is opened.
     */
    initialize: function()
    {
    },

    /**
     * Called when the UI is ready for context creation.
     * Used by chromebug; normally FrameProgressListener events trigger UI synchronization,
     * this event allows sync without progress events.
     */
    initializeUI: function(detachArgs)
    {
    },

    /**
     * Called by Firebug when Firefox window is closed.
     */
    shutdown: function()
    {
    },

    /**
     * Called when a new context is created but before the page is loaded.
     */
    initContext: function(context, persistedState)
    {
    },

    /**
     * Called when a context is destroyed. Module may store info on persistedState
     * for reloaded pages.
     */
    destroyContext: function(context, persistedState)
    {
    },

    /**
     * Called when attaching to a window (top-level or frame).
     */
    watchWindow: function(context, win)
    {
    },

    /**
     * Called when unwatching a window (top-level or frame).
     */
    unwatchWindow: function(context, win)
    {
    },

    // Called when a FF tab is create or activated (user changes FF tab)
    // Called after context is created or with context == null (to abort?)
    showContext: function(browser, context)
    {
    },

    /**
     * Called after a context's page gets DOMContentLoaded
     */
    loadedContext: function(context)
    {
    },

    /*
     * After "onSelectingPanel", a panel has been selected but is not yet visible
     * @param browser a tab's browser element
     * @param panel selectet panel OR null
     */
    showPanel: function(browser, panel)
    {
    },

    showSidePanel: function(browser, sidePanel)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    updateOption: function(name, value)
    {
    },

    getObjectByURL: function(context, url)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // intermodule dependency

    // caller needs module. win maybe context.window or iframe in context.window.
    // true means module is ready now, else getting ready
    isReadyElsePreparing: function(context, win)
    {
    },
});

// ********************************************************************************************* //

Firebug.Extension =
{
    acceptContext: function(win,uri)
    {
        return false;
    },

    declineContext: function(win,uri)
    {
        return false;
    }
};

// ********************************************************************************************* //

/**
 * @panel Base class for all panels. Every derived panel must define a constructor and
 * register with <code>Firebug.registerPanel</code> method. An instance of the panel
 * object is created by the framework for each browser tab where Firebug is activated.
 */
Firebug.Panel = Obj.extend(new Firebug.Listener(),
/** @lends Firebug.Panel */
{
    searchable: false,    // supports search
    editable: true,       // clicking on contents in the panel will invoke the inline editor, eg the CSS Style panel or HTML panel.
    breakable: false,     // if true, supports break-on-next (the pause button functionality)
    order: 2147483647,    // relative position of the panel (or a side panel)
    statusSeparator: "<", // the character used to separate items on the panel status (aka breadcrumbs) in the tool bar, eg ">"  in the DOM panel
    enableA11y: false,    // true if the panel wants to participate in A11y accessibility support.
    deriveA11yFrom: null, // Name of the panel that uses the same a11y logic.
    inspectable: false,   // true to support inspecting elements inside this panel

    initialize: function(context, doc)
    {
        if (!context.browser)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("attempt to create panel with dud context!");
            return false;
        }

        this.context = context;
        this.document = doc;

        this.panelNode = doc.createElement("div");
        this.panelNode.ownerPanel = this;

        Css.setClass(this.panelNode, "panelNode panelNode-" + this.name + " contextUID=" +
            context.uid);

        // Load persistent content if any.
        var persistedState = Firebug.getPanelState(this);
        if (persistedState)
        {
            this.persistContent = persistedState.persistContent;
            if (this.persistContent && persistedState.panelNode)
                this.loadPersistedContent(persistedState);
        }

        // The default value for 'Persist' is set only the first time.
        if (typeof(this.persistContent) == "undefined")
            this.persistContent = Options.get(this.name + ".defaultPersist");

        doc.body.appendChild(this.panelNode);

        // Update panel's tab in case the break-on-next (BON) is active.
        var shouldBreak = this.shouldBreakOnNext();
        Firebug.Breakpoint.updatePanelTab(this, shouldBreak);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.initialize panelNode for " + this.name);

        this.initializeNode(this.panelNode);
    },

    destroy: function(state) // Panel may store info on state
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.destroy panelNode for " + this.name);

        state.persistContent = this.persistContent;

        if (this.panelNode)
        {
            if (this.persistContent)
                this.savePersistedContent(state);

            delete this.panelNode.ownerPanel;
        }

        this.destroyNode();

        // xxxHonza: not exactly sure why, but it helps when testing memory-leask.
        // Note the the selection can point to a document (in case of the HTML panel).
        // Perhaps it breaks a cycle (page -> firebug -> page)?
        delete this.selection;
        delete this.panelBrowser;
    },

    savePersistedContent: function(state)
    {
        state.panelNode = this.panelNode;
    },

    loadPersistedContent: function(persistedState)
    {
        // move the nodes from the persistedState to the panel
        while (persistedState.panelNode.firstChild)
            this.panelNode.appendChild(persistedState.panelNode.firstChild);

        Dom.scrollToBottom(this.panelNode);
    },

    // called when a panel in one XUL window is about to disappear to later reappear
    // another XUL window.
    detach: function(oldChrome, newChrome)
    {
    },

    // this is how a panel in one window reappears in another window; lazy called
    reattach: function(doc)
    {
        this.document = doc;

        if (this.panelNode)
        {
            var scrollTop = this.panelNode.scrollTop;
            this.panelNode = doc.adoptNode(this.panelNode, true);
            this.panelNode.ownerPanel = this;
            doc.body.appendChild(this.panelNode);
            this.panelNode.scrollTop = scrollTop;
        }
    },

    // Called at the end of module.initialize; addEventListener-s here
    initializeNode: function(panelNode)
    {
        Events.dispatch(this.fbListeners, "onInitializeNode", [this]);
    },

    // removeEventListener-s here.
    destroyNode: function()
    {
        Events.dispatch(this.fbListeners, "onDestroyNode", [this]);
    },

    show: function(state)  // persistedPanelState plus non-persisted hide() values
    {
    },

    hide: function(state)  // store info on state for next show.
    {
    },

    watchWindow: function(context, win)
    {
    },

    unwatchWindow: function(context, win)
    {
    },

    loadWindow: function(context, win)
    {
    },

    updateOption: function(name, value)
    {
    },

    /**
     * Called after chrome.applyTextSize
     * @param zoom: ratio of current size to normal size, eg 1.5
     */
    onTextSizeChange: function(zoom)
    {

    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Toolbar

    showToolbarButtons: function(buttonsId, show)
    {
        try
        {
            var buttons = Firebug.chrome.$(buttonsId);
            Dom.collapse(buttons, !show);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("firebug.Panel showToolbarButtons FAILS "+exc, exc);
        }
    },

    onGetPanelToolbarButtons: function(panel, items)
    {
        return [];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Returns a number indicating the view's ability to inspect the object.
     *
     * Zero means not supported, and higher numbers indicate specificity.
     */
    supportsObject: function(object, type)
    {
        return 0;
    },

    hasObject: function(object)  // beyond type testing, is this object selectable?
    {
        return false;
    },

    navigate: function(object)
    {
        // Get default location object if none is specified.
        if (!object)
            object = this.getDefaultLocation();

        // Make sure the location is *not* undefined.
        if (!object)
            object = null;

        // We should be extra careful when dealing with the |location| object (include
        // converting it to string).
        // There might be cases where the object is removed from the page (e.g. a stylesheet
        // that is currently displayed in the CSS panel) and the panel location not updated.
        //
        // This might happen because of optimalization where backround panels do not observe
        // changes on the page (e.g. using Mutation Observer).
        //
        // The object is a dead wrapper at such moments, firing an exception anytime
        // it's properties or methods are accessed.
        // So, just pass the object back to the panel, which must do proper checking.
        if (!this.location || (object != this.location))
        {
            if (FBTrace.DBG_PANELS)
                FBTrace.sysout("Panel.navigate; " + this.name);

            this.location = object;
            this.updateLocation(object);

            Events.dispatch(Firebug.uiListeners, "onPanelNavigate", [object, this]);
        }
        else
        {
            if (FBTrace.DBG_PANELS)
                FBTrace.sysout("Panel.navigate; Skipped for panel " + this.name);
        }
    },

    /**
     * The location object has been changed, the panel should update it view
     * @param object a location, must be one of getLocationList() returns
     *  if  getDefaultLocation() can return null, then updateLocation must handle it here.
     */
    updateLocation: function(object)
    {
    },

    select: function(object, forceUpdate)
    {
        if (!object)
            object = this.getDefaultSelection();

        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("firebug.select "+this.name+" forceUpdate: "+forceUpdate+" "+
                object+((object==this.selection)?"==":"!=")+this.selection);

        if (forceUpdate || object != this.selection)
        {
            this.selection = object;
            this.updateSelection(object);

            Events.dispatch(Firebug.uiListeners, "onObjectSelected", [object, this]);
        }
    },

    /**
     * Firebug wants to show an object to the user and this panel has the best supportsObject()
     * result for the object. If the panel displays a container for objects of this type,
     * it should set this.selectedObject = object
     */
    updateSelection: function(object)
    {
    },

    /**
     * Redisplay the panel based on the current location and selection
     */
    refresh: function()
    {
        if (this.location)
            this.updateLocation(this.location);
        else if (this.selection)
            this.updateSelection(this.selection);
    },

    markChange: function(skipSelf)
    {
        if (this.dependents)
        {
            if (skipSelf)
            {
                for (var i = 0; i < this.dependents.length; ++i)
                {
                    var panelName = this.dependents[i];
                    if (panelName != this.name)
                        this.context.invalidatePanels(panelName);
                }
            }
            else
                this.context.invalidatePanels.apply(this.context, this.dependents);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Inspector

    /**
     * Called by the framework when the user starts inspecting. Inspecting must be enabled
     * for the panel (panel.inspectable == true)
     */
    startInspecting: function()
    {
    },

    /**
     * Called by the framework when inspecting is in progress and the user moves mouse over
     * a new page element. Inspecting must be enabled for the panel (panel.inspectable == true).
     * This method is called in a timeout to avoid performance penalties when the user moves
     * the mouse over the page elements too fast.
     * @param {Element} node The page element being inspected
     * @returns {Boolean} Returns true if the node should be selected within the panel using
     *      the default panel selection mechanism (i.e. by calling panel.select(node) method).
     */
    inspectNode: function(node)
    {
        return true;
    },

    /**
     * Called by the framework when the user stops inspecting. Inspecting must be enabled
     * for the panel (panel.inspectable == true)
     * @param {Element} node The last page element inspected
     * @param {Boolean} canceled Set to true if inspecing has been canceled
     *          by pressing the escape key.
     */
    stopInspecting: function(node, canceled)
    {
    },

    /**
     * Called by the framework when inspecting is in progress. Allows to inspect
     * only nodes that are supported by the panel. Derived panels can provide effective
     * algorithms to provide these nodes.
     * @param {Element} node Currently inspected page element.
     */
    getInspectNode: function(node)
    {
        while (node)
        {
            if (this.supportsObject(node, typeof node))
                return node;
            node = node.parentNode;
        }
        return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /*
     * Called by search in the case something was found.
     * This will highlight the given node for a specific timespan. There's only one node
     * highlighted at a time.
     * @param {Node} Node to highlight
     */
    highlightNode: function(node)
    {
        if (this.highlightedNode)
            Css.cancelClassTimed(this.highlightedNode, "jumpHighlight", this.context);

        this.highlightedNode = node;

        if (node)
            Css.setClassTimed(node, "jumpHighlight", this.context);
    },

    /*
     * Called by the framework when panel search is used.
     * This is responsible for finding and highlighting search matches.
     * @param {String} text String to search for
     * @param {Boolean} reverse Indicates, if search is reversed
     * @return true, if search matched, otherwise false
     */
    search: function(text, reverse)
    {
    },

    /**
     * Retrieves the search options that this modules supports.
     * This is used by the search UI to present the proper options.
     */
    getSearchOptionsMenuItems: function()
    {
        return [
            Firebug.Search.searchOptionMenu("search.Case Sensitive", "searchCaseSensitive",
                "search.tip.Case_Sensitive")
        ];
    },

    /**
     * Navigates to the next document whose match parameter returns true.
     */
    navigateToNextDocument: function(match, reverse)
    {
        // This is an approximation of the UI that is displayed by the location
        // selector. This should be close enough, although it may be better
        // to simply generate the sorted list within the module, rather than
        // sorting within the UI.
        var self = this;
        function compare(a, b)
        {
            var locA = self.getObjectDescription(a);
            var locB = self.getObjectDescription(b);
            if (locA.path > locB.path)
                return 1;
            if (locA.path < locB.path)
                return -1;
            if (locA.name > locB.name)
                return 1;
            if (locA.name < locB.name)
                return -1;
            return 0;
        }

        var allLocs = this.getLocationList().sort(compare);
        for (var curPos = 0; curPos < allLocs.length && allLocs[curPos] != this.location; curPos++);

        function transformIndex(index)
        {
            if (reverse)
            {
                // For the reverse case we need to implement wrap around.
                var intermediate = curPos - index - 1;
                return (intermediate < 0 ? allLocs.length : 0) + intermediate;
            }
            else
            {
                return (curPos + index + 1) % allLocs.length;
            }
        };

        for (var next = 0; next < allLocs.length - 1; next++)
        {
            var object = allLocs[transformIndex(next)];

            if (match(object))
            {
                this.navigate(object);
                return object;
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    // Called when "Options" clicked. Return array of
    // {label: 'name', nol10n: true,  type: "checkbox", checked: <value>,
    //      command:function to set <value>}
    getOptionsMenuItems: function()
    {
        return null;
    },

    /**
     * Called by chrome.onContextMenu to build the context menu when this panel has focus.
     * See also FirebugRep for a similar function also called by onContextMenu
     * Extensions may monkey patch and chain off this call
     * @param object: the 'realObject', a model value, eg a DOM property
     * @param target: the HTML element clicked on.
     * @return an array of menu items.
     */
    getContextMenuItems: function(object, target)
    {
        return [];
    },

    getBreakOnMenuItems: function()
    {
        return [];
    },

    getEditor: function(target, value)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getDefaultSelection: function()
    {
        return null;
    },

    browseObject: function(object)
    {
    },

    getPopupObject: function(target)
    {
        return Firebug.getRepObject(target);
    },

    getTooltipObject: function(target)
    {
        return Firebug.getRepObject(target);
    },

    showInfoTip: function(infoTip, x, y)
    {

    },

    getObjectPath: function(object)
    {
        return null;
    },

    // An array of objects that can be passed to getObjectLocation.
    // The list of things a panel can show, eg sourceFiles.
    // Only shown if panel.location defined and supportsObject true
    getLocationList: function()
    {
        return null;
    },

    getDefaultLocation: function()
    {
        return null;
    },

    getObjectLocation: function(object)
    {
        return "";
    },

    // Text for the location list menu eg script panel source file list
    // return.path: group/category label, return.name: item label
    getObjectDescription: function(object)
    {
        var url = this.getObjectLocation(object);
        return Url.splitURLBase(url);
    },

    /**
     *  UI signal that a tab needs attention, eg Script panel is currently stopped on a breakpoint
     *  @param: show boolean, true turns on.
     */
    highlight: function(show)
    {
        var tab = this.getTab();
        if (!tab)
            return;

        if (show)
            tab.setAttribute("highlight", "true");
        else
            tab.removeAttribute("highlight");
    },

    getTab: function()
    {
        var chrome = Firebug.chrome;

        var tab = chrome.$("fbPanelBar2").getTab(this.name);
        if (!tab)
            tab = chrome.$("fbPanelBar1").getTab(this.name);
        return tab;
    },

    /**
     * If the panel supports source viewing, then return a SourceLink, else null
     * @param target an element from the panel under the mouse
     * @param object the realObject under the mouse
     */
    getSourceLink: function(target, object)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Support for Break On Next

    /**
     * Called by the framework to see if the panel currently supports BON
     */
    supportsBreakOnNext: function()
    {
        return this.breakable;  // most panels just use this flag
    },

    /**
     * Called by the framework when the user clicks on the Break On Next button.
     * @param {Boolean} armed Set to true if the Break On Next feature is
     * to be armed for action and set to false if the Break On Next should be disarmed.
     * If 'armed' is true, then the next call to shouldBreakOnNext should be |true|.
     */
    breakOnNext: function(armed)
    {
    },

    /**
     * Called when a panel is selected/displayed. The method should return true
     * if the Break On Next feature is currently armed for this panel.
     */
    shouldBreakOnNext: function()
    {
        return false;
    },

    /**
     * Returns labels for Break On Next tooltip (one for enabled and one for disabled state).
     * @param {Boolean} enabled Set to true if the Break On Next feature is
     * currently activated for this panel.
     */
    getBreakOnNextTooltip: function(enabled)
    {
        return null;
    },
});

// ********************************************************************************************* //

/**
 * @panel This object represents a panel with two states: enabled/disabled. Such support
 * is important for panel that represents performance penalties and it's useful for the
 * user to have the option to disable them.
 *
 * All methods in this object are used on the prototype object (they reprent class methods)
 * and so, |this| points to the panel's prototype and *not* to the panel instance.
 */
Firebug.ActivablePanel = Obj.extend(Firebug.Panel,
{
    activable: true,

    isActivable: function()
    {
        return this.activable;
    },

    isEnabled: function()
    {
        if (!this.isActivable())
            return true;

        if (!this.name)
            return false;

        return Options.get(this.name+".enableSites");
    },

    setEnabled: function(enable)
    {
        if (!this.name || !this.activable)
            return;

        Options.set(this.name+".enableSites", enable);
    },

    /**
     * Called when an instance of this panel type is enabled or disabled. Again notice that
     * this is a class method and so, panel instance variables (like e.g. context) are
     * not accessible from this method.
     * @param {Object} enable Set to true if this panel type is now enabled.
     */
    onActivationChanged: function(enable)
    {
        // TODO: Use Firebug.ActivableModule.addObserver to express dependencies on modules.
    },
});

// ********************************************************************************************* //

/**
 * @module Should be used by modules (Firebug specific task controllers) that supports
 * activation. An example of such 'activable' module can be the debugger module
 * {@link Firebug.Debugger}, which can be disabled in order to avoid performance
 * penalties (in cases where the user doesn't need a debugger for the moment).
 */
Firebug.ActivableModule = Obj.extend(Firebug.Module,
/** @lends Firebug.ActivableModule */
{
    /**
     * Every activable module is disabled by default waiting for on a panel
     * that wants to have it enabled (and display provided data). The rule is
     * if there is no panel (view) the module is disabled.
     */
    enabled: false,

    /**
     * List of observers (typically panels). If there is at least one observer registered
     * The module becomes active.
     */
    observers: null,

    /**
     * List of dependent modules.
     */
    dependents: null,

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Observers (dependencies)

    hasObservers: function()
    {
        return this.observers ? this.observers.length > 0 : false;
    },

    addObserver: function(observer)
    {
        if (!this.observers)
            this.observers = [];

        if (this.observers.indexOf(observer) === -1)
        {
            this.observers.push(observer);
            this.onObserverChange(observer);  // targeted, not dispatched.
        }
        // else no-op
    },

    removeObserver: function(observer)
    {
        if (!this.observers)
            return;

        if (this.observers.indexOf(observer) !== -1)
        {
            Arr.remove(this.observers, observer);
            this.onObserverChange(observer);  // targeted, not dispatched
        }
        // else no-op
    },

    /**
     * This method is called if an observer (e.g. {@link Firebug.Panel}) is added or removed.
     * The module should decide about activation/deactivation upon existence of at least one
     * observer.
     */
    onObserverChange: function(observer)
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("firebug.ActivableModule.onObserverChange;");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Firebug Activation

    onSuspendingFirebug: function()
    {
        // Called before any suspend actions. First caller to return true aborts suspend.
    },

    onSuspendFirebug: function()
    {
        // When the number of activeContexts decreases to zero. Modules should remove
        // listeners, disable function that takes resources
    },

    onResumeFirebug: function()
    {
        // When the number of activeContexts increases from zero. Modules should undo the
        // work done in onSuspendFirebug
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module enable/disable APIs.

    setDefaultState: function(enable)
    {
        //@deprecated
        Firebug.Console.log("Deprecated: don't use ActivableModule.setDefaultState!",
            Firebug.currentContext);
    },

    isEnabled: function()
    {
        return this.hasObservers();
    },

    isAlwaysEnabled: function()
    {
        return this.hasObservers();
    }
});

// ********************************************************************************************* //

/**
 * MeasureBox
 * To get pixels size.width and size.height:
 * <ul><li>     this.startMeasuring(view); </li>
 *     <li>     var size = this.measureText(lineNoCharsSpacer); </li>
 *     <li>     this.stopMeasuring(); </li>
 * </ul>
 */
Firebug.MeasureBox =
{
    startMeasuring: function(target)
    {
        if (!this.measureBox)
        {
            this.measureBox = target.ownerDocument.createElement("span");
            this.measureBox.className = "measureBox";
        }

        Css.copyTextStyles(target, this.measureBox);
        target.ownerDocument.body.appendChild(this.measureBox);
    },

    getMeasuringElement: function()
    {
        return this.measureBox;
    },

    measureText: function(value)
    {
        this.measureBox.textContent = value || "m";
        return {width: this.measureBox.offsetWidth, height: this.measureBox.offsetHeight-1};
    },

    measureInputText: function(value)
    {
        if (!value)
            value = "m";
        if (!Firebug.showTextNodesWithWhitespace)
            value = value.replace(/\t/g, "mmmmmm").replace(/\ /g, "m");

        this.measureBox.textContent = value;
        return {width: this.measureBox.offsetWidth, height: this.measureBox.offsetHeight-1};
    },

    getBox: function(target)
    {
        var style = this.measureBox.ownerDocument.defaultView.getComputedStyle(this.measureBox, "");
        var box = Css.getBoxFromStyles(style, this.measureBox);
        return box;
    },

    stopMeasuring: function()
    {
        this.measureBox.parentNode.removeChild(this.measureBox);
    }
};

// ********************************************************************************************* //

with (Domplate) {
Firebug.Rep = domplate(
{
    className: "",
    inspectable: true,

    supportsObject: function(object, type)
    {
        return false;
    },

    highlightObject: function(object, context)
    {
        var realObject = this.getRealObject(object, context);
        if (realObject)
            Firebug.Inspector.highlightObject(realObject, context);
    },

    unhighlightObject: function(object, context)
    {
        Firebug.Inspector.highlightObject(null);
    },

    inspectObject: function(object, context)
    {
        Firebug.chrome.select(object);
    },

    browseObject: function(object, context)
    {
    },

    persistObject: function(object, context)
    {
    },

    getRealObject: function(object, context)
    {
        return object;
    },

    getTitle: function(object)
    {
        if (!object)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Rep.getTitle; ERROR No object provided");
            return "null object";
        }

        try
        {
            if (object.constructor && typeof(object.constructor) == 'function')
            {
                var ctorName = object.constructor.name;
                // xxxsz: Objects with 'Object' as constructor name should also be shown.
                // See issue 6148.
                if (ctorName)
                    return ctorName;
            }
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Rep.getTitle; EXCEPTION " + e, e);
        }

        var label = Str.safeToString(object); // eg [object XPCWrappedNative [object foo]]

        const re =/\[object ([^\]]*)/;
        var m = re.exec(label);
        var n = null;
        if (m)
            n = re.exec(m[1]);  // eg XPCWrappedNative [object foo

        if (n)
            return n[1];  // eg foo
        else
            return m ? m[1] : label;
    },

    showInfoTip: function(infoTip, target, x, y)
    {
        return false;
    },

    getTooltip: function(object)
    {
        return null;
    },

    /**
     * Called by chrome.onContextMenu to build the context menu when the underlying object
     * has this rep. See also Panel for a similar function also called by onContextMenu
     * Extensions may monkey patch and chain off this call
     *
     * @param object: the 'realObject', a model value, eg a DOM property
     * @param target: the HTML element clicked on.
     * @param context: the context, probably Firebug.currentContext
     * @return an array of menu items.
     */
    getContextMenuItems: function(object, target, context)
    {
        return [];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Convenience for domplates

    STR: function(name)
    {
        return Locale.$STR(name);
    },

    cropString: function(text)
    {
        return Str.cropString(text);
    },

    cropMultipleLines: function(text, limit)
    {
        return Str.cropMultipleLines(text, limit);
    },

    toLowerCase: function(text)
    {
        return text ? text.toLowerCase() : text;
    },

    plural: function(n)
    {
        return n == 1 ? "" : "s";
    }
});
};

// ********************************************************************************************* //

Firebug.Migrator =
{
    /*
     * UI Update from element oldButton to element newButton.
     * On first call, Arrow points from old to new, button OK required
     * After OK, the oldButton is removed and not shown again unless preference is erased.
     */
    migrateButton: function(oldButton, newButton)
    {
        if (Firebug.Migrator.getMigrated(oldButton))
        {
            oldButton.parentNode.removeChild(oldButton);
            return;
        }

        function showMigration(event)
        {
            oldButton.removeEventListener('mouseover', showMigration, false);

            var endPoint = newButton.getBoundingClientRect();
            var origin = oldButton.getBoundingClientRect();

            // A box surrounding both buttons
            var left =   Math.min(origin.left,   endPoint.left);
            var right =  Math.max(origin.right,  endPoint.right);
            var top =    Math.min(origin.top,    endPoint.top);
            var bottom = Math.max(origin.bottom, endPoint.bottom);

            var width = right - left;
            var height =  bottom - top;

            var migrationPanel = Firebug.chrome.$("fbMigrator");
            var panelWidth = Math.max(width, 150);
            var panelHeight = Math.max(height, 150);
            migrationPanel.sizeTo(panelWidth, panelHeight);

            // x, y are offsets from the upper left corner of the oldButton, that
            // is the reference point of the 'overlap' position of the popup
            // (Hint, think about all the x values then all the y values.)
            if (left == origin.left)
            {
                var x = 0;
                var x1 = origin.width;
            }
            else
            {
                var x = origin.width - width;
                var x1 = width - origin.width;
            }
            if (top == origin.top)
            {
                var y = 0;
                var y1 = origin.height;
            }
            else
            {
                var y = origin.height - origin;
                var y1 = height - origin.height;
            }

            if (left == endPoint.left)
                var x2 = endPoint.width;
            else
                var x2 = width - endPoint.width;

            if (top == endPoint.top)
                var y2 = endPoint.height;
            else
                var y2 = height - endPoint.height;

            migrationPanel.openPopup(oldButton, 'overlap',  x,  y, false, true);

            Firebug.Migrator.drawMigrationLine(x1, y1, x2, y2);

            Firebug.Migrator.removeButtonOnOk(oldButton, migrationPanel);
        }
        oldButton.addEventListener('mouseover', showMigration, false);
    },

    drawMigrationLine: function(x1, y1, x2, y2)
    {
        var migrationFrame = Firebug.chrome.$('fbMigrationFrame');

        var line  = migrationFrame.contentDocument.getElementById("migrationPath");
        line.setAttribute("x1", x1);
        line.setAttribute("x2", x1);
        line.setAttribute("y1", y1);
        line.setAttribute("y2", y1);

        var progress = 0;
        var steps = 100;
        var stepStep = 1;
        var xStep = (x2 - x1)/steps;
        var yStep = (y2 - y1)/steps;
        var xCur = x1;
        var yCur = y1;
        Firebug.Migrator.animate = setInterval(function growLine()
        {
            xCur += stepStep*xStep;
            yCur += stepStep*yStep;
            steps -= stepStep;
            if (steps > 50)
                stepStep++;
            else
                stepStep--;
            //FBTrace.sysout("animate steps "+steps+" stepStep "+stepStep+" x "+xCur+" y "+yCur);
            line.setAttribute("x2", xCur);
            line.setAttribute("y2", yCur);
            if (steps < 0)
                clearInterval(animate);
        }, 50);
    },

    removeButtonOnOk: function(oldButton, migrationPanel)
    {
        var migrationOk = Firebug.chrome.$('fbMigrationOk');
        migrationOk.addEventListener('click', function migrationComplete(event)
        {
            // xxxHonza, XXXjjb: I have seen an exception saying that oldButton.parentNode is null.
            oldButton.parentNode.removeChild(oldButton);
            Firebug.Migrator.setMigrated(oldButton);
            clearInterval(Firebug.Migrator.animate);
            migrationPanel.hidePopup();
            migrationOk.removeEventListener('click', migrationComplete, true);
        }, true);
    },

    getMigrated: function(elt)
    {
        var id = elt.getAttribute('id');
        return Options.get("migrated_"+id);
    },

    setMigrated: function(elt)
    {
        var id = elt.getAttribute('id');
        Options.set( "migrated_"+id, true, typeof(true));
    }
};

// ********************************************************************************************* //

/**
 * If we are detached and the main Firefox window closes, also close the matching Firebug window.
 */
function shutdownFirebug()
{
    try
    {
        if (Firebug.isDetached())
            Firebug.chrome.close();
    }
    catch (exc)
    {
        window.dump("Firebug.shutdownFirebug EXCEPTION: " + exc + "\n");
    }

    Firebug.shutdown();
}

if (preFirebugKeys)
{
    // Add back the preLoad properties
    preFirebugKeys.forEach(function copyProps(key)
    {
        Firebug[key] = PreFirebug[key];
    });
}

// ********************************************************************************************* //
// Registration

Firebug.Firefox = Firefox;
Firebug.Domplate = Domplate;
Firebug.ChromeFactory = ChromeFactory;

return Firebug;

// ********************************************************************************************* //
});
