/* See license.txt for terms of usage */

// Debug lines are marked with /*@explore*/ at column 120                                                             /*@explore*/
// ************************************************************************************************
// Utils

function CC(className)
{
    return Components.classes[className];
}

function CI(ifaceName)
{
    return Components.interfaces[ifaceName];
}

// ************************************************************************************************
// Constants

const CLASS_ID = Components.ID("{a380e9c0-cb39-11da-a94d-0800200c9a66}");
const CLASS_NAME = "Firebug Service";
const CONTRACT_ID = "@joehewitt.com/firebug;1";

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const PrefService = CC("@mozilla.org/preferences-service;1");
const DebuggerService = CC("@mozilla.org/js/jsd/debugger-service;1");
const ConsoleService = CC("@mozilla.org/consoleservice;1");
const Timer = CC("@mozilla.org/timer;1");

const jsdIDebuggerService = CI("jsdIDebuggerService");
const jsdIScript = CI("jsdIScript");
const jsdIStackFrame = CI("jsdIStackFrame");
const jsdICallHook = CI("jsdICallHook");
const jsdIExecutionHook = CI("jsdIExecutionHook");
const jsdIErrorHook = CI("jsdIErrorHook");
const nsIFireBug = CI("nsIFireBug");
const nsISupports = CI("nsISupports");
const nsIFireBugNetworkDebugger = CI("nsIFireBugNetworkDebugger");
const nsIFireBugScriptListener = CI("nsIFireBugScriptListener");
const nsIFireBugURLProvider = CI("nsIFireBugURLProvider");
const nsIPrefBranch2 = CI("nsIPrefBranch2");
const nsIComponentRegistrar = CI("nsIComponentRegistrar");
const nsIFactory = CI("nsIFactory");
const nsIConsoleService = CI("nsIConsoleService");
const nsITimer = CI("nsITimer");

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

const STEP_OVER = nsIFireBug.STEP_OVER;
const STEP_INTO = nsIFireBug.STEP_INTO;
const STEP_OUT = nsIFireBug.STEP_OUT;
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
    new RegExp("^(file:/.*/Contents/MacOS/extensions/.*/components/).*\\.js$")
    ];

const COMPONENTS_RE =  new RegExp("/components/[^/]*\\.js$");

// ************************************************************************************************
// Globals

var jsd, fbs, prefs;

var contextCount = 0;

var urlFilters = [
    'chrome://',
    'XStringBundle'
    ];


var clients = [];
var debuggers = [];
var netDebuggers = [];
var scriptListeners = [];

var stepMode = 0;
var stepFrame;
var stepFrameLineId;
var stepFrameCount;
var hookFrameCount;

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

    this.enabled = false;
    this.profiling = false;

    prefs = PrefService.getService(nsIPrefBranch2);
    prefs.addObserver("extensions.firebug", FirebugPrefsObserver, false);

    var observerService = CC("@mozilla.org/observer-service;1")
        .getService(CI("nsIObserverService"));
    observerService.addObserver(ShutdownObserver, "quit-application", false);
    observerService.addObserver(ShutdownRequestedObserver, "quit-application-requested", false);

    this.showStackTrace = prefs.getBoolPref("extensions.firebug.showStackTrace");
    this.breakOnErrors = prefs.getBoolPref("extensions.firebug.breakOnErrors");
    this.showEvalSources = prefs.getBoolPref("extensions.firebug.showEvalSources");
    this.filterSystemURLs = prefs.getBoolPref("extensions.firebug.filterSystemURLs");  // may not be exposed to users
    this.DBG_FLUSH_EVERY_LINE = prefs.getBoolPref("extensions.firebug.DBG_FLUSH_EVERY_LINE");

    try {                                                                                                              /*@explore*/
          // CREATION and BP generate a huge trace                                                                     /*@explore*/
        this.DBG_CREATION = this.DBG_FBS_FF_START ? prefs.getBoolPref("extensions.firebug.DBG_FBS_CREATION") : false;  /*@explore*/
        this.DBG_BP = this.DBG_FBS_FF_START ? prefs.getBoolPref("extensions.firebug.DBG_FBS_BP") : false;              /*@explore*/
        this.DBG_ERRORS = prefs.getBoolPref("extensions.firebug.DBG_FBS_ERRORS");                                      /*@explore*/
        this.DBG_STEP = prefs.getBoolPref("extensions.firebug.DBG_FBS_STEP");
        this.DBG_FUNCTION = prefs.getBoolPref("extensions.firebug.DBG_FBS_FUNCTION");                                          /*@explore*/
        ddd("FirebugService fbs.DBG_CREATION: "+fbs.DBG_CREATION+" fbs.DBG_BP:"+fbs.DBG_BP+                            /*@explore*/
            " fbs.DBG_ERRORS:"+fbs.DBG_ERRORS+" fbs.DBG_STEP:"+fbs.DBG_STEP+" fbs.DBG_FUNCTION:"+fbs.DBG_FUNCTION+"\n");                                     /*@explore*/
    }                                                                                                                  /*@explore*/
    catch (exc)                                                                                                        /*@explore*/
    {                                                                                                                  /*@explore*/
        dumpProperties("firebug-service: constructor getBoolPrefs FAILED with exception=",exc);                        /*@explore*/
    }                                                                                                                  /*@explore*/
    this.topLevelScriptTag = {};  // top- or eval-level
    this.eventLevelScriptTag = {};// event scripts like onclick
    this.nestedScriptStack = {};  // scripts contained in leveledScript that have not been drained
    this.sourceURLByTag = {};     // all script tags created by eval
    this.scriptInfoArrayByURL = {};
    this.scriptInfoByTag = {};
}

FirebugService.prototype =
{
    shutdown: function()
    {
        prefs.removeObserver("extensions.firebug", FirebugPrefsObserver);
        timer = null;
        fbs = null;
        jsd = null;
        if (FBTrace.DBG_CREATION) ddd("FirebugService.shutdown\n");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsISupports

    QueryInterface: function(iid)
    {
        if (!iid.equals(nsIFireBug) && !iid.equals(nsISupports))
            throw NS_ERROR_NO_INTERFACE;

        return this;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsIFireBug

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

    registerClient: function(client)
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

    registerDebugger: function(debuggr)
    {
        this.enableDebugger();

        debuggers.push(debuggr);
        try {
            netDebuggers.push(debuggr.QueryInterface(nsIFireBugNetworkDebugger));
        } catch(exc) {
        }
        try {
            scriptListeners.push(debuggr.QueryInterface(nsIFireBugScriptListener));
        } catch(exc) {
        }
    },

    unregisterDebugger: function(debuggr)
    {
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

        if (!debuggers.length)
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
        var result = jsd.enterNestedEventLoop({
            onNest: function()
            {
                dispatch(netDebuggers, "resumeActivity");
                callback.onNest();
            }
        });
        dispatch(netDebuggers, "resumeActivity");
        return result;
    },

    exitNestedEventLoop: function()
    {
        dispatch(netDebuggers, "suspendActivity");
        return jsd.exitNestedEventLoop();
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
        if (fbs.DBG_STEP) ddd("step stepMode = "+getPropertyName(nsIFireBug, stepMode)                                 /*@explore*/
                 +" stepFrameLineId="+stepFrameLineId+" stepFrameCount="+stepFrameCount+"\n");                         /*@explore*/
    },

    suspend: function()
    {
        stepMode = STEP_SUSPEND;
        stepFrameLineId = null;
        this.hookInterrupts();
    },

    runUntil: function(url, lineNo, startFrame)
    {
        runningUntil = this.addBreakpoint(BP_UNTIL, url, lineNo);
        stepFrameCount = countFrames(startFrame);
        stepFrameLineId = stepFrameCount + startFrame.script.fileName + startFrame.line;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    setBreakpoint: function(url, lineNo, props)
    {
        var bp = this.addBreakpoint(BP_NORMAL, url, lineNo, null, null, props);
        if (bp)
        {
            dispatch(debuggers, "onToggleBreakpoint", [url, lineNo, true, getBreakpointProperties(bp)]);
            return true;
        }
        return false;
    },

    clearBreakpoint: function(url, lineNo)
    {
        if (this.removeBreakpoint(BP_NORMAL, url, lineNo))
            dispatch(debuggers, "onToggleBreakpoint", [url, lineNo, false, null]);
    },

    enableBreakpoint: function(url, lineNo)
    {
        url = denormalizeURL(url);

        var bp = this.findBreakpoint(url, lineNo);
        if (bp && bp.type & BP_NORMAL)
        {
            bp.disabled &= ~BP_NORMAL;
            dispatch(debuggers, "onToggleBreakpoint", [url, lineNo, true, getBreakpointProperties(bp)]);
            --disabledCount;
        }
    },

    disableBreakpoint: function(url, lineNo)
    {
        url = denormalizeURL(url);

        var bp = this.findBreakpoint(url, lineNo);
        if (bp && bp.type & BP_NORMAL)
        {
            bp.disabled |= BP_NORMAL;
            ++disabledCount;
            dispatch(debuggers, "onToggleBreakpoint", [url, lineNo, true, getBreakpointProperties(bp)]);
        }
    },

    isBreakpointDisabled: function(url, lineNo)
    {
        url = denormalizeURL(url);

        var bp = this.findBreakpoint(url, lineNo);
        if (bp && bp.type & BP_NORMAL)
            return bp.disabled & BP_NORMAL;
        else
            return false;
    },

    setBreakpointCondition: function(url, lineNo, condition)
    {
        url = denormalizeURL(url);
        var bp = this.findBreakpoint(url, lineNo);
        if (!bp)
        {
            bp = this.addBreakpoint(BP_NORMAL, url, lineNo);
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

        dispatch(debuggers, "onToggleBreakpoint", [url, lineNo, true, getBreakpointProperties(bp)]);
    },

    getBreakpointCondition: function(url, lineNo)
    {
        url = denormalizeURL(url);
        var bp = this.findBreakpoint(url, lineNo);
        return bp ? bp.condition : "";
    },

    clearAllBreakpoints: function(urlCount, urls)
    {
        for (var i = 0; i < urls.length; ++i)
        {
            var url = denormalizeURL(urls[i]);
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

    hasBreakpoint: function(script)
    {
        var url = script.fileName;
        var lineNo = findExecutableLine(script, script.baseLineNumber);
        // Dead code XXXnew
        //var url = fbs.getSourceURL(script);
        //var lineNo = this.findFirstExecutableLine(script);

        var urlBreakpoints = breakpoints[url];
        if (urlBreakpoints)
        {
            for (var i = 0; i < urlBreakpoints.length; ++i)
            {
                var bp = urlBreakpoints[i];
                if (bp.lineNo == lineNo && bp.type & BP_NORMAL)
                    return true;
            }
        }

        return false;
    },

    enumerateBreakpoints: function(url, cb)
    {
        if (url)
        {
            url = denormalizeURL(url);

            var urlBreakpoints = breakpoints[url];
            if (urlBreakpoints)
            {
                for (var i = 0; i < urlBreakpoints.length; ++i)
                {
                    var bp = urlBreakpoints[i];
                    if (bp.type & BP_NORMAL)
                        cb.call(url, bp.lineNo, bp.startLineNo, getBreakpointProperties(bp));
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

    setErrorBreakpoint: function(url, lineNo)
    {
        var index = this.findErrorBreakpoint(url, lineNo);
        if (index == -1)
        {
            var scriptInfos = this.findScriptInfos(denormalizeURL(url), lineNo);
            if (scriptInfos.length)
            {
                var script = scriptInfos[0].script;  // TODO Loop??
                errorBreakpoints.push({href: normalizeURL(url), lineNo: lineNo,
                    startLineNo: script.baseLineNumber});
                dispatch(debuggers, "onToggleErrorBreakpoint", [url, lineNo, true]);
            }
        }
    },

    clearErrorBreakpoint: function(url, lineNo)
    {
        var index = this.findErrorBreakpoint(url, lineNo);
        if (index != -1)
        {
            errorBreakpoints.splice(index, 1);

            dispatch(debuggers, "onToggleErrorBreakpoint", [url, lineNo, false]);
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
            url = normalizeURL(url);
            for (var i = 0; i < errorBreakpoints.length; ++i)
            {
                var bp = errorBreakpoints[i];
                if (bp.href == url)
                    cb.call(bp.href, bp.lineNo, bp.startLineNo, null);
            }
        }
        else
        {
            for (var i = 0; i < errorBreakpoints.length; ++i)
            {
                var bp = errorBreakpoints[i];
                cb.call(bp.href, bp.lineNo, bp.startLineNo, null);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    monitor: function(script, debuggr)
    {
        var lineNo = this.findFirstExecutableLine(script);
        var scriptInfo = this.scriptInfoByTag[script.tag];
        var url = scriptInfo.url;
        if (lineNo != -1 && this.addBreakpoint(BP_MONITOR, url, lineNo, debuggr, scriptInfo))
        {
            ++monitorCount;
            dispatch(debuggers, "onToggleMonitor", [url, lineNo, true]);
        }
    },

    unmonitor: function(script)
    {
        var lineNo = this.findFirstExecutableLine(script);
        var url = this.getSourceURL(script);
        if (lineNo != -1 && this.removeBreakpoint(BP_MONITOR, url, lineNo, script))
        {
            --monitorCount;
            dispatch(debuggers, "onToggleMonitor", [url, lineNo, false]);
        }
    },

    isMonitored: function(script)
    {
        var lineNo = this.findFirstExecutableLine(script);
        var url = this.getSourceURL(script);
        var bp = lineNo != -1 ? this.findBreakpoint(url, lineNo) : null;
        return bp && bp.type & BP_MONITOR;
    },

    enumerateMonitors: function(url, cb)
    {
        if (url)
        {
            url = denormalizeURL(url);

            var urlBreakpoints = breakpoints[url];
            if (urlBreakpoints)
            {
                for (var i = 0; i < urlBreakpoints.length; ++i)
                {
                    var bp = urlBreakpoints[i];
                    if (bp.type & BP_MONITOR)
                        cb.call(url, bp.lineNo, bp.startLineNo, null);
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
                var fileName = script.fileName;ddd('enumerateScripts');
                if ( !isFilteredURL(fileName) ) {
                    scripts.push(script);
                }
            }
        });
        length.value = scripts.length;
        return scripts;
    },

    enumerateScriptInfos: function(url, cb)
    {
        if (!jsd)
        {
            ddd("enumerateScriptInfos jsd is not set\n");
            return;
        }
        url = denormalizeURL(url);
        var scriptInfos = this.scriptInfoArrayByURL[url];
        if (!scriptInfos || scriptInfos.length <= 0)
        {
            var baselineOffset = 0;
            if (url.match(COMPONENTS_RE))
                baselineOffset = 1;

            jsd.enumerateScripts( {
                enumerateScript: function(script) {
                    var fileName = script.fileName;
                    if (url == fileName)
                    {
                        var scriptInfo = fbs.registerTopLevelScript(script, url, "enumerated");
                        scriptInfo = script.baseLineNumber + baselineOffset;
                    }
                }
            });
            scriptInfos = this.scriptInfoArrayByURL[url];
        }
        if (scriptInfos)
        {
            ddd("enumerateScriptInfos: for url="+url+" scriptInfos.length: "+scriptInfos.length+"\n");

            for (var i = 0; i < scriptInfos.length; i++)
            {
                var scriptInfo = scriptInfos[i];
                var offset = scriptInfo.offsetInEvalBuffer ? scriptInfo.offsetInEvalBuffer : scriptInfo.baseLineNumber;
                cb.call(url, scriptInfo.script, offset, scriptInfo.typename);
            }
        }
        else
        {
            ddd("enumerateScriptInfos: none for url="+url+"\n");
            for (var u in this.scriptInfoArrayByURL)
                ddd("enumerateScriptInfos have info for "+u+"\n");
        }

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

        try {                                                                                                          /*@explore*/
            this.DBG_CREATION = prefs.getBoolPref("extensions.firebug.DBG_FBS_CREATION");                              /*@explore*/
            this.DBG_BP = prefs.getBoolPref("extensions.firebug.DBG_FBS_BP");                                          /*@explore*/
            this.DBG_ERRORS = prefs.getBoolPref("extensions.firebug.DBG_FBS_ERRORS");                                  /*@explore*/
            this.DBG_STEP = prefs.getBoolPref("extensions.firebug.DBG_FBS_STEP");                                      /*@explore*/
            this.DBG_FUNCTION = prefs.getBoolPref("extensions.firebug.DBG_FBS_FUNCTION");                              /*@explore*/
        }                                                                                                              /*@explore*/
        catch(exc)                                                                                                     /*@explore*/
        {                                                                                                              /*@explore*/
            dumpProperties("fbs.enableDebugger: failed to set tracing preferences:"+exc);	                           /*@explore*/
        }                                                                                                              /*@explore*/
        if (this.DBG_CREATION || this.DBG_BP || this.DBG_ERRORS || this.DBG_STEP || this.DBG_FUNCTION)                 /*@explore*/
        {                                                                                                              /*@explore*/
            ddd("\nenableDebugger start fbs debug log "+Date()+"\n");                                                  /*@explore*/
            ddd("fbs.DBG_CREATION: "+fbs.DBG_CREATION+																   /*@explore*/
                " fbs.DBG_BP:"+fbs.DBG_BP+																			   /*@explore*/
                " fbs.DBG_ERRORS:"+fbs.DBG_ERRORS      																   /*@explore*/
                +" fbs.DBG_STEP:"+fbs.DBG_STEP																		   /*@explore*/
                +" fbs.DBG_FUNCTION:"+fbs.DBG_FUNCTION																   /*@explore*/
                +" jsd:"+jsd																   						   /*@explore*/
            +"\n");                                                                 								   /*@explore*/
        }	                                                                                                           /*@explore*/

        if (jsd)
        {
            jsd.unPause();
            this.hookScripts();
        }
        else
        {
            jsd = DebuggerService.getService(jsdIDebuggerService);
            if ( this.DBG_ERRORS )  																					/*@explore*/
                ddd("enableDebugger gets jsd service, isOn:"+jsd.isOn+" initAtStartup:"+jsd.initAtStartup+"\n");		/*@explore*/
            jsd.on();
            jsd.flags |= DISABLE_OBJECT_TRACE;
            this.hookScripts();

            jsd.debuggerHook = { onExecute: hook(this.onDebugger, RETURN_CONTINUE) };
            jsd.debugHook = { onExecute: hook(this.onDebug, RETURN_CONTINUE) };
            jsd.breakpointHook = { onExecute: hook(this.onBreakpoint, RETURN_CONTINUE) };
            jsd.throwHook = { onExecute: hook(this.onThrow, RETURN_CONTINUE_THROW) };
            jsd.errorHook = { onError: hook(this.onError, true) };
        }
    },

    disableDebugger: function()
    {
        if (!enabledDebugger)
            return;

        timer.init({observe: function()
        {
            enabledDebugger = false;

            jsd.pause();
            fbs.unhookScripts();
        }}, 1000, TYPE_ONE_SHOT);

        waitingForTimer = true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // jsd Hooks

    // When (debugger keyword and not halt)||(bp and BP_UNTIL) || (onBreakPoint && no conditions)
    // || interuptHook.  rv is ignored
    onBreak: function(frame, type, rv)
    {
        if (fbs.DBG_STEP) ddd("fbs.onBreak type="+getExecutionStopNameFromType(type)+"\n");                            /*@explore*/
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
        if (fbs.DBG_BP) ddd("fbs.onDebugger with haltDebugger="+haltDebugger+"\n");                                    /*@explore*/
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
            ERROR("onDebugger failed: "+exc);
            return RETURN_CONTINUE;
         }
    },

    onDebug: function(frame, type, rv)
    {
        if (fbs.DBG_ERRORS)                                                                                               /*@explore*/
            ddd("fbs.onDebug fileName="+frame.script.fileName+"\n");                                                      /*@explore*/
        if ( isFilteredURL(frame.script.fileName) )
            return RETURN_CONTINUE;
        try
        {
            var debuggr = reportNextError || breakOnNextError ? this.findDebugger(frame) : null;
            if (fbs.DBG_ERRORS) {                                                                                         /*@explore*/
                ddd("fbs.onDebug "+(debuggr?"found debuggr with ":" NO debuggr with ")+ "reportNextError="                /*@explore*/
                                 +reportNextError+" breakOnNextError="+breakOnNextError+"\n");                            /*@explore*/
                if (!debuggr)                                                                                             /*@explore*/
                    this.diagnoseFindDebugger(frame);                                                                     /*@explore*/
            }                                                                                                             /*@explore*/

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
        if ( isFilteredURL(frame.script.fileName) )
            return RETURN_CONTINUE;
        var scriptTag = frame.script.tag;
        if (scriptTag in this.topLevelScriptTag)
        {
            if (fbs.DBG_BP) ddd("onBreakpoint("+getExecutionStopNameFromType(type)+") with frame.script.tag="          /*@explore*/
                                      +scriptTag+" topLevelScriptTag\n");                                              /*@explore*/
            delete this.topLevelScriptTag[scriptTag];
            this.onEvalBreak(frame, type, val);
            var checkBP = true;
        }
        else if (scriptTag in fbs.eventLevelScriptTag)
        {
            if (fbs.DBG_CREATION) ddd("onBreakpoint("+getExecutionStopNameFromType(type)                               /*@explore*/
                                       +") found eventLevelScriptTag: "+scriptTag+"\n");                               /*@explore*/
            delete this.eventLevelScriptTag[scriptTag];
            return this.onEventScriptBreak(frame, type, val);
        }
        else if (scriptTag in fbs.nestedScriptStack)
        {
            // We hit a BP in a newly created script that was not drained by top- or eval-level completion. Must be dynamic Function()
            if (fbs.DBG_CREATION) ddd("onBreakpoint("+getExecutionStopNameFromType(type)                               /*@explore*/
                                       +") found nestedScriptTag: "+scriptTag+"\n");                                    /*@explore*/
            this.onFunctionBreak(frame, type, val);

        }
        if (checkBP || disabledCount || monitorCount || conditionCount || runningUntil)
        {
            if (fbs.DBG_BP) ddd("onBreakpoint("+getExecutionStopNameFromType(type)+") disabledCount:"+disabledCount    /*@explore*/
                 +" monitorCount:"+monitorCount+" conditionCount:"+conditionCount+" runningUntil:"+runningUntil+"\n"); /*@explore*/
            var url = this.getSourceURL(frame.script);
            var scriptInfo = this.scriptInfoByTag[scriptTag];
            var lineNo = frame.line;
            if (scriptInfo)
                lineNo = scriptInfo.unshiftFromSourceBufferToScriptNumbering(lineNo);

            var bp = this.findBreakpoint(url, lineNo);
            if (bp)
            {
                if (bp.type & BP_MONITOR && !(bp.disabled & BP_MONITOR))
                    bp.debuggr.onCall(frame);

                if (bp.type & BP_UNTIL)
                {
                    this.stopStepping();
                    return this.onBreak(frame, type, val);
                }
                else if (bp.type & BP_NORMAL)
                {
                    var passed = testBreakpoint(frame, bp);
                    if (!passed)
                        return RETURN_CONTINUE;
                }
                else if (!(bp.type & BP_NORMAL) || bp.disabled & BP_NORMAL)
                    return RETURN_CONTINUE;
            }
            else
                return RETURN_CONTINUE;
        }

        if (fbs.DBG_BP) ddd("onBreakpoint("+getExecutionStopNameFromType(type)+") with frame.script.tag="              /*@explore*/
                +frame.script.tag+" evtag="+fbs.eventLevelScriptTag[frame.script.tag]+"\n");                           /*@explore*/
        if (runningUntil) // XXXjjb ?? bp and after onCall? Seems dubious
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
        this._lastErrorWindow = getFrameWindow(frame);

        if (fbs.DBG_ERRORS) ddd("onThrow from "+frame.script.fileName+"@"+frame.line+": "+frame.pc+"\n");

        var debuggr = this.findDebugger(frame);
        if (debuggr)
            return debuggr.onThrow(frame, rv);

        return RETURN_CONTINUE_THROW;
    },

    onError: function(message, fileName, lineNo, pos, flags, errnum, exc)
    {
        if (fbs.DBG_ERRORS)                                                                                            /*@explore*/
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

        errorInfo = { message: message, fileName: fileName, lineNo: lineNo, pos: pos, flags: flags, errnum: errnum, exc: exc };
        if (this.showStackTrace)
        {
            reportNextError = true;
            var theNeed = this.needToBreakForError(fileName, lineNo);
            if (fbs.DBG_ERRORS)                                                                                        /*@explore*/
                ddd("fbs.onError needToBreakForError="+theNeed+"; in any case we will drop in to onDebug\n");       /*@explore*/
            fbs.hookInterruptsToTrapErrors();
            return false; // Drop into onDebug, sometimes only
        }
        else
        {
            return !this.needToBreakForError(fileName, lineNo);
        }
    },

    onEventScriptBreak: function(frame, type, val)
    {
        try {
            var script = frame.script;
            var bp = this.findZeroPCBreakpoint(script, PCMAP_SOURCETEXT);
            if (bp == undefined)
                script.clearBreakpoint(0);

            var debuggr = this.findDebugger(frame);  // sets debuggr.breakContext

            if (debuggr)
            {
                try
                {
                    debuggr.QueryInterface(nsIFireBugURLProvider);
                    var eventURL = this.getURLFromDebugger(debuggr.onEventScript, frame);
                    if (eventURL)
                    {
                        if (fbs.DBG_CREATION) ddd("onEventScriptBreak eventURL="+dFormat(script,eventURL)+"\n");       /*@explore*/
                        this.registerEventLevelScript(script, eventURL, "event level"); // 1 is determined experimentally
                        //fbs.drainTopLevelScriptStack(eventURL, frame, script, debuggr);  TODO test multiple functions in event
                    }
                    return RETURN_CONTINUE;
                }
                catch (exc)
                {
                }
            }
        } catch(exc) {
            ERROR("onEventScriptBreak failed: "+exc);
        }
        return RETURN_CONTINUE;
    },

    onEvalBreak: function(frame, type, val)
    {
        try
        {
            // In onScriptCreated we found a no-name script, set a bp in PC=0, and a flag.
            // onBreakpoint saw the flag, cleared the flag, and sent us here.
            // Start by undoing our damage
            var script = frame.script;
            var bp = this.findZeroPCBreakpoint(script, PCMAP_SOURCETEXT);  // I don't thing we need this because we will soon resetBreakpointss
            if (bp == undefined)
            {
                script.clearBreakpoint(0);
                if (fbs.DBG_CREATION) ddd("fbs.onEvalBreak clear bp@0 for tag="+script.tag+"\n");                      /*@explore*/
            }

            var debuggr = this.findDebugger(frame);  // sets debuggr.breakContext
            if (!debuggr)
            {
                if (fbs.DBG_BP) ddd("firebug-service: no debuggr for frame.fileName="+script.fileName+"\n");           /*@explore*/
                return;
            }

            try
            {
                if ( !(debuggr instanceof nsIFireBugURLProvider) )  // XXXjjb Max maybe we should test this once in init insist on true or throw error
                {
                    if (fbs.DBG_CREATION) ddd("onEvalBreak debuggr fails instanceof test\n");
                    return;
                }

            }
            catch (exc)
            {
                if (fbs.DBG_CREATION) ddd("onEvalBreak debuggr FAILS:"+exc+"\n");
                return;
            }

            if (!frame.callingFrame)
            {
                var topLevelURL = this.getURLFromDebugger(debuggr.onTopLevel, frame);
                if (topLevelURL)
                {
                    if (fbs.DBG_CREATION) ddd("onEvalBreak top_level: "+dFormat(script, topLevelURL)+"\n");            /*@explore*/
                    this.registerTopLevelScript(script, topLevelURL, "top-level");
                    this.drainTopLevelScriptStack(topLevelURL, frame, script, debuggr);
                }
                else                                                                                                   /*@explore*/
                {                                                                                                      /*@explore*/
                    if (fbs.DBG_CREATION) ddd("onEvalBreak: no url returned from debugger side");                      /*@explore*/
                }                                                                                                      /*@explore*/
            }
            else
            {
                if (fbs.DBG_CREATION) ddd("onEvalBreak eval_level\n");                                                 /*@explore*/
                var leveledScriptURL = this.getURLFromDebugger(debuggr.onEval, frame);
                if (fbs.DBG_CREATION) ddd("onEvalBreak eval_level url="+leveledScriptURL+"\n");                        /*@explore*/
                if (leveledScriptURL)
                {
                    this.registerEvalLevelScript(script, leveledScriptURL, "eval-level", 1);
                    this.drainEvalScriptStack(leveledScriptURL, frame, script, debuggr);
                }
            }
        }
        catch (exc)
        {
            ERROR("onEvalBreak failed: "+exc);
        }
    },

    getURLFromDebugger: function(callback, frame)
    {
        try
        {
            var url = callback(frame);
            if (!url)
            {
                ERROR("firebug-service: debuggr callback for url failed \n");
                return;
            }
            return url;
        }
        catch(exc)
        {
            if (fbs.DBG_ERRORS) dumpProperties("firebug-service: debuggr callback for url FAILED with exception=",exc);/*@explore*/
            ERROR("firebug-service: debuggr callback for url FAILED with exception="+exc+"\n");
        }
    },

    drainTopLevelScriptStack: function(leveledScriptURL, frame, leveledScript, debuggr)
    {
        for (tag in this.nestedScriptStack)
        {
            var nestedScript = this.nestedScriptStack[tag];
            if (nestedScript.fileName != leveledScriptURL)
                continue;
            // XXXjjb No BP in nestedScripts. nestedScript.clearBreakpoint(0);  // set in onScriptCreated and cleared here before it can ever be hit. TODO user BP at PC=0?

            var lineNo = nestedScript.baseLineNumber - leveledScript.baseLineNumber + 1;
            if (fbs.DBG_CREATION)                                                                                      /*@explore*/
                ddd("drainTopLevelScriptStack: nestedScript.baseLineNumber - leveledScript.baseLineNumber + 1="        /*@explore*/
                                 +nestedScript.baseLineNumber+"-"+leveledScript.baseLineNumber+" + 1\n");              /*@explore*/

            debuggr = this.reFindDebugger(frame, debuggr);
            debuggr.onTopLevelScript(leveledScriptURL, lineNo, nestedScript);

            var scriptInfo = this.registerTopLevelScript(nestedScript, leveledScriptURL, "nested in top-level");
       }
       fbs.nestedScriptStack = {}; // XXXjjb TODO we lose all the moz scripts here
    },

    drainEvalScriptStack: function(leveledScriptURL, frame, script, debuggr)
    {
        for (tag in this.nestedScriptStack) {
            var nestedScript = this.nestedScriptStack[tag];
            if (nestedScript.fileName != script.fileName)
                continue;
            // XXXjjb No BP in nestedScripts. nestedScript.clearBreakpoint(0);  // set in onScriptCreated and cleared here before it can ever be hit. TODO user BP at PC=0?

            var baseLineNumberWithEvalBuffer = nestedScript.baseLineNumber - script.baseLineNumber + 1;
            if (baseLineNumberWithEvalBuffer <= 0)
            {
                // happens for ppfun internally generated functions and maybe for injected script tags?
                if (fbs.DBG_CREATION)                                                                                  /*@explore*/
                    ddd("Neg. offset for nestedScript.baseLineNumber - script.baseLineNumber + 1 @leveledScriptURL="   /*@explore*/
                        +nestedScript.baseLineNumber+" - "+script.baseLineNumber + "+1 @"+leveledScriptURL+" src="     /*@explore*/
                        +nestedScript.functionSource+"\n"+script.fileName+ " vs nested "+nestedScript.fileName+"\n");  /*@explore*/
            }
            debuggr = this.reFindDebugger(frame, debuggr);
            debuggr.onEvalScript(leveledScriptURL, baseLineNumberWithEvalBuffer, nestedScript);

            var scriptInfo = this.registerEvalLevelScript(nestedScript, leveledScriptURL, "nested in eval-level ",  baseLineNumberWithEvalBuffer);

       }
       fbs.nestedScriptStack = {};
    },

    drainFunctionConstructorScriptStack: function(frame)
    {
        // frame is after Function() constructor call return, in source of caller.
        for (tag in this.nestedScriptStack) {
            var nestedScript = this.nestedScriptStack[tag];
            //if (nestedScript.functionName != "anonymous") //
            //    continue;
            var debuggr = this.findDebugger(frame);
            if (debuggr)
            {
                var ctorURL = debuggr.onFunctionConstructor(frame, nestedScript);
                var scriptInfo = this.registerFunctionConstructorScript(nestedScript, ctorURL, "Function()");
                if (fbs.DBG_CREATION)                                                                                  /*@explore*/
                    ddd("drainFunctionConstructorScriptStack:"+formatScriptInfo(scriptInfo) +"\n");          	   /*@explore*/
            }
       }
       fbs.nestedScriptStack = {};
    },

    onScriptCreated: function(script)
    {
        if(!fbs) return;

        try
        {
            var fileName = script.fileName;
            if (!fileName || isFilteredURL(fileName))
                return;

            if (fbs.DBG_CREATION) {                                                                                    /*@explore*/
                ddd("onScriptCreated: "+script.tag+"@("+script.baseLineNumber+"-"                                      /*@explore*/
                    +(script.baseLineNumber+script.lineExtent)+")"+script.fileName+"\n");                              /*@explore*/
                ddd("onScriptCreated name: \'"+script.functionName+"\'\n");                 /*@explore*/
                ddd(script.functionSource+"\n");                 /*@explore*/
            }                                                                                                          /*@explore*/

            if (!fbs.showEvalSources)
            {
                this.registerTopLevelScript(script, fileName, !script.functionName ? "top-level" : "nested in top-level");
                return;
            }

            if (!script.functionName)
            {
                // top or eval-level
                // We need to detect eval() and grab its source. For that we need a stack frame.
                // Get a frame by breakpointing the no-name script that was just created.
                // XXXjjb try fbs.topLevelScriptTag = script.tag?
                fbs.topLevelScriptTag[script.tag] = true;
                script.setBreakpoint(0);
                fbs.clearHookInterruptsToTrackScripts(); // now we know that any nested scripts are part of our buffer, not dynamic functions
                if (fbs.DBG_CREATION) ddd("onScriptCreated: set BP at PC 0 in top or eval level tag="+script.tag+"\n");/*@explore*/
            }
            else if (script.baseLineNumber == 1 && (fileName in this.scriptInfoArrayByURL))
            {
                fbs.eventLevelScriptTag[script.tag]= true;
                script.setBreakpoint(0);  // XXXjjb possible conflict with bp set by user
                fbs.clearHookInterruptsToTrackScripts(); // Should not have been set...?
                if (fbs.DBG_CREATION) ddd("onScriptCreated: set BP at PC 0 in event level tag="+script.tag+"\n");      /*@explore*/
            }
            else
            {
                fbs.nestedScriptStack[script.tag] = script;
                if (fbs.DBG_CREATION) ddd("onScriptCreated: nested function named: "+script.functionName+"\n");                                         /*@explore*/
                if (script.functionName == "anonymous") // not no-name
                    fbs.hookInterruptsToTrackScripts();  // if the hook is taken, then its not a eval- or top-, must be Function or ?
            }
        }
        catch(exc)
        {
            ERROR("onScriptCreated failed: "+exc);
        }
    },

    onScriptDestroyed: function(script)
    {
        if(!fbs) return;
        var scriptTag = script.tag;
        if (scriptTag in this.scriptInfoByTag)
        {
            var scriptInfo = this.scriptInfoByTag[scriptTag];
            var url = scriptInfo.url;
            if (url in this.scriptInfoArrayByURL)
            {
                if (fbs.DBG_CREATION) ddd("onScriptDestroyed tag:"+scriptTag+" url:"+url+"\n");                        				/*@explore*/
                remove(this.scriptInfoArrayByURL[url], scriptInfo);
            }
            else
                if (fbs.DBG_CREATION) ddd("onScriptDestroyed tag:"+scriptTag+" no scriptInfo; fileName:"+script.fileName+"\n");      /*@explore*/

            delete this.scriptInfoByTag[scriptTag];
        }
        delete this.nestedScriptStack[scriptTag];
        delete this.eventLevelScriptTag[scriptTag];

        dispatch(scriptListeners,"onScriptDestroyed",[script]);
    },

    resetBreakpoints: function(scriptInfo)
    {
        if (fbs.DBG_BP) ddd("resetBreakpoints: "+formatScriptInfo(scriptInfo)+"\n");                                   /*@explore*/
        // If the new script is replacing an old script with a breakpoint still
        // set in it, try to re-set the breakpoint in the new script
        var url = scriptInfo.url;
        var urlBreakpoints = breakpoints[url];
        var pcmap = scriptInfo.pcmap;
        if (urlBreakpoints)
        {
            if (fbs.DBG_BP) ddd("resetBreakpoints total bp="+urlBreakpoints.length+" for url="+url+"\n");              /*@explore*/

            for (var i = 0; i < urlBreakpoints.length; ++i)
            {
                var bp = urlBreakpoints[i];
                var endScript = scriptInfo.baseLineNumber + scriptInfo.lineExtent;
                var sourceLineNo = bp.lineNo;
                var lineInScript = scriptInfo.shiftFromSourceBufferToScriptNumbering(sourceLineNo);
                if (fbs.DBG_BP) ddd("resetBreakpoints scriptInfo.baseLineNumber <= lineInScript <= endScript="         /*@explore*/
                                      +scriptInfo.baseLineNumber+"<="+lineInScript+"<="+endScript+"\n");               /*@explore*/
                if ((scriptInfo.baseLineNumber <= lineInScript) && (lineInScript <= endScript))
                {
                    var script = scriptInfo.script;
                    if (script.isLineExecutable(lineInScript, pcmap))
                    {
                        var pc = script.lineToPc(lineInScript, pcmap);
                        script.setBreakpoint(pc);
                        if (fbs.DBG_BP)ddd("set resetBreakpoints: line="+sourceLineNo                                  /*@explore*/
                                               +" lineInScript="+lineInScript+" pc="+pc+"\n");                         /*@explore*/
                        bp.startLineNo = scriptInfo.baseLineNumber;
                    }
                }
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // ScriptInfo
    // the script exists between baseLineNumber and baseLineNumber + lineExtent.

    registerScriptInfo: function(script, url, typename)
    {
        var scriptInfo = new ScriptInfo(script, url, typename);

        if (url in this.scriptInfoArrayByURL)
            this.scriptInfoArrayByURL[url].push(scriptInfo);
        else
            this.scriptInfoArrayByURL[url]= [scriptInfo];

        this.scriptInfoByTag[script.tag] = scriptInfo;

        return scriptInfo;
    },

    registerTopLevelScript: function(script, url, typename)
    {
        var scriptInfo = this.registerScriptInfo(script, url, typename);
        scriptInfo.pcmap = PCMAP_SOURCETEXT;
        scriptInfo.lineExtent = script.lineExtent;
        scriptInfo.baseLineNumber = script.baseLineNumber;
        scriptInfo.shiftFromSourceBufferToScriptNumbering = shiftNone;
        scriptInfo.unshiftFromSourceBufferToScriptNumbering = shiftNone;

        this.resetBreakpoints(scriptInfo);

        if (fbs.DBG_CREATION) ddd("registerTopLevelScript: "+formatScriptInfo(scriptInfo) +"\n");                      /*@explore*/

        dispatch(scriptListeners,"onScriptCreated",[script, url, script.baseLineNumber]);
        return scriptInfo;
    },

    registerEvalLevelScript: function(script, url, typename, offsetInEvalBuffer)
    {
        var scriptInfo = this.registerScriptInfo(script, url, typename);
        scriptInfo.pcmap = PCMAP_SOURCETEXT;
        scriptInfo.lineExtent = script.lineExtent;
        scriptInfo.baseLineNumber = script.baseLineNumber;
        scriptInfo.offsetInEvalBuffer = offsetInEvalBuffer;
        scriptInfo.shiftFromSourceBufferToScriptNumbering = function(lineNo)
        {
            // We've taken the eval source into a buffer starting at 1.
            // This particular script starts at baseLineNumber relative to 1.
            // The engine uses scriptLineNo = eval-point-lineNumber + lineNo - 1.
            //
            return lineNo + this.offsetInEvalBuffer - 1;
        }
        scriptInfo.unshiftFromSourceBufferToScriptNumbering = function(lineNo)
        {
            return lineNo - this.offsetInEvalBuffer + 1;
        }
        this.resetBreakpoints(scriptInfo);

        if (fbs.DBG_CREATION) ddd("registerEvalLevelScript: "+formatScriptInfo(scriptInfo) +"\n");                     /*@explore*/

        dispatch(scriptListeners,"onScriptCreated",[script, url, offsetInEvalBuffer]);
        return scriptInfo;
    },

    registerEventLevelScript: function(script, url, typename)
    {
        var scriptInfo  = this.registerScriptInfo(script, url, typename);
        scriptInfo.pcmap = PCMAP_PRETTYPRINT;
        scriptInfo.lineExtent = countLines(script);
        scriptInfo.baseLineNumber = script.baseLineNumber;
        scriptInfo.shiftFromSourceBufferToScriptNumbering = shiftOne;  // heursitic
        scriptInfo.unshiftFromSourceBufferToScriptNumbering = unshiftOne;
        this.resetBreakpoints(scriptInfo);

        if (fbs.DBG_CREATION) ddd( "registerEventLevelScript: "+formatScriptInfo(scriptInfo) +"\n");                   /*@explore*/
        dispatch(scriptListeners,"onScriptCreated",[script, url, script.baseLineNumber]);
        return scriptInfo;
    },

    registerFunctionConstructorScript: function(script, url, typename)
    {
        var scriptInfo  = this.registerScriptInfo(script, url, typename);
        scriptInfo.pcmap = PCMAP_PRETTYPRINT;
        scriptInfo.lineExtent = countLines(script);
        scriptInfo.baseLineNumber = 1;
        scriptInfo.offsetInEvalBuffer = script.baseLineNumber; // call point
        scriptInfo.shiftFromSourceBufferToScriptNumbering = shiftOne;  // heursitic
        scriptInfo.unshiftFromSourceBufferToScriptNumbering = unshiftOne;
        this.resetBreakpoints(scriptInfo);

        if (fbs.DBG_CREATION) ddd( "registerFunctionConstructionScript: "+formatScriptInfo(scriptInfo) +"\n");                   /*@explore*/
        dispatch(scriptListeners,"onScriptCreated",[script, url, script.baseLineNumber]);
        return scriptInfo;
    },

    findFirstExecutableLine: function(script)
    {
        var scriptInfo = this.scriptInfoByTag[script.tag];
        var pcmap = scriptInfo.pcmap;
        var line = script.pcToLine(0, pcmap);
        return line;
    },

    dumpScriptInfo: function()
    {
        for (url in this.scriptInfoArrayByURL)
        {
            if (isFilteredURL(url)) continue;

            var scriptInfos = this.scriptInfoArrayByURL[url];
            for (var i = 0; i < scriptInfos.length; i++)
            {
                ddd(i+"/"+scriptInfos.length+": "+formatScriptInfo(scriptInfos[i])+"\n");
            }
        }
        jsd.enumerateContexts( {enumerateContext: function(jscontext)
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
                        ddd("global without document\n");
                    ddd("global type: "+typeof(global)+"\n");
                }
                else
                    ddd("no global object\n");

                ddd("\n");
                try
                {
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

        var win = getFrameWindow(frame);
        if (!win)
            return;

        // XXXjjb TODO cache debuggr for win, add API to debuggr to set context w/o call to tabWatcher

        for (var i = 0; i < debuggers.length; ++i)
        {
            try
            {
                var debuggr = debuggers[i];
                if (debuggr.supportsWindow(win))
                    return debuggr;
            }
            catch (exc) {  ERROR("firebug-service findDebugger: "+exc);}
        }
    },

    diagnoseFindDebugger: function(frame)
    {
        dumpToFileWithStack("diagnoseFindDebugger", frame);
        var win = getFrameWindow(frame);
        if (!win)
            return;
        ddd("diagnoseFindDebugger find win.location ="+(win.location?win.location.href:"(undefined)")+"\n");
        for (var i = 0; i < debuggers.length; ++i)
        {
            try
            {
                var debuggr = debuggers[i];
                if (debuggr.supportsWindow(win))
                    return debuggr;
            }
            catch (exc) {ddd("caught:"+exc+"\n");}
        }
        ddd("diagnoseFindDebugger tried "+debuggers.length+"\n");
    },

    reFindDebugger: function(frame, debuggr)
    {
        var win = getFrameWindow(frame);
        if (debuggr.supportsWindow(win)) return debuggr; // for side-effect: context set on debugger.js
    },

    getSourceURL: function(script)
    {
        if (script.tag in this.scriptInfoByTag)
            return this.scriptInfoByTag[script.tag].url;
        else
            return script.fileName;
    },

    findScriptInfos: function(url, lineNo)
    {
        var hits = [];

        var scriptInfos = this.scriptInfoArrayByURL[url];
        if (scriptInfos)
        {
            for (var i = 0; i < scriptInfos.length; ++i)
            {
                var scriptInfo = scriptInfos[i];

                var lineInScript = scriptInfo.shiftFromSourceBufferToScriptNumbering(lineNo);

                var offset = scriptInfo.baseLineNumber;
                var max = offset + scriptInfo.lineExtent;
                var pcmap = scriptInfo.pcmap;

                var script = scriptInfo.script;
                if (!script.isValid)
                {
                    if (fbs.DBG_CREATION) ddd("findScriptInfos !script.isValid tag:"+script.tag+" url:"+scriptInfo.url+"\n");
                    continue;
                }
                if (fbs.DBG_BP)
                    if(script instanceof jsdIScript)
                        ddd("findScriptInfos has jsdIScript\n");

                if (fbs.DBG_BP) ddd(" findScriptInfos trying #"+i+" tag="+script.tag            /*@explore*/
                        +" offset<=lineInScript<=max:"+offset+"<="+lineInScript+"<="+max                    /*@explore*/
                        +" using pcmap="+pcmap+" isLineExe="+script.isLineExecutable(lineInScript, pcmap)+"\n");       /*@explore*/

                if (lineInScript >= offset && lineInScript <= max)
                {
                    if (fbs.DBG_BP) ddd(" found script in range\n");                                                   /*@explore*/
                    if (script.isLineExecutable(lineInScript, pcmap))
                    {
                        if (fbs.DBG_BP)ddd(" found script="+script.tag+" using offset="+offset+" url="+url+"\n");      /*@explore*/
                        hits.push(scriptInfo);
                    }
                 }
            }
        }

        return hits;
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

    findErrorBreakpoint: function(url, lineNo)
    {
        url = normalizeURL(url);

        for (var i = 0; i < errorBreakpoints.length; ++i)
        {
            var bp = errorBreakpoints[i];
            if (bp.lineNo == lineNo && bp.href == url)
                return i;
        }

        return -1;
    },

    findZeroPCBreakpoint: function(script, pcmap)
    {
        var url = this.getSourceURL(script);
        var line = script.pcToLine(0, pcmap);
        return this.findBreakpoint(url, line);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    addBreakpoint: function(type, url, lineNo, debuggr, scriptInfo, props)
    {
        // ddd("addBreakpoint type="+type+"\n");
        url = denormalizeURL(url);

        var bp = this.findBreakpoint(url, lineNo);
        if (bp && bp.type & type)
            return null;

        if (bp)
        {
            bp.type |= type;

            if (debuggr)
                bp.debuggr = debuggr;
        }
        else
        {
            var scriptInfos = scriptInfo ? [scriptInfo] : this.findScriptInfos(url, lineNo);
            if (fbs.DBG_BP) ddd("addBreakpoint found "+scriptInfos.length+" for url="+lineNo+"@"+url+"\n");            /*@explore*/

            var foundInScriptInfos = false;
            for (var i = 0; i < scriptInfos.length; ++i)
            {
                scriptInfo = scriptInfos[i];
                var script = scriptInfo.script;
                var pcmap = scriptInfo.pcmap;

                var lineInScript = scriptInfo.shiftFromSourceBufferToScriptNumbering(lineNo);
                var pc = script.lineToPc(lineInScript, pcmap);
                script.setBreakpoint(pc);

                if (fbs.DBG_BP) ddd("setBreakpoint on lineNo="+lineNo+"N"+script.tag+" using pcmap="+pcmap+" pc="+pc+"\n");           /*@explore*/

                var firstSourceLine = scriptInfo.unshiftFromSourceBufferToScriptNumbering(script.baseLineNumber);
                bp = this.recordBreakpoint(type, url, lineNo, debuggr, firstSourceLine, props);

                foundInScriptInfos = true;
            }
            if (!foundInScriptInfos)
            {
                if (fbs.DBG_BP) ddd("recordBreakpoint !foundInScriptInfos lineNo="+lineNo                                 /*@explore*/
                                    +" using pcmap="+pcmap+" pc="+pc+"\n");                                            /*@explore*/
                // TODO if we want to allow this case we need to find the script at the line.
                bp = this.recordBreakpoint(type, url, lineNo, debuggr, null, props);  // mark for next reload
            }
        }

        return bp;
    },

    recordBreakpoint: function(type, url, lineNo, debuggr, functionDeclarationLine, props)
    {
        var urlBreakpoints = breakpoints[url];
          if (!urlBreakpoints)
            breakpoints[url] = urlBreakpoints = [];

        var bp = {type: type, href: url, lineNo: lineNo, disabled: 0,
            startLineNo: functionDeclarationLine, debuggr: debuggr,
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
        url = denormalizeURL(url);
        if (fbs.DBG_BP) ddd("removeBreakpoint for url= "+url+"\n");                                                    /*@explore*/

        var urlBreakpoints = breakpoints[url];
        if (!urlBreakpoints)
            return false;

        if (fbs.DBG_BP) ddd("removeBreakpoint need to check bps="+urlBreakpoints.length+"\n");                         /*@explore*/

        for (var i = 0; i < urlBreakpoints.length; ++i)
        {
            var bp = urlBreakpoints[i];
            if (fbs.DBG_BP) ddd("removeBreakpoint checking bp.lineNo vs lineNo="+bp.lineNo+" vs "+lineNo+"\n");        /*@explore*/

            if (bp.lineNo == lineNo)
            {
                bp.type &= ~type;
                if (!bp.type)
                {
                    // Theoretically, there should only be one script to be found here,
                    // but due to leaks sometimes we'll have multiple scripts with the
                    // breakpoint set, so we need to be sure to clear all of them
                    // Check all scripts that may be defined on this line of url
                    // xxxJJB this is expensive, we could track the scripts
                    jsd.enumerateScripts({enumerateScript: function(script)
                    {
                        if (script)
                        {
                            var scriptInfo = fbs.scriptInfoByTag[script.tag];
                            if (scriptInfo)
                            {
                                var pcmap = scriptInfo.pcmap;
                                if(scriptInfo.url == url && script.isLineExecutable(lineNo, pcmap))
                                {
                                    var lineInScript = scriptInfo.shiftFromSourceBufferToScriptNumbering(lineNo);
                                    var pc = script.lineToPc(lineInScript, pcmap);
                                    script.clearBreakpoint(pc);
                                    if (fbs.DBG_BP) ddd("removeBreakpoint in tag="+script.tag+" at "+lineNo+"@"+url+"\n");/*@explore*/
                                }
                            }
                        }
                    }});

                    urlBreakpoints.splice(i, 1);
                    --breakpointCount;

                    if (bp.disabled)
                        --disabledCount;

                    if (bp.condition || bp.hitCount)
                    {
                        --conditionCount;
                    }

                    if (!urlBreakpoints.length)
                        delete breakpoints[url];

                }

                return true;
            }
        }

        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    breakIntoDebugger: function(debuggr, frame, type)
    {
        // Before we break, clear information about previous stepping session
        this.stopStepping();

        if (fbs.DBG_BP || fbs.DBG_CREATION || fbs.DBG_ERRORS || fbs.DBG_STEP || fbs.DBG_FUNCTION) flushDebugStream();        /*@explore*/

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

    needToBreakForError: function(url, lineNo)
    {
        return breakOnNextError =
            this.breakOnErrors || this.findErrorBreakpoint(url, lineNo) != -1;
    },

    startStepping: function()
    {
        if (!stepMode && !runningUntil)
            return;

         if (fbs.DBG_STEP) ddd("startStepping stepMode = "+getPropertyName(nsIFireBug, stepMode)                        /*@explore*/
                 +" hookFrameCount="+hookFrameCount+" stepFrameCount="+stepFrameCount+"\n");                           /*@explore*/

        this.hookFunctions();

        if (stepMode == STEP_OVER || stepMode == STEP_INTO)
            this.hookInterrupts();
    },

    stopStepping: function()
    {
        if (fbs.DBG_STEP) ddd("stopStepping\n");                                                                       /*@explore*/
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

                    if (fbs.DBG_STEP) ddd("functionHook TYPE_FUNCTION_CALL stepMode = "+getPropertyName(nsIFireBug, stepMode)/*@explore*/
                             +" hookFrameCount="+hookFrameCount+" stepFrameCount="+stepFrameCount+"\n");               /*@explore*/
                    break;
                }
                case TYPE_FUNCTION_RETURN:
                {
                    --hookFrameCount;
                    if (fbs.DBG_STEP) ddd("functionHook TYPE_FUNCTION_RETURN stepMode = "+getPropertyName(nsIFireBug, stepMode)/*@explore*/
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

        if (fbs.DBG_STEP) ddd("set functionHook\n");                                                                   /*@explore*/
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
            if (fbs.DBG_STEP) ddd("interruptHook frameLineId: "+frameLineId+"\n");                                     /*@explore*/
            if (frameLineId != stepFrameLineId)
                return fbs.onBreak(frame, type, rv);
            else
                return RETURN_CONTINUE;
        }

        if (fbs.DBG_STEP) ddd("set InterruptHook\n");                                                                  /*@explore*/
        jsd.interruptHook = { onExecute: interruptHook };
    },

    hookScripts: function()
    {
        if (fbs.DBG_STEP) ddd("set scriptHook\n");                                                                     /*@explore*/
        jsd.scriptHook = {
            onScriptCreated: hook(this.onScriptCreated),
            onScriptDestroyed: hook(this.onScriptDestroyed)
        };

        this.scriptInfoArrayByURL = {};
        /* jsd.enumerateScripts({enumerateScript: function(script)
        {
            var url = script.fileName;
            if ( !isFilteredURL(url) )
                fbs.registerTopLevelScript(script, url, "enumerated");
        }}); */
    },

    unhookScripts: function()
    {
        jsd.scriptHook = null;
        this.scriptInfoArrayByURL = null;
        if (fbs.DBG_STEP) ddd("unset scriptHook\n");                                                                   /*@explore*/
    },

    hookInterruptsToTrackScripts: function()
    {
        if (jsd.interruptHook && !fbs.trackingScriptsHookSet)
            fbs.saveInterruptHook = jsd.interruptHook;

        jsd.interruptHook = { onExecute: handleTrackingScriptsInterrupt };
        fbs.trackingScriptsHookSet = true;
        if (fbs.DBG_CREATION) ddd("hookInterruptsToTrackScripts fbs.saveInterruptHook:"+fbs.saveInterruptHook+"\n");                                                                  /*@explore*/
    },

    clearHookInterruptsToTrackScripts: function()
    {
        if (fbs.saveInterruptHook)
        {
            jsd.interruptHook = fbs.saveInterruptHook;
            fbs.saveInterruptHook = null;
        }
        else
            jsd.interruptHook = null;

        fbs.trackingScriptsHookSet = false;
        if (fbs.DBG_FUNCTION) ddd("clearHookInterruptsToTrackScripts \n");
    },

    hookInterruptsToTrapErrors: function()
    {
        if (jsd.interruptHook && !fbs.trappingErrorsHookSet)
            fbs.saveInterruptHook = jsd.interruptHook;

        jsd.interruptHook = { onExecute: handleTrappingErrorsInterrupt };
        fbs.trappingErrorsHookSet = true;
        if (fbs.DBG_FUNCTION) ddd("hookInterruptsToTrapErrors fbs.saveInterruptHook:"+fbs.saveInterruptHook+"\n");                                                                  /*@explore*/
    },

    clearHookInterruptsToTrapErrors: function()
    {
        if (fbs.saveInterruptHook)
        {
            jsd.interruptHook = fbs.saveInterruptHook;
            fbs.saveInterruptHook = null;
        }
        else
            jsd.interruptHook = null;

        fbs.trappingErrorsHookSet = false;
        if (fbs.DBG_FUNCTION) ddd("clearHookInterruptsToTrapErrors \n");
    }
};

function handleTrackingScriptsInterrupt(frame, type, rv)
{
    try
    {
        if (fbs.DBG_FUNCTION) ddd("handleTrackingScriptsInterrupt "+(frame.callingFrame?"haveCaller":"top")+" \n");
        // We are not interested in Function() calls at top- or eval-level, since they don't seem to have an important use case and FF2 crashes
        if (frame.callingFrame && !isFilteredURL(frame.script.fileName) )
        {
            var frameLineId = frame.script.fileName + frame.line;
            if (fbs.DBG_FUNCTION) ddd("handleTrackingScriptsInterrupt caller frameLineId: "+frameLineId+" type "+getExecutionStopNameFromType(type)+"\n");                              /*@explore*/

            // When we are called the stack should be at the PC just after the constructor call to Function().
            fbs.drainFunctionConstructorScriptStack(frame);
        }
    }
    catch (exc)
    {
        if (fbs.DBG_CREATION) dumpToFileWithStack("handleTrackingScriptsInterrupt FAILS: "+exc);                              /*@explore*/
    }
    fbs.clearHookInterruptsToTrackScripts();
    return RETURN_CONTINUE;
}

function handleTrappingErrorsInterrupt(frame, type, rv)
{
    try
    {
        if (fbs.DBG_ERRORS) ddd("handleTrappingErrorsInterrupt\n");
        if ( isFilteredURL(frame.script.fileName) )
        {
            var frameLineId = frame.script.fileName + frame.line;
            if (fbs.DBG_ERRORS) dumpToFileWithStack("handleTrappingErrorsInterrupt caller frameLineId: "+frameLineId+" type "+getExecutionStopNameFromType(type), frame);                              /*@explore*/

            fbs.onDebug(frame, type, rv);  // TODO just call this not the other stuff
        }
    }
    catch (exc)
    {
        if (fbs.DBG_CREATION) dumpToFileWithStack("handleTrappingErrorsInterrupt FAILS: "+exc);                              /*@explore*/
    }
    fbs.clearHookInterruptsToTrapErrors();
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

        var filterSystemURLs =  prefs.getBoolPref("extensions.firebug.filterSystemURLs");
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
    {ddd("registerSelf\n");
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
    return url ? url.replace(/file:\/\/\//, "file:/") : "";
}

function isFilteredURL(url)
{
    return ( fbs.filterSystemURLs && systemURLStem(url) );
}

function systemURLStem(url)
{
    if (!url)
        return false;
    if (this.url_class)
    {
        if ( url.substr(0,this.url_class.length) == this.url_class )
            return this.url_class;
    }
    this.url_class = deepSystemURLStem(url);
    return this.url_class;
}

function deepSystemURLStem(url)
{
    for( var i = 0; i < urlFilters.length; ++i )
    {
        var filter = urlFilters[i];
        if ( url.substr(0,filter.length) == filter )
            return filter;
    }
    for( var i = 0; i < COMPONENTS_FILTERS.length; ++i )
    {
        if ( COMPONENTS_FILTERS[i].test(url) )
        {
            var match = COMPONENTS_FILTERS[i].exec(url);
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
        if (name in listener)
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
            var msg = "Error in hook: " + exc +" stack=";
            for (var frame = Components.stack; frame; frame = frame.caller)
                msg += frame.filename + "@" + frame.lineNumber + ";\n";
               ERROR(msg);
            return rv;
        }
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
        ERROR("firebug-service getFrameWindow fails: "+exc);  // FBS.DBG_WINDOWS
        return null;
    }
}

function getRootWindow(win)
{
    for (; win; win = win.parent)
    {
        if (!win.parent || win == win.parent)
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

function getBreakpointProperties(bp)
{
    return { disabled: bp.disabled & BP_NORMAL, condition: bp.condition, onTrue: bp.onTrue, hitCount: bp.hitCount };
}

function remove(list, item)
{
    var index = list.indexOf(item);
    if (index != -1)
        list.splice(index, 1);
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
function ScriptInfo(script, url, typename)
{
    this.script = script;
    this.url = url;
    this.typename = typename;
}

function formatScriptInfo(scriptInfo)
{
    return scriptInfo.script.tag+"@("+scriptInfo.baseLineNumber+"-"+(scriptInfo.baseLineNumber+scriptInfo.lineExtent)+")"+ scriptInfo.url+":"+scriptInfo.typename;
}

function shiftNone(lineNo)
{
    return lineNo;
}

function shiftOne(lineNo)
{
    return lineNo + 1;
}

function unshiftOne(lineNo)
{
    return lineNo - 1;
}

function countLines(script) {
    var lines = script.functionSource.split(/\r\n|\r|\n/);
    return lines.length;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

var FirebugPrefsObserver =
{
    observe: function(subject, topic, data)
    {
        if (data == "extensions.firebug.showStackTrace")
            fbs.showStackTrace =  prefs.getBoolPref("extensions.firebug.showStackTrace");
        else if (data == "extensions.firebug.breakOnErrors")
            fbs.breakOnErrors =  prefs.getBoolPref("extensions.firebug.breakOnErrors");
        else if (data == "extensions.firebug.showEvalSources")
            fbs.showEvalSources =  prefs.getBoolPref("extensions.firebug.showEvalSources");
        else if (data == "extensions.firebug.filterSystemURLs")
            fbs.filterSystemURLs =  prefs.getBoolPref("extensions.firebug.filterSystemURLs");
        else if (data == "extensions.firebug.DBG_FBS_CREATION")
            fbs.DBG_CREATION = prefs.getBoolPref("extensions.firebug.DBG_FBS_CREATION");
        else if (data == "extensions.firebug.DBG_FBS_BP")
            fbs.DBG_BP = prefs.getBoolPref("extensions.firebug.DBG_FBS_BP");
        else if (data == "extensions.firebug.DBG_FBS_ERRORS")
            fbs.DBG_ERRORS = prefs.getBoolPref("extensions.firebug.DBG_FBS_ERRORS");
        else if (data == "extensions.firebug.DBG_FBS_STEP")
            fbs.DBG_STEP = prefs.getBoolPref("extensions.firebug.DBG_FBS_STEP");
        else if (data == "extensions.firebug.DBG_FBS_FUNCTION")
            fbs.DBG_FUNCTION = prefs.getBoolPref("extensions.firebug.DBG_FBS_FUNCTION");
        else if (data == "extensions.firebug.DBG_FBS_FF_START")
            fbs.DBG_FBS_FF_START = prefs.getBoolPref("extensions.firebug.DBG_FBS_FF_START");
        else if (data == "extensions.firebug.DBG_FLUSH_EVERY_LINE")
            fbs.DBG_FLUSH_EVERY_LINE = prefs.getBoolPref("extensions.firebug.DBG_FLUSH_EVERY_LINE");
        else if (data == "extensions.firebug.DBG_FBS_SCRIPTINFO")
        {
            fbs.DBG_FBS_SCRIPTINFO = prefs.getBoolPref("extensions.firebug.DBG_FBS_SCRIPTINFO");
            if (fbs.DBG_FBS_SCRIPTINFO)
                fbs.dumpScriptInfo();
        }
    }
};

var ShutdownObserver =
{
    observe: function(subject, topic, data)
    {
        fbs.shutdown();
    }
};
var ShutdownRequestedObserver =
{
    observe: function(subject, topic, data)
    {
        ddd("FirebugService ShutdownRequestedObserver\n");
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
    if (true)      /* in the traced version we dump to file */														/*@explore*/
        dumpToFile(text);     																						/*@explore*/
    else      		/* but in the untraced version 'else' will be removed and we dump to log */						/*@explore*/
        ERROR(text);
}

function dumpit(text)
{
    const DirService = 	CC("@mozilla.org/file/directory_service;1")
        .getService(CI("nsIDirectoryServiceProvider"));
    var tmpDir = DirService.getFile(NS_OS_TEMP_DIR, {});
    var file = tmpDir.QueryInterface(CI("nsILocalFile"));
    file.appendRelativePath("firebug/dump.txt");
       if (!file.exists())
           file.create(CI("nsIFile").NORMAL_FILE_TYPE, 664);
    var stream = CC("@mozilla.org/network/file-output-stream;1")
        .createInstance(CI("nsIFileOutputStream"));
    stream.init(file, 0x04 | 0x08 | 0x10, 664, 0);
    stream.write(text, text.length);
    stream.flush();
    stream.close();
}

function dFormat(script, url)
{
    return script.tag+"@("+script.baseLineNumber+"-"+(script.baseLineNumber+script.lineExtent)+")"+ url;
}

function getStackDump()                                                                                                /*@explore*/
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
    ddd(lines.join("\n"));                                                                                             /*@explore*/
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
            .getService(CI("nsIProperties"))
            .get("TmpD", CI("nsIFile"));
        file.append("fbug");
        if ( !file.exists() )
            file.create(CI("nsIFile").DIRECTORY_TYPE, 0777);
        file.append("firebug-service-dump.txt");
        //file.createUnique(CI("nsIFile").NORMAL_FILE_TYPE, 0666);
        var stream = CC("@mozilla.org/network/file-output-stream;1").createInstance(CI("nsIFileOutputStream"));
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
    if (fbs && fbs.DBG_FLUSH_EVERY_LINE) dumpStream.flush();  // If FF crashes you need to run with flush on every line
}

function flushDebugStream()
{
    if(dumpStream) dumpStream.flush();
}

function dumpToFileWithStack(text, frame)
{
    if (!dumpStream) dumpStream = createDumpStream();
    dumpStream.write(text, text.length);
    text = " stack: \n";
    while(frame) {
        text += frame.line+"@"+frame.script.fileName + "\n";
        frame = frame.callingFrame;
    }
    text += "-------------------------------------\n";
    dumpStream.write(text, text.length);
    if (fbs.DBG_FLUSH_EVERY_LINE) dumpStream.flush();
}
