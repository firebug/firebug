/* See license.txt for terms of usage */

// UI control of debug Logging for Firebug internals

FBL.ns(function() { with (FBL) {

//***********************************************************************************
// Module
const Cc = Components.classes;
const Ci = Components.interfaces;
const DBG_TRACE = false;
const PrefService = Cc["@mozilla.org/preferences-service;1"];
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const prefs = PrefService.getService(nsIPrefBranch2);
const nsIPrefService = Ci.nsIPrefService;
const prefService = PrefService.getService(nsIPrefService);
const prefDomain = "extensions.firebug";

this.namespaceName = "TracePanel";

Firebug.TraceModule = extend(Firebug.Console,
{
    // These will appear as options in FBTrace panel, with the DBG_ removed.
        // Also add extension.firebug.BP etc to defaults/preferences/chromebug.js if you want persistence.
    DBG_BP: false, 			// debugger.js and firebug-services.js; lots of output
    DBG_CSS: false,             // CSS panel or css stuff
    DBG_CACHE: false,   		// sourceCache
    DBG_CONSOLE: false,         // console
    DBG_DISPATCH: false, 		// lib.dispatch
    DBG_DOM: false,             // includes domplate
    DBG_DBG2FIREBUG: false,     // put trace output to Firebug console
    DBG_ERRORS: false,  		// error.js
    DBG_EVENTS: false,  		// debugger.js for event handlers, need more
    DBG_EVAL: false,    		// debugger.js and firebug-service.js
    DBG_FUNCTION_NAMES: false,  // heuristics for anon functions
    DBG_INSPECT: false, 		// inspector.js
    DBG_INITIALIZE: false,		// registry (modules panels); initialize FB
    DBG_HTML: false,            // HTML panel
    DBG_LINETABLE: false,       // lib.js creating line tables.
    DBG_NET: false,        	// net.js
    DBG_OPTIONS: false,
    DBG_PANELS: false, // panel selection.
    DBG_SHOW_SYSTEM: false,    // isSystemURL return false always.
    DBG_SOURCEFILES: false, 	// debugger and sourceCache
    DBG_STACK: false,  		// call stack, mostly debugger.js
    DBG_TOPLEVEL: false, 		// firebug-service
    DBG_TRACE: false,
    DBG_UI_LOOP: false, 		// debugger.js
    DBG_WINDOWS: false,    	// tabWatcher, dispatch events; very useful for understand modules/panels
    DBG_FBS_CREATION: false, // firebug-service script creation
    DBG_FBS_SRCUNITS: false, // firebug-service compilation units
    DBG_FBS_STEP: false,     // firebug-service stepping
    DBG_FBS_FUNCTION: false,     // firebug-service new Function
    DBG_FBS_BP: false, // firebug-service breakpoints
    DBG_FBS_ERRORS: false, // firebug-service error handling
    DBG_FBS_FINDDEBUGGER: false, // firebug-service routing calls to debug windows
    DBG_FBS_FF_START: false, // firebug-service trace from start of firefox
    DBG_FBS_FLUSH: false, // firebug-service flush to see crash point
    DBG_FBS_JSDCONTEXT: false, // firebug-service dump contexts

    debug: this.DBG_TRACE,

    injectOptions: function()
    {
        if (this.debug) FBTrace.sysout("TraceModule.injectOptions\n");
        for (p in this)
        {
            var m = reDBG.exec(p);
            if (m)
                FBTrace[p] = this[p];
        }
    },

    initialize: function(prefDomain, prefNames)
    {
        if (this.debug) FBTrace.sysout("TraceModule.initialize prefDomain="+prefDomain+"\n");

        for (var p in this)
        {
            var f = reDBG_FBS.exec(p);
            if (f)
            {
                FBTrace[p] = Firebug.getPref("extensions.firebug-service", p);
                if (this.debug)
                    FBTrace.sysout("TraceModule.initialize extensions.firebug-service."+p+"="+FBTrace[p]+"\n");
            }
            else
            {
                var m = p.indexOf("DBG_");
                if (m != -1)
                    FBTrace[p] = Firebug.getPref(prefDomain, p); // set to 'true' to turn on all traces;
                if (this.debug && m)
                    FBTrace.sysout("TraceModule.initialize "+prefDomain+"."+p+"="+FBTrace[p]+"\n");
            }
        }
        prefs.setBoolPref("browser.dom.window.dump.enabled", true);
        prefs.addObserver("extensions", this, false);
    },

    observe: function(subject, topic, data)
    {
        var m = reDBG.exec(data);
        if (m)
        {
            var prefDomain = "extensions."+m[1];
            this.resetOption(prefDomain, m[2]);
        }
    },

    resetOption: function(prefDomain, optionName)
    {
        if (!FBTrace)  // we get called in a weird scope
            return;
        try
        {
            FBTrace[optionName] = Firebug.getPref(prefDomain, optionName);
            if (this.debug)
                FBTrace.sysout("resetOption set FBTrace."+optionName+" to "+FBTrace[optionName]+" using prefDomain:"+prefDomain+"\n");
        }
        catch (exc)
        {
            FBTrace.sysout("resetOption "+optionName+" is not an option; not set in defaults/prefs.js?\n");
        }
    },

    watchWindow: function(context, win)
    {
        // Don't call the predecessor 
        // Firebug.Console module injects loadFirebugConsole method into the current-page.
        // It shouldn't be done twice.
    },
    
    initContext: function(context)
    {
        if (this.debug)
            FBTrace.sysout("TraceModule.initContext try sysout\n");
        this.context = context;
    },

    getPanel: function(context, noCreate)
    {
        return context ? context.getPanel("TraceFirebug", noCreate) : this.context.getPanel("TraceFirebug", noCreate);
    },

    showPanel: function(browser, panel)
    {
        if (!panel || panel.name != "TraceFirebug")
            return;

        if (this.debug) FBTrace.sysout("TraceModule showPanel module:\n");
    },

    logInfoOnce: function(obj, context, rep)
    {
        if (!FBTrace.avoidRecursion)
        {
            var noThrottle = true;
            FBTrace.avoidRecursion = true;
            dump(obj);
            Firebug.TraceModule.log(obj, context, "info", rep, noThrottle);
        }
        else
        {
            dump("avoided recursion \n");
        }
        FBTrace.avoidRecursion = false;
    },

    logRow: function(appender, objects, context, className, rep, sourceLink, noThrottle, noRow)
    {
        if (!context)
            context = FirebugContext;
        var panel = this.getPanel(context);
        return panel.append(appender, objects, className, rep, sourceLink, noRow);
    },


});
// ************************************************************************************************

Firebug.TracePanel = function() {};
const reDBG = /extensions\.([^\.]*)\.(DBG_.*)/;
const reDBG_FBS = /DBG_FBS_(.*)/;
Firebug.TracePanel.prototype = extend(Firebug.ConsolePanel.prototype,
{
    name: "TraceFirebug",
    title: "FBTrace",
    searchable: false,
    editable: false,
    debug: Firebug.TraceModule.DBG_TRACE,

    initializeNode: function(myPanelNode)
    {
        if (this.debug) FBTrace.sysout("TracePanel initializeNode\n");
    },

    show: function()
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel show context="+this.context+"\n");
        var consoleButtons = this.context.browser.chrome.$("fbConsoleButtons");
        collapse(consoleButtons, false);
    },

    hide: function()
    {
        if (this.debug) FBTrace.dumpStack("TraceFirebug.panel hide\n");
        if (this.context && this.context.browser)
        {
            var consoleButtons = this.context.browser.chrome.$("fbConsoleButtons");
            collapse(consoleButtons, true);
        }
    },

    watchWindow: function(win)
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel watchWindow\n");
    },

    unwatchWindow: function(win)
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel unwatchWindow\n");
        var errorWin = fbs.lastErrorWindow;
        if (errorWin)
            FBTrace.sysout("tracePanel had to clear lastErrorWindow <*><*><*><*>\n");
    },


    updateSelection: function(object)
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel updateSelection\n");
    },

    getObjectPath: function(object)
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel getObjectPath\n");
        return TabWatcher.contexts;
    },

    getDefaultSelection: function()
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel getDefaultSelection\n");
    },

    updateOption: function(name, value)
    {
        this.debug = FBTrace.DBG_TRACE;
        if (this.debug)
            FBTrace.sysout("TraceFirebug.panel updateOption this.debug="+this.debug+" name:"+name+" value:"+value+"\n");
    },

    cheat: function()
    {
        FirebugContext.window.location.href = "chrome://firebug/content/tests/crypto-hash.html";
    },

    getOptionsMenuItems: function()
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel getOptionsMenuItems for this.context="+this.context+"\n");
        var items = [];
        var self = this;

        for (p in FBTrace)
        {
            var m = p.indexOf("DBG_");
            if (m != -1)
            {
                var label = p.substr(4);
                items.push({
                    label: label,
                    nol10n: true,
                    type: "checkbox",
                    checked: FBTrace[p],
                    command: this.setOption
                });
            }
        }
        return items;
    },

    setOption: function(event)
    {
        var menuitem = event.target;
        var label = menuitem.getAttribute("label");
        var category = 'DBG_'+label;
        FBTrace[category] = !FBTrace[category];

        if (category.indexOf("_FBS_") == -1)
        {
            var prefDomain = Firebug.prefDomain;
            Firebug.setPref(Firebug.prefDomain, category, FBTrace[category] );
            prefService.savePrefFile(null);
        }
        else
        {
            var prefDomain = "extensions.firebug-service";
            prefs.setBoolPref(prefDomain+"."+category, FBTrace[category]);
            prefService.savePrefFile(null);
        }

        if (FBTrace.DBG_OPTIONS)
                FBTrace.sysout("tracePanel.setOption: "+prefDomain+"."+category+ " = " + FBTrace[category] + "\n");

    },

    getContextMenuItems: function(object, target)
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel getContextMenuItems\n");
    },

    getEditor: function(target, value)
    {
        if (this.debug) FBTrace.sysout("TraceFirebug.panel getEditor\n");
    }

});

Firebug.TraceModule.injectOptions();
Firebug.registerModule(Firebug.TraceModule);
Firebug.registerPanel(Firebug.TracePanel);

}});
