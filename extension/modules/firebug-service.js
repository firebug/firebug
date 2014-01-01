/* See license.txt for terms of usage */

// Debug lines are marked with  at column 120
// Use variable name "fileName" for href returned by JSD, file:/ not same as DOM
// Use variable name "url" for normalizedURL, file:/// comparable to DOM
// Convert from fileName to URL with normalizeURL
// We probably don't need denormalizeURL since we don't send .fileName back to JSD

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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
const nsIComponentRegistrar = Ci.nsIComponentRegistrar;
const nsIFactory = Ci.nsIFactory;
const nsIConsoleService = Ci.nsIConsoleService;
const nsITimer = Ci.nsITimer;
const nsITimerCallback = Ci.nsITimerCallback;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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

const NS_OS_TEMP_DIR = "TmpD";

const STEP_OVER = 1;
const STEP_INTO = 2;
const STEP_OUT = 3;
const STEP_SUSPEND = 4;

const TYPE_ONE_SHOT = nsITimer.TYPE_ONE_SHOT;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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

Cu.import("resource://firebug/prefLoader.js");

var getPref = PrefLoader.getPref;

// ********************************************************************************************* //
// Globals

//https://developer.mozilla.org/en/Using_JavaScript_code_modules
var EXPORTED_SYMBOLS = ["fbs"];

var jsd, prefs;
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

var hookFrameCount = 0;

var haltObject = null;  // For reason unknown, fbs.haltDebugger will not work.

var breakpointCount = 0;

// These are an optimization I guess, marking whether we are using this feature anywhere.
var disabledCount = 0;
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

Cu.import("resource://firebug/fbtrace.js");

// ********************************************************************************************* //

function frameId(frame, depth)
{
    if (frame)
        return frame.script.tag+"@"+frame.line+"^"+depth;
    else
        return "noIdForNoframe";
}

// xxxHonza: duplicated in lib.js, there should be a shared module with this API.
function extend(l,r)
{
    var newOb = {};
    for (var n in l)
        newOb[n] = l[n];
    for (var n in r)
        newOb[n] = r[n];
    return newOb;
}

// ********************************************************************************************* //
// jsdICallHook or jsdIExecutionHook.

var jsdHandlers =
{
    hooks: [],

    // Stage for activation when 'hook' is called
    add: function(aHook)
    {
        if (!aHook)
            ERROR("firebug-service.jsdHandlers.add: null hook");

        this.hooks.push(aHook);

        if (FBTrace.DBG_FBS_STEP)
            FBTrace.sysout("fbs.Hooks.add; " + aHook.mode + ", active hooks: " +
                this.hooks.length);
    },

    remove: function(aHook)
    {
        var i = this.hooks.indexOf(aHook);
        if (i != -1)
        {
            this.hooks.splice(i, 1);

            if (FBTrace.DBG_FBS_STEP)
                FBTrace.sysout("fbs.Hooks.remove; " + aHook.mode + ", active hooks: " +
                    this.hooks.length);
        }
        else
        {
            ERROR("firebug-service.Hooks.unhook ERROR, no such hook " +
                aHook.name, {aHook: aHook, Hooks: this});
        }
    },

    // activate hooks
    hook: function(frame)
    {
        if (FBTrace.DBG_FBS_STEP)
            FBTrace.sysout("fbs.start hooks " + this.hooks.length + " hooks active " +
                frameToString(frame), this);

        for (var i = 0; i < this.hooks.length; i++)
        {
            var aHook = this.hooks[i];

            aHook.hook(frame);

            if ("onFunctionCall" in aHook || "onFunctionReturn" in aHook)
                fbs.hookFunctions();

            if ("onInterrupt" in aHook)
                fbs.hookInterrupts(frame);
        }
    },

    unhook: function(frame)
    {
        if (FBTrace.DBG_FBS_STEP)
            FBTrace.sysout("fbs.stop hooks "+this.hooks.length+" hooks active", this);

        this.checkForUnhookFunctions(frame);
        this.checkForUnhookInterrupts(frame);
    },

    checkForUnhookFunctions: function(frame)
    {
        for (var i = 0; i < this.hooks.length; i++)
        {
            var aHook = this.hooks[i];

            aHook.unhook(frame);

            if ("onFunctionCall" in aHook || "onFunctionReturn" in aHook)
                return;
        }

        fbs.unhookFunctions();
    },

    checkForUnhookInterrupts: function(frame)
    {
        for (var i = 0; i < this.hooks.length; i++)
        {
            var aHook = this.hooks[i];

            if ("onInterrupt" in aHook)
                return;
        }

        fbs.unhookInterrupts();   // none found
    },

    dispatch: function(methodName, frame, type, rv)
    {
        for (var i = 0; i < this.hooks.length; i++)
        {
            var aHook = this.hooks[i];
            if (methodName in aHook)
            {
                if (FBTrace.DBG_FBS_STEP && FBTrace.DBG_DISPATCH)
                    FBTrace.sysout("fbs.jsdHandler.dispatch " + methodName +
                        " to " + aHook + " " + getCallFromType(type) + " frame: " +
                        frameToString(frame), this);

                var rc = aHook[methodName].apply(aHook, [frame, type, rv]);
                if (typeof(rc) != "undefined" || rc !== RETURN_CONTINUE)
                    return rc;
            }
        }

        return RETURN_CONTINUE;
    }
};

// ********************************************************************************************* //
// Break on Next

function BreakOnNextCall(debuggr, context)
{
    this.debuggr = debuggr;
    this.context = context;
}

BreakOnNextCall.prototype =
{
    mode: "BON",

    hook: function(frame)
    {
    },

    unhook: function(frame)
    {
    },

    // the frame will be running the calling script
    hit: function(frame, type)
    {
        fbs.cancelBreakOnNextCall(this.debuggr, this.context);

        var rv = {};
        return fbs.routeBreakToDebuggr(frame, type, rv, this.debuggr);
    },

    onFunctionCall: function(frame, type)
    {
        if (!this.context || !this.context.sourceFileByTag)
            return ERROR("onFunctionCall ERROR invalid context ");

        var lucky = this.context.getSourceFileByTag(frame.script.tag);
        if (!lucky) // then function running the frame is not in this context
        {
            // then we could be running an outer function from a new compilation unit
            if (!frame.callingFrame)
            {
                var val = {};

                // then the function could have just been added to the context
                if (fbs.isTopLevelScript(frame, type, val))
                    lucky = this.context.getSourceFileByTag(frame.script.tag);
            }
        }

        if (lucky) // then we hit in a function in our context
        {
            if (FBTrace.DBG_FBS_STEP)
                FBTrace.sysout("fbs.breakOnNextTopFunction hits at "+getCallFromType(type)+" at "+
                    frame.script.fileName+" tag:"+(lucky?"LUCKY WINNER":frame.script.tag),
                    framesToString(frame));

            return this.hit(frame, type);
        }

        // else maybe we hit on a event unrelated to our context
    },
};

// Stack segments
// When frame.callingFrame is null then we are starting a new stack segment
//    FrameId                        track call stack
//   segment0.fnc1  !callingFrame  !this.callingFrameId
//   segment0.fnc2                  this.callingFrameId == segment0.fnc1
//   ...
//   segment1.fnc44  !callingFrame  this.callingFrameId == fnc2.segment0
//   segment1.fnc45
//

// ********************************************************************************************* //
// Stepper: Step Out Implementation

/**
 * @class This object implements "step out" debugger feature. In other words run until
 * the current function returns, then stop in the caller.
 */
function OutStepper(debuggr, context)
{
    this.debuggr = debuggr;
    this.context = context;

    if (!this.debuggr)
        ERROR("firebug-service.OutStepper no debuggr");
}

OutStepper.prototype =
/** @lends OutStepper */
{
    mode: "STEP_OUT",

    getCallingFrameId: function(frame)
    {
        if (frame.callingFrame)
            return frameId(frame.callingFrame, this.depth);

        var debuggr = fbs.reFindDebugger(frame, this.debuggr);
        if (debuggr && debuggr.breakContext)
            return debuggr.breakContext.getName(); //  TODO segments
    },

    hook: function(frame)
    {
        this.depth = 0;

        if (frame)
        {
            this.startFrameId = frameId(frame, 0);
            this.callingFrameId = this.getCallingFrameId(frame);

            if (!this.callingFrameId)
                ERROR("OutStepper.hook cannot find callingFrame ", this);

            this.startFrameTag = frame.script.tag;
        }
        else
        {
            ERROR("OutStepper.hook no frame ");
        }

        if (FBTrace.DBG_FBS_STEP)
            FBTrace.sysout("fbs." + this.mode+" hook with frame "+frameToString(frame)+
                " with callingFrameId "+this.callingFrameId, this);

        return true;
    },

    // the frame will be running the called script
    onFunctionCall: function stepFunctionCall(frame, type)
    {
        var callingFrameId = this.getCallingFrameId(frame);

        if (this.callingFrameId === callingFrameId) // then it is our caller
        {
            this.depth++;
            this.callingFrameId = callingFrameId;  // push new id for stepFunctionReturn

            if (FBTrace.DBG_FBS_STEP)
                FBTrace.sysout("fbs." + this.mode+" stepFunctionCall new depth "+this.depth+
                    " new callingFrameId "+this.callingFrameId);
        }

        // else someone else, ignore it
    },

    // the frame will be running the called script
    onFunctionReturn: function stepFunctionReturn(frame, type)
    {
        var callingFrameId = this.getCallingFrameId(frame);
        if (this.callingFrameId === callingFrameId) // then it is our caller
        {
            if (this.depth) // but we are not back to our caller
            {
                this.depth--;
                this.callingFrameId = callingFrameId; // recursion
                return;
            }
            else // then we are back to the frame we started on
            {
                if (frame.callingFrame)
                    return this.hit(frame.callingFrame, type);

                if (FBTrace.DBG_FBS_STEP)
                    FBTrace.sysout("fbs.OutStepper.onFunctionReturn no calling frame " +
                        frameToString(frame) + ", " + getCallFromType(type), this);

                jsdHandlers.unhook(frame);  // we are done here
                jsdHandlers.remove(this);
                return;
            }
        }

        // Then we are returning with out ever calling stepFunctionCall,
        // but on a frame we care about.
        if (!this.callingFrameId && callingFrameId)
        {
            // Then are returning from the frame we care about.
            if (frame.script.tag === this.startFrameTag)
            {
                if (frame.callingFrame)
                    return this.hit(frame.callingFrame, type);
                else
                    ERROR("Should be top level just exit", this);
            }

            ERROR("Returning from a frame we care about but not one we know " +
                frameToString(frame), this);
        }

        // else it's is not a frame we care about
        if (FBTrace.DBG_FBS_STEP)
        {
            FBTrace.sysout("fbs." + this.mode + ".onFunctionReturn callingFrameId " +
                callingFrameId + " called frame " + frameToString(frame), this);
        }
    },

    unhook: function(frame)
    {
    },

    hit: function(frame, type, rv)
    {
        if (FBTrace.DBG_FBS_STEP)
        {
            FBTrace.sysout("fbs." + this.mode + " hit " + getCallFromType(type) + " at " +
                frameToString(frame), this);
        }

        var debuggr = fbs.reFindDebugger(frame, this.debuggr);
        if (debuggr)
        {
            jsdHandlers.unhook(frame);
            jsdHandlers.remove(this);

            rv = {};

            return fbs.breakIntoDebugger(debuggr, frame, type);
        }

        return ERROR("Hit but debuggr did not match "+this.debuggr.debuggerName+" in frame "+
            frameToString(frame), this);
    },

    toString: function()
    {
        if (!this.context.getName)
            FBTrace.sysout("fbs.this.context.getName ", this.context);

        return this.mode + " for "+this.context.getName();
    },
};

// ********************************************************************************************* //
// Stepper: Step Over Implementation

/**
 * @class This oject implements "step over". I's like {@link OutStepper}, but run a single
 * line in this function.
 */
function LineStepper(debuggr, context)
{
    this.context = context;
    this.debuggr = debuggr;
}

LineStepper.prototype = extend(OutStepper.prototype,
/** @lends LineStepper */
{
    mode: "STEP_OVER",

    hook: function hookLineStepper(frame)
    {
        OutStepper.prototype.hook.apply(this, arguments); // hook functions

        this.lineFrameId = frameId(frame, this.depth);
        this.stepFrameTag = frame.script.tag;

        if (FBTrace.DBG_FBS_STEP)
            FBTrace.sysout("fbs." + this.mode + ".hook " + frameToString(frame) +
                " with lineFrameId " + this.lineFrameId, this);
    },

    unhook: function unhookLineStepper(frame)
    {
        if (FBTrace.DBG_FBS_STEP)
            FBTrace.sysout("fbs." + this.mode + ".hook; unhook " + frameToString(frame));
    },

    // jsdIExecutionHook, onExecute
    onInterrupt: function stepLine(frame, type, rv)
    {
        if (this.stepFrameTag !== frame.script.tag) // then we stepped into another function
        {
            // We'd have much bettter performance if we set a new OutStepper here then remove
            // interrupt hook until it hits.
            return RETURN_CONTINUE;
        }

        // Sometimes the same line will have multiple interrupts, so check
        // a unique id for the line and don't break until it changes
        var frameLineId = frameId(frame, this.depth);

        if (FBTrace.DBG_FBS_STEP)
            FBTrace.sysout("fbs." + this.mode + " interruptHook pc:" + frame.pc +
                " frameLineId: " + frameLineId + " vs " + this.lineFrameId + " running " +
                frame.script.tag + " of " + frame.script.fileName +
                " at " + frame.line + "." + frame.pc, this);

        if (frameLineId != this.lineFrameId)
            return this.hit(frame, type, rv);
        else
            return RETURN_CONTINUE;
    },

    toString: function()
    {
        if (!this.context.getName)
            FBTrace.sysout("fbs.this.context.getName ", this.context);

        return this.mode + " for "+this.context.getName();
    },
});

// ********************************************************************************************* //
// Stepper: Step In Implementation

/**
 * @class This oject implements "step in". I's like {@link OutStepper}, but if the line
 * calls a function, stop on its first line
 */
function IntoStepper(debuggr, context)
{
    this.context = context;
    this.debuggr = debuggr;
}

IntoStepper.prototype = extend(LineStepper.prototype,
/** @lends IntoStepper */
{
    mode: "STEP_INTO",

    hook: function(frame)
    {
        LineStepper.prototype.hook.apply(this, arguments); // hook functions and interrupts
    },

    // the frame will be running the called script
    onFunctionCall: function intoFunctionCall(frame, type)
    {
        var callingFrame = frame.callingFrame;
        if (callingFrame)
        {
            // Skip functions running in the frame that is not in this context (issue 3077)
            var lucky = this.context.getSourceFileByTag(frame.script.tag);
            if (!lucky)
                return;

            // then we stepped into from our caller
            if (this.stepFrameTag === callingFrame.script.tag)
                return this.hit(frame, type);

            // else someone else, ignore it
            if (FBTrace.DBG_FBS_STEP)
                FBTrace.sysout("fbs." + this.mode + ".intoFunctionCall no match " +
                    this.stepFrameTag + " vs " + callingFrame.script.tag, this);
        }

        // else this would be a top level call, do we want to check for
        // another event from this context?
    },
});

// ********************************************************************************************* //
// Function Stepper/Tracer

/**
 * Tracer for learning about function stepping, not part of firebug
 */
function LogFunctionStepper()
{
    //xxxjjb: not defined this.initialize();
}

LogFunctionStepper.prototype =
{
    hook: function()
    {
        fbs.inDebuggerSetupStack = true;
    },

    stop: function()
    {
        delete fbs.stackDescription;
    },

    // the frame will be running the called script
    onFunctionCall: function logFunctionCall(frame, type)
    {
        if (fbs.inDebuggerSetupStack) // then we are still in the debugger set up code
            return;

        if (!fbs.stackDescription)
            fbs.stackDescription = { oldestTag: frame.script.tag, depth: 1, entries: [] };
        else
            fbs.stackDescription.depth++;

        this.logFunction(frame, type);
    },

    // the frame will be running the called script
    onFunctionReturn: function logFunctionReturn(frame, type)
    {
        if (fbs.inDebuggerSetupStack) // then we are still in the debugger set up code
        {
            if (!frame.callingFrame) // then done with setup
                delete fbs.inDebuggerSetupStack;

            return;
        }

        if (!fbs.stackDescription)
            fbs.stackDescription = { oldestTag: "Return first!", depth: 0, entries: [] };
        fbs.stackDescription.depth--;

        this.logFunction(frame, type);

        if (!frame.callingFrame)
        {
            if (FBTrace.DBG_FBS_STEP)
            {
                var diff = (fbs.stackDescription.oldestTag !== frame.script.tag);
                FBTrace.sysout("fbs.Stack ends at depth "+fbs.stackDescription.depth +
                    (diff ? " NO Match on tag " : " tags match"), fbs.stackDescription.entries);
            }

            fbs.stackDescription.entries = [];
        }

        if (!fbs.stackDescription.depth)
            delete fbs.stackDescription;
    },

    logFunction: function(frame, type)
    {
        var typeName = getCallFromType(type);
        var actualFrames = countFrames(frame);
        fbs.stackDescription.entries.push(""+fbs.stackDescription.depth+
            ": "+typeName +
            " (frameCount: "+actualFrames+") " +
            " oldestTag "+fbs.stackDescription.oldestTag+
            " running "+frame.script.tag+" of "+frame.script.fileName+" at "+
            frame.line+"."+frame.pc);
    },
};

// ********************************************************************************************* //
// Firebug Service

var fbs =
{
    initialize: function()
    {
        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("fbs.FirebugService Starting");

        fbs = this;

        this.wrappedJSObject = this;  // XXXjjb remove this and the one in debugger
        this.timeStamp = new Date();  /* explore */

        Components.utils.import("resource://firebug/debuggerHalter.js");
        fbs.debuggerHalter = debuggerHalter; // ref to a function in a file that passes the jsdIFilter

        fbs.restoreBreakpoints();

        this.onDebugRequests = 0;  // the number of times we called onError but did not call onDebug


        if (FBTrace.DBG_FBS_ERRORS)
            this.osOut("FirebugService Starting, FBTrace should be up\n");

        this.profiling = false;

        prefs = PrefService.getService(nsIPrefBranch);
        fbs.prefDomain = "extensions.firebug";
        prefs.addObserver(fbs.prefDomain, fbs, false);

        observerService = ObserverServiceFactory.getService(Ci.nsIObserverService);
        observerService.addObserver(QuitApplicationGrantedObserver, "quit-application-granted", false);
        observerService.addObserver(QuitApplicationRequestedObserver, "quit-application-requested", false);
        observerService.addObserver(QuitApplicationObserver, "quit-application", false);

        this.scriptsFilter = "all";
        this.alwayFilterURLsStarting = ["chrome://chromebug", "x-jsd:ppbuffer"];  // TODO allow override
        this.onEvalScriptCreated.kind = "eval";
        this.onTopLevelScriptCreated.kind = "top-level";
        this.onEventScriptCreated.kind = "event";
        this.onXULScriptCreated.kind = "xul";
        this.pendingXULScripts = [];

        this.onXScriptCreatedByTag = {}; // fbs functions by script tag
        this.nestedScriptStack = []; // scripts contained in leveledScript that have not been drained

        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("fbs.FirebugService Initialized");
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
                consoleService.logStringMessage("Using consoleService because " +
                    "nsIAppShellService.hiddenDOMWindow not available "+exc);

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

        try
        {
            prefs.removeObserver(fbs.prefDomain, fbs, false);
        }
        catch (exc)
        {
            FBTrace.sysout("fbs.prefs.removeObserver ERROR "+exc, exc);
        }

        try
        {
            observerService.removeObserver(QuitApplicationGrantedObserver, "quit-application-granted");
            observerService.removeObserver(QuitApplicationRequestedObserver, "quit-application-requested");
            observerService.removeObserver(QuitApplicationObserver, "quit-application");
        }
        catch (exc)
        {
            FBTrace.sysout("fbs.quit-application-observers removeObserver ERROR "+exc, exc);
        }

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
            // Seems to be the normal path...
            // FBTrace.sysout("fbs.FirebugService, attempt to exitNestedEventLoop ERROR "+exc);
        }

        // make sure to unregister all the hooks
        var hookNames = ["error", "script", "breakpoint", "debugger", "debug", "interrupt", 
            "throw", "topLevel", "function", "debug"];
        for (var i=0; i<hookNames.length; i++)
        {
            var hook = hookNames[i];
            try
            {
                jsd[hook + "Hook"] = null;
            }
            catch (exc)
            {
                FBTrace.sysout("fbs.quit-application-observers removeObserver ERROR "+exc, exc);
            }
        }
        jsd = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // nsISupports

    QueryInterface: function(iid)
    {
        if (!iid.equals(nsISupports))
            throw NS_ERROR_NO_INTERFACE;

        return this;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // nsIObserver

    observe: function(subject, topic, data)
    {
        if(topic != "nsPref:changed") return;
        fbs.obeyPrefs();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    registerClient: function(client)  // clients are essentially XUL windows
    {
        if (!client)
            throw new Error("firebug-service cannot register client: "+client);

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

    // first one in will be last one called. Returns state enabledDebugger
    registerDebugger: function(debuggrWrapper)
    {
        var debuggr = debuggrWrapper.wrappedJSObject;

        if (debuggr)
        {
            var anyDebuggers = (debuggers.length === 1);

            var i = debuggers.indexOf(debuggr);
            if (i === -1)
            {
                debuggers.push(debuggr);
                if (!anyDebuggers)
                    this.enableDebugger();
            }

            if (FBTrace.DBG_FBS_FINDDEBUGGER  || FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("fbs.registerDebugger have "+debuggers.length+
                    " after reg debuggr.debuggerName: "+debuggr.debuggerName+" we are "+
                    (enabledDebugger?"enabled":"not enabled")+" " + "On:"+(jsd?jsd.isOn:"no jsd")+
                    " jsd.pauseDepth:"+(jsd?jsd.pauseDepth:"off"));
        }
        else
        {
            var err = new Error("firebug-service debuggers must have wrappedJSObject ");
            err.debuggrWrapper = debuggrWrapper;
            throw err;
        }

        try
        {
            if (debuggr.suspendActivity)
                netDebuggers.push(debuggr);
        }
        catch(exc)
        {
        }

        try
        {
            if (debuggr.onScriptCreated) // TODO xxxjjb: I don't know who uses this, remove it?
                scriptListeners.push(debuggr);
        }
        catch(exc)
        {
        }

        return debuggers.length;  // 1.3.1 return to allow Debugger to check progress
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
            FBTrace.sysout("fbs.unregisterDebugger have "+debuggers.length+
                " after unreg debuggr.debuggerName: "+debuggr.debuggerName+" we are "+
                (enabledDebugger?"enabled":"not enabled")+" jsd.isOn:"+(jsd?jsd.isOn:"no jsd"));

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    forceGarbageCollection: function()
    {
        jsd.GC(); // Force the engine to perform garbage collection.
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    enterNestedEventLoop: function(callback)
    {
        try
        {
            dispatch(netDebuggers, "suspendActivity");
            this.activitySuspended = true;

            fbs.nestedEventLoopDepth = jsd.enterNestedEventLoop(
            {
                onNest: function()
                {
                    dispatch(netDebuggers, "resumeActivity");
                    callback.onNest();
                }
            });
        }
        catch(exc)
        {
            FBTrace.sysout("fbs.enterNestedEventLoop ERROR "+exc, exc);
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
            dispatch(netDebuggers, "suspendActivity");
            return jsd.exitNestedEventLoop();
        }
        catch (exc)
        {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("fbs: jsd.exitNestedEventLoop ERROR " + exc, exc);
        }
    },

    /**
     * We are running JS code for Firebug, but we want to break into the debugger with
     * a stack frame.
     * 
     * @param debuggr Debugger object asking for break
     * @param fnOfFrame, function(frame) to run on break
     */
    halt: function(debuggr, fnOfFrame)
    {
        if (!debuggr || !fnOfFrame)
        {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("fbs.halt call ERROR bad arguments", arguments);

            return null;
        }

        if (FBTrace.DBG_FBS_BP)
            FBTrace.sysout('fbs.halt jsd.isOn:'+jsd.isOn+' jsd.pauseDepth:'+jsd.pauseDepth+
                " fbs.isChromeBlocked "+fbs.isChromeBlocked+"  jsd.debuggerHook: "+
                jsd.debuggerHook, jsd.debuggerHook);

        // store for onDebugger
        haltObject = {haltDebugger: debuggr, haltCallBack: fnOfFrame};

        // call onDebugger via hook
        fbs.debuggerHalter();
        return fbs.haltReturnValue;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Break on Next

    // deprecated API
    // xxxjjb: BON should be entirely implemented by breakOnNextCall object, right?
    // xxxhonza: Debugger.suspend should be removed and replaced by breakOnNextCall

    suspend: function(debuggr, context)
    {
        fbs.breakOnNextCall(debuggr, context);
    },

    breakOnNextCall: function(debuggr, context)
    {
        dispatch(debuggers, "onBreakingNext", [debuggr, context]);

        if (context.breakOnNextHook)
            ERROR("firebug-service.breakOnNextCall already active ", context);

        context.breakOnNextHook = new BreakOnNextCall(debuggr, context);

        jsdHandlers.add(context.breakOnNextHook);
        jsdHandlers.hook(); // no frame arg
    },

    cancelBreakOnNextCall: function(debuggr, context)
    {
        jsdHandlers.unhook(/* no frame argument */);
        jsdHandlers.remove(context.breakOnNextHook);
        delete context.breakOnNextHook;
    },

    runUntil: function(sourceFile, lineNo, startFrame, debuggr)
    {
        // TODO per context
        runningUntil = this.addBreakpoint(BP_UNTIL, sourceFile, lineNo, null, debuggr);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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
        else
        {
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
            bp = this.addBreakpoint(BP_NORMAL, sourceFile, lineNo, null, debuggr);

        if (!bp)
            return;

        if (bp.hitCount <= 0 )
        {
            if (bp.condition && !condition)
                --conditionCount;
            else if (condition && !bp.condition)
                ++conditionCount;
        }

        bp.condition = condition;
        delete bp.transformedCondition;
        delete bp.transformedConditionDebuggr;
        delete bp.transformedConditionContext;

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
        for (var i=0; i<sourceFiles.length; ++i)
        {
            var url = sourceFiles[i].href;
            if (!url)
                continue;

            var urlBreakpointsTemp = fbs.getBreakpoints(url);

            if (FBTrace.DBG_FBS_BP)
            {
                FBTrace.sysout("fbs.clearAllBreakpoints " + url + " urlBreakpoints: " +
                    (urlBreakpointsTemp ? urlBreakpointsTemp.length : "null"));
            }

            if (!urlBreakpointsTemp)
                continue;

            // Clone before iteration the array is modified within the loop.
            var urlBreakpoints = [];
            urlBreakpoints.push.apply(urlBreakpoints, urlBreakpointsTemp);

            for (var ibp=0; ibp<urlBreakpoints.length; ibp++)
            {
                var bp = urlBreakpoints[ibp];
                this.clearBreakpoint(url, bp.lineNo);
            }
         }
    },

    // url is sourceFile.href, not jsd script.fileName
    enumerateBreakpoints: function(url, cb)
    {
        if (url)
        {
            var urlBreakpointsTemp = fbs.getBreakpoints(url);
            if (urlBreakpointsTemp)
            {
                // Clone before iteration (the array can be modified in the callback).
                var urlBreakpoints = [];
                urlBreakpoints.push.apply(urlBreakpoints, urlBreakpointsTemp);

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // error breakpoints are a way of selecting breakpoint from the Console

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
                FBTrace.sysout("fbs.setErrorBreakpoint ERROR "+exc, exc);
            }
        }
    },

    clearErrorBreakpoint: function(url, lineNo, debuggr)
    {
        var index = this.findErrorBreakpoint(url, lineNo);
        if (index != -1)
        {
            this.removeBreakpoint(BP_NORMAL | BP_ERROR, url, lineNo);

            errorBreakpoints.splice(index, 1);
            dispatch(debuggers, "onToggleErrorBreakpoint", [url, lineNo, false, debuggr]);

            // after every call to onToggleBreakpoint
            fbs.saveBreakpoints(url);
        }
    },

    clearErrorBreakpoints: function(sourceFiles, debuggr)
    {
        for (var i=0; i<sourceFiles.length; ++i)
        {
            var url = sourceFiles[i].href;
            if (!url)
                continue;

            fbs.enumerateErrorBreakpoints(url,
            {
                call: function(url, lineNo)
                {
                    fbs.clearErrorBreakpoint(url, lineNo, debuggr);
                }
            });
        }
    },

    hasErrorBreakpoint: function(url, lineNo)
    {
        return this.findErrorBreakpoint(url, lineNo) != -1;
    },

    enumerateErrorBreakpoints: function(url, cb)
    {
        // Clone breakpoints array before iteration. The callback could modify it.
        var copyBreakpoints = [];
        copyBreakpoints.push.apply(copyBreakpoints, errorBreakpoints);

        if (url)
        {
            for (var i=0; i<copyBreakpoints.length; ++i)
            {
                var bp = copyBreakpoints[i];
                if (bp.href == url)
                    cb.call(bp.href, bp.lineNo, bp);
            }
        }
        else
        {
            for (var i=0; i<copyBreakpoints.length; ++i)
            {
                var bp = copyBreakpoints[i];
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // JSD Handlers

    addHandler: function(handler)
    {
        jsdHandlers.add(handler);
        jsdHandlers.hook();
    },

    removeHandler: function(handler)
    {
        // First remove the hook and then call unhook. The 'unhook' function
        // checks for registered handlers and removes various JSD hooks only, if there
        // are no corresponding handlers.
        jsdHandlers.remove(handler);
        jsdHandlers.unhook();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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
        // set a breakpoint on the starting point
        var bp = this.monitor(sourceFile, lineNo, debuggr);
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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
        if (profileCount == 0)
            return -1;
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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
                FBTrace.sysout("fbs.enableDebugger gets jsd service, isOn:" + jsd.isOn +
                    " initAtStartup:" + jsd.initAtStartup + " now have " + debuggers.length +
                    " debuggers in " + clients.length + " clients");

            // This property has been removed from Fx40
            if (jsd.initAtStartup)
                jsd.initAtStartup = false;
        }

        if (jsd.asyncOn) // then FF 4.0+
        {
            if (!jsd.isOn)
            {
                if (FBTrace.DBG_ACTIVATION)
                {
                    var startAsyncOn = new Date().getTime();
                    FBTrace.sysout("fbs.activation begin jsd.asyncOn " + startAsyncOn);
                }

                jsd.asyncOn(  // turn on jsd for the next event
                {
                    onDebuggerActivated: function doDebuggerActivated()
                    {
                        // now we are in the next event and jsd is on.
                        if (FBTrace.DBG_ACTIVATION)
                        {
                            var nowAsyncOn = new Date().getTime();
                            FBTrace.sysout("fbs.activation now we are in the " +
                                "next event and JSD is ON " + nowAsyncOn + " delta: " +
                                (nowAsyncOn - startAsyncOn) + "ms");
                        }

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
                    FBTrace.sysout("fbs.Firefox 3.6 or earlier");

                jsd.on(); // this should be the only call to jsd.on().
                fbs.onDebuggerActivated();
            }
            fbs.onJSDebuggingActive();
        }
    },

    onDebuggerActivated: function()
    {
        jsd.flags |= DISABLE_OBJECT_TRACE;

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("fbs.onDebuggerActivated");

        if (jsd.pauseDepth && FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("fbs.enableDebugger found non-zero jsd.pauseDepth !! " +
                jsd.pauseDepth);
    },

    onJSDebuggingActive: function()
    {
        if (!this.filterChrome)
            this.createChromeBlockingFilters();

        var active = fbs.isJSDActive();

        dispatch(clients, "onJSDActivate", [active, "fbs enableDebugger"]);
        this.hookScripts();

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("fbs.enableDebugger with active " + active);
    },

    obeyPrefs: function()
    {
        fbs.showStackTrace = getPref("showStackTrace");
        fbs.breakOnErrors = getPref("breakOnErrors");
        fbs.trackThrowCatch = getPref("trackThrowCatch");

        var pref = fbs.scriptsFilter;
        fbs.scriptsFilter = getPref("scriptsFilter");
        var mustReset = (pref !== fbs.scriptsFilter);

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("fbs.obeyPrefs mustReset = " + mustReset + " pref: " + pref +
                " fbs.scriptsFilter: " + fbs.scriptsFilter, fbs);

        pref = fbs.filterSystemURLs;

        // may not be exposed to users
        fbs.filterSystemURLs = getPref("filterSystemURLs");
        mustReset = mustReset || (pref !== fbs.filterSystemURLs);

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("fbs.obeyPrefs mustReset = " + mustReset + " pref: " + pref +
                " fbs.filterSystemURLs: " + fbs.filterSystemURLs);

        if (mustReset && jsd && jsd.scriptHook)
        {
            fbs.unhookScripts();
            fbs.hookScripts();
        }

        if (FBTrace.DBG_FBS_FUNCTION)
        {
            fbs.loggingFunctionCalls = new LogFunctionStepper();
            jsdHandlers.add(fbs.loggingFunctionCalls);
            jsdHandlers.hook(); // no frame argument
        }
        else if (fbs.loggingFunctionCalls)
        {
            jsdHandlers.unhook("no frame argument");
            fbs.jsdHandler.remove(fbs.loggingFunctionCalls);
            delete fbs.loggingFunctionCalls;
        }

        FirebugPrefsObserver.syncFilter();

        try
        {
            if (FBTrace.DBG_OPTIONS)
                FBTrace.sysout("fbs.obeyPrefs showStackTrace:"+fbs.showStackTrace+
                    " breakOnErrors:"+fbs.breakOnErrors+" trackThrowCatch:"+fbs.trackThrowCatch+
                    " scriptFilter:"+fbs.scriptsFilter+" filterSystemURLs:"+fbs.filterSystemURLs);
        }
        catch (exc)
        {
            FBTrace.sysout("fbs.constructor getBoolPrefs FAILED with exception=", exc);
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

            jsd.off();
        }

        var active = fbs.isJSDActive();
        dispatch(clients, "onJSDDeactivate", [active, "fbs disableDebugger"]);

        fbs.onXScriptCreatedByTag = {};  // clear any uncleared top level scripts

        if (FBTrace.DBG_FBS_FINDDEBUGGER || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("fbs.disableDebugger jsd.isOn:"+jsd.isOn+" for enabledDebugger: "+
                enabledDebugger);
    },

    // must support multiple calls
    pause: function(debuggerName)
    {
        if (!enabledDebugger || !jsd || !jsd.isOn)
            return "not enabled";

        var rejection = [];
        dispatch(clients, "onPauseJSDRequested", [rejection, debuggerName]);

        // Number of rejections:
        // 0 - then everyone wants to pause
        // 1 - then everyone wants to pause (including the current active tab)
        if (rejection.length < 1)
        {
            if (jsd.pauseDepth == 0)  // don't pause if we are paused.
            {
                jsd.pause();
                fbs.unhookScripts();
            }

            var active = fbs.isJSDActive();
            dispatch(clients, "onJSDDeactivate", [active, "pause depth "+jsd.pauseDepth]);
        }
        else // we don't want to pause
        {
            fbs.unPause(true);
        }

        if (FBTrace.DBG_FBS_FINDDEBUGGER || FBTrace.DBG_ACTIVATION)
        {
            FBTrace.sysout("fbs.pause depth "+(jsd.isOn?jsd.pauseDepth:"jsd OFF")+" rejection "+
                rejection.length+" from "+clients.length+" clients ", rejection);

            // The next line gives NS_ERROR_NOT_AVAILABLE
            // FBTrace.sysout("fbs.pause depth "+(jsd.isOn?jsd.pauseDepth:"jsd OFF")+
            //    " rejection "+rejection.length+" from clients "+clients, rejection);
        }
        return jsd.pauseDepth;
    },

    unPause: function(force)
    {
        if (!jsd)
            return;

        if (jsd.pauseDepth > 0 || force)
        {
            if (FBTrace.DBG_ACTIVATION && (!jsd.isOn || jsd.pauseDepth == 0) )
                FBTrace.sysout("fbs.unpause while jsd.isOn is "+jsd.isOn+
                    " and hooked scripts pauseDepth:"+jsd.pauseDepth);

            fbs.hookScripts();

            if(jsd.pauseDepth)
                var depth = jsd.unPause();

            var active = fbs.isJSDActive();

            if (FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("fbs.unPause hooked scripts and unPaused, active:" + active +
                    " depth " + depth + " jsd.isOn: " + jsd.isOn);

            dispatch(clients, "onJSDActivate", [active, "unpause depth"+jsd.pauseDepth]);
        }
        else  // we were not paused.
        {
            if (FBTrace.DBG_ACTIVATION)
            {
                var noAction = "("+jsd.pauseDepth+" || "+ !jsd.isOn+")";
                FBTrace.sysout("fbs.unPause no action: (jsd.pauseDepth || !jsd.isOn) = " +
                    noAction);
            }
        }

        return jsd.pauseDepth;
    },

    isJSDActive: function()
    {
        return (jsd && jsd.isOn && (jsd.pauseDepth === 0) );
    },

    // TODO delete once Chromebug works on BTI
    // re-transmit the message (string) with args [objs] to XUL windows.
    broadcast: function(message, args)
    {
        dispatch(clients, message, args);
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("fbs.broadcast "+message+" to "+clients.length+" clients", clients);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    normalizeURL: function(url)
    {
        // For some reason, JSD reports file URLs like "file:/" instead of "file:///", so they
        // don't match up with the URLs we get back from the DOM
        return url ? url.replace(/file:\/([^\/])/, "file:///$1") : "";
    },

    denormalizeURL: function(url)
    {
        // This should not be called.
        return url ? url.replace(/file:\/\/\//, "file:/") : "";
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // jsd Hooks

    // When engine encounters debugger keyword (only)
    onDebugger: function(frame, type, rv)
    {
        if (FBTrace.DBG_FBS_BP)
            FBTrace.sysout("fbs.onDebugger with haltDebugger="+
                (haltObject?haltObject.haltDebugger:"null")+" in "+frame.script.fileName,
                frame.script);

        try
        {
            if (FBTrace.DBG_FBS_SRCUNITS && fbs.isTopLevelScript(frame, type, rv))
                FBTrace.sysout("fbs.onDebugger found topLevelScript "+ frame.script.tag);

            if (FBTrace.DBG_FBS_SRCUNITS && fbs.isNestedScript(frame, type, rv))
                FBTrace.sysout("fbs.onDebugger found nestedScript "+ frame.script.tag);

            if (haltObject)
            {
                var peelOurselvesOff = frame;
                if (peelOurselvesOff.script.fileName.indexOf("debuggerHalter.js") > 0)
                    peelOurselvesOff = frame.callingFrame;  // remove debuggerHalter()

                while (peelOurselvesOff && (peelOurselvesOff.script.fileName.indexOf("firebug-service.js") > 0 ))
                    peelOurselvesOff = peelOurselvesOff.callingFrame;

                while (peelOurselvesOff && (peelOurselvesOff.script.fileName.indexOf("/debugger.js") > 0 ))
                    peelOurselvesOff = peelOurselvesOff.callingFrame;

                if (peelOurselvesOff)
                {
                    if (FBTrace.DBG_FBS_BP)
                        FBTrace.sysout("fbs.onDebugger, " +
                            (haltObject.haltCallBack ? "with" : "without") +
                            " callback, adjusted newest frame: " + peelOurselvesOff.line +
                            "@" + peelOurselvesOff.script.fileName + " frames: ",
                            framesToString(frame));

                    var debuggr = haltObject.haltDebugger;
                    var callback = haltObject.haltCallBack;
                    fbs.haltReturnValue = callback.apply(debuggr,[peelOurselvesOff]);
                }
                else
                {
                    FBTrace.sysout("fbs.halt ERROR "+framesToString(frame));
                    fbs.haltReturnValue = "firebug-service.halt ERROR, no stack frames left ";
                }

                return RETURN_CONTINUE;
            }
            else
            {
                var peelOurselvesOff = frame;
                if (peelOurselvesOff.script.fileName.indexOf("consoleExposed.js") > 0)
                    peelOurselvesOff = frame.callingFrame;

                var bp = this.findBreakpointByScript(peelOurselvesOff.script, peelOurselvesOff.pc);

                // then breakpoints override debugger statements (to allow conditional
                // debugger statements);
                if (bp)
                    return this.onBreakpoint(peelOurselvesOff, type, rv);
                else
                    return fbs.routeBreakToDebuggr(peelOurselvesOff, type, rv);
            }
        }
        catch(exc)
        {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("fbs.onDebugger failed: "+exc,exc);

            ERROR("onDebugger failed: "+exc, exc);
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
            FBTrace.sysout("fbs.onDebug (" + fbs.onDebugRequests + ") fileName=" +
                frame.script.fileName + " reportNextError=" + reportNextError +
                " breakOnErrors:" + this.breakOnErrors + " fbs.breakOnDebugCall: " +
                fbs.breakOnDebugCall);
        }

        if (isFilteredURL(frame.script.fileName))
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
                    var hookReturn = debuggr.onError(frame, errorInfo, fbs.breakOnDebugCall);
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
                if (fbs.isTopLevelScript(frame, type, rv) && FBTrace.DBG_FBS_SRCUNITS)
                    FBTrace.sysout("fbs.onDebug found topLevelScript "+ frame.script.tag);

                if (fbs.isNestedScript(frame, type, rv) && FBTrace.DBG_FBS_SRCUNITS)
                    FBTrace.sysout("fbs.onDebug found nestedScript "+ frame.script.tag);

                breakOnNextError = false;
                delete fbs.breakOnDebugCall;

                if (debuggr)
                    return this.breakIntoDebugger(debuggr, frame, type);
            }
        }
        catch (exc)
        {
            ERROR("onDebug failed: "+exc);
        }

        return RETURN_CONTINUE;
    },

    onBreakpoint: function(frame, type, val)
    {
        if (fbs.isTopLevelScript(frame, type, val))
        {
            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("fbs.onBreakpoint isTopLevel returning " + RETURN_CONTINUE);

            return RETURN_CONTINUE;
        }

        var bp = this.findBreakpointByScript(frame.script, frame.pc);
        if (bp)
        {
            var theDebugger = fbs.getDebuggerByName(bp.debuggerName);
            if (!theDebugger)
                theDebugger = this.findDebugger(frame);  // sets debuggr.breakContext

            var currFrameId = frameId(frame, 0);

            // See issue 1179, should not break if we resumed from a single
            // step and have not advanced.
            // Only break on a breakpoint if a single-step didn't start on
            // the current line (issue 1098)
            for (var i=0; i<jsdHandlers.hooks.length; i++)
            {
                var handler = jsdHandlers.hooks[i];
                if (handler.startFrameId == currFrameId)
                    return RETURN_CONTINUE;
            }

            if (disabledCount || monitorCount || conditionCount || runningUntil)
            {
                if (FBTrace.DBG_FBS_BP)
                {
                    FBTrace.sysout("fbs.onBreakpoint("+getExecutionStopNameFromType(type)+
                        ") disabledCount:"+disabledCount+" monitorCount:"+monitorCount+
                        " conditionCount:"+conditionCount+" runningUntil:"+runningUntil, bp);
                }

                if (bp.type & BP_ERROR)
                    return RETURN_CONTINUE; // if onError gets called, then we will break

                if (bp.type & BP_MONITOR && !(bp.disabled & BP_MONITOR))
                {
                    if (bp.type & BP_TRACE && !(bp.disabled & BP_TRACE) )
                        this.hookCalls(theDebugger.onFunctionCall, true);  // TODO
                    else
                        theDebugger.onMonitorScript(frame);
                }

                if (bp.type & BP_UNTIL)  // then we hit the runningUntil breakpoint
                {
                    if (runningUntil)
                    {
                        this.removeBreakpoint(BP_UNTIL, runningUntil.href, runningUntil.lineNo);
                        runningUntil = null;
                    }
                    else
                    {
                        if (FBTrace.DBG_FBS_ERRORS)
                            FBTrace.sysout("fbs.BP_UNTIL but not runningUntil!", bp);
                    }

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
            else
            {
                // not special, just break for sure
                return this.breakIntoDebugger(theDebugger, frame, type);
            }
        }
        else
        {
            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("fbs.onBreakpoint(" + getExecutionStopNameFromType(type) +
                    ") NO bp match with frame.script.tag=" + frame.script.tag +
                    " clearing and continuing");

            // We did not find a logical breakpoint to match the one set into JSD, so stop trying.
            frame.script.clearBreakpoint(frame.pc);
            return RETURN_CONTINUE;
        }

        if (runningUntil)
            return RETURN_CONTINUE;
        else
            return fbs.routeBreakToDebuggr(frame, type, val);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onThrow: function(frame, type, rv)
    {
        if (isFilteredURL(frame.script.fileName))
            return RETURN_CONTINUE_THROW;

        if (rv && rv.value && rv.value.isValid)
        {
            var value = rv.value;
            if (value.jsClassName == "Error" && value.stringValue.indexOf("too much recursion") !== -1)
            {
                if (fbs._lastErrorCaller)
                {
                    // then are unwinding recursion
                    if (fbs._lastErrorCaller == frame.script.tag)
                    {
                        fbs._lastErrorCaller =
                            frame.callingFrame ? frame.callingFrame.script.tag : null;

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

        if (fbs.showStackTrace)
        {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("fbs.onThrow from tag:" + frame.script.tag + ":" +
                    frame.script.fileName + "@" + frame.line + ": " + frame.pc);

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

            FBTrace.sysout("fbs.onError ("+fbs.onDebugRequests+") with this.showStackTrace="+
                this.showStackTrace+" and this.breakOnErrors="+this.breakOnErrors+" kind="+
                messageKind+" msg="+message+"@"+fileName+":"+lineNo+"."+pos,
                (exc ? exc.getWrappedValue() : "No exc object"));
        }

        delete fbs.breakOnDebugCall;

        if (exc)
        {
            var exception = exc.getWrappedValue();
            fbs.enumerateErrorBreakpoints(exception.fileName, {call: function breakIfMatch(url, lineNo, bp)
            {
                // An error breakpoint is in this file
                if (exception.lineNumber == bp.lineNo)
                {
                    fbs.breakOnDebugCall = true;

                    if (FBTrace.DBG_FBS_ERRORS)
                        FBTrace.sysout("fbs.onError setting breakOnDebugCall for " + url + "@" +
                            exception.lineNumber);
                }
            }});
        }

        // Global to pass info to onDebug. Some duplicate values to support different apis
        // Do not store the exception object itself |exc|, errofInfo is a global variable
        // and it would keep the page (that is producing the error) in the memory
        // (see bug 669730)
        errorInfo = { errorMessage: message, sourceName: fileName, lineNumber: lineNo,
                message: message, fileName: fileName, lineNo: lineNo,
                columnNumber: pos, flags: flags, category: "js", errnum: errnum };

        if (message == "out of memory")  // bail
        {
            if (FBTrace.DBG_FBS_ERRORS)
                fbs.osOut("fbs.onError sees out of memory "+fileName+":"+lineNo+"\n");
            return true;
        }

        reportNextError = { fileName: fileName, lineNo: lineNo };

        if (FBTrace.DBG_FBS_ERRORS)
            fbs.onDebugRequests++;

        return false; // Drop into onDebug, sometimes only
    },

    onTopLevel: function(frame, type)
    {
        if (FBTrace.DBG_TOPLEVEL)
            FBTrace.sysout("fbs.onTopLevel " + getCallFromType(type) + " with delegate " +
                fbs.onTopLevelDelegate + " " + frame.script.tag + " " + frame.script.fileName);

        if (fbs.onTopLevelDelegate)
            fbs.onTopLevelDelegate(frame, type);
    },

    isTopLevelScript: function(frame, type, val)
    {
        var scriptTag = frame.script.tag;

        if (FBTrace.DBG_FBS_SRCUNITS)
            FBTrace.sysout("fbs.isTopLevelScript frame.script.tag="+frame.script.tag );

        if (scriptTag in this.onXScriptCreatedByTag)
        {
            if (FBTrace.DBG_FBS_TRACKFILES)
                trackFiles.def(frame);

            var onXScriptCreated = this.onXScriptCreatedByTag[scriptTag];

            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("fbs.isTopLevelScript(" + getExecutionStopNameFromType(type) +
                    ") with frame.script.tag=" + frame.script.tag + " onXScriptCreated:" +
                    onXScriptCreated.kind);

            delete this.onXScriptCreatedByTag[scriptTag];
            frame.script.clearBreakpoint(0);

            try
            {
                var sourceFile = onXScriptCreated(frame, type, val);
            }
            catch (e)
            {
                FBTrace.sysout("fbs.isTopLevelScript called onXScriptCreated and " +
                    "it didn't end well:", e);
            }

            if (FBTrace.DBG_FBS_SRCUNITS)
            {
                var msg = "Top Scripts Uncleared:";
                for (var p in this.onXScriptCreatedByTag)
                    msg += (p + "|");
                FBTrace.sysout(msg);
            }

            if (!sourceFile || !sourceFile.breakOnZero || sourceFile.breakOnZero != scriptTag)
            {
                return true;
            }
            else
            {
               // sourceFile.breakOnZero matches the script we have halted.
               if (FBTrace.DBG_FBS_BP)
                   FBTrace.sysout("fbs.isTopLevelScript breakOnZero, continuing for " +
                    "user breakpoint");
            }
        }

        return false;
    },

    /**
     * If true, emergency bailout: a frame is running a script which has not been
     * processed as source
     */
    isNestedScript: function(frame, type, val)
    {
        if (fbs.nestedScriptStack.length === 0 ||
            fbs.nestedScriptStack.indexOf(frame.script) === -1)
        {
            return false;
        }

        try
        {
            var sourceFile = fbs.onTopLevelScriptCreated(frame, type, val);
        }
        catch (e)
        {
            FBTrace.sysout("fbs.isNestedScript called onXScriptCreated and it didn't end well:", e);
        }

        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onXULScriptCreated: function(frame, type, val, noNestTest)
    {
        // A XUL script hit a breakpoint
        try
        {
            var outerScript = frame.script;
            var innerScripts = [];
            for (var i=0; i<fbs.pendingXULScripts.length; i++)
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

                var sourceFile = debuggr.onXULScriptCreated(frame, outerScript,
                    innerScriptEnumerator);
                fbs.resetBreakpoints(sourceFile, debuggr);
            }
            else
            {
                if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
                    FBTrace.sysout("fbs.onEventScriptCreated no debuggr for " + frame.script.tag +
                        ":" + frame.script.fileName);
            }
        }
        catch(exc)
        {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("fbs.onXULScriptCreated ERROR " + exc, exc);
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
                    // In onScriptCreated we saw a script with baseLineNumber = 1.
                    // We marked it as event and nested.
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
                            FBTrace.sysout("fbs.onEventScriptCreated no nestedScriptStack: " +
                                script.tag + "@(" + script.baseLineNumber + "-" +
                                (script.baseLineNumber+script.lineExtent) + ")" +
                                script.fileName);

                            try
                            {
                                FBTrace.sysout(script.functionSource);
                            }
                            catch (exc)
                            {
                                /*Bug 426692 */
                            }
                        }
                    }
                }

                var debuggr = fbs.findDebugger(frame);  // sets debuggr.breakContext
                if (debuggr)
                {
                    var sourceFile = debuggr.onEventScriptCreated(frame, frame.script,
                        fbs.getNestedScriptEnumerator());
                    fbs.resetBreakpoints(sourceFile, debuggr);
                }
                else
                {
                    if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
                        FBTrace.sysout("fbs.onEventScriptCreated no debuggr for " +
                            frame.script.tag + ":" + frame.script.fileName);
                }
            }
            catch(exc)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("fbs.onEventScriptCreated failed: " + exc, exc);
            }

            if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
                FBTrace.sysout("fbs.onEventScriptCreated frame.script.tag:" + frame.script.tag +
                    " href: " + (sourceFile ? sourceFile.href : "no sourceFile"), sourceFile);
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
                    if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
                        FBTrace.sysout("fbs.No calling Frame for eval frame.script.fileName:" +
                            frame.script.fileName);

                    // These are eval-like things called by native code. They come from .xml files
                    // They should be marked as evals but we'll treat them like event handlers for now.
                    return fbs.onEventScriptCreated(frame, type, val, true);
                }

                // In onScriptCreated we found a no-name script, set a bp in PC=0, and a flag.
                // onBreakpoint saw the flag, cleared the flag, and sent us here.
                // Start by undoing our damage
                var outerScript = frame.script;

                // sets debuggr.breakContext
                var debuggr = fbs.findDebugger(frame);
                if (debuggr)
                {
                    var sourceFile = debuggr.onEvalScriptCreated(frame, outerScript,
                        fbs.getNestedScriptEnumerator());
                    fbs.resetBreakpoints(sourceFile, debuggr);
                }
                else
                {
                    if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
                        FBTrace.sysout("fbs.onEvalScriptCreated no debuggr for " +
                            outerScript.tag + ":" + outerScript.fileName);
                }
            }
            catch (exc)
            {
                ERROR("onEvalScriptCreated failed: "+exc);

                if (FBTrace.DBG_FBS_ERRORS)
                    FBTrace.sysout("fbs.onEvalScriptCreated failed:", exc);
            }
        }

        fbs.clearNestedScripts();

        if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
            FBTrace.sysout("fbs.onEvalScriptCreated outerScript.tag:" + outerScript.tag +
                " href: " + (sourceFile ? sourceFile.href : "no sourceFile"));

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
                        FBTrace.sysout("fbs.onTopLevelScriptCreated clear bp@0 for " +
                            "firstScript.tag: " + firstScript.tag);
                }
            }

            // On compilation of a top-level (global-appending) function.
            // After this top-level script executes we lose the jsdIScript so we can't
            // build its line table. Therefore we need to build it here.

            // sets debuggr.breakContext
            var debuggr = fbs.findDebugger(frame);
            if (debuggr)
            {
                var sourceFile = debuggr.onTopLevelScriptCreated(frame, frame.script,
                    fbs.getNestedScriptEnumerator());

                if (FBTrace.DBG_FBS_SRCUNITS)
                    FBTrace.sysout("fbs.onTopLevelScriptCreated got sourceFile:" + sourceFile +
                        " using " + fbs.nestedScriptStack.length + " nestedScripts");

                fbs.resetBreakpoints(sourceFile, debuggr);
            }
            else
            {
                // modules end up here?
                if (FBTrace.DBG_FBS_SRCUNITS)
                    FBTrace.sysout("fbs.onTopLevelScriptCreated no debuggr for " + frame.script.tag);
            }
        }
        catch (exc)
        {
            FBTrace.sysout("fbs.onTopLevelScriptCreated FAILED: " + exc, exc);
            ERROR("onTopLevelScriptCreated ERROR: " + exc);
        }

        fbs.clearNestedScripts();

        if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
            FBTrace.sysout("fbs.onTopLevelScriptCreated script.tag:" + frame.script.tag +
                " href: " + (sourceFile ? sourceFile.href : "no sourceFile"));

        return sourceFile;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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
        for (var i=0; i<innerScripts.length; i++)
        {
            var script = innerScripts[i];
            if (script.isValid && script.baseLineNumber == 1)
            {
                // Clear helper breakpoints that are set automatically when a new script
                // is created. But avoid cases where the user has a breakpoint on the
                // first line in a function (issue 3985).
                if (!fbs.findBreakpointByScript(script, 0))
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
                FBTrace.sysout("fbs.onScriptCreated " + script.tag +
                    ", but no fbs for script.fileName=" + script.fileName);
             return;
        }

        try
        {
            var fileName = script.fileName;

            if (FBTrace.DBG_FBS_TRACKFILES)
                trackFiles.add(fileName);

            if (isFilteredURL(fileName) || fbs.isChromebug(fileName))
            {
                try
                {
                    if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
                        FBTrace.sysout("fbs.onScriptCreated " + script.tag +
                            ": filename filtered:\'" +
                            fileName + "\'" + (fbs.filterConsoleInjections ?
                            " console injection" : ""));
                }
                catch (exc)
                {
                    FBTrace.sysout("fbs.onScriptCreated " + script.tag + " filtered msg ERROR \'" +
                        script.fileName+"\'"); /*? Bug 426692 */
                }

                if (FBTrace.DBG_FBS_TRACKFILES)
                    trackFiles.drop(fileName);

                return;
            }

            if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS)
                FBTrace.sysout("fbs.onScriptCreated: " + script.tag + "@(" + script.baseLineNumber +
                    "-" + (script.baseLineNumber+script.lineExtent) + ")" + script.fileName);

            if (script.lineExtent > 80000 && FBTrace.DBG_FBS_SRCUNITS)
                FBTrace.sysout("fbs.BOGUS line extent (" + script.lineExtent +
                    ") for " + script.fileName);

            if (FBTrace.DBG_FBS_CREATION)
            {
                try
                {
                    FBTrace.sysout("fbs.onScriptCreated: \'"+script.functionName+"\'",
                        script.functionSource);
                }
                catch (exc)
                {
                    FBTrace.sysout("fbs.onScriptCreated " + script.tag + " ERROR \'" +
                        script.fileName + "\'"); /*? Bug 426692 */
                }
            }

            var functionName;
            try
            {
                // Accessing the 'functionName' property can throw an exception
                // if weird characters are used (see issue 6493)
                functionName = script.functionName;
            }
            catch (err)
            {
                FBTrace.sysout("fbs.onScriptCreated; ERROR failed to get functionName", err);
                functionName = "<unknown>";
            }

            if (reXUL.test(script.fileName))
            {
                fbs.onXScriptCreatedByTag[script.tag] = fbs.onXULScriptCreated;
                fbs.pendingXULScripts.push(script);

                // Stop in the first one called and assign all with this fileName to sourceFile.
                script.setBreakpoint(0);
            }
            else if (!functionName) // top or eval-level
            {
                // We need to detect eval() and grab its source.
                var hasCaller = fbs.createdScriptHasCaller();
                if (FBTrace.DBG_FBS_SRCUNITS)
                    FBTrace.sysout("fbs.top or eval case createdScriptHasCaller " + hasCaller);

                if (hasCaller)
                {
                    // components end up here
                    fbs.onXScriptCreatedByTag[script.tag] = this.onEvalScriptCreated;
                }
                else
                {
                    fbs.onXScriptCreatedByTag[script.tag] = this.onTopLevelScriptCreated;
                }

                script.setBreakpoint(0);

                if (FBTrace.DBG_FBS_CREATION || FBTrace.DBG_FBS_SRCUNITS || FBTrace.DBG_FBS_BP)
                {
                    FBTrace.sysout("fbs.onScriptCreated: set BP at PC 0 in " +
                        (hasCaller ? "eval" : "top") + " level tag=" + script.tag + ":" +
                        script.fileName + " jsd depth:" + (jsd.isOn ? jsd.pauseDepth +
                        "" : "OFF"));
                }
            }
            else if (script.baseLineNumber == 1)
            {
                // could be a 1) Browser-generated event handler or
                // 2) a nested script at the top of a file
                // One way to tell is assume both then wait to see which we hit first:
                // 1) bp at pc=0 for this script or 2) for a top-level on at the same filename

                if (FBTrace.DBG_FBS_SRCUNITS)
                {
                    var hasCaller = fbs.createdScriptHasCaller();
                    FBTrace.sysout("fbs.browser generated createdScriptHasCaller " + hasCaller);
                }

                fbs.onXScriptCreatedByTag[script.tag] = this.onEventScriptCreated; // for case 1
                script.setBreakpoint(0);

                fbs.nestedScriptStack.push(script);  // for case 2

                if (FBTrace.DBG_FBS_CREATION)
                    FBTrace.sysout("fbs.onScriptCreated: set BP at PC 0 in event level tag=" +
                        script.tag);
            }
            else
            {
                fbs.nestedScriptStack.push(script);

                if (FBTrace.DBG_FBS_CREATION)
                    FBTrace.sysout("fbs.onScriptCreated: nested function named: " +
                        functionName);

                dispatch(scriptListeners, "onScriptCreated", [script, fileName, script.baseLineNumber]);
            }
        }
        catch(exc)
        {
            ERROR("onScriptCreated failed: " + exc);
            FBTrace.sysout("fbs.onScriptCreated failed:", exc);
        }
    },

    createdScriptHasCaller: function()
    {
        if (FBTrace.DBG_FBS_SRCUNITS)
            dumpComponentsStack("createdScriptHasCaller ");

        // createdScriptHasCaller
        var frame = Components.stack;

        // onScriptCreated
        frame = frame.caller;
        if (!frame)
            return frame;

        // hook apply
        frame = frame.caller;
        if (!frame)
            return frame;

        // native interpret?
        frame = frame.caller;
        if (!frame)
            return frame;

        // our creator ... or null if we are top level
        frame = frame.caller;
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
            FBTrace.sysout("fbs.onScriptDestroyed failed: ", exc);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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
            jsd.appendFilter(this.noFilterTrace);  // must be second
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
                this.traceFilters("setChromeBlockingFilters with " +
                    this.componentFilters.length + " component filters");
        }
    },

    removeChromeBlockingFilters: function()
    {
        try
        {
            if (fbs.isChromeBlocked)
            {
                if (!this.filterChrome)
                    FBTrace.sysout("fbs.removeChromeBlockingFilters is confused ", this);

                jsd.removeFilter(this.filterChrome);
                jsd.removeFilter(this.filterComponents);
                jsd.removeFilter(this.filterFirebugComponents);
                jsd.removeFilter(this.filterModules);
                jsd.removeFilter(this.filterStringBundle);
                jsd.removeFilter(this.filterPrettyPrint);
                jsd.removeFilter(this.filterWrapper);
                jsd.removeFilter(this.noFilterHalter);
                jsd.removeFilter(this.noFilterTrace);

                for (var i = 0; i < this.componentFilters.length; i++)
                    jsd.removeFilter(this.componentFilters[i]);

                fbs.isChromeBlocked = false;
            }
        }
        catch (err)
        {
            FBTrace.sysout("fbs.removeChromeBlockingFilters; EXCEPTION " + err, err);
        }

        if (FBTrace.DBG_FBS_BP)
            this.traceFilters("removeChromeBlockingFilters");
    },

    // call after components are loaded.
    createChromeBlockingFilters: function()
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
            this.noFilterTrace = this.createFilter("chrome://firebug/content/console/consoleExposed.js", true);

            // jsdIFilter does not allow full regexp matching.
            // So to filter components, we filter their directory names, which we obtain
            // by looking for scripts that match regexps

            var componentsUnfound = [];
            for (var i=0; i<COMPONENTS_FILTERS.length; ++i)
                componentsUnfound.push(COMPONENTS_FILTERS[i]);

            this.componentFilters = [];

            jsd.enumerateScripts( {
                enumerateScript: function(script)
                {
                    var fileName = script.fileName;
                    for (var i=0; i<componentsUnfound.length; ++i)
                    {
                        if (componentsUnfound[i].test(fileName))
                        {
                            var match = componentsUnfound[i].exec(fileName);
                            fbs.componentFilters.push(fbs.createFilter(match[1]));
                            componentsUnfound.splice(i, 1);
                            return;
                        }
                    }
                }
            });
        }
        catch (exc)
        {
            FBTrace.sysout("fbs.createChromeblockingFilters ERROR >>>>>>>>>>>>>>>>> "+exc, exc);
        }

        if (FBTrace.DBG_FBS_BP)
        {
            FBTrace.sysout("fbs.createChromeBlockingFilters considered "+COMPONENTS_FILTERS.length+
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
            FBTrace.sysout("fbs.jsdIFilter "+filter.urlPattern, filter);
        }});
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    eachJSContext: function(callback)
    {
        var enumeratedContexts = [];
        jsd.enumerateContexts({ enumerateContext: function(jscontext)
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
                    FBTrace.sysout("fbs.getJSContexts jsIContext tag:"+jscontext.tag+
                        (jscontext.isValid?" - isValid\n":" - NOT valid\n"));

                if (global)
                {
                    callback(global, jscontext.tag);
                }
                else
                {
                    if (FBTrace.DBG_FBS_JSCONTEXTS)
                        FBTrace.sysout("fbs.getJSContexts no global object tag:"+jscontext.tag);
                    return; // skip this
                }

                enumeratedContexts.push(jscontext);
            }
            catch(e)
            {
                FBTrace.sysout("fbs.jscontext dump FAILED "+e, e);
            }
        }});

        return enumeratedContexts;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getOutermostScope: function(frame)
    {
        var scope = frame.scope;
        if (scope)
        {
            while(scope.jsParent)
                scope = scope.jsParent;

            // These are just determined by trial and error.
            if (scope.jsClassName == "Window" || scope.jsClassName == "ChromeWindow" ||
                scope.jsClassName == "ModalContentWindow")
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
                // Drop one frame see attachConsoleInjector
                var fileName = this.safeGetUrlFromFrame(frame);
                if (fileName && fileName.indexOf("console/consoleInjector.js") > 0)
                {
                    if (frame.callingFrame)
                        return fbs.getOutermostScope(frame.callingFrame);
                }

                var proto = scope.jsPrototype;

                // this is the path if we have web page in a sandbox
                if (proto.jsClassName == "XPCNativeWrapper")
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
                FBTrace.sysout("fbs.getOutermostScope found scope chain bottom, not Window: " +
                    scope.jsClassName, scope);

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
            // the outermost lexical scope of the function running the frame
            var frameScopeRoot = this.getOutermostScope(checkFrame);
            if (frameScopeRoot)
                break;

            if (FBTrace.DBG_FBS_FINDDEBUGGER)
                FBTrace.sysout("fbs.findDebugger no frame Window, looking to older stackframes",
                    checkFrame);

            checkFrame = checkFrame.callingFrame;
        }

        if (!checkFrame && FBTrace.DBG_FBS_FINDDEBUGGER)
            FBTrace.sysout("fbs.findDebugger fell thru bottom of stack", frame);

        // frameScopeRoot should be the top window for the scope of the frame function
        // or null
        var the_debuggr = fbs.askDebuggersForSupport(frameScopeRoot, frame);
        if (the_debuggr)
             return the_debuggr;

        if (FBTrace.DBG_FBS_FINDDEBUGGER)
            FBTrace.sysout("fbs.findDebugger no debuggr on bottom frame", frame);

        return null;
    },

    isChromebug: function(location)
    {
        // TODO this is a kludge: isFilteredURL stops users from seeing firebug but
        // chromebug has to disable the filter

        if (location)
        {
            if (location.indexOf("chrome://chromebug/") >= 0 ||
                location.indexOf("chrome://fb4cb/") >= 0)
            {
                return true;
            }
        }
        return false;
    },

    getLocationSafe: function(global)
    {
        try
        {
            // then we have a window, it will be an nsIDOMWindow, right?
            if (global && global.location)
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

    safeGetUrlFromFrame: function(frame)
    {
        try
        {
            if (frame)
                return frame.script.fileName;
        }
        catch (err)
        {
        }
        return "";
    },

    askDebuggersForSupport: function(global, frame)
    {
        if (FBTrace.DBG_FBS_FINDDEBUGGER)
            FBTrace.sysout("fbs.askDebuggersForSupport using global " + global + " for " +
                frame.script.fileName);

        if (global && fbs.isChromebug(fbs.getLocationSafe(global)))
            return false;

        if (FBTrace.DBG_FBS_FINDDEBUGGER)
            FBTrace.sysout("fbs.askDebuggersForSupport " + debuggers.length +
                " debuggers to check for " + frame.script.fileName, debuggers);

        for (var i=debuggers.length-1; i>=0; i--)
        {
            try
            {
                var debuggr = debuggers[i];
                if (debuggr.supportsGlobal(global, frame))
                {
                    if (!debuggr.breakContext)
                        FBTrace.sysout("fbs.Debugger with no breakContext:",debuggr.supportsGlobal);

                    if (FBTrace.DBG_FBS_FINDDEBUGGER)
                        FBTrace.sysout("fbs.findDebugger found debuggr (" + debuggr.debuggerName +
                            ") at " + i + " with breakContext " + debuggr.breakContext.getName() +
                            " for global " + fbs.getLocationSafe(global) + " while processing " +
                            frame.script.fileName);

                    return debuggr;
                }
            }
            catch (exc)
            {
                FBTrace.sysout("fbs.askDebuggersForSupport ERROR: " + exc,exc);
            }
        }
        return null;
    },

    dumpIValue: function(value)
    {
        var listValue = {value: null}, lengthValue = {value: 0};
        value.getProperties(listValue, lengthValue);

        for (var i=0; i<lengthValue.value; ++i)
        {
            var prop = listValue.value[i];
            try
            {
                var name = unwrapIValue(prop.name);
                FBTrace.sysout("fbs." + i + "]" + name + "=" + unwrapIValue(prop.value));
            }
            catch (e)
            {
                FBTrace.sysout("fbs." + i + "]" + e);
            }
        }
    },

    reFindDebugger: function(frame, debuggr)
    {
        var frameScopeRoot = this.getOutermostScope(frame);
        if (frameScopeRoot && debuggr.supportsGlobal(frameScopeRoot, frame))
            return debuggr;

        if (FBTrace.DBG_FBS_FINDDEBUGGER)
            FBTrace.sysout("fbs.reFindDebugger debuggr " + debuggr.debuggerName +
                " does not support frameScopeRoot " + frameScopeRoot, frameScopeRoot);

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

            // then we found a repeating caller abcabcdef
            if (point.script.tag == mark.script.tag)
            {
                mark = point;
                rest = i;
            }
        }

        // here point is null and mark is the last repeater, abcdef
        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("fbs.discardRecursionFrames dropped " + rest + " of " + i, mark);

        return mark;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

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
    //    We cannot prevent future breakpoints on lines that have no script.
    //    Break onCreate with error?
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
            {
                bp.debuggerName = debuggr.debuggerName;
            }
            else
            {
                if (FBTrace.DBG_FBS_BP)
                    FBTrace.sysout("fbs.addBreakpoint with no debuggr:");
            }
        }
        else
        {
            bp = this.recordBreakpoint(type, url, lineNo, debuggr, props, sourceFile);
        }

        if (FBTrace.DBG_FBS_BP)
            FBTrace.sysout("fbs.addBreakpoint for "+url, [bp, sourceFile]);

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
            delete bp.transformedCondition;
            delete bp.transformedConditionDebuggr;
            delete bp.transformedConditionContext;
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
            FBTrace.sysout("fbs.removeBreakpoint for "+url+", need to check bps="+
                (urlBreakpoints?urlBreakpoints.length:"none"));

        if (!urlBreakpoints)
            return false;

        for (var i=0; i<urlBreakpoints.length; ++i)
        {
            var bp = urlBreakpoints[i];
            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("fbs.removeBreakpoint checking bp.lineNo vs lineNo=" + bp.lineNo +
                    " vs " + lineNo);

            if (bp.lineNo === lineNo)
            {
                bp.type &= ~type;
                if (!bp.type)
                {
                    if (bp.scriptsWithBreakpoint)
                    {
                        for (var j=0; j<bp.scriptsWithBreakpoint.length; j++)
                        {
                            var script = bp.scriptsWithBreakpoint[j];
                            if (script && script.isValid)
                            {
                                try
                                {
                                    script.clearBreakpoint(bp.pc[j]);
                                    if (FBTrace.DBG_FBS_BP)
                                        FBTrace.sysout("fbs.removeBreakpoint in tag=" + script.tag +
                                            " at " + lineNo + "@" + url);
                                }
                                catch (exc)
                                {
                                    FBTrace.sysout("fbs.Firebug service failed to remove breakpoint in " +
                                        script.tag + " at lineNo=" + lineNo + " pcmap:" + bp.pcmap);
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
                        --conditionCount;

                    fbs.setBreakpoints(url, urlBreakpoints);
                }

                return bp;
            }
        }

        if (FBTrace.DBG_FBS_BP)
            FBTrace.sysout("fbs.removeBreakpoint no find for " + lineNo + "@" + url + " in " +
                urlBreakpoints.length, urlBreakpoints);

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
            FBTrace.sysout("fbs.findBreakpoint no find for "+lineNo+"@"+url, urlBreakpoints);

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
                                var vs = (bp.scriptsWithBreakpoint[iScript] ?
                                    bp.scriptsWithBreakpoint[iScript].tag + "@" + bp.pc[iScript] :
                                    "future") + " on " + url;

                                FBTrace.sysout("fbs.findBreakpointByScript[" + iURL + "," + iBreakpoint +
                                    "," + iScript + "]" + " looking for " + script.tag + "@" + pc +
                                    " vs " + vs);
                            }

                            if (bp.scriptsWithBreakpoint[iScript] &&
                                (bp.scriptsWithBreakpoint[iScript].tag == script.tag) &&
                                (bp.pc[iScript] == pc))
                            {
                                return bp;
                            }
                        }
                    }
                }
            }
        }

        return null;
    },

    // the sourcefile has just been created after compile
    resetBreakpoints: function(sourceFile, debuggr)
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
                FBTrace.sysout("fbs.Failed to give resetBreakpoints trace in url: " + url +
                    " because " + exc + " for urlBreakpoints=", urlBreakpoints);
            }
        }

        if (urlBreakpoints)
        {
            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("fbs.resetBreakpoints total bp=" + urlBreakpoints.length +
                    " for url=" + url);

            fbs.deleteBreakpoints(url);

            for (var i=0; i<urlBreakpoints.length; ++i)
            {
                var bp = urlBreakpoints[i];
                bp = fbs.recordBreakpoint(bp.type, url, bp.lineNo, debuggr, bp, sourceFile);

                if (bp.type & BP_ERROR)
                {
                    var existingBP = null;
                    fbs.enumerateErrorBreakpoints(url, {call: function checkExisting(url, lineNo, bp)
                    {
                        // An error breakpoint is in this file
                        if (lineNo == bp.lineNo)
                            existingBP = true;
                    }});

                    if (!existingBP)
                        errorBreakpoints.push(bp);  // TODO implement as hashtable errorBreakpoints[url@lineNo]
                }

                if (bp.disabled & BP_NORMAL)
                {
                    if (FBTrace.DBG_FBS_BP)
                        FBTrace.sysout("fbs.resetBreakpoints:  mark breakpoint disabled: " +
                            bp.lineNo + "@" + sourceFile);

                    fbs.disableBreakpoint(url, bp.lineNo);
                }
                else
                {
                    if (FBTrace.DBG_FBS_BP)
                        FBTrace.sysout("fbs.resetBreakpoints: "+bp.lineNo+"@"+sourceFile);
                }
            }
        }
        else
        {
            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("fbs.resetBreakpoints no breakpoints for "+url);
        }
    },

    setJSDBreakpoint: function(sourceFile, bp)
    {
        var scripts = sourceFile.getScriptsAtLineNumber(bp.lineNo);
        if (!scripts)
        {
            if (FBTrace.DBG_FBS_BP)
                FBTrace.sysout("fbs.setJSDBreakpoint:  NO inner scripts: "+bp.lineNo+"@"+sourceFile);

            if (!sourceFile.outerScript || !sourceFile.outerScript.isValid)
            {
                if (FBTrace.DBG_FBS_BP)
                    FBTrace.sysout("fbs.setJSDBreakpoint:  NO valid outerScript\n");
                return;
            }

            scripts = [sourceFile.outerScript];
        }

        if (!bp.scriptsWithBreakpoint)
        {
            bp.scriptsWithBreakpoint = [];
            bp.pc = [];
        }

        for (var i=0; i<scripts.length; i++)
        {
            var script = scripts[i];
            if (!script.isValid)
            {
                if (FBTrace.DBG_FBS_BP)
                    FBTrace.sysout("fbs.setJSDBreakpoint:  tag " + script.tag + ", " + i + "/" +
                        scripts.length + " is invalid");
                continue;
            }

            var haveScript = false;
            for (var j=0; j<bp.scriptsWithBreakpoint.length; j++)
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
                    FBTrace.sysout("fbs.setJSDBreakpoint pcmap undefined " +
                        sourceFile, sourceFile);

                pcmap = PCMAP_SOURCETEXT;
            }

            // we subtraced this offset when we showed the user so lineNo is a user line
            // number; now we need to talk
            // to jsd its line world
            var jsdLine = bp.lineNo + sourceFile.getBaseLineOffset();
            // test script.isLineExecutable(jsdLineNo, pcmap) ??

            var isExecutable = false;
            try
            {
                 isExecutable = script.isLineExecutable(jsdLine, pcmap);
            }
            catch(e)
            {
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
                        FBTrace.sysout("fbs.setJSDBreakpoint tag: " + script.tag + " line.pc@url=" +
                            bp.lineNo + "." + pc + "@" + sourceFile.href + " using offset:" +
                            sourceFile.getBaseLineOffset() + " jsdLine: " + jsdLine +
                            " pcToLine: " + pcToLine +
                            (isExecutable ? " isExecuable" : " notExecutable"),
                            {sourceFile: sourceFile, script: script});
                }
                else
                {
                    if (FBTrace.DBG_FBS_BP)
                        FBTrace.sysout("fbs.setJSDBreakpoint LINE MISMATCH for tag: " +
                            script.tag + " line.pc@url=" + bp.lineNo + "." + pc + "@" +
                            sourceFile.href + " using offset:" + sourceFile.getBaseLineOffset() +
                            " jsdLine: " + jsdLine + " pcToLine: " + pcToLine +
                            (isExecutable ? " isExecuable" : " notExecutable"), sourceFile);
                }
            }
            else
            {
                if (FBTrace.DBG_FBS_BP)
                    FBTrace.sysout("fbs.setJSDBreakpoint NOT isExecutable tag: " + script.tag +
                        " jsdLine@url=" + jsdLine + "@" + sourceFile.href + " pcmap:" +
                        pcmap + " baselineOffset:" + sourceFile.getBaseLineOffset(), script);
            }
         }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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

                // Do not store breakpoins for "Run until this line". These are not
                // visible in Firebug UI and so, it is not possible to remove them.
                // Note that there can be cases where such breakpoint is not removed
                // by RunUntil (e.g. crash).
                if (bp.type == BP_UNTIL)
                    continue;

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
            FBTrace.sysout("fbs.saveBreakpoints ERROR " + exc, exc);
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
        var breakpointStore = this.getBreakpointStore();
        if (!breakpointStore)
            return [];

        return breakpointStore.getKeys();
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
                ERROR("firebug-service breakpoint StorageService ERROR");

                this.breakpointStore =
                {
                    setItem: function(){},
                    removeItem: function(){},
                    getKeys: function(){return [];},
                    clear: function(){},
                };
            }

            return this.breakpointStore;
        }
        catch(exc)
        {
            // Throws another exception since fbs is null.
            //ERROR("firebug-service restoreBreakpoints ERROR "+exc);

            // xxxHonza: why I can't see this log in the Tracing Console?
            FBTrace.sysout("fbs.restoreBreakpoints ERROR " + exc, exc);
        }
    },

    restoreBreakpoints: function()
    {
        this.breakpoints = {};

        var breakpointStore = fbs.getBreakpointStore();
        if (!breakpointStore)
            return;

        var urls = fbs.getBreakpointURLs();
        for (var i=0; i<urls.length; i++)
        {
            var url = urls[i];
            var bps = breakpointStore.getItem(url);

            // Do not restore "Run unit this line" breakpoints. This should solve complaints
            // about Firebug breaking in the source even if there are no breakpoints in
            // Firebug UI.
            if (bps.type == BP_UNTIL)
                continue;

            this.breakpoints[url] = bps;

            for (var j=0; j<bps.length; j++)
            {
                var bp = bps[j];
                if (bp.condition)
                    ++conditionCount;
                if (bp.disabled)
                    ++disabledCount;
                if (bp.type & BP_MONITOR)
                    ++monitorCount;
            }
        }

        if (FBTrace.DBG_FBS_BP)
        {
            FBTrace.sysout("fbs.restoreBreakpoints "+urls.length+", disabledCount:"+disabledCount+
                " monitorCount:"+monitorCount+" conditionCount:"+conditionCount+", restored ",
                this.breakpoints);

            for (var p in this.breakpoints)
                FBTrace.sysout("fbs.restoreBreakpoints restored "+p+" condition "+
                    this.breakpoints[p].condition);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // When (debugger keyword and not halt)||(bp and BP_UNTIL) || (onBreakPoint && no conditions)
    // || interuptHook (single stepping).
    // rv is ignored
    routeBreakToDebuggr: function(frame, type, rv, stepStayOnDebuggr)
    {
        try
        {
            // avoid step_out from web page to chrome
            if (stepStayOnDebuggr)
            {
                var debuggr = this.reFindDebugger(frame, stepStayOnDebuggr);
                if (FBTrace.DBG_FBS_STEP)
                    FBTrace.sysout("fbs.routeBreakToDebuggr type="+getExecutionStopNameFromType(type)+
                        " stepStayOnDebuggr "+stepStayOnDebuggr+" debuggr:"+(debuggr?debuggr:"null"));

                if (!debuggr) // then the frame is not for our debugger
                    return RETURN_CONTINUE;  // This means that we will continue to take interrupts until  when?
            }
            else
            {
                var debuggr = this.findDebugger(frame);

                if (FBTrace.DBG_FBS_STEP)
                    FBTrace.sysout("fbs.routeBreakToDebuggr type="+getExecutionStopNameFromType(type)+
                        " debuggr:"+(debuggr?debuggr:"null"));
            }

            if (debuggr)
                return this.breakIntoDebugger(debuggr, frame, type);
        }
        catch(exc)
        {
            if (FBTrace.DBG_FBS_ERRORS)
                FBTrace.sysout("fbs.routeBreakToDebuggr failed: "+exc,exc);
            ERROR("routeBreakToDebuggr failed: "+exc, exc);
        }

        return RETURN_CONTINUE;
    },

    breakIntoDebugger: function(debuggr, frame, type)
    {
        if (FBTrace.DBG_FBS_STEP || FBTrace.DBG_FBS_BP)
            FBTrace.sysout("fbs.breakIntoDebugger called "+debuggr.debuggerName+
                " fbs.isChromeBlocked:"+fbs.isChromeBlocked);

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
            ERROR("breakIntoDebugger ERROR "+exc, exc);
            returned = RETURN_CONTINUE;
        }

        // Execution resumes now. Check if the user requested stepping and if so
        // install the necessary hooks
        this.startStepping(frame);

        if (FBTrace.DBG_FBS_STEP || FBTrace.DBG_FBS_BP)
            FBTrace.sysout("fbs.breakIntoDebugger returning "+returned+" from "+
                debuggr.debuggerName+" with jsd.pauseDepth "+jsd.pauseDepth+" and functionHook "+
                jsd.functionHook);

        return returned;
    },

    needToBreakForError: function(reportNextError)
    {
        return this.breakOnErrors || fbs.breakOnDebugCall;
    },

    // debuggr calls us to stage stepping
    step: function(mode, context, debuggr)
    {
        var stepper;

        if (mode === STEP_INTO)
            stepper = new IntoStepper(debuggr, context);
        else if (mode === STEP_OVER)
            stepper = new LineStepper(debuggr, context);
        else if (mode === STEP_OUT)
            stepper = new OutStepper(debuggr, context);

        if (stepper)
            jsdHandlers.add(stepper);
        else
            ERROR("fbs.step ERROR unknown mode "+mode);

        // The actual stepping starts after we resume the debuggger. Stepping is always
        // done when the execution/debugger is paused, so we need to resume and break e.g.
        // on the next line.
    },

    startStepping: function(frame) // if needed
    {
        jsdHandlers.hook(frame);
    },

    stopStepping: function(frame, context)
    {
        jsdHandlers.unhook(frame);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Hook Interupts

    hookInterrupts: function(frame)
    {
        // TODO move the try code in hook() to dispatch
        jsd.interruptHook = { onExecute: hook(this.onInterrupt, RETURN_CONTINUE)};

        if (frame)
            ScriptInterrupter.enable(frame.script);

        if (FBTrace.DBG_FBS_STEP)
            FBTrace.sysout("fbs.set InterruptHook frame.script.tag: "+
                (frame?frame.script.tag:"<no frame>"), ScriptInterrupter);
    },

    onInterrupt: function(frame, type, rv)
    {
        return jsdHandlers.dispatch("onInterrupt", frame, type);
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
        if (FBTrace.DBG_FBS_STEP)
            FBTrace.sysout("fbs.set functionHook");

        jsd.functionHook = { onCall: hook(this.onFunction, true) };
        jsd.topLevelHook = { onCall: hook(this.onFunction, true) };
    },

    onFunction: function(frame, type) // called in try/catch block with this === fbs
    {
        switch (type)
        {
            case TYPE_TOPLEVEL_START: // fall through
            case TYPE_FUNCTION_CALL:  // the frame will be running the called script
            {
                jsdHandlers.dispatch("onFunctionCall", frame, shiftCallType(type));
                break;
            }
            case TYPE_TOPLEVEL_END: // fall through
            case TYPE_FUNCTION_RETURN:  // the frame will be running the called script
            {
                jsdHandlers.dispatch("onFunctionReturn", frame, shiftCallType(type));
                break;
            }
        }
    },

    unhookFunctions: function()
    {
        jsd.functionHook = null;
        jsd.topLevelHook = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Hook Scripts

    hookScripts: function()
    {
        if (FBTrace.DBG_FBS_STEP || FBTrace.DBG_FBS_TRACKFILES)
            FBTrace.sysout("fbs.set scriptHook\n");

        jsd.scriptHook = {
            onScriptCreated: hook(this.onScriptCreated),
            onScriptDestroyed: hook(this.onScriptDestroyed)
        };

        if (fbs.filterSystemURLs)
            fbs.removeChromeBlockingFilters();

        jsd.clearFilters();

        if (fbs.filterSystemURLs)
            fbs.setChromeBlockingFilters();

        jsd.debuggerHook = { onExecute: hook(this.onDebugger, RETURN_CONTINUE) };
        jsd.debugHook = { onExecute: hook(this.onDebug, RETURN_CONTINUE) };
        jsd.breakpointHook = { onExecute: hook(this.onBreakpoint, RETURN_CONTINUE) };
        jsd.throwHook = { onExecute: hook(this.onThrow, RETURN_CONTINUE_THROW) };
        jsd.errorHook = { onError: hook(this.onError, true) };
    },

    unhookScripts: function()
    {
        jsd.scriptHook = null;
        fbs.removeChromeBlockingFilters();

        if (FBTrace.DBG_FBS_STEP || FBTrace.DBG_FBS_TRACKFILES)
            FBTrace.sysout("fbs.unset scriptHook\n");
    },

    // TODO rewrite as a Stepper
    // xxxJJB: perhaps xxxHonza could implement the stepper, but what the code is responsible for?
    // xxxhonza: traceAll and trace a function. I don't think these work anyway, a good start is to remove the old code.
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
                        FBTrace.sysout("fbs.callHook TYPE_FUNCTION_CALL "+frame.script.fileName);

                    contextCached = callBack(contextCached, frame, hookFrameCount, true);

                    break;
                }
                case TYPE_FUNCTION_RETURN:
                {
                    if (hookFrameCount <= 0)  // ignore returns until we have started back in
                        return;

                    --hookFrameCount;

                    if (FBTrace.DBG_FBS_STEP)
                        FBTrace.sysout("fbs.functionHook TYPE_FUNCTION_RETURN " +
                            frame.script.fileName);

                    // stack empty
                    if (unhookAtBottom && hookFrameCount == 0)
                       fbs.unhookFunctions();

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
            FBTrace.sysout("fbs.set callHook");

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

// ********************************************************************************************* //
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
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("fbs.ScriptInterrupter.enable; EXCEPTION");
        }

        this.entries[script.tag] = {
            script: script
        };
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
            if (FBTrace.DBG_ERRORS)
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
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("fbs.ScriptInterrupter.disable; EXCEPTION");
            }
       }

       this.entries = {};
    }
};

// ********************************************************************************************* //
// Local Helpers

function getStepName(mode)
{
    if (mode == STEP_OVER)
        return "STEP_OVER";

    if (mode == STEP_INTO)
        return "STEP_INTO";

    if (mode == STEP_OUT)
        return "STEP_OUT";

    if (mode == STEP_SUSPEND)
        return "STEP_SUSPEND";

    return "(not a step mode)";
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
    if (rawJSD_script_filename === "debugger eval code")
        return true;
    if (fbs.filterSystemURLs)
        return systemURLStem(rawJSD_script_filename);

    for (var i=0; i<fbs.alwayFilterURLsStarting.length; i++)
    {
        if (rawJSD_script_filename.indexOf(fbs.alwayFilterURLsStarting[i]) != -1)
            return true;
    }

    return false;
}

function systemURLStem(rawJSD_script_filename)
{
    // attempt to optimize stream of similar urls
    if (this.url_class)
    {
        if (rawJSD_script_filename.substr(0, this.url_class.length) == this.url_class)
            return this.url_class;
    }

    this.url_class = deepSystemURLStem(rawJSD_script_filename);
    return this.url_class;
}

function deepSystemURLStem(rawJSD_script_filename)
{
    for (var i=0; i<urlFilters.length; ++i)
    {
        var filter = urlFilters[i];
        if ( rawJSD_script_filename.substr(0,filter.length) == filter )
            return filter;
    }

    for (var i=0; i<COMPONENTS_FILTERS.length; ++i)
    {
        if (COMPONENTS_FILTERS[i].test(rawJSD_script_filename))
        {
            var match = COMPONENTS_FILTERS[i].exec(rawJSD_script_filename);
            urlFilters.push(match[1]);  // cache this for future calls
            return match[1];
        }
    }

    return false;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

function dispatch(listeners, name, args)
{
    var totalListeners = listeners.length;
    for (var i=0; i<totalListeners; ++i)
    {
        var listener = listeners[i];
        if (listener.hasOwnProperty(name) && listener[name])
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
            var msg =  "Error in hook: "+ exc;
            ERROR(msg, exc);
            return rv;
        }
    };
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
        if (!win.parent || win == win.parent || !(win.parent instanceof Window))
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
    if (!frame)
        return "< no frame >";

    if (!frame.script)
    {
        ERROR("frameToString bad frame "+typeof(frame), frame);
        return "<bad frame>";
    }

    return frame.script.tag+" in "+frame.script.fileName+"@"+frame.line+"(pc="+frame.pc+")";
}

function dumpComponentsStack(from)
{
    var msg = [];
    for (var frame = Components.stack; frame; frame = frame.caller)
        msg.push( {desc:frame.filename + "@" + frame.lineNumber +": "+
            frame.sourceLine,frame:frame}  );

    FBTrace.sysout("fbs." + from + " has stack size:" + msg.length, msg);
}

function testBreakpoint(frame, bp)
{
    if (FBTrace.DBG_FBS_BP)
        FBTrace.sysout("fbs.testBreakpoint "+bp.condition, bp);

    if (bp.condition && bp.condition != "")
    {
        var result = {};
        frame.scope.refresh();

        // ugly hack for closure getter syntax
        // (see also transformedCondition elsewhere in the code)
        var cond = bp.condition;
        if (cond.indexOf(".%") !== -1)
        {
            var frameScopeRoot = fbs.getOutermostScope(frame);
            if (frameScopeRoot)
            {
                if (bp.transformedCondition && "__fb_scopedVars" in frameScopeRoot.wrappedJSObject)
                {
                    // Fast path: everything is already prepared for us.
                    cond = bp.transformedCondition;
                }
                else
                {
                    var debuggr = fbs.findDebugger(frame);
                    var context = debuggr.breakContext;
                    delete debuggr.breakContext;

                    cond = debuggr._temporaryTransformSyntax(cond, frameScopeRoot, context);
                    bp.transformedCondition = cond;
                    bp.transformedConditionDebuggr = debuggr;
                    bp.transformedConditionContext = context;
                }
            }
        }

        var evaluate = function()
        {
            if (cond === bp.condition)
                return frame.eval(cond, "", 1, result);
            var debuggr = bp.transformedConditionDebuggr;
            var context = bp.transformedConditionContext;
            return debuggr._temporaryRunWithJSD2Debugger(context, function()
            {
                return frame.eval(cond, "", 1, result);
            });
        };

        if (evaluate())
        {
            if (bp.onTrue)
            {
                if (!result.value.booleanValue)
                    return false;
            }
            else
            {
                var value = unwrapIValue(result.value);
                if (typeof bp.lastValue == "undefined")
                {
                    bp.lastValue = value;
                    return false;
                }
                else
                {
                    if (bp.lastValue == value)
                        return false;
                    bp.lastValue = value;
                }
            }
        }
    }

    ++bp.hit;

    if (bp.hitCount > 0)
    {
        if (bp.hit < bp.hitCount)
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
            FBTrace.sysout("fbs.unwrapIValue ERROR for "+object,
                {exc: exc, object: object, unwrapped: unwrapped});
    }
}

// ********************************************************************************************* //
// Preferences

var FirebugPrefsObserver =
{
    syncFilter: function()
    {
        var filter = fbs.scriptsFilter;
        fbs.showEvents = (filter == "all" || filter == "events");
        fbs.showEvals = (filter == "all" || filter == "evals");

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("fbs.showEvents "+fbs.showEvents+" fbs.showEvals "+fbs.showEvals);
    }
};

// ********************************************************************************************* //
// Application Observers

var QuitApplicationGrantedObserver =
{
    observe: function(subject, topic, data)
    {
        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("fbs.QuitApplicationGrantedObserver " + topic + " start");
    }
};

var QuitApplicationRequestedObserver =
{
    observe: function(subject, topic, data)
    {
        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("fbs.QuitApplicationRequestedObserver " + topic);
    }
};

var QuitApplicationObserver =
{
    observe: function(subject, topic, data)
    {
        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("fbs.QuitApplicationObserver " + topic);

        fbs.disableDebugger();
        fbs.shutdown();
        fbs = null;

        if (FBTrace.DBG_FBS_ERRORS)
            FBTrace.sysout("fbs.QuitApplicationObserver " + topic + " end");
    }
};

// ********************************************************************************************* //
// Console Service

// xxxJJB: Support for console logging could be moved into separate module, correct?

var consoleService = null;

function ERROR(text, exc)
{
    if (!consoleService)
        consoleService = ConsoleService.getService(nsIConsoleService);

    try
    {
        fbs.unhookInterrupts(); // Stop and clear everything
        fbs.unhookFunctions();
        fbs.disableDebugger();
        jsdHandlers.list = [];
        consoleService.logStringMessage("ERROR: "+text);

        var frame = Components.stack;
        frame = frame.caller; // drop this frame we are in now.
        for ( ; frame; frame = frame.caller)
            consoleService.logStringMessage(frame.filename + "@" + frame.lineNumber + ";");

        FBTrace.sysout(text, exc);
    }
    catch(exc)
    {
        var msg = exc.toString() +" "+(exc.fileName || exc.sourceName) + "@" + exc.lineNumber;
        Cu.reportError("firebug-service ERROR in ERROR: "+msg);
    }
    finally
    {
        fbs.enableDebugger(); // we were enabled to get ERROR, so we hope all is cleared up now.
    }
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
        case TYPE_FUNCTION_RETURN: { typeName = "FUNCTION_RETURN"; break; }
        case TYPE_FUNCTION_CALL:   { typeName = "FUNCTION_CALL"; break; }
        case TYPE_TOPLEVEL_START: { typeName = "TOPLEVEL_START"; break; }
        case TYPE_TOPLEVEL_END:   { typeName = "TOPLEVEL_END"; break; }
    }
    return typeName;
}

function shiftCallType(type)
{
    return type + 10;
}

// ********************************************************************************************* //
// Chromebug Tracing

// xxxJJB, shouldn't the following code be part of Chromebug (could be done as part of splitting
// this file into more modules?)
// xxxhonza, yes

function getTmpFile()
{
    var file = Components.classes["@mozilla.org/file/directory_service;1"].
        getService(Components.interfaces.nsIProperties).
        get("TmpD", Components.interfaces.nsIFile);
    file.append("fbs.tmp");
    file.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0666);

    FBTrace.sysout("fbs.opened tmp file "+file.path);

    return file;
}

function getTmpStream(file)
{
    // file is nsIFile, data is a string
    var foStream = Cc["@mozilla.org/network/file-output-stream;1"].
        createInstance(Ci.nsIFileOutputStream);

    // use 0x02 | 0x10 to open file for appending.
    foStream.init(file, 0x02 | 0x08 | 0x20, 0666, 0);
    // write, create, truncate
    // In a c file operation, we have no need to set file mode with or operation,
    // directly using "r" or "w" usually.

    return foStream;
}

var trackFiles =
{
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
        if (!(name in this.allFiles))
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
                    tmpout(", "+where[i]);
                tmpout("\n");
            }
            else
            {
                tmpout("     none\n");
            }
        }
    },
};

function tmpout(text)
{
    if (!fbs.foStream)
        fbs.foStream = getTmpStream(getTmpFile());

    fbs.foStream.write(text, text.length);
}

// ********************************************************************************************* //
// Initialization

fbs.initialize();

// ********************************************************************************************* //
