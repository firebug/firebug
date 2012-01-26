/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

var EXPORTED_SYMBOLS = ["FirebugLoader"];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

// xxxHonza: this breaks tracing, needs to be fixed.
//Components.utils.import("resource://firebug/fbtrace.js");
var FBTrace = {};

// ********************************************************************************************* //

function loadSubscript(src, win)
{
    return Services.scriptloader.loadSubScript(src, win);
}

// ********************************************************************************************* //

var FirebugLoader =
{
    extensions: [],

    registerExtension: function(e)
    {
        if (this.extensions.indexOf(e) != -1)
            return;

        this.extensions.push(e);

        this.forEachWindow(function(win)
        {
            e.topWindowReady(win)

            if (!win.Firebug.isInitialized)
                return;

            e.firebugWindowReady(win);
        })
    },

    unregisterExtension: function(e)
    {
        var i = this.extensions.indexOf(e);
        if (i >= 0)
            this.extensions.splice(i, 1);

        this.forEachWindow(function(win)
        {
            if (!win.Firebug)
                return;

            if (e.unloadFromWindow)
                e.unloadFromWindow();
        })
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    startup: function()
    {
        // allow already started bootstrapped firebug extensions to register themselves
        var XPIProviderBP = Cu.import("resource://gre/modules/XPIProvider.jsm", {});
        var bootstrapScopes = XPIProviderBP.XPIProvider.bootstrapScopes;

        for each(var scope in bootstrapScopes)
        {
            try
            {
                if (scope.firebugStartup)
                    scope.firebugStartup(this);
            }
            catch(e)
            {
                Cu.reportError(e);
            }
        }
    },

    shutdown: function()
    {
        this.forEachWindow(function(win)
        {
            FirebugLoader.unloadFromWindow(win);
        })
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    unloadFromWindow: function(win)
    {
        var fbug = win.Firebug
        this.dispatchToExtensions("unloadFromWindow", [win]);

        if (fbug.shutdown)
        {
            fbug.closeFirebug();
            fbug.shutdown();
        }

        function getRoots(el)
        {
            return Array.slice(el.querySelectorAll("[firebugRootNode]"));
        }

        [getRoots(win.document), getRoots(win.gNavToolbox.palette),
            fbug.GlobalUI.nodesToRemove].forEach(function(list)
        {
            for each(var el in list)
                if (el && el.parentNode)
                    el.parentNode.removeChild(el);
        });

        delete win.Firebug;
        delete win.FBTrace;
        delete win.FBL;
    },

    loadIntoWindow: function(win)
    {
        // This is the place where the global Firebug object is created. This object represents
        // the entire application and all consequently created namespaces and variables should be
        // injected into it.
        // In the future, there should *not* be any other globals except of the Firebug object.
        win.Firebug = {};

        // Apply all Firefox/SeaMonkey overlays to the browser window.
        loadSubscript("chrome://firebug/content/firefox/browserOverlay.js", win);

        // Firebug extensions should initialize here.
        this.dispatchToExtensions("topWindowReady", [win]);
    },

    dispatchToExtensions: function(name, arguments)
    {
        for each (var e in this.extensions)
        {
            try
            {
                if (name in e)
                    e[name].apply(e, arguments);
            }
            catch(e)
            {
                Cu.reportError(e);
            }
        }
    },

    forEachWindow: function(func)
    {
        var enumerator = Services.wm.getEnumerator("navigator:browser");
        while (enumerator.hasMoreElements())
        {
            try
            {
                var win = enumerator.getNext();
                if (win.Firebug)
                    func(win);
            }
            catch(e)
            {
                Cu.reportError(e)
            }
        }
    }
}

// ********************************************************************************************* //

// For a detailed description of all preferences see:
// http://getfirebug.com/wiki/index.php/Firebug_Preferences

// Global
FirebugLoader.defaultPrefs = {
    "defaultModuleList": "",
    "architecture": "inProcess",

    "strict.debug": false,
    "defaultPanelName": "html",
    "throttleMessages": true,
    "textSize": 0,
    "showInfoTips": true,
    "textWrapWidth": 100,
    "framePosition": "bottom",
    "previousPlacement": 0,
    "showErrorCount": true,
    "viewPanelOrient": false,
    "allPagesActivation": "none",
    "hiddenPanels": "",
    "panelTabMinWidth": 50,
    "sourceLinkLabelWidth": 17,
    "currentVersion": "",
    "showFirstRunPage": true,
    "useDefaultLocale": false,
    "activateSameOrigin": true,
    "toolbarCustomizationDone": false,
    "addonBarOpened": false,
    "showBreakNotification": true,
    "showStatusIcon": false,
    "stringCropLength": 50,

// Command line
    "commandEditor": false,
    "alwaysShowCommandLine": false,

// Search
    "searchCaseSensitive": false,
    "searchGlobal": true,
    "searchUseRegularExpression": false,

    "netSearchHeaders": false,
    "netSearchParameters": false,
    "netSearchResponseBody": false,

// Console
    "showJSErrors": true,
    "showJSWarnings": false,
    "showCSSErrors": false,
    "showXMLErrors": false,
    "showChromeErrors": false,
    "showChromeMessages": false,
    "showExternalErrors": false,
    "showNetworkErrors": true,
    "showXMLHttpRequests": true,
    "showStackTrace": false,
    "console.logLimit": 500,
    "console.enableSites": false,
    "tabularLogMaxHeight": 200,
    "consoleFilterTypes": "all",
    "memoryProfilerEnable": false,

// HTML
    "showCommentNodes": false,
    "showTextNodesWithWhitespace": false,
    "showTextNodesWithEntities": true,
    "showFullTextNodes": true,
    "highlightMutations": true,
    "expandMutations": false,
    "scrollToMutations": false,
    "shadeBoxModel": true,
    "showQuickInfoBox": false,
    "displayedAttributeValueLimit": 1024,
    "multiHighlightLimit": 250,

// CSS
    "onlyShowAppliedStyles": false,
    "showUserAgentCSS": false,
    "expandShorthandProps": false,
    "showMozillaSpecificStyles": false,
    "computedStylesDisplay": "grouped",
    "cssEditMode": "Source",

// Script
    "breakOnErrors": false,
    "trackThrowCatch": false,
    "script.enableSites": false,
    "scriptsFilter": "all",
    "replaceTabs": 4,
    "filterSystemURLs": true,
    "maxScriptLineLength": 10000,

// Stack
    "omitObjectPathStack": false,

// DOM
    "showUserProps": true,
    "showUserFuncs": true,
    "showDOMProps": true,
    "showDOMFuncs": false,
    "showDOMConstants": false,
    "showInlineEventHandlers": false,
    "ObjectShortIteratorMax": 3,
    "showEnumerableProperties": true,
    "showOwnProperties": false,

// Layout
    "showRulers": true,

// Net
    "netFilterCategory": "all",
    "net.logLimit": 500,
    "net.enableSites": false,
    "netDisplayedResponseLimit": 102400,
    "netDisplayedPostBodyLimit": 10240,
    "net.hiddenColumns": "netProtocolCol netLocalAddressCol",
    "netPhaseInterval": 1000,
    "sizePrecision": 1,
    "netParamNameLimit": 25,
    "netShowPaintEvents": false,
    "netShowBFCacheResponses": true,
    "netHtmlPreviewHeight": 100,

// JSON Preview
    "sortJsonPreview": false,

// Cache
    "cache.mimeTypes": "",
    "cache.responseLimit": 5242880,

// External Editors
    "externalEditors": "",

// Keyboard
    "key.shortcut.reenterCommand": "accel shift e",
    "key.shortcut.toggleInspecting": "accel shift c",
    "key.shortcut.toggleQuickInfoBox": "accel shift i",
    "key.shortcut.toggleProfiling": "accel shift p",
    "key.shortcut.focusCommandLine": "accel shift l",
    "key.shortcut.focusFirebugSearch": "accel f",
    "key.shortcut.focusWatchEditor": "accel shift n",
    "key.shortcut.focusLocation": "accel shift VK_SPACE",
    "key.shortcut.nextObject": "accel .",
    "key.shortcut.previousObject": "accel :",
    "key.shortcut.toggleFirebug": "VK_F12",
    "key.shortcut.detachFirebug": "accel VK_F12",
    "key.shortcut.leftFirebugTab": "accel shift VK_PAGE_UP",
    "key.shortcut.rightFirebugTab": "accel shift VK_PAGE_DOWN",
    "key.shortcut.previousFirebugTab": "accel `",
    "key.shortcut.clearConsole": "accel shift r",
    "key.shortcut.navBack": "accel shift VK_LEFT",
    "key.shortcut.navForward": "accel shift VK_RIGHT",
    "key.shortcut.increaseTextSize": "accel +",
    "key.shortcut.decreaseTextSize": "accel -",
    "key.shortcut.normalTextSize": "accel 0",

// Accessibility
    "a11y.enable": false,

// Tracing Options
    "DBG_FBS_JSDCONTEXT": false,   // firebug trace scriptinfo(huge)
    "DBG_FBS_FF_START": false,     // firebug trace from FF start(huge)
    "DBG_FBS_CREATION": false,     // firebug script creation
    "DBG_FBS_BP": false,           // firebug breakpoints
    "DBG_FBS_SRCUNITS": false,     // firebug script creation
    "DBG_FBS_ERRORS": false,       // firebug errors
    "DBG_FBS_FINDDEBUGGER": false, // firebug findDebugger
    "DBG_FBS_STEP": false,         // firebug stepping
    "DBG_FBS_TRACKFILES": false,   // dump all js files to disk
    "DBG_FBS_FUNCTION": false,     // firebug new Function
    "DBG_ACTIVATION": false,       // firebug.js and tabWatcher.js
    "DBG_BP": false,               // debugger.js and firebug-services.js; lots of output
    "DBG_COMPILATION_UNITS": false,// debugger.js and firebug-services.js; lots of output
    "DBG_TOPLEVEL": false,         // top level jsd scripts
    "DBG_STACK": false,            // call stack: mostly debugger.js
    "DBG_WATCH": false,            // Watch expressions
    "DBG_UI_LOOP": false,          // debugger.js
    "DBG_ERRORS": false,           // error.js
    "DBG_ERRORLOG": false,         // error.js
    "DBG_FUNCTION_NAMES": false,   // heuristics for anon functions
    "DBG_EVAL": false,             // debugger.js and firebug-service.js
    "DBG_EVENTS": false,           // browser generated events
    "DBG_PANELS": false,           // panel selection
    "DBG_CACHE": false,            // sourceCache
    "DBG_CONSOLE": false,          // console
    "DBG_COMMANDLINE": false,      // command line
    "DBG_CSS": false,              //
    "DBG_CSS_PARSER": false,       //
    "DBG_DBG2FIREBUG": false,      //
    "DBG_DOM": false,              //
    "DBG_DOMPLATE": false,         // domplate engine
    "DBG_DISPATCH": false,         //
    "DBG_HTML": false,             //
    "DBG_LINETABLE": false,        //
    "DBG_LOCATIONS": false,        // panelFileList
    "DBG_MEMORY_PROFILER": false,  //
    "DBG_SOURCEFILES": false,      // debugger and sourceCache
    "DBG_WINDOWS": false,          // tabWatcher: dispatch events; very useful for understand modules/panels
    "DBG_NET": false,              // net.js
    "DBG_NET_EVENTS": false,       // net.js - network events
    "DBG_INITIALIZE": false,       // initialize FB
    "DBG_REGISTRATION": false,     // registry (modules panels,
    "DBG_INSPECT": false,          // inspector
    "DBG_OPTIONS": false,          //
    "DBG_FBS_FLUSH": false,        //
    "DBG_HTTPOBSERVER": false,     // Centralized HTTP Observer
    "DBG_SPY": false,              // spy.js
    "DBG_EDITOR": false,           // Inline editors
    "DBG_SHORTCUTS": false,        // Keyboard shortcuts
    "DBG_A11Y": false,             // a11y
    "DBG_LOCALE": false,           // localization: missing strings
    "DBG_INFOTIP": false,          // popup info tip in panels
    "DBG_ANNOTATIONS": false,      // Page annotations service
    "DBG_XMLVIEWER": false,        // XML explorer
    "DBG_JSONVIEWER": false,       // JSON explorer
    "DBG_SVGVIEWER": false,        // SVG explorer
    "DBG_FONTS": false,            // Fonts information and font viewer
    "DBG_ACTIVITYOBSERVER": false, // Net panel's activity observer
    "DBG_TOOLTIP": false,          // tooltip debugging
    "DBG_HISTORY": false,          // panel navigation history
    "DBG_STORAGE": false,          // storageService
    "DBG_MODULES": false,          // moduleloading
    "DBG_PROFILER": false,         // profiler
    "DBG_SEARCH": false,           // search box
    "DBG_EXTERNALEDITORS": false,  // integration with external editors/IDEs
    "DBG_OBSERVERS": false,        // track/untrack support: should be set: then restart Firefox
    "DBG_EVENTLISTENERS": false,   // track/untrack for registered event listeners: restart needed
}

// ********************************************************************************************* //

var prefTypeMap = (function()
{
    var map = {}, br = Ci.nsIPrefBranch;
    map["string"] = map[br.PREF_STRING] = "CharPref";
    map["boolean"] = map[br.PREF_BOOL] = "BoolPref";
    map["number"] = map[br.PREF_INT] = "IntPref";
    return map;
})();

FirebugLoader.prefDomain = "extensions.firebug.";

FirebugLoader.getPref = function(prefDomain, name)
{
    var prefName;
    if (name == undefined)
        prefName = FirebugLoader.prefDomain + prefDomain;
    else
        prefName = prefDomain + "." + name;

    var prefs = Services.prefs;

    var type = prefTypeMap[prefs.getPrefType(prefName)];
    if (type)
        var value = prefs["get" + type](prefName);

    if (FBTrace.DBG_OPTIONS)
    {
        FBTrace.sysout("options.getPref " + prefName + " has type " +
            type + " and value " + value);
    }

    return value;
}

FirebugLoader.setPref = function(name, value)
{
    var prefName = FirebugLoader.prefDomain + name;
    var prefs = Services.prefs;

    var type = prefTypeMap[typeof value];
    if (type)
        value = prefs["set" + type](prefName, value);

    return value;
}

FirebugLoader.registerDefaultPrefs = function (prefMap, domain)
{
    prefMap = prefMap || this.defaultPrefs;
    domain = domain || this.prefDomain;
    var pb = Services.prefs.getDefaultBranch(domain);

    for (var name in prefMap)
    {
        var value = prefMap[name];
        var type = prefTypeMap[typeof value];

        pb["set" + type](name, value);
    }
}

// not really needed but someone on amo decided to require clearing default prefs
// clear only prefs that are not modified by user
// assumes that if "foo" isn't user modified "foo.*" are not modified as well
FirebugLoader.clearDefaultPrefs = function(domain)
{
    domain = domain || this.prefDomain;
    var pb = Services.prefs.getDefaultBranch(domain);

    var names = pb.getChildList("");
    for each (var name in names)
    {
        if (!pb.prefHasUserValue(name))
            pb.deleteBranch(name);
    }
}

// ********************************************************************************************* //
