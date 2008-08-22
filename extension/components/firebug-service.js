/* See license.txt for terms of usage */

// Debug lines are marked with /*@explore*/ at column 120                                                             /*@explore*/
// Use variable name "fileName" for href returned by JSD, file:/ not same as DOM
// Use variable name "url" for normalizedURL, file:/// comparable to DOM
// Convert from fileName to URL with normalizeURL
// We probably don't need denormalizeURL since we don't send .fileName back to JSD

// ************************************************************************************************
// Constants

const CLASS_ID = Components.ID("{a380e9c0-cb39-11da-a94d-0800200c9a66}");
const CLASS_NAME = "Firebug Service";
const CONTRACT_ID = "@joehewitt.com/firebug;1";
const Cc = Components.classes;
const Ci = Components.interfaces;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const DebuggerService = Cc["@mozilla.org/js/jsd/debugger-service;1"];
const ConsoleService = Cc["@mozilla.org/consoleservice;1"];
const Timer = Cc["@mozilla.org/timer;1"];

const jsdIDebuggerService = Ci.jsdIDebuggerService;
const jsdIScript = Ci.jsdIScript;
const jsdIStackFrame = Ci.jsdIStackFrame;
const jsdICallHook = Ci.jsdICallHook;
const jsdIExecutionHook = Ci.jsdIExecutionHook;
const jsdIErrorHook = Ci.jsdIErrorHook;
const nsISupports = Ci.nsISupports;
const nsIPrefBranch = Ci.nsIPrefBranch;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const nsIComponentRegistrar = Ci.nsIComponentRegistrar;
const nsIFactory = Ci.nsIFactory;
const nsIConsoleService = Ci.nsIConsoleService;
const nsITimer = Ci.nsITimer;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const NS_ERROR_NO_INTERFACE = Components.results.NS_ERROR_NO_INTERFACE;
const NS_ERROR_NOT_IMPLEMENTED = Components.results.NS_ERROR_NOT_IMPLEMENTED;
const NS_ERROR_NO_AGGREGATION = Components.results.NS_ERROR_NO_AGGREGATION;

const PCMAP_SOURCETEXT = jsdIScript.PCMAP_SOURCETEXT;
const PCMAP_PRETTYPRINT = jsdIScript.PCMAP_PRETTYPRINT;

const COLLECT_PROFILE_DATA = jsdIDebuggerService.COLLECT_PROFILE_DATA;
const DISABLE_OBJECT_TRACE = jsdIDebuggerService.DISABLE_OBJECT_TRACE;
const HIDE_DISABLED_FRAMES = jsdIDebuggerService.HIDE_DISABLED_FRAMES;
const DEBUG_WHEN_SET = jsdIDebuggerService.DEBUG_WHEN_SET;
const MASK_TOP_FRAME_ONLY = jsdIDebuggerService.MASK_TOP_FRAME_ONLY;

const TYPE_FUNCTION_CALL = jsdICallHook.TYPE_FUNCTION_CALL;
const TYPE_FUNCTION_RETURN = jsdICallHook.TYPE_FUNCTION_RETURN;
const TYPE_TOPLEVEL_START = jsdICallHook.TYPE_TOPLEVEL_START;
const TYPE_TOPLEVEL_END = jsdICallHook.TYPE_TOPLEVEL_END;

const RETURN_CONTINUE = jsdIExecutionHook.RETURN_CONTINUE;
const RETURN_VALUE = jsdIExecutionHook.RETURN_RET_WITH_VAL;
const RETURN_THROW_WITH_VAL = jsdIExecutionHook.RETURN_THROW_WITH_VAL;
const RETURN_CONTINUE_THROW = jsdIExecutionHook.RETURN_CONTINUE_THROW;

const NS_OS_TEMP_DIR = "TmpD"

const STEP_OVER = 1;
const STEP_INTO = 2;
const STEP_OUT = 3;
const STEP_SUSPEND = -1; // XXXms: find a better way

const TYPE_ONE_SHOT = nsITimer.TYPE_ONE_SHOT;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const BP_NORMAL = 1;
const BP_MONITOR = 2;
const BP_UNTIL = 4;
const BP_ONRELOAD = 8;  // XXXjjb: This is a mark for the UI to test

const LEVEL_TOP = 1;
const LEVEL_EVAL = 2;
const LEVEL_EVENT = 3;

const COMPONENTS_FILTERS = [
    new RegExp("^(file:/.*/)extensions/%7B[\\da-fA-F]{8}-[\\da-fA-F]{4}-[\\da-fA-F]{4}-[\\da-fA-F]{4}-[\\da-fA-F]{12}%7D/components/.*\\.js$"),
    new RegExp("^(file:/.*/)extensions/firebug@software\\.joehewitt\\.com/components/.*\\.js$"),
    new RegExp("^(file:/.*/extensions/)\\w+@mozilla\\.org/components/.*\\.js$"),
    new RegExp("^(file:/.*/components/)ns[A-Z].*\\.js$"),
    new RegExp("^(file:/.*/components/)firebug-service\\.js$"),
    new RegExp("^(file:/.*/Contents/MacOS/extensions/.*/components/).*\\.js$"),
    new RegExp("^(file:/.*/modules/).*\\.jsm$"),
    ];

const COMPONENTS_RE =  new RegExp("/components/[^/]*\\.js$");

const reDBG = /DBG_(.*)/;

// ************************************************************************************************
// Globals

var jsd, fbs, prefs;

var contextCount = 0;

var urlFilters = [
    'chrome://',
    'XStringBundle',
    'x-jsd:ppbuffer?type=function', // internal script for pretty printing
    ];


var clients = [];
var debuggers = [];
var netDebuggers = [];
var scriptListeners = [];

var stepMode = 0;
var stepFrame;
var stepFrameLineId;
var stepFrameCount;
var hookFrameCount = 0;

var haltDebugger = null;

var breakpoints = {};
var breakpointCount = 0;
var disabledCount = 0;
var monitorCount = 0;
var conditionCount = 0;
var runningUntil = null;

var errorBreakpoints = [];

var profileCount = 0;
var profileStart;

var enabledDebugger = false;
var reportNextError = false;
var breakOnNextError = false;
var errorInfo = null;

var timer = Timer.createInstance(nsITimer);
var waitingForTimer = false;

// ************************************************************************************************

function FirebugService()
{
    fbs = this;

    this.wrappedJSObject = this;
    this.timeStamp = new Date();  /* explore */
    this.breakpoints = breakpoints; // so chromebug can see it /* explore */

    var appShellService = Components.classes["@mozilla.org/appshell/appShellService;1"].   		/*@explore*/
                    getService(Components.interfaces.nsIAppShellService);						/*@explore*/
    this.hiddenWindow = appShellService.hiddenDOMWindow;										/*@explore*/

    this.enabled = false;
    this.profiling = false;

    prefs = PrefService.getService(nsIPrefBranch2);
    prefs.addObserver("extensions.firebug-service", FirebugPrefsObserver, false);

    var observerService = Cc["@mozilla.org/observer-service;1"]
        .getService(Ci.nsIObserverService);
    observerService.addObserver(QuitApplicationGrantedObserver, "quit-application-granted", false);
    observerService.addObserver(QuitApplicationRequestedObserver, "quit-application-requested", false);
    observerService.addObserver(QuitApplicationObserver, "quit-application", false); 																													/*@explore*/

    this.scriptsFilter = "all";
    this.alwayFilterURLsStarting = ["chrome://chromebug", "x-jsd:ppbuffer", "chrome://firebug/content/commandLine.js"];  // TODO allow override
    this.onEvalScriptCreated.kind = "eval"; /*@explore*/
    this.onTopLevelScriptCreated.kind = "top-level"; /*@explore*/
    this.onEventScriptCreated.kind = "event"; /*@explore*/

    this.onXScriptCreatedByTag = {}; // fbs functions by script tag
    this.nestedScriptStack = Components.classes["@mozilla.org/array;1"]
                        .createInstance(Components.interfaces.nsIMutableArray);  // scripts contained in leveledScript that have not been drained
}

FirebugService.prototype =
{
    shutdown: function()
    {
        prefs.removeObserver("extensions.firebug-service", FirebugPrefsObserver);
        timer = null;

        if (!jsd)
            return;

        try
        {
            do
            {
                var depth = jsd.exitNestedEventLoop();
                //ddd("FirebugService.shutdown exitNestedEventLoop "+depth+"\n"); // just in case we are not making progress...
            }
            while(depth > 0);
        }
        catch (exc)
        {
            // Seems to be the normal path...ddd("FirebugService, attempt to exitNestedEventLoop fails "+exc+"\n");
        }

        jsd.off();
        jsd = null;
        //ddd("FirebugService.shutdown\n");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsISupports

    QueryInterface: function(iid)
    {
        if (!iid.equals(nsISupports))
            throw NS_ERROR_NO_INTERFACE;

        return this;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    get lastErrorWindow()
    {
        var win = this._lastErrorWindow;
        this._lastErrorWindow = null; // Release to avoid leaks
        return win;
    },

    countContext: function(on)
    {
        contextCount += on ? 1 : -1;

        if (on && contextCount == 1)
        {
            this.enabled = true;
            dispatch(clients, "enable");
        }
        else if (contextCount == 0)
        {
            this.enabled = false;
            dispatch(clients, "disable");
        }

        return true;
    },

    registerClient: function(client)  // clients are essentially XUL windows
    {
        clients.push(client);
    },

    unregisterClient: function(client)
    {
        for (var i = 0; i < clients.length; ++i)
        {
            if (clients[i] == client)
            {
                clients.splice(i, 1);
                break;
            }
        }
    },

    registerDebugger: function(debuggrWrapper)  // first one in will be last one called. Returns state enabledDebugger
    {
        var debuggr = debuggrWrapper.wrappedJSObject;

        if (debuggr)
        {
            debuggers.push(debuggr);
            if (fbs.DBG_FBS_FINDDEBUGGER) /*@explore*/
                ddd("fbs.registerDebugger have "+debuggers.length+" after reg debuggr.debuggerName: "+debuggr.debuggerName+" with "+debuggr.activeContexts.length+" active contexts"+"\n"); /*@explore*/
            if (debuggers.length == 1)
                this.enableDebugger();
        }
        else
            throw "firebug-service debuggers must have wrappedJSObject";

        try {
            if (debuggr.suspendActivity)
                netDebuggers.push(debuggr);
        } catch(exc) {
        }
        try {
            if (debuggr.onScriptCreated)
                scriptListeners.push(debuggr);
        } catch(exc) {
        }
        return  enabledDebugger;
    },

    unregisterDebugger: function(debuggrWrapper)
    {
        var debuggr = debuggrWrapper.wrappedJSObject;

        for (var i = 0; i < debuggers.length; ++i)
        {
            if (debuggers[i] == debuggr)
            {
                debuggers.splice(i, 1);
                break;
            }
        }
        if (fbs.DBG_FBS_FINDDEBUGGER) /*@explore*/
            ddd("fbs.unregisterDebugger have "+debuggers.length+" after unreg debuggr.debuggerName: "+debuggr.debuggerName+" with "+debuggr.activeContexts.length+" active contexts"+"\n"); /*@explore*/

        for (var i = 0; i < netDebuggers.length; ++i)
        {
            if (netDebuggers[i] == debuggr)
            {
                netDebuggers.splice(i, 1);
                break;
            }
        }
        for (var i = 0; i < scriptListeners.length; ++i)
        {
            if (scriptListeners[i] == debuggr)
            {
                scriptListeners.splice(i, 1);
                break;
            }
        }

        if (debuggers.length == 0)
            this.disableDebugger();
    },

    lockDebugger: function()
    {
        if (this.locked)
            return;

        this.locked = true;

        dispatch(debuggers, "onLock", [true]);
    },

    unlockDebugger: function()
    {
        if (!this.locked)
            return;

        this.locked = false;

        dispatch(debuggers, "onLock", [false]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    enterNestedEventLoop: function(callback)
    {
        dispatch(netDebuggers, "suspendActivity");
        fbs.nestedEventLoopDepth = jsd.enterNestedEventLoop({
            onNest: function()
            {
                dispatch(netDebuggers, "resumeActivity");
                callback.onNest();
            }
        });
        dispatch(netDebuggers, "resumeActivity");
        return fbs.nestedEventLoopDepth;
    },

    exitNestedEventLoop: function()
    {
        dispatch(netDebuggers, "suspendActivity");
        try
        {
            return jsd.exitNestedEventLoop();
        }
        catch (exc)
        {
            ddd("fbs: jsd.exitNestedEventLoop FAILS "+exc+"\n");
        }
    },

    halt: function(debuggr)
    {
        haltDebugger = debuggr;
    },

    step: function(mode, startFrame)
    {
        stepMode = mode;
        stepFrame = startFrame;
        stepFrameCount = countFrames(startFrame);
        stepFrameLineId = stepFrameCount + startFrame.script.fileName + startFrame.line;
                                                                                                                       /*@explore*/
        if (fbs.DBG_FBS_STEP) ddd("step stepMode = "+getStepName(stepMode)                                 /*@explore*/
                 +" stepFrameLineId="+stepFrameLineId+" stepFrameCount="+stepFrameCount+"\n");                         /*@explore*/
    },

    suspend: function()
    {
        stepMode = STEP_SUSPEND;
        stepFrameLineId = null;
        this.hookInterrupts();
    },

    runUntil: function(sourceFile, lineNo, startFrame, debuggr)
    {
        runningUntil = this.addBreakpoint(BP_UNTIL, sourceFile, lineNo, null, debuggr);
        stepFrameCount = countFrames(startFrame);
        stepFrameLineId = stepFrameCount + startFrame.script.fileName + startFrame.line;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    setBreakpoint: function(sourceFile, lineNo, props, debuggr)
    {
        var bp = this.addBreakpoint(BP_NORMAL, sourceFile, lineNo, props, debuggr);
        if (bp)
        {
            dispatch(debuggers, "onToggleBreakpoint", [sourceFile.href, lineNo, true, bp]);
            return true;
        }
        return false;
    },

    clearBreakpoint: function(url, lineNo)
    {
        var bp = this.removeBreakpoint(BP_NORMAL, url, lineNo);
        if (bp)
            dispatch(debuggers, "onToggleBreakpoint", [url, lineNo, false, bp]);
        else /*@explore*/
        {
            if (fbs.DBG_FBS_BP) ddd("fbs.clearBreakpoint no find for "+lineNo+"@"+url+"\n"); /*@explore*/
        }
    },

    enableBreakpoint: function(url, lineNo)
    {
        var bp = this.findBreakpoint(url, lineNo);
        if (bp && bp.type & BP_NORMAL)
        {
            bp.disabled &= ~BP_NORMAL;
            dispatch(debuggers, "onToggleBreakpoint", [url, lineNo, true, bp]);
            --disabledCount;
        }
        else {
            if (fbs.DBG_FBS_BP) ddd("fbs.enableBreakpoint no find for "+lineNo+"@"+url+"\n");
        }
    },

    disableBreakpoint: function(url, lineNo)
    {
        var bp = this.findBreakpoint(url, lineNo);
        if (bp && bp.type & BP_NORMAL)
        {
            bp.disabled |= BP_NORMAL;
            ++disabledCount;
            dispatch(debuggers, "onToggleBreakpoint", [url, lineNo, true, bp]);
        }
        else
        {
            if (fbs.DBG_FBS_BP) ddd("fbs.disableBreakpoint no find for "+lineNo+"@"+url+"\n");
        }

    },

    isBreakpointDisabled: function(url, lineNo)
    {
        var bp = this.findBreakpoint(url, lineNo);
        if (bp && bp.type & BP_NORMAL)
            return bp.disabled & BP_NORMAL;
        else
            return false;
    },

    setBreakpointCondition: function(sourceFile, lineNo, condition, debuggr)
    {
        var bp = this.findBreakpoint(sourceFile.href, lineNo);
        if (!bp)
        {
            bp = this.addBreakpoint(BP_NORMAL, sourceFile, lineNo, null, debuggr);
        }

        if (!bp)
            return;

        if (bp.hitCount <= 0 )
        {
            if (bp.condition && !condition)
            {
                --conditionCount;
            }
            else if (condition && !bp.condition)
            {
                ++conditionCount;
            }
        }
        bp.condition = condition;

        dispatch(debuggers, "onToggleBreakpoint", [sourceFile.href, lineNo, true, bp]);
    },

    getBreakpointCondition: function(url, lineNo)
    {
        var bp = this.findBreakpoint(url, lineNo);
        return bp ? bp.condition : "";
    },

    clearAllBreakpoints: function(sourceFiles)
    {
        for (var i = 0; i < sourceFiles.length; ++i)
        {
            var url = sourceFiles[i].href;
            if (!url)
                continue;

            var urlBreakpoints = breakpoints[url];
            if (!urlBreakpoints)
                continue;

            urlBreakpoints = urlBreakpoints.slice();
            for (var j = 0; j < urlBreakpoints.length; ++j)
            {
                var bp = urlBreakpoints[j];
                this.clearBreakpoint(url, bp.lineNo);
            }
         }
    },


    enumerateBreakpoints: function(url, cb)  // url is sourceFile.href, not jsd script.fileName
    {
        if (url)
        {
            var urlBreakpoints = breakpoints[url];
            if (urlBreakpoints)
            {
                for (var i = 0; i < urlBreakpoints.length; ++i)
                {
                    var bp = urlBreakpoints[i];
                    if (bp.type & BP_NORMAL)
                    {
                        if (bp.scriptsWithBreakpoint && bp.scriptsWithBreakpoint.length > 0)
                        {
                            for (var j = 0; j < bp.scriptsWithBreakpoint.length; j++)
                            {
                                var rc = cb.call(url, bp.lineNo, bp.scriptsWithBreakpoint[j], bp);
                                if (rc)
                                    return [bp];
                            }
                        } else {
                            var rc = cb.call(url, bp.lineNo, null, bp);
                            if (rc)
                                return [bp];
                        }
                    }
                }
            }
        }
        else
        {
            var bps = [];
            for (var url in breakpoints)
                bps.push(this.enumerateBreakpoints(url, cb));
            return bps;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // error breakpoints are a way of selectively breaking on errors.  see needToBreakForError
    //
    setErrorBreakpoint: function(url, lineNo, debuggr)
    {
        var index = this.findErrorBreakpoint(url, lineNo);
        if (index == -1)
        {
             errorBreakpoints.push({href: url, lineNo: lineNo });
             dispatch(debuggers, "onToggleErrorBreakpoint", [url, lineNo, true, debuggr]);
        }
    },

    clearErrorBreakpoint: function(url, lineNo, debuggr)
    {
        var index = this.findErrorBreakpoint(url, lineNo);
        if (index != -1)
        {
            errorBreakpoints.splice(index, 1);

            dispatch(debuggers, "onToggleErrorBreakpoint", [url, lineNo, false, debuggr]);
        }
    },

    hasErrorBreakpoint: function(url, lineNo)
    {
        return this.findErrorBreakpoint(url, lineNo) != -1;
    },

    enumerateErrorBreakpoints: function(url, cb)
    {
        if (url)
        {
            for (var i = 0; i < errorBreakpoints.length; ++i)
            {
                var bp = errorBreakpoints[i];
                if (bp.href == url)
                    cb.call(bp.href, bp.lineNo);
            }
        }
        else
        {
            for (var i = 0; i < errorBreakpoints.length; ++i)
            {
                var bp = errorBreakpoints[i];
                cb.call(bp.href, bp.lineNo);
            }
        }
    },

    findErrorBreakpoint: function(url, lineNo)
    {
        for (var i = 0; i < errorBreakpoints.length; ++i)
        {
            var bp = errorBreakpoints[i];
            if (bp.lineNo == lineNo && bp.href == url)
                return i;
        }

        return -1;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    monitor: function(sourceFile, lineNo, debuggr)
    {
        if (lineNo != -1 && this.addBreakpoint(BP_MONITOR, sourceFile, lineNo, null, debuggr))
        {
            ++monitorCount;
            dispatch(debuggers, "onToggleMonitor", [url, lineNo, true]);
        }
    },

    unmonitor: function(sourceFile, lineNo)
    {
        if (lineNo != -1 && this.removeBreakpoint(BP_MONITOR, sourceFile.href, lineNo))
        {
            --monitorCount;
            dispatch(debuggers, "onToggleMonitor", [sourceFile.href, lineNo, false]);
        }
    },

    isMonitored: function(url, lineNo)
    {
        var bp = lineNo != -1 ? this.findBreakpoint(url, lineNo) : null;
        return bp && bp.type & BP_MONITOR;
    },

    enumerateMonitors: function(url, cb)
    {
        if (url)
        {
            var urlBreakpoints = breakpoints[url];
            if (urlBreakpoints)
            {
                for (var i = 0; i < urlBreakpoints.length; ++i)
                {
                    var bp = urlBreakpoints[i];
                    if (bp.type & BP_MONITOR)
                        cb.call(url, bp.lineNo);
                }
            }
        }
        else
        {
            for (var url in breakpoints)
                this.enumerateBreakpoints(url, cb);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    enumerateScripts: function(length)
    {
        var scripts = [];
        jsd.enumerateScripts( {
            enumerateScript: function(script) {
                var fileName = script.fileName;
                if ( !isFilteredURL(fileName) ) {
                    scripts.push(script);
                }
            }
        });
        length.value = scripts.length;
        return scripts;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    startProfiling: function()
    {
        if (!this.profiling)
        {
            this.profiling = true;
            profileStart = new Date();

            jsd.flags |= COLLECT_PROFILE_DATA;
        }

        ++profileCount;
    },

    stopProfiling: function()
    {
        if (--profileCount == 0)
        {
            jsd.flags &= ~COLLECT_PROFILE_DATA;

            var t = profileStart.getTime();

            this.profiling = false;
            profileStart = null;

            return new Date().getTime() - t;
        }
        else
            return -1;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    enableDebugger: function()
    {
        if (waitingForTimer)
        {
            timer.cancel();
            waitingForTimer = false;
        }
        if (enabledDebugger)
            return;

        enabledDebugger = true;

        this.obeyPrefs();

        if (jsd)
        {
            if (!jsd.isOn)
                jsd.on();

            dispatch(clients, "onJSDActivate", [jsd]);

            jsd.unPause();
            this.hookScripts();
        }
        else
        {
            jsd = DebuggerService.getService(jsdIDebuggerService);
            if ( this.DBG_FBS_ERRORS )  																					/*@explore*/
                ddd("enableDebugger gets jsd service, isOn:"+jsd.isOn+" initAtStartup:"+jsd.initAtStartup+" now have "+debuggers.length+" debuggers\n");		/*@explore*/
            jsd.on();
            jsd.flags |= DISABLE_OBJECT_TRACE;

            dispatch(clients, "onJSDActivate", [jsd]);

            this.hookScripts();

            jsd.debuggerHook = { onExecute: hook(this.onDebugger, RETURN_CONTINUE) };
            jsd.debugHook = { onExecute: hook(this.onDebug, RETURN_CONTINUE) };
            jsd.breakpointHook = { onExecute: hook(this.onBreakpoint, RETURN_CONTINUE) };
            jsd.throwHook = { onExecute: hook(this.onThrow, RETURN_CONTINUE_THROW) };
            jsd.errorHook = { onError: hook(this.onError, true) };
        }
    },

    obeyPrefs: function()
    {
        try
        {
            var allPrefs = prefs.getChildList("extensions.firebug-service", {});
            for (var i = 0; i < allPrefs.length; i++)
            {
                var m = reDBG.exec(allPrefs[i]);
                if (m)
                {
                    var prefName = "DBG_"+m[1];
                    this[prefName] = FirebugPrefsObserver.getPref("extensions.firebug-service", prefName);
                }
            }
        }
        catch (e)
        {
            ddd("fbs.setting options FAILS "+e+"\n");
        }

        this.showStackTrace = prefs.getBoolPref("extensions.firebug-service.showStackTrace");
        this.breakOnErrors = prefs.getBoolPref("extensions.firebug-service.breakOnErrors");
        this.trackThrowCatch = prefs.getBoolPref("extensions.firebug-service.trackThrowCatch");
        this.scriptsFilter = prefs.getCharPref("extensions.firebug-service.scriptsFilter");
        this.filterSystemURLs = prefs.getBoolPref("extensions.firebug-service.filterSystemURLs");  // may not be exposed to users
        this.DBG_FBS_FLUSH = prefs.getBoolPref("extensions.firebug-service.DBG_FBS_FLUSH");
        this.DBG_FBS_SRCUNITS = prefs.getBoolPref("extensions.firebug-service.DBG_FBS_SRCUNITS");

        FirebugPrefsObserver.syncFilter();

        try {                                                                                                              /*@explore*/
              // CREATION and BP generate a huge trace                                                                     /*@explore*/
            this.DBG_FBS_CREATION = this.DBG_FBS_FF_START ? prefs.getBoolPref("extensions.firebug-service.DBG_FBS_CREATION") : false;  /*@explore*/
            this.DBG_FBS_BP = this.DBG_FBS_FF_START ? prefs.getBoolPref("extensions.firebug-service.DBG_FBS_BP") : false;              /*@explore*/
            this.DBG_FBS_ERRORS = prefs.getBoolPref("extensions.firebug-service.DBG_FBS_ERRORS");                                      /*@explore*/
            this.DBG_FBS_STEP = prefs.getBoolPref("extensions.firebug-service.DBG_FBS_STEP");
            this.DBG_FBS_FUNCTION = prefs.getBoolPref("extensions.firebug-service.DBG_FBS_FUNCTION");                                          /*@explore*/
        }                                                                                                                  /*@explore*/
        catch (exc)                                                                                                        /*@explore*/
        {                                                                                                                  /*@explore*/
            dumpProperties("firebug-service: constructor getBoolPrefs FAILED with exception=",exc);                        /*@explore*/
        }
    },

    disableDebugger: function()
    {
        if (fbs.DBG_FBS_FINDDEBUGGER)
            ddd("fbs.disableDebugger for enabledDebugger: "+enabledDebugger+"\n");

        if (!enabledDebugger)
            return;

        if (!timer)  // then we probably shutdown
            return;

        timer.init({observe: function()
        {
            enabledDebugger = false;

            jsd.pause();
            fbs.unhookScripts();
            jsd.off();
            dispatch(clients, "onJSDDeactivate", [jsd]);
        }}, 1000, TYPE_ONE_SHOT);

        waitingForTimer = true;
    },

    pause: function()  // must support multiple calls
    {
        if (!this.suspended)  // marker only UI in debugger.js
            this.suspended = jsd.pause();
        dispatch(clients, "onJSDDeactivate", [jsd]);
        return this.suspended;
    },

    unPause: function()
    {
        if (this.suspended)
        {
            var depth = jsd.unPause();
            if ( (this.suspended !=  1 || depth != 0) && fbs.DBG_FBS_ERRORS)
                ddd("fbs.resume unpause mismatch this.suspended "+this.suspended+" unpause depth "+depth+"\n");
            delete this.suspended;
            dispatch(clients, "onJSDActivate", [jsd]);
            return depth;
        }
        return null;
    },

    isJSDActive: function()
    {
        return (jsd && jsd.isOn && (jsd.pauseDepth == 0) );
    },

    broadcast: function(message, args)  // re-transmit the message (string) with args [objs] to XUL windows.
    {
        dispatch(clients, message, args);
        if (fbs.DBG_FBS_ERRORS)
            ddd("fbs.broadcast "+message+" to "+clients.length+" windows\n");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // jsd Hooks

    // When (debugger keyword and not halt)||(bp and BP_UNTIL) || (onBreakPoint && no conditions)
    // || interuptHook.  rv is ignored
    onBreak: function(frame, type, rv)
    {
        if (fbs.DBG_FBS_STEP) ddd("fbs.onBreak type="+getExecutionStopNameFromType(type)+"\n");                            /*@explore*/
        try
        {
            var debuggr = this.findDebugger(frame);
            if (debuggr)
                return this.breakIntoDebugger(debuggr, frame, type);
        }
        catch(exc)
        {
            ERROR("onBreak failed: "+exc);
        }
        return RETURN_CONTINUE;
    },

    // When engine encounters debugger keyword (only)
    onDebugger: function(frame, type, rv)
    {
        if (fbs.DBG_FBS_BP) ddd("fbs.onDebugger with haltDebugger="+haltDebugger+"\n");                                    /*@explore*/
        try {
            if (haltDebugger)
            {
                var debuggr = haltDebugger;
                haltDebugger = null;
                return debuggr.onHalt(frame);
            }
            else
                return this.onBreak(frame, type, rv);
            }
         catch(exc)
         {
            if (fbs.DBG_FBS_ERRORS)  /*@explore*/
                dumpProperties("onDebugger failed: ",exc); /*@explore*/
            else  /*@explore*/
                ERROR("onDebugger failed: "+exc);
            return RETURN_CONTINUE;
         }
    },

    onDebug: function(frame, type, rv)
    {
        if (fbs.DBG_FBS_ERRORS)                                                                                               /*@explore*/
            ddd("fbs.onDebug fileName="+frame.script.fileName+ " reportNextError="                							/*@explore*/
                                 +reportNextError+" breakOnNextError="+breakOnNextError+"\n");                            /*@explore*/
        if ( isFilteredURL(frame.script.fileName) )
            return RETURN_CONTINUE;
        try
        {
            var debuggr = (reportNextError || breakOnNextError) ? this.findDebugger(frame) : null;

            if (reportNextError)
            {
                reportNextError = false;
                if (debuggr)
                {
                    var hookReturn = debuggr.onError(frame, errorInfo);
                    if (hookReturn >=0)
                        return hookReturn;
                    else if (hookReturn==-1)
                        breakOnNextError = true;
                    if (breakOnNextError)
                        debuggr = this.reFindDebugger(frame, debuggr);
                }
            }

            if (breakOnNextError)
            {
                breakOnNextError = false;
                if (debuggr)
                    return this.breakIntoDebugger(debuggr, frame, type);
            }
        } catch (exc) {
            ERROR("onDebug failed: "+exc);
        }
        return RETURN_CONTINUE;
    },

    onBreakpoint: function(frame, type, val)
    {
        var scriptTag = frame.script.tag;
        if (fbs.DBG_FBS_SRCUNITS) ddd("onBreakpoint frame.script.tag="+frame.script.tag +"\n")     /*@explore*/

        if (scriptTag in this.onXScriptCreatedByTag)
        {
            var onXScriptCreated = this.onXScriptCreatedByTag[scriptTag];
            if (this.DBG_FBS_BP) ddd("onBreakpoint("+getExecutionStopNameFromType(type)+") with frame.script.tag="          /*@explore*/
                                      +frame.script.tag+" onXScriptCreated:"+onXScriptCreated.kind+"\n");
            delete this.onXScriptCreatedByTag[scriptTag];
            frame.script.clearBreakpoint(0);
            try {
                var sourceFile = onXScriptCreated(frame, type, val);
            } catch (e) {
                dumpProperties("onBreakpoint called onXScriptCreated and it didn't end well:",e);
            }

            if (fbs.DBG_FBS_SRCUNITS)
            {
                ddd("Top Scripts Uncleared:");
                for (p in this.onXScriptCreatedByTag) ddd(p+"|");
                ddd("\n")
            }
            if (!sourceFile || !sourceFile.breakOnZero || sourceFile.breakOnZero != scriptTag)
                return RETURN_CONTINUE;
            else  // sourceFile.breakOnZero matches the script we have halted.
               if (this.DBG_FBS_BP) ddd("fbs.onBreakpoint breakOnZero, continuing for user breakpoint\n");
        }


        var bp = this.findBreakpointByScript(frame.script, frame.pc);
        if (bp)
        {
            if (disabledCount || monitorCount || conditionCount || runningUntil)
            {
                if (this.DBG_FBS_BP)
                {
                    dumpProperties("onBreakpoint("+getExecutionStopNameFromType(type)+") disabledCount:"+disabledCount
                              +" monitorCount:"+monitorCount+" conditionCount:"+conditionCount+" runningUntil:"+runningUntil, bp);
                }

                if (bp.type & BP_MONITOR && !(bp.disabled & BP_MONITOR))
                    bp.debugger.onCall(frame);

                if (bp.type & BP_UNTIL)
                {
                    this.stopStepping();
                    if (bp.debugger)
                        return this.breakIntoDebugger(bp.debugger, frame, type);
                }
                else if (!(bp.type & BP_NORMAL) || bp.disabled & BP_NORMAL)
                {
                    return  RETURN_CONTINUE;
                }
                else if (bp.type & BP_NORMAL)
                {
                    var passed = testBreakpoint(frame, bp);
                    if (!passed)
                        return RETURN_CONTINUE;
                }
                // type was normal, but passed test
            }
            else  // not special, just break for sure
                return this.breakIntoDebugger(bp.debugger, frame, type);
        }
        else
        {
            if (this.DBG_FBS_BP) ddd("onBreakpoint("+getExecutionStopNameFromType(type)+") NO bp match with frame.script.tag="              /*@explore*/
                +frame.script.tag+"\n");                           /*@explore*/
        }

        if (runningUntil)
            return RETURN_CONTINUE;
        else
            return this.onBreak(frame, type, val);
    },

    onThrow: function(frame, type, rv)
    {
        if ( isFilteredURL(frame.script.fileName) )
            return RETURN_CONTINUE_THROW;
        // Remember the error where the last exception is thrown - this will
        // be used later when the console service reports the error, since
        // it doesn't currently report the window where the error occured

        this._lastErrorWindow =  getFrameGlobal(frame);

        if (fbs.trackThrowCatch)
        {
            if (fbs.DBG_FBS_ERRORS) ddd("onThrow from tag:"+frame.script.tag+":"+frame.script.fileName+"@"+frame.line+": "+frame.pc+"\n");

            var debuggr = this.findDebugger(frame);
            if (debuggr)
                return debuggr.onThrow(frame, rv);
        }

        return RETURN_CONTINUE_THROW;
    },

    onError: function(message, fileName, lineNo, pos, flags, errnum, exc)
    {
        if (fbs.DBG_FBS_ERRORS)                                                                                            /*@explore*/
        {                                                                                                              /*@explore*/
            var messageKind;                                                                                           /*@explore*/
            if (flags & jsdIErrorHook.REPORT_ERROR)                                                                    /*@explore*/
                messageKind = "Error";                                                                                 /*@explore*/
            if (flags & jsdIErrorHook.REPORT_WARNING)                                                                  /*@explore*/
                messageKind = "Warning";                                                                               /*@explore*/
            if (flags & jsdIErrorHook.REPORT_EXCEPTION)                                                                /*@explore*/
                messageKind = "Uncaught-Exception";                                                                    /*@explore*/
            if (flags & jsdIErrorHook.REPORT_STRICT)                                                                   /*@explore*/
                messageKind += "-Strict";                                                                              /*@explore*/
            ddd("fbs.onError with this.showStackTrace="+this.showStackTrace+" and this.breakOnErrors="                 /*@explore*/
                   +this.breakOnErrors+" kind="+messageKind+" msg="+message+"@"+fileName+":"+lineNo+"."+pos+"\n");     /*@explore*/
        }                                                                                                              /*@explore*/

        // global to pass info to onDebug
        errorInfo = { message: message, fileName: fileName, lineNo: lineNo, pos: pos, flags: flags, errnum: errnum, exc: exc };

        if (message=="out of memory")  // bail
            return true;

        if (this.showStackTrace)
        {
            reportNextError = true;
            //var theNeed = this.needToBreakForError(fileName, lineNo);
            // fbs.hookInterruptsToTrapErrors();
            if (fbs.DBG_FBS_ERRORS)                                                                                        /*@explore*/
                ddd("fbs.onError showStackTrace, we will try to drop into onDebug\n");       /*@explore*/

            return false; // Drop into onDebug, sometimes only
        }
        else
        {
            return !this.needToBreakForError(fileName, lineNo);
        }
    },

    onEventScriptCreated: function(frame, type, val, noNestTest)
    {
        if (fbs.showEvents)
        {
            try
            {
               if (!noNestTest)
                {
                    // In onScriptCreated we saw a script with baseLineNumber = 1. We marked it as event and nested.
                    // Now we know its event, not nested.
                    if (fbs.nestedScriptStack.length > 0)
                    {
                        fbs.nestedScriptStack.removeElementAt(0);
                    }
                    else
                    {
                        if (fbs.DBG_FBS_SRCUNITS)  // these seem to be harmless, but...
                        {
                            var script = frame.script;
                             ddd("onEventScriptCreated no nestedScriptStack: "+script.tag+"@("+script.baseLineNumber+"-"                                      /*@explore*/
                                +(script.baseLineNumber+script.lineExtent)+")"+script.fileName+"\n");                              /*@explore*/
                            ddd("onEventScriptCreated name: \'"+script.functionName+"\'\n");                 /*@explore*/
                            try {
                            ddd(script.functionSource+"\n");                 /*@explore*/
                            } catch (exc) { /*Bug 426692 */ }

                        }
                    }
                }

                var debuggr = fbs.findDebugger(frame);  // sets debuggr.breakContext
                if (debuggr)
                {
                    var sourceFile = debuggr.onEventScriptCreated(frame, frame.script, fbs.nestedScriptStack.enumerate());
                    fbs.resetBreakpoints(sourceFile);
                }
                else
                {
                    if (fbs.DBG_FBS_CREATION || fbs.DBG_FBS_SRCUNITS) ddd("fbs.onEventScriptCreated no debuggr for "+frame.script.tag+":"+frame.script.fileName+"\n");
                }
            } catch(exc) {
                dumpProperties("onEventScriptCreated failed: ", exc);
                ERROR("onEventScriptCreated failed: "+exc);
            }
        }

        fbs.clearNestedScripts();
        if (fbs.DBG_FBS_CREATION || fbs.DBG_FBS_SRCUNITS) ddd("onEventScriptCreated frame.script.tag:"+frame.script.tag+" href: "+(sourceFile?sourceFile.href:"no sourceFile")+"\n");  /*@explore*/

        return sourceFile;
    },

    onEvalScriptCreated: function(frame, type, val)
    {
        if (fbs.showEvals)
        {
            try
            {
                if (!frame.callingFrame)
                {
                    if (fbs.DBG_FBS_CREATION || fbs.DBG_FBS_SRCUNITS) ddd("No calling Frame for eval frame.script.fileName:"+frame.script.fileName+"\n");
                    // These are eval-like things called by native code. They come from .xml files
                    // They should be marked as evals but we'll treat them like event handlers for now.
                    return fbs.onEventScriptCreated(frame, type, val, true);
                }
                // In onScriptCreated we found a no-name script, set a bp in PC=0, and a flag.
                // onBreakpoint saw the flag, cleared the flag, and sent us here.
                // Start by undoing our damage
                var outerScript = frame.script;

                var debuggr = fbs.findDebugger(frame);  // sets debuggr.breakContext
                if (debuggr)
                {
                    var sourceFile = debuggr.onEvalScriptCreated(frame, outerScript, fbs.nestedScriptStack.enumerate());
                    fbs.resetBreakpoints(sourceFile);
                }
                else
                {
                    if (fbs.DBG_FBS_CREATION || fbs.DBG_FBS_SRCUNITS) ddd("fbs.onEvalScriptCreated no debuggr for "+outerScript.tag+":"+outerScript.fileName+"\n");
                }
            }
            catch (exc)
            {
                ERROR("onEvalScriptCreated failed: "+exc);
                if (fbs.DBG_FBS_ERRORS) dumpProperties("onEvalScriptCreated failed:", exc);
            }
        }

        fbs.clearNestedScripts();
        if (fbs.DBG_FBS_CREATION || fbs.DBG_FBS_SRCUNITS) ddd("onEvalScriptCreated outerScript.tag:"+outerScript.tag+" href: "+(sourceFile?sourceFile.href:"no sourceFile")+"\n");  /*@explore*/
        return sourceFile;
    },

    onTopLevelScriptCreated: function(frame, type, val)
    {
        try
        {
            // In onScriptCreated we may have found a script at baseLineNumber=1
            // Now we know its not an event
            if (fbs.nestedScriptStack.length > 0)
            {
                var firstScript = fbs.nestedScriptStack.queryElementAt(0, jsdIScript);
                if (firstScript.tag in fbs.onXScriptCreatedByTag)
                {
                    delete  fbs.onXScriptCreatedByTag[firstScript.tag];
                    firstScript.clearBreakpoint(0);
                    if (fbs.DBG_FBS_SRCUNITS) ddd("fbs.onTopLevelScriptCreated clear bp@0 for firstScript.tag: "+firstScript.tag+"\n")
                }
            }

            // On compilation of a top-level (global-appending) function.
            // After this top-level script executes we lose the jsdIScript so we can't build its line table.
            // Therefore we need to build it here.
            var debuggr = fbs.findDebugger(frame);  // sets debuggr.breakContext
            if (debuggr)
            {
                var sourceFile = debuggr.onTopLevelScriptCreated(frame, frame.script, fbs.nestedScriptStack.enumerate());
                if (fbs.DBG_FBS_SRCUNITS) ddd("fbs.onTopLevelScriptCreated got sourceFile:"+sourceFile+" using "+fbs.nestedScriptStack.length+" nestedScripts\n");
                fbs.resetBreakpoints(sourceFile, frame.script.baseLineNumber+frame.script.lineExtent);
            }
            else
            {
                if (fbs.DBG_FBS_SRCUNITS)
                    ddd("FBS.onTopLevelScriptCreated no debuggr for "+frame.script.tag+"\n");
            }
        }
        catch (exc)
        {
            dumpProperties("onTopLevelScriptCreated FAILED: ", exc);
            ERROR("onTopLevelScriptCreated Fails: "+exc);
        }

        fbs.clearNestedScripts();
        if (fbs.DBG_FBS_CREATION || fbs.DBG_FBS_SRCUNITS) ddd("fbs.onTopLevelScriptCreated script.tag:"+frame.script.tag+" href: "+(sourceFile?sourceFile.href:"no sourceFile")+"\n");  /*@explore*/

        return sourceFile;
    },

    clearNestedScripts: function()
    {
        var innerScripts = fbs.nestedScriptStack.enumerate();
        while (innerScripts.hasMoreElements())
        {
            var script = innerScripts.getNext();
            if (script.isValid && script.baseLineNumber == 1)
            {
                script.clearBreakpoint(0);
                if (this.onXScriptCreatedByTag[script.tag])
                    delete this.onXScriptCreatedByTag[script.tag];
            }
        }
        fbs.nestedScriptStack.clear();
    },

    onScriptCreated: function(script)
    {
        if (!fbs)
        {
            if (fbs.DBG_FBS_CREATION || fbs.DBG_FBS_SRCUNITS)
                ddd("onScriptCreated, but no fbs for script.fileName="+script.fileName+"\n");
             return;
        }

        try
        {
            var fileName = script.fileName;
            if (isFilteredURL(fileName))
            {
                try {
                if (fbs.DBG_FBS_CREATION || fbs.DBG_FBS_SRCUNITS) 											/*@explore*/
                    ddd("onScriptCreated: filename filtered:"+fileName+"\n");  	/*@explore*/
                } catch (exc) { /*Bug 426692 */ } /*@explore*/
                return;
            }

            if (fbs.DBG_FBS_CREATION) {                                                                                    /*@explore*/
                ddd("onScriptCreated: "+script.tag+"@("+script.baseLineNumber+"-"                                      /*@explore*/
                    +(script.baseLineNumber+script.lineExtent)+")"+script.fileName+"\n");                              /*@explore*/
                ddd("onScriptCreated name: \'"+script.functionName+"\'\n");                 /*@explore*/
                try {
                    ddd(script.functionSource+"\n");                 /*@explore*/
                } catch (exc) { /*Bug 426692 */ } /*@explore*/
            }                                                                                                          /*@explore*/

            if (!script.functionName) // top or eval-level
            {
                // We need to detect eval() and grab its source.
                var hasCaller = fbs.createdScriptHasCaller();
                if (fbs.DBG_FBS_SRCUNITS) ddd("createdScriptHasCaller "+hasCaller+"\n");

                if (hasCaller)
                    fbs.onXScriptCreatedByTag[script.tag] = this.onEvalScriptCreated;
                else
                    fbs.onXScriptCreatedByTag[script.tag] = this.onTopLevelScriptCreated;

                script.setBreakpoint(0);
                fbs.clearHookInterruptsToTrackScripts(); // now we know that any nested scripts are part of our buffer, not dynamic functions
                if (fbs.DBG_FBS_CREATION || fbs.DBG_FBS_SRCUNITS || fbs.DBG_FBS_BP) ddd("onScriptCreated: set BP at PC 0 in "+(hasCaller?"eval":"top")+" level tag="+script.tag+":"+script.fileName+"\n");/*@explore*/
            }
            else if (script.baseLineNumber == 1)
            {
                // could be a 1) Browser-generated event handler or 2) a nested script at the top of a file
                // One way to tell is assume both then wait to see which we hit first:
                // 1) bp at pc=0 for this script or 2) for a top-level on at the same filename

                fbs.onXScriptCreatedByTag[script.tag] = this.onEventScriptCreated; // for case 1
                script.setBreakpoint(0);

                fbs.nestedScriptStack.appendElement(script, false);  // for case 2

                fbs.clearHookInterruptsToTrackScripts(); // Should not have been set...?
                if (fbs.DBG_FBS_CREATION) ddd("onScriptCreated: set BP at PC 0 in event level tag="+script.tag+"\n");      /*@explore*/
            }
            else
            {
                fbs.nestedScriptStack.appendElement(script, false);
                if (fbs.DBG_FBS_CREATION) ddd("onScriptCreated: nested function named: "+script.functionName+"\n");                                         /*@explore*/
                if (script.functionName == "anonymous")  // not no-name
                    fbs.hookInterruptsToTrackScripts();  // if the hook is taken, then its not a eval- or top-, must be Function or ?
                dispatch(scriptListeners,"onScriptCreated",[script, fileName, script.baseLineNumber]);
            }
        }
        catch(exc)
        {
            ERROR("onScriptCreated failed: "+exc);
            dumpProperties("onScriptCreated failed: ", exc);
        }
    },

    createdScriptHasCaller: function()
    {
        var frame = Components.stack; // createdScriptHasCaller
        frame = frame.caller;         // onScriptCreated
        if (!frame) return frame;
        frame = frame.caller;         // native jsd?
        if (!frame) return frame;
        frame = frame.caller;         // hook apply
        if (!frame) return frame;
        frame = frame.caller;         // native interpret?
        if (!frame) return frame;
        frame = frame.caller;         // our creator ... or null if we are top level
        return frame;
    },

    onScriptDestroyed: function(script)
    {
        if (!fbs)
             return;
        if (script.tag in fbs.onXScriptCreatedByTag)
            delete  fbs.onXScriptCreatedByTag[script.tag];

        try
        {
            var fileName = script.fileName;
            if (isFilteredURL(fileName))
                return;
            if (fbs.DBG_FBS_CREATION)
                ddd('fbs.onScriptDestroyed '+script.tag+"\n");

            dispatch(scriptListeners,"onScriptDestroyed",[script]);
        }
        catch(exc)
        {
            ERROR("onScriptDestroyed failed: "+exc);
            dumpProperties("onScriptDestroyed failed: ", exc);
        }
    },

    dumpContexts: function()
    {

        jsd.enumerateContexts( {enumerateContext: function(jscontext)
        {
                ddd("\n");
                try
                {
                    var global = jscontext.globalObject.getWrappedValue();
                    ddd("jsIContext tag:"+jscontext.tag+(jscontext.isValid?" - isValid\n":" - NOT valid\n"));
                    //dumpProperties("global object:\n", global);
                    if (global)
                    {
                        var document = global.document;
                        if (document)
                        {
                            ddd("global document.location: "+document.location+"\n");
                        }
                        else
                        {
                            ddd("global without document\n");
                            ddd("global type: "+typeof(global)+"\n");
                            dumpProperties("global properties", global);
                            dumpInterfaces("global interfaces", global);
                        }
                    }
                    else
                        ddd("no global object\n");


                    if (jscontext.privateData)
                    {
                        dumpProperties("jscontext.privateData", jscontext.privateData);
                        dumpInterfaces("jscontext.privateData", jscontext.privateData);
                    }

                }
                catch(e)
                {
                    ddd("jscontext dump FAILED "+e+"\n");
                }
                /*
                 * jsdIContext has jsdIEphemeral, nsISupports, jsdIContext
                 * jsdIContext.wrappedContext has nsISupports and nsITimerCallback, nothing interesting
                 * jsdIContext.JSContext is undefined
                 */
                /*
                var nsITimerCallback = Components.interfaces["nsITimerCallback"];
                if (context instanceof nsITimerCallback)
                {
                    var asTimer = context.QueryInterface(nsITimerCallback);
                    dumpProperties(nsITimerCallback, asTimer );
                }
                ddd("\n\n");*/
        }});
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    findDebugger: function(frame)
    {
        if (debuggers.length < 1)
            return;

        var global = getFrameGlobal(frame);

        if (global)
        {
            try
            {
                if (global.location)  // then we have a window, it will be an nsIDOMWindow, right?
                {
                    var location = global.location.toString();
                    // TODO this is kludge isFilteredURL stops users from seeing firebug but chromebug has to disable the filter
                    if (location.indexOf("chrome://chromebug/") != -1)
                            return false;
                }
            }
            catch (exc)
            {
                    // FF3 gives (NS_ERROR_INVALID_POINTER) [nsIDOMLocation.toString]
            }

            for ( var i = debuggers.length - 1; i >= 0; i--)
            {
                try
                {
                    var debuggr = debuggers[i];
                    if (debuggr.supportsGlobal(global))
                    {
                        if (!debuggr.breakContext)
                            dumpProperties("Debugger with no breakContext:",debuggr.supportsGlobal);
                        if (fbs.DBG_FBS_FINDDEBUGGER) ddd(" findDebugger found debuggr at "+i+" for global, location:"+global.location+"\n");
                        return debuggr;
                    }
                }
                catch (exc)
                {
                    ddd("firebug-service findDebugger supportsGlobal FAILS: "+exc+" jscontext:"+(frame.executionContext?frame.executionContext.tag:"undefined")+"\n");
                }
            }
            if (fbs.DBG_FBS_FINDDEBUGGER) ddd(" findDebugger no find for "+frame.script.tag+"; global, location:"+global.location+"\n");
        }
        else
            if (fbs.DBG_FBS_FINDDEBUGGER) ddd(" fbs.findDebugger: no global in frame.executionContext for script.tag"+frame.script.tag+"\n");

        var win = getFrameWindow(frame);
        if (win)
        {
            for (var i = 0; i < debuggers.length; ++i)
            {
                try
                {
                    var debuggr = debuggers[i];
                    if (debuggr.supportsWindow(win))
                        return debuggr;
                }
                catch (exc)
                {
                    if (fbs.DBG_FBS_SRCUNITS)
                        ERROR("firebug-service findDebugger supportsWindow FAILS: "+exc);
                }
            }
        }

        if (fbs.DBG_FBS_FINDDEBUGGER) ddd(" fbs.findDebugger no find on window, try bottom of stack\n");

        if (frame.callingFrame)  // then maybe we crossed an xpcom boundary.
        {
            while(frame.callingFrame) // walk to the bottom of the stack
                frame = frame.callingFrame;
            var debuggr = this.findDebugger(frame);
            if (debuggr)
                return debuggr;
        }
        if (fbs.DBG_FBS_FINDDEBUGGER)
            fbs.diagnoseFindDebugger(frame, win);
    },

    diagnoseFindDebugger: function(frame, originalWin)
    {
        while(frame.callingFrame) // walk to the bottom of the stack
            frame = frame.callingFrame;

        dumpToFileWithStack("\ndiagnoseFindDebugger", frame);

        ddd("diagnoseFindDebugger scope "+frame.scope.jsType+"["+frame.scope.propertyCount+"] "+frame.scope.jsClassName +"\n");
        var win = getFrameWindow(frame);
        if (!win)
        {
            ddd("No getFrameWindow! scope:\n");
            this.dumpIValue(frame.scope);
            return;
        }
        ddd("diagnoseFindDebugger win.location ="+(win.location?win.location.href:"(undefined)"));
        for (var i = 0; i < debuggers.length; ++i)
        {
            try
            {
                var debuggr = debuggers[i];
                if (debuggr.supportsWindow(win))
                {
                    ddd(" FOUND at "+i+"\n");
                    ddd("diagnoseFindDebugger originalWin.location ="+(originalWin.location?originalWin.location.href:"(undefined)")+"\n");
                    return debuggr;
                }
            }
            catch (exc) {ddd("caught:"+exc+"\n");}
        }
        ddd(" NO FIND tried "+debuggers.length+"\n");
    },

    dumpIValue: function(value)
    {
        var listValue = {value: null}, lengthValue = {value: 0};
        value.getProperties(listValue, lengthValue);
        for (var i = 0; i < lengthValue.value; ++i)
        {
            var prop = listValue.value[i];
            try {
            var name = prop.name.getWrappedValue();
            ddd(i+"]"+name+"="+prop.value.getWrappedValue()+"\n");
            } catch (e) {
            ddd(i+"]"+e+"\n");
            }
        }
    },

    reFindDebugger: function(frame, debuggr)
    {
        var global = getFrameGlobal(frame);
        if (global && debuggr.supportsGlobal(global)) return debuggr;

        var win = getFrameWindow(frame);
        if (debuggr.supportsWindow(win)) return debuggr; // for side-effect: context set on debugger.js
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // jsd breakpoints are on a PC in a jsdIScript
    // Users breakpoint on a line of source
    // Because test.js can be included multiple times, the URL+line number from the UI is not unique.
    // sourcefile.href != script.fileName, generally script.fileName cannot be used.
    // If the source is compiled, then we have zero, one, or more jsdIScripts on a line.
    //    If zero, cannot break at that line
    //    If one, set a jsd breakpoint
    //    If more than one, set jsd breakpoint on each script
    // Else we know that the source will be compiled before it is run.
    //    Save the sourceFile.href+line and set the jsd breakpoint when we compile
    //    Venkman called these "future" breakpoints
    //    We cannot prevent future breakpoints on lines that have no script.  Break onCreate with error?

    addBreakpoint: function(type, sourceFile, lineNo, props, debuggr)
    {
        var url = sourceFile.href;
        var bp = this.findBreakpoint(url, lineNo);
        if (bp && bp.type & type)
            return null;

        if (bp)
        {
            bp.type |= type;

            if (debuggr)
                bp.debugger = debuggr;
            else /*@explore*/
                if (fbs.DBG_FBS_BP) ddd("fbs.addBreakpoint with no debuggr:\n"+getComponentsStackDump()+"\n"); /*@explore*/
        }
        else
        {
            bp = this.recordBreakpoint(type, url, lineNo, debuggr, props);
            fbs.setJSDBreakpoint(sourceFile, bp);
        }
        if (fbs.DBG_FBS_BP) dumpProperties("addBreakpoint", bp);
        return bp;
    },

    recordBreakpoint: function(type, url, lineNo, debuggr, props)
    {
        var urlBreakpoints = breakpoints[url];
        if (!urlBreakpoints)
            breakpoints[url] = urlBreakpoints = [];

        var bp = {type: type, href: url, lineNo: lineNo, disabled: 0,
            debugger: debuggr,
            condition: "", onTrue: true, hitCount: -1, hit: 0};
        if (props)
        {
            bp.condition = props.condition;
            bp.onTrue = props.onTrue;
            bp.hitCount = props.hitCount;
            if (bp.condition || bp.hitCount > 0)
                ++conditionCount;
            if(props.disabled)
            {
                bp.disabled |= BP_NORMAL;
                ++disabledCount;
            }
        }
        urlBreakpoints.push(bp);
        ++breakpointCount;
        return bp;
    },

    removeBreakpoint: function(type, url, lineNo, script) // xxxJJB script arg not used?
    {
        if (fbs.DBG_FBS_BP) ddd("removeBreakpoint for url= "+url+"\n");                                                    /*@explore*/

        var urlBreakpoints = breakpoints[url];
        if (!urlBreakpoints)
            return false;

        if (fbs.DBG_FBS_BP) ddd("removeBreakpoint need to check bps="+urlBreakpoints.length+"\n");                         /*@explore*/

        for (var i = 0; i < urlBreakpoints.length; ++i)
        {
            var bp = urlBreakpoints[i];
            if (fbs.DBG_FBS_BP) ddd("removeBreakpoint checking bp.lineNo vs lineNo="+bp.lineNo+" vs "+lineNo+"\n");        /*@explore*/

            if (bp.lineNo == lineNo)
            {
                bp.type &= ~type;
                if (!bp.type)
                {
                    if (bp.scriptsWithBreakpoint)
                    {
                        for (var j = 0; j < bp.scriptsWithBreakpoint.length; j++)
                        {
                            var script = bp.scriptsWithBreakpoint[j];
                            if (script && script.isValid)
                            {
                                try
                                {
                                    script.clearBreakpoint(bp.pc[j]);
                                    if (fbs.DBG_FBS_BP) ddd("removeBreakpoint in tag="+script.tag+" at "+lineNo+"@"+url+"\n");/*@explore*/
                                }
                                catch (exc)
                                {
                                    ddd("Firebug service failed to remove breakpoint in "+script.tag+" at lineNo="+lineNo+" pcmap:"+bp.pcmap+"\n");
                                }
                            }
                        }
                    }
                    // else this was a future breakpoint that never hit or a script that was GCed

                    urlBreakpoints.splice(i, 1);
                    --breakpointCount;

                    if (bp.disabled)
                        --disabledCount;

                    if (bp.condition || bp.hitCount > 0)
                    {
                        --conditionCount;
                    }


                    if (!urlBreakpoints.length)
                        delete breakpoints[url];

                }
                return bp;
            }
        }

        return false;
    },

    findBreakpoint: function(url, lineNo)
    {
        var urlBreakpoints = breakpoints[url];
        if (urlBreakpoints)
        {
            for (var i = 0; i < urlBreakpoints.length; ++i)
            {
                var bp = urlBreakpoints[i];
                if (bp.lineNo == lineNo)
                    return bp;
            }
        }

        return null;
    },

    // When we are called, scripts have been compiled so all relevant breakpoints are not "future"
    findBreakpointByScript: function(script, pc)
    {
        for (var url in breakpoints)
        {
            var urlBreakpoints = breakpoints[url];
            if (urlBreakpoints)
            {
                for (var i = 0; i < urlBreakpoints.length; ++i)
                {
                    var bp = urlBreakpoints[i];
                    if (bp.scriptsWithBreakpoint)
                    {
                        for (var j = 0; j < bp.scriptsWithBreakpoint.length; j++)
                        {
                            if (fbs.DBG_FBS_BP)
                            {
                                var vs = (bp.scriptsWithBreakpoint[j] ? bp.scriptsWithBreakpoint[j].tag+"@"+bp.pc[j]:"future")+" on "+url;
                                ddd("findBreakpointByScript["+i+"]"+" looking for "+script.tag+"@"+pc+" vs "+vs+"\n"); /*@explore*/
                            }
                            if ( bp.scriptsWithBreakpoint[j] && (bp.scriptsWithBreakpoint[j].tag == script.tag) && (bp.pc[j] == pc) )
                                return bp;
                        }
                    }
                }
            }
        }

        return null;
    },

    resetBreakpoints: function(sourceFile, lastLineNumber) // the sourcefile has just been created after compile
    {
        // If the new script is replacing an old script with a breakpoint still
        var url = sourceFile.href;
        var urlBreakpoints = breakpoints[url];
        if (fbs.DBG_FBS_BP)
        {
            try
            {
                var msg = "resetBreakpoints: breakpoints["+sourceFile.href;
                msg += "]="+urlBreakpoints+"\n";
                ddd(msg);
            }
            catch (exc)
            {
                dumpProperties("Failed to give resetBreakpoints trace in url: "+url+" because "+exc+" for urlBreakpoints=", urlBreakpoints);
            }
        }

        if (urlBreakpoints)
        {
            if (fbs.DBG_FBS_BP) ddd("resetBreakpoints total bp="+urlBreakpoints.length+" for url="+url+" lastLineNumber="+lastLineNumber+"\n");              /*@explore*/

            for (var i = 0; i < urlBreakpoints.length; ++i)
            {
                var bp = urlBreakpoints[i];
                fbs.setJSDBreakpoint(sourceFile, bp);
                if (lastLineNumber && !bp.jsdLine && !(bp.disabled & BP_NORMAL) && (bp.lineNo < lastLineNumber))
                {
                     if (fbs.DBG_FBS_BP)
                        ddd("resetBreakpoints:  mark breakpoint disabled: "+bp.lineNo+"@"+sourceFile+"\n");
                     fbs.disableBreakpoint(url, bp.lineNo);
                }
            }
        }
    },

    setJSDBreakpoint: function(sourceFile, bp)
    {
        var scripts = sourceFile.getScriptsAtLineNumber(bp.lineNo);
        if (!scripts)
        {
             if (fbs.DBG_FBS_BP)
                ddd("setJSDBreakpoint:  NO inner scripts: "+bp.lineNo+"@"+sourceFile+"\n");
             if (!sourceFile.outerScript || !sourceFile.outerScript.isValid)
             {
                if (fbs.DBG_FBS_BP)
                    ddd("setJSDBreakpoint:  NO valid outerScript\n");
                return;
             }
             scripts = [sourceFile.outerScript];
        }

        bp.scriptsWithBreakpoint = [];
        bp.pc = [];
        for (var i = 0; i < scripts.length; i++)
        {
            var script = scripts[i];
            if (!script.isValid)
                continue;

            var pcmap = sourceFile.pcmap_type;
            // we subtraced this offset when we showed the user so lineNo is a user line number; now we need to talk
            // to jsd its line world
            var jsdLine = bp.lineNo + sourceFile.getBaseLineOffset();
            // test script.isLineExecutable(jsdLineNo, pcmap) ??
            var pc = script.lineToPc(jsdLine, pcmap);
            var pcToLine = script.pcToLine(pc, pcmap);
            try {
                var isExecutable = script.isLineExecutable(jsdLine, pcmap);
            } catch(e) {
                // guess not then...
            }
            if (pcToLine == jsdLine && isExecutable)
            {
                script.setBreakpoint(pc);

                bp.scriptsWithBreakpoint.push(script);
                bp.pc.push(pc);
                bp.pcmap = pcmap;
                bp.jsdLine = jsdLine;

                if (pc == 0)  // signal the breakpoint handler to break for user
                    sourceFile.breakOnZero = script.tag;

                if (fbs.DBG_FBS_BP)
                    ddd("setJSDBreakpoint tag: "+script.tag+" line.pc@url="+bp.lineNo +"."+pc+"@"+sourceFile.href+" using offset:"+sourceFile.getBaseLineOffset()+" jsdLine: "+jsdLine+" pcToLine: "+pcToLine+(isExecutable?" isExecuable":"notExecutable")+" sourceFile.breakOnZero: "+sourceFile.breakOnZero+"\n");                         /*@explore*/
            }
            else
                if (fbs.DBG_FBS_BP) ddd("setJSDBreakpoint NO tag: "+script.tag+" line.pc@url="+bp.lineNo +"."+pc+"@"+sourceFile.href+" using offset:"+sourceFile.getBaseLineOffset()+" jsdLine: "+jsdLine+" pcToLine: "+pcToLine+(isExecutable?" isExecuable":"notExecutable")+"\n");                         /*@explore*/
         }
    },
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    breakIntoDebugger: function(debuggr, frame, type)
    {
        // Before we break, clear information about previous stepping session
        this.stopStepping();

        if (fbs.DBG_FBS_BP || fbs.DBG_FBS_CREATION || fbs.DBG_FBS_ERRORS || fbs.DBG_FBS_STEP || fbs.DBG_FBS_FUNCTION) flushDebugStream();        /*@explore*/

        // Break into the debugger - execution will stop here until the user resumes
        var returned;
        try
        {
            returned = debuggr.onBreak(frame, type);
        }
        catch (exc)
        {
            ERROR(exc);
            returned = RETURN_CONTINUE;
        }

        // Execution resumes now. Check if the user requested stepping and if so
        // install the necessary hooks
        hookFrameCount = countFrames(frame);
        this.startStepping();

        return returned;
    },

    needToBreakForError: function(fileName, lineNo)
    {
        return breakOnNextError =
            this.breakOnErrors || this.findErrorBreakpoint(normalizeURL(fileName), lineNo) != -1;
    },

    startStepping: function()
    {
        if (!stepMode && !runningUntil)
            return;

         if (fbs.DBG_FBS_STEP) ddd("startStepping stepMode = "+getStepName(stepMode)                        /*@explore*/
                 +" hookFrameCount="+hookFrameCount+" stepFrameCount="+stepFrameCount+"\n");                           /*@explore*/

        this.hookFunctions();

        if (stepMode == STEP_OVER || stepMode == STEP_INTO)
            this.hookInterrupts();
    },

    stopStepping: function()
    {
        if (fbs.DBG_FBS_STEP) ddd("stopStepping\n");                                                                       /*@explore*/
        stepMode = 0;
        stepFrame = null;
        stepFrameCount = 0;
        stepFrameLineId = null;

        if (runningUntil)
        {
            this.removeBreakpoint(BP_UNTIL, runningUntil.href, runningUntil.lineNo);
            runningUntil = null;
        }

        jsd.interruptHook = null;
        jsd.functionHook = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    hookFunctions: function()
    {
        function functionHook(frame, type)
        {
            switch (type)
            {
                case TYPE_FUNCTION_CALL:
                {
                    ++hookFrameCount;

                    if (stepMode == STEP_OVER)
                        jsd.interruptHook = null;

                    if (fbs.DBG_FBS_STEP) ddd("functionHook TYPE_FUNCTION_CALL stepMode = "+getStepName(stepMode)/*@explore*/
                             +" hookFrameCount="+hookFrameCount+" stepFrameCount="+stepFrameCount+"\n");               /*@explore*/
                    break;
                }
                case TYPE_FUNCTION_RETURN:
                {
                    --hookFrameCount;
                    if (fbs.DBG_FBS_STEP) ddd("functionHook TYPE_FUNCTION_RETURN stepMode = "+getStepName(stepMode)/*@explore*/
                                        +" hookFrameCount="+hookFrameCount+" stepFrameCount="+stepFrameCount+"\n");    /*@explore*/

                    if (hookFrameCount == 0) {
                        if ( (stepMode == STEP_INTO) || (stepMode == STEP_OVER) ) {
                            fbs.stopStepping();
                            stepMode = STEP_SUSPEND;
                            fbs.hookInterrupts();
                        } else
                        {
                            fbs.stopStepping();
                        }
                    }
                    else if (stepMode == STEP_OVER) //XXXnew - conflict
                    {
                        if (hookFrameCount <= stepFrameCount)
                            fbs.hookInterrupts();
                    }
                    else if (stepMode == STEP_OUT)
                    {
                        if (hookFrameCount < stepFrameCount)
                            fbs.hookInterrupts();
                    }

                    break;
                }
            }
        }

        if (fbs.DBG_FBS_STEP) ddd("set functionHook\n");                                                                   /*@explore*/
        jsd.functionHook = { onCall: functionHook };
    },

    hookInterrupts: function()
    {
        function interruptHook(frame, type, rv)
        {
            if ( isFilteredURL(frame.script.fileName) )
                return RETURN_CONTINUE;

            // Sometimes the same line will have multiple interrupts, so check
            // a unique id for the line and don't break until it changes
            var frameLineId = hookFrameCount + frame.script.fileName + frame.line;
            if (fbs.DBG_FBS_STEP) ddd("interruptHook frameLineId: "+frameLineId+"\n");                                     /*@explore*/
            if (frameLineId != stepFrameLineId)
                return fbs.onBreak(frame, type, rv);
            else
                return RETURN_CONTINUE;
        }

        if (fbs.DBG_FBS_STEP) ddd("set InterruptHook\n");                                                                  /*@explore*/
        jsd.interruptHook = { onExecute: interruptHook };
    },

    hookScripts: function()
    {
        if (fbs.DBG_FBS_STEP) ddd("set scriptHook\n");                                                                     /*@explore*/
        jsd.scriptHook = {
            onScriptCreated: hook(this.onScriptCreated),
            onScriptDestroyed: hook(this.onScriptDestroyed)
        };

    },

    unhookScripts: function()
    {
        jsd.scriptHook = null;
        if (fbs.DBG_FBS_STEP) ddd("unset scriptHook\n");                                                                   /*@explore*/
    },

    hookInterruptsToTrackScripts: function()
    {
        if (jsd.interruptHook && !fbs.trackingScriptsHookSet)
            fbs.saveInterruptHook = jsd.interruptHook;

        jsd.interruptHook = { onExecute: handleTrackingScriptsInterrupt };
        fbs.trackingScriptsHookSet = true;
        if (fbs.DBG_FBS_CREATION) ddd("hookInterruptsToTrackScripts fbs.saveInterruptHook:"+fbs.saveInterruptHook+"\n");                                                                  /*@explore*/
    },

    clearHookInterruptsToTrackScripts: function()
    {
        if (fbs.trackingScriptsHookSet)
        {
            if (fbs.saveInterruptHook)
            {
                jsd.interruptHook = fbs.saveInterruptHook;
                fbs.saveInterruptHook = null;
            }
            else
                jsd.interruptHook = null;
        }

        fbs.trackingScriptsHookSet = false;
        if (fbs.DBG_FBS_FUNCTION) ddd("clearHookInterruptsToTrackScripts \n");
    },

    hookInterruptsToTrapErrors: function()
    {
        if (jsd.interruptHook && !fbs.trappingErrorsHookSet)
            fbs.saveInterruptHook = jsd.interruptHook;

        jsd.interruptHook = { onExecute: handleTrappingErrorsInterrupt };
        fbs.trappingErrorsHookSet = true;
        if (fbs.DBG_FBS_FUNCTION) ddd("hookInterruptsToTrapErrors fbs.saveInterruptHook:"+fbs.saveInterruptHook+"\n");                                                                  /*@explore*/
    },

    clearHookInterruptsToTrapErrors: function()
    {
        if (fbs.trappingErrorsHookSet)
        {
            if (fbs.saveInterruptHook)
            {
                jsd.interruptHook = fbs.saveInterruptHook;
                fbs.saveInterruptHook = null;
            }
            else
                jsd.interruptHook = null;
        }

        fbs.trappingErrorsHookSet = false;
        if (fbs.DBG_FBS_FUNCTION) ddd("clearHookInterruptsToTrapErrors \n");
    }
};

function getStepName(mode)
{
    if (mode==STEP_OVER) return "STEP_OVER";
    if (mode==STEP_INTO) return "STEP_INTO";
    if (mode==STEP_OUT) return "STEP_OUT";
}

function handleTrackingScriptsInterrupt(frame, type, rv)
{
    try
    {
        if (fbs.DBG_FBS_FUNCTION) ddd("handleTrackingScriptsInterrupt "+(frame.callingFrame?"haveCaller":"top")+" \n");
        // We are not interested in Function() calls at top- or eval-level, since they don't seem to have an important use case and FF2 crashes
        if (frame.callingFrame && !isFilteredURL(frame.script.fileName) )
        {
            var frameLineId = frame.script.fileName + frame.line;
            if (fbs.DBG_FBS_FUNCTION) ddd("handleTrackingScriptsInterrupt caller frameLineId: "+frameLineId+" type "+getExecutionStopNameFromType(type)+"\n");                              /*@explore*/

            // When we are called the stack should be at the PC just after the constructor call to Function().
            // TODO implement
        }
    }
    catch (exc)
    {
        if (fbs.DBG_FBS_CREATION) ddd("handleTrackingScriptsInterrupt FAILS: "+exc);                              /*@explore*/
    }
    fbs.clearHookInterruptsToTrackScripts();
    // call restored interruptHook if present
    if (jsd.interruptHook)
        jsd.interruptHook.onExecute(frame, type, rv);
    return RETURN_CONTINUE;
}

function handleTrappingErrorsInterrupt(frame, type, rv)
{
    try
    {
        if (fbs.DBG_FBS_ERRORS) ddd("handleTrappingErrorsInterrupt\n");
        if ( !isFilteredURL(frame.script.fileName) )
        {
            var frameLineId = frame.script.fileName + frame.line;
            if (fbs.DBG_FBS_ERRORS) dumpToFileWithStack("handleTrappingErrorsInterrupt caller frameLineId: "+frameLineId+" type "+getExecutionStopNameFromType(type), frame);                              /*@explore*/

            fbs.onDebug(frame, type, rv);  // TODO just call this not the other stuff
        }
    }
    catch (exc)
    {
        if (fbs.DBG_FBS_CREATION) dumpToFileWithStack("handleTrappingErrorsInterrupt FAILS: "+exc);                              /*@explore*/
    }
    fbs.clearHookInterruptsToTrapErrors();
    // call restored interruptHook if present
    if (jsd.interruptHook)
        jsd.interruptHook.onExecute(frame, type, rv);
    return RETURN_CONTINUE;
}
// ************************************************************************************************

var FirebugFactory =
{
    createInstance: function (outer, iid)
    {
        if (outer != null)
            throw NS_ERROR_NO_AGGREGATION;

        FirebugFactory.initializeService();
        return (new FirebugService()).QueryInterface(iid);
    },
    initializeService: function()
    {
        if (!prefs)
           prefs = PrefService.getService(nsIPrefBranch2);

        var filterSystemURLs =  prefs.getBoolPref("extensions.firebug-service.filterSystemURLs");
        if (filterSystemURLs)  // do not turn jsd on unless we want to see chrome
            return;

        try
        {
            var jsd = DebuggerService.getService(jsdIDebuggerService);
            jsd.initAtStartup = true;
        }
        catch (exc)
        {
        }
    }
};

// ************************************************************************************************

var FirebugModule =
{
    registerSelf: function (compMgr, fileSpec, location, type)
    {
        compMgr = compMgr.QueryInterface(nsIComponentRegistrar);
        compMgr.registerFactoryLocation(CLASS_ID, CLASS_NAME, CONTRACT_ID, fileSpec, location, type);
    },

    unregisterSelf: function(compMgr, fileSpec, location)
    {
        compMgr = compMgr.QueryInterface(nsIComponentRegistrar);
        compMgr.unregisterFactoryLocation(CLASS_ID, location);
    },

    getClassObject: function (compMgr, cid, iid)
    {
        if (!iid.equals(nsIFactory))
            throw NS_ERROR_NOT_IMPLEMENTED;

        if (cid.equals(CLASS_ID))
            return FirebugFactory;

        throw NS_ERROR_NO_INTERFACE;
    },

    canUnload: function(compMgr)
    {
        return true;
    }
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function NSGetModule(compMgr, fileSpec)
{
    return FirebugModule;
}

// ************************************************************************************************
// Local Helpers

function normalizeURL(url)
{
    // For some reason, JSD reports file URLs like "file:/" instead of "file:///", so they
    // don't match up with the URLs we get back from the DOM
    return url ? url.replace(/file:\/([^/])/, "file:///$1") : "";
}

function denormalizeURL(url)
{
    // This should not be called.
    return url ? url.replace(/file:\/\/\//, "file:/") : "";
}

function isFilteredURL(rawJSD_script_filename)
{
    if (!rawJSD_script_filename)
        return true;
    if (rawJSD_script_filename[0] == 'h')
        return false;
    if (rawJSD_script_filename == "XPCSafeJSObjectWrapper.cpp")
        return true;
    if (fbs.filterSystemURLs)
        return systemURLStem(rawJSD_script_filename);
    for (var i = 0; i < fbs.alwayFilterURLsStarting.length; i++)
        if (rawJSD_script_filename.indexOf(fbs.alwayFilterURLsStarting[i]) != -1)
            return true;
    return false;
}

function systemURLStem(rawJSD_script_filename)
{
    if (this.url_class)  // attempt to optimize stream of similar urls
    {
        if ( rawJSD_script_filename.substr(0,this.url_class.length) == this.url_class )
            return this.url_class;
    }
    this.url_class = deepSystemURLStem(rawJSD_script_filename);
    return this.url_class;
}

function deepSystemURLStem(rawJSD_script_filename)
{
    for( var i = 0; i < urlFilters.length; ++i )
    {
        var filter = urlFilters[i];
        if ( rawJSD_script_filename.substr(0,filter.length) == filter )
            return filter;
    }
    for( var i = 0; i < COMPONENTS_FILTERS.length; ++i )
    {
        if ( COMPONENTS_FILTERS[i].test(rawJSD_script_filename) )
        {
            var match = COMPONENTS_FILTERS[i].exec(rawJSD_script_filename);
            urlFilters.push(match[1]);
            return match[1];
        }
    }
    return false;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function dispatch(listeners, name, args)
{
    for (var i = 0; i < listeners.length; ++i)
    {
        var listener = listeners[i];
        if ( listener.hasOwnProperty(name) )
            listener[name].apply(listener, args);
    }
}

function hook(fn, rv)
{
    return function()
    {
        try
        {
            return fn.apply(fbs, arguments);
        }
        catch (exc)
        {
            var msg = dumpProperties("Error in hook: ", exc) +" fn=\n"+fn+"\n stack=\n";
            for (var frame = Components.stack; frame; frame = frame.caller)
                msg += frame.filename + "@" + frame.line + ";\n";
               ERROR(msg);
            return rv;
        }
    }
}

function getFrameGlobal(frame)
{
    var jscontext = frame.executionContext;
    if (!jscontext)
    {
        //ddd("getFrameGlobal, frame.executionContext null\n");
        return getFrameWindow(frame);
    }
    var frameGlobal = jscontext.globalObject.getWrappedValue();
    if (frameGlobal)
        return frameGlobal;
    else
    {
        ddd("getFrameGlobal, no frameGlobal, trying window\n");
        return getFrameWindow(frame);
    }
}

function getFrameWindow(frame)
{
    if (debuggers.length < 1)  // too early, frame.eval will crash FF2
            return;
    try
    {
        var result = {};
        frame.eval("window", "", 1, result);
        var win = result.value.getWrappedValue();
        return getRootWindow(win);
    }
    catch (exc)
    {
        if (fbs.DBG_FBS_SRCUNITS)
            ERROR("firebug-service getFrameWindow fails: "+exc);  // FBS.DBG_WINDOWS
        return null;
    }
}

function getRootWindow(win)
{
    for (; win; win = win.parent)
    {
        if (!win.parent || win == win.parent || !(win.parent instanceof Window) )
            return win;
    }
    return null;
}

function countFrames(frame)
{
    var frameCount = 0;
    for (; frame; frame = frame.callingFrame)
        ++frameCount;
    return frameCount;
}

function testBreakpoint(frame, bp)
{
    if ( bp.condition && bp.condition != "" )
    {
        var result = {};
        frame.scope.refresh();
        if (frame.eval(bp.condition, "", 1, result))
        {
            if (bp.onTrue)
            {
                if (!result.value.booleanValue)
                    return false;
            } else
            {
                var value = result.value.getWrappedValue();
                if (typeof bp.lastValue == "undefined")
                {
                    bp.lastValue = value;
                    return false;
                } else
                {
                    if (bp.lastValue == value)
                        return false;
                    bp.lastValue = value;
                }
            }
        }
    }
    ++bp.hit;
    if ( bp.hitCount > 0 )
    {
        if ( bp.hit < bp.hitCount )
            return false;
    }
    return true;
}

function remove(list, item)
{
    var index = list.indexOf(item);
    if (index != -1)
        list.splice(index, 1);
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

var FirebugPrefsObserver =
{
    prefDomain:"extensions.firebug-service",

    observe: function(subject, topic, data)
    {
        var c = data.indexOf(this.prefDomain);
        if (c == 0)
            this.resetOption(this.prefDomain, data.substr(this.prefDomain.length+1) );
        else
        {
            if (fbs.DBG_FBS_ERRORS)
                ddd("fbs.observe no match: "+data+"\n");
        }
    },

    resetOption: function(prefDomain, optionName)
    {
        try
        {
            fbs[optionName] = this.getPref(prefDomain, optionName);
            if (fbs.DBG_FBS_ERRORS)
                ddd("fbs.resetOption set "+optionName+" to "+fbs[optionName]+"\n");

            FirebugPrefsObserver.syncFilter();
        }
        catch (exc)
        {
            if (fbs.DBG_FBS_ERRORS)
                ddd("fbs.resetOption "+optionName+" is not an option; not set in defaults/prefs.js?\n");
        }
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

    syncFilter: function()
    {
        var filter = fbs.scriptsFilter;
        fbs.showEvents = (filter == "all" || filter == "events");
        fbs.showEvals = (filter == "all" || filter == "evals");
        if (fbs.DBG_FBS_ERRORS)
            ddd("fbs.showEvents "+fbs.showEvents+" fbs.showEvals "+fbs.showEvals+"\n");
    },
};

var QuitApplicationGrantedObserver =
{
    observe: function(subject, topic, data)
    {
        if (fbs.DBG_FBS_ERRORS)
            ddd("xxxxxxxxxxxx FirebugService QuitApplicationGrantedObserver start xxxxxxxxxxxxxxx\n");
        fbs.shutdown();
        if (fbs.DBG_FBS_ERRORS)
            ddd("xxxxxxxxxxxx FirebugService QuitApplicationGrantedObserver end xxxxxxxxxxxxxxxxx\n");
    }
};
var QuitApplicationRequestedObserver =
{
    observe: function(subject, topic, data)
    {
        if (fbs.DBG_FBS_ERRORS)
            ddd("FirebugService QuitApplicationRequestedObserver\n");
    }
};
var QuitApplicationObserver =
{
    observe: function(subject, topic, data)
    {
        if (fbs.DBG_FBS_ERRORS)
            ddd("FirebugService QuitApplicationObserver\n");
        fbs = null;
    }
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

var consoleService = null;

function ERROR(text)
{
    if (!consoleService)
        consoleService = ConsoleService.getService(nsIConsoleService);

    consoleService.logStringMessage(text + "");
}

function ddd(text)
{
    if (fbs && fbs.hiddenWindow)
    {
        fbs.hiddenWindow.dump(text);
        return;
    }

    if (fbs)
        ERROR( "firebug-service: no hiddenWindow!! "+text );
    else
        ERROR("firebug-service: no fbs, dump to file ");

    if (true)      /* in the traced version we dump to file */														/*@explore*/
        dumpToFile(text);     																						/*@explore*/
    else      		/* but in the untraced version 'else' will be removed and we dump to log */						/*@explore*/
        ERROR(text);
}

function dumpit(text)
{
    const DirService = 	Cc["@mozilla.org/file/directory_service;1"]
        .getService(Ci.nsIDirectoryServiceProvider);
    var tmpDir = DirService.getFile(NS_OS_TEMP_DIR, {});
    var file = tmpDir.QueryInterface(Ci.nsILocalFile);
    file.appendRelativePath("firebug/dump.txt");
       if (!file.exists())
           file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 664);
    var stream = Cc["@mozilla.org/network/file-output-stream;1"]
        .createInstance(Ci.nsIFileOutputStream);
    stream.init(file, 0x04 | 0x08 | 0x10, 664, 0);
    stream.write(text, text.length);
    stream.flush();
    stream.close();
}

function dFormat(script, url)
{
    return script.tag+"@("+script.baseLineNumber+"-"+(script.baseLineNumber+script.lineExtent)+")"+ url;
}

function getComponentsStackDump()                                                                                                /*@explore*/
{                                                                                                                      /*@explore*/
    var lines = [];                                                                                                    /*@explore*/
    for (var frame = Components.stack; frame; frame = frame.caller)                                                    /*@explore*/
        lines.push(frame.filename + " (" + frame.lineNumber + ")");                                                    /*@explore*/
    return lines.join("\n");                                                                                           /*@explore*/
}                                                                                                                      /*@explore*/

function getPropertyName(object, value)                                                                                /*@explore*/
{                                                                                                                      /*@explore*/
    for (p in object)                                                                                                  /*@explore*/
        if (value == object[p]) return p;	                                                                           /*@explore*/
}                                                                                                                      /*@explore*/

function dumpProperties(title, obj)                                                                                    /*@explore*/
{                                                                                                                      /*@explore*/
    var lines = [title];                                                                                               /*@explore*/
    for (p in obj)
    {
        try
        {
            lines.push("["+p+"]="+obj[p]);
        }
        catch(e)
        {
            lines.push("["+p+"] FAILED:"+e);
        }
    }                                                                                                   				/*@explore*/
                                                                                                                        /*@explore*/
    ddd(lines.join("\n")+"\n");                                                                                             /*@explore*/
}
                                                                                                                         /*@explore*/
function dumpInterfaces(title, obj)																							/*@explore*/
{																														/*@explore*/
    var found = false;																									/*@explore*/
    // could try for classInfo																							/*@explore*/
    for(iface in Components.interfaces)																					/*@explore*/
    {																													/*@explore*/
        if (obj instanceof Components.interfaces[iface])																/*@explore*/
        {																												/*@explore*/
            found = true;
            ddd(title+" has "+iface+"\n");																						/*@explore*/
            for (p in Components.interfaces[iface])																		/*@explore*/
            {																											/*@explore*/
                ddd("["+iface+"."+p+"]="+obj[p]+";\n");																	/*@explore*/
            }																											/*@explore*/
        }																												/*@explore*/
                                                                                                                        /*@explore*/
    }																													/*@explore*/
    return found;																										/*@explore*/
}																														/*@explore*/

function getExecutionStopNameFromType(type)                                                                            /*@explore*/
{                                                                                                                      /*@explore*/
    switch (type)                                                                                                      /*@explore*/
    {                                                                                                                  /*@explore*/
        case jsdIExecutionHook.TYPE_INTERRUPTED: return "interrupted";                                                 /*@explore*/
        case jsdIExecutionHook.TYPE_BREAKPOINT: return "breakpoint";                                                   /*@explore*/
        case jsdIExecutionHook.TYPE_DEBUG_REQUESTED: return "debug requested";                                         /*@explore*/
        case jsdIExecutionHook.TYPE_DEBUGGER_KEYWORD: return "debugger_keyword";                                       /*@explore*/
        case jsdIExecutionHook.TYPE_THROW: return "interrupted";                                                       /*@explore*/
        default: return "unknown("+type+")";                                                                           /*@explore*/
    }                                                                                                                  /*@explore*/
}                                                                                                                      /*@explore*/

function getDumpStream()
{
    try
    {
        // OS tmp (e.g., /tmp on linux, C:\Documents and Settings\your userid\Local Settings\Temp on windows)
        var file = Components.classes["@mozilla.org/file/directory_service;1"]
            .getService(Ci.nsIProperties)
            .get("TmpD", Ci.nsIFile);
        file.append("fbug");
        if ( !file.exists() )
            file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
        file.append("firebug-service-dump.txt");
        //file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);
        var stream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
        stream.init(file, 0x04 | 0x08 | 0x20, 0664, 0); // write, create, truncate
        if (stream)
            return stream;
        else
            throw "firebug-services.js getDumpStream FAILED to get stream for TmpD/fbug";
    }
    catch (exc)
    {
        ERROR("createDumpStream failed "+exc);
    }
}

var dumpStream;

function dumpToFile(text)
{
    if (!dumpStream) dumpStream = getDumpStream();
    dumpStream.write(text, text.length);
    if (fbs && fbs.DBG_FBS_FLUSH) dumpStream.flush();  // If FF crashes you need to run with flush on every line
}

function flushDebugStream()
{
    if(dumpStream) dumpStream.flush();
}

function getStack(frame)
{
    var text = "";
    while(frame) {
        text += frame.line+"@"+frame.script.fileName + "\n";
        frame = frame.callingFrame;
    }
    return text;
}

function dumpToFileWithStack(text, frame)
{
    if (!dumpStream) dumpStream = getDumpStream();
    dumpStream.write(text, text.length);
    text = " stack: \n";
    text += getStack(frame);
    text += "-------------------------------------\n";
    dumpStream.write(text, text.length);
    if (fbs.DBG_FBS_FLUSH) dumpStream.flush();
}
