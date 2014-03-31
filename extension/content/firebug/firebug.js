/* See license.txt for terms of usage */

/**
 * Firebug module can depend only on modules that don't use the 'Firebug' namespace.
 * So, mainly only on library modules from 'firebug/lib/*'
 *
 * So, be careful before you create a new dependency.
 *
 * xxxHonza: dependency the following modules should be removed:
 *     "firebug/chrome/firefox"
 *     "firebug/trace/traceListener"
 */
define([
    "firebug/lib/lib",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/options",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/lib/css",
    "firebug/lib/array",
    "firebug/lib/http",
    "firebug/trace/traceListener",

    // xxxHonza: the following dependencies should be also removed.
    "firebug/chrome/firefox",
    "firebug/debugger/clients/clientFactory",
    "firebug/debugger/clients/grip",
    "firebug/console/commandLineExposed",
],
function(FBL, Obj, Domplate, Options, Locale, Events, Wrapper, Css, Arr, Http, TraceListener,
    Firefox, ClientFactory, Grip, CommandLineExposed) {

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
var tools = {};

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
    version: "2.0",

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
        //Options.addListener(this);

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
        var cancelSuspend = Events.dispatch2(modules, "onSuspendingFirebug", []);
        if (cancelSuspend)
            return;

        this.setSuspended("suspending");

        // TODO no context arg
        var cancelSuspend = Events.dispatch2(modules, "onSuspendFirebug",
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
        Events.dispatch(modules, "onResumeFirebug", [Firebug.currentContext]);
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
        Options.register(name, value);
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
        // xxxHonza: we should fire an event to avoid dependency on
        // TraceModule and TraceListener
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
        // xxxHonza: we should fire an event to avoid dependency on CommandLineExposed module.
        // Fix as soon as issue 6855 is done
        return CommandLineExposed.registerCommand(name, config);
    },

    unregisterCommand: function(name)
    {
        // xxxHonza: we should fire an event to avoid dependency on CommandLineExposed module.
        // Fix as soon as issue 6855 is done
        return CommandLineExposed.unregisterCommand(name);
    },

    registerClient: function(gripClass, gripType)
    {
        return ClientFactory.registerClient(gripClass, gripType);
    },

    unregisterClient: function(gripClass)
    {
        return ClientFactory.unregisterClient(gripClass);
    },

    registerDefaultClient: function(gripType)
    {
        return ClientFactory.registerDefaultClient(gripType);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // BTI Tools

    /**
     * Registers a new tool with Firebug. The tool is automatially instanciated by the
     * framework for each context. Just like it does for registered panels. The difference
     * between a panel and a tool is that tool doesn't have any UI, it's just an object
     * with direct access to the context and with the same life cycle as the context.
     *
     * @param {Object} toolName Unique tool name
     * @param {Object} tool Tool's constructor function.
     */
    registerTool: function(toolName, tool)
    {
        if (toolName)
            tools[toolName] = tool;
    },

    unregisterTool: function(tool)
    {
        // TODO
    },

    getToolType: function(name)
    {
        return tools[name];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    getPref: function()
    {
        // TODO deprecated
        return Options.getPref.apply(Options, arguments);
    },

    setPref: function()
    {
        // TODO deprecated
        return Options.setPref.apply(Options, arguments);
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

    getPanelTab: function(panelName)
    {
        var chrome = Firebug.chrome;

        var tab = chrome.$("fbPanelBar2").getTab(panelName);
        if (!tab)
            tab = chrome.$("fbPanelBar1").getTab(panelName);

        return tab;
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
    // Events

    dispatch: function(listeners, eventId, args)
    {
        Events.dispatch(listeners, eventId, args);
    },

    /**
     * Dispatch an event to given target. These event can be consumed by automation
     * system such as {@link FBTest}.
     */
    dispatchEvent: function(target, eventType, args)
    {
        var detail = {
            type: eventType,
            args: args
        };

        var event = new window.CustomEvent("FirebugEvent", {detail: detail});
        target.dispatchEvent(event);
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
        if (type == "object" && object instanceof String)
            type = "string";

        // Support for objects with dynamic type info. Those objects are mostly remote
        // objects coming from the back-end (server side).
        if (object instanceof Grip)
        {
            if (object && Obj.isFunction(object.getType))
                type = object.getType();
            else if (object && object["class"])
                type = object["class"];
        }

        for (var i = 0; i < reps.length; i++)
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
                // xxxHonza: should not be hidden, but there is so much of these logs...
                /*if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("firebug.getRep FAILS: "+ exc, exc);
                    FBTrace.sysout("firebug.getRep reps["+i+"/"+reps.length+"]: "+
                        (typeof(reps[i])), reps[i]);
                }*/
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

// xxxHonza: backward compatibility
Firebug.Firefox = Firefox;
Firebug.Options = Options;

return Firebug;

// ********************************************************************************************* //
});
