/* See license.txt for terms of usage */

// Debug lines are marked with  at column 120
// Use variable name "fileName" for href returned by JSD, file:/ not same as DOM
// Use variable name "url" for normalizedURL, file:/// comparable to DOM
// Convert from fileName to URL with normalizeURL
// We probably don't need denormalizeURL since we don't send .fileName back to JSD

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const DebuggerService = Cc["@mozilla.org/js/jsd/debugger-service;1"];
const ConsoleService = Cc["@mozilla.org/consoleservice;1"];
const Timer = Cc["@mozilla.org/timer;1"];
const ObserverServiceFactory = Cc["@mozilla.org/observer-service;1"];

const jsdIDebuggerService = Ci.jsdIDebuggerService;
const jsdIScript = Ci.jsdIScript;
const jsdIStackFrame = Ci.jsdIStackFrame;
const jsdICallHook = Ci.jsdICallHook;
const jsdIExecutionHook = Ci.jsdIExecutionHook;
const jsdIErrorHook = Ci.jsdIErrorHook;
const jsdIFilter = Components.interfaces.jsdIFilter;
const nsISupports = Ci.nsISupports;
const nsIPrefBranch = Ci.nsIPrefBranch;
const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const nsIComponentRegistrar = Ci.nsIComponentRegistrar;
const nsIFactory = Ci.nsIFactory;
const nsIConsoleService = Ci.nsIConsoleService;
const nsITimer = Ci.nsITimer;
const nsITimerCallback = Ci.nsITimerCallback;

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
const STEP_SUSPEND = 4;

const TYPE_ONE_SHOT = nsITimer.TYPE_ONE_SHOT;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const BP_NORMAL = 1;
const BP_MONITOR = 2;
const BP_UNTIL = 4;
const BP_ONRELOAD = 8;  // XXXjjb: This is a mark for the UI to test
const BP_ERROR = 16;
const BP_TRACE = 32; // BP used to initiate traceCalls

const LEVEL_TOP = 1;
const LEVEL_EVAL = 2;
const LEVEL_EVENT = 3;

const COMPONENTS_FILTERS = [
    new RegExp("^(file:/.*/)extensions/%7B[\\da-fA-F]{8}-[\\da-fA-F]{4}-[\\da-fA-F]{4}-[\\da-fA-F]{4}-[\\da-fA-F]{12}%7D/components/.*\\.js$"),
    new RegExp("^(file:/.*/)extensions/firebug@software\\.joehewitt\\.com/modules/.*\\.js$"),
    new RegExp("^(file:/.*/extensions/)\\w+@mozilla\\.org/components/.*\\.js$"),
    new RegExp("^(file:/.*/components/)ns[A-Z].*\\.js$"),
    new RegExp("^(file:/.*/modules/)firebug-[^\\.]*\\.js$"),
    new RegExp("^(file:/.*/Contents/MacOS/extensions/.*/components/).*\\.js$"),
    new RegExp("^(file:/.*/modules/).*\\.jsm$"),
    ];

const reDBG = /DBG_(.*)/;
const reXUL = /\.xul$|\.xml$/;
const reTooMuchRecursion = /too\smuch\srecursion/;

// ************************************************************************************************
// Globals


//https://developer.mozilla.org/en/Using_JavaScript_code_modules
var EXPORTED_SYMBOLS = ["fbs"];

var jsd, fbs, prefs;
var consoleService;
var observerService;

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
var stepFrameLineId;
var stepStayOnDebuggr; // if set, the debuggr we want to stay within
var stepFrameCount;
var stepRecursion = 0; // how many times the caller is the same during TYPE_FUNCTION_CALL
var hookFrameCount = 0;

var haltObject = null;  // For reason unknown, fbs.haltDebugger will not work.

var breakpointCount = 0;
var disabledCount = 0;  // These are an optimization I guess, marking whether we are using this feature anywhere.
var monitorCount = 0;
var conditionCount = 0;
var runningUntil = null;

var errorBreakpoints = [];

var profileCount = 0;
var profileStart;

var enabledDebugger = false;
var reportNextError = false;
var errorInfo = null;

var timer = Timer.createInstance(nsITimer);
var waitingForTimer = false;

var FBTrace = null;

// ************************************************************************************************

var fbs =
{
    initialize: function()
    {
        Components.utils.import("resource://firebug/firebug-trace-service.js");

        FBTrace = traceConsoleService.getTracer("extensions.firebug");

        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("FirebugService Starting");

        fbs = this;

        this.wrappedJSObject = this;
        this.timeStamp = new Date();  /* explore */

        Components.utils.import("resource://firebug/debuggerHalter.js");
        fbs.debuggerHalter = debuggerHalter; // ref to a function in a file that passes the jsdIFilter

        fbs.restoreBreakpoints();

        this.onDebugRequests = 0;  // the number of times we called onError but did not call onDebug
        fbs._lastErrorDebuggr = null;


        if(FBTrace.DBG_FBS_ERRORS)
            this.osOut("FirebugService Starting, FBTrace should be up\n");

        this.profiling = false;
        this.pauseDepth = 0;

        prefs = PrefService.getService(nsIPrefBranch2);
        fbs.prefDomain = "extensions.firebug"
        prefs.addObserver(fbs.prefDomain, fbs, false);

        observerService = ObserverServiceFactory.getService(Ci.nsIObserverService);
        observerService.addObserver(QuitApplicationGrantedObserver, "quit-application-granted", false);
        observerService.addObserver(QuitApplicationRequestedObserver, "quit-application-requested", false);
        observerService.addObserver(QuitApplicationObserver, "quit-application", false);

        this.scriptsFilter = "all";
        // XXXjj For some reason the command line will not function if we allow chromebug to see it.?
        this.alwayFilterURLsStarting = ["chrome://chromebug", "x-jsd:ppbuffer", "chrome://firebug/content/commandLine.js"];  // TODO allow override
        this.onEvalScriptCreated.kind = "eval";
        this.onTopLevelScriptCreated.kind = "top-level";
        this.onEventScriptCreated.kind = "event";
        this.onXULScriptCreated.kind = "xul";
        this.pendingXULScripts = [];

        this.onXScriptCreatedByTag = {}; // fbs functions by script tag
        this.nestedScriptStack = []; // scripts contained in leveledScript that have not been drained

        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("FirebugService Initialized");
    },

    osOut: function(str)
    {
        if (!this.outChannel)
        {
            try
            {
                var appShellService = Components.classes["@mozilla.org/appshell/appShellService;1"].
                    getService(Components.interfaces.nsIAppShellService);
                this.hiddenWindow = appShellService.hiddenDOMWindow;
                this.outChannel = "hidden";
            }
            catch(exc)
            {
                consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
                consoleService.logStringMessage("Using consoleService because nsIAppShellService.hiddenDOMWindow not available "+exc);
                this.outChannel = "service";
            }
        }
        if (this.outChannel === "hidden")  // apparently can't call via JS function
            this.hiddenWindow.dump(str);
        else
            consoleService.logStringMessage(str);
    },

    shutdown: function()  // call disableDebugger first
    {
        timer = null;

        if (!jsd)
            return;

        try
        {
            do
            {
                var depth = jsd.exitNestedEventLoop();
            }
            while(depth > 0);
        }
        catch (exc)
        {
            // Seems to be the normal path...FBTrace.sysout("FirebugService, attempt to exitNestedEventLoop fails "+exc);
        }


        try
        {
            prefs.removeObserver(fbs.prefDomain, fbs);
        }
        catch (exc)
        {
            FBTrace.sysout("fbs prefs.removeObserver fails "+exc, exc);
        }

        try
        {
            observerService.removeObserver(QuitApplicationGrantedObserver, "quit-application-granted");
            observerService.removeObserver(QuitApplicationRequestedObserver, "quit-application-requested");
            observerService.removeObserver(QuitApplicationObserver, "quit-application");
        }
        catch (exc)
        {
            FBTrace.sysout("fbs quit-application-observers removeObserver fails "+exc, exc);
        }

        jsd = null;
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
    // nsIObserver
    observe: function(subject, topic, data)
    {
        if(topic != "nsPref:changed") return;
        fbs.obeyPrefs();
    },
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    get lastErrorWindow()
    {
        var win = this._lastErrorWindow;
        this._lastErrorWindow = null; // Release to avoid leaks
        return win;
    },

    registerClient: function(client)  // clients are essentially XUL windows
    {
        clients.push(client);
        return clients.length;
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
            if (debuggers.length == 1)
                this.enableDebugger();
            if (FBTrace.DBG_FBS_FINDDEBUGGER  || FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("fbs.registerDebugger have "+debuggers.length+" after reg debuggr.debuggerName: "+debuggr.debuggerName+" we are "+(enabledDebugger?"enabled":"not enabled")+" " +
                        "On:"+(jsd?jsd.isOn:"no jsd")+" jsd.pauseDepth:"+(jsd?jsd.pauseDepth:"off")+" fbs.pauseDepth:"+fbs.pauseDepth);
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
        return  debuggers.length;  // 1.3.1 return to allow Debugger to check progress
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

        if (FBTrace.DBG_FBS_FINDDEBUGGER || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("fbs.unregisterDebugger have "+debuggers.length+" after unreg debuggr.debuggerName: "+debuggr.debuggerName+" we are "+(enabledDebugger?"enabled":"not enabled")+" jsd.isOn:"+(jsd?jsd.isOn:"no jsd"));

        return debuggers.length;
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

    getDebuggerByName: function(name)
    {
        if (!name)
            return;

        for(var i = 0; i < debuggers.length; i++)
            if (debuggers[i].debuggerName === name)
                return debuggers[i];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    forceGarbageCollection: function()
    {
        jsd.GC(); // Force the engine to perform garbage collection.
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    enterNestedEventLoop: function(callback)
    {
        dispatch(netDebuggers, "suspendActivity");
        this.activitySuspended = true;

        try
        {
            fbs.nestedEventLoopDepth = jsd.enterNestedEventLoop({
                onNest: function()
                {
                    callback.onNest();
                }
            });
        }
        catch(exc)
        {
            FBTrace.sysout("fbs.enterNestedEventLoop FAILS "+exc, exc);
        }
        finally
        {
            dispatch(netDebuggers, "resumeActivity");
            this.activitySuspended = false;
        }

        return fbs.nestedEventLoopDepth;
    },

    exitNestedEventLoop: function()
    {
        try
        {
            return jsd.exitNestedEventLoop();
        }
        catch (exc)
        {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("fbs: jsd.exitNestedEventLoop FAILS "+exc, exc);
        }
    },

    /*
     * We are running JS code for Firebug, but we want to break into the debugger with a stack frame.
     * @param debuggr Debugger object asking for break
     * @param fnOfFrame, function(frame) to run on break
     */

    halt: function(debuggr, fnOfFrame)
    {
        if (!debuggr || !fnOfFrame)
        {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("fbs.halt call FAILS bad arguments", arguments);
            return null;
        }

        if (FBTrace.DBG_FBS_BP)
            FBTrace.sysout('fbs.halt jsd.isOn:'+jsd.isOn+' jsd.pauseDepth:'+jsd.pauseDepth+" fbs.isChromeBlocked "+fbs.isChromeBlocked+"  jsd.debuggerHook: "+ jsd.debuggerHook, jsd.debuggerHook);

        // store for onDebugger
        haltObject = {haltDebugger: debuggr, haltCallBack: fnOfFrame};

        // call onDebugger via hook
        fbs.debuggerHalter();
        return fbs.haltReturnValue;
    },

    step: function(mode, startFrame, stayOnDebuggr)
    {
        stepMode = mode;

        stepRecursion = 0;
        stepFrameTag = startFrame.script.tag;
        stepFrameLineId = stepRecursion + startFrame.script.fileName + startFrame.line;
        stepStayOnDebuggr = stayOnDebuggr;

        if (FBTrace.DBG_FBS_STEP)
            FBTrace.sysout("step stepMode = "+getStepName(stepMode) +" stepFrameLineId="+stepFrameLineId+" stepRecursion="+stepRecursion+" stepFrameTag "+stepFrameTag+" stepStayOnDebuggr:"+(stepStayOnDebuggr?stepStayOnDebuggr:"null"));
    },

    suspend: function(stayOnDebuggr, context)
    {
        stepMode = STEP_SUSPEND;
        stepFrameLineId = null;
        stepStayOnDebuggr = stayOnDebuggr;

        if (FBTrace.DBG_FBS_STEP)
            FBTrace.sysout("step stepMode = "+getStepName(stepMode) +" stepFrameLineId="+stepFrameLineId+" stepRecursion="+stepRecursion+" stepStayOnDebuggr:"+(stepStayOnDebuggr?stepStayOnDebuggr:"null"));

        dispatch(debuggers, "onBreakingNext", [stayOnDebuggr, context]);

        this.hookInterrupts();
    },

    runUntil: function(sourceFile, lineNo, startFrame, debuggr)
    {
        runningUntil = this.addBreakpoint(BP_UNTIL, sourceFile, lineNo, null, debuggr);
        stepRecursion = 0;
        stepFrameTag = startFrame.script.tag;
        stepFrameLineId = stepRecursion + startFrame.script.fileName + startFrame.line;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    setBreakpoint: function(sourceFile, lineNo, props, debuggr)
    {
        var bp = this.addBreakpoint(BP_NORMAL, sourceFile, lineNo, props, debuggr);
        if (bp)
        {
            dispatch(debuggers, "onToggleBreakpoint", [sourceFile.href, lineNo, true, bp]);
            fbs.saveBreakpoints(sourceFile.href);  // after every call to onToggleBreakpoint
            return true;
        }
        return false;
    },

    clearBreakpoint: function(url, lineNo)
    {
        var bp = this.removeBreakpoint(BP_NORMAL, url, lineNo);
        if (bp)
        {
            dispatch(debuggers, "onToggleBreakpoint", [url, lineNo, false, bp]);
            fbs.saveBreakpoints(url);
        }
        return bp;
    },

    enableBreakpoint: function(url, lineNo)
    {
        var bp = this.findBreakpoint(url, lineNo);
        if (bp && bp.type & BP_NORMAL)
        {
            bp.disabled &= ~BP_NORMAL;
            dispatch(debuggers, "onToggleBreakpoint", [url, lineNo, true, bp]);
            fbs.saveBreakpoints(url);
            --disabledCount;
        }
        else {
            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("fbs.enableBreakpoint no find for "+lineNo+"@"+url);
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
            fbs.saveBreakpoints(url);
        }
        else
        {
            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("fbs.disableBreakpoint no find for "+lineNo+"@"+url);
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
        fbs.saveBreakpoints(sourceFile.href);
        return bp;
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

            var urlBreakpoints = fbs.getBreakpoints(url);

            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("clearAllBreakpoints "+url+" urlBreakpoints: "+
                    (urlBreakpoints?urlBreakpoints.length:"null"));

            if (!urlBreakpoints)
                return false;

            for(var ibp = 0; ibp < urlBreakpoints.length; ibp++)
            {
                var bp = urlBreakpoints[ibp];
                this.clearBreakpoint(url, bp.lineNo);
            }
         }
    },

    enumerateBreakpoints: function(url, cb)  // url is sourceFile.href, not jsd script.fileName
    {
        if (url)
        {
            var urlBreakpoints = fbs.getBreakpoints(url);
            if (urlBreakpoints)
            {
                for (var i = 0; i < urlBreakpoints.length; ++i)
                {
                    var bp = urlBreakpoints[i];
                    if (bp.type & BP_NORMAL && !(bp.type & BP_ERROR) )
                    {
                        if (bp.scriptsWithBreakpoint && bp.scriptsWithBreakpoint.length > 0)
                        {
                            var rc = cb.call.apply(bp, [url, bp.lineNo, bp, bp.scriptsWithBreakpoint]);
                            if (rc)
                                return [bp];
                        }
                        else
                        {
                            var rc = cb.call.apply(bp, [url, bp.lineNo, bp]);
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
            var urls = fbs.getBreakpointURLs();
            for (var i = 0; i < urls.length; i++)
                bps.push(this.enumerateBreakpoints(urls[i], cb));
            return bps;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // error breakpoints are a way of selecting breakpoint from the Console
    //
    setErrorBreakpoint: function(sourceFile, lineNo, debuggr)
    {
        var url = sourceFile.href;
        var index = this.findErrorBreakpoint(url, lineNo);
        if (index == -1)
        {
            try
            {
                var bp = this.addBreakpoint(BP_NORMAL | BP_ERROR, sourceFile, lineNo, null, debuggr);
                if (bp)
                {
                    errorBreakpoints.push({href: url, lineNo: lineNo, type: BP_ERROR });
                    dispatch(debuggers, "onToggleErrorBreakpoint", [url, lineNo, true, debuggr]);
                    fbs.saveBreakpoints(sourceFile.href);  // after every call to onToggleBreakpoint
                }

            }
            catch(exc)
            {
                FBTrace.sysout("fbs.setErrorBreakpoint FAILS "+exc, exc);
            }
        }
    },

    clearErrorBreakpoint: function(url, lineNo, debuggr)
    {
        var index = this.findErrorBreakpoint(url, lineNo);
        if (index != -1)
        {
            var bp = this.removeBreakpoint(BP_NORMAL | BP_ERROR, url, lineNo);

            errorBreakpoints.splice(index, 1);
            dispatch(debuggers, "onToggleErrorBreakpoint", [url, lineNo, false, debuggr]);
            fbs.saveBreakpoints(url);  // after every call to onToggleBreakpoint
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
                    cb.call(bp.href, bp.lineNo, bp);
            }
        }
        else
        {
            for (var i = 0; i < errorBreakpoints.length; ++i)
            {
                var bp = errorBreakpoints[i];
                cb.call(bp.href, bp.lineNo, bp);
            }
        }
    },

    findErrorBreakpoint: function(url, lineNo)
    {
        for (var i = 0; i < errorBreakpoints.length; ++i)
        {
            var bp = errorBreakpoints[i];
            if (bp.lineNo === lineNo && bp.href == url)
                return i;
        }

        return -1;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    traceAll: function(urls, debuggr)
    {
        this.hookCalls(debuggr.onFunctionCall, false);  // call on all passed urls
    },


    untraceAll: function(debuggr)
    {
        this.unhookFunctions(); // undo hookCalls()
    },

    traceCalls: function(sourceFile, lineNo, debuggr)
    {
        var bp = this.monitor(sourceFile, lineNo, debuggr); // set a breakpoint on the starting point
        bp.type |= BP_TRACE;
        // when we hit the bp in onBreakPoint we being tracing.
    },

    untraceCalls: function(sourceFile, lineNo, debuggr)
    {
        var bp = lineNo != -1 ? this.findBreakpoint(url, lineNo) : null;
        if (bp)
        {
            bp.type &= ~BP_TRACE;
            this.unmonitor(sourceFile.href, lineNo);
        }
    },

    monitor: function(sourceFile, lineNo, debuggr)
    {
        if (lineNo == -1)
            return null;

        var bp = this.addBreakpoint(BP_MONITOR, sourceFile, lineNo, null, debuggr);
        if (bp)
        {
            ++monitorCount;
            dispatch(debuggers, "onToggleMonitor", [sourceFile.href, lineNo, true]);
        }
        return bp;
    },

    unmonitor: function(href, lineNo)
    {
        if (lineNo != -1 && this.removeBreakpoint(BP_MONITOR, href, lineNo))
        {
            --monitorCount;
            dispatch(debuggers, "onToggleMonitor", [ href, lineNo, false]);
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
            var urlBreakpoints = fbs.getBreakpoints(url);
            if (urlBreakpoints)
            {
                for (var i = 0; i < urlBreakpoints.length; ++i)
                {
                    var bp = urlBreakpoints[i];
                    if (bp.type & BP_MONITOR)
                        cb.call(url, bp.lineNo, bp);
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

        if (!jsd)
        {
            jsd = DebuggerService.getService(jsdIDebuggerService);

            if ( FBTrace.DBG_FBS_ERRORS )
                FBTrace.sysout("enableDebugger gets jsd service, isOn:"+jsd.isOn+" initAtStartup:"+jsd.initAtStartup+" now have "+debuggers.length+" debuggers"+" in "+clients.length+" clients");

            // This property has been removed from Fx40
            if (jsd.initAtStartup)
                jsd.initAtStartup = false;
        }

        if (jsd.asyncOn) // then FF 4.0+
        {
            if (!jsd.isOn)
            {
                jsd.asyncOn(  // turn on jsd for the next event
                        {
                            onDebuggerActivated: function doDebuggerActivated()
                            {
                                // now we are in the next event and jsd is on.
                                fbs.onDebuggerActivated();
                                fbs.onJSDebuggingActive();
                            }
                        });
            }
            else
            {
                fbs.onJSDebuggingActive();
            }
        }
        else // FF 3.6-
        {
            if (!jsd.isOn)
            {
                if (FBTrace.DBG_FBS_ERRORS)
                    FBTrace.sysout("Firefox 3.6 or earlier  ==========================");

                jsd.on(); // this should be the only call to jsd.on().
                fbs.onDebuggerActivated();
            }
            fbs.onJSDebuggingActive();
        }
    },

    onDebuggerActivated: function()
    {
        jsd.flags |= DISABLE_OBJECT_TRACE;
        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("jsd.onDebuggerActivated ==========================");
        if (jsd.pauseDepth && FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("fbs.enableDebugger found non-zero jsd.pauseDepth !! "+jsd.pauseDepth);
    },

    onJSDebuggingActive: function()
    {
        if (!this.filterChrome)
            this.createChromeBlockingFilters();

        var active = fbs.isJSDActive();

        dispatch(clients, "onJSDActivate", [active, "fbs enableDebugger"]);
        this.hookScripts();

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("enableDebugger with active "+active);
    },

    obeyPrefs: function()
    {
        fbs.showStackTrace = prefs.getBoolPref("extensions.firebug.service.showStackTrace");
        fbs.breakOnErrors = prefs.getBoolPref("extensions.firebug.service.breakOnErrors");
        fbs.trackThrowCatch = prefs.getBoolPref("extensions.firebug.service.trackThrowCatch");

        var pref = fbs.scriptsFilter;
        fbs.scriptsFilter = prefs.getCharPref("extensions.firebug.service.scriptsFilter");
        var mustReset = (pref !== fbs.scriptsFilter)

        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("obeyPrefs mustReset = "+mustReset+" pref: "+pref+" fbs.scriptsFilter: "+fbs.scriptsFilter, fbs);

        pref = fbs.filterSystemURLs;
        fbs.filterSystemURLs = prefs.getBoolPref("extensions.firebug.service.filterSystemURLs");  // may not be exposed to users
        mustReset = mustReset || (pref !== fbs.filterSystemURLs);

        if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("obeyPrefs mustReset = "+mustReset+" pref: "+pref+" fbs.filterSystemURLs: "+fbs.filterSystemURLs);

        if (mustReset && jsd && jsd.scriptHook)
        {
            fbs.unhookScripts();
            fbs.hookScripts();
        }

        FirebugPrefsObserver.syncFilter();

        try {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("fbs.obeyPrefs showStackTrace:"+fbs.showStackTrace+" breakOnErrors:"+fbs.breakOnErrors+" trackThrowCatch:"+fbs.trackThrowCatch+" scriptFilter:"+fbs.scriptsFilter+" filterSystemURLs:"+fbs.filterSystemURLs);
        }
        catch (exc)
        {
            FBTrace.sysout("firebug-service: constructor getBoolPrefs FAILED with exception=",exc);
        }
    },

    disableDebugger: function()
    {
        if (!enabledDebugger)
            return;

        if (!timer)  // then we probably shutdown
            return;

        enabledDebugger = false;

        if (jsd.isOn)
        {
            jsd.pause();
            fbs.unhookScripts();

            while (jsd.pauseDepth > 0)  // unwind completely
                jsd.unPause();
            fbs.pauseDepth = 0;

            jsd.off();
        }

        var active = fbs.isJSDActive();
        dispatch(clients, "onJSDDeactivate", [active, "fbs disableDebugger"]);

        fbs.onXScriptCreatedByTag = {};  // clear any uncleared top level scripts

        if (FBTrace.DBG_FBS_FINDDEBUGGER || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("fbs.disableDebugger jsd.isOn:"+jsd.isOn+" for enabledDebugger: "+enabledDebugger);
    },

    pause: function()  // must support multiple calls
    {
        if (!enabledDebugger)
            return "not enabled";
        var rejection = [];
        dispatch(clients, "onPauseJSDRequested", [rejection]);

        if (rejection.length == 0)  // then everyone wants to pause
        {
            if (fbs.pauseDepth == 0)  // don't pause if we are paused.
            {
                fbs.pauseDepth++;
                jsd.pause();
                fbs.unhookScripts();
            }
            var active = fbs.isJSDActive();
            dispatch(clients, "onJSDDeactivate", [active, "pause depth "+jsd.pauseDepth]);
        }
        else // we don't want to pause
        {
            while (fbs.pauseDepth > 0)  // make sure we are not paused.
                fbs.unPause();
            fbs.pauseDepth = 0;
        }
        if (FBTrace.DBG_FBS_FINDDEBUGGER || FBTrace.DBG_ACTIVATION)
        {
            FBTrace.sysout("fbs.pause depth "+(jsd.isOn?jsd.pauseDepth:"jsd OFF")+" fbs.pauseDepth: "+fbs.pauseDepth+" rejection "+rejection.length+" from "+clients.length+" clients ");
            // The next line gives NS_ERROR_NOT_AVAILABLE
            // FBTrace.sysout("fbs.pause depth "+(jsd.isOn?jsd.pauseDepth:"jsd OFF")+" rejection "+rejection.length+" from clients "+clients, rejection);
        }
        return fbs.pauseDepth;
    },

    unPause: function(force)
    {
        if (fbs.pauseDepth > 0 || force)
        {
            if (FBTrace.DBG_ACTIVATION && (!jsd.isOn || jsd.pauseDepth == 0) )
                FBTrace.sysout("fbs.unpause while jsd.isOn is "+jsd.isOn+" and hooked scripts pauseDepth:"+jsd.pauseDepth);

            fbs.pauseDepth--;
            fbs.hookScripts();

            if(jsd.pauseDepth)
                var depth = jsd.unPause();

            var active = fbs.isJSDActive();


            if (FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("fbs.unPause hooked scripts and unPaused, active:"+active+" depth "+depth+" jsd.isOn: "+jsd.isOn+" fbs.pauseDepth "+fbs.pauseDepth);

            dispatch(clients, "onJSDActivate", [active, "unpause depth"+jsd.pauseDepth]);

        }
        else  // we were not paused.
        {
            if (FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("fbs.unPause no action: (jsd.pauseDepth || !jsd.isOn) = ("+ jsd.pauseDepth+" || "+ !jsd.isOn+")"+" fbs.pauseDepth "+fbs.pauseDepth);
        }
        return fbs.pauseDepth;
    },

    isJSDActive: function()
    {
        return (jsd && jsd.isOn && (jsd.pauseDepth == 0) );
    },

    broadcast: function(message, args)  // re-transmit the message (string) with args [objs] to XUL windows.
    {
        dispatch(clients, message, args);
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("fbs.broadcast "+message+" to "+clients.length+" clients", clients);
    },


    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    normalizeURL: function(url)
    {
        // For some reason, JSD reports file URLs like "file:/" instead of "file:///", so they
        // don't match up with the URLs we get back from the DOM
        return url ? url.replace(/file:\/([^/])/, "file:///$1") : "";
    },

    denormalizeURL: function(url)
    {
        // This should not be called.
        return url ? url.replace(/file:\/\/\//, "file:/") : "";
    },


    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // jsd Hooks

    // When (debugger keyword and not halt)||(bp and BP_UNTIL) || (onBreakPoint && no conditions)
    // || interuptHook.  rv is ignored
    onBreak: function(frame, type, rv)
    {
        try
        {
            // avoid step_out from web page to chrome
            if (type==jsdIExecutionHook.TYPE_INTERRUPTED && stepStayOnDebuggr)
            {
                var debuggr = this.reFindDebugger(frame, stepStayOnDebuggr);
                if (FBTrace.DBG_FBS_STEP && (stepMode != STEP_SUSPEND) )
                    FBTrace.sysout("fbs.onBreak type="+getExecutionStopNameFromType(type)+" hookFrameCount:"+hookFrameCount+" stepStayOnDebuggr "+stepStayOnDebuggr+" debuggr:"+(debuggr?debuggr:"null")+" last_debuggr="+(fbs.last_debuggr?fbs.last_debuggr.debuggerName:"null"));

                if (!debuggr)
                {
                    // This frame is not for the debugger we want
                    if (stepMode == STEP_OVER || stepMode == STEP_OUT)  // then we are in the debuggr we want and returned in to one we don't
                    {
                        this.stopStepping(frame); // run, you are free.
                    }

                    return RETURN_CONTINUE;  // This means that we will continue to take interrupts until  when?
                }
                else
                {
                    if (stepMode == STEP_SUSPEND) // then we have interrupted the outerFunction
                    {
                        var scriptTag = frame.script.tag;
                        if (scriptTag in this.onXScriptCreatedByTag) // yes, we have to create the sourceFile
                            this.onBreakpoint(frame, type, rv);  // TODO refactor so we don't get mixed up
                    }
                }
            }
            else
            {
                var debuggr = this.findDebugger(frame);

                if (FBTrace.DBG_FBS_STEP)
                    FBTrace.sysout("fbs.onBreak type="+getExecutionStopNameFromType(type)+" debuggr:"+(debuggr?debuggr:"null")+" last_debuggr="+(fbs.last_debuggr?fbs.last_debuggr.debuggerName:"null"));
            }

            if (debuggr)
                return this.breakIntoDebugger(debuggr, frame, type);

        }
        catch(exc)
        {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("onBreak failed: "+exc,exc);
            ERROR("onBreak failed: "+exc);
        }
        return RETURN_CONTINUE;
    },

    // When engine encounters debugger keyword (only)
    onDebugger: function(frame, type, rv)
    {
        if (FBTrace.DBG_FBS_BP)
            FBTrace.sysout("fbs.onDebugger with haltDebugger="+(haltObject?haltObject.haltDebugger:"null")+" in "+frame.script.fileName, frame.script);
        try
        {
            if ( FBTrace.DBG_FBS_SRCUNITS && fbs.isTopLevelScript(frame, type, rv)  )
                FBTrace.sysout("fbs.onDebugger found topLevelScript "+ frame.script.tag);

            if (  FBTrace.DBG_FBS_SRCUNITS && fbs.isNestedScript(frame, type, rv) )
                FBTrace.sysout("fbs.onDebugger found nestedScript "+ frame.script.tag);

            if (haltObject)
            {
                var peelOurselvesOff = frame;
                if (peelOurselvesOff.script.fileName.indexOf("modules/debuggerHalter.js") > 0)
                    peelOurselvesOff = frame.callingFrame;  // remove debuggerHalter()

                while( peelOurselvesOff && ( peelOurselvesOff.script.fileName.indexOf("content/debugger.js") > 0 ) )
                    peelOurselvesOff = peelOurselvesOff.callingFrame;

                if (peelOurselvesOff)
                {
                    if (FBTrace.DBG_FBS_BP)
                        FBTrace.sysout("fbs.onDebugger, "+(haltObject.haltCallBack?"with":"without")+" callback, adjusted newest frame: "+peelOurselvesOff.line+'@'+peelOurselvesOff.script.fileName+" frames: ", framesToString(frame));

                    var debuggr = haltObject.haltDebugger;
                    var callback = haltObject.haltCallBack;
                    fbs.haltReturnValue = callback.apply(debuggr,[peelOurselvesOff]);
                }
                else
                {
                    FBTrace.sysout("fbs.halt FAILS "+framesToString(frame));
                    fbs.haltReturnValue = "firebug-service.halt FAILS, no stack frames left ";
                }

                return RETURN_CONTINUE;
            }
            else
            {
                var bp = this.findBreakpointByScript(frame.script, frame.pc);
                if (bp) // then breakpoints override debugger statements (to allow conditional debugger statements);
                    return this.onBreakpoint(frame, type, rv);
                else
                    return this.onBreak(frame, type, rv);
            }
        }
        catch(exc)
        {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("onDebugger failed: "+exc,exc);

            ERROR("onDebugger failed: "+exc);
            return RETURN_CONTINUE;
        }
        finally
        {
            haltObject = null;
        }
    },

    // when the onError handler returns false
    onDebug: function(frame, type, rv)
    {
        if (FBTrace.DBG_FBS_ERRORS)
        {
            fbs.onDebugRequests--;
            FBTrace.sysout("fbs.onDebug ("+fbs.onDebugRequests+") fileName="+frame.script.fileName+ " reportNextError="+reportNextError+" breakOnNext:"+this.breakOnErrors);
        }
        if ( isFilteredURL(frame.script.fileName) )
        {
            reportNextError = false;
            return RETURN_CONTINUE;
        }

        try
        {
            var breakOnNextError = this.needToBreakForError(reportNextError);
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
                if ( fbs.isTopLevelScript(frame, type, rv) && FBTrace.DBG_FBS_SRCUNITS )
                    FBTrace.sysout("fbs.onDebug found topLevelScript "+ frame.script.tag);
                if ( fbs.isNestedScript(frame, type, rv) && FBTrace.DBG_FBS_SRCUNITS )
                    FBTrace.sysout("fbs.onDebug found nestedScript "+ frame.script.tag);


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
        if ( fbs.isTopLevelScript(frame, type, val) )
        {
            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("onBreakpoint isTopLevel returning "+RETURN_CONTINUE);

            return RETURN_CONTINUE;
        }

        var bp = this.findBreakpointByScript(frame.script, frame.pc);
        if (bp)
        {
            var theDebugger = fbs.getDebuggerByName(bp.debuggerName);
            if (!theDebugger)
                theDebugger = this.findDebugger(frame);  // sets debuggr.breakContext

            // See issue 1179, should not break if we resumed from a single step and have not advanced.
            if (disabledCount || monitorCount || conditionCount || runningUntil)
            {
                if (FBTrace.DBG_FBS_BP)
                {
                    FBTrace.sysout("onBreakpoint("+getExecutionStopNameFromType(type)+") disabledCount:"+disabledCount
                              +" monitorCount:"+monitorCount+" conditionCount:"+conditionCount+" runningUntil:"+runningUntil, bp);
                }

                if (bp.type & BP_MONITOR && !(bp.disabled & BP_MONITOR))
                {
                    if (bp.type & BP_TRACE && !(bp.disabled & BP_TRACE) )
                        this.hookCalls(theDebugger.onFunctionCall, true);
                    else
                        theDebugger.onMonitorScript(frame);
                }

                if (bp.type & BP_UNTIL)
                {
                    this.stopStepping(frame);
                    if (theDebugger)
                        return this.breakIntoDebugger(theDebugger, frame, type);
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
                return this.breakIntoDebugger(theDebugger, frame, type);
        }
        else
        {
            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("onBreakpoint("+getExecutionStopNameFromType(type)+") NO bp match with frame.script.tag="+frame.script.tag+" clearing and continuing");
            // We did not find a logical breakpoint to match the one set into JSD, so stop trying.
            frame.script.clearBreakpoint(frame.pc);
            return RETURN_CONTINUE;
        }

        if (runningUntil)
            return RETURN_CONTINUE;
        else
            return this.onBreak(frame, type, val);
    },

    onFunction: function(frame, type)
    {
        switch (type)
        {
            case TYPE_TOPLEVEL_START: // fall through
            case TYPE_FUNCTION_CALL:  // the frame will be running the called script
            {
                if (stepMode == STEP_OVER || stepMode == STEP_OUT)
                {
                    if (frame.callingFrame && frame.callingFrame.script.tag === stepFrameTag) // then we are called by the stepping script
                        stepRecursion++;

                        this.unhookInterrupts(frame); // don't watch execution steps, wait for return
                }
                else if (stepMode == STEP_INTO)  // normally step into will break in the interrupt handler, but not in event handlers.
                {
                    fbs.stopStepping(frame);
                    stepMode = STEP_SUSPEND; // break on next
                    fbs.hookInterrupts(frame);  // FF4JM setBreakpoint(0), the test (stepMode === STEP_INTO) when we hit
                }

                break;
            }
            case TYPE_TOPLEVEL_END: // fall through
            case TYPE_FUNCTION_RETURN:  // the frame will be running the called script
            {
                if (!frame.callingFrame)   // stack empty
                {
                    if ( (stepMode == STEP_INTO) || (stepMode == STEP_OVER) )
                    {
                        fbs.stopStepping(frame);
                        stepMode = STEP_SUSPEND; // break on next
                        fbs.hookInterrupts(frame); // FF4JM, I think we should bail, the stack is empty even if the user said INTO
                    }
                    else
                    {
                        fbs.stopStepping(frame);
                    }
                }
                else if (stepMode == STEP_OVER || stepMode == STEP_OUT)
                {
                    if (!stepRecursion) // then we never hit FUNCTION_CALL or we rolled back after we hit it
                    {
                        if (frame.script.tag === stepFrameTag)// We are in the stepping frame,
                            fbs.hookInterrupts(frame);  // so halt on the next PC // FF4JM setBreakOnAllPC
                    }
                    else if (frame.callingFrame.script.tag === stepFrameTag) //then we could be in the step call
                    {
                        stepRecursion--;

                        if (!stepRecursion) // then we've rolled back to the step-call
                        {
                            if (stepMode == STEP_OVER) // then halt in the next pc of the caller
                                fbs.hookInterrupts(frame); // FF4JM setBreakOnAllPC
                        }
                    }
                    // else we are not interested in this FUNCTION_RETURN
                }

                break;
            }
        }
        if (FBTrace.DBG_FBS_STEP)
        {
            var typeName = getCallFromType(type);
            var actualFrames = countFrames(frame);
            FBTrace.sysout("functionHook "+typeName+" stepMode = "+getStepName(stepMode)+" for script "+stepFrameTag+
                " (actual: "+actualFrames+") stepRecursion="+
                stepRecursion+" running "+frame.script.tag+" of "+frame.script.fileName+" at "+frame.line+"."+frame.pc);
        }
    },

    onInterrupt: function(frame, type, rv)
    {
        /*if ( isFilteredURL(frame.script.fileName) )  // it does not seem feasible to use jsdIFilter-ing TODO try again
        {
            if (FBTrace.DBG_FBS_STEP)
                FBTrace.sysout("fbs.hookInterrupts filtered "+frame.script.fileName);
            return RETURN_CONTINUE;
        }
         */

        // Sometimes the same line will have multiple interrupts, so check
        // a unique id for the line and don't break until it changes
        var frameLineId = stepRecursion + frame.script.fileName + frame.line;
        if (FBTrace.DBG_FBS_STEP && (stepMode != STEP_SUSPEND) )
            FBTrace.sysout("interruptHook pc:"+frame.pc+" frameLineId: "+frameLineId+" vs "+stepFrameLineId+" running "+frame.script.tag+" of "+frame.script.fileName+" at "+frame.line+"."+frame.pc);
        if (frameLineId != stepFrameLineId)
            return fbs.onBreak(frame, type, rv);
        else
            return RETURN_CONTINUE;
    },

    onThrow: function(frame, type, rv)
    {
        if ( isFilteredURL(frame.script.fileName) )
            return RETURN_CONTINUE_THROW;

        if (rv && rv.value && rv.value.isValid)
        {
            var value = rv.value;
            if (value.jsClassName == "Error" && reTooMuchRecursion.test(value.stringValue))
            {
                if (fbs._lastErrorCaller)
                {
                    if (fbs._lastErrorCaller == frame.script.tag) // then are unwinding recursion
                    {
                        fbs._lastErrorCaller = frame.callingFrame ? frame.callingFrame.script.tag : null;
                        return RETURN_CONTINUE_THROW;
                    }
                }
                else
                {
                    fbs._lastErrorCaller = frame.callingFrame.script.tag;
                    frame = fbs.discardRecursionFrames(frame);
                    // go on to process the throw.
                }
            }
            else
            {
                delete fbs._lastErrorCaller; // throw is not recursion
            }
        }
        else
        {
            delete fbs._lastErrorCaller; // throw is not recursion either
        }

        // Remember the error where the last exception is thrown - this will
        // be used later when the console service reports the error, since
        // it doesn't currently report the window where the error occurred
        fbs._lastErrorWindow = null;

        if (this.showStackTrace)  // store these in case the throw is not caught
        {
            var debuggr = this.findDebugger(frame);  // sets debuggr.breakContext
            if (debuggr)
            {
                fbs._lastErrorScript = frame.script;
                fbs._lastErrorLine = frame.line;
                fbs._lastErrorDebuggr = debuggr;
                fbs._lastErrorContext = debuggr.breakContext; // XXXjjb this is bad API
                fbs._lastErrorWindow = fbs._lastErrorContext.window;
            }
            else
                delete fbs._lastErrorDebuggr;
        }
        if (!fbs._lastErrorWindow)
            this._lastErrorWindow =  this.getOutermostScope(frame);

        if (fbs.trackThrowCatch)
        {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("onThrow from tag:"+frame.script.tag+":"+frame.script.fileName+"@"+frame.line+": "+frame.pc);

            var debuggr = this.findDebugger(frame);
            if (debuggr)
                return debuggr.onThrow(frame, rv);
        }

        return RETURN_CONTINUE_THROW;
    },

    onError: function(message, fileName, lineNo, pos, flags, errnum, exc)
    {
        if (FBTrace.DBG_FBS_ERRORS)
        {
            var messageKind;
            if (flags & jsdIErrorHook.REPORT_ERROR)
                messageKind = "Error";
            if (flags & jsdIErrorHook.REPORT_WARNING)
                messageKind = "Warning";
            if (flags & jsdIErrorHook.REPORT_EXCEPTION)
                messageKind = "Uncaught-Exception";
            if (flags & jsdIErrorHook.REPORT_STRICT)
                messageKind += "-Strict";
            FBTrace.sysout("fbs.onError ("+fbs.onDebugRequests+") with this.showStackTrace="+this.showStackTrace+" and this.breakOnErrors="
                   +this.breakOnErrors+" kind="+messageKind+" msg="+message+"@"+fileName+":"+lineNo+"."+pos+"\n");
        }

        // global to pass info to onDebug. Some duplicate values to support different apis
        errorInfo = { errorMessage: message, sourceName: fileName, lineNumber: lineNo,
                message: message, fileName: fileName, lineNo: lineNo,
                columnNumber: pos, flags: flags, category: "js", errnum: errnum, exc: exc };

        if (message=="out of memory")  // bail
        {
            if (FBTrace.DBG_FBS_ERRORS)
                fbs.osOut("fbs.onError sees out of memory "+fileName+":"+lineNo+"\n");
            return true;
        }

        reportNextError = { fileName: fileName, lineNo: lineNo };
        return false; // Drop into onDebug, sometimes only
    },

    onTopLevel: function(frame, type)
    {
        if (type === TYPE_TOPLEVEL_START || type === TYPE_TOPLEVEL_END)
        {
            if (FBTrace.DBG_TOPLEVEL)
                FBTrace.sysout("fbs.onTopLevel with delegate "+fbs.onTopLevelDelegate+" "+frame.script.tag+" "+frame.script.fileName);
            if (fbs.onTopLevelDelegate)
                fbs.onTopLevelDelegate(frame)
        }
    },

    setTopLevelHook: function(fnOfFrame)
    {
        fbs.onTopLevelDelegate = fnOfFrame;
    },

    isTopLevelScript: function(frame, type, val)
    {
        var scriptTag = frame.script.tag;
        if (FBTrace.DBG_FBS_SRCUNITS) FBTrace.sysout("isTopLevelScript frame.script.tag="+frame.script.tag );

        if (scriptTag in this.onXScriptCreatedByTag)
        {
            if (FBTrace.DBG_FBS_TRACKFILES)
                trackFiles.def(frame);
            var onXScriptCreated = this.onXScriptCreatedByTag[scriptTag];
            if (FBTrace.DBG_FBS_BP) FBTrace.sysout("isTopLevelScript("+getExecutionStopNameFromType(type)+") with frame.script.tag="
                                      +frame.script.tag+" onXScriptCreated:"+onXScriptCreated.kind+"\n");
            delete this.onXScriptCreatedByTag[scriptTag];
            frame.script.clearBreakpoint(0);
            try {
                var sourceFile = onXScriptCreated(frame, type, val);
            } catch (e) {
                FBTrace.sysout("isTopLevelScript called onXScriptCreated and it didn't end well:",e);
            }

            if (FBTrace.DBG_FBS_SRCUNITS)
            {
                var msg = "Top Scripts Uncleared:";
                for (p in this.onXScriptCreatedByTag) msg += (p+"|");
                FBTrace.sysout(msg);
            }
            if (!sourceFile || !sourceFile.breakOnZero || sourceFile.breakOnZero != scriptTag)
                return true;
            else  // sourceFile.breakOnZero matches the script we have halted.
            {
               if (FBTrace.DBG_FBS_BP)
                   FBTrace.sysout("fbs.isTopLevelScript breakOnZero, continuing for user breakpoint\n");
            }
        }
        return false;
    },

    /*
     * If true, emergency bailout: a frame is running a script which has not been processed as source
     */
    isNestedScript: function(frame, type, val)
    {
        if ( fbs.nestedScriptStack.length === 0 || fbs.nestedScriptStack.indexOf(frame.script) === -1 )
            return false;

        try {
            var sourceFile = fbs.onTopLevelScriptCreated(frame, type, val);
        } catch (e) {
            FBTrace.sysout("isNestedScript called onXScriptCreated and it didn't end well:",e);
        }

        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onXULScriptCreated: function(frame, type, val, noNestTest)
    {
        // A XUL script hit a breakpoint
        try
        {
            var outerScript = frame.script;
            var innerScripts = [];
            for (var i = 0; i < fbs.pendingXULScripts.length; i++)
            {
                // Take all the pending script from the same file as part of this sourcefile
                if (fbs.pendingXULScripts[i].fileName === outerScript.fileName)
                {
                    var innerScript = fbs.pendingXULScripts[i];
                    innerScripts.push(innerScript);
                    if (innerScript.isValid)
                        innerScript.clearBreakpoint(0);

                    fbs.pendingXULScripts.splice(i,1);
                }
            }
            var debuggr = fbs.findDebugger(frame);  // sets debuggr.breakContext
            if (debuggr)
            {
                innerScripts.push(outerScript);
                var innerScriptEnumerator =
                {
                     index: 0,
                     max: innerScripts.length,
                     hasMoreElements: function() { return this.index < this.max;},
                     getNext: function() { return innerScripts[this.index++]; },
                };
                var sourceFile = debuggr.onXULScriptCreated(frame, outerScript, innerScriptEnumerator);
                fbs.resetBreakpoints(sourceFile, debuggr);
            }
            else
            {
                if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
                    FBTrace.sysout("fbs.onEventScriptCreated no debuggr for "+frame.script.tag+":"+frame.script.fileName);
            }
        }
        catch(exc)
        {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("onXULScriptCreated fails "+exc, exc);
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
                        fbs.nestedScriptStack.splice(0,1);
                    }
                    else
                    {
                        if (FBTrace.DBG_FBS_SRCUNITS)  // these seem to be harmless, but...
                        {
                            var script = frame.script;
                             FBTrace.sysout("onEventScriptCreated no nestedScriptStack: "+script.tag+"@("+script.baseLineNumber+"-"
                                +(script.baseLineNumber+script.lineExtent)+")"+script.fileName+"\n");
                            FBTrace.sysout("onEventScriptCreated name: \'"+script.functionName+"\'\n");
                            try {
                            FBTrace.sysout(script.functionSource);
                            } catch (exc) { /*Bug 426692 */ }

                        }
                    }
                }

                var debuggr = fbs.findDebugger(frame);  // sets debuggr.breakContext
                if (debuggr)
                {
                    var sourceFile = debuggr.onEventScriptCreated(frame, frame.script, fbs.getNestedScriptEnumerator());
                    fbs.resetBreakpoints(sourceFile, debuggr);
                }
                else
                {
                    if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
                        FBTrace.sysout("fbs.onEventScriptCreated no debuggr for "+frame.script.tag+":"+frame.script.fileName);
                }
            } catch(exc) {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("onEventScriptCreated failed: "+exc, exc);
            }
            if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
                FBTrace.sysout("onEventScriptCreated frame.script.tag:"+frame.script.tag+" href: "+(sourceFile?sourceFile.href:"no sourceFile"), sourceFile);
        }

        fbs.clearNestedScripts();
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
                    if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS) FBTrace.sysout("No calling Frame for eval frame.script.fileName:"+frame.script.fileName);
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
                    var sourceFile = debuggr.onEvalScriptCreated(frame, outerScript, fbs.getNestedScriptEnumerator());
                    fbs.resetBreakpoints(sourceFile, debuggr);
                }
                else
                {
                    if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS) FBTrace.sysout("fbs.onEvalScriptCreated no debuggr for "+outerScript.tag+":"+outerScript.fileName);
                }
            }
            catch (exc)
            {
                ERROR("onEvalScriptCreated failed: "+exc);
                if (FBTrace.DBG_FBS_ERRORS) FBTrace.sysout("onEvalScriptCreated failed:", exc);
            }
        }

        fbs.clearNestedScripts();
        if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS) FBTrace.sysout("onEvalScriptCreated outerScript.tag:"+outerScript.tag+" href: "+(sourceFile?sourceFile.href:"no sourceFile"));
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
                var firstScript = fbs.nestedScriptStack[0];
                if (firstScript.tag in fbs.onXScriptCreatedByTag)
                {
                    delete  fbs.onXScriptCreatedByTag[firstScript.tag];
                    if (firstScript.isValid)
                        firstScript.clearBreakpoint(0);
                    if (FBTrace.DBG_FBS_SRCUNITS)
                        FBTrace.sysout("fbs.onTopLevelScriptCreated clear bp@0 for firstScript.tag: "+firstScript.tag+"\n");
                }
            }

            // On compilation of a top-level (global-appending) function.
            // After this top-level script executes we lose the jsdIScript so we can't build its line table.
            // Therefore we need to build it here.
            var debuggr = fbs.findDebugger(frame);  // sets debuggr.breakContext
            if (debuggr)
            {
                var sourceFile = debuggr.onTopLevelScriptCreated(frame, frame.script, fbs.getNestedScriptEnumerator());
                if (FBTrace.DBG_FBS_SRCUNITS) FBTrace.sysout("fbs.onTopLevelScriptCreated got sourceFile:"+sourceFile+" using "+fbs.nestedScriptStack.length+" nestedScripts\n");
                fbs.resetBreakpoints(sourceFile, debuggr);
            }
            else
            {
                // modules end up here?
                if (FBTrace.DBG_FBS_SRCUNITS)
                    FBTrace.sysout("FBS.onTopLevelScriptCreated no debuggr for "+frame.script.tag);
            }
        }
        catch (exc)
        {
            FBTrace.sysout("onTopLevelScriptCreated FAILED: "+exc, exc);
            ERROR("onTopLevelScriptCreated Fails: "+exc);
        }

        fbs.clearNestedScripts();
        if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS) FBTrace.sysout("fbs.onTopLevelScriptCreated script.tag:"+frame.script.tag+" href: "+(sourceFile?sourceFile.href:"no sourceFile"));

        return sourceFile;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    getNestedScriptEnumerator: function()
    {
        var enumer =
        {
            index: 0,
            hasMoreElements: function()
            {
                return (this.index < fbs.nestedScriptStack.length);
            },
            getNext: function()
            {
                var rv = fbs.nestedScriptStack[this.index];
                this.index++;
                return rv;
            }
        };
        return enumer;
    },

    clearNestedScripts: function()
    {
        var innerScripts = fbs.nestedScriptStack;
        for ( var i = 0; i < innerScripts.length; i++)
        {
            var script = innerScripts[i];
            if (script.isValid && script.baseLineNumber == 1)
            {
                script.clearBreakpoint(0);
                if (this.onXScriptCreatedByTag[script.tag])
                    delete this.onXScriptCreatedByTag[script.tag];
            }
        }
        fbs.nestedScriptStack = [];
    },

    onScriptCreated: function(script)
    {
        if (!fbs)
        {
            if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS || FBTrace.DBG_FBS_TRACKFILES)
                FBTrace.sysout("onScriptCreated "+script.tag+", but no fbs for script.fileName="+script.fileName);
             return;
        }

        try
        {
            var fileName = script.fileName;

            if (FBTrace.DBG_FBS_TRACKFILES)
                trackFiles.add(fileName);
            if (isFilteredURL(fileName) || fbs.isChromebug(fileName))
            {
                try {
                    if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
                        FBTrace.sysout("onScriptCreated "+script.tag+": filename filtered:\'"+fileName+"\'"+(fbs.filterConsoleInjections?" console injection":""));
                } catch (exc) {
                    FBTrace.sysout("onScriptCreated "+script.tag+" filtered msg FAILS \'"+script.fileName+"\'"); /*? Bug 426692 */
                }
                if (FBTrace.DBG_FBS_TRACKFILES)
                    trackFiles.drop(fileName);
                return;
            }

            if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
                FBTrace.sysout("onScriptCreated: "+script.tag+"@("+script.baseLineNumber+"-"
                    +(script.baseLineNumber+script.lineExtent)+")"+script.fileName);

            if (script.lineExtent > 80000 && FBTrace.DBG_FBS_SRCUNITS)
                FBTrace.sysout("****************>> BOGUS line extent ("+script.lineExtent+") for "+script.fileName);

            if (FBTrace.DBG_FBS_CREATION)
            {
                try {
                    FBTrace.sysout("onScriptCreated: \'"+script.functionName+"\'", script.functionSource);
                } catch (exc) {
                    FBTrace.sysout("onScriptCreated "+script.tag+" FAILS \'"+script.fileName+"\'"); /*? Bug 426692 */
                }
            }

            if( reXUL.test(script.fileName) )
            {
                fbs.onXScriptCreatedByTag[script.tag] = fbs.onXULScriptCreated;
                fbs.pendingXULScripts.push(script);
                script.setBreakpoint(0);  // Stop in the first one called and assign all with this fileName to sourceFile.
            }
            else if (!script.functionName) // top or eval-level
            {
                // We need to detect eval() and grab its source.
                var hasCaller = fbs.createdScriptHasCaller();
                if (FBTrace.DBG_FBS_SRCUNITS) FBTrace.sysout("createdScriptHasCaller "+hasCaller);

                if (hasCaller)
                {
                    // components end up here
                    fbs.onXScriptCreatedByTag[script.tag] = this.onEvalScriptCreated;
                }
                else
                    fbs.onXScriptCreatedByTag[script.tag] = this.onTopLevelScriptCreated;

                script.setBreakpoint(0);
                if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS || FBTrace.DBG_FBS_BP)
                {
                    FBTrace.sysout("onScriptCreated: set BP at PC 0 in "+(hasCaller?"eval":"top")+" level tag="+script.tag+":"+script.fileName+" jsd depth:"+(jsd.isOn?jsd.pauseDepth+"":"OFF"));
                }
            }
            else if (script.baseLineNumber == 1)
            {
                // could be a 1) Browser-generated event handler or 2) a nested script at the top of a file
                // One way to tell is assume both then wait to see which we hit first:
                // 1) bp at pc=0 for this script or 2) for a top-level on at the same filename

                fbs.onXScriptCreatedByTag[script.tag] = this.onEventScriptCreated; // for case 1
                script.setBreakpoint(0);

                fbs.nestedScriptStack.push(script);  // for case 2

                if (FBTrace.DBG_FBS_CREATION)
                    FBTrace.sysout("onScriptCreated: set BP at PC 0 in event level tag="+script.tag);
            }
            else
            {
                fbs.nestedScriptStack.push(script);
                if (FBTrace.DBG_FBS_CREATION) FBTrace.sysout("onScriptCreated: nested function named: "+script.functionName);
                dispatch(scriptListeners,"onScriptCreated",[script, fileName, script.baseLineNumber]);
            }
        }
        catch(exc)
        {
            ERROR("onScriptCreated failed: "+exc);
            FBTrace.sysout("onScriptCreated failed: ", exc);
        }
    },

    createdScriptHasCaller: function()
    {
        if (FBTrace.DBG_FBS_SRCUNITS)
        {
            var msg = [];
            for (var frame = Components.stack; frame; frame = frame.caller)
                msg.push( frame.filename + "@" + frame.lineNumber +": "+frame.sourceLine  );
            FBTrace.sysout("createdScriptHasCaller "+msg.length, msg);
        }

        var frame = Components.stack; // createdScriptHasCaller

        frame = frame.caller;         // onScriptCreated
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
            if (FBTrace.DBG_FBS_CREATION)
                FBTrace.sysout('fbs.onScriptDestroyed '+script.tag);

            dispatch(scriptListeners,"onScriptDestroyed",[script]);
        }
        catch(exc)
        {
            ERROR("onScriptDestroyed failed: "+exc);
            FBTrace.sysout("onScriptDestroyed failed: ", exc);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    createFilter: function(pattern, pass)
    {
        var filter = {
                globalObject: null,
                flags: pass ? (jsdIFilter.FLAG_ENABLED | jsdIFilter.FLAG_PASS) : jsdIFilter.FLAG_ENABLED,
                urlPattern: pattern,
                startLine: 0,
                endLine: 0
            };
        return filter;
    },

    setChromeBlockingFilters: function()
    {
        if (!fbs.isChromeBlocked)
        {
            jsd.appendFilter(this.noFilterHalter);  // must be first
            jsd.appendFilter(this.filterChrome);
            jsd.appendFilter(this.filterComponents);
            jsd.appendFilter(this.filterFirebugComponents);
            jsd.appendFilter(this.filterModules);
            jsd.appendFilter(this.filterStringBundle);
            jsd.appendFilter(this.filterPrettyPrint);
            jsd.appendFilter(this.filterWrapper);

            for (var i = 0; i < this.componentFilters.length; i++)
                jsd.appendFilter(this.componentFilters[i]);

            fbs.isChromeBlocked = true;

            if (FBTrace.DBG_FBS_BP)
                this.traceFilters("setChromeBlockingFilters with "+this.componentFilters.length+" component filters");
        }
    },

    removeChromeBlockingFilters: function()
    {
        if (fbs.isChromeBlocked)
        {
            jsd.removeFilter(this.filterChrome);
            jsd.removeFilter(this.filterComponents);
            jsd.removeFilter(this.filterFirebugComponents);
            jsd.removeFilter(this.filterModules);
            jsd.removeFilter(this.filterStringBundle);
            jsd.removeFilter(this.filterPrettyPrint);
            jsd.removeFilter(this.filterWrapper);
            jsd.removeFilter(this.noFilterHalter);
            for (var i = 0; i < this.componentFilters.length; i++)
                jsd.removeFilter(this.componentFilters[i]);

            fbs.isChromeBlocked = false;
        }
        if (FBTrace.DBG_FBS_BP)
            this.traceFilters("removeChromeBlockingFilters");
    },

    createChromeBlockingFilters: function() // call after components are loaded.
    {
        try
        {
            this.filterModules = this.createFilter("*/firefox/modules/*");
            this.filterComponents = this.createFilter("*/firefox/components/*");
            this.filterFirebugComponents = this.createFilter("*/modules/firebug-*");
            this.filterStringBundle = this.createFilter("XStringBundle");
            this.filterChrome = this.createFilter("chrome://*");
            this.filterPrettyPrint = this.createFilter("x-jsd:ppbuffer*");
            this.filterWrapper = this.createFilter("XPCSafeJSObjectWrapper.cpp");
            this.noFilterHalter = this.createFilter("resource://firebug/debuggerHalter.js", true);

            // jsdIFilter does not allow full regexp matching.
            // So to filter components, we filter their directory names, which we obtain by looking for
            // scripts that match regexps

            var componentsUnfound = [];
            for( var i = 0; i < COMPONENTS_FILTERS.length; ++i )
            {
                componentsUnfound.push(COMPONENTS_FILTERS[i]);
            }

            this.componentFilters = [];

            jsd.enumerateScripts( {
                enumerateScript: function(script) {
                    var fileName = script.fileName;
                for( var i = 0; i < componentsUnfound.length; ++i )
                    {
                        if ( componentsUnfound[i].test(fileName) )
                        {
                            var match = componentsUnfound[i].exec(fileName);
                            fbs.componentFilters.push(fbs.createFilter(match[1]));
                            componentsUnfound.splice(i, 1);
                            return;
                        }
                    }
                }
            });
        } catch (exc) {
            FBTrace.sysout("createChromeblockingFilters fails >>>>>>>>>>>>>>>>> "+exc, exc);
        }

        if (FBTrace.DBG_FBS_BP)
        {
            FBTrace.sysout("createChromeBlockingFilters considered "+COMPONENTS_FILTERS.length+
                    " regexps and created "+this.componentFilters.length+
                    " filters with unfound: "+componentsUnfound.length, componentsUnfound);
            fbs.traceFilters("createChromeBlockingFilters");
        }
    },

    traceFilters: function(from)
    {
        FBTrace.sysout("fbs.traceFilters from "+from);
        jsd.enumerateFilters({ enumerateFilter: function(filter)
            {
                FBTrace.sysout("jsdIFilter "+filter.urlPattern, filter);
            }});
    },
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    eachJSContext: function(callback)
    {
        var enumeratedContexts = [];
        jsd.enumerateContexts( {enumerateContext: function(jscontext)
        {
                try
                {
                    if (!jscontext.isValid)
                        return;

                    var wrappedGlobal = jscontext.globalObject;
                    if (!wrappedGlobal)
                        return;

                    var unwrappedGlobal = wrappedGlobal.getWrappedValue();
                    if (!unwrappedGlobal)
                        return;

                    if (unwrappedGlobal instanceof Ci.nsISupports)
                        var global = new XPCNativeWrapper(unwrappedGlobal);
                    else
                        var global = unwrappedGlobal;

                    if (FBTrace.DBG_FBS_JSCONTEXTS)
                        FBTrace.sysout("getJSContexts jsIContext tag:"+jscontext.tag+(jscontext.isValid?" - isValid\n":" - NOT valid\n"));

                    if (global)
                    {
                        callback(global, jscontext.tag);
                    }
                    else
                    {
                        if (FBTrace.DBG_FBS_JSCONTEXTS)
                            FBTrace.sysout("getJSContexts no global object tag:"+jscontext.tag);
                        return; // skip this
                    }

                    enumeratedContexts.push(jscontext);
                }
                catch(e)
                {
                    FBTrace.sysout("jscontext dump FAILED "+e, e);
                }

        }});
        return enumeratedContexts;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getOutermostScope: function(frame)
    {
        var scope = frame.scope;
        if (scope)
        {
            while(scope.jsParent)
                scope = scope.jsParent;

            // These are just determined by trial and error.
            if (scope.jsClassName == "Window" || scope.jsClassName == "ChromeWindow" || scope.jsClassName == "ModalContentWindow")
            {
                lastWindowScope = wrapIfNative(scope.getWrappedValue());
                return  lastWindowScope;
            }

    /*        if (scope.jsClassName == "DedicatedWorkerGlobalScope")
            {
                //var workerScope = new XPCNativeWrapper(scope.getWrappedValue());

                //if (FBTrace.DBG_FBS_FINDDEBUGGER)
                //        FBTrace.sysout("fbs.getOutermostScope found WorkerGlobalScope: "+scope.jsClassName, workerScope);
                // https://bugzilla.mozilla.org/show_bug.cgi?id=507930 if (FBTrace.DBG_FBS_FINDDEBUGGER)
                //        FBTrace.sysout("fbs.getOutermostScope found WorkerGlobalScope.location: "+workerScope.location, workerScope.location);
                return null; // https://bugzilla.mozilla.org/show_bug.cgi?id=507783
            }
    */
            if (scope.jsClassName == "Sandbox")
            {
                var proto = scope.jsPrototype;
                if (proto.jsClassName == "XPCNativeWrapper")  // this is the path if we have web page in a sandbox
                {
                    proto = proto.jsParent;
                    if (proto.jsClassName == "Window")
                        return wrapIfNative(proto.getWrappedValue());
                }
                else
                {
                    return wrapIfNative(scope.getWrappedValue());
                }
            }

            if (FBTrace.DBG_FBS_FINDDEBUGGER)
                FBTrace.sysout("fbs.getOutermostScope found scope chain bottom, not Window: "+scope.jsClassName, scope);

            return wrapIfNative(scope.getWrappedValue());  // not a window or a sandbox
        }
        else
        {
            return null;
        }
    },

    findDebugger: function(frame)
    {
        if (debuggers.length < 1)
            return;

        var checkFrame = frame;
        while (checkFrame) // We may stop in a component, but want the callers Window
        {
            var frameScopeRoot = this.getOutermostScope(checkFrame);  // the outermost lexical scope of the function running the frame
            if (frameScopeRoot)
                break;

            if (FBTrace.DBG_FBS_FINDDEBUGGER)
                FBTrace.sysout("fbs.findDebugger no frame Window, looking to older stackframes", checkFrame);

            checkFrame = checkFrame.callingFrame;
        }

        if (!checkFrame && FBTrace.DBG_FBS_FINDDEBUGGER)
            FBTrace.sysout("fbs.findDebugger fell thru bottom of stack", frame);

        // frameScopeRoot should be the top window for the scope of the frame function
        // or null
        fbs.last_debuggr = fbs.askDebuggersForSupport(frameScopeRoot, frame);
        if (fbs.last_debuggr)
             return fbs.last_debuggr;
        else
            return null;
    },

    isChromebug: function(location)
    {
        // TODO this is a kludge: isFilteredURL stops users from seeing firebug but chromebug has to disable the filter

        if (location)
        {
            if (location.indexOf("chrome://chromebug/") >= 0 || location.indexOf("chrome://fb4cb/") >= 0)
                return true;
        }
        return false;
    },

    getLocationSafe: function(global)
    {
        try
        {
            if (global && global.location)  // then we have a window, it will be an nsIDOMWindow, right?
                return global.location.toString();
            else if (global && global.tag)
                return "global_tag_"+global.tag;
        }
        catch (exc)
        {
            // FF3 gives (NS_ERROR_INVALID_POINTER) [nsIDOMLocation.toString]
        }
        return null;
    },

    askDebuggersForSupport: function(global, frame)
    {
        if (FBTrace.DBG_FBS_FINDDEBUGGER)
            FBTrace.sysout("askDebuggersForSupport using global "+global+" for "+frame.script.fileName);
        if (global && fbs.isChromebug(fbs.getLocationSafe(global)))
            return false;

        if (FBTrace.DBG_FBS_FINDDEBUGGER)
            FBTrace.sysout("askDebuggersForSupport "+debuggers.length+ " debuggers to check for "+frame.script.fileName, debuggers);

        for ( var i = debuggers.length - 1; i >= 0; i--)
        {
            try
            {
                var debuggr = debuggers[i];
                if (debuggr.supportsGlobal(global, frame))
                {
                    if (!debuggr.breakContext)
                        FBTrace.sysout("Debugger with no breakContext:",debuggr.supportsGlobal);
                    if (FBTrace.DBG_FBS_FINDDEBUGGER)
                        FBTrace.sysout(" findDebugger found debuggr ("+debuggr.debuggerName+") at "+i+" with breakContext "+debuggr.breakContext.getName()+" for global "+fbs.getLocationSafe(global)+" while processing "+frame.script.fileName);
                    return debuggr;
                }
            }
            catch (exc)
            {
                FBTrace.sysout("firebug-service askDebuggersForSupport FAILS: "+exc,exc);
            }
        }
        return null;
    },

    dumpIValue: function(value)
    {
        var listValue = {value: null}, lengthValue = {value: 0};
        value.getProperties(listValue, lengthValue);
        for (var i = 0; i < lengthValue.value; ++i)
        {
            var prop = listValue.value[i];
            try {
                var name = unwrapIValue(prop.name);
                FBTrace.sysout(i+"]"+name+"="+unwrapIValue(prop.value));
            }
            catch (e)
            {
                FBTrace.sysout(i+"]"+e);
            }
        }
    },

    reFindDebugger: function(frame, debuggr)
    {
        var frameScopeRoot = this.getOutermostScope(frame);
        if (frameScopeRoot && debuggr.supportsGlobal(frameScopeRoot, frame)) return debuggr;

        if (FBTrace.DBG_FBS_FINDDEBUGGER)
            FBTrace.sysout("reFindDebugger debuggr "+debuggr.debuggerName+" does not support frameScopeRoot "+frameScopeRoot, frameScopeRoot);
        return null;
    },

    discardRecursionFrames: function(frame)
    {
        var i = 0;
        var rest = 0;
        var mark = frame;  // a in abcabcabcdef
        var point = frame;
        while (point = point.callingFrame)
        {
            i++;
            if (point.script.tag == mark.script.tag) // then we found a repeating caller abcabcdef
            {
                mark = point;
                rest = i;
            }
        }
        // here point is null and mark is the last repeater, abcdef
        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("fbs.discardRecursionFrames dropped "+rest+" of "+i, mark);
        return mark;
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
                bp.debuggerName = debuggr.debuggerName;
            else
            {
                if (FBTrace.DBG_FBS_BP)
                    FBTrace.sysout("fbs.addBreakpoint with no debuggr:\n");
            }
        }
        else
        {
            bp = this.recordBreakpoint(type, url, lineNo, debuggr, props, sourceFile);
        }
        if (FBTrace.DBG_FBS_BP) FBTrace.sysout("addBreakpoint for "+url, [bp, sourceFile]);
        return bp;
    },

    recordBreakpoint: function(type, url, lineNo, debuggr, props, sourceFile)
    {
        var urlBreakpoints = fbs.getBreakpoints(url);
        if (!urlBreakpoints)
            urlBreakpoints = [];

        if (typeof(lineNo) !== 'number')
            throw new Error("firebug-service line numbers must be numbers "+lineNo+"@"+url);

        var bp = {type: type, href: url, lineNo: lineNo, disabled: 0,
            debuggerName: debuggr.debuggerName,
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
        fbs.setJSDBreakpoint(sourceFile, bp);
        fbs.setBreakpoints(url, urlBreakpoints);
        ++breakpointCount;
        return bp;
    },

    removeBreakpoint: function(type, url, lineNo)
    {
        var urlBreakpoints = fbs.getBreakpoints(url);

        if (FBTrace.DBG_FBS_BP)
            FBTrace.sysout("removeBreakpoint for "+url+", need to check bps="+(urlBreakpoints?urlBreakpoints.length:"none"));

        if (!urlBreakpoints)
            return false;

        for (var i = 0; i < urlBreakpoints.length; ++i)
        {
            var bp = urlBreakpoints[i];
            if (FBTrace.DBG_FBS_BP) FBTrace.sysout("removeBreakpoint checking bp.lineNo vs lineNo="+bp.lineNo+" vs "+lineNo);

            if (bp.lineNo === lineNo)
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
                                    if (FBTrace.DBG_FBS_BP) FBTrace.sysout("removeBreakpoint in tag="+script.tag+" at "+lineNo+"@"+url);
                                }
                                catch (exc)
                                {
                                    FBTrace.sysout("Firebug service failed to remove breakpoint in "+script.tag+" at lineNo="+lineNo+" pcmap:"+bp.pcmap);
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

                    fbs.setBreakpoints(url, urlBreakpoints);
                }
                return bp;
            }
        }
        if (FBTrace.DBG_FBS_BP)
            FBTrace.sysout("fbs.removeBreakpoint no find for "+lineNo+"@"+url+" in "+urlBreakpoints.length, urlBreakpoints);
        return false;
    },

    findBreakpoint: function(url, lineNo)
    {
        var urlBreakpoints = fbs.getBreakpoints(url);
        if (urlBreakpoints)
        {
            for (var i = 0; i < urlBreakpoints.length; ++i)
            {
                var bp = urlBreakpoints[i];
                if (bp.lineNo === lineNo)
                    return bp;
            }
        }
        if (FBTrace.DBG_FBS_BP)
            FBTrace.sysout("findBreakpoint no find for "+lineNo+"@"+url, urlBreakpoints);
        return null;
    },

    // When we are called, scripts have been compiled so all relevant breakpoints are not "future"
    findBreakpointByScript: function(script, pc)
    {
        var urlsWithBreakpoints = fbs.getBreakpointURLs();
        for (var iURL = 0; iURL < urlsWithBreakpoints.length; iURL++)
        {
            var url = urlsWithBreakpoints[iURL];
            var urlBreakpoints = fbs.getBreakpoints(url);
            if (urlBreakpoints)
            {
                for (var iBreakpoint = 0; iBreakpoint < urlBreakpoints.length; ++iBreakpoint)
                {
                    var bp = urlBreakpoints[iBreakpoint];
                    if (bp.scriptsWithBreakpoint)
                    {
                        for (var iScript = 0; iScript < bp.scriptsWithBreakpoint.length; iScript++)
                        {
                            if (FBTrace.DBG_FBS_BP)
                            {
                                var vs = (bp.scriptsWithBreakpoint[iScript] ? bp.scriptsWithBreakpoint[iScript].tag+"@"+bp.pc[iScript]:"future")+" on "+url;
                                FBTrace.sysout("findBreakpointByScript["+iURL+","+iBreakpoint+","+iScript+"]"+" looking for "+script.tag+"@"+pc+" vs "+vs);
                            }
                            if ( bp.scriptsWithBreakpoint[iScript] && (bp.scriptsWithBreakpoint[iScript].tag == script.tag) && (bp.pc[iScript] == pc) )
                                return bp;
                        }
                    }
                }
            }
        }

        return null;
    },

    resetBreakpoints: function(sourceFile, debuggr) // the sourcefile has just been created after compile
    {
        // If the new script is replacing an old script with a breakpoint still
        var url = sourceFile.href;
        var urlBreakpoints = fbs.getBreakpoints(url);
        if (FBTrace.DBG_FBS_BP)
        {
            try
            {
                var msg = "resetBreakpoints: breakpoints["+sourceFile.href;
                msg += "]="+(urlBreakpoints?urlBreakpoints.length:"NONE")+"\n";
                FBTrace.sysout(msg);
            }
            catch (exc)
            {
                FBTrace.sysout("Failed to give resetBreakpoints trace in url: "+url+" because "+exc+" for urlBreakpoints=", urlBreakpoints);
            }
        }

        if (urlBreakpoints)
        {
            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("resetBreakpoints total bp="+urlBreakpoints.length+" for url="+url);

            fbs.deleteBreakpoints(url);

            for (var i = 0; i < urlBreakpoints.length; ++i)
            {
                var bp = urlBreakpoints[i];
                fbs.recordBreakpoint(bp.type, url, bp.lineNo, debuggr, bp, sourceFile);
                if (bp.disabled & BP_NORMAL)
                {
                     if (FBTrace.DBG_FBS_BP)
                        FBTrace.sysout("resetBreakpoints:  mark breakpoint disabled: "+bp.lineNo+"@"+sourceFile);
                     fbs.disableBreakpoint(url, bp.lineNo);
                }
                else
                {
                    if (FBTrace.DBG_FBS_BP)
                        FBTrace.sysout("resetBreakpoints: "+bp.lineNo+"@"+sourceFile);
                }
            }
        }
        else
        {
            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("resetBreakpoints no breakpoints for "+url);
        }
    },

    setJSDBreakpoint: function(sourceFile, bp)
    {
        var scripts = sourceFile.getScriptsAtLineNumber(bp.lineNo);
        if (!scripts)
        {
             if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("setJSDBreakpoint:  NO inner scripts: "+bp.lineNo+"@"+sourceFile);
             if (!sourceFile.outerScript || !sourceFile.outerScript.isValid)
             {
                if (FBTrace.DBG_FBS_BP)
                    FBTrace.sysout("setJSDBreakpoint:  NO valid outerScript\n");
                return;
             }
             scripts = [sourceFile.outerScript];
        }

        if (!bp.scriptsWithBreakpoint)
        {
            bp.scriptsWithBreakpoint = [];
            bp.pc = [];
        }

        for (var i = 0; i < scripts.length; i++)
        {
            var script = scripts[i];
            if (!script.isValid)
            {
                if (FBTrace.DBG_FBS_BP)
                    FBTrace.sysout("setJSDBreakpoint:  tag "+script.tag+", "+i+"/"+scripts.length+" is invalid\n");
                continue;
            }

            var haveScript = false;
            for (var j = 0; j < bp.scriptsWithBreakpoint.length; j++)
            {
                if (bp.scriptsWithBreakpoint[j].tag === script.tag)
                   {
                    haveScript = true;
                    break;
                   }
            }
            if (haveScript)
                continue;

            var pcmap = sourceFile.pcmap_type;
            if (!pcmap)
            {
                if (FBTrace.DBG_FBS_ERRORS)
                    FBTrace.sysout("fbs.setJSDBreakpoint pcmap undefined "+sourceFile, sourceFile);
                pcmap = PCMAP_SOURCETEXT;
            }
            // we subtraced this offset when we showed the user so lineNo is a user line number; now we need to talk
            // to jsd its line world
            var jsdLine = bp.lineNo + sourceFile.getBaseLineOffset();
            // test script.isLineExecutable(jsdLineNo, pcmap) ??

            var isExecutable = false;
            try {
                 isExecutable = script.isLineExecutable(jsdLine, pcmap);
            } catch(e) {
                // guess not then...
            }

            if (isExecutable)
            {
                var pc = script.lineToPc(jsdLine, pcmap);
                var pcToLine = script.pcToLine(pc, pcmap);  // avoid calling this unless we have to...

                if (pcToLine == jsdLine)
                {
                    script.setBreakpoint(pc);

                    bp.scriptsWithBreakpoint.push(script);
                    bp.pc.push(pc);
                    bp.pcmap = pcmap;
                    bp.jsdLine = jsdLine;

                    if (pc == 0)  // signal the breakpoint handler to break for user
                        sourceFile.breakOnZero = script.tag;

                    if (FBTrace.DBG_FBS_BP)
                        FBTrace.sysout("setJSDBreakpoint tag: "+script.tag+" line.pc@url="+bp.lineNo +"."+pc+"@"+sourceFile.href+" using offset:"+sourceFile.getBaseLineOffset()+" jsdLine: "+jsdLine+" pcToLine: "+pcToLine+(isExecutable?" isExecuable":" notExecutable"), {sourceFile: sourceFile, script: script});
                }
                else
                {
                    if (FBTrace.DBG_FBS_BP) FBTrace.sysout("setJSDBreakpoint LINE MISMATCH for tag: "+script.tag+" line.pc@url="+bp.lineNo +"."+pc+"@"+sourceFile.href+" using offset:"+sourceFile.getBaseLineOffset()+" jsdLine: "+jsdLine+" pcToLine: "+pcToLine+(isExecutable?" isExecuable":" notExecutable"), sourceFile);
                }
            }
            else
            {
                if (FBTrace.DBG_FBS_BP) FBTrace.sysout("setJSDBreakpoint NOT isExecutable tag: "+script.tag+" jsdLine@url="+jsdLine +"@"+sourceFile.href+" pcmap:"+pcmap+" baselineOffset:"+sourceFile.getBaseLineOffset(), script);
            }
         }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    saveBreakpoints: function(url)
    {
        // Do not call fbs.setBreakpoints() it calls us.
        try
        {
            var urlBreakpoints = fbs.getBreakpoints(url);

            if (!urlBreakpoints || !urlBreakpoints.length)
            {
                fbs.breakpointStore.removeItem(url);
                fbs.deleteBreakpoints(url);
                return;
            }

            var cleanBPs = [];
            for(var i = 0; i < urlBreakpoints.length; i++)
            {
                var bp = urlBreakpoints[i];
                var cleanBP = {};
                for (var p in bp)
                    cleanBP[p] = bp[p];
                delete cleanBP.scriptsWithBreakpoint; // not JSON-able
                delete cleanBP.pc; // co-indexed with scriptsWithBreakpoint
                delete cleanBP.debuggerName;
                cleanBPs.push(cleanBP);
            }
            fbs.breakpointStore.setItem(url, cleanBPs);
        }
        catch (exc)
        {
            FBTrace.sysout("firebug-service.saveBreakpoints FAILS "+exc, exc);
        }
    },

    setBreakpoints: function(url, urlBreakpoints)
    {
        fbs.breakpoints[url] = urlBreakpoints;
        fbs.saveBreakpoints(url);
    },

    getBreakpoints: function(url)
    {
        return fbs.breakpoints[url];
    },

    deleteBreakpoints: function(url)
    {
        delete fbs.breakpoints[url];
    },

    getBreakpointURLs: function()
    {
         var urls = this.getBreakpointStore().getKeys();
         return urls;
    },

    getBreakpointStore: function()
    {
        if (this.breakpointStore)
            return this.breakpointStore;

        try
        {
            Components.utils.import("resource://firebug/storageService.js");

            if (typeof(StorageService) != "undefined")
            {
                this.breakpointStore = StorageService.getStorage("breakpoints.json");
            }
            else
            {
                ERROR("firebug-service breakpoint StorageService FAILS");
                this.breakpointStore =
                {
                        setItem: function(){},
                        removeItem: function(){},
                        getKeys: function(){return [];},
                };
            }
            return this.breakpointStore;
        }
        catch(exc)
        {
            ERROR("firebug-service restoreBreakpoints FAILS "+exc);
        }

    },

    restoreBreakpoints: function()
    {
        this.breakpoints = {};
        var breakpointStore = fbs.getBreakpointStore();
        var urls =  fbs.getBreakpointURLs();
        for (var i = 0; i < urls.length; i++)
        {
            var url = urls[i];
            var bps = breakpointStore.getItem(url);
            this.breakpoints[url] = bps;
            for (var j = 0; j < bps.length; j++)
            {
                var bp = bps[j];
                if (bp.condition)
                    ++conditionCount;
                if (bp.disabled)
                    ++disabledCount;
                if (bp.type & BP_MONITOR)
                    ++monitorCount;
                if (bp.type & BP_ERROR)
                    errorBreakpoints.push({href: url, lineNo: bp.lineNo, type: BP_ERROR });
            }
        }
        if (FBTrace.DBG_FBS_BP)
        {
            FBTrace.sysout("restoreBreakpoints "+urls.length+", disabledCount:"+disabledCount
                    +" monitorCount:"+monitorCount+" conditionCount:"+conditionCount+", restored ", this.breakpoints);
            for (var p in this.breakpoints)
                FBTrace.sysout("restoreBreakpoints restored "+p+" condition "+this.breakpoints[p].condition);
        }
    },
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    breakIntoDebugger: function(debuggr, frame, type)
    {
        if (FBTrace.DBG_FBS_STEP || FBTrace.DBG_FBS_BP) FBTrace.sysout("fbs.breakIntoDebugger called "+debuggr.debuggerName+" fbs.isChromeBlocked:"+fbs.isChromeBlocked);

        // Before we break, clear information about previous stepping session
        this.stopStepping(frame);

        // Break into the debugger - execution will stop here until the user resumes
        var returned;
        try
        {
            var debuggr = this.reFindDebugger(frame, debuggr);
            returned = debuggr.onBreak(frame, type);
        }
        catch (exc)
        {
            ERROR(exc);
            returned = RETURN_CONTINUE;
        }

        // Execution resumes now. Check if the user requested stepping and if so
        // install the necessary hooks
        this.startStepping(frame);
        if (FBTrace.DBG_FBS_STEP || FBTrace.DBG_FBS_BP) FBTrace.sysout("fbs.breakIntoDebugger called "+debuggr.debuggerName+" returning "+returned);
        return returned;
    },

    needToBreakForError: function(reportNextError)
    {
        return this.breakOnErrors || this.findErrorBreakpoint(this.normalizeURL(reportNextError.fileName), reportNextError.lineNo) != -1;
    },

    startStepping: function(frame)
    {
        if (!stepMode && !runningUntil)
            return;

        if (FBTrace.DBG_FBS_STEP)
        {
            FBTrace.sysout("startStepping stepMode = "+getStepName(stepMode) +" hookFrameCount="+hookFrameCount+" stepRecursion="+stepRecursion);
        }

        this.hookFunctions();

        if (stepMode == STEP_OVER || stepMode == STEP_INTO)
            this.hookInterrupts(frame);  // FF4JM setBreakOnAllPC
    },

    stopStepping: function(frame)
    {
        if (FBTrace.DBG_FBS_STEP)
        {
            FBTrace.sysout("stopStepping stepMode = "+getStepName(stepMode)
                 +" hookFrameCount="+hookFrameCount+" stepRecursion="+stepRecursion);
        }
        stepMode = 0;
        stepRecursion = 0;
        stepFrameTag = 0;
        stepFrameLineId = null;

        if (runningUntil)
        {
            this.removeBreakpoint(BP_UNTIL, runningUntil.href, runningUntil.lineNo);
            runningUntil = null;
        }

        this.unhookInterrupts(frame);  // FF4JM clearBreakOnAllPC
        this.unhookFunctions();
    },

    /*
     * Returns a string describing the step mode or null for not stepping.
     */
    getStepMode: function()
    {
        return getStepName(stepMode);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Hook Interupts

    hookInterrupts: function(frame)
    {
        if (FBTrace.DBG_FBS_STEP)
            FBTrace.sysout("set InterruptHook with stepFrameLineId: " + stepFrameLineId + " " +
                (frame ? frame.script.enableSingleStepInterrupts : "<noframe>"));

        jsd.interruptHook = { onExecute: hook(this.onInterrupt, RETURN_CONTINUE)};

        if (frame)  // then we may be were called in FF3.6 for break on next script panel
            ScriptInterrupter.enable(frame.script);
    },

    unhookInterrupts: function(frame)
    {
        jsd.interruptHook = null;

        ScriptInterrupter.disableAll();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Hook Functions

    hookFunctions: function()
    {
        if (FBTrace.DBG_FBS_STEP) FBTrace.sysout("set functionHook");
        jsd.functionHook = { onCall: hook(this.onFunction, true) };
    },

    unhookFunctions: function()
    {
        jsd.functionHook = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Hook Scripts

    hookScripts: function()
    {
        if (FBTrace.DBG_FBS_STEP || FBTrace.DBG_FBS_TRACKFILES) FBTrace.sysout("set scriptHook\n");
        jsd.scriptHook = {
            onScriptCreated: hook(this.onScriptCreated),
            onScriptDestroyed: hook(this.onScriptDestroyed)
        };
        if (fbs.filterSystemURLs)
            fbs.setChromeBlockingFilters();

        jsd.debuggerHook = { onExecute: hook(this.onDebugger, RETURN_CONTINUE) };
        jsd.debugHook = { onExecute: hook(this.onDebug, RETURN_CONTINUE) };
        jsd.breakpointHook = { onExecute: hook(this.onBreakpoint, RETURN_CONTINUE) };
        jsd.throwHook = { onExecute: hook(this.onThrow, RETURN_CONTINUE_THROW) };
        jsd.errorHook = { onError: hook(this.onError, true) };
        jsd.topLevelHook = { onCall: hook(this.onTopLevel, true)};
    },

    unhookScripts: function()
    {
        jsd.scriptHook = null;
        fbs.removeChromeBlockingFilters();

        if (FBTrace.DBG_FBS_STEP || FBTrace.DBG_FBS_TRACKFILES) FBTrace.sysout("unset scriptHook\n");
    },

    hookCalls: function(callBack, unhookAtBottom)
    {
        var contextCached = null;

        function callHook(frame, type)
        {
            switch (type)
            {
                case TYPE_FUNCTION_CALL:
                {
                    ++hookFrameCount;

                    if (FBTrace.DBG_FBS_STEP)
                        FBTrace.sysout("callHook TYPE_FUNCTION_CALL "+frame.script.fileName+"\n");

                    contextCached = callBack(contextCached, frame, hookFrameCount, true);

                    break;
                }
                case TYPE_FUNCTION_RETURN:
                {
                    if(hookFrameCount <= 0)  // ignore returns until we have started back in
                        return;

                    --hookFrameCount;
                    if (FBTrace.DBG_FBS_STEP)
                        FBTrace.sysout("functionHook TYPE_FUNCTION_RETURN "+frame.script.fileName+"\n");

                    if (unhookAtBottom && hookFrameCount == 0) {  // stack empty
                       this.unhookFunctions();
                    }

                    contextCached = callBack(contextCached, frame, hookFrameCount, false);

                    break;
                }
            }
        }

        if (jsd.functionHook)
        {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("fbs.hookCalls cannot set functionHook, one is already set");
            return;
        }

        if (FBTrace.DBG_FBS_STEP)
            FBTrace.sysout("set callHook\n");

        hookFrameCount = 0;
        jsd.functionHook = { onCall: callHook };
    },

    getJSD: function()
    {
        return jsd; // for debugging fbs
    },

    dumpFileTrack: function(moreFiles)
    {
        if (moreFiles)
            trackFiles.merge(moreFiles);
        trackFiles.dump();
    },
};

// ************************************************************************************************
// Script Interrupt Manager

var ScriptInterrupter =
{
    entries: {},

    enable: function(script)
    {
        if (!script.enableSingleStepInterrupts)
            return;

        if (this.entries[script.tag])
            return;

        try
        {
            script.enableSingleStepInterrupts(true);
        }
        catch (e)
        {
            FBTrace.sysout("fbs.ScriptInterrupter.enable; EXCEPTION");
        }

        this.entries[script.tag] = {
            script: script
        }
    },

    disable: function(script)
    {
        if (!script.enableSingleStepInterrupts)
            return;

        var entry = this.entries[script.tag];
        if (!entry)
            return;

        try
        {
            script.enableSingleStepInterrupts(false);
        }
        catch (e)
        {
            FBTrace.sysout("fbs.ScriptInterrupter.disable; EXCEPTION");
        }

        delete this.entries[script.tag];
    },

    disableAll: function()
    {
        for (var tag in this.entries)
        {
            var entry = this.entries[tag];
            if (!entry.script.enableSingleStepInterrupts)
                return;

            try
            {
                entry.script.enableSingleStepInterrupts(false);
            }
            catch (e)
            {
                FBTrace.sysout("fbs.ScriptInterrupter.disable; EXCEPTION");
            }
       }

       this.entries = {};
    }
}

// ************************************************************************************************
// Local Helpers

function getStepName(mode)
{
    if (mode==STEP_OVER) return "STEP_OVER";
    if (mode==STEP_INTO) return "STEP_INTO";
    if (mode==STEP_OUT) return "STEP_OUT";
    if (mode==STEP_SUSPEND) return "STEP_SUSPEND";
    else return "(not a step mode)";
}

// called by enumerateScripts, onThrow, onDebug, onScriptCreated/Destroyed.
function isFilteredURL(rawJSD_script_filename)
{
    if (!rawJSD_script_filename)
        return true;
    if (fbs.filterConsoleInjections)
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
            urlFilters.push(match[1]);  // cache this for future calls
            return match[1];
        }
    }
    return false;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function dispatch(listeners, name, args)
{
    var totalListeners = listeners.length;
    for (var i = 0; i < totalListeners; ++i)
    {
        var listener = listeners[i];
        if ( listener.hasOwnProperty(name) )
            listener[name].apply(listener, args);
    }
    //if (FBTrace.DBG_FBS_ERRORS)
    //    FBTrace.sysout("fbs.dispatch "+name+" to "+listeners.length+" listeners");
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
            var msg =  "Error in hook: "+ exc +" fn=\n"+fn+"\n stack=\n";
            for (var frame = Components.stack; frame; frame = frame.caller)
                msg += frame.filename + "@" + frame.line + ";\n";
               ERROR(msg);
            return rv;
        }
    }
}
var lastWindowScope = null;
function wrapIfNative(obj)
{
    try
    {
        if (obj instanceof Ci.nsISupports)
            return XPCNativeWrapper(obj);
        else
            return obj;
    }
    catch(exc)
    {
        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("fbs.wrapIfNative FAILED: "+exc, obj);
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
    try
    {
        for (; frame; frame = frame.callingFrame)
            ++frameCount;
    }
    catch(exc)
    {

    }

    return frameCount;
}

function framesToString(frame)
{
    var str = "";
    while (frame)
    {
        str += frameToString(frame)+"\n";
        frame = frame.callingFrame;
    }
    return str;
}

function frameToString(frame)
{
    return frame.script.tag+" in "+frame.script.fileName+"@"+frame.line+"(pc="+frame.pc+")";
}

function testBreakpoint(frame, bp)
{
    if (FBTrace.DBG_FBS_BP) FBTrace.sysout("fbs.testBreakpoint "+bp.condition, bp);
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
                var value = unwrapIValue(result.value);
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
    syncFilter: function()
    {
        var filter = fbs.scriptsFilter;
        fbs.showEvents = (filter == "all" || filter == "events");
        fbs.showEvals = (filter == "all" || filter == "evals");
        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("fbs.showEvents "+fbs.showEvents+" fbs.showEvals "+fbs.showEvals);
    }
};

var QuitApplicationGrantedObserver =
{
    observe: function(subject, topic, data)
    {
        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("xxxxxxxxxxxx FirebugService QuitApplicationGrantedObserver "+topic+"  start xyyxxxxxxxxxxxxxx\n");
    }
};
var QuitApplicationRequestedObserver =
{
    observe: function(subject, topic, data)
    {
        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("FirebugService QuitApplicationRequestedObserver "+topic);
    }
};
var QuitApplicationObserver =
{
    observe: function(subject, topic, data)
    {
        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("FirebugService QuitApplicationObserver "+topic);
        fbs.disableDebugger();
        fbs.shutdown();
        fbs = null;
        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("xxxxxxxxxxxx FirebugService QuitApplicationObserver "+topic+" end xxxxxxxxxxxxxxxxx\n");
    }
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
function unwrapIValue(object)
{
    var unwrapped = object.getWrappedValue();
    try
    {
        if (unwrapped)
            return XPCSafeJSObjectWrapper(unwrapped);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("fbs.unwrapIValue FAILS for "+object,{exc: exc, object: object, unwrapped: unwrapped});
    }
}

//* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

var consoleService = null;

function ERROR(text)
{
    FBTrace.sysout(text);

    if (!consoleService)
        consoleService = ConsoleService.getService(nsIConsoleService);

    consoleService.logStringMessage(text + "");
}

function getExecutionStopNameFromType(type)
{
    switch (type)
    {
        case jsdIExecutionHook.TYPE_INTERRUPTED: return "interrupted";
        case jsdIExecutionHook.TYPE_BREAKPOINT: return "breakpoint";
        case jsdIExecutionHook.TYPE_DEBUG_REQUESTED: return "debug requested";
        case jsdIExecutionHook.TYPE_DEBUGGER_KEYWORD: return "debugger_keyword";
        case jsdIExecutionHook.TYPE_THROW: return "interrupted";
        default: return "unknown("+type+")";
    }
}

function getCallFromType(type)
{
    var typeName = type;
    switch(type)
    {
        case TYPE_FUNCTION_RETURN: { typeName = "TYPE_FUNCTION_RETURN"; break; }
        case TYPE_FUNCTION_CALL:   { typeName = "TYPE_FUNCTION_CALL"; break; }
        case TYPE_TOPLEVEL_START: { typeName = "TYPE_TOPLEVEL_START"; break; }
        case TYPE_TOPLEVEL_END:   { typeName = "TYPE_TOPLEVEL_START"; break; }
    }
    return typeName;
}

// For special chromebug tracing
function getTmpFile()
{
    var file = Components.classes["@mozilla.org/file/directory_service;1"].
        getService(Components.interfaces.nsIProperties).
        get("TmpD", Components.interfaces.nsIFile);
    file.append("fbs.tmp");
    file.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0666);
    FBTrace.sysout("FBS opened tmp file "+file.path);
    return file;
}

function getTmpStream(file)
{
    // file is nsIFile, data is a string
    var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"].
                             createInstance(Components.interfaces.nsIFileOutputStream);

    // use 0x02 | 0x10 to open file for appending.
    foStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0);
    // write, create, truncate
    // In a c file operation, we have no need to set file mode with or operation,
    // directly using "r" or "w" usually.

    return foStream;
}

var trackFiles  = {
    allFiles: {},
    add: function(fileName)
    {
        var name = new String(fileName);
        this.allFiles[name] = [];
    },
    drop: function(fileName)
    {
        var name = new String(fileName);
        this.allFiles[name].push("dropped");
    },
    def: function(frame)
    {
        var frameGlobal = fbs.getOutermostScope(frame);
        var scope = frame.scope;
        if (scope)
        {
            while(scope.jsParent)
                scope = scope.jsParent;
        }
        var scopeName = fbs.getLocationSafe(frameGlobal);

        if (!scopeName)
            scopeName = frameGlobal + "";

        scopeName = scope.jsClassName + ": "+scopeName;

        var name = new String(frame.script.fileName);
        if (! (name in this.allFiles))
            this.allFiles[name]=["not added"];
        this.allFiles[name].push(scopeName);
    },
    merge: function(moreFiles)
    {
        for (var p in moreFiles)
        {
            if (p in this.allFiles)
                this.allFiles[p] = this.allFiles[p].concat(moreFiles[p]);
            else
                this.allFiles[p] = moreFiles[p];
        }
    },
    dump: function()
    {
        var n = 0;
        for (var p in this.allFiles)
        {
            tmpout( (++n) + ") "+p);
            var where = this.allFiles[p];
            if (where.length > 0)
            {
                for (var i = 0; i < where.length; i++)
                {
                    tmpout(", "+where[i]);
                }
                tmpout("\n");
            }
            else
                tmpout("     none\n");

        }
    },
}

function tmpout(text)
{
    if (!fbs.foStream)
        fbs.foStream = getTmpStream(getTmpFile());

    fbs.foStream.write(text, text.length);

}

fbs.initialize();

//consoleService.logStringMessage("fbs module exported "+fbs);