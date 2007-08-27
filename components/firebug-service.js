/* See license.txt for terms of usage */

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
const nsIFireBug = CI("nsIFireBug");
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

const COLLECT_PROFILE_DATA = jsdIDebuggerService.COLLECT_PROFILE_DATA;
const DISABLE_OBJECT_TRACE = jsdIDebuggerService.DISABLE_OBJECT_TRACE;

const TYPE_FUNCTION_CALL = jsdICallHook.TYPE_FUNCTION_CALL;
const TYPE_FUNCTION_RETURN = jsdICallHook.TYPE_FUNCTION_RETURN;

const RETURN_CONTINUE = jsdIExecutionHook.RETURN_CONTINUE;
const RETURN_VALUE = jsdIExecutionHook.RETURN_RET_WITH_VAL;
const RETURN_CONTINUE_THROW = jsdIExecutionHook.RETURN_CONTINUE_THROW;

const STEP_OVER = nsIFireBug.STEP_OVER;
const STEP_INTO = nsIFireBug.STEP_INTO;
const STEP_OUT = nsIFireBug.STEP_OUT;

const TYPE_ONE_SHOT = nsITimer.TYPE_ONE_SHOT;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

const BP_NORMAL = 1;
const BP_MONITOR = 2;
const BP_UNTIL = 4;

// ************************************************************************************************
// Globals

var jsd, fbs, prefs;

var contextCount = 0;

var clients = [];
var debuggers = [];
var scriptMap = {};

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

    this.showStackTrace = prefs.getBoolPref("extensions.firebug.showStackTrace");
    this.breakOnErrors = prefs.getBoolPref("extensions.firebug.breakOnErrors");
}

FirebugService.prototype =
{
    shutdown: function()
    {
        timer = null;
        fbs = null;
        jsd = null;
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
    },
    
    runUntil: function(url, lineNo, startFrame)
    {
        runningUntil = this.addBreakpoint(BP_UNTIL, url, lineNo);
        stepFrameCount = countFrames(startFrame);
        stepFrameLineId = stepFrameCount + startFrame.script.fileName + startFrame.line;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    
    setBreakpoint: function(url, lineNo)
    {
        if (this.addBreakpoint(BP_NORMAL, url, lineNo))
            dispatch(debuggers, "onToggleBreakpoint", [url, lineNo, true]);
    },

    clearBreakpoint: function(url, lineNo)
    {
        if (this.removeBreakpoint(BP_NORMAL, url, lineNo))
            dispatch(debuggers, "onToggleBreakpoint", [url, lineNo, false]);
    },

    enableBreakpoint: function(url, lineNo)
    {
        url = denormalizeURL(url);

        var bp = this.findBreakpoint(url, lineNo);
        if (bp && bp.type & BP_NORMAL)
        {
            bp.disabled &= ~BP_NORMAL;
            dispatch(debuggers, "onToggleBreakpointDisabled", [url, lineNo, false]);
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
            dispatch(debuggers, "onToggleBreakpointDisabled", [url, lineNo, true]);
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
            if (bp)
                dispatch(debuggers, "onToggleBreakpoint", [url, lineNo, true]);
        }

        if (!bp)
            return;
        
        if (bp.condition && !condition)
        {
            --conditionCount;
            dispatch(debuggers, "onToggleBreakpointCondition", [url, lineNo, false]);            
        }
        else if (condition && !bp.condition)
        {
            ++conditionCount;        
            dispatch(debuggers, "onToggleBreakpointCondition", [url, lineNo, true]);
        }

        bp.condition = condition;
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
                        cb.call(url, bp.lineNo, bp.startLineNo, bp.disabled & BP_NORMAL,
                            bp.condition);
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
            var scripts = this.findScripts(denormalizeURL(url), lineNo);
            if (scripts.length)
            {
                errorBreakpoints.push({href: normalizeURL(url), lineNo: lineNo,
                    startLineNo: scripts[0].baseLineNumber});
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
                    cb.call(bp.href, bp.lineNo, bp.startLineNo, false, "");
            }
        }
        else
        {
            for (var i = 0; i < errorBreakpoints.length; ++i)
            {
                var bp = errorBreakpoints[i];
                cb.call(bp.href, bp.lineNo, bp.startLineNo, false, "");
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

    monitor: function(script, debuggr)
    {
        var lineNo = findExecutableLine(script, script.baseLineNumber);
        if (lineNo != -1 && this.addBreakpoint(BP_MONITOR, script.fileName, lineNo, debuggr, script))
        {
            ++monitorCount;
            dispatch(debuggers, "onToggleMonitor", [script.fileName, lineNo, true]);
        }
    },

    unmonitor: function(script)
    {
        var lineNo = findExecutableLine(script, script.baseLineNumber);
        if (lineNo != -1 && this.removeBreakpoint(BP_MONITOR, script.fileName, lineNo, script))
        {
            --monitorCount;
            dispatch(debuggers, "onToggleMonitor", [script.fileName, lineNo, false]);
        }
    },

    isMonitored: function(script)
    {
        var lineNo = findExecutableLine(script, script.baseLineNumber);
        var bp = lineNo != -1 ? this.findBreakpoint(script.fileName, lineNo) : null;
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
                        cb.call(url, bp.lineNo, bp.startLineNo, false, "");
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

        if (jsd)
        {
            jsd.unPause();
            this.hookScripts();
        }
        else
        {
            jsd = DebuggerService.getService(jsdIDebuggerService);

            jsd.flags |= DISABLE_OBJECT_TRACE;

            jsd.on();
            this.hookScripts();

            jsd.debuggerHook = { onExecute: hook(this.onDebugger, RETURN_CONTINUE) };
            jsd.debugHook = { onExecute: hook(this.onDebug, RETURN_CONTINUE) };
            jsd.breakpointHook = { onExecute: hook(this.onBreakpoint, RETURN_CONTINUE_THROW) };
            //jsd.throwHook = { onExecute: hook(this.onThrow, RETURN_CONTINUE) };
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
    
    onBreak: function(frame, type, rv)
    {    
        var debuggr = this.findDebugger(frame);
        if (debuggr)
            return this.breakIntoDebugger(debuggr, frame);
        else
            return RETURN_CONTINUE;
    },

    onDebugger: function(frame, type, rv)
    {    
        if (haltDebugger)
        {
            var debuggr = haltDebugger;
            haltDebugger = null;
            
            return debuggr.onHalt(frame);
        }
        else
            return this.onBreak(frame, type, rv);
    },
    
    onDebug: function(frame, type, rv)
    {    
        var debuggr = reportNextError || breakOnNextError ? this.findDebugger(frame) : null;
        
        if (reportNextError)
        {
            reportNextError = false;
            if (debuggr)
                debuggr.onError(frame);
        }

        if (breakOnNextError)
        {
            breakOnNextError = false;
            if (debuggr)
                return this.breakIntoDebugger(debuggr, frame);
        }

        return RETURN_CONTINUE;
    },

    onBreakpoint: function(frame, type, val)
    {
        if (disabledCount || monitorCount || conditionCount || runningUntil)
        {
            var url = frame.script.fileName;
            var bp = this.findBreakpoint(url, frame.line);
            if (bp)
            {
                if (bp.type & BP_MONITOR && !(bp.disabled & BP_MONITOR))
                    bp.debuggr.onCall(frame);

                if (bp.type & BP_UNTIL)
                {
                    this.stopStepping();
                    return this.onBreak(frame, type, val);
                }
                else if (bp.type & BP_NORMAL && bp.condition)
                {
                    var passed = evaluateCondition(frame, bp.condition);
                    if (!passed)
                        return RETURN_CONTINUE;
                }
                else if (!(bp.type & BP_NORMAL) || bp.disabled & BP_NORMAL)
                    return RETURN_CONTINUE;
            }
            else
                return RETURN_CONTINUE;
        }

        if (runningUntil)
            return RETURN_CONTINUE;
        else
            return this.onBreak(frame, type, val);
    },

    onThrow: function(frame, type, val)
    {
        // Remember the error where the last exception is thrown - this will
        // be used later when the console service reports the error, since
        // it doesn't currently report the window where the error occured
        this._lastErrorWindow = getFrameWindow(frame);

        return RETURN_CONTINUE_THROW;
    },

    onError: function(message, fileName, lineNo, pos, flags, errnum, exc)
    {   
        if (this.showStackTrace)
        {
            reportNextError = true;
            this.needToBreakForError(fileName, lineNo);
            return false;
        }
        else
        {
            return !this.needToBreakForError(fileName, lineNo);
        }
    },

    onScriptCreated: function(script)
    {
        var url = script.fileName;
        if (!(url in scriptMap))
            scriptMap[url] = [script];
        else
            scriptMap[url].push(script);
        
        // If the new script is replacing an old script with a breakpoint still
        // set in it, try to re-set the breakpoint in the new script
        var urlBreakpoints = breakpoints[url];
        if (urlBreakpoints)
        {
            for (var i = 0; i < urlBreakpoints.length; ++i)
            {
                var bp = urlBreakpoints[i];
                var lineNo = bp.lineNo;
                if (lineNo >= script.baseLineNumber
                    && lineNo <= script.baseLineNumber+script.lineExtent)
                {
                    if (script.isLineExecutable(lineNo, PCMAP_SOURCETEXT))
                    {
                        var pc = script.lineToPc(lineNo, PCMAP_SOURCETEXT);
                        script.setBreakpoint(pc);

                        bp.startLineNo = script.baseLineNumber;
                    }
                }
            }
        }
    },

    onScriptDestroyed: function(script)
    {
        var url = script.fileName;
        if (url in scriptMap)
            remove(scriptMap[url], script);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

    findDebugger: function(frame)
    {
        var win = getFrameWindow(frame);
        if (!win)
            return;
        
        for (var i = 0; i < debuggers.length; ++i)
        {
            try
            {
                var debuggr = debuggers[i];
                if (debuggr.supportsWindow(win))
                    return debuggr;
            }
            catch (exc) {}
        }
    },
    
    findScripts: function(url, lineNo)
    {    
        var hits = [];
        
        var scripts = scriptMap[url];
        if (scripts)
        {
            for (var i = 0; i < scripts.length; ++i)
            {
                var script = scripts[i];
                if (lineNo >= script.baseLineNumber
                    && lineNo <= script.baseLineNumber+script.lineExtent
                    && (script.isLineExecutable(lineNo, PCMAP_SOURCETEXT)
                        || script.baseLineNumber == lineNo))
                {
                    hits.push(script);
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

    addBreakpoint: function(type, url, lineNo, debuggr, script)
    {
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
            var scripts = script ? [script] : this.findScripts(url, lineNo);
            for (var i = 0; i < scripts.length; ++i)
            {
                var script = scripts[i];
                var pc = script.lineToPc(lineNo, PCMAP_SOURCETEXT);
                script.setBreakpoint(pc);
            }

            var urlBreakpoints = breakpoints[url];
            if (!urlBreakpoints)
                breakpoints[url] = urlBreakpoints = [];

            bp = {type: type, href: url, lineNo: lineNo, disabled: 0,
                    startLineNo: scripts.length ? scripts[0].baseLineNumber : -1, debuggr: debuggr,
                    condition: ""};
            urlBreakpoints.push(bp);
            ++breakpointCount;
        }

        return bp;
    },

    removeBreakpoint: function(type, url, lineNo, script)
    {
        url = denormalizeURL(url);
        var urlBreakpoints = breakpoints[url];
        if (!urlBreakpoints)
            return false;
        
        for (var i = 0; i < urlBreakpoints.length; ++i)
        {
            var bp = urlBreakpoints[i];
            if (bp.lineNo == lineNo)
            {
                bp.type &= ~type;
                if (!bp.type)
                {
                    urlBreakpoints.splice(i, 1);
                    --breakpointCount;

                    if (bp.disabled)
                        --disabledCount;
                    
                    if (bp.condition)
                    {
                        --conditionCount;
                        dispatch(debuggers, "onToggleBreakpointCondition", [url, lineNo, false]);
                    }
                    
                    if (!urlBreakpoints.length)
                        delete breakpoints[url];
                    
                    // Theoretically, there should only be one script to be found here,
                    // but due to leaks sometimes we'll have multiple scripts with the
                    // breakpoint set, so we need to be sure to clear all of them
                    jsd.enumerateScripts({enumerateScript: function(script)
                    {
                        if (script && script.fileName == url
                            && script.isLineExecutable(lineNo, PCMAP_SOURCETEXT))
                        {
                            var pc = script.lineToPc(lineNo, PCMAP_SOURCETEXT);
                            script.clearBreakpoint(pc);
                        }
                    }});
                }
                
                return true;
            }
        }

        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    breakIntoDebugger: function(debuggr, frame)
    {
        // Before we break, clear information about previous stepping session
        this.stopStepping();
        
        // Break into the debugger - execution will stop here until the user resumes
        var returned;
        try
        {
            returned = debuggr.onBreak(frame);
        }
        catch (exc)
        {
            ERROR(exc);
            returned = RETURN_CONTINUE;
        }
        
        // Execution resumes now. Check if the user requested stepping and if so
        // install the necessary hooks
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

        hookFrameCount = stepFrameCount;
        
        this.hookFunctions();
        
        if (stepMode == STEP_OVER || stepMode == STEP_INTO)
            this.hookInterrupts();
    },
    
    stopStepping: function()
    {
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

                    break;
                }
                case TYPE_FUNCTION_RETURN:
                {
                    --hookFrameCount;

                    if (hookFrameCount == 0)
                        fbs.stopStepping();
                    else if (stepMode == STEP_OVER)
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

        jsd.functionHook = { onCall: functionHook };
    },
    
    hookInterrupts: function()
    {
        function interruptHook(frame, type, rv)
        {
            // Sometimes the same line will have multiple interrupts, so check
            // a unique id for the line and don't break until it changes
            var frameLineId = hookFrameCount + frame.script.fileName + frame.line;
            if (frameLineId != stepFrameLineId)
                return fbs.onBreak(frame, type, rv);
            else
                return RETURN_CONTINUE;
        }
        
        jsd.interruptHook = { onExecute: interruptHook };
    },
        
    hookScripts: function()
    {
        jsd.scriptHook = {
            onScriptCreated: hook(this.onScriptCreated),
            onScriptDestroyed: hook(this.onScriptDestroyed)
        };

        scriptMap = {};
        jsd.enumerateScripts({enumerateScript: function(script)
        {
            var url = script.fileName;
            if (!(url in scriptMap))
                scriptMap[url] = [script];
            else
                scriptMap[url].push(script);
        }});
    },

    unhookScripts: function()
    {
        jsd.scriptHook = null;
        scriptMap = null;
    }
};

// ************************************************************************************************

var FirebugFactory =
{
    createInstance: function (outer, iid)
    {
        if (outer != null)
            throw NS_ERROR_NO_AGGREGATION;

        return (new FirebugService()).QueryInterface(iid);
    }
};

// ************************************************************************************************

var FirebugModule =
{
    registerSelf: function (compMgr, fileSpec, location, type)
    {
        compMgr = compMgr.QueryInterface(nsIComponentRegistrar);
        compMgr.registerFactoryLocation(CLASS_ID, CLASS_NAME, CONTRACT_ID, fileSpec, location, type);

        try
        {
            var jsd = DebuggerService.getService(jsdIDebuggerService);
            jsd.initAtStartup = true;
        }
        catch (exc)
        {
        }    
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

function isSystemURL(url)
{
    if (url.substr(0, 17) == "chrome://firebug/")
        return true;
    else if (url.indexOf("firebug-service.js") != -1)
        return true;
    else if (url == "XStringBundle")
        return true;
    else
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
            ERROR("Error in hook: " + exc);
            return rv;
        }
    }
}

function getFrameWindow(frame)
{
    try
    {
        var result = {};
        frame.eval("window", "", 1, result);

        var win = result.value.getWrappedValue();
        return getRootWindow(win);
    }
    catch (exc)
    {
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

function findExecutableLine(script, lineNo)
{
    var max = script.baseLineNumber + script.lineExtent;
    for (; lineNo <= max; ++lineNo)
    {
        if (script.isLineExecutable(lineNo, PCMAP_SOURCETEXT))
            return lineNo;
    }
    
    return -1;
}

function evaluateCondition(frame, condition)
{
    var result = {};
    frame.scope.refresh();
    var ok = frame.eval(condition, "", 1, result);
    return ok && !!result.value.getWrappedValue();
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
    observe: function(subject, topic, data)
    {
        if (data == "extensions.firebug.showStackTrace")
            fbs.showStackTrace =  prefs.getBoolPref("extensions.firebug.showStackTrace");
        else if (data == "extensions.firebug.breakOnErrors")
            fbs.breakOnErrors =  prefs.getBoolPref("extensions.firebug.breakOnErrors");
    }
};

var ShutdownObserver = 
{
    observe: function(subject, topic, data)
    {
        fbs.shutdown();
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
    ERROR(text);
}

function dumpit(text)
{
    var f = CC("@mozilla.org/file/local;1").createInstance(CI("nsILocalFile"));
    f.initWithPath("/dump.txt");
    
    var stream = CC("@mozilla.org/network/file-output-stream;1")
        .createInstance(CI("nsIFileOutputStream"));
    stream.init(f, 0x04 | 0x08 | 0x10, 424, 0);
    stream.write(text, text.length);
    stream.flush();
    stream.close();
}
