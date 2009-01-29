/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const nsIPrefBranch = Ci.nsIPrefBranch;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const nsIFireBugClient = Ci.nsIFireBugClient;
const nsISupports = Ci.nsISupports;
const nsIFile = Ci.nsIFile;
const nsILocalFile = Ci.nsILocalFile;
const nsISafeOutputStream = Ci.nsISafeOutputStream;
const nsIURI = Ci.nsIURI;

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const PermManager = Cc["@mozilla.org/permissionmanager;1"];
const DirService =  CCSV("@mozilla.org/file/directory_service;1", "nsIDirectoryServiceProvider");
const ioService = CCSV("@mozilla.org/network/io-service;1", "nsIIOService");

const nsIPrefService = Ci.nsIPrefService;
const prefService = PrefService.getService(nsIPrefService);

const nsIPermissionManager = Ci.nsIPermissionManager;
const permissionManager = CCSV("@mozilla.org/permissionmanager;1", "nsIPermissionManager");
const observerService = CCSV("@mozilla.org/observer-service;1", "nsIObserverService");

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const contentBox = $("fbContentBox");
const contentSplitter = $("fbContentSplitter");
const toggleCommand = $("cmd_toggleFirebug");
const detachCommand = $("cmd_toggleDetachFirebug");
const tabBrowser = $("content");
const versionURL = "chrome://firebug/content/branch.properties";


// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const prefs = PrefService.getService(nsIPrefBranch2);
const pm = PermManager.getService(nsIPermissionManager);

const DENY_ACTION = nsIPermissionManager.DENY_ACTION;
const ALLOW_ACTION = nsIPermissionManager.ALLOW_ACTION;
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

const prefNames =
[
    // Global
    "defaultPanelName", "throttleMessages", "textSize", "showInfoTips",
    "largeCommandLine", "textWrapWidth", "openInWindow", "showErrorCount",

    // Search
    "searchCaseSensitive", "searchGlobal",

    // Console
    "showJSErrors", "showJSWarnings", "showCSSErrors", "showXMLErrors",
    "showChromeErrors", "showChromeMessages", "showExternalErrors",
    "showXMLHttpRequests",

    // HTML
    "showFullTextNodes", "showCommentNodes", "showWhitespaceNodes",
    "highlightMutations", "expandMutations", "scrollToMutations", "shadeBoxModel",

    // CSS
    "showComputedStyle", "showUserAgentCSS",

    // Script
    "decompileEvals",

    // DOM
    "showUserProps", "showUserFuncs", "showDOMProps", "showDOMFuncs", "showDOMConstants",

    // Layout
    "showRulers",

    // Net
    "netFilterCategory", "collectHttpHeaders",

    // Stack
    "omitObjectPathStack",
];

const servicePrefNames = [
    "showStackTrace", // Console
    "filterSystemURLs", // Stack
    "showAllSourceFiles", "breakOnErrors",  "trackThrowCatch" // Script
];

const scriptBlockSize = 20;

// ************************************************************************************************
// Globals

var modules = [];
var activableModules = [];
var extensions = [];
var uiListeners = [];
var panelTypes = [];
var reps = [];
var defaultRep = null;
var editors = [];
var externalEditors = [];

var panelTypeMap = {};
var optionUpdateMap = {};

var deadWindows = [];
var deadWindowTimeout = 0;
var clearContextTimeout = 0;
var temporaryFiles = [];
var temporaryDirectory = null;

// ************************************************************************************************

top.Firebug =
{
    version: "1.4",

    module: modules,
    panelTypes: panelTypes,
    reps: reps,
    prefDomain: "extensions.firebug",
    servicePrefDomain: "extensions.firebug-service",

    stringCropLength: 80,

    tabBrowser: tabBrowser,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Initialization

    initialize: function()
    {
        var version = this.getVersion();
        if (version)
        {
            this.version = version;
            $('fbStatusIcon').setAttribute("tooltiptext", "Firebug "+version);

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

        this.internationalizeUI();

        this.loadExternalEditors();
        prefs.addObserver(this.prefDomain, this, false);
        prefs.addObserver(this.servicePrefDomain, this, false);

        var basePrefNames = prefNames.length;
        dispatch(modules, "initialize", [this.prefDomain, prefNames]);

        for (var i = basePrefNames; i < prefNames.length; ++i)
            this[prefNames[i]] = this.getPref(this.prefDomain, prefNames[i]);

        if (FBTrace.DBG_OPTIONS)                                                                                       /*@explore*/
        {                                                                                                              /*@explore*/
             for (var i = 0; i < prefNames.length; ++i)                                                                /*@explore*/
                FBTrace.sysout("firebug.initialize option "+this.prefDomain+"."+prefNames[i]+"="+this[prefNames[i]]+"\n");                 /*@explore*/
        }                                                                                                              /*@explore*/
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

    internationalizeUI: function()  // Substitute strings in the UI with fall back to en-US
    {
        FBL.internationalize('menu_toggleSuspendFirebug', 'label');
        FBL.internationalize('menu_disablePanels', 'label');

        // Search
        FBL.internationalize('fbSearchNext', 'label');
        FBL.internationalize('fbSearchPrev', 'label');
        FBL.internationalize('menu_searchCaseSensitive', 'label');
        FBL.internationalize('menu_searchAllFiles', 'label');
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
        if (FBTrace.DBG_INITIALIZE)                                                                                    /*@explore*/
            FBTrace.dumpProperties("firebug.initializeUI this.disabledAlways="+this.disabledAlways+					   /*@explore*/
                    " detachArgs:", detachArgs);                      												   /*@explore*/
                                                                                                                       /*@explore*/
        TabWatcher.initialize(this);

        // If another window is opened, then the creation of our first context won't
        // result in calling of enable, so we have to enable our modules ourself
        //if (fbs.enabled)
        dispatch(modules, "enable");  // allows errors to flow thru fbs and callbacks to supportWindow to begin

        dispatch(modules, "initializeUI", [detachArgs]);
    },

    shutdown: function()
    {
        TabWatcher.destroy();

        dispatch(modules, "disable");

        prefService.savePrefFile(null);
        prefs.removeObserver(this.prefDomain, this, false);
        prefs.removeObserver(this.servicePrefDomain, this, false);

        dispatch(modules, "shutdown");

        this.closeDeadWindows();
        this.deleteTemporaryFiles();
                                                                                                                       /*@explore*/
        if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("firebug.shutdown exited\n");                                       /*@explore*/
    },

    // ----------------------------------------------------------------------------------------------------------------

    getSuspended: function()
    {
        var suspendMenuItem = $("menu_toggleSuspendFirebug");
        if (suspendMenuItem.hasAttribute("suspended"))
            return suspendMenuItem.getAttribute("suspended");
        return null;
    },

    setSuspended: function(value)
    {
        var suspendMenuItem = $("menu_toggleSuspendFirebug");
        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("Firebug.setSuspended to "+value+"\n");

        if (value)
        {
            suspendMenuItem.setAttribute("suspended", value);
            $('menu_toggleSuspendFirebug').setAttribute("label", $STR("Resume Firebug"));
        }
        else
        {
            suspendMenuItem.removeAttribute("suspended");
            $('menu_toggleSuspendFirebug').setAttribute("label", $STR("Suspend Firebug"));
        }

        Firebug.resetTooltip();
    },

    toggleSuspend: function()
    {
        if (this.getSuspended())         // then we should not be visible,
        {
            if (FirebugContext.detached)
            {
                if (FBTrace.DBG_INITIALIZE)
                    FBTrace.sysout("firebug.toggleSuspend detached\n");
                FirebugContext.chrome.focus();
                this.resume();
            }
            else
                this.toggleBar(true);   // become visible and call resume()
        }
        else
        {
            this.suspend();
            this.syncBar();  // pull down the visible UI
        }
    },

    disablePanels: function(context)
    {
        Firebug.ModuleManager.disableModules(context);
    },
    
    suspend: function()  // dispatch suspendFirebug to all windows
    {
        this.broadcast('suspendFirebug', []);
    },

    suspendFirebug: function() // dispatch onSuspendFirebug to all modules
    {
        this.setSuspended("suspending");
        TabWatcher.iterateContexts(
            function suspendContext(context)
            {
                // turn every activable module off.
                for (var i = 0; i < activableModules.length; i++)
                {
                    try
                    {
                        activableModules[i].onSuspendFirebug(context);
                    }
                    catch (e)
                    {
                        try
                        {
                            var url = (context.window && context.window.location)? context.window.location : "no context.window.location";

                            if (FBTrace.DBG_ERRORS)
                                FBTrace.dumpProperties("Firebug.suspend FAILS for "+activableModules[i].paneName+" context: "+url, e);
                        }
                        catch (e2)
                        {
                            if (FBTrace.DBG_ERRORS)
                                FBTrace.dumpProperties("Firebug.suspend FAILS (no context) for "+activableModules[i].paneName, e);
                        }
                    }
                    // don't show Firebug panel as another hint we are suspended.
                    context.browser.showFirebug = false;
                    if (context.browser.detached)
                    {
                        // Pulls down the UI and put up a cover showing a resume button.
                        if (FBTrace.DBG_INITIALIZE)
                            FBTrace.sysout("suspendFirebug detached "+window.location+"\n");
                        context.chrome.setChromeDocumentAttribute("fbToolbox", "collapsed", "true");
                        context.chrome.setChromeDocumentAttribute("fbResumeBoxButton", "label", "Resume Firebug");
                        context.chrome.setChromeDocumentAttribute("fbResumeBox", "collapsed", "false");
                        context.chrome.setChromeDocumentAttribute("fbContentBox", "collapsed", "true");
                    }
                }
            }
        );

        this.setSuspended("suspended");
    },

    resume: function()
    {
        this.broadcast('resumeFirebug', []);
    },

    resumeFirebug: function()  // dispatch onResumeFirebug to all modules
    {
        this.setSuspended("resuming");
        TabWatcher.iterateContexts
        (
            function resumeContext(context)
            {
                try
                {
                    // turn every activable module on.
                    for (var i = 0; i < activableModules.length; i++)
                        activableModules[i].onResumeFirebug(context);
                }
                catch (e)
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.dumpProperties("Firebug.resumeFirebug FAILS for context: "+context.getName(), e);
                }

                if (context.browser.detached && context.originalChrome)
                {
                    // Pull down the "resume" button covering the UI, bring up the UI
                    if (FBTrace.DBG_INITIALIZE)
                        FBTrace.sysout("resumeFirebug detached "+context.chrome.window.location+"\n");
                    context.chrome.setChromeDocumentAttribute("fbToolbox", "collapsed", "false");
                    context.chrome.setChromeDocumentAttribute("fbContentBox", "collapsed", "false");
                    context.chrome.setChromeDocumentAttribute("fbResumeBox", "collapsed", "true");
                }
            }
        );

        this.setSuspended(null);
    },

    resetTooltip: function()
    {
        var tooltip = "Firebug "+ Firebug.getVersion();
        
        var fbStatusIcon = $('fbStatusIcon');
        if (fbStatusIcon.getAttribute("errors") == "on")
            tooltip +=" console: on,";
        else
            tooltip +=" console: off,";
        
        if (fbStatusIcon.getAttribute("net") == "on")
            tooltip +=" net: on,";
        else
            tooltip +=" net: off,";
        
        if (fbStatusIcon.getAttribute("jsd") == "on")
            tooltip +=" script: on";
        else
            tooltip +=" script: off,";
       
        if (Firebug.getSuspended())
            tooltip += ": " + Firebug.getSuspended();
        else
        {
            var urls = Firebug.getURLsForAllActiveContexts();
            if (urls.length > 0)
            {
                tooltip += " activated by "+urls.length+" page(s)";
                for (var i = 0; i < urls.length; i++)
                {
                    try {
                        tooltip += "\n"+decodeURI(urls[i]); 
                    } catch (e) {
                        // xxxHonza: from some reason FBTrace is undefined here.
                        dump("Firebug.resetTooltip EXCEPTION " + e + "\n");
                    }
                }
            }
            else
            {
                if(FBTrace.DBG_ERRORS)
                    FBTrace.sysout("Firebug.resetTooltip not suspended but no active modules!\n ");
            }
        }
        $('fbStatusIcon').setAttribute("tooltiptext", tooltip);
    },

    getURLsForAllActiveContexts: function()
    {
        var contextURLSet = [];  // create a list of all unique activeContexts in all modules
        for (var i = 0; i < modules.length; i++)
        {
            var module = modules[i];
            if (module.activeContexts)
            {
                for (var ic = 0; ic < module.activeContexts.length; ic++)
                {
                    try
                    {
                        var cw = module.activeContexts[ic].window;
                        /*
                        try 
                        {
                            if ( cw && ('location' in cw) && ('toString' in cw.location) )
                                FBTrace.sysout("1) Found object with location: "+cw.location.toString()+"\n");
                            if (cw && cw.location)
                                FBTrace.sysout("2) Found object with location: "+cw.location.toString()+"\n");
                        }
                        catch(e)
                        {
                            FBTrace.sysout("Trying to find location in object gave "+e+"\n");
                        }
                         */
                        if (cw)  
                        {
                            try 
                            {
                                var url = cw.location.toString(); // force it all the way to strings so we don't fight nsIDOMLocation.toString()
                                if (url)
                                {
                                    if (contextURLSet.indexOf(url) == -1)
                                        contextURLSet.push(url);
                                }
                            }
                            catch(exc)
                            {
                            // there does not seem to be a way to avoid this exception   
                            }
                        }
                    }
                    catch(e)
                    {
                        if (FBTrace.DBG_ERRORS)
                            FBTrace.dumpProperties("firebug.getURLsForAllActiveContexts could not get window.location for a context", e);
                    }
                }
            }
        }
        return this.activeContextURLs = contextURLSet;
    },
    
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Dead Windows

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

        for (var i = 0; i < arguments.length; ++i)
            TabWatcher.addListener(arguments[i]);
                                                                                                                       /*@explore*/
        if (FBTrace.DBG_INITIALIZE) FBTrace.dumpProperties("registerModule", arguments);                                               /*@explore*/
    },

    registerActivableModule: function()
    {
        activableModules.push.apply(activableModules, arguments);
        this.registerModule.apply(this, arguments);
    },

    registerExtension: function()
    {
        extensions.push.apply(extensions, arguments);

        for (var i = 0; i < arguments.length; ++i)
            TabWatcher.addListener(arguments[i]);

        for (var j = 0; j < arguments.length; j++)
            uiListeners.push(arguments[j]);
    },

    registerPanel: function()
    {
        panelTypes.push.apply(panelTypes, arguments);

        for (var i = 0; i < arguments.length; ++i)
            panelTypeMap[arguments[i].prototype.name] = arguments[i];
                                                                                                                       /*@explore*/
        if (FBTrace.DBG_INITIALIZE)                                                                                    /*@explore*/
            for (var i = 0; i < arguments.length; ++i)                                                                 /*@explore*/
                FBTrace.sysout("registerPanel "+arguments[i].prototype.name+"\n");                                     /*@explore*/
    },

    registerRep: function()
    {
        reps.push.apply(reps, arguments);
    },

    setDefaultRep: function(rep)
    {
        defaultRep = rep;
    },

    registerEditor: function()
    {
        editors.push.apply(editors, arguments);
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

        if (FBTrace.DBG_OPTIONS)                                                                                       /*@explore*/
            FBTrace.sysout("firebug.setPref type="+type+" name="+prefName+" value="+value+"\n");                       /*@explore*/
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

        FirebugChrome.updateOption(name, value);

        if (TabWatcher.contexts)
        {
            for (var i = 0; i < TabWatcher.contexts.length; ++i)
            {
                var context = TabWatcher.contexts[i];
                if (context.externalChrome)
                    context.chrome.updateOption(name, value);
            }
        }

        if (name.substr(0, 15) == "externalEditors")
        {
            this.loadExternalEditors();
        }

        delete optionUpdateMap[name];
                                                                                                                       /*@explore*/
        if (FBTrace.DBG_OPTIONS)  /*@explore*/
            FBTrace.sysout("firebug.updatePref EXIT: "+name+"="+value+"\n");                      /*@explore*/
    },

    // *******************************************************************************
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
        try {
        if (!editorId)
            return;

        var location;
        if (context)
        {
            var panel = context.chrome.getSelectedPanel();
            if (panel)
            {
                location = panel.location;
                if (!location && panel.name == "html")
                    location = context.window.document.location;
                if ( location instanceof SourceFile || location instanceof CSSStyleSheet )
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
        location = location.toString();
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
        }catch(exc) { ERROR(exc); }
    },

    getLocalSourceFile: function(context, href) 
    {
        if ( isLocalURL(href) )
            return getLocalPath(href);
        var data;
        if (context)
        {
            data = context.sourceCache.loadText(href);
        } else
        {
            var ctx = { browser: tabBrowser.selectedBrowser, window: tabBrowser.selectedBrowser.contentWindow };
            data = new SourceCache(ctx).loadText(href);
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
        var browser = FirebugChrome.getCurrentBrowser();
        browser.showFirebug = show;

        var shouldShow = show && !browser.detached;
        contentBox.setAttribute("collapsed", !shouldShow);
        contentSplitter.setAttribute("collapsed", !shouldShow);
        toggleCommand.setAttribute("checked", !!shouldShow);
        detachCommand.setAttribute("checked", !!browser.detached);
        this.showKeys(shouldShow);

        // no such method dispatch(modules, show ? "showUI" : "hideUI", [browser, FirebugContext]);
    },

    showKeys: function(shouldShow)
    {
        var keyset = document.getElementById("mainKeyset");
        var keys = FBL.getElementByClass(keyset, "fbOnlyKey");
        for (var i = 0; i < keys.length; i++)
        {
            keys[i].setAttribute("disabled", !!shouldShow);
        }
    },

    toggleBar: function(forceOpen, panelName)
    {
        if (Firebug.openInWindow)
            return this.toggleDetachBar(true);

        var toggleOff = (forceOpen == undefined) ? !contentBox.collapsed : !forceOpen;
        if (toggleOff == contentBox.collapsed)
            return;

        var browser = FirebugChrome.getCurrentBrowser();
        
        if (panelName)
            browser.chrome.selectPanel(panelName);

        if (browser.detached)
            browser.chrome.focus();
        else
        {
            if (toggleOff)
                browser.chrome.hidePanel();
            else
                browser.chrome.syncPanel();

            this.showBar(!toggleOff);
        }
    },

    toggleDetachBar: function(forceOpen)
    {
        var browser = FirebugChrome.getCurrentBrowser();
        if (!forceOpen && browser.detached)
        {
            browser.chrome.close();
            detachCommand.setAttribute("checked", false);
        }
        else
            this.detachBar();
    },

    detachBar: function()
    {
        var browser = FirebugChrome.getCurrentBrowser();
        if (!browser.chrome)
            return;

        if (browser.detached)
            browser.chrome.focus();
        else
        {
            if (FirebugContext)
                FirebugContext.detached = true;

            browser.detached = true;

            var args = {
                    FBL: FBL,
                    Firebug: this,
                    browser: browser,
                    context: FirebugContext
            };
            openWindow("Firebug", "chrome://firebug/content/firebug.xul", "", args);
            detachCommand.setAttribute("checked", true);

            FirebugChrome.clearPanels();
            this.syncBar();
        }
    },

    syncBar: function()
    {
        var browser = FirebugChrome.getCurrentBrowser();
        this.showBar(browser && browser.showFirebug);
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

        var browser = FirebugChrome.getCurrentBrowser();
        if (!browser.chrome)
            return;

        var panel = browser.chrome.getSelectedPanel();
        if (panel && panel.name != "console")
        {
            browser.chrome.selectPanel("console");
            cancelEvent(event);
        }
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
     */
    getPanelState: function(panel)
    {
        var persistedState = panel.context.persistedState;
        return persistedState ? persistedState.panelState[panel.name] : null;
    },

    showPanel: function(browser, panel)
    {
        dispatch(modules, "showPanel", [browser, panel]);
    },

    showSidePanel: function(browser, panel)
    {
        dispatch(modules, "showSidePanel", [browser, panel]);
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
        for (var i = 0; i < reps.length; ++i)
        {
            var rep = reps[i];
            try
            {
                if (rep.supportsObject(object, type))
                    return rep;
            }
            catch (exc)
            {
                if (FBTrace.dumpProperties)
                {
                    FBTrace.dumpProperties("firebug.getRep FAILS at i/reps.length: "+i+"/"+reps.length+" type:"+type+" exc:", exc);
                    FBTrace.dumpProperties("firebug.getRep reps[i]", reps[i]);
                    FBTrace.dumpStack("firebug.getRep");
                }
            }
        }

        return defaultRep;
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
        if (iid.equals(nsIFireBugClient) || iid.equals(nsISupports))
        {
            return this;
        }

        throw Components.results.NS_NOINTERFACE;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
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
            if (FBTrace.DBG_OPTIONS) FBTrace.sysout("firebug.observe name = value: "+name+"= "+value+"\n");                /*@explore*/
            this.updatePref(name, value);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsIFireBugClient  These are per XUL window callbacks

    enable: function()  // Called by firebug-service when the first context is created.
    {
        dispatch(modules, "enable");
    },

    disable: function()
    {
        dispatch(modules, "disable");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // TabWatcher Owner

    enableContext: function(win, uri)  // currently this can be called with nsIURI or a string URL.
    {
        if (FBTrace.DBG_WINDOWS)                       														/*@explore*/
            FBTrace.sysout("-> enableContext for: ", ((uri instanceof nsIURI)?uri.spec:uri)+"\n");                             				/*@explore*/

        if ( dispatch2(extensions, "acceptContext", [win, uri]) )
            return true;
        if ( dispatch2(extensions, "declineContext", [win, uri]) )
            return false;

        if (Firebug.getSuspended())  // during suspend we will not create new contexts
            return false;
        return true;
    },

    createTabContext: function(win, browser, chrome, state)
    {
        return new Firebug.TabContext(win, browser, chrome, state);
    },

    destroyTabContext: function(browser, context)
    {
        if (context)
        {
            // Persist remnants of the context for restoration if the user reloads
            context.browser.panelName = context.panelName;
            context.browser.sidePanelNames = context.sidePanelNames;

            if (browser.detached || context == FirebugContext)
            {
                clearContextTimeout = setTimeout(function delayClearContext()
                {
                    if (context == FirebugContext)
                    {
                        browser.isSystemPage = true;  // XXXjjb I don't believe this is ever tested.
                        Firebug.showContext(browser, null);
                    }
                }, 100);

                browser.chrome.clearPanels();
            }

            if (context.externalChrome)
            {
                if (browser.firebugReload)
                    delete browser.firebugReload; // and don't kiiWindow
                else
                    this.killWindow(context.browser, context.externalChrome);
            }
        }
        else if (browser.detached)
            this.killWindow(browser, browser.chrome);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // TabWatcher Listener

    initContext: function(context, persistedState)
    {
        context.panelName = context.browser.panelName;
        if (context.browser.sidePanelNames)
            context.sidePanelNames = context.browser.sidePanelNames;
        if (FBTrace.DBG_ERRORS && !context.sidePanelNames)
            FBTrace.dumpProperties("firebug.initContext sidePanelNames:",context.sidePanelNames);
    },

    showContext: function(browser, context)
    {
        if (clearContextTimeout)
        {
            clearTimeout(clearContextTimeout);
            clearContextTimeout = 0;
        }

        if (deadWindowTimeout)
            this.rescueWindow(browser);

        if (context)
        {
            if (browser)
                browser.chrome.showContext(browser, context);  // if context null, no-op

            FirebugContext = context;

            if (FBTrace.DBG_DISPATCH || FBTrace.DBG_ERRORS)
                FBTrace.sysout("firebug.showContext set FirebugContext: "+context.getName()+"\n");

            if (this.isDisabledFor(FirebugContext))  // then auto-suspend
            {
                    var browser = FirebugChrome.getCurrentBrowser();
                    if (browser && !browser.detached && !browser.showFirebug)
                        this.suspend();
            }
            else // see issue 1073
            {
                if (Firebug.getSuspended())
                    Firebug.resume();  // This will cause onResumeFirebug for every context including this one.
            }
            
            this.syncBar();
        }
    },

    isDisabledFor: function(context)
    {
        for (var i = 0; i < activableModules.length; i++)
            if (activableModules[i].isEnabled(context)) return false;
        return true;
    },

    watchWindow: function(context, win)
    {
        for (var panelName in context.panelMap)
        {
            var panel = context.panelMap[panelName];
            panel.watchWindow(win);
        }
    },

    unwatchWindow: function(context, win)
    {
        for (var panelName in context.panelMap)
        {
            var panel = context.panelMap[panelName];
            panel.unwatchWindow(win);
        }
    },

    loadedContext: function(context)
    {if (!context.browser.currentURI) FBTrace.sysout("firebug.loadedContext problem browser ", context.browser);
        // re-synchronize after load if this context is showing
        if (this.tabBrowser.currentURI.spec == context.browser.currentURI.spec)
            context.browser.chrome.showContext(context.browser, context);
    },
    
    onSourceFileCreated: function(context, sourceFile)
    {
        dispatch(modules, "onSourceFileCreated", [context, sourceFile]);
    },
    //***********************************************************************

    getTabIdForWindow: function(aWindow)
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
                return tab.linkedPanel;
            }
        } catch (ex) {}

        return null;
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
    this.fbListeners = [];
}
Firebug.Listener.prototype =
{
    addListener: function(listener)
    {
        this.fbListeners.push(listener);
    },

    removeListener: function(listener)
    {
        remove(this.fbListeners, listener);
    }
};

// ************************************************************************************************

Firebug.Module = extend(new Firebug.Listener(),
{
    /**
     * Called when the window is opened.
     */
    initialize: function()
    {
        this.fbListeners = [];
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
     * Called when the window is closed.
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

    showPanel: function(browser, panel)
    {
    },

    showSidePanel: function(browser, panel)
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

Firebug.Panel =
{
    searchable: false,
    extSearch: false,
    editable: true,
    order: 2147483647,
    statusSeparator: "<",

    initialize: function(context, doc)
    {
        this.context = context;
        this.document = doc;

        this.panelNode = doc.createElement("div");
        this.panelNode.ownerPanel = this;

        setClass(this.panelNode, "panelNode panelNode-"+this.name+" contextUID="+context.uid);
        doc.body.appendChild(this.panelNode);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.initialize panelNode for "+this.name+"\n");

        this.initializeNode(this.panelNode);
    },

    destroy: function(state) // Panel may store info on state
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("firebug.destroy panelNode for "+this.name+"\n");

        if (this.panelNode)
            delete this.panelNode.ownerPanel;

        this.destroyNode();
    },

    detach: function(oldChrome, newChrome)
    {
        this.lastScrollTop = this.panelNode.scrollTop;
    },

    reattach: function(doc)
    {
        this.document = doc;

        if (this.panelNode)
        {
            this.panelNode = doc.adoptNode(this.panelNode, true);
            this.panelNode.ownerPanel = this;
            doc.body.appendChild(this.panelNode);
            this.panelNode.scrollTop = this.lastScrollTop;
            delete this.lastScrollTop;
        }
    },

    // Called after module.initialize; addEventListener-s here
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
            if (!this.context.browser) // XXXjjb this is bug. Somehow the panel context is not FirebugContext.
            {
            	if (FBTrace.DBG_ERRORS)
            		FBTrace.sysout("firebug.Panel showToolbarButtons this.context has no browser, this:", this)
                return;
            }
            var buttons = this.context.browser.chrome.$(buttonsId);
            if (buttons)
                collapse(buttons, show ? "false" : "true");
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.dumpProperties("firebug.Panel showToolbarButtons FAILS", exc);
                if (!this.context.browser)FBTrace.dumpStack("firebug.Panel showToolbarButtons no browser");
            }
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
            FBTrace.sysout("navigate "+object+" when this.location="+this.location+"\n");
        if (!object)
            object = this.getDefaultLocation(this.context);
        if (!object)
        	object = null;  // not undefined.

        if ( !this.location || (object != this.location) )  // if this.location undefined, may set to null
        {
            if (FBTrace.DBG_PANELS)
                FBTrace.sysout("navigate to location "+object+"\n");
            
            this.location = object;
            this.updateLocation(object);

            // XXXjoe This is kind of cheating, but, feh.
            this.context.chrome.onPanelNavigate(object, this);
            if (uiListeners.length > 0) dispatch(uiListeners, "onPanelNavigate", [object, this]);  // TODO: make this.context.chrome a uiListener
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
            var locA = self.getObjectLocation(a);
            var locB = self.getObjectLocation(b);
            if(locA > locB)
                return 1;
            if(locA < locB)
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

        if(FBTrace.DBG_PANELS)    /*@explore*/
            FBTrace.sysout("firebug.select "+this.name+" forceUpdate: "+forceUpdate+" "+object+((object==this.selection)?"==":"!=")+this.selection);  

        if (forceUpdate || object != this.selection)
        {
            this.selection = object;
            this.updateSelection(object);

            // XXXjoe This is kind of cheating, but, feh.
            this.context.chrome.onPanelSelect(object, this);
            if (uiListeners.length > 0)
                dispatch(uiListeners, "onPanelSelect", [object, this]);  // TODO: make this.context.chrome a uiListener
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
     * 
     * Implementors should return an array containing the constants supported
     * by the search algorithm. The supported options are defined in the search
     * section of the prefNames array.
     * 
     * Currently these are "searchCaseSensitive" and "searchGlobal".
     */
    getSearchCapabilities: function()
    {
        return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    // Called when "Options" clicked. Return array of
    // {label: 'name', nol10n: true,  type: "checkbox", checked: <value>, command:function to set <value>}
    getOptionsMenuItems: function()
    {
        return null;
    },

    getContextMenuItems: function(object, target)
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
    }

};

//************************************************************************************************

Firebug.AblePanel = extend(Firebug.Panel, 
{
    enablePanel: function()
    {
        var persistedPanelState = getPersistedState(this.context, this.name);
        persistedPanelState.enabled = true;

        var tab = this.getTab();
        if (tab) {
            //tab.removeAttribute("disabled");
        	tab.removeAttribute('aria-disabled');
        }
    },

    disablePanel: function()
    {
        var persistedPanelState = getPersistedState(this.context, this.name);
        persistedPanelState.enabled = false;

        var tab = this.getTab();
        if (tab) {
            //tab.setAttribute("disabled", "true");
        	tab.setAttribute('aria-disabled', 'true');
        }
        clearNode(this.panelNode);
    },
    
    getTab: function()
    {
        var chrome = this.context ? this.context.chrome : FirebugChrome;

        var tab = chrome.$("fbPanelBar2").getTab(this.name);
        if (!tab)
            tab = chrome.$("fbPanelBar1").getTab(this.name);
        return tab;
    },    
});

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
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

        measureText: function(value)
        {
            this.measureBox.innerHTML = value ? escapeHTML(value) : "m";
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

//* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
Firebug.SourceBoxPanel = function() {} // XXjjb attach Firebug so this panel can be extended.

Firebug.SourceBoxPanel = extend( extend(Firebug.MeasureBox, Firebug.AblePanel),
{
     
	initialize: function(context, doc)
    {
		Firebug.Panel.initialize.apply(this, arguments);
		this.onResize =  bind(this.onResize, this);
        contentBox.addEventListener("resize", this.onResize, true);
    },
	
    destroy: function(state)
    {
        Firebug.Panel.destroy.apply(this, arguments);
        contentBox.removeEventListener("resize", this.onResize, true);
    },
    
    // ******* override in extenders ********
    updateSourceBox: function(sourceBox)
    {
        // called just before box is shown
    },

    getDecorator: function(sourceBox)
    {
        // called at sourceBox creation, return a function to be called on a delay after the view port is updated.
        return function decorate(sourceBox, sourceFile)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("firebug.getDecorator not overridden\n");
        };
    },

    getSourceType: function()
    {
        // eg "js" or "css"
        throw "Need to override in extender";
    },
    
    // **************************************

    initializeSourceBoxes: function()
    {
        this.sourceBoxes = {};
        this.anonSourceBoxes = []; // XXXjjb I don't think these are used now, everything is in the sourceCache
    },

    showSourceBox: function(sourceBox)
    {
        if (this.selectedSourceBox)
            collapse(this.selectedSourceBox, true);

        this.selectedSourceBox = sourceBox;
        delete this.currentSearch;

        if (sourceBox)
        {
            this.updateSourceBox(sourceBox);
            collapse(sourceBox, false);
        }
    },

    createSourceBox: function(sourceFile, sourceBoxDecorator)  // decorator(sourceFile, sourceBox)
    {
        var lines = sourceFile.loadScriptLines(this.context);
        if (!lines)
        {
            lines = ["Failed to load source for sourceFile "+sourceFile];
        }

        var sourceBox = this.document.createElement("div");
        sourceBox.repObject = sourceFile;
        setClass(sourceBox, "sourceBox");
        collapse(sourceBox, true);

        sourceBox.maxLineNoChars = (lines.length + "").length;
        sourceBox.lines = lines;
        sourceBox.getLineAsHTML = getSourceBoxLineAsHTML;

        sourceBox.min = 0;
        if (sourceFile.lineNumberShift)
            sourceBox.min = sourceBox.min + sourceFile.lineNumberShift;

        sourceBox.totalMax = lines.length;
        if (sourceFile.lineNumberShift)
            sourceBox.totalMax = sourceBox.totalMax + sourceFile.lineNumberShift; // eg -1

        sourceBox.decorator = sourceBoxDecorator;
        sourceBox.getLineNode = getLineNodeIfViewable;
        	
        var paddedSource = 
        	"<div class='topSourcePadding'>" +
        		"<div class='sourceRow'><div class='sourceLine'></div><div class='sourceRowText'></div></div>"+
        	"</div>"+
            "<div class='sourceViewport'></div>"+
            "<div class='bottomSourcePadding'>"+
            	"<div class='sourceRow'><div class='sourceLine'></div><div class='sourceRowText'></div></div>"+
            "<div>";
        appendInnerHTML(sourceBox, paddedSource);

        sourceBox.viewport = getChildByClass(sourceBox, 'sourceViewport');
 
        delete this.lastScrollTop;
        
        if (sourceFile.href)
            this.sourceBoxes[sourceFile.href] = sourceBox;
        else
            this.anonSourceBoxes.push(sourceBox);

        if (FBTrace.DBG_SOURCEFILES)                                                                                                /*@explore*/
            FBTrace.sysout("firebug.createSourceBox: ", sourceFile+(sourceFile.href?" sourceBoxes":" anon "), sourceBox); /*@explore*/

        return sourceBox;
    },

    setSourceBoxLineSizes: function(sourceBox)
    {
        var view = sourceBox.viewport;
 
        var lineNoCharsSpacer = "";
        for (var i = 0; i < sourceBox.maxLineNoChars; i++)
          	lineNoCharsSpacer += "0";

        this.startMeasuring(view);
        var size = this.measureText(lineNoCharsSpacer);
        this.stopMeasuring();
           
        sourceBox.lineHeight = size.height + 1; //view.firstChild.clientHeight;  // sourceRow
        sourceBox.lineNoWidth = size.width;
 
        if (FBTrace.DBG_SOURCEFILES)
        {
            FBTrace.sysout("setSourceBoxLineSizes size", size);
            FBTrace.sysout("firebug.setSourceBoxLineSizes, sourceBox.scrollTop "+sourceBox.scrollTop+ " sourceBox.lineHeight: "+sourceBox.lineHeight+" sourceBox.lineNoWidth:"+sourceBox.lineNoWidth+"\n");
        }
    },
    
    setViewableLines: function(sourceBox)
    {            
        var scrollStep = sourceBox.lineHeight;  
        if (!scrollStep || scrollStep < 1)
        {
            this.setSourceBoxLineSizes(sourceBox);
            scrollStep = sourceBox.lineHeight;
            
            if (!scrollStep || scrollStep < 1)
            {
                if (FBTrace.DBG_SOURCEFILES)
                    FBTrace.sysout("reView scrollTop: "+scrollTop+" no scrollStep and could not set it", sourceBox);
                return null;
            }
        }
        
        var panelHeight = this.panelNode.clientHeight;
    	var newTopLine = Math.round(sourceBox.scrollTop/scrollStep);
    	var newBottomLine = Math.round((sourceBox.scrollTop + panelHeight)/scrollStep);

        sourceBox.viewableLines = newBottomLine - newTopLine;  // eg 17

        var halfViewableLines = Math.round(sourceBox.viewableLines/2.0);  //eg 8
        sourceBox.halfViewableLines = halfViewableLines;
        
        var newCenterLine = newTopLine + halfViewableLines;
        
    	if (FBTrace.DBG_SOURCEFILES)
    	{
    		FBTrace.sysout("setViewableLines scrollTop: "+sourceBox.scrollTop+" newTopLine: "+newTopLine+" newBottomLine: "+newBottomLine+"\n");
            FBTrace.sysout("setViewableLines clientHeight "+panelHeight+" sourceBox.lineHeight "+sourceBox.lineHeight+" viewableLines:"+ sourceBox.viewableLines+"\n");
    	}
      
        return newCenterLine;
    },
    
    getSourceBoxBySourceFile: function(sourceFile)
    {
        if (sourceFile.href)
        {
            var sourceBox = this.getSourceBoxByURL(sourceFile.href);
            if (sourceBox && sourceBox.repObject == sourceFile)
                return sourceBox;
            else
                return null;  // cause a new one to be created
        }

        for (var i = 0; i < this.anonSourceBoxes.length; ++i)
        {
            var sourceBox = this.anonSourceBoxes[i];
            if (sourceBox.repObject == sourceFile)
                return sourceBox;
        }
    },

    getSourceBoxByURL: function(url)
    {
        // if this.sourceBoxes is undefined, you need to call initializeSourceBoxes in your panel.initialize()
        return url ? this.sourceBoxes[url] : null;
    },
    
    renameSourceBox: function(oldURL, newURL)
    {
    	var sourceBox = this.sourceBoxes[oldURL];
    	if (sourceBox)
    	{
    		delete this.sourceBoxes[oldURL];
    		this.sourceBoxes[newURL] = sourceBox;
    	}
    },

    showSourceFile: function(sourceFile)
    {
        var sourceBox = this.getSourceBoxBySourceFile(sourceFile);
        if (FBTrace.DBG_SOURCEFILES)                                                                                                /*@explore*/
            FBTrace.sysout("firebug.showSourceFile: "+sourceFile, sourceBox);  
        if (!sourceBox)
        {
            sourceBox = this.createSourceBox(sourceFile, this.getDecorator());
            this.panelNode.appendChild(sourceBox);
            this.setSourceBoxLineSizes(sourceBox);
            this.buildViewAround(sourceBox);
        }

        this.showSourceBox(sourceBox);
    },

    getSourceLink: function(lineNo)
    {
        if (!this.selectedSourceBox)
            return;
    	if (!lineNo)
    		lineNo = this.selectedSourceBox.firstViewableLine + this.selectedSourceBox.halfViewableLines;
        return new SourceLink(this.selectedSourceBox.repObject.href, lineNo, this.getSourceType());
    },

    scrollToLine: function(href, lineNo, highlighter)
    {
        if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("SourceBoxPanel.scrollToLine: "+lineNo+"@"+href+"\n");

        if (this.context.scrollTimeout)
        {
            this.context.clearTimeout(this.contextscrollTimeout);
            delete this.context.scrollTimeout
        }

        this.context.scrollTimeout = this.context.setTimeout(bindFixed(function()
        {
        	if (!this.selectedSourceBox)
        	{
        		if (FBTrace.DBG_SOURCEFILES) 
        			FBTrace.sysout("SourceBoxPanel.scrollTimeout no selectedSourceBox");
        		return;
        	}
            // At this time we know which sourcebox is selected but the viewport is not selected.
            // We need to scroll, let the scroll handler set the viewport, then highlight any lines visible.
            var skipScrolling = false;
            if (this.selectedSourceBox.firstViewableLine && this.selectedSourceBox.lastViewableLine)
            {
                var linesFromTop = lineNo - this.selectedSourceBox.firstViewableLine;
                var linesFromBot = this.selectedSourceBox.lastViewableLine - lineNo;
                skipScrolling = (linesFromTop > 3 && linesFromBot > 3);
                if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("SourceBoxPanel.scrollTimeout: skipScrolling: "+skipScrolling+" fromTop:"+linesFromTop+" fromBot:"+linesFromBot);
            }
            else  // the selectedSourceBox has not been built
            {
                if (FBTrace.DBG_SOURCEFILES) 
                	FBTrace.sysout("SourceBoxPanel.scrollTimeout, no viewable lines", this.selectedSourceBox);
            }
                        
            if (highlighter) 
             	this.selectedSourceBox.highlighter = highlighter;
                
            if (!skipScrolling)
            {
                var halfViewableLines = this.selectedSourceBox.halfViewableLines ? this.selectedSourceBox.halfViewableLines : 10;
                if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("SourceBoxPanel.scrollTimeout: scrollTo "+lineNo+" halfViewableLines:"+halfViewableLines+" lineHeight: "+this.selectedSourceBox.lineHeight);
                var newScrollTop = (lineNo - halfViewableLines) * this.selectedSourceBox.lineHeight        
                if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("SourceBoxPanel.scrollTimeout: newScrollTop "+newScrollTop);
                this.selectedSourceBox.scrollTop = newScrollTop; // *may* cause scrolling
                if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("SourceBoxPanel.scrollTimeout: scrollTo "+lineNo+" scrollTop:"+this.selectedSourceBox.scrollTop+ " lineHeight: "+this.selectedSourceBox.lineHeight);
            }
            
            if (this.selectedSourceBox.highlighter) 
            	this.applyDecorator(this.selectedSourceBox); // may need to highlight even if we don't scroll 
                
            if (uiListeners.length > 0)
            {
                var link = new SourceLink(this.selectedSourceBox.repObject.href, lineNo, this.getSourceType());
                dispatch(uiListeners, "onLineSelect", [link]);
            }
        }, this));
    },

    jumpHighlightFactory: function(lineNo, context)
    {
        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("jumpHighlightFactory on line "+lineNo+"\n");
        return function jumpHighlightIfInView(sourceBox)
        {
            var  lineNode = sourceBox.getLineNode(lineNo);
            if (FBTrace.DBG_SOURCEFILES)
                FBTrace.sysout("jumpHighlightFactory on line "+lineNo+" lineNode:"+lineNode.innerHTML+"\n");
            if (lineNode)
            {
                setClassTimed(lineNode, "jumpHighlight", context);
            }
            return false; // not sticky
        }
    },

    // should only be called onScroll
    buildViewAround: function(sourceBox)  // defaults to first viewable lines
    {
        var view = sourceBox.viewport;
        if (!view)
        {
        	if (FBTrace.DBG_ERRORS)
        		FBTrace.dumpProperties("buildViewAround got no viewport form sourceBox", sourceBox);
        	return;
        }

     	var lineNo = this.setViewableLines(sourceBox);
     	if (!lineNo)
     		return;

        var topLine = 1; // will be view.firstChild
        if (lineNo)
            topLine = lineNo - sourceBox.halfViewableLines;  // eg 2544 - 8

        if (topLine < 1)  // the lineNo was less than half the viewable lines, eg 4-8 = -4
            topLine = 1;

        var bottomLine = topLine + sourceBox.viewableLines;  // eg 2544 - 8 + 17
        if (bottomLine > sourceBox.totalMax)
        {
            bottomLine = sourceBox.totalMax;
            topLine = bottomLine - sourceBox.viewableLines;
            if (topLine < 1)
                topLine = 1;
        }

        // Zero-based childNode index in view for lineNo. 2544 - (2544 - 8) = 8 or 4 - 1 = 3
        var centralLineNumber = lineNo ? (lineNo - topLine) : -1;

        clearNode(view);

        // Set the size on the line number field so the padding is filled with same style as source lines.
        var newScrollTop = (topLine - 1) * sourceBox.lineHeight;
        view.previousSibling.style.height = newScrollTop + "px";
        view.nextSibling.style.height = (sourceBox.totalMax - bottomLine) * sourceBox.lineHeight + "px";
        
        //sourceRow
        view.previousSibling.firstChild.style.height = newScrollTop + "px";
        view.nextSibling.firstChild.style.height = (sourceBox.totalMax - bottomLine) * sourceBox.lineHeight + "px";
        
        //sourceLine
        view.previousSibling.firstChild.firstChild.style.height = newScrollTop + "px";
        view.nextSibling.firstChild.firstChild.style.height = (sourceBox.totalMax - bottomLine) * sourceBox.lineHeight + "px";
        
        view.previousSibling.firstChild.firstChild.style.width = sourceBox.lineNoWidth + "px";
        view.nextSibling.firstChild.firstChild.style.width = sourceBox.lineNoWidth +"px";

        sourceBox.firstViewableLine = topLine;
        sourceBox.lastViewableLine = bottomLine;

        appendScriptLines(sourceBox, topLine, bottomLine, view);

        this.lastScrollTop = sourceBox.scrollTop;  // prevent reView before sourceBoxDecoratorTimeout reset scrollTop

        this.applyDecorator(sourceBox);

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("buildViewAround topLine "+topLine+" bottomLine: "+bottomLine+" totalMax: "+sourceBox.totalMax+" prev height: "+view.previousSibling.style.height+" next height: "+view.nextSibling.style.height+"\n");

        return;
    },

    applyDecorator: function(sourceBox)
    {
        if (this.context.sourceBoxDecoratorTimeout)
        {
            this.context.clearTimeout(this.context.sourceBoxDecoratorTimeout);
            delete this.context.sourceBoxDecoratorTimeout;
        }
        this.context.sourceBoxDecoratorTimeout = this.context.setTimeout(bindFixed(function delaySourceBoxDecorator()
        {
            try
            {
                if (sourceBox.highlighter)
                {
                    var sticky = sourceBox.highlighter(sourceBox);
                    if (FBTrace.DBG_SOURCEFILES)
                    	FBTrace.sysout("sourceBoxDecoratorTimeout highlighter sticky:"+sticky, sourceBox.highlighter);
                    if (!sticky)
                        delete sourceBox.highlighter;
                }
                sourceBox.decorator(sourceBox, sourceBox.repObject);

                if (uiListeners.length > 0) dispatch(uiListeners, "onApplyDecorator", [sourceBox]);
                if (FBTrace.DBG_SOURCEFILES)
                	FBTrace.sysout("sourceBoxDecoratorTimeout "+sourceBox.repObject, sourceBox);
            }
            catch (exc)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.dumpProperties("sourcebox applyDecorator FAILS", exc);
            }
        }, this));
    },

    reView: function(sourceBox)  // called for all scroll events, including any time sourcebox.scrollTop is set
    {
        var scrollTop = sourceBox.scrollTop;

        if (scrollTop == this.lastScrollTop)
        {
        	if (FBTrace.DBG_SOURCEFILES)
        		FBTrace.sysout("reView no change to scrollTop ", sourceBox);
            return;
        }

        if (!this.lastScrollTop)
            this.lastScrollTop = 0;

        this.buildViewAround(sourceBox);
        
        this.lastScrollTop = scrollTop;
    },

    onResize: function(event)   
    {
    	// The resize target is Firebug as a whole. But most of the UI needs no special code for resize.
    	// But our SourceBoxPanel has viewport that will change size.
    	if (this.selectedSourceBox)
    	{
    		delete this.selectedSourceBox.viewableLines;  // force recompute of viewport capacity
    		delete this.selectedSourceBox.halfViewableLines;
    		this.reView(this.selectedSourceBox);
    	}
    },
    
});

function appendScriptLines(sourceBox, min, max, panelNode)
{
    var html = getSourceLineRange(sourceBox, min, max);
    appendInnerHTML(panelNode, html);
}

function getLineNodeIfViewable(lineNo)
{
    if (lineNo >= this.firstViewableLine && lineNo <= this.lastViewableLine)
    {
        var view = getChildByClass(this, 'sourceViewport');
        return view.childNodes[lineNo - this.firstViewableLine];
    }
    return null;
}

function getSourceBoxLineAsHTML(lineNo)  // XXXjjb TODO make this a prototype
{
    return escapeHTML(this.lines[lineNo]);
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
        context.chrome.select(object);
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
        var label = safeToString(object);

        var re = /\[object (.*?)\]/;
        var m = re.exec(label);
        return m ? m[1] : label;
    },

    getTooltip: function(object)
    {
        return null;
    },

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

Firebug.ActivableModule = extend(Firebug.Module,
{
    panelName: null,
    panelBar1: $("fbPanelBar1"),
    activeContexts: null,
    activeContextURLs: null,

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        this.activeContexts = [];
    },

    initializeUI: function(detachArgs)
    {
        this.updateTab(null);
    },

    initContext: function(context, persistedState)
    {
        // Add observers for permissions and preference changes so, activable modules
        // (net, script) can be properly updated.
        observerService.addObserver(this, "perm-changed", false);
        prefs.addObserver(this.getPrefDomain(), this, false);

        var persistedPanelState = this.syncPersistedPanelState(context, true);
        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("firebug.initContext panelName "+this.panelName+" persistedPanelState.enabled "+persistedPanelState.enabled+"\n");
    },

    syncPersistedPanelState: function(context, beginOrEnd)
    {
        var persistedPanelState = getPersistedState(context, this.panelName);

        persistedPanelState.enabled = this.isHostEnabled(context);

        if (persistedPanelState.enabled)
            this.panelActivate(context, beginOrEnd);
        else
            this.panelDeactivate(context, beginOrEnd);

        return persistedPanelState;
    },

    reattachContext: function(browser, context)
    {
        this.updateTab(context);
        var persistedPanelState = this.syncPersistedPanelState(context, false);
    },

    showContext: function(browser, context)
    {
        this.updateTab(context);
    },

    destroyContext: function(context)
    {
        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("firebug.destroyContext panelName "+this.panelName+"\n");
        observerService.removeObserver(this, "perm-changed");
        prefs.removeObserver(this.getPrefDomain(), this);

        this.panelDeactivate(context, true);
    },

    panelActivate: function(context, init)
    {
        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("panelActivate "+this.getPrefDomain()+" isEnabled:"+this.isEnabled(context)+"\n");

        if (Firebug.getSuspended())
            Firebug.resume();  // This will cause onResumeFirebug for every context including this one.

        if (this.isEnabled(context))
            return;

        if (this.activeContexts.length == 0)
            this.onFirstPanelActivate(context, init);

        this.activeContexts.push(context);
        Firebug.resetTooltip();
        
        var panel = context.getPanel(this.panelName, true);
        if (panel)
            panel.enablePanel();

        dispatch(modules, "onPanelActivate", [context, init, this.panelName]);
    },

    panelDeactivate: function(context, destroy)
    {
        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("panelDeactivate "+this.getPrefDomain()+" isEnabled:"+this.isEnabled(context)+"\n");

        if (!this.isEnabled(context))
            return;

        var i = this.activeContexts.indexOf(context);
        if (i != -1)
        {
            this.activeContexts.splice(i, 1);
            Firebug.resetTooltip();
        }
        else
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("panelDeactivate "+context.getName() +" not in activeContexts\n");
            return;
        }

        dispatch(modules, "onPanelDeactivate", [context, destroy, this.panelName]);

        if (!destroy)
        {
            var panel = context.getPanel(this.panelName, true);
            if (panel)
                panel.disablePanel();

            var chrome = context ? context.chrome : FirebugChrome;
            var panelBar1 = chrome.$("fbPanelBar1");

            // Refresh the panel only if it's currently selected.
            if (panel && panelBar1.selectedPanel == panel)
            {
                var state = Firebug.getPanelState(panel);
                panel.show(state);
            }
        }

        if (this.activeContexts.length == 0)
            this.onLastPanelDeactivate(context, destroy);
    },


    // ---------------------------------------------------------------------------------------

    onFirstPanelActivate: function(context, init)
    {
        // Just before onPanelActivate, no previous activecontext
    },

    onPanelActivate: function(context, init, panelName)
    {
        // Module activation code. Just added to activeContexts
    },

    onPanelDeactivate: function(context, destroy, panelName)
    {
        // Module deactivation code. Just removed from activeContexts
    },

    onLastPanelDeactivate: function(context, init)
    {
        // Just after onPanelDeactivate, no remaining activecontext
    },

    onSuspendFirebug: function(context)
    {
        // When the user requests Suspend Firebug. Modules should remove listeners, disable function that takes resources
    },

    onResumeFirebug: function(context)
    {
        // When the user requests Resume Firebug Modules should undo the work done in onSuspendFirebug
    },
    // ---------------------------------------------------------------------------------------

    isEnabled: function(context)
    {
        if (!context)
            return false;

        return (this.activeContexts.indexOf(context) != -1);
    },

    wasEnabled: function(context)
    {
        if (!context)
            return false;

        var persistedPanelState = getPersistedState(context, this.panelName);
        if (persistedPanelState)
            return persistedPanelState.enabled;

        return false;
    },

    getPrefDomain: function()
    {
        if (!this.prefDomain)
            this.prefDomain = Firebug.prefDomain + "." + this.panelName;

        return this.prefDomain;
    },

    getHostForURI: function(browserURI)
    {
        if (Firebug.filterSystemURLs)
            return isSystemURL(browserURI.spec) ? "" : browserURI.host;
        else
        {
            if (browserURI.spec.substr(0, 6) == "about:")
                return "";
            else
            {
                try
                {
                    return browserURI.host;
                }
                catch (exc)
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.dumpProperties("openPermissions browserURI.host fails for browserURI: "+safeToString(browserURI.wrappedJSObject)+" spec: "+browserURI.spec, exc);
                    return "";
                }
            }
        }
    },

    /**
     * Returns true if the module can be enabled for the specified host.
     * Returns false otherwise.
     */
    isHostEnabled: function(context)
    {
        var option = this.getHostPermission(context);
        switch (option)
        {
            case "enable":
            case "enable-site":
                return true;

            case "disable":
            case "disable-site":
                return false;
        }

        if (FBTrace.DBG_PANELS)
        {
            FBTrace.sysout("firebug.isHostEnabled UNKNOWN option: " + option +
                ", location: " + (context ? context.window.location : "null") +
                "\n");
        }
    },

    /**
     * Sets host permission for the module.
     * There are three types of permissions that can be specified in the option:
     * "enable" - the module should be enabled for all sites.
     * "disable" - the module should be disbled for all sites.
     * "enable-site" - the module should be enabled for this site.
     * "disable-site" - the module should be disabled for this site.
     */
    setHostPermission: function(context, option)
    {
        var browserURI = FirebugChrome.getBrowserURI(context);
        var prefDomain = this.getPrefDomain();
        var enable = (option.indexOf("enable") == 0) ? true : false;
        var global = (option.indexOf("site") == -1) ? true : false;

        if (FBTrace.DBG_OPTIONS)
        {
            FBTrace.sysout("firebug.setHostPermission option:"+option+" prefDomain:"+
                prefDomain+" for "+browserURI.spec+"\n");
        }

        // The preferences for both system and local pages is three-state.
        // So, it's the same logic as for site-permissions, which can
        // be set to true/false or not set at all.
        //
        // "enable" - enables system/local pages
        // "disable" - disales system/local pages
        // "" - if not set the global option is used.
        if (!browserURI.spec || isSystemURL(browserURI.spec))
            Firebug.setPref(prefDomain, "enableSystemPages", (global ? "" : option));
        else if (isLocalURL(browserURI.spec))
            Firebug.setPref(prefDomain, "enableLocalFiles", (global ? "" : option));
        else if (isDataURL(browserURI.spec))
        	return;

        if (!browserURI.spec || isSystemURL(browserURI.spec) || isLocalURL(browserURI.spec))
        {
            // If the global option is set while system or local page is displayed
            // not to forget to update the global preference.
            if (global)
                Firebug.setPref(prefDomain, "enableSites", enable);

            return;
        }

        switch(option)
        {
            case "enable-site":
                permissionManager.add(browserURI, prefDomain, permissionManager.ALLOW_ACTION);
                break;

            case "disable-site":
                permissionManager.add(browserURI, prefDomain, permissionManager.DENY_ACTION);
                break;

            default:
                permissionManager.remove(browserURI.host, prefDomain);
                Firebug.setPref(prefDomain, "enableSites", enable);
                break;
        }
    },

    /*
     * Returns current host permision for the module.
     * Return value: "enable", "disable", "enable-site" or "disable-site".
     */
    getHostPermission: function(context)
    {
        var browserURI = FirebugChrome.getBrowserURI(context);
        var prefDomain = this.getPrefDomain();

        // If it's a local-file or a system-page see preferences.
        // In case of eg resource://gre/res/hiddenWindow.html the spec can be null.
        if (!browserURI || !browserURI.spec || isSystemURL(browserURI.spec))
        {
            var option = Firebug.getPref(prefDomain, "enableSystemPages");

            // If the preference isn't set use the global option.
            return option ? option : (this.isAlwaysEnabled() ? "enable" : "disable");
        }
        else if (isLocalURL(browserURI.spec))
        {
            var option = Firebug.getPref(prefDomain, "enableLocalFiles");
            return option ? option : (this.isAlwaysEnabled() ? "enable" : "disable");
        }
        else if (isDataURL(browserURI.spec))
        {
        	return "enable-site";
        }

        switch (permissionManager.testPermission(browserURI, prefDomain))
        {
            case nsIPermissionManager.ALLOW_ACTION:
                return "enable-site";
            case nsIPermissionManager.DENY_ACTION:
                return "disable-site";

            default:
                return this.isAlwaysEnabled() ? "enable" : "disable";
        }
    },

    /**
     * Return true if the module should be enabled by default.
     */
    isAlwaysEnabled: function()
    {
        var prefDomain = this.getPrefDomain();
        return Firebug.getPref(prefDomain, "enableSites");
    },

    /**
     * Opens a dialog with list of created permissions for this module.
     */
    openPermissions: function(event, context)
    {
        cancelEvent(event);

        var browserURI = FirebugChrome.getBrowserURI(context);
        var host = this.getHostForURI(browserURI);

        var params = {
            permissionType: this.getPrefDomain(),
            windowTitle: $STR(this.panelName + ".Permissions"),
            introText: $STR(this.panelName + ".PermissionsIntro"),
            blockVisible: true,
            sessionVisible: false,
            allowVisible: true,
            prefilledHost: host,
        };

        openWindow("Browser:Permissions", "chrome://browser/content/preferences/permissions.xul",
            "", params);
    },

    observe: function(subject, topic, data)
    {
        try
        {
            // This methods observes two events:
            // perm-changed - fired when permissions are changed.
            // nsPref:changed - fired when preferences are changed.
            if (FBTrace.DBG_PANELS)
            {
                if ((topic != "perm-changed") && (topic != "nsPref:changed"))
                    FBTrace.sysout("firebug.ActivableModule.observe UNKNOWN topic "+topic+" data: "+data+"\n");
                else
                    FBTrace.sysout("firebug.ActivableModule.observe topic "+topic+" data: "+data+"\n");
            }

            if (topic == 'perm-changed')
            {
                if (subject instanceof Ci.nsIPermission)
                {
                    if (FBTrace.DBG_PANELS)
                        FBTrace.sysout("firebug.ActivableModule.observe subject:"+subject+" topic "+topic+" data: "+data+"\n");
                    var host = subject.host;
                    var prefDomain = subject.type;  // eg extensions.firebug.script
                    dispatch(modules, "activationChange", [host, prefDomain, data]); // data will be 'added' or 'deleted'
                }
                else
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.dumpProperties("!firebug.observe perm-changed subject is not an nsIPermission", subject);
                }
            }
            else if (topic == "nsPref:changed")
            {
                var prefDomain = this.getPrefDomain();
                if (data == prefDomain + ".enableLocalFiles" ||
                    data == prefDomain + ".enableSystemPages" ||
                    data == prefDomain + ".enableSites")
                {
                    if (FBTrace.DBG_PANELS)
                        FBTrace.sysout("firebug.ActivableModule.observe subject:"+subject+" topic "+topic+" data: "+data+"\n");
                    dispatch(modules, "activationChange", [null, prefDomain, data]);
                }
            }
        }
        catch (exc)
        {
            if (FBTrace.dumpProperties)
                FBTrace.dumpProperties("firebug.observe permisssions FAILS", exc);
        }
    },

    activationChange: function(host, prefDomain, data)
    {
        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("firebug.activationChange for this.getPrefDomain:"+this.getPrefDomain()+" host:"+host+" prefDomain: "+prefDomain+" data:"+ data+"\n");

        if (prefDomain == this.getPrefDomain())
        {
            var module = this;
            TabWatcher.iterateContexts(
                function changeActivation(context)
                {
                    try
                    {
                        var location = context.window.location;

                        if (FBTrace.DBG_PANELS)
                            FBTrace.sysout("trying "+ location.href +"=="+ host+((location.host.indexOf(host)!=-1)?" ***FOUND***":" no match")+"\n");

                        if (isLocalURL(location.href) || isSystemURL(location.href))
                            module.syncPersistedPanelState(context, false);
                        else if (location.host.indexOf(host) != -1)
                            module.syncPersistedPanelState(context, false);
                        else if ((prefDomain + ".enableSites") == data)
                            module.syncPersistedPanelState(context, false);
                    }
                    catch (exc)
                    {
                        if (FBTrace.DBG_ERRORS)
                            FBTrace.dumpProperties("firebug.activationChange changeActivation fails for "+location, exc);
                    }
                }
            );
        }
    },

    getMenuLabel: function(option, location)
    {
        var label = "";
        var host = "";

        switch (option)
        {
        case "disable-site":
            if (isSystemURL(location.spec))
                label = "SystemPagesDisable";
            else if (!getURIHost(location))
                label = "LocalFilesDisable";
            else
                label = "HostDisable";
            break;

        case "enable-site":
            if (isSystemURL(location.spec))
                label = "SystemPagesEnable";
            else if (!getURIHost(location))
                label = "LocalFilesEnable";
            else
                label = "HostEnable";
            break;

        case "enable":
            return $STR("panel.Enabled");

        case "disable":
            return $STR("panel.Disabled");
        }

        if (!label)
            return null;

        label = this.panelName + "." + label;
        return $STRF(label, [getURIHost(location)]);
    },

    updateTab: function(context)
    {
        var chrome = context ? context.chrome : FirebugChrome;
        var panelBar = chrome.$("fbPanelBar1");
        var tab = panelBar.getTab(this.panelName);

        // Update activable tab menu.
        tab.initTabMenu(this);

        // Update tab label.
        if (context)
        {
            var enabled = this.isEnabled(context);
            //tab.setAttribute("disabled", enabled ? "false" : "true");
            tab.setAttribute('aria-disabled', enabled ? "false" : "true");
        }
    }
});

// ************************************************************************************************

Firebug.ModuleManagerPage = domplate(Firebug.Rep,
{
    tag:
        DIV({class: "moduleManagerBox"},
            H1({class: "moduleManagerHead"},
                SPAN("$pageTitle")
            ),
            P({class: "moduleManagerDescription"},
                $STR("moduleManager.desc1")
            ),
            P({class: "moduleManagerDescription", align: "center"},
                BUTTON({class: "moduleManagerApplyButton", onclick: "$onEnable"})
            ),
            P({class: "moduleManagerDescription applyDesc", style:"font-size:11px", align: "center"}),
            //xxxHonza: there is no help page available yet. 
            /*P({class: "moduleManagerDescription", align: "center"},
                A({href:"#" },
                    "Help")
            ),*/
            P({class: "moduleManagerDescription", style: "margin-top: 15px;"},
                $STR("moduleManager.desc3"),
                SPAN("&nbsp;"),
                IMG({style: "margin-top: 5px; margin-left:0; margin-bottom: 5px; vertical-align:middle", 
                    src: "chrome://firebug/skin/activation-menu.png"})
            )
         ),

    getModuleName: function(module)
    {
        var panelType = Firebug.getPanelType(module.panelName);
        return Firebug.getPanelTitle(panelType);
    },

    onEnable: function(event)
    {
        var needReload = Firebug.ModuleManager.enableModules(this.context);

        this.refresh();

        if (needReload)
            this.context.window.location.reload();
    },

    show: function(panel, module)
    {
        try
        {
            this.module = module;
            this.context = panel.context;
            this.panelNode = panel.panelNode;
            this.panel = panel;
            this.refresh();
        }
        catch(e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.dumpProperties("firebug moduleManager show", e);
        }
    },

    hide: function(panel)
    {
        if (this.box)
            this.box.setAttribute("collapsed", "true");
    },

    refresh: function()
    {
        var currentURI = FirebugChrome.getBrowserURI(this.context);
        var hostURI = getURIHost(currentURI);

        if (isSystemURL(currentURI.spec))
            hostURI = $STR("moduleManager.systempages");
        else if (!hostURI)
            hostURI = $STR("moduleManager.localfiles");

        // Prepare arguments for the template (list of activableModules and
        // title for the apply button).
        var args = {
            modules: activableModules,
            pageTitle: $STRF("moduleManager.title", [this.getModuleName(this.module)]),
        };

        // Render panel HTML
        this.box = this.tag.replace(args, this.panelNode, this);
        this.panelNode.scrollTop = 0;

        this.applyButton = getElementByClass(this.panelNode, "moduleManagerApplyButton");
        this.applyButton.innerHTML = $STRF("moduleManager.apply", [hostURI]);

        var desc2 = getElementByClass(this.panelNode, "moduleManagerDescription", "applyDesc");
        desc2.innerHTML = $STRF("moduleManager.desc2", [$STR("Reset Panels To Disabled")]);
    }
});

// ************************************************************************************************

Firebug.ModuleManager =
{
    disableModules: function(context)
    {
        for (var i=0; i<activableModules.length; i++)
        {
            var module = activableModules[i];
            this.disableModule(context, module);
            module.updateTab(context);
        }
    },

    enableModules: function(context)
    {
        var needReload = false;
        for (var i=0; i<activableModules.length; i++)
        {
            var module = activableModules[i];
            needReload = this.enableModule(context, module) || needReload;
            module.updateTab(context);
        }

        return needReload;
    },

    disableModule: function(context, module)
    {
        if (this.isModuleEnabled(context, module))
        {
            module.setHostPermission(context, "disable");
            return true;
        }
        return false;
    },

    enableModule: function(context, module)
    {
        if (!this.isModuleEnabled(context, module))
        {
            module.setHostPermission(context, "enable-site");
            return true;
        }
        return false;
    },

    isModuleEnabled: function(context, module)
    {
        return module.isEnabled(context);
    },
} 

// ************************************************************************************************

}});
