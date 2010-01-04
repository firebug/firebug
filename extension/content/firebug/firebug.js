/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const nsIPrefBranch = Ci.nsIPrefBranch;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const nsISupports = Ci.nsISupports;
const nsIFile = Ci.nsIFile;
const nsILocalFile = Ci.nsILocalFile;
const nsISafeOutputStream = Ci.nsISafeOutputStream;
const nsIURI = Ci.nsIURI;

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const DirService =  CCSV("@mozilla.org/file/directory_service;1", "nsIDirectoryServiceProvider");

const nsIPrefService = Ci.nsIPrefService;
const prefService = PrefService.getService(nsIPrefService);

const observerService = CCSV("@mozilla.org/observer-service;1", "nsIObserverService");
const categoryManager = CCSV("@mozilla.org/categorymanager;1", "nsICategoryManager");
const stringBundleService = CCSV("@mozilla.org/intl/stringbundle;1", "nsIStringBundleService");
const promptService = CCSV("@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
// There is one Firebug object per browser.xul

const contentBox = $("fbContentBox");
const contentSplitter = $("fbContentSplitter");
const toggleCommand = $("cmd_toggleFirebug");
const detachCommand = $("cmd_toggleDetachFirebug");
const tabBrowser = $("content");
const versionURL = "chrome://firebug/content/branch.properties";
const statusBarContextMenu = $("fbStatusContextMenu");

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const prefs = PrefService.getService(nsIPrefBranch2);
const NS_OS_TEMP_DIR = "TmpD"

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const firebugURLs =
{
    main: "http://www.getfirebug.com",
    docs: "http://www.getfirebug.com/docs.html",
    keyboard: "http://www.getfirebug.com/keyboard.html",
    discuss: "http://groups.google.com/group/firebug",
    issues: "http://code.google.com/p/fbug/issues/list",
    donate: "http://www.getfirebug.com/contribute.html?product"
};

const prefNames =  // XXXjjb TODO distribute to modules
[
    // Global
    "defaultPanelName", "throttleMessages", "textSize", "showInfoTips",
    "largeCommandLine", "textWrapWidth", "openInWindow", "showErrorCount",
    "activateSameOrigin", "allPagesActivation",

    // Search
    "searchCaseSensitive", "searchGlobal", "netSearchHeaders", "netSearchParameters",
    "netSearchResponseBody",

    // Console
    "showJSErrors", "showJSWarnings", "showCSSErrors", "showXMLErrors",
    "showChromeErrors", "showChromeMessages", "showExternalErrors",
    "showXMLHttpRequests", "showNetworkErrors",

    "persistBreakOnError",

    // HTML
    "showFullTextNodes", "showCommentNodes",
    "showTextNodesWithWhitespace", "showTextNodesWithEntities",
    "highlightMutations", "expandMutations", "scrollToMutations", "shadeBoxModel",
    "showQuickInfoBox",

    // CSS
    "showUserAgentCSS",
    "expandShorthandProps",

    // Script
    "decompileEvals", "replaceTabs",

    // DOM
    "showUserProps", "showUserFuncs", "showDOMProps", "showDOMFuncs", "showDOMConstants",

    // Layout
    "showRulers",

    // Net
    "netFilterCategory", "collectHttpHeaders", "netDisplayedResponseLimit",
    "netDisplayedPostBodyLimit", "netPhaseInterval", "sizePrecision",

    // Stack
    "omitObjectPathStack",

    // Debugging
    "clearDomplate"
];

const servicePrefNames = [
    "showStackTrace", // Console
    "filterSystemURLs", // Stack
    "showAllSourceFiles", "breakOnErrors",  "trackThrowCatch" // Script
];

const scriptBlockSize = 20;

const PLACEMENT_NONE = 0;
const PLACEMENT_INBROWSER = 1;
const PLACEMENT_DETACHED = 2;
const PLACEMENT_MINIMIZED = 3;

// ************************************************************************************************
// Globals

var modules = [];
var activeContexts = [];
var activableModules = [];
var extensions = [];
var panelTypes = [];
var reps = [];
var defaultRep = null;
var defaultFuncRep = null;
var editors = [];
var externalEditors = [];

var panelTypeMap = {};
var optionUpdateMap = {};

var deadWindows = [];
var deadWindowTimeout = 0;
var clearContextTimeout = 0;
var temporaryFiles = [];
var temporaryDirectory = null;

// Register default Firebug string bundle (yet before domplate templates).
categoryManager.addCategoryEntry("strings_firebug",
    "chrome://firebug/locale/firebug.properties", "", true, true);

// ************************************************************************************************

/**
 * @class Represents the main Firebug application object. An instance of this object is
 * created for each browser window (browser.xul).
 */
top.Firebug =
{
    version: "1.5",

    dispatchName: "Firebug",
    module: modules,
    panelTypes: panelTypes,
    uiListeners: [],
    reps: reps,
    prefDomain: "extensions.firebug",
    servicePrefDomain: "extensions.firebug.service",

    stringCropLength: 50,

    tabBrowser: tabBrowser,
    originalChrome: FirebugChrome,
    chrome: FirebugChrome,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Initialization

    initialize: function()
    {
        var version = this.getVersion();
        if (version)
        {
            this.version = version;
            $('fbStatusBar').setAttribute("tooltiptext", "Firebug " + version);

            var about = $('Firebug_About');
            if (about)
            {
                var aboutLabel = about.getAttribute("label");
                $('Firebug_About').setAttribute("label",  aboutLabel + " " + version);
            }
        }

        for (var i = 0; i < prefNames.length; ++i)
            this[prefNames[i]] = this.getPref(this.prefDomain, prefNames[i]);
        for (var i = 0; i < servicePrefNames.length; ++i)
            this[servicePrefNames[i]] = this.getPref(this.servicePrefDomain, servicePrefNames[i]);

        this.loadExternalEditors();

        prefs.addObserver(this.prefDomain, this, false);
        prefs.addObserver(this.servicePrefDomain, this, false);

        var basePrefNames = prefNames.length;

        this.clientID = Firebug.Debugger.registerClient(this);

        dispatch(modules, "initialize", [this.prefDomain, prefNames]);

        for (var i = basePrefNames; i < prefNames.length; ++i)
            this[prefNames[i]] = this.getPref(this.prefDomain, prefNames[i]);

        if (FBTrace.DBG_OPTIONS)
        {
             for (var i = 0; i < prefNames.length; ++i)
                FBTrace.sysout("firebug.initialize option "+this.prefDomain+"."+prefNames[i]+"="+this[prefNames[i]]+"\n");
        }
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.initialize client: "+this.clientID+" with prefDomain "+this.prefDomain);

        // In the case that the user opens firebug in a new window but then closes Firefox window, we don't get the
        // quitApplicationGranted event (platform is still running) and we call shutdown (Firebug isDetached).
        window.addEventListener('unload', shutdownFirebug, false);
    },

    getVersion: function()
    {
        if (!this.fullVersion)
            this.fullVersion = this.loadVersion(versionURL);

        return this.fullVersion;
    },

    loadVersion: function(versionURL)
    {
        var content = getResource(versionURL);
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

    internationalizeUI: function(doc)  // Substitute strings in the UI with fall back to en-US
    {
        if (!doc)
            return;

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("Firebug.internationalizeUI");

        var elements = ["menu_clearConsole", "menu_resetAllOptions",
            "menu_enablePanels", "menu_disablePanels",
            "fbCommandLine", "fbFirebugMenu", "fbLargeCommandLine", "menu_customizeShortcuts",
            "menu_enableA11y", "menu_activateSameOrigin", "menu_onByDefault", "fbContinueButton",
            "fbBreakOnNextButton", "fbConsolePersist",
            "fbMinimizeButton", "FirebugMenu_Sites", "fbResumeBoxButton",
            "menu_AllOn", "menu_clearActivationList", "showQuickInfoBox"];

        for (var i=0; i<elements.length; i++)
        {
            var element = doc.getElementById(elements[i]);
            if (!element)
            {
                if (FBTrace.DBG_LOCALE)
                    FBTrace.sysout("firebug.internationalizeUI; Element Not Found: " + elements[i]);
                continue;
            }

            if (element.hasAttribute("label"))
                FBL.internationalize(element, "label");

            if (element.hasAttribute("tooltiptext"))
                FBL.internationalize(element, "tooltiptext");
        }

        // Allow other modules to internationalize UI labels (called also for
        // detached Firebug window).
        dispatch(modules, "internationalizeUI", [doc]);
    },

    broadcast: function(message, args)
    {
        // dispatch message to all XUL windows registered to firebug service.
        // Implemented in Firebug.Debugger.
    },

    /**
     * Called when the UI is ready to be initialized, once the panel browsers are loaded,
     * but before any contexts are created.
     */
    initializeUI: function(detachArgs)
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.initializeUI this.disabledAlways="+this.disabledAlways+
                    " detachArgs:", detachArgs);

        TabWatcher.initialize(this);
        TabWatcher.addListener(this);

        // Initialize all modules.
        dispatch(modules, "initializeUI", [detachArgs]);
    },


    shutdown: function()  // called in browser when Firefox closes and in externalMode when fbs gets quitApplicationGranted.
    {
        window.removeEventListener('unload', shutdownFirebug, false);

        Firebug.Debugger.unregisterClient(this);

        TabWatcher.destroy();

        // Remove the listener after the TabWatcher.destroy() method is called so,
        // destroyContext event is properly dispatched to the Firebug object and
        // consequently to all registered modules.
        TabWatcher.removeListener(this);

        dispatch(modules, "disable", [FirebugChrome]);

        prefService.savePrefFile(null);
        prefs.removeObserver(this.prefDomain, this, false);
        prefs.removeObserver(this.servicePrefDomain, this, false);

        dispatch(modules, "shutdown");

        this.closeDeadWindows();
        this.deleteTemporaryFiles();

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.shutdown exited client "+this.clientID);
    },

    // ----------------------------------------------------------------------------------------------------------------

    getSuspended: function()
    {
        var suspendMarker = $("fbStatusIcon");
        if (suspendMarker.hasAttribute("suspended"))
            return suspendMarker.getAttribute("suspended");
        return null;
    },

    setSuspended: function(value)
    {
        var suspendMarker = $("fbStatusIcon");
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.setSuspended to "+value+". Browser: " +
                Firebug.chrome.window.document.title);

        if (value)
            suspendMarker.setAttribute("suspended", value);
        else
            suspendMarker.removeAttribute("suspended");

        Firebug.resetTooltip();
    },

    toggleSuspend: function()
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

    disablePanels: function(context)
    {
        Firebug.ModuleManager.disableModules();
    },

    suspend: function()  // dispatch suspendFirebug to all windows
    {
        this.broadcast('suspendFirebug', []);
    },

    suspendFirebug: function() // dispatch onSuspendFirebug to all modules
    {
        this.setSuspended("suspending");

        var cancelSuspend = dispatch2(activableModules, 'onSuspendFirebug', [FirebugContext]);  // TODO no context arg

        if (cancelSuspend)
            Firebug.resume();
        else
            this.setSuspended("suspended");
    },

    resume: function()
    {
        this.broadcast('resumeFirebug', []);
    },

    resumeFirebug: function()  // dispatch onResumeFirebug to all modules
    {
        this.setSuspended("resuming");
        dispatch(activableModules, 'onResumeFirebug', [FirebugContext]);// TODO no context arg
        this.setSuspended(null);
    },

    getEnablementStatus: function()
    {
        var strOn = $STR("enablement.on");
        var strOff = $STR("enablement.off");

        var status = "";
        var fbStatusIcon = $('fbStatusIcon');
        if (fbStatusIcon.getAttribute("console") == "on")
            status +="Console: "+strOn+",";
        else
            status +="Console: "+strOff+",";

        if (fbStatusIcon.getAttribute("net") == "on")
            status +=" Net: "+strOn+",";
        else
            status +=" Net: "+strOff+",";

        if (fbStatusIcon.getAttribute("script") == "on")
            status +=" Script: "+strOn;
        else
            status +=" Script: "+strOff+"";

        return status;
    },

    resetTooltip: function()
    {
        if (FBTrace.DBG_TOOLTIP)
          FBTrace.sysout("resetTooltip called");

        var tooltip = "Firebug " + Firebug.getVersion();

        tooltip += "\n" + Firebug.getEnablementStatus();

        if (Firebug.getSuspended())
            tooltip += "\n" + Firebug.getSuspended();
        else
            tooltip += "\n" + $STRP("plural.Total_Firebugs", [TabWatcher.contexts.length]);

        if (Firebug.allPagesActivation == "on")
        {
            var label = $STR("enablement.on");
            tooltip += "\n"+label+" "+$STR("enablement.for all pages");
        }
        // else allPagesActivation == "none" we don't show it.

        tooltip += "\n" + $STR(Firebug.getPlacement());

        $('fbStatusBar').setAttribute("tooltiptext", tooltip);
    },

    getURLsForAllActiveContexts: function()
    {
        var contextURLSet = [];  // create a list of all unique activeContexts
        TabWatcher.iterateContexts( function createActiveContextList(context)
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
                    FBTrace.sysout("firebug.getURLsForAllActiveContexts could not get window.location for a context", e);
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
            remove(modules, arguments[i]);
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
            TabWatcher.addListener(arguments[i]);

        for (var j = 0; j < arguments.length; j++)
            Firebug.uiListeners.push(arguments[j]);
    },

    unregisterExtension: function()  // TODO remove
    {
        for (var i = 0; i < arguments.length; ++i)
        {
            TabWatcher.removeListener(arguments[i]);
            remove(Firebug.uiListeners, arguments[i]);
            remove(extensions, arguments[i])
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
            remove(Firebug.uiListeners, arguments[i]);
    },

    registerPanel: function()
    {
        panelTypes.push.apply(panelTypes, arguments);

        for (var i = 0; i < arguments.length; ++i)
            panelTypeMap[arguments[i].prototype.name] = arguments[i];

        if (FBTrace.DBG_INITIALIZE)
            for (var i = 0; i < arguments.length; ++i)
                FBTrace.sysout("registerPanel "+arguments[i].prototype.name+"\n");
    },

    registerRep: function()
    {
        reps.push.apply(reps, arguments);
    },

    unregisterRep: function()
    {
        for (var i = 0; i < arguments.length; ++i)
            remove(reps, arguments[i]);
    },

    setDefaultReps: function(funcRep, rep)
    {
        defaultRep = rep;
        defaultFuncRep = funcRep;
    },

    registerEditor: function()
    {
        editors.push.apply(editors, arguments);
    },

    registerStringBundle: function(bundleURI)
    {
        categoryManager.addCategoryEntry("strings_firebug", bundleURI, "", true, true);
        this.stringBundle = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Localization

    getStringBundle: function()
    {
        if (!this.stringBundle)
            this.stringBundle = stringBundleService.createExtensibleBundle("strings_firebug");
        return this.stringBundle;
    },

    getPluralRule: function()
    {
        try {
            return this.getStringBundle().GetStringFromName("pluralRule");
        } catch (err) { }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Options

    togglePref: function(name)
    {
        this.setPref(Firebug.prefDomain, name, !this[name]);
    },

    getPref: function(prefDomain, name)
    {
        var prefName = prefDomain + "." + name;

        var type = prefs.getPrefType(prefName);
        if (type == nsIPrefBranch.PREF_STRING)
            return prefs.getCharPref(prefName);
        else if (type == nsIPrefBranch.PREF_INT)
            return prefs.getIntPref(prefName);
        else if (type == nsIPrefBranch.PREF_BOOL)
            return prefs.getBoolPref(prefName);
    },

    setPref: function(prefDomain, name, value)
    {
        var prefName = prefDomain + "." + name;

        var type = prefs.getPrefType(prefName);
        if (type == nsIPrefBranch.PREF_STRING)
            prefs.setCharPref(prefName, value);
        else if (type == nsIPrefBranch.PREF_INT)
            prefs.setIntPref(prefName, value);
        else if (type == nsIPrefBranch.PREF_BOOL)
            prefs.setBoolPref(prefName, value);
        else if (type == nsIPrefBranch.PREF_INVALID)
        {
            FBTrace.sysout("firebug.setPref FAILS: Invalid preference "+prefName+" check that it is listed in defaults/prefs.js");
        }

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("firebug.setPref type="+type+" name="+prefName+" value="+value+"\n");
    },

    clearPref: function(prefDomain, name)
    {
        var prefName = prefDomain + "." + name;
        if (prefs.prefHasUserValue(prefName))
            prefs.clearUserPref(prefName);
    },

    increaseTextSize: function(amt)
    {
        this.setTextSize(this.textSize+amt);
    },

    setTextSize: function(value)
    {
        this.setPref(Firebug.prefDomain, "textSize", value);
    },

    updatePref: function(name, value)
    {
        // Prevent infinite recursion due to pref observer
        if ( optionUpdateMap.hasOwnProperty(name) )
            return;

        optionUpdateMap[name] = 1;
        this[name] = value;

        dispatch(modules, "updateOption", [name, value]);

        // Update the current chrome...
        Firebug.chrome.updateOption(name, value);

        // ... as well as the original in-browser chrome (if Firebug is currently detached).
        // xxxHonza, xxxJJB: John, the Firebug.externalChrome is not longer set, is it correct?
        // it's still used in FirebugChrome.setGlobalAttribute.
        if (Firebug.chrome != Firebug.originalChrome)
            Firebug.originalChrome.updateOption(name, value);

        if (name.substr(0, 15) == "externalEditors")
            this.loadExternalEditors();

        delete optionUpdateMap[name];

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("firebug.updatePref EXIT: "+name+"="+value+"\n");
    },

    // ********************************************************************************************
    // External editors
    // TODO move to editors.js as Firebug.Editors module

    loadExternalEditors: function()
    {
        const prefName = "externalEditors";
        const editorPrefNames = ["label", "executable", "cmdline", "image"];

        externalEditors = [];
        var list = this.getPref(this.prefDomain, prefName).split(",");
        for (var i = 0; i < list.length; ++i)
        {
            var editorId = list[i];
            if ( !editorId || editorId == "")
                continue;
            var item = { id: editorId };
            for( var j = 0; j < editorPrefNames.length; ++j )
            {
                try {
                    item[editorPrefNames[j]] = this.getPref(this.prefDomain, prefName+"."+editorId+"."+editorPrefNames[j]);
                }
                catch(exc)
                {
                }
            }
            if ( item.label && item.executable )
            {
                if (!item.image)
                    item.image = getIconURLForFile(item.executable);
                externalEditors.push(item);
            }
        }
        return externalEditors;
    },

    get registeredEditors()
    {
        var newArray = [];
        if ( editors.length > 0 )
        {
            newArray.push.apply(newArray, editors);
            if ( externalEditors.length > 0 )
                newArray.push("-");
        }
        if ( externalEditors.length > 0 )
            newArray.push.apply(newArray, externalEditors);

        return newArray;
    },

    openEditors: function()
    {
        var args = {
            FBL: FBL,
            prefName: this.prefDomain + ".externalEditors"
        };
        openWindow("Firebug:ExternalEditors", "chrome://firebug/content/editors.xul", "", args);
    },

    openInEditor: function(context, editorId)
    {
        try
        {
            if (!editorId)
                return;

            var location;
            if (context)
            {
                var panel = Firebug.chrome.getSelectedPanel();
                if (panel)
                {
                    location = panel.location;
                    if (!location && panel.name == "html")
                        location = context.window.document.location;
                    if (location && (location instanceof Firebug.SourceFile || location instanceof CSSStyleSheet ))
                        location = location.href;
                }
            }
            if (!location)
            {
                if (tabBrowser.currentURI)
                    location = tabBrowser.currentURI.asciiSpec;
            }
            if (!location)
                return;
            location = location.href || location.toString();
            if (Firebug.filterSystemURLs && isSystemURL(location))
                return;

            var list = extendArray(editors, externalEditors);
            var editor = null;
            for( var i = 0; i < list.length; ++i )
            {
                if (editorId == list[i].id)
                {
                    editor = list[i];
                    break;
                }
            }
            if (editor)
            {
                if (editor.handler)
                {
                    editor.handler(location);
                    return;
                }
                var args = [];
                var localFile = null;
                var targetAdded = false;
                if (editor.cmdline)
                {
                    args = editor.cmdline.split(" ");
                    for( var i = 0; i < args.length; ++i )
                    {
                        if ( args[i] == "%url" )
                        {
                            args[i] = location;
                            targetAdded = true;
                        }
                        else if ( args[i] == "%file" )
                        {
                            if (!localFile)
                                localFile = this.getLocalSourceFile(context, location);
                            args[i] = localFile;
                            targetAdded = true;
                        }
                    }
                }
                if (!targetAdded)
                {
                    localFile = this.getLocalSourceFile(context, location);
                    if (!localFile)
                        return;
                    args.push(localFile);
                }
                FBL.launchProgram(editor.executable, args);
            }
        } catch(exc) { ERROR(exc); }
    },

    getLocalSourceFile: function(context, href)
    {
        if ( isLocalURL(href) )
            return getLocalPath(href);

        var data;
        if (context)
        {
            data = context.sourceCache.loadText(href);
        }
        else
        {
            // xxxHonza: if the fake context is used the source code is always get using
            // (a) the browser cache or (b) request to the server.
            var selectedBrowser = Firebug.chrome.getCurrentBrowser();
            var ctx = {
                browser: selectedBrowser,
                window: selectedBrowser.contentWindow
            };
            data = new Firebug.SourceCache(ctx).loadText(href);
        }

        if (!data)
            return;

        if (!temporaryDirectory)
        {
            var tmpDir = DirService.getFile(NS_OS_TEMP_DIR, {});
            tmpDir.append("fbtmp");
            tmpDir.createUnique(nsIFile.DIRECTORY_TYPE, 0775);
            temporaryDirectory = tmpDir;
        }

        var lpath = href.replace(/^[^:]+:\/*/g, "").replace(/\?.*$/g, "").replace(/[^0-9a-zA-Z\/.]/g, "_");
        /* dummy comment to workaround eclipse bug */
        if ( !/\.[\w]{1,5}$/.test(lpath) )
        {
            if ( lpath.charAt(lpath.length-1) == '/' )
                lpath += "index";
            lpath += ".html";
        }

        if ( getPlatformName() == "WINNT" )
            lpath = lpath.replace(/\//g, "\\");

        var file = QI(temporaryDirectory.clone(), nsILocalFile);
        file.appendRelativePath(lpath);
        if (!file.exists())
            file.create(nsIFile.NORMAL_FILE_TYPE, 0664);
        temporaryFiles.push(file.path);

        var converter = CCIN("@mozilla.org/intl/scriptableunicodeconverter", "nsIScriptableUnicodeConverter");
        converter.charset = 'UTF-8'; // TODO detect charset from current tab
        data = converter.ConvertFromUnicode(data);

        var stream = CCIN("@mozilla.org/network/safe-file-output-stream;1", "nsIFileOutputStream");
        stream.init(file, 0x04 | 0x08 | 0x20, 0664, 0); // write, create, truncate
        stream.write(data, data.length);
        if (stream instanceof nsISafeOutputStream)
            stream.finish();
        else
            stream.close();

        return file.path;
    },

    deleteTemporaryFiles: function()  // TODO call on "shutdown" event to modules
    {
        try {
            var file = CCIN("@mozilla.org/file/local;1", "nsILocalFile");
            for( var i = 0; i < temporaryFiles.length; ++i)
            {
                file.initWithPath(temporaryFiles[i]);
                if (file.exists())
                    file.remove(false);
            }
        }
        catch(exc)
        {
        }
        try {
            if (temporaryDirectory && temporaryDirectory.exists())
                temporaryDirectory.remove(true);
        } catch(exc)
        {
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Browser Bottom Bar

    showBar: function(show)
    {
        var browser = Firebug.chrome.getCurrentBrowser();
        if (FBTrace.DBG_WINDOWS || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("showBar("+show+") for browser "+browser.currentURI.spec+" FirebugContext "+FirebugContext);

        var contentBox = Firebug.chrome.$("fbContentBox");
        var contentSplitter = Firebug.chrome.$("fbContentSplitter");

        var shouldShow = show/* && !Firebug.isDetached()*/;
        contentBox.setAttribute("collapsed", !shouldShow);

        if(!show)
            Firebug.Inspector.inspectNode(null);

        if (contentSplitter)
            contentSplitter.setAttribute("collapsed", !shouldShow);

        if (toggleCommand)
            toggleCommand.setAttribute("checked", !!shouldShow);

        if (detachCommand)
            detachCommand.setAttribute("checked", Firebug.isDetached());

        this.showKeys(shouldShow);

        dispatch(Firebug.uiListeners, show ? "showUI" : "hideUI", [browser, FirebugContext]);

        // Sync panel state after the showUI event is dispatched. syncPanel method calls
        // Panel.show method, which expects the active context to be already registered.
        if (show)
            Firebug.chrome.syncPanel();
    },

    showKeys: function(shouldShow)
    {
        if (!this.fbOnlyKeys)
        {
            var keyset = document.getElementById("mainKeyset");
            this.fbOnlyKeys = keyset.getElementsByClassName("fbOnlyKey").item(0);
        }
        var keys = this.fbOnlyKeys;
        for (var i = 0; i < keys.length; i++)
            keys[i].setAttribute("disabled", !!shouldShow);
    },

    closeFirebug: function(userCommand)  // this is really deactivate
    {
        var browser = FirebugChrome.getCurrentBrowser();

        TabWatcher.unwatchBrowser(browser, userCommand);
        Firebug.resetTooltip();
    },

    /*
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

        if (FirebugContext && browser.showFirebug)  // then we are already debugging the selected tab
        {
            if (Firebug.isDetached()) // if we are out of the browser focus the window
                Firebug.chrome.focus();
            else if (Firebug.openInWindow)
                this.detachBar(context);
            else if (Firebug.isMinimized()) // toggle minimize
                Firebug.unMinimize();
            else if (!forceOpen)  // else isInBrowser
                Firebug.minimizeBar();
        }
        else  // closed or no context or no showFirebug
        {
            if (FBTrace.DBG_ERRORS)
            {
                var context = TabWatcher.getContextByWindow(browser.contentWindow);
                if (context) // ASSERT: we should not have showFirebug false on a page with a context
                    FBTrace.sysout("Firebug.toggleBar: placement "+this.getPlacement()+ " context: "+context.getName()+" FirebugContext: "+(FirebugContext?FirebugContext.getName():"null")+" browser.showFirebug:"+browser.showFirebug);
            }

            var created = TabWatcher.watchBrowser(browser);  // create a context for this page
            if (!created)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("Rejected page should explain to user!");
                return false;
            }

            if (Firebug.isMinimized()) // then toggle minimize
                Firebug.unMinimize();
        }
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
        this.updateActiveContexts(FirebugContext);
        Firebug.setPlacement("inBrowser");
        Firebug.showBar(true);
    },

    toggleDetachBar: function(forceOpen, reopenInBrowser)  // detached -> closed; inBrowser -> detached TODO reattach
    {
        if (!forceOpen && Firebug.isDetached())  // detached -> minimized
        {
            Firebug.chrome.close();
            detachCommand.setAttribute("checked", false);
            if (reopenInBrowser)
            {
                setTimeout(function delayMinimize()
                {
                    Firebug.unMinimize()
                });
            }
        }
        else
            this.detachBar(FirebugContext);
    },

    closeDetachedWindow: function(userCommands)
    {
        Firebug.showBar(false);

        if (FirebugContext)
            TabWatcher.unwatchBrowser(FirebugContext.browser, userCommands);
        // else the user closed Firebug external window while not looking at a debugged web page.

        Firebug.resetTooltip();
    },

    setChrome: function(newChrome, newPlacement)
    {
        var oldChrome = Firebug.chrome;
        Firebug.chrome = newChrome;
        Firebug.setPlacement(newPlacement);

        // reattach all contexts to the new chrome
        TabWatcher.iterateContexts(function reattach(context)
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
            var created = TabWatcher.watchBrowser(browser);  // create a context for this page
            if (!created)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("Firebug.detachBar, no context in "+window.location);
                return null;
            }
            context = TabWatcher.getContextByWindow(browser.contentWindow);
        }

        if (Firebug.isDetached())  // can be set true attachBrowser
        {
            Firebug.chrome.focus();
            return null;
        }

        this.showBar(false);  // don't show in browser.xul now

        Firebug.chrome.setFirebugContext(context);  // make sure the FirebugContext agrees with context
        FirebugContext = context;

        this.setPlacement("detached");  // we'll reset it in the new window, but we seem to race with code in this window.

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.detachBar opening firebug.xul for context "+FirebugContext.getName() );

        var args = {
            FBL: FBL,
            Firebug: this,
            browser: context.browser,
            FirebugContext: window.FirebugContext
        };
        var win = openWindow("Firebug", "chrome://firebug/content/firebug.xul", "", args);

        return win;
    },

    syncBar: function()  // show firebug if we should
    {
        var browser = FirebugChrome.getCurrentBrowser();
        this.showBar(browser && browser.showFirebug);  // implicitly this is operating in the chrome of browser.xul
    },

    onClickStatusIcon: function(context, event)
    {
        if (event.button != 0)
            return;
        else if (isControl(event))
            this.toggleDetachBar(true);
        else if (context && context.errorCount)
            Firebug.toggleBar(undefined, 'console');
        else
            this.toggleBar();
    },

    onClickStatusText: function(context, event)
    {
        if (event.button != 0)
            return;

        if (!context || !context.errorCount)
            return;

        var panel = Firebug.chrome.getSelectedPanel();
        if (panel && panel.name != "console")
        {
            Firebug.chrome.selectPanel("console");
            cancelEvent(event);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    resetAllOptions: function(confirm)  // to default state
    {
        if (confirm)
        {
            if (!promptService.confirm(null, $STR("Firebug"), $STR("confirmation.Reset_All_Firebug_Options")))
                return;
        }

        var preferences = prefs.getChildList("extensions.firebug", {});
        for (var i = 0; i < preferences.length; i++)
        {
            if (preferences[i].indexOf("DBG_") == -1 && preferences[i].indexOf("filterSystemURLs") == -1)
            {
                if (FBTrace.DBG_OPTIONS)
                    FBTrace.sysout("Clearing option: "+i+") "+preferences[i]);
                if (prefs.prefHasUserValue(preferences[i]))  // avoid exception
                    prefs.clearUserPref(preferences[i]);
            }
            else
            {
                if (FBTrace.DBG_OPTIONS)
                    FBTrace.sysout("Skipped clearing option: "+i+") "+preferences[i]);
            }
        }

        TabWatcher.iterateContexts( function clearBPs(context)
        {
            Firebug.Debugger.clearAllBreakpoints(context);
        });
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
            : FBL.$STR("Panel-"+panelType.prototype.name);
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
     * Note that panel.context may not have a persistedState, but in addition the persisted state for panel.name may be null.
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
        dispatch(modules, "showPanel", [browser, panel]);
    },

    showSidePanel: function(browser, sidePanel)
    {
        dispatch(modules, "showSidePanel", [browser, sidePanel]);
    },

    reattachContext: function(browser, context)
    {
        dispatch(modules, "reattachContext", [browser, context]);
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

    getRep: function(object)
    {
        var type = typeof(object);
        if (type == 'object' && object instanceof String)
            type = 'string';

        for (var i = 0; i < reps.length; ++i)
        {
            var rep = reps[i];
            try
            {
                if (rep.supportsObject(object, type))
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
            if (hasClass(child, "repTarget"))
                target = child;

            if (child.repObject)
            {
                if (!target && hasClass(child, "repIgnore"))
                    break;
                else
                    return child.repObject;
            }
        }
    },

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
        openNewTab(firebugURLs[which]);
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
    // nsIPrefObserver

    observe: function(subject, topic, data)
    {
        if (data.indexOf("extensions.") == -1)
            return;

        if (data.substring(0, Firebug.prefDomain.length) == Firebug.prefDomain)
            var domain = Firebug.prefDomain;
        if (data.substring(0, Firebug.servicePrefDomain.length) == Firebug.servicePrefDomain)
            var domain = Firebug.servicePrefDomain;

        if (domain)
        {
            var name = data.substr(domain.length+1);
            var value = this.getPref(domain, name);
            if (FBTrace.DBG_OPTIONS) FBTrace.sysout("firebug.observe name = value: "+name+"= "+value+"\n");
            this.updatePref(name, value);
        }

        if (topic == "nsPref:changed")
        {
            if (data.indexOf(".enableSites") != -1)
            {
                if (FBTrace.DBG_PANELS)
                    FBTrace.sysout("Firebug.observe subject: "+subject+" topic "+topic+" data: "+data+"\n");
                dispatch(modules, "onEnablePrefChange", [data]);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsIFireBugClient  These are per Firefox XUL window callbacks

    enableXULWindow: function()  // Called when the first context is created.
    {
        if (window.closed)
            throw new Error("enableXULWindow window is closed!!");

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("enable XUL Window +++++++++++++++++++++++++++++++++++++++", Firebug.detachArgs);

        dispatch(modules, "enable", [FirebugChrome]);  // allows errors to flow thru fbs and callbacks to supportWindow to begin
    },

    disableXULWindow: function()
    {
        dispatch(modules, "disable", [FirebugChrome]);
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("disable XUL Window --------------------------------------");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // These are XUL window level call backs and should be moved into Firebug where is says nsIFirebugClient
    // xxxHonza: so I did

    onPauseJSDRequested: function(rejection)
    {
        if (top.FirebugContext)  // then we are active in this browser.xul
            rejection.push(true); // so reject the request

        dispatch2(Firebug.Debugger.fbListeners, "onPauseJSDRequested", [rejection]);
    },

    onJSDActivate: function(active, why)  // just before hooks are set
    {
        this.setIsJSDActive(active);

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.onJSDActivate "+why+" active:"+active+"\n");

        dispatch2(Firebug.Debugger.fbListeners, "onJSDActivate", [active, why]);
    },

    onJSDDeactivate: function(active, why)
    {
        this.setIsJSDActive(active);

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.onJSDDeactivate "+why+" active:"+active+"\n");

        dispatch2(Firebug.Debugger.fbListeners, "onJSDDeactivate", [active, why]);
    },

    setIsJSDActive: function(active)  // should only be call on the jsd activation events, so it correctly reflects jsd state
    {
        if (active)
            $('fbStatusIcon').setAttribute("script", "on");
        else
            $('fbStatusIcon').setAttribute("script", "off");

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.setIsJSDActive "+active+"\n");

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
                    Firebug.setPref(Firebug.prefDomain, "previousPlacement", Firebug.placement);
                    Firebug.resetTooltip();
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
            Firebug.previousPlacement = Firebug.getPref(Firebug.prefDomain, "previousPlacement");

        return (Firebug.previousPlacement && (Firebug.previousPlacement == PLACEMENT_MINIMIZED) )
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // TabWatcher Listener

    getContextType: function()
    {
        return Firebug.TabContext;
    },

    shouldShowContext: function(context)
    {
        return dispatch2(modules, "shouldShowContext", [context]);
    },

    shouldCreateContext: function(browser, url, userCommands)
    {
        return dispatch2(modules, "shouldCreateContext", [browser, url, userCommands]);
    },

    shouldNotCreateContext: function(browser, url, userCommands)
    {
        return dispatch2(modules, "shouldNotCreateContext", [browser, url, userCommands]);
    },

    initContext: function(context, persistedState)  // called after a context is created.
    {
        context.panelName = context.browser.panelName;
        if (context.browser.sidePanelNames)
            context.sidePanelNames = context.browser.sidePanelNames;


        if (FBTrace.DBG_ERRORS && !context.sidePanelNames)
            FBTrace.sysout("firebug.initContext sidePanelNames:",context.sidePanelNames);

        dispatch(modules, "initContext", [context, persistedState]);

        this.updateActiveContexts(context); // a newly created context is active

        Firebug.chrome.setFirebugContext(context); // a newly created context becomes the default for the view
        FirebugContext = context;

        if (deadWindowTimeout)
            this.rescueWindow(context.browser); // if there is already a window, clear showDetached.
    },

    updateActiveContexts: function(context) // this should be the only method to call suspend and resume.
    {
        if (context)  // either a new context or revisiting an old one
        {
            if(!this.hadFirstContext)  // then we need to enable the panels iff the prefs say so
            {
                this.hadFirstContext = true;
                Firebug.ModuleManager.obeyPrefs(context);
            }
            if (Firebug.getSuspended())
                Firebug.resume();  // This will cause onResumeFirebug for every context including this one.
        }
        else // this browser has no context
        {
            Firebug.suspend();
        }

        Firebug.resetTooltip();
    },

    showContext: function(browser, context)  // TabWatcher showContext. null context means we don't debug that browser
    {
        if (clearContextTimeout)
        {
            clearTimeout(clearContextTimeout);
            clearContextTimeout = 0;
        }

        FirebugContext = context;
        Firebug.chrome.setFirebugContext(context); // the context becomes the default for its view
        this.updateActiveContexts(context);  // resume, after setting FirebugContext

        dispatch(modules, "showContext", [browser, context]);  // tell modules we may show UI

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
            collapse(contentBox, false);
            Firebug.chrome.syncPanel();
            collapse(resumeBox, true);
        }
        else
        {
            collapse(contentBox, true);
            collapse(resumeBox, false);
            Firebug.chrome.window.document.title = $STR("Firebug - inactive for selected Firefox tab");
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

        dispatch(modules, "watchWindow", [context, win]);
    },

    unwatchWindow: function(context, win)
    {
        for (var panelName in context.panelMap)
        {
            var panel = context.panelMap[panelName];
            panel.unwatchWindow(win);
        }
        dispatch(modules, "unwatchWindow", [context, win]);
    },

    loadedContext: function(context)
    {
        if (!context.browser.currentURI)
            FBTrace.sysout("firebug.loadedContext problem browser ", context.browser);

        dispatch(modules, "loadedContext", [context]);
    },

    destroyContext: function(context, persistedState, browser)
    {
        if (!context)  // then we are called just to clean up
            return;

        dispatch(modules, "destroyContext", [context, persistedState]);

        if (FirebugContext == context)
            Firebug.chrome.setFirebugContext(null);  // FirebugContext is about to be destroyed

        var browser = context.browser;
        // Persist remnants of the context for restoration if the user reloads
        browser.panelName = context.panelName;
        browser.sidePanelNames = context.sidePanelNames;

        // next the context is deleted and removed from the TabWatcher, we clean up in unWatchBrowser
    },

    onSourceFileCreated: function(context, sourceFile)
    {
        dispatch(modules, "onSourceFileCreated", [context, sourceFile]);
    },

    //*********************************************************************************************

    getTabForWindow: function(aWindow)
    {
        aWindow = getRootWindow(aWindow);

        if (!aWindow || !this.tabBrowser.getBrowserIndexForDocument)
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

    getTabIdForWindow: function(win)
    {
        var tab = this.getTabForWindow(win);
        return tab ? tab.linkedPanel : null;
    },
};

// ************************************************************************************************

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
        if (!this.fbListeners)
            this.fbListeners = []; // delay the creation until the objects are created so 'this' causes new array for each module

        this.fbListeners.push(listener);
    },

    removeListener: function(listener)
    {
        remove(this.fbListeners, listener);  // if this.fbListeners is null, remove is being called with no add
    }
};

// ************************************************************************************************

/**
 * @module Base class for all modules. Every derived module object must be registered using
 * <code>Firebug.registerModule</code> method. There is always one instance of a module object
 * per browser window.
 */
Firebug.Module = extend(new Firebug.Listener(),
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
Firebug.Panel =
/** @lends Firebug.Panel */
{
    searchable: false,
    editable: true,
    breakable: false,
    order: 2147483647,
    statusSeparator: "<",

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

        setClass(this.panelNode, "panelNode panelNode-"+this.name+" contextUID="+context.uid);

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

        clearDomplate(this.panelNode);
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

        scrollToBottom(this.panelNode);
    },

    // called when a panel in one XUL window is about to appear in another one.
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
    initializeNode: function(myPanelNode)
    {
    },

    // removeEventListener-s here.
    destroyNode: function()
    {
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    /**
     * Toolbar helpers
     */
    showToolbarButtons: function(buttonsId, show)
    {
        try
        {
            var buttons = Firebug.chrome.$(buttonsId);
            collapse(buttons, !show);
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
    supportsObject: function(object)
    {
        return 0;
    },

    hasObject: function(object)  // beyond type testing, is this object selectable?
    {
        return false;
    },

    navigate: function(object)
    {
        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("navigate "+this.name+" to "+object+" when this.location="+this.location+"\n");
        if (!object)
            object = this.getDefaultLocation(this.context);
        if (!object)
            object = null;  // not undefined.

        if ( !this.location || (object != this.location) )  // if this.location undefined, may set to null
        {
            if (FBTrace.DBG_PANELS)
                FBTrace.sysout("navigate "+this.name+" to location "+object+"\n");

            this.location = object;
            this.updateLocation(object);

            dispatch(Firebug.uiListeners, "onPanelNavigate", [object, this]);
        }
    },

    updateLocation: function(object)  // if the module can return null from getDefaultLocation, then it must handle it here.
    {
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

    select: function(object, forceUpdate)
    {
        if (!object)
            object = this.getDefaultSelection(this.context);

        if(FBTrace.DBG_PANELS)
            FBTrace.sysout("firebug.select "+this.name+" forceUpdate: "+forceUpdate+" "+object+((object==this.selection)?"==":"!=")+this.selection);

        if (forceUpdate || object != this.selection)
        {
            this.selection = object;
            this.updateSelection(object);

            dispatch(Firebug.uiListeners, "onObjectSelected", [object, this]);
        }
    },


    updateSelection: function(object)
    {
    },

    refresh: function()
    {

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    startInspecting: function()
    {
    },

    stopInspecting: function(object, cancelled)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

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
            Firebug.Search.searchOptionMenu("search.Case_Sensitive", "searchCaseSensitive")
        ];
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

    getDefaultSelection: function(context)
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

    getDefaultLocation: function(context)
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Support for Break On Next

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
};

//************************************************************************************************

Firebug.ActivablePanel = extend(Firebug.Panel,
{
    enablePanel: function(module)
    {
        var persistedPanelState = getPersistedState(this.context, this.name);
        persistedPanelState.enabled = true;

        var tab = this.getTab();
        if (tab)
            tab.setAttribute('aria-label', tab.textContent);

        // The panel was just enabled so, hide the disable message. Notice that
        // displaying this page replaces content of the panel.
        module.disabledPanelPage.hide(this);

        // xxxHonza: now I think this is the correct place to call Panel.show
        // If the enabled panel is currently visible, show the content.
        // It's necessary to update the toolbar.
        if (this.context.panelName == this.name)
        {
            if(FBTrace.DBG_PANELS)
                FBTrace.sysout("Firebug.enablePanel state", persistedPanelState);
            this.show(persistedPanelState);
        }

        Firebug.resetTooltip();
    },

    disablePanel: function(module)
    {
        var persistedPanelState = getPersistedState(this.context, this.name);
        persistedPanelState.enabled = false;

        var tab = this.getTab();
        if (tab)
            tab.setAttribute('aria-label', tab.getAttribute('label') + " ("+ $STR('aria.labels.inactive panel') +")");

        // The panel was disabled so, show the disabled page. This page also replaces the
        // old content so, the panel is fresh empty after it's enabled again.
        module.disabledPanelPage.show(this);

        // Make sure toolbar buttons are not visible for disabled panels.
        if (this.context.panelName == this.name)
        {
            if(FBTrace.DBG_PANELS)
                FBTrace.sysout("Firebug.disablePanel state", persistedPanelState);
            this.hide(persistedPanelState);
        }

        Firebug.resetTooltip();
    },

    getTab: function()
    {
        var chrome = Firebug.chrome;

        var tab = chrome.$("fbPanelBar2").getTab(this.name);
        if (!tab)
            tab = chrome.$("fbPanelBar1").getTab(this.name);
        return tab;
    },
});

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
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

        copyTextStyles(target, this.measureBox);
        target.ownerDocument.body.appendChild(this.measureBox);
    },

    getMeasuringElement: function()
    {
        return this.measureBox;
    },

    measureText: function(value)
    {
        this.measureBox.innerHTML = value ? escapeForSourceLine(value) : "m";
        return {width: this.measureBox.offsetWidth, height: this.measureBox.offsetHeight-1};
    },

    measureInputText: function(value)
    {
        value = value ? escapeForTextNode(value) : "m";
        if (!Firebug.showTextNodesWithWhitespace)
            value = value.replace(/\t/g,'mmmmmm').replace(/\ /g,'m');
        this.measureBox.innerHTML = value;
        return {width: this.measureBox.offsetWidth, height: this.measureBox.offsetHeight-1};
    },

    getBox: function(target)
    {
        var style = this.measureBox.ownerDocument.defaultView.getComputedStyle(this.measureBox, "");
        var box = getBoxFromStyles(style, this.measureBox);
        return box;
    },

    stopMeasuring: function()
    {
        this.measureBox.parentNode.removeChild(this.measureBox);
    }
};

// ************************************************************************************************

Firebug.Rep = domplate(
{
    className: "",
    inspectable: true,

    supportsObject: function(object, type)
    {
        return false;
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
        var label = safeToString(object); // eg [object XPCWrappedNative [object foo]]

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
    * @param context: the context, probably FirebugContext
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
        return $STR(name);
    },

    cropString: function(text)
    {
        return cropString(text);
    },

    cropMultipleLines: function(text, limit)
    {
        return cropMultipleLines(text, limit);
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

// ************************************************************************************************

/**
 * Implementation of ActivableModule.
 */
Firebug.ActivableModule = extend(Firebug.Module,
{
    panelName: null,
    panelBar1: $("fbPanelBar1"),

    initialize: function()
    {
        this.dependents = [];
        this.disabledPanelPage = new Firebug.DisabledPanelPage(this);

        Firebug.Module.initialize.apply(this, arguments);
    },

    initializeUI: function(detachArgs)
    {
        Firebug.registerUIListener(this);  // we listen for showUI/hideUI for panel activation

        this.updateTab(null);
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        Firebug.unregisterUIListener(this);
    },

    reattachContext: function(browser, context)
    {
        this.updateTab();
    },

    showContext: function(browser, context)
    {
        this.updateTab();
    },

    destroyContext: function(context)
    {
        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("firebug.destroyContext panelName "+this.panelName+"\n");
    },

    isEnabled: function()
    {
        return this.isAlwaysEnabled();
    },

    panelEnable: function(context) // panel Disabled -> Enabled for every context with a panel
    {
        if (FBTrace.DBG_PANELS  || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("firebug.ActivableModule.panelEnable "+this.getPrefDomain()+
                " isEnabled:"+this.isAlwaysEnabled()+", "+context.getName()+"\n");

        var panel = context.getPanel(this.panelName, false);
        if (panel)
            panel.enablePanel(this);

        this.onEnabled(context);
    },

    panelDisable: function(context)  // panel Enabled -> Disabled for every context with a panel
    {
        if (FBTrace.DBG_PANELS || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("firebug.ActivableModule.panelDisable "+this.getPrefDomain()+
                " isEnabled:"+this.isAlwaysEnabled()+", "+context.getName()+"\n");

        var panel = context.getPanel(this.panelName, true);
        if (panel)
            panel.disablePanel(this);

        this.onDisabled(context);
    },

    onEnabled: function(context)
    {
        // called for each context at the end of enable
    },

    onDisabled: function(context)
    {
        // called for each context at the end of disable
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Cross module dependencies.

    addDependentModule: function(dependent)
    {
        this.dependents.push(dependent);
        this.onDependentModuleChange(dependent);  // not dispatched.
    },

    removeDependentModule: function(dependent)
    {
        remove(this.dependents, dependent);
        this.onDependentModuleChange(dependent);  // not dispatched
    },

    onDependentModuleChange: function(dependent)
    {
        if (FBTrace.DBG_WINDOWS)
            FBTrace.sysout("onDependentModuleChange no-op for "+dependent.dispatchName);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // uiListener

    showUI: function(browser, context)  // Firebug is opened, in browser or ed
    {
        if (FBTrace.DBG_PANELS || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.showUI; " + this.panelName + ", " +
                (context ? context.getName() : "No Context"));
    },

    hideUI: function(browser, context)  // Firebug closes, either in browser or detached.
    {
        if (FBTrace.DBG_PANELS || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.hideUI; " + this.panelName + ", " +
                (context ? context.getName() : "No Context"));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onPanelEnable: function(panelName)
    {
        // Module activation code.
    },

    onPanelDisable: function(panelName)
    {
        // Module deactivation code.
    },

    onSuspendFirebug: function( )
    {
        // When the number of activeContexts decreases to zero. Modules should remove listeners, disable function that takes resources
    },

    onResumeFirebug: function( )
    {
        // When the number of activeContexts increases from zero. Modules should undo the work done in onSuspendFirebug
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getPrefDomain: function()
    {
        if (!this.panelName)
            return null;

        if (!this.prefDomain)
            this.prefDomain = Firebug.prefDomain + "." + this.panelName;

        return this.prefDomain;
    },

    setDefaultState: function(enable)
    {
        var prefDomain = this.getPrefDomain();
        if (!prefDomain)
        {
            if (FBTrace.DBG_PANELS)
                FBTrace.sysout("Firebug.ActivableModule.setDefaultState; There is no prefDomain.");
            return;
        }

        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("setDefaultState for "+prefDomain+" to "+enable);

        Firebug.setPref(prefDomain, "enableSites", enable);
    },

    isAlwaysEnabled: function()
    {
        var prefDomain = this.getPrefDomain();
        if (!prefDomain)
            return false;

        return Firebug.getPref(prefDomain, "enableSites");
    },

    get enabled() // backward compat
    {
        return this.isAlwaysEnabled();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onEnablePrefChange: function(pref)
    {
        var panelPref = this.getPrefDomain()+".enableSites";

        if (FBTrace.DBG_PANELS || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("firebug.onEnablePrefChange for:"+panelPref +" pref:"+ pref+" in module.panelName:"+this.panelName+"\n");

        if (pref == panelPref)
        {
            Firebug.ModuleManager.changeActivation(this);
        }
    },

    updateTab: function()
    {
        if (!this.panelName && (FBTrace.DBG_PANELS || FBTrace.DBG_ERRORS))
            FBTrace.sysout("firebug.ActivableModule.updateTab; Missing panelName in activable module", this);

        // Set activable module to mini tab menu so, the menu can get the actual state.
        var panelBar = Firebug.chrome.$("fbPanelBar1");
        var tab = panelBar.getTab(this.panelName);
        if (tab)
        {
            tab.setModule(this);
            var enabled = this.isAlwaysEnabled();
            if (enabled)
                tab.setAttribute("aria-disabled", "false");
            else
                tab.setAttribute("aria-disabled", "true");
            if (FBTrace.DBG_PANELS || FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("firebug.updateTab for "+this.panelName+" set aria-disabled with enabled:"+enabled);
        }
        else
        {
            if (FBTrace.DBG_PANELS || FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("firebug.updateTab for "+this.panelName+" ** no tab **");
        }

    }
});

// ************************************************************************************************

Firebug.DisabledPanelPage = function(module)
{
    this.module = module;
}

Firebug.DisabledPanelPage.prototype = domplate(Firebug.Rep,
{
    tag:
        DIV({"class": "disabledPanelBox"},
            H1({"class": "disabledPanelHead"},
                SPAN("$pageTitle")
            ),
            P({"class": "disabledPanelDescription", style: "margin-top: 15px;"},
                $STR("moduleManager.desc4"),
                SPAN("&nbsp;"),
                SPAN({"class": "descImage descImage-$panelName"})
            )
            /* need something here that pushes down any thing appended to the panel */
         ),

    getModuleName: function(module)
    {
        var panelType = Firebug.getPanelType(module.panelName);
        return Firebug.getPanelTitle(panelType);
    },

    onEnable: function(event)
    {
        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("firebug.DisabledPanelPage.onEnable; " +
                FirebugContext ? FirebugContext.getName() : "NO CONTEXT");

        Firebug.ModuleManager.enableModules(FirebugContext);
    },

    show: function(panel)
    {
        // Always render the page so, the previous content is properly replaced.
        //if (!panel.disabledBox)
            this.render(panel);

        panel.disabledBox.setAttribute("collapsed", false);
        panel.panelNode.scrollTop = 0;

        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("firebug.DisabledPanelPage.show:"+panel.disabledBox.getAttribute('collapsed')+" box", panel.disabledBox);
    },

    hide: function(panel)
    {
        if (!panel.disabledBox)
            return;

        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("firebug.DisabledPanelPage.hide; box", panel.disabledBox);

        panel.disabledBox.setAttribute("collapsed", true);
    },

    render: function(panel)
    {
        // Prepare arguments for the template.
        var args = {
            pageTitle: $STRF("moduleManager.title", [this.getModuleName(this.module)]),
            panelName: this.module.panelName
        };

        // Render panel HTML
        panel.disabledBox = this.tag.replace(args, panel.panelNode, this);
        panel.panelNode.scrollTop = 0;
    }
});

// ************************************************************************************************

Firebug.ModuleManager =
{
    disableModules: function(context)
    {
        if (!context)
            context = FirebugContext;

        for (var i=0; i<activableModules.length; i++)
        {
            var module = activableModules[i];
            this.disableModule(module);
        }
    },

    enableModules: function(context)
    {
        for (var i=0; i<activableModules.length; i++)
        {
            var module = activableModules[i];
            this.enableModule(module);
        }
    },

    disableModule: function(module)
    {
        if (module.isAlwaysEnabled())  // if we are enabled,
            module.setDefaultState(false);  // change the pref, triggering disable
        else
            this.changeActivation(module); // pref is ok, just disable
    },

    enableModule: function(module)
    {
        if (!module.isAlwaysEnabled())
            module.setDefaultState(true);
        else
            this.changeActivation(module);
    },

    changeActivation: function(module)
    {
        if (module.isAlwaysEnabled())
            dispatch(modules, "onPanelEnable", [module.panelName]);
        else
            dispatch(modules, "onPanelDisable", [module.panelName]);

        module.updateTab();
        Firebug.resetTooltip();

        TabWatcher.iterateContexts(
            function changeActivation(context)
            {
                try
                {
                    if (module.isAlwaysEnabled())
                        module.panelEnable(context);
                    else
                        module.panelDisable(context);
                }
                catch (exc)
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("ModuleManager.changeActivation FAILS for "+context.getName()+" because: "+ exc, exc);
                }
            }
        );

    },

    obeyPrefs: function(context)
    {
        for (var i=0; i<activableModules.length; i++)
        {
            var module = activableModules[i];
            if (module.isAlwaysEnabled())
                this.enableModule(module);
            else
                this.disableModule(module);

            module.updateTab();
        }
    },
}

// ************************************************************************************************
/*
 * If we are detached and the main Firefox window closes, also close the matching Firebug window.
 */
function shutdownFirebug() {
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

}});
