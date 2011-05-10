/* See license.txt for terms of usage */

/**
 * Firebug module can depend only on modules that don't use the 'Firebug' namespace.
 * So, be careful before you create a new dependency.
 */
define([
    "firebug/lib",
    "firebug/domplate",
    "firebug/lib/options",
    "firebug/lib/locale",
    "firebug/lib/events",
],
function(FBL, Domplate, Options, Locale, Events) {

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

const firebugURLs =  // TODO chrome.js
{
    main: "http://www.getfirebug.com",
    FAQ: "http://getfirebug.com/wiki/index.php/FAQ",
    docs: "http://www.getfirebug.com/docs.html",
    keyboard: "http://getfirebug.com/wiki/index.php/Keyboard_and_Mouse_Shortcuts",
    discuss: "http://groups.google.com/group/firebug",
    issues: "http://code.google.com/p/fbug/issues/list",
    donate: "http://getfirebug.com/getinvolved"
};

const scriptBlockSize = 20;

const PLACEMENT_NONE = 0;
const PLACEMENT_INBROWSER = 1;
const PLACEMENT_DETACHED = 2;
const PLACEMENT_MINIMIZED = 3;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

var modules = [];
var activeContexts = [];
var activableModules = [];
var extensions = [];
var panelTypes = [];
var earlyRegPanelTypes = []; // See Firebug.registerPanelType for more info
var reps = [];
var defaultRep = null;
var defaultFuncRep = null;
var menuItemControllers = [];
var panelTypeMap = {};
var deadWindows = [];
var deadWindowTimeout = 0;
var clearContextTimeout = 0;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

try
{
    // Register default Firebug string bundle (yet before domplate templates).
    Locale.registerStringBundle("chrome://firebug/locale/firebug.properties");
}
catch (exc)
{
    dump("Register default string bundle FAILS: "+exc+"\n");
}

// ********************************************************************************************* //

/**
 * @class Represents the main Firebug application object. An instance of this object is
 * created for each browser window (browser.xul).
 */
window.Firebug =
{
    version: "1.6",

    dispatchName: "Firebug",
    modules: modules,
    panelTypes: panelTypes,
    earlyRegPanelTypes: earlyRegPanelTypes,
    uiListeners: [],
    reps: reps,

    stringCropLength: 50,

    tabBrowser: null,
    originalChrome: FirebugChrome,
    chrome: FirebugChrome,

    isInitialized: false,
    migrations: {},

    // Custom stylesheets registered by extensions.
    stylesheets: [],

    // xxxHonza: hack
    Options: Options,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        // This says how much time was necessary to load Firebug overlay (+ all script tags).
        FBTrace.timeEnd("SCRIPTTAG_TIME");

        // Measure the entire Firebug initialiation time.
        FBTrace.time("INITIALIZATION_TIME");

        if (FBTrace.sysout && (!FBL || !FBL.initialize))
        {
            FBTrace.sysout("Firebug is broken, FBL incomplete, if the last function is QI, " +
                "check lib.js:", FBL);
        }
        else if (FBTrace.DBG_INITIALIZE)
        {
            FBTrace.sysout("firebug.initialize FBL: " + FBL);
        }

        // Till now all registered panels have been inserted into earlyRegPanelTypes.
        var tempPanelTypes = earlyRegPanelTypes;
        earlyRegPanelTypes = null;
        Firebug.completeInitialize(tempPanelTypes);
    },

    completeInitialize: function(tempPanelTypes)
    {
        FBL.initialize();  // non require.js modules

        // Append early registered panels at the end.
        panelTypes.push.apply(panelTypes, tempPanelTypes);

        const tabBrowser = FBL.$("content");
        if (tabBrowser) // TODO Firebug.TabWatcher
        {
            if (FBTrace.DBG_INITIALIZE)
                FBTrace.sysout("firebug.initialize has a tabBrowser");
            this.tabBrowser = tabBrowser;
        }
        else
        {
            throw new Error("Firebug ERROR no 'content' in "+document.location);
        }

        Firebug.Options.addListener(this);

        this.isInitialized = true;

        Events.dispatch(modules, "initialize", []);

        // This is the final of Firebug initialization.
        FBTrace.timeEnd("INITIALIZATION_TIME");
    },

    getVersion: function()
    {
        if (!this.fullVersion)
            this.fullVersion = this.loadVersion(versionURL);

        return this.fullVersion;
    },

    loadVersion: function(versionURL)
    {
        var content = FBL.getResource(versionURL);
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
        var attributes = ["label", "tooltiptext", "aria-label"];
        for (var i=0; i<elements.length; i++)
        {
            for(var j=0; j<attributes.length; j++)
            {
                if (elements[i].hasAttribute(attributes[j]))
                    Locale.internationalize(elements[i], attributes[j]);
            }
        }

        // Translated strings for this label don't include "..." at the end.
        var node = doc.getElementById("menu_openFirebugEditors");
        if (node)
        {
            var label = node.getAttribute("label") + "...";
            node.setAttribute("label", label);
        }

        node = doc.getElementById("menu_configureEditors");
        if (node)
        {
            var label = node.getAttribute("label") + "...";
            node.setAttribute("label", label);
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

        var version = this.getVersion(); // TODO chrome.js
        if (version)
        {
            this.version = version;
            FBL.$('fbStatusBar').setAttribute("tooltiptext", "Firebug " + version);

            // At this moment there is more 'Firebug About' items (in the icon and tools menu).
            var nodes = document.querySelectorAll(".firebugAbout");
            for (var i=0; i<nodes.length; i++)
            {
                var node = nodes[i];
                var aboutLabel = node.getAttribute("label");
                node.setAttribute("label", aboutLabel + " " + version);
            }
        }

        Events.dispatch(menuItemControllers, "initialize", []);  // TODO chrome.js

        // In the case that the user opens firebug in a new window but then closes Firefox window, we don't get the
        // quitApplicationGranted event (platform is still running) and we call shutdown (Firebug isDetached).
        window.addEventListener('unload', shutdownFirebug, false);

        Firebug.TabWatcher.initialize(this);
        Firebug.TabWatcher.addListener(this);

        // Initial activation of registered panel types. All panel -> module dependencies
        // should be defined now (in onActivationChange).  Must be called after Firebug.TabWatcher is ready.
        Firebug.PanelActivation.activatePanelTypes(panelTypes);

        // Tell the modules the UI is up.
        Events.dispatch(modules, "initializeUI", [detachArgs]);
    },

    /**
     * called in browser when Firefox closes and in externalMode when fbs gets quitApplicationGranted.
     */
    shutdown: function()
    {
        this.shutdownUI();

        Events.dispatch(modules, "shutdown");

        this.closeDeadWindows();

        Firebug.Options.shutdown();
        Firebug.Options.removeListener(this);

        // xxxHonza: Firebug is registered as a listener within bti/tools.js
        // I think it's wrong, should be done in the same modules as addListener.
        Firebug.ToolsInterface.browser.removeListener(Firebug);
        Firebug.ToolsInterface.browser.removeListener(Firebug.ToolsInterface.JavaScript);//javascripttool.js
        Firebug.ToolsInterface.browser.removeListener(Firebug.ToolsAdapter);//firebugadapter.js

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.shutdown exited ");
    },

    shutdownUI: function()  // TODO chrome.js
    {
        window.removeEventListener('unload', shutdownFirebug, false);

        Firebug.TabWatcher.destroy();

        // Remove the listener after the Firebug.TabWatcher.destroy() method is called so,
        // destroyContext event is properly dispatched to the Firebug object and
        // consequently to all registered modules.
        Firebug.TabWatcher.removeListener(this);

        Events.dispatch(modules, "disable", [FirebugChrome]);
    },

    // ***************************************************************************************** //
    // TODO this entire section to XULWindow

    getSuspended: function()  // TODO XULWindow
    {
        var suspendMarker = FBL.$("firebugStatus");
        if (suspendMarker.hasAttribute("suspended"))
            return suspendMarker.getAttribute("suspended");
        return null;
    },

    setSuspended: function(value)  // TODO XULWindow
    {
        var suspendMarker = FBL.$("firebugStatus");
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.setSuspended to "+value+". Browser: " +
                Firebug.chrome.window.document.title);

        if (value)
            suspendMarker.setAttribute("suspended", value);
        else
            suspendMarker.removeAttribute("suspended");

        Firebug.StartButton.resetTooltip();
    },

    toggleSuspend: function()  // TODO XULWindow
    {
        // getSuspended returns non-null value if Firebug is suspended.
        if (this.getSuspended())
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

    suspend: function()  // dispatch suspendFirebug to all windows
    {
        if(Firebug.rerun)
            return;

        Firebug.suspendFirebug();
    },

    suspendFirebug: function() // dispatch onSuspendFirebug to all modules
    {

        var cancelSuspend = Events.dispatch2(activableModules, 'onSuspendingFirebug', []);
        if (cancelSuspend)
            return;

        this.setSuspended("suspending");

        var cancelSuspend = Events.dispatch2(activableModules, 'onSuspendFirebug', [Firebug.currentContext]);  // TODO no context arg

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
        Events.dispatch(activableModules, 'onResumeFirebug', [Firebug.currentContext]);// TODO no context arg
        this.setSuspended(null);
    },

    getURLsForAllActiveContexts: function()
    {
        var contextURLSet = [];  // create a list of all unique activeContexts
        Firebug.TabWatcher.iterateContexts( function createActiveContextList(context)
        {
            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("context "+context.getName());

            try
            {
                var cw = context.window;
                if (cw)
                {
                    if (cw.closed)
                        url = "about:closed";
                    else
                        if ('location' in cw)
                            var url = cw.location.toString();
                        else
                            var url = context.getName();
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
            FBTrace.sysout("active contexts urls "+contextURLSet.length);

        return contextURLSet;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Dead Windows  XXXjjb this code is not used by 1.4, external placement.

    killWindow: function(browser, chrome)
    {
        deadWindows.push({browser: browser, chrome: chrome});
        deadWindowTimeout = setTimeout(function() { Firebug.closeDeadWindows(); }, 3000);
    },

    rescueWindow: function(browser)
    {
        for (var i = 0; i < deadWindows.length; ++i)
        {
            if (deadWindows[i].browser == browser)
            {
                deadWindows.splice(i, 1);
                if (FBTrace.DBG_WINDOWS)
                    FBTrace.sysout("rescued "+browser.currentURI.spec);
                break;
            }
        }
    },

    closeDeadWindows: function()
    {
        for (var i = 0; i < deadWindows.length; ++i)
            deadWindows[i].chrome.close();

        deadWindows = [];
        deadWindowTimeout = 0;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Registration

    /**
     * Set a default value for a preference into the firebug preferences list.
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

        if (FBTrace.DBG_INITIALIZE)
        {
            for (var i = 0; i < arguments.length; ++i)
                FBTrace.sysout("registerModule "+arguments[i].dispatchName);
        }
    },

    unregisterModule: function()
    {
        for (var i = 0; i < arguments.length; ++i)
            FBL.remove(modules, arguments[i]);
    },

    registerActivableModule: function()
    {
        activableModules.push.apply(activableModules, arguments);
        this.registerModule.apply(this, arguments);
    },

    registerExtension: function()  // TODO remove
    {
        extensions.push.apply(extensions, arguments);

        for (var i = 0; i < arguments.length; ++i)
            Firebug.TabWatcher.addListener(arguments[i]);

        for (var j = 0; j < arguments.length; j++)
            Firebug.uiListeners.push(arguments[j]);
    },

    unregisterExtension: function()  // TODO remove
    {
        for (var i = 0; i < arguments.length; ++i)
        {
            Firebug.TabWatcher.removeListener(arguments[i]);
            FBL.remove(Firebug.uiListeners, arguments[i]);
            FBL.remove(extensions, arguments[i])
        }
    },

    registerUIListener: function()
    {
        for (var j = 0; j < arguments.length; j++)
            Firebug.uiListeners.push(arguments[j]);
    },

    unregisterUIListener: function()
    {
        for (var i = 0; i < arguments.length; ++i)
            FBL.remove(Firebug.uiListeners, arguments[i]);
    },

    registerPanel: function()
    {
        // In order to keep built in panels (like Console, Script...) be the first one
        // and insert all panels coming from extension at the end, catch any early registered
        // panel (i.e. before FBL.initialize is called, such as YSlow) in a temp array
        // that is appended at the end as soon as FBL.initialize is called.
        if (earlyRegPanelTypes)
            earlyRegPanelTypes.push.apply(earlyRegPanelTypes, arguments);
        else
            panelTypes.push.apply(panelTypes, arguments);

        for (var i = 0; i < arguments.length; ++i)
            panelTypeMap[arguments[i].prototype.name] = arguments[i];

        if (FBTrace.DBG_INITIALIZE)
            for (var i = 0; i < arguments.length; ++i)
                FBTrace.sysout("registerPanel "+arguments[i].prototype.name+"\n");
    },

    unregisterPanel: function(panelType)
    {
        for (var i = 0; i < panelTypes.length; ++i)
        {
            if (panelTypes[i] == panelType)
            {
                panelTypes.splice(i, 1);
                break;
            }
        }

        delete panelTypeMap[panelType.prototype.name];
    },

    registerRep: function()
    {
        reps.push.apply(reps, arguments);
    },

    unregisterRep: function()
    {
        for (var i = 0; i < arguments.length; ++i)
            FBL.remove(reps, arguments[i]);
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

    /**
     * Allows registering of custom stylesheet coming from extension. The stylesheet is then
     * used automatially thorough Firebug UI.
     * @param {Object} styleURI URI of the stylesheet.
     */
    registerStylesheet: function(styleURI)
    {
        this.stylesheets.push(styleURI);
    },

    registerMenuItem: function(menuItemController)
    {
        FBTrace.sysout("Firebug.registerMenuItem");
        menuItemControllers.push(menuItemController);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    getPref: function()
    {
        // TODO deprecated
        return Firebug.Options.getPref.apply(Firebug.Options, arguments);
    },

    setPref: function()
    {
        // TODO deprecated
        return Firebug.Options.setPref.apply(Firebug.Options, arguments);
    },

    clearPref: function()
    {
        // TODO deprecated
        return Firebug.Options.clearPref.apply(Firebug.Options, arguments);
    },

    prefDomain: "extensions.firebug",

    updateOption: function(name, value)
    {
        // Distribute to the current chrome.
        Firebug.chrome.updateOption(name, value);

        // If Firebug is detached distribute also into the in-browser chrome.
        if (Firebug.chrome != Firebug.originalChrome)
            Firebug.originalChrome.updateOption(name, value);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    shouldIgnore: function(objectChromeView)
    {
        if (objectChromeView)
        {
            var contentView = FBL.getContentView(objectChromeView);
            return (contentView && contentView.firebugIgnore);
        }
        // else don't ignore things we don't understand
    },

    setIgnored: function(objectChromeView)
    {
        if (objectChromeView)
        {
            var contentView = FBL.getContentView(objectChromeView);
            if (contentView)
                contentView.firebugIgnore = true;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Browser Bottom Bar

    // TODO XULWindow
    showBar: function(show)
    {
        var browser = Firebug.chrome.getCurrentBrowser();

        if (FBTrace.DBG_WINDOWS || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("showBar("+show+") for browser "+browser.currentURI.spec+
                " Firebug.currentContext "+Firebug.currentContext);

        var contentBox = Firebug.chrome.$("fbContentBox");
        var contentSplitter = Firebug.chrome.$("fbContentSplitter");

        var shouldShow = show/* && !Firebug.isDetached()*/;
        contentBox.setAttribute("collapsed", !shouldShow);

        if(!show)
            Firebug.Inspector.inspectNode(null);

        if (contentSplitter)
            contentSplitter.setAttribute("collapsed", !shouldShow);

        //xxxHonza: should be removed.
        Events.dispatch(Firebug.uiListeners, show ? "showUI" : "hideUI",
            [browser, Firebug.currentContext]);

        // Sync panel state after the showUI event is dispatched. syncPanel method calls
        // Panel.show method, which expects the active context to be already registered.
        if (show)
            Firebug.chrome.syncPanel();
        else
            Firebug.chrome.selectPanel(); // select null causes hide() on selected
    },

    closeFirebug: function(userCommand)  // this is really deactivate
    {
        var browser = FirebugChrome.getCurrentBrowser();

        Firebug.TabWatcher.unwatchBrowser(browser, userCommand);
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
        var browser = FirebugChrome.getCurrentBrowser();

        if (panelName)
            Firebug.chrome.selectPanel(panelName);

        if (!browser.showFirebug) // then we are not debugging the selected tab
        {
            // user requests debugging on this tab
            var created = Firebug.TabWatcher.watchBrowser(browser);  // create a context for this page
            if (!created)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("Rejected page should explain to user!");
                return false;
            }

            if (FBTrace.DBG_ACTIVATION)
            {
                var context = Firebug.TabWatcher.getContextByWindow(browser.contentWindow);
                FBTrace.sysout("toggleBar created context "+(browser.showFirebug?
                    "ok":"ERROR no showFirebug!")+((context === Firebug.currentContext)?
                    "current":"ERROR context not current!"));
            }
            forceOpen = true;  // Be sure the UI is open for a newly created context
        }

        if (Firebug.isDetached()) // if we are out of the browser focus the window
            Firebug.chrome.focus();
        else if (Firebug.openInWindow)
            this.detachBar(context);
        else if (Firebug.isMinimized()) // toggle minimize
            Firebug.unMinimize();
        else if (!forceOpen)  // else isInBrowser
            Firebug.minimizeBar();

        return true;
     },

    minimizeBar: function()  // just pull down the UI, but don't deactivate the context
    {
        if (Firebug.isDetached())  // TODO disable minimize on externalMode
        {
            // TODO reattach
            Firebug.toggleDetachBar(false, false);
            Firebug.chrome.focus() ;
        }
        else // inBrowser -> minimized
        {
            Firebug.setPlacement("minimized");
            this.showBar(false);
        }
    },

    unMinimize: function()
    {
        this.updateActiveContexts(Firebug.currentContext);
        Firebug.setPlacement("inBrowser");
        Firebug.showBar(true);
    },

    onShowDetachTooltip: function(tooltip)
    {
        tooltip.label = Firebug.isDetached() ? Locale.$STR("firebug.AttachFirebug") :
            Locale.$STR("firebug.DetachFirebug");
        return true;
    },

    toggleDetachBar: function(forceOpen, reopenInBrowser)  // detached -> closed; inBrowser -> detached TODO reattach
    {
        if (!forceOpen && Firebug.isDetached())  // detached -> minimized
        {
            setTimeout(function delayMinimize()
            {
                if (reopenInBrowser)
                    Firebug.unMinimize();
                else
                    Firebug.minimizeBar();
            }, 200);
            Firebug.chrome.close();
        }
        else
            this.detachBar(Firebug.currentContext);
    },

    closeDetachedWindow: function(userCommands)
    {
        Firebug.showBar(false);

        if (Firebug.currentContext)
            Firebug.TabWatcher.unwatchBrowser(Firebug.currentContext.browser, userCommands);
        // else the user closed Firebug external window while not looking at a debugged web page.

        Firebug.StartButton.resetTooltip();
    },

    setChrome: function(newChrome, newPlacement)
    {
        var oldChrome = Firebug.chrome;
        Firebug.dispatchToPanels("detach", [oldChrome, newChrome]);
        Firebug.chrome = newChrome;
        Firebug.setPlacement(newPlacement);

        // reattach all contexts to the new chrome
        Firebug.TabWatcher.iterateContexts(function reattach(context)
        {
            context.reattach(oldChrome, newChrome);

            Firebug.reattachContext(context.browser, context);
        });
    },

    detachBar: function(context)
    {
        if (!context)
        {
            var browser = Firebug.chrome.getCurrentBrowser();
            var created = Firebug.TabWatcher.watchBrowser(browser);  // create a context for this page
            if (!created)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("Firebug.detachBar, no context in "+window.location);
                return null;
            }
            context = Firebug.TabWatcher.getContextByWindow(browser.contentWindow);
        }

        if (Firebug.isDetached())  // can be set true attachBrowser
        {
            Firebug.chrome.focus();
            return null;
        }

        this.showBar(false);  // don't show in browser.xul now

        Firebug.chrome.setFirebugContext(context);  // make sure the Firebug.currentContext agrees with context

        this.setPlacement("detached");  // we'll reset it in the new window, but we seem to race with code in this window.

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.detachBar opening firebug.xul for context "+Firebug.currentContext.getName() );

        var args = {
            FBL: FBL,
            Firebug: this,
            browser: context.browser,
        };
        var win = FBL.openWindow("Firebug", "chrome://firebug/content/firebug.xul", "", args);

        return win;
    },

    syncBar: function()  // show firebug if we should
    {
        var browser = FirebugChrome.getCurrentBrowser();
        this.showBar(browser && browser.showFirebug);  // implicitly this is operating in the chrome of browser.xul
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // deprecated

    resetAllOptions: function(confirm)
    {
        Firebug.Options.resetAllOptions(confirm);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
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
        return panelType.prototype.title ? panelType.prototype.title
            : Locale.$STR("Panel-"+panelType.prototype.name);
    },

    getPanelTooltip: function(panelType)
    {
        return panelType.prototype.tooltip ? panelType.prototype.tooltip
            : this.getPanelTitle(panelType);
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
            if (panelType.prototype.parentPanel && (panelType.prototype.parentPanel == mainPanel.name) )
                resultTypes.push(panelType);
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
     * Gets an object containing the state of the panel from the last time
     * it was displayed before one or more page reloads.
     * The 'null' return here is a too-subtle signal to the panel code in bindings.xml.
     * Note that panel.context may not have a persistedState, but in addition the persisted
     * state for panel.name may be null.
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

    reattachContext: function(browser, context)
    {
        Events.dispatch(modules, "reattachContext", [browser, context]);
    },

    eachPanel: function(callback)
    {
        Firebug.TabWatcher.iterateContexts(function iteratePanels(context)
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
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
                    if (FBTrace.DBG_DOM)
                        FBTrace.sysout("getRep type: "+type+" object: "+object, rep);
                    return rep;
                }
            }
            catch (exc)
            {
                if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("firebug.getRep FAILS: "+ exc, exc);
                    FBTrace.sysout("firebug.getRep reps["+i+"/"+reps.length+"]: "+(typeof(reps[i])), reps[i]);
                }
            }
        }

        if (FBTrace.DBG_DOM)
            FBTrace.sysout("getRep default type: "+type+" object: "+object, rep);

        return (type == 'function')?defaultFuncRep:defaultRep;
    },

    getRepObject: function(node)
    {
        var target = null;
        for (var child = node; child; child = child.parentNode)
        {
            if (FBL.hasClass(child, "repTarget"))
                target = child;

            if (child.repObject)
            {
                if (!target && FBL.hasClass(child, "repIgnore"))
                    break;
                else
                    return child.repObject;
            }
        }
    },

    /*
     * The child node that has a repObject
     */
    getRepNode: function(node)
    {
        for (var child = node; child; child = child.parentNode)
        {
            if (child.repObject)
                return child;
        }
    },

    getElementByRepObject: function(element, object)
    {
        for (var child = element.firstChild; child; child = child.nextSibling)
        {
            if (child.repObject == object)
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    visitWebsite: function(which)
    {
        FBL.openNewTab(firebugURLs[which]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsISupports

    QueryInterface : function(iid)
    {
        if (iid.equals(nsISupports))
        {
            return this;
        }

        throw Components.results.NS_NOINTERFACE;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
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
            FBTrace.sysout("Firebug.setPlacement from "+Firebug.getPlacement()+" to "+toPlacement+" with chrome "+Firebug.chrome.window.location);

        for (var i = 0; i < Firebug.placements.length; i++)
        {
            if (toPlacement == Firebug.placements[i])
            {
                if (Firebug.placement != i) // then we are changing the value
                {
                    Firebug.placement = i;
                    delete Firebug.previousPlacement;
                    Firebug.Options.set("previousPlacement", Firebug.placement);
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
            Firebug.previousPlacement = Firebug.Options.get("previousPlacement");

        return (Firebug.previousPlacement && (Firebug.previousPlacement == PLACEMENT_MINIMIZED) )
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Firebug.TabWatcher Listener

    getContextType: function()
    {
        return Firebug.TabContext;
    },

    shouldShowContext: function(context)
    {
        return Events.dispatch2(modules, "shouldShowContext", [context]);
    },

    shouldCreateContext: function(browser, url, userCommands)
    {
        return Events.dispatch2(modules, "shouldCreateContext", [browser, url, userCommands]);
    },

    shouldNotCreateContext: function(browser, url, userCommands)
    {
        return Events.dispatch2(modules, "shouldNotCreateContext", [browser, url, userCommands]);
    },

    initContext: function(context, persistedState)  // called after a context is created.
    {
        context.panelName = context.browser.panelName;
        if (context.browser.sidePanelNames)
            context.sidePanelNames = context.browser.sidePanelNames;

        if (FBTrace.DBG_ERRORS && !context.sidePanelNames)
            FBTrace.sysout("firebug.initContext sidePanelNames:",context.sidePanelNames);

        Events.dispatch(modules, "initContext", [context, persistedState]);

        this.updateActiveContexts(context); // a newly created context is active

        Firebug.chrome.setFirebugContext(context); // a newly created context becomes the default for the view

        if (deadWindowTimeout)
            this.rescueWindow(context.browser); // if there is already a window, clear showDetached.
    },

    updateActiveContexts: function(context) // this should be the only method to call suspend and resume.
    {
        if (context)  // either a new context or revisiting an old one
        {
            if (Firebug.getSuspended())
                Firebug.resume();  // This will cause onResumeFirebug for every context including this one.
        }
        else // this browser has no context
        {
            Firebug.suspend();
        }

        Firebug.StartButton.resetTooltip();
    },

    /*
     * To be called from Firebug.TabWatcher only, see selectContext
     */
    showContext: function(browser, context)  // Firebug.TabWatcher showContext. null context means we don't debug that browser
    {
        if (clearContextTimeout)
        {
            clearTimeout(clearContextTimeout);
            clearContextTimeout = 0;
        }

        Firebug.chrome.setFirebugContext(context); // the context becomes the default for its view
        this.updateActiveContexts(context);  // resume, after setting Firebug.currentContext

        Events.dispatch(modules, "showContext", [browser, context]);  // tell modules we may show UI

        // user wants detached but we are not yet
        if (Firebug.openInWindow && !Firebug.isDetached())
        {
            if (context && !Firebug.isMinimized()) // don't detach if it's minimized 2067
                this.detachBar(context);  //   the placement will be set once the external window opens
            else  // just make sure we are not showing
                this.showBar(false);

            return;
        }

        // previous browser.xul had placement minimized
        if (Firebug.openMinimized() && !Firebug.isMinimized())
        {
            this.minimizeBar();
            return;
        }

        if (Firebug.isMinimized())
            this.showBar(false);  // don't show, we are minimized
        else if (Firebug.isDetached())
            this.syncResumeBox(context);
        else  // inBrowser
            this.showBar(context?true:false);

    },

    syncResumeBox: function(context)
    {
        var contentBox = Firebug.chrome.$('fbContentBox');
        var resumeBox = Firebug.chrome.$('fbResumeBox');

        if (!resumeBox) // the showContext is being called before the reattachContext, we'll get a second showContext
            return;

        if (context)
        {
            FBL.collapse(contentBox, false);
            Firebug.chrome.syncPanel();
            FBL.collapse(resumeBox, true);
        }
        else
        {
            FBL.collapse(contentBox, true);
            FBL.collapse(resumeBox, false);
            Firebug.chrome.window.document.title = Locale.$STR("Firebug - inactive for current website");
        }
    },

    unwatchBrowser: function(browser)  // the context for this browser has been destroyed and removed
    {
        Firebug.updateActiveContexts(null);
    },

    // Either a top level or a frame, (interior window) for an exist context is seen by the tabWatcher.
    watchWindow: function(context, win)
    {
        for (var panelName in context.panelMap)
        {
            var panel = context.panelMap[panelName];
            panel.watchWindow(win);
        }

        Events.dispatch(modules, "watchWindow", [context, win]);
    },

    unwatchWindow: function(context, win)
    {
        for (var panelName in context.panelMap)
        {
            var panel = context.panelMap[panelName];
            panel.unwatchWindow(win);
        }
        Events.dispatch(modules, "unwatchWindow", [context, win]);
    },

    loadedContext: function(context)
    {
        if (!context.browser.currentURI)
            FBTrace.sysout("firebug.loadedContext problem browser ", context.browser);

        Events.dispatch(modules, "loadedContext", [context]);
    },

    destroyContext: function(context, persistedState, browser)
    {
        if (!context)  // then we are called just to clean up
            return;

        Events.dispatch(modules, "destroyContext", [context, persistedState]);

        if (Firebug.currentContext == context)
        {
            Firebug.chrome.clearPanels(); // disconnect the to-be-destroyed panels from the panelBar
            Firebug.chrome.setFirebugContext(null);  // Firebug.currentContext is about to be destroyed
        }

        var browser = context.browser;
        // Persist remnants of the context for restoration if the user reloads
        browser.panelName = context.panelName;
        browser.sidePanelNames = context.sidePanelNames;

        // next the context is deleted and removed from the Firebug.TabWatcher, we clean up in unWatchBrowser
    },

    onSourceFileCreated: function(context, sourceFile)
    {
        Events.dispatch(modules, "onSourceFileCreated", [context, sourceFile]);
    },

    //*********************************************************************************************

    /*
     * This method syncs the UI to a context
     * @param context to become the active and visible context
     */
    selectContext: function(context)
    {
        this.showContext(context.browser, context);
    },

    //*********************************************************************************************

    getTabForWindow: function(aWindow)  // TODO move to FBL, only used by getTabIdForWindow
    {
        aWindow = FBL.getRootWindow(aWindow);

        if (!aWindow || !this.tabBrowser || !this.tabBrowser.getBrowserIndexForDocument)
            return null;

        try {
            var targetDoc = aWindow.document;

            var tab = null;
            var targetBrowserIndex = this.tabBrowser.getBrowserIndexForDocument(targetDoc);

            if (targetBrowserIndex != -1)
            {
                tab = this.tabBrowser.tabContainer.childNodes[targetBrowserIndex];
                return tab;
            }
        } catch (ex) {}

        return null;
    },

    getTabIdForWindow: function(win)  // TODO move to FBL, rename to getIdForWindow, at 1.7 reimplement with bug 534149
    {
        var tab = this.getTabForWindow(win);
        return tab ? tab.linkedPanel : null;
    },

    focusBrowserTab: function(win)    // TODO move to FBL
    {
        this.tabBrowser.selectedTab = this.getTabForWindow(win);
        this.chrome.focus();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // FBTest

    // Expose our test list to the FBTest console for automated testing.
    onGetTestList: function(testLists)
    {
        testLists.push({
            extension: "Firebug",
            testListURL: "http://getfirebug.com/tests/content/testlists/firebug1.8.html"
        });
    }
};

// ************************************************************************************************
// API for Greasemonkey, Jetpack and other Firefox extensions
/*
 * @param global wrapped up global: outer window or sandbox
 * @return a |console| object for the window
 */
Firebug.getConsoleByGlobal = function getConsoleByGlobal(global)
{
    try
    {
        var context = Firebug.TabWatcher.getContextByGlobal(global);
        if (context)
        {
            var handler = Firebug.Console.injector.getConsoleHandler(context, global);
            if (handler)
            {
                FBTrace.sysout("Firebug.getConsoleByGlobal "+handler.console+" for "+context.getName(), handler);
                return handler.console;
            }
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Firebug.getConsoleByGlobal FAILS, no handler for global "+global+" "+FBL.safeGetWindowLocation(global), global);
        }
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("Firebug.getConsoleByGlobal FAILS, no context for global "+global, global);
    }
    catch(exc)
    {
        if(FBTrace.DBG_ERRORS)
            FBTrace.sysout("Firebug.getConsoleByGlobal FAILS "+exc, exc);
    }
}

//************************************************************************************************

/**
 * Support for listeners registration. This object also extended by Firebug.Module so,
 * all modules supports listening automatically. Notice that array of listeners
 * is created for each intance of a module within initialize method. Thus all derived
 * module classes must ensure that Firebug.Module.initialize method is called for the
 * super class.
 */
Firebug.Listener = function()
{
    // The array is created when the first listeners is added.
    // It can't be created here since derived objects would share
    // the same array.
    this.fbListeners = null;
}
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
        FBL.remove(this.fbListeners, listener);  // if this.fbListeners is null, remove is being called with no add
    }
};

// ************************************************************************************************

/**
 * @module Base class for all modules. Every derived module object must be registered using
 * <code>Firebug.registerModule</code> method. There is always one instance of a module object
 * per browser window.
 */
Firebug.Module = FBL.extend(new Firebug.Listener(),
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
     * Called after a context is detached to a separate window;
     */
    reattachContext: function(browser, context)
    {
    },

    /**
     * Called when a context is destroyed. Module may store info on persistedState for reloaded pages.
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    updateOption: function(name, value)
    {
    },

    getObjectByURL: function(context, url)
    {
    },
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // intermodule dependency

    // caller needs module. win maybe context.window or iframe in context.window.
    // true means module is ready now, else getting ready
    isReadyElsePreparing: function(context, win)
    {
    },
});

//************************************************************************************************

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

// ************************************************************************************************

/**
 * @panel Base class for all panels. Every derived panel must define a constructor and
 * register with <code>Firebug.registerPanel</code> method. An instance of the panel
 * object is created by the framework for each browser tab where Firebug is activated.
 */
Firebug.Panel = FBL.extend(new Firebug.Listener(),
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

        FBL.setClass(this.panelNode, "panelNode panelNode-"+this.name+" contextUID="+context.uid);

        // Load persistent content if any.
        var persistedState = Firebug.getPanelState(this);
        if (persistedState)
        {
            this.persistContent = persistedState.persistContent;
            if (this.persistContent && persistedState.panelNode)
                this.loadPersistedContent(persistedState);
        }

        doc.body.appendChild(this.panelNode);

        // Update panel's tab in case the break-on-next (BON) is active.
        var shouldBreak = this.shouldBreakOnNext();
        Firebug.Breakpoint.updatePanelTab(this, shouldBreak);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.initialize panelNode for "+this.name+"\n");

        this.initializeNode(this.panelNode);
    },

    destroy: function(state) // Panel may store info on state
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.destroy panelNode for "+this.name+"\n");

        if (this.panelNode)
        {
            if (this.persistContent)
                this.savePersistedContent(state);
            else
                delete state.persistContent;

            delete this.panelNode.ownerPanel;
        }

        this.destroyNode();

        FBL.clearDomplate(this.panelNode);
    },

    savePersistedContent: function(state)
    {
        state.panelNode = this.panelNode;
        state.persistContent = this.persistContent;
    },

    loadPersistedContent: function(persistedState)
    {
        // move the nodes from the persistedState to the panel
        while (persistedState.panelNode.firstChild)
            this.panelNode.appendChild(persistedState.panelNode.firstChild);

        FBL.scrollToBottom(this.panelNode);
    },

    // called when a panel in one XUL window is about to disappear to later reappear another XUL window.
    detach: function(oldChrome, newChrome)
    {
    },

    reattach: function(doc)  // this is how a panel in one window reappears in another window; lazy called
    {
        this.document = doc;

        if (this.panelNode)
        {
            this.panelNode = doc.adoptNode(this.panelNode, true);
            this.panelNode.ownerPanel = this;
            doc.body.appendChild(this.panelNode);
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

    watchWindow: function(win)
    {
    },

    unwatchWindow: function(win)
    {
    },

    updateOption: function(name, value)
    {
    },

    /*
     * Called after chrome.applyTextSize
     * @param zoom: ratio of current size to normal size, eg 1.5
     */
    onTextSizeChange: function(zoom)
    {

    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    /**
     * Toolbar helpers
     */
    showToolbarButtons: function(buttonsId, show)
    {
        try
        {
            var buttons = Firebug.chrome.$(buttonsId);
            FBL.collapse(buttons, !show);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("firebug.Panel showToolbarButtons FAILS "+exc, exc);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

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
        if (!object)
            object = this.getDefaultLocation();
        if (!object)
            object = null;  // not undefined.

        if ( !this.location || (object != this.location) )  // if this.location undefined, may set to null
        {
            if (FBTrace.DBG_PANELS)
                FBTrace.sysout("navigate "+this.name+" to location "+object, object);

            this.location = object;
            this.updateLocation(object);

            Events.dispatch(Firebug.uiListeners, "onPanelNavigate", [object, this]);
        }
        else
        {
            if (FBTrace.DBG_PANELS)
                FBTrace.sysout("navigate skipped for panel "+this.name+" when object "+object+
                    " vs this.location="+this.location, {object: object, location: this.location});
        }
    },

    /*
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

    /*
     * Firebug wants to show an object to the user and this panel has the best supportsObject() result for the object.
     * If the panel displays a container for objects of this type, it should set this.selectedObject = object
     */
    updateSelection: function(object)
    {
    },

    /*
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
            Firebug.Search.searchOptionMenu("search.Case Sensitive", "searchCaseSensitive")
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
        function compare(a, b) {
            var locA = self.getObjectDescription(a);
            var locB = self.getObjectDescription(b);
            if(locA.path > locB.path)
                return 1;
            if(locA.path < locB.path)
                return -1;
            if(locA.name > locB.name)
                return 1;
            if(locA.name < locB.name)
                return -1;
            return 0;
        }
        var allLocs = this.getLocationList().sort(compare);
        for (var curPos = 0; curPos < allLocs.length && allLocs[curPos] != this.location; curPos++);

        function transformIndex(index) {
            if (reverse) {
                // For the reverse case we need to implement wrap around.
                var intermediate = curPos - index - 1;
                return (intermediate < 0 ? allLocs.length : 0) + intermediate;
            } else {
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    // Called when "Options" clicked. Return array of
    // {label: 'name', nol10n: true,  type: "checkbox", checked: <value>, command:function to set <value>}
    getOptionsMenuItems: function()
    {
        return null;
    },

    /*
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

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
        return FBL.splitURLBase(url);
    },

    /*
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

    /*
     * If the panel supports source viewing, then return a SourceLink, else null
     * @param target an element from the panel under the mouse
     * @param object the realObject under the mouse
     */
    getSourceLink: function(target, object)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Support for Break On Next
    /*
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

//************************************************************************************************

/**
 * @panel This object represents a panel with two states: enabled/disabled. Such support
 * is important for panel that represents performance penalties and it's useful for the
 * user to have the option to disable them.
 *
 * All methods in this object are used on the prototype object (they reprent class methods)
 * and so, |this| points to the panel's prototype and *not* to the panel instance.
 */
Firebug.ActivablePanel = FBL.extend(Firebug.Panel,
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

        return Firebug.Options.get(this.name+".enableSites");
    },

    setEnabled: function(enable)
    {
        if (!this.name || !this.activable)
            return;

        Firebug.Options.set(this.name+".enableSites", enable);
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

// ************************************************************************************************

/**
 * @module Should be used by modules (Firebug specific task controllers) that supports
 * activation. An example of such 'activable' module can be the debugger module
 * {@link Firebug.Debugger}, which can be disabled in order to avoid performance
 * penalties (in cases where the user doesn't need a debugger for the moment).
 */
Firebug.ActivableModule = FBL.extend(Firebug.Module,
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
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
            FBL.remove(this.observers, observer);
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Firebug Activation

    onSuspendingFirebug: function()
    {
        // Called before any suspend actions. First caller to return true aborts suspend.
    },

    onSuspendFirebug: function()
    {
        // When the number of activeContexts decreases to zero. Modules should remove listeners, disable function that takes resources
    },

    onResumeFirebug: function()
    {
        // When the number of activeContexts increases from zero. Modules should undo the work done in onSuspendFirebug
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
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

// ************************************************************************************************

/*
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

        FBL.copyTextStyles(target, this.measureBox);
        target.ownerDocument.body.appendChild(this.measureBox);
    },

    getMeasuringElement: function()
    {
        return this.measureBox;
    },

    measureText: function(value)
    {
        this.measureBox.innerHTML = value ? FBL.escapeForSourceLine(value) : "m";
        return {width: this.measureBox.offsetWidth, height: this.measureBox.offsetHeight-1};
    },

    measureInputText: function(value)
    {
        value = value ? FBL.escapeForTextNode(value) : "m";
        if (!Firebug.showTextNodesWithWhitespace)
            value = value.replace(/\t/g,'mmmmmm').replace(/\ /g,'m');
        this.measureBox.innerHTML = value;
        return {width: this.measureBox.offsetWidth, height: this.measureBox.offsetHeight-1};
    },

    getBox: function(target)
    {
        var style = this.measureBox.ownerDocument.defaultView.getComputedStyle(this.measureBox, "");
        var box = FBL.getBoxFromStyles(style, this.measureBox);
        return box;
    },

    stopMeasuring: function()
    {
        this.measureBox.parentNode.removeChild(this.measureBox);
    }
};

// ************************************************************************************************

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

    unhighlightObject: function(object, context) {
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
        if (object.constructor && typeof(object.constructor) == 'function')
        {
            var ctorName = object.constructor.name;
            if (ctorName && ctorName != "Object")
                return ctorName;
        }

        var label = FBL.safeToString(object); // eg [object XPCWrappedNative [object foo]]

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

    getTooltip: function(object)
    {
        return null;
    },

    /*
    * Called by chrome.onContextMenu to build the context menu when the underlying object has this rep.
    * See also Panel for a similar function also called by onContextMenu
    * Extensions may monkey patch and chain off this call
    * @param object: the 'realObject', a model value, eg a DOM property
    * @param target: the HTML element clicked on.
    * @param context: the context, probably Firebug.currentContext
    * @return an array of menu items.
    */
    getContextMenuItems: function(object, target, context)
    {
        return [];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Convenience for domplates

    STR: function(name)
    {
        return Locale.$STR(name);
    },

    cropString: function(text)
    {
        return FBL.cropString(text);
    },

    cropMultipleLines: function(text, limit)
    {
        return FBL.cropMultipleLines(text, limit);
    },

    toLowerCase: function(text)
    {
        return text ? text.toLowerCase() : text;
    },

    plural: function(n)
    {
        return n == 1 ? "" : "s";
    }
})};

// ************************************************************************************************

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
        return Firebug.Options.get("migrated_"+id);
    },

    setMigrated: function(elt)
    {
        var id = elt.getAttribute('id');
        Firebug.Options.set( "migrated_"+id, true, typeof(true));
    },

}

// ************************************************************************************************

/*
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
        window.dump("shutdownFirebug FAILS: "+exc+"\n");
    }

    Firebug.shutdown();
}

// ********************************************************************************************* //
// Registration

Firebug.Domplate = Domplate;

return Firebug;

// ********************************************************************************************* //
});
