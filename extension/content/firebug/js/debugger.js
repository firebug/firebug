/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/firefox",
    "arch/compilationunit",
    "firebug/lib/xpcom",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/wrapper",
    "firebug/lib/url",
    "firebug/js/sourceLink",
    "firebug/js/stackFrame",
    "firebug/lib/css",
    "firebug/chrome/window",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/trace/debug",
    "firebug/js/fbs",
    "firebug/lib/events",
    "firebug/console/errors",
],
function(Obj, Firebug, Firefox, CompilationUnit, Xpcom, FirebugReps, Locale,
    Wrapper, Url, SourceLink, StackFrame, Css, Win, Str, Arr, Debug, FBS, Events) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const jsdIScript = Ci.jsdIScript;
const jsdIStackFrame = Ci.jsdIStackFrame;
const jsdIExecutionHook = Ci.jsdIExecutionHook;
const nsISupports = Ci.nsISupports;
const nsICryptoHash = Ci.nsICryptoHash;
const nsIURI = Ci.nsIURI;

const PCMAP_SOURCETEXT = jsdIScript.PCMAP_SOURCETEXT;
const PCMAP_PRETTYPRINT = jsdIScript.PCMAP_PRETTYPRINT;

const RETURN_VALUE = jsdIExecutionHook.RETURN_RET_WITH_VAL;
const RETURN_THROW_WITH_VAL = jsdIExecutionHook.RETURN_THROW_WITH_VAL;
const RETURN_CONTINUE = jsdIExecutionHook.RETURN_CONTINUE;
const RETURN_CONTINUE_THROW = jsdIExecutionHook.RETURN_CONTINUE_THROW;
const RETURN_ABORT = jsdIExecutionHook.RETURN_ABORT;
const RETURN_HOOK_ERROR = jsdIExecutionHook.RETURN_HOOK_ERROR;

const TYPE_THROW = jsdIExecutionHook.TYPE_THROW;
const TYPE_DEBUGGER_KEYWORD = jsdIExecutionHook.TYPE_DEBUGGER_KEYWORD;

const STEP_OVER = 1;
const STEP_INTO = 2;
const STEP_OUT = 3;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

const tooltipTimeout = 300;

const reEval =  /\s*eval\s*\(([^)]*)\)/m;        // eval ( $1 )
const reHTM = /\.[hH][tT][mM]/;
const reFunction = /\s*Function\s*\(([^)]*)\)/m;
const reTooMuchRecursion = /too\smuch\srecursion/;

var jsd = Cc["@mozilla.org/js/jsd/debugger-service;1"].getService(Ci.jsdIDebuggerService);

// ************************************************************************************************

Firebug.Debugger = Obj.extend(Firebug.ActivableModule,
{
    dispatchName: "debugger",
    fbs: FBS, // access to firebug-service in chromebug under browser.xul.Dom.Firebug.Debugger.fbs

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Debugging

    // moz
    hasValidStack: function(context)
    {
        return context.stopped && context.currentFrame.isValid;
    },

    // on bti, method of stack
    evaluate: function(js, context, scope)  // TODO remote: move to backend, proxy to front
    {
        var frame = context.currentFrame;
        if (!frame)
            return;

        frame.scope.refresh(); // XXX what's this do?

        var result = {};
        var scriptToEval = js;

        // This seem to be safe; eval'ing a getter property in content that tries to
        // be evil and get Components.classes results in a permission denied error.
        var ok = frame.eval(scriptToEval, "", 1, result);

        var value = Wrapper.unwrapIValue(result.value, Firebug.viewChrome);
        if (ok)
            return value;
        else
            throw value;
    },

    // on bti (not called in firebug source)
    evaluateInCallingFrame: function(js, fileName, lineNo)
    {
        return this.halt(function evalInFrame(frame)
        {
            FBTrace.sysout("evaluateInCallingFrame " + js + " fileName: " +
                frame.script.fileName + " stack: " + StackFrame.getJSDStackDump(frame));

            var result = {};
            var ok = frame.eval(js, fileName, lineNo, result);
            var value = Wrapper.unwrapIValue(result.value, Firebug.viewChrome);

            if (ok)
                return value;
            else
                throw value;
        });
    },

    _temporaryTransformSyntax: function(expr, win, context)
    {
        return Firebug.ClosureInspector.extendLanguageSyntax(expr, win, context);
    },

    /**
     * Used by autocomplete in commandLine
     * @return array of locally visible property names for each scope we are in
     */
    getCurrentFrameKeys: function(context)  // TODO remote, on bti
    {
        // return is safe
        var globals = Arr.keys(Wrapper.getContentView(context.getCurrentGlobal()));
        if (context.currentFrame)
            return this.getFrameKeys(context.currentFrame, globals);

        return globals;
    },

    /**
     * private to Debugger, returns list of strings
     */
    getFrameKeys: function(frame, names) // moz
    {
        var scope = frame.scope;
        while (scope)
        {
            var listValue = {value: null}, lengthValue = {value: 0};
            scope.getProperties(listValue, lengthValue);

            for (var i=0; i<lengthValue.value; ++i)
            {
                var prop = listValue.value[i];
                var name = Wrapper.unwrapIValue(prop.name);
                names.push(name);
            }

            scope = scope.jsParent;
        }

        return names;
    },

    // @Deprecated  see chrome.js
    focusWatch: function(context)  // TODO moved
    {
        return Firebug.chrome.focusWatch(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Private to Debugger

    // moz
    beginInternalOperation: function() // stop debugger operations like breakOnErrors
    {
        var state = {breakOnErrors: Firebug.breakOnErrors};
        Firebug.breakOnErrors = false;
        return state;
    },

    // moz
    endInternalOperation: function(state)  // pass back the object given by beginInternalOperation
    {
        Firebug.breakOnErrors = state.breakOnErrors;
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    // moz
    halt: function(fnOfFrame)
    {
        if(FBTrace.DBG_BP)
            FBTrace.sysout('debugger.halt '+fnOfFrame);

        return FBS.halt(this, fnOfFrame);
    },

    // on bti
    getCurrentStackTrace: function(context)
    {
        var trace = null;

        Firebug.Debugger.halt(function(frame)
        {
            if (FBTrace.DBG_STACK)
                FBTrace.sysout("lib.getCurrentStackTrace frame:", frame);

            trace = StackFrame.getCorrectedStackTrace(frame, context);

            if (FBTrace.DBG_STACK)
                FBTrace.sysout("lib.getCurrentStackTrace trace:", trace.toString().split('\n'));
        });

        return trace;
    },

    // Used by FBTest
    breakAsIfDebugger: function(frame)
    {
        // should return 'this' but also sets this.breakContext
        var debuggr = FBS.findDebugger(frame);
        FBS.breakIntoDebugger(debuggr, frame, 3);
    },

    // This URL prefix is used to skip frames from chrome URLs. Note that sometimes chrome URLs
    // are used even in web pages, but only in rare cases so don't worry about it.
    // Don't be specific like: chrome://firebug/ since frames coming from extensions e.g.
    // chrome://firecookie/ wouldn't be skipped then.
    breakNowURLPrefix: "chrome://",

    // on bti
    breakNow: function(context)
    {
        Firebug.Debugger.halt(function haltAnalysis(frame)
        {
            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("debugger.breakNow: frame "+frame.script.fileName+" context "+
                    context.getName(), StackFrame.getJSDStackDump(frame) );

            for (; frame && frame.isValid; frame = frame.callingFrame)
            {
                var fileName = frame.script.fileName;
                if (!fileName)
                    continue;
                else if (Str.hasPrefix(fileName, Firebug.Debugger.breakNowURLPrefix))
                    continue;
                else if (fileName.indexOf("/modules/firebug-") != -1)
                    continue;
                else
                    break;
            }

            if (frame)
            {
                Firebug.Debugger.breakContext = context;

                // I just made up a type that won't match TYPE_DEBUGGER_KEYWORD
                Firebug.Debugger.onBreak(frame, "halt");
            }
            else
            {
                if (FBTrace.DBG_UI_LOOP)
                    FBTrace.sysout("debugger.breakNow: no frame that not starting with "+
                        Firebug.Debugger.breakNowURLPrefix);
            }
        });
    },

    // moz, called by back end
    stop: function(context, frame, type, rv)
    {
        if (context.stopped)
            return RETURN_CONTINUE;

        if (!this.isAlwaysEnabled())
            return RETURN_CONTINUE;

        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("debugger.stop "+context.getName()+" frame",frame);

        // Do not break if the user is on another tab
        if (Firefox.getCurrentURI().spec !== context.window.location.toString())
        {
            if (FBTrace.DBG_UI_LOOP)
            {
                var current = Firefox.getCurrentURI().spec;
                var prev = context.window.location.toString();
                var locations = {current: current, context: prev};

                FBTrace.sysout("debugger.stop ERROR break is not in current window ", locations);
            }
            return RETURN_CONTINUE;
        }

        context.stoppedFrame = frame;  // the frame we stopped in, don't change this elsewhere.
        context.currentFrame = frame;  // the frame we show to user, depends on selection
        context.stopped = true;
        try
        {
            context.stoppedGlobal = Wrapper.wrapObject(
                Wrapper.unwrapIValue(frame.executionContext.globalObject));
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("debugger.stop failed to get global scope");
        }

        var hookReturn = Firebug.connection.dispatch("onStop", [context, frame, type, rv]);
        if ( hookReturn && hookReturn >= 0 )
        {
            delete context.stopped;
            delete context.stoppedFrame;
            delete context.stoppedGlobal;
            delete context.currentFrame;

            if (FBTrace.DBG_UI_LOOP)
            {
                FBTrace.sysout("debugger.stop extension vetoed stop with hookReturn " +
                    hookReturn);
            }

            return hookReturn;
        }

        try
        {
            this.freeze(context);

            // If firebug hits a breakpoint in an event handler, which used setCapture
            // the entire browser window is unclickable (see issue 5064)
            context.window.document.releaseCapture();

            // We will pause here until resume is called
            var depth = FBS.enterNestedEventLoop({
                onNest: Obj.bindFixed(this.startDebugging, this, context)
            });

            // For some reason we don't always end up here

            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("debugger.stop, nesting depth:"+depth+" jsd.pauseDepth: "+
                    jsd.pauseDepth+" context:"+context.getName());
        }
        catch (exc)
        {
            // Just ignore exceptions that happened while in the nested loop
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("debugger exception in nested event loop: "+exc, exc);
            else
                Debug.ERROR("debugger exception in nested event loop: "+exc+"\n");
        }
        finally
        {
            this.thaw(context);
        }

        this.stopDebugging(context);

        Firebug.connection.dispatch("onResume",[context]);

        if (context.aborted)
        {
            delete context.aborted;
            return RETURN_ABORT;
        }
        else if (Firebug.rerun)
        {
            setTimeout(function reExecute()
            {
                var rerun = context.savedRerun = Firebug.rerun;
                delete Firebug.rerun;

                if (FBTrace.DBG_UI_LOOP)
                    FBTrace.sysout("Firebug.debugger.reExecute ", {rerun: rerun});

                // fire the prestored script
                function successConsoleFunction(result, context)
                {
                    if (FBTrace.DBG_UI_LOOP)
                        FBTrace.sysout("Firebug.debugger.reExecute success", result);
                    Firebug.connection.dispatch( "onRerunComplete", [true, result]);
                }

                function exceptionFunction(result, context)
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("Firebug.debugger.reExecute FAILED "+result, result);
                    Firebug.connection.dispatch( "onRerunComplete", [false, result]);
                }

                Firebug.CommandLine.evaluate("window._firebug.rerunFunction()", context, null,
                    context.window, successConsoleFunction, exceptionFunction);
            });

            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("Firebug.debugger.reExecute return "+RETURN_HOOK_ERROR);

            return RETURN_HOOK_ERROR;
        }
        else
        {
            return RETURN_CONTINUE;
        }
    },

    // on bti
    rerun: function(context)
    {
        if(!context.stopped)
        {
            FBTrace.sysout("debugger.rerun FAILS: not stopped");
            return;
        }

        if (Firebug.rerun)
        {
            FBTrace.sysout("debugger.rerun FAILS: Firebug.rerun in progress");
            return;
        }

        Firebug.rerun = this.getRerun(context);

        // now continue but abort the current call stack.
        this.resume(context);  // the Firebug.rerun will signal abort stack
    },

    // moz
    getRerun: function(context)
    {
        if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("debugger.rerun for "+context.getName());
        try
        {
            // walk back to the oldest frame, but not top level
            var frame = context.stoppedFrame;
            while (frame.callingFrame && frame.callingFrame.script.functionName)
            {
                frame = frame.callingFrame;

                if (frame.script.functionName == "_firebugRerun") // re-reRun
                {
                    if (FBTrace.DBG_UI_LOOP)
                        FBTrace.sysout("getRerun re-rerun ", context.savedRerun);
                    return context.savedRerun;
                }
            }

            // In this oldest frame we have element.onclick(event) or window.foo()
            // We want to cause the page to run this again after we abort this call stack.
            function getStoreRerunInfoScript(fnName)
            {
                var str = "if (!window._firebug)window._firebug={};\n";
                str += "window._firebug.rerunThis = this;\n";
                str += "window._firebug.rerunArgs = [];\n";
                str += "if (arguments && arguments.length) for (var i = 0; i < arguments.length; i++) window._firebug.rerunArgs.push(arguments[i]);\n";
                str += "window._firebug.rerunFunctionName = "+fnName+";\n";
                str +="window._firebug.rerunFunction = function _firebugRerun() { "+fnName+".apply(window._firebug.rerunThis, window._firebug.rerunArgs); }";
                return str;
            }

            var rerun = {};

            var fnName = StackFrame.getFunctionName(frame.script, context, frame, true);
            rerun.script = getStoreRerunInfoScript(fnName);
            var jsdFunctionName = frame.script.functionName;

            // now run the script that stores the rerun info in the page
            var result = {};
            var ok = frame.eval(rerun.script, context.window.location + "/RerunScript", 1, result);

            // If the eval goes off somewhere wacky, the frame may be invalid by this point.
            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("debugger.rerun "+ok+" and result: "+result+" for "+context.getName(),
                    {result: result, rerun: rerun, functionName: jsdFunctionName});
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("debugger.rerun FAILS for "+context.getName()+" because "+exc,
                    {exc:exc, rerun: rerun});
        }

        return rerun;
    },

    // bti
    resume: function(context)
    {
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("debugger.resume, context.stopped:"+context.stopped+"\n");

        // this will cause us to return to just after the enterNestedEventLoop call
        var depth = FBS.exitNestedEventLoop();


        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("debugger.resume, depth:"+depth+"\n");
    },

    // bti
    abort: function(context)
    {
        if (context.stopped)
        {
            context.aborted = true;
            this.thaw(context);
            this.resume(context);
            FBS.unPause(true);
        }
    },

    // bti
    stepOver: function(context)
    {
        if (!context.stoppedFrame || !context.stoppedFrame.isValid)
            return;

        FBS.step(STEP_OVER, context, this);
        this.resume(context);
    },

    stepInto: function(context)
    {
        if (!context.stoppedFrame || !context.stoppedFrame.isValid)
            return;

        FBS.step(STEP_INTO, context, this);
        this.resume(context);
    },

    stepOut: function(context)
    {
        if (!context.stoppedFrame || !context.stoppedFrame.isValid)
            return;

        FBS.step(STEP_OUT, context, this);
        this.resume(context);
    },

    suspend: function(context)
    {
        if (context.stopped)
            return;

        FBS.suspend(this, context);
    },

    unSuspend: function(context)
    {
        FBS.stopStepping(null, context);  // TODO per context
        FBS.cancelBreakOnNextCall(this, context);
    },

    runUntil: function(context, compilationUnit, lineNo)
    {
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("runUntil "+lineNo+" @"+compilationUnit);

        if (!context.stoppedFrame || !context.stoppedFrame.isValid)
            return;

        var sourceFile = compilationUnit.sourceFile;
        FBS.runUntil(compilationUnit.sourceFile, lineNo, context.stoppedFrame, this);
        this.resume(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // moz

    freeze: function(context)
    {
        var executionContext = context.stoppedFrame.executionContext;
        try {
            executionContext.scriptsEnabled = false;
            this.suppressEventHandling(context);
            context.isFrozen = true;

            // https://developer.mozilla.org/en/XUL_Tutorial/Focus_and_Selection#Getting_the_currently_focused_element
            if (context.window && context.window.document.commandDispatcher)
            {
                context.saveFocus = context.window.document.commandDispatcher.focusedElement;
                if (context.saveFocus && !context.discardBlurEvents)
                {
                    context.discardBlurEvents = function blurDiscarder(event)
                    {
                        if (!context.saveFocus)
                        {
                            Events.removeEventListener(context.window, "blur",
                                context.discardBlurEvents, true);
                            delete context.discardBlurEvents;
                        }

                        if (FBTrace.DBG_UI_LOOP)
                        {
                            FBTrace.sysout("debugger.freeze discard blur event " +
                                context.saveFocus + " while focus is " +
                                context.window.document.commandDispatcher.focusedElement,
                                event);
                        }

                        event.preventDefault();
                        event.stopPropagation();
                    },

                    Events.addEventListener(context.window, "blur",
                        context.discardBlurEvents, true);
                }
            }

            if (FBTrace.DBG_UI_LOOP)
            {
                FBTrace.sysout("debugger.freeze context.saveFocus "+context.saveFocus,
                    context.saveFocus);

                FBTrace.sysout("debugger.freeze try to disable scripts "+
                    (context.eventSuppressor?"and events":"but not events")+" in "+
                    context.getName()+" executionContext.tag "+executionContext.tag+
                    ".scriptsEnabled: "+executionContext.scriptsEnabled);
            }
        }
        catch (exc)
        {
            // This attribute is only valid for contexts which implement nsIScriptContext.
            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("debugger.freeze, freeze exception " + exc + " in " +
                    context.getName(), exc);
        }
    },

    suppressEventHandling: function(context)
    {
        if (context.window instanceof Ci.nsIInterfaceRequestor)
        {
            context.eventSuppressor = context.window.getInterface(Ci.nsIDOMWindowUtils);
            if (context.eventSuppressor)
                context.eventSuppressor.suppressEventHandling(true);
        }
    },

    thaw: function(context)
    {
        try {
            if (context.isFrozen)
                delete context.isFrozen;
            else
                return; // bail, we did not freeze this context

                var executionContext = context.stoppedFrame.executionContext;
            if (executionContext.isValid)
            {
                this.unsuppressEventHandling(context);

                // Before we release JS, put the focus back
                if (context.saveFocus)
                {
                    context.window.focus();
                    context.saveFocus.focus();
                    delete context.saveFocus;

                    if (FBTrace.DBG_UI_LOOP)
                    {
                        var nowFocused = context.window.document.commandDispatcher ?
                            context.window.document.commandDispatcher.focusedElement : null;
                        FBTrace.sysout("debugger.thaw context.saveFocus "+context.saveFocus+
                            " vs "+nowFocused, context.saveFocus);
                    }
                }

                executionContext.scriptsEnabled = true;
            }
            else
            {
                if (FBTrace.DBG_UI_LOOP)
                    FBTrace.sysout("debugger.thaw "+executionContext.tag+
                        " executionContext is not valid");
            }

            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("debugger.thaw try to enable scripts " +
                    (context.eventSuppressor?"with events suppressed":"events enabled")+
                    " in "+context.getName()+" executionContext.tag "+executionContext.tag+
                    ".scriptsEnabled: "+executionContext.scriptsEnabled);
        }
        catch (exc)
        {
            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("debugger.stop, scriptsEnabled = true exception:", exc);
        }
    },

    unsuppressEventHandling: function(context)
    {
        if (context.eventSuppressor)
        {
            context.eventSuppressor.suppressEventHandling(false);
            delete context.eventSuppressor;
        }
    },

    // on bti
    toggleFreezeWindow: function(context)
    {
        // then we need to break into debugger to get the executionContext
        if (!context.stopped)
        {
            Firebug.Debugger.halt(function grabContext(frame)
            {
                context.stoppedFrame = frame;
                Firebug.Debugger.doToggleFreezeWindow(context);
                delete context.stoppedFrame;
            });

            Firebug.Debugger.suspend(context);
        }
        else
        {
            Firebug.Debugger.doToggleFreezeWindow(context);
        }
    },

    // moz
    doToggleFreezeWindow: function(context)
    {
        if (context.isFrozen)
            Firebug.Debugger.unsuppressEventHandling(context);
        else
            Firebug.Debugger.suppressEventHandling(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

    setBreakpoint: function(sourceFile, lineNo)  // TODO: arg should be url
    {
        if (sourceFile instanceof CompilationUnit)
            sourceFile = sourceFile.sourceFile;  // see HACK in tabContext
        FBS.setBreakpoint(sourceFile, lineNo, null, Firebug.Debugger);
    },

    clearBreakpoint: function(sourceFile, lineNo)
    {
        if (sourceFile instanceof CompilationUnit)
            sourceFile = sourceFile.sourceFile;  // see HACK in tabContext
        FBS.clearBreakpoint(sourceFile.href, lineNo);
    },

    setErrorBreakpoint: function(compilationUnit, line)
    {
        FBS.setErrorBreakpoint(compilationUnit.sourceFile, line, Firebug.Debugger);
    },

    clearErrorBreakpoint: function(compilationUnit, line)
    {
        FBS.clearErrorBreakpoint(compilationUnit.getURL(), line, Firebug.Debugger);
    },

    // Called by bti browser.clearAllBreakpoints
    clearAllBreakpoints: function(context)
    {
        if (context)
        {
            var units = context.getAllCompilationUnits();
            FBS.clearAllBreakpoints(units, Firebug.Debugger);
            FBS.clearErrorBreakpoints(units, Firebug.Debugger);
        }
        else
        {
            // null means all urls
            FBS.enumerateBreakpoints(null, {call: function(url, lineNo, bp)
            {
                // skip breakpoints of other debuggers.
                if (bp.debuggerName !== Firebug.Debugger.debuggerName)
                    return;

                FBS.clearBreakpoint(url, lineNo);
            }});

            // and also error breakpoints
            FBS.enumerateErrorBreakpoints(null, {call: function(url, lineNo)
            {
                FBS.clearErrorBreakpoint(url, lineNo, Firebug.Debugger);
            }});
        }
    },

    enableAllBreakpoints: function(context)
    {
        if (FBTrace.DBG_BP)
            FBTrace.sysout("enableAllBreakpoints sourceFileMap:", context.sourceFileMap);

        for (var url in context.sourceFileMap)
        {
            FBS.enumerateBreakpoints(url, {call: function(url, lineNo)
            {
                FBS.enableBreakpoint(url, lineNo);
            }});
        }
    },

    disableAllBreakpoints: function(context)
    {
        for (var url in context.sourceFileMap)
        {
            FBS.enumerateBreakpoints(url, {call: function(url, lineNo)
            {
                FBS.disableBreakpoint(url, lineNo);
            }});
        }
    },

    getBreakpointCount: function(context)
    {
        var count = 0;
        for (var url in context.sourceFileMap)
        {
            FBS.enumerateBreakpoints(url,
            {
                call: function(url, lineNo)
                {
                    ++count;
                }
            });

            FBS.enumerateErrorBreakpoints(url,
            {
                call: function(url, lineNo)
                {
                    ++count;
                }
            });
        }
        return count;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debugging and monitoring

    traceAll: function(context)
    {
        FBS.traceAll(Firebug.SourceFile.sourceURLsAsArray(context), this);
    },

    untraceAll: function(context)
    {
        FBS.untraceAll(this);
    },

    monitorFunction: function(fn, mode)
    {
        if (typeof(fn) == "function" || fn instanceof Function)
        {
            var script = Firebug.SourceFile.findScriptForFunctionInContext(
                Firebug.currentContext, fn);

            if (script)
            {
                this.monitorScript(fn, script, mode);
            }
            else
            {
                Firebug.Console.logFormatted(
                    ["Firebug unable to locate jsdIScript for function", fn],
                    Firebug.currentContext, "info");
            }
        }
        else
        {
            Firebug.Console.logFormatted(
                ["Firebug.Debugger.monitorFunction requires a function", fn],
                Firebug.currentContext, "info");
        }
    },

    unmonitorFunction: function(fn, mode)
    {
        if (typeof(fn) == "function" || fn instanceof Function)
        {
            var script = Firebug.SourceFile.findScriptForFunctionInContext(
                Firebug.currentContext, fn);

            if (script)
                this.unmonitorScript(fn, script, mode);
        }
    },

    monitorScript: function(fn, script, mode)
    {
        var scriptInfo = Firebug.SourceFile.getSourceFileAndLineByScript(
            Firebug.currentContext, script);

        if (scriptInfo)
        {
            if (mode == "debug")
                Firebug.Debugger.setBreakpoint(scriptInfo.sourceFile, scriptInfo.lineNo);
            else if (mode == "monitor")
                FBS.monitor(scriptInfo.sourceFile, scriptInfo.lineNo, Firebug.Debugger);
        }
    },

    unmonitorScript: function(fn, script, mode)
    {
        var scriptInfo = Firebug.SourceFile.getSourceFileAndLineByScript(
            Firebug.currentContext, script);

        if (scriptInfo)
        {
            if (mode == "debug")
                this.clearBreakpoint(scriptInfo.sourceFile, scriptInfo.lineNo);
            else if (mode == "monitor")
                FBS.unmonitor(scriptInfo.sourceFile.href, scriptInfo.lineNo);
        }
    },

    traceCalls: function(context, fn)
    {
        if (typeof(fn) == "function" || fn instanceof Function)
        {
            var script = Firebug.SourceFile.findScriptForFunctionInContext(context, fn);
            if (script)
                this.traceScriptCalls(context, script);
            else
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("debugger.traceCalls no script found for "+fn, fn);
            }
        }
    },

    untraceCalls: function(context, fn)
    {
        if (typeof(fn) == "function" || fn instanceof Function)
        {
            var script = Firebug.SourceFile.findScriptForFunctionInContext(context, fn);
            if (script)
                this.untraceScriptCalls(context, script);
        }
    },

    traceScriptCalls: function(context, script)
    {
        var scriptInfo = Firebug.SourceFile.getSourceFileAndLineByScript(context, script);
        if (scriptInfo)
            FBS.traceCalls(scriptInfo.sourceFile, scriptInfo.lineNo, Firebug.Debugger);
    },

    untraceScriptCalls: function(context, script)
    {
        var scriptInfo = Firebug.SourceFile.getSourceFileAndLineByScript(context, script);
        if (scriptInfo)
            FBS.untraceCalls(scriptInfo.sourceFile, scriptInfo.lineNo, Firebug.Debugger);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Stuff

    /*
     * Called when a nestedEventLoop begins
     */
    startDebugging: function(context)
    {
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("Firebug.Debugger startDebugging enter context.stopped:" +
                context.stopped + " for context: " + context.getName());

        try
        {
            FBS.lockDebugger();

            context.executingSourceFile =
                Firebug.SourceFile.getSourceFileByScript(context, context.stoppedFrame.script);

            // bail out, we don't want the user stuck in debug with out source.
            if (!context.executingSourceFile)
            {
                if (FBTrace.DBG_UI_LOOP)
                    FBTrace.sysout("startDebugging resuming, no sourceFile for "+
                        context.stoppedFrame.script.fileName,
                        context.stoppedFrame.script.functionSource);

                this.resume(context);
                return;
            }

            // Make Firebug.currentContext = context and sync the UI
            if (context != Firebug.currentContext)
                Firebug.selectContext(context);

        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Resuming debugger: error during debugging loop: "+exc, exc);

            Firebug.Console.log("Resuming debugger: error during debugging loop: "+exc);

            this.resume(context);
        }

        var frame = StackFrame.getStackFrame(context.stoppedFrame, context);
        Firebug.connection.dispatch( "onStartDebugging", [context, frame]);

        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("startDebugging exit context.stopped:" + context.stopped +
                " for context: " + context.getName());
    },

    /**
     * Called in the main event loop, from jsd, after we have exited the nested event loop
     */
    stopDebugging: function(context)
    {
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("stopDebugging enter context: " + context.getName());

        try
        {
            FBS.unlockDebugger();

            // If the user reloads the page while the debugger is stopped, then
            // the current context will be destroyed just before
            if (context && !context.aborted)
            {
                delete context.stopped;
                delete context.stoppedFrame;
                delete context.stoppedGlobal;
                delete context.currentFrame;
                context.executingSourceFile = null;
                delete context.breakLineNumber;

                Firebug.connection.dispatch( "onStopDebugging", [context]);

            }
            else
            {
                if (FBTrace.DBG_UI_LOOP)
                    FBTrace.sysout("debugger.stopDebugging else "+context.getName()+" "+
                        Win.safeGetWindowLocation(context.window));
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("debugger.stopDebugging FAILS", exc);

            // If the window is closed while the debugger is stopped,
            // then all hell will break loose here
            Debug.ERROR(exc);
        }
    },

    suspendFirebug: function()
    {
        Firebug.suspendFirebug();
    },

    resumeFirebug: function()
    {
        Firebug.resumeFirebug();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    supportsWindow: function(win)
    {
        if (!this.isAlwaysEnabled())
            return false;

        var context = ((win && Firebug.TabWatcher) ?
            Firebug.TabWatcher.getContextByWindow(win) : null);

        this.breakContext = context;
        return !!context;
    },

    // This is called from fbs for almost all fbs operations
    supportsGlobal: function(frameWin)
    {
        var context = ( (frameWin && Firebug.TabWatcher) ?
            Firebug.TabWatcher.getContextByWindow(frameWin) : null);

        if (!context)
            return false;

        // otherwise we cannot be called.
        context.jsDebuggerCalledUs = true;

        this.breakContext = context;
        //FBTrace.sysout("debugger.js this.breakContext "+this.breakContext.getName());
        return true;
    },

    onLock: function(state)
    {
        // XXXjoe For now, trying to see if it's ok to have multiple contexts
        // debugging simultaneously - otherwise we need this
        //if (this.context != this.debugContext)
        {
            // XXXjoe Disable step/continue buttons
        }
    },

    onBreak: function(frame, type)
    {
        try
        {
            var context = this.breakContext;

            // If the script panel is disabled, Firebug can't break (issue 4290).
            if (!Firebug.PanelActivation.isPanelEnabled("script"))
                return RETURN_CONTINUE;

            if (FBTrace.DBG_BP || (!context && FBTrace.DBG_FBS_ERRORS))
                FBTrace.sysout("debugger.onBreak breakContext: " +
                    (context ? context.getName() : " none!"), StackFrame.getJSDStackDump(frame));

            delete this.breakContext;

            if (!context)
                return RETURN_CONTINUE;

            if (type == TYPE_DEBUGGER_KEYWORD)
            {
                var trace = Wrapper.getContentView(context.window)._firebugStackTrace;
                if (trace == "console-tracer")
                    return this.debuggerTracer(context, frame);
                else
                    this.setDebuggerKeywordCause(context, frame);
                if (!context.breakingCause)
                    return RETURN_CONTINUE;
            }

            return this.stop(context, frame, type);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS && FBTrace.DBG_BP)
                FBTrace.sysout("debugger.onBreak FAILS", exc);
            throw exc;
        }
    },

    debuggerTracer: function(context, frame)
    {
        var trace = StackFrame.getCorrectedStackTrace(frame, context);
        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("debugger.firebugDebuggerTracer corrected trace.frames "+
                trace.frames.length, trace.frames);

        if (trace)
        {
            // drop the firebugDebuggerTracer and reorder
            //trace.frames = trace.frames.slice(1);

            if (FBTrace.DBG_ERRORLOG)
                FBTrace.sysout("debugger.firebugDebuggerTracer dropped tracer trace.frames "+
                    trace.frames.length, trace.frames);

            // drop one frame see attachConsoleInjector
            //trace.frames = trace.frames.slice(1);
            Firebug.Console.log(trace, context, "stackTrace");
        }

        if (FBTrace.DBG_BP)
            FBTrace.sysout("debugger.onBreak "+(trace?"debugger trace":" debugger no trace!"));

        return RETURN_CONTINUE;
    },

    /**
     * for |debugger;| keyword offer the skip/continue dialog (optionally?)
     */
    setDebuggerKeywordCause: function(context, frame)
    {
        var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, frame.script);
        if (!sourceFile)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("debugger.setDebuggerKeywordCause FAILS, no sourceFile for "+
                    frame.script.tag+"@"+frame.script.fileName+" in "+context.getName());
            return;
        }

        var analyzer = sourceFile.getScriptAnalyzer(frame.script);
        var lineNo = analyzer.getSourceLineFromFrame(context, frame);

        context.breakingCause =
        {
            title: Locale.$STR("debugger keyword"),
            skipActionTooltip: Locale.$STR("firebug.bon.tooltip.disableDebuggerKeyword2"),
            message: Locale.$STR("firebug.bon.cause.disableDebuggerKeyword2"),
            skipAction: function addSkipperAndGo()
            {
                // a breakpoint that never hits, but prevents debugger keyword
                // (see FBS.onDebugger as well)
                var bp = Firebug.Debugger.setBreakpoint(sourceFile, lineNo);
                FBS.disableBreakpoint(sourceFile.href, lineNo);

                if (FBTrace.DBG_BP)
                    FBTrace.sysout("debugger.onBreak converted to disabled bp "+sourceFile.href+
                        "@"+lineNo+" tag: "+frame.script.tag, bp);

                Firebug.Debugger.resume(context);
            },
        };
    },

    onThrow: function(frame, rv)
    {
        // onThrow is called for throw, for catches that do not succeed,
        // and for functions that exceptions pass through.
        var context = this.breakContext;
        delete this.breakContext;

        if (!context)
        {
            if (FBTrace.DBG_BP)
                FBTrace.sysout("debugger.onThrow, no context, try to get from frame\n");
            context = this.getContextByFrame(frame);
        }

        if (FBTrace.DBG_ERRORLOG)
        {
            var lines = [];
            var frames = StackFrame.getCorrectedStackTrace(frame, context).frames;
            for (var i=0; i<frames.length; i++)
                lines.push(frames[i].line + ", " + frames[i].fn);

            FBTrace.sysout("debugger.onThrow context:" + (context ? context.getName() :
                "undefined") + ", " + lines.join("; "), frames);
        }

        if (!context)
            return RETURN_CONTINUE_THROW;

        if (!FBS.showStackTrace)
            return RETURN_CONTINUE_THROW;

        try
        {
            var realThrow = this.isRealThrow(frame, context);
            if (realThrow)
            {
                context.thrownStackTrace = StackFrame.getCorrectedStackTrace(frame, context);

                if (FBTrace.DBG_BP)
                    FBTrace.sysout("debugger.onThrow reset context.thrownStackTrace",
                        context.thrownStackTrace.frames);

                // xxxHonza: this could fix Issue 3276: Track Throw/Catch is not working
                /*if (FBS.trackThrowCatch)
                {
                    var object = {
                        errorMessage: errorObject.value.stringValue,
                        message: errorObject.value.stringValue,
                        sourceName: "",
                        lineNumber: -1,
                        sourceLine: "",
                        category: "javascript",
                        flags: 2,
                        exceptionFlag: 2,
                    };

                    Firebug.Errors.logScriptError(context, object, false);

                    context.thrownStackTrace = StackFrame.getCorrectedStackTrace(frame, context);
                }*/
            }
            else
            {
                if (FBTrace.DBG_BP)
                    FBTrace.sysout("debugger.onThrow not a real throw");
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("onThrow FAILS: " + exc, exc);
        }

        if (Firebug.connection.dispatch("onThrow",[context, frame, rv]))
            return this.stop(context, frame, TYPE_THROW, rv);

        return RETURN_CONTINUE_THROW;
    },

    isRealThrow: function(mozFrame, context)
    {
        // Determine whether the throw was a real one, or just a rethrow of the
        // last exception (probably automatically inserted - which it seems
        // happens for every function an exception passes through - but it
        // could also be manual because there is no simple way to tell them
        // apart). A rethrow is detected when the current stack exists at the
        // end of the previous exception's, except that the current top-most
        // stack frame only has to be in the same function to match.
        if (!context.thrownStackTrace)
            return true;

        var trace = context.thrownStackTrace.frames;
        var findMozFrame = mozFrame.callingFrame, againstFrame = null;
        if (findMozFrame)
        {
            // Verify that the previous exception includes this frame's call
            // site somewhere.
            var findFrameSig = findMozFrame.script.tag + "." + findMozFrame.pc;
            for (var i=1; i<trace.length; i++)
            {
                var preFrameSig = trace[i].signature();

                if (FBTrace.DBG_ERRORS && FBTrace.DBG_STACK)
                {
                    FBTrace.sysout("debugger.isRealThrow " + findFrameSig + "==" +
                        preFrameSig);
                }

                if (findFrameSig === preFrameSig)
                {
                    againstFrame = trace[i-1];
                    break;
                }
            }

            if (!againstFrame)
                return true;
        }
        else
        {
            againstFrame = trace[trace.length-1];
        }

        // Verify that the current frame's function location matches what the
        // exception has above the matched frame.
        if (mozFrame.script !== againstFrame.script)
            return true;

        return false;
    },

    onMonitorScript: function(frame)
    {
        var context = this.breakContext;
        delete this.breakContext;

        if (!context)
            context = this.getContextByFrame(frame);
        if (!context)
            return RETURN_CONTINUE;

        frame = StackFrame.getStackFrame(frame, context);

        Firebug.connection.dispatch("onMonitorScript",[context, frame]);
    },

    onFunctionCall: function(context, frame, depth, calling)
    {
        if (!context)
            context = this.getContextByFrame(frame);

        if (!context)
            return RETURN_CONTINUE;

        frame = StackFrame.getStackFrame(frame, context);

        Firebug.connection.dispatch("onFunctionCall",[context, frame, depth, calling]);

        return context;  // returned as first arg on next call from same trace
    },

    onError: function(frame, error, hitErrorBreakpoint)
    {
        var context = this.breakContext;
        delete this.breakContext;

        // If the script panel is disabled, Firebug can't break on error.
        if (!Firebug.PanelActivation.isPanelEnabled("script"))
            return 0;

        try
        {
            if (FBTrace.DBG_ERRORLOG)
                FBTrace.sysout("debugger.onError: "+error.errorMessage+" in "+
                    (context?context.getName():"no context"), error);

            if (reTooMuchRecursion.test(error.errorMessage))
                frame = FBS.discardRecursionFrames(frame);

            Firebug.errorStackTrace = StackFrame.getCorrectedStackTrace(frame, context);

            if (FBTrace.DBG_ERRORLOG)
                FBTrace.sysout("debugger.onError; break=" + Firebug.breakOnErrors +
                    ", errorStackTrace:", Firebug.errorStackTrace);

            delete context.breakingCause;

            if (Firebug.breakOnErrors || hitErrorBreakpoint)
            {
                var eventOrigin = Wrapper.unwrapIValue(frame.executionContext.globalObject);
                if (!eventOrigin)
                    return 0;

                // Check if the eventOrigin (window) comes from this context.
                var eventOriginIndex = -1;
                for (var i=0; i<context.windows.length; i++)
                {
                    if (Wrapper.getContentView(context.windows[i]) == eventOrigin) {
                        eventOriginIndex = i;
                        break;
                    }
                }

                // Bail out if the event that lead the error is not cause by code in this context.
                if (eventOriginIndex < 0)
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("debugger.onError; error is not from this context: (" +
                            eventOriginIndex + ") " + frame.script.tag+"@"+frame.script.fileName);
                    return 0;
                }

                var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, frame.script);
                if (!sourceFile)
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("debugger.breakon Errors no sourceFile for "+
                            frame.script.tag+"@"+frame.script.fileName);
                    return;
                }

                var analyzer = sourceFile.getScriptAnalyzer(frame.script);
                var lineNo = analyzer.getSourceLineFromFrame(context, frame);

                var doBreak = true;
                FBS.enumerateBreakpoints(sourceFile.href, {call: function(url, line, props, scripts)
                {
                    if (FBTrace.DBG_FBS_BP)
                        FBTrace.sysout("debugger.breakon Errors bp "+url+"@"+line+" scripts "+
                            (scripts?scripts.length:"none"));

                    if (line === lineNo)
                        doBreak = false;
                }});

                if (FBTrace.DBG_BP)
                    FBTrace.sysout("debugger.breakon Errors " + doBreak + " for " +
                        sourceFile.href + "@" + lineNo);

                if (doBreak)
                {
                    context.breakingCause =
                    {
                        title: Locale.$STR("Break on Error"),
                        message: error.message,
                        copyAction: Obj.bindFixed(FirebugReps.ErrorMessage.copyError,
                            FirebugReps.ErrorMessage, error),

                        skipAction: function addSkipperAndGo()
                        {
                            // a breakpoint that never hits, but prevents BON for errors
                            var bp = Firebug.Debugger.setBreakpoint(sourceFile, lineNo);
                            FBS.disableBreakpoint(sourceFile.href, lineNo);

                            if (FBTrace.DBG_BP)
                                FBTrace.sysout("debugger.breakon Errors set "+sourceFile.href+"@"+
                                    lineNo+" tag: "+frame.script.tag, bp);

                            Firebug.Debugger.resume(context);
                        },
                    };
                }
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("debugger.onError getCorrectedStackTrace FAILED: "+exc, exc);
        }

        var hookReturn = Firebug.connection.dispatch("onError",[context, frame, error]);

        if (!context.breakingCause)
            return 0;

        if (Firebug.breakOnErrors)
        {
            // Switch of Break on Next tab lightning.
            //var panel = context.getPanel("console", true);
            //Firebug.Breakpoint.updatePanelTab(panel, false);

            return -1;  // break
        }

        if (hookReturn)
            return hookReturn;

        return -2; /* let firebug service decide to break or not */
    },

    onUncaughtException: function(errorInfo)
    {
        var context = this.breakContext;
        delete this.breakContext;

        Firebug.Errors.logScriptError(context, errorInfo, false);
        return -2;
    },

    onXULScriptCreated: function(frame, outerScript, innerScriptEnumerator)
    {
        try
        {
            var context = this.breakContext;
            delete this.breakContext;

            var sourceFile = context.sourceFileMap[outerScript.fileName];
            if (sourceFile)
            {
                if (FBTrace.DBG_SOURCEFILES)
                    FBTrace.sysout("debugger.onXULScriptCreated reuse sourcefile="+
                        sourceFile.toString()+" -> "+context.getName()+" ("+context.uid+")");

                Firebug.SourceFile.addScriptsToSourceFile(sourceFile, null, innerScriptEnumerator);
            }
            else
            {
                sourceFile = new Firebug.XULSourceFile(outerScript.fileName, outerScript,
                    innerScriptEnumerator);
            }

            this.watchSourceFile(context, sourceFile);

            if (FBTrace.DBG_SOURCEFILES)
                FBTrace.sysout("debugger.onXULScriptCreated script.fileName="+outerScript.fileName+
                    " in "+context.getName()+" "+sourceFile);

            Firebug.connection.dispatch("onXULScriptCreated",[context, frame, sourceFile.href]);
            return sourceFile;
        }
        catch (e)
        {
            if (FBTrace.DBG_TOPLEVEL || FBTrace.DBG_ERRORS)
                FBTrace.sysout("onXULScriptCreated FaILS "+e, e);
        }
    },

    onEvalScriptCreated: function(frame, outerScript, innerScripts)
    {
        try
        {
            if (FBTrace.DBG_EVAL)
                FBTrace.sysout("debugger.onEvalLevelScript script.fileName=" +
                    outerScript.fileName);

            var context = this.breakContext;
            delete this.breakContext;

            var sourceFile = this.getEvalLevelSourceFile(frame, context, innerScripts);

            if (FBTrace.DBG_EVAL)
                FBTrace.sysout("debugger.onEvalScriptCreated url="+sourceFile.href,
                    StackFrame.getCorrectedStackTrace(frame, context));

            Firebug.connection.dispatch("onEvalScriptCreated",[context, frame, sourceFile.href]);
            return sourceFile;
        }
        catch (e)
        {
            if (FBTrace.DBG_EVAL || FBTrace.DBG_ERRORS)
                FBTrace.sysout("onEvalScriptCreated FaILS "+e, e);
        }
    },

    onEventScriptCreated: function(frame, outerScript, innerScripts)
    {
        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("debugger.onEventScriptCreated script.fileName=" +
                outerScript.fileName, {outerScript: outerScript, script: frame.script});

        var context = this.breakContext;
        delete this.breakContext;

        var script = frame.script;
        var creatorURL = Url.normalizeURL(frame.script.fileName);
        var innerScriptArray = [];

        try
        {
            var source = script.functionSource;

            while (innerScripts.hasMoreElements())
            {
                var inner = innerScripts.getNext();
                source += "\n"+inner.functionSource;
                innerScriptArray.push(inner);
            }
        }
        catch (exc)
        {
            /*Bug 426692 */
            var source = creatorURL + "/"+Obj.getUniqueId();
        }

        var lines = Str.splitLines(source);

        var urlDescribed = this.getDynamicURL(context,
            Url.normalizeURL(frame.script.fileName), lines, "event");

        var handlerName = outerScript.functionName;
        if (handlerName)
            var url = urlDescribed.href + '/' + handlerName;
        else
            var url = urlDescribed.href;

        context.sourceCache.invalidate(url);
        context.sourceCache.storeSplitLines(url, lines);

        var sourceFile = new Firebug.EventSourceFile(url, frame.script, "event:"+
            script.functionName+"."+script.tag, lines, new ArrayEnumerator(innerScriptArray));

        this.watchSourceFile(context, sourceFile);

        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("debugger.onEventScriptCreated url="+sourceFile.href+"\n");

        if (FBTrace.DBG_EVENTS)
             FBTrace.sysout("debugger.onEventScriptCreated sourceFileMap:", context.sourceFileMap);

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("debugger.onEventScriptCreated sourcefile="+sourceFile.toString()+
                " -> "+context.getName()+"\n");

        Firebug.connection.dispatch("onEventScriptCreated",[context, frame, url]);
        return sourceFile;
    },

    // We just compiled a bunch of JS, eg a script tag in HTML.  We are about to run the outerScript.
    onTopLevelScriptCreated: function(frame, outerScript, innerScripts)
    {
        if (FBTrace.DBG_TOPLEVEL)
            FBTrace.sysout("debugger("+this.debuggerName+").onTopLevelScriptCreated script.fileName="+
                outerScript.fileName+"\n");

        var context = this.breakContext;
        delete this.breakContext;

        // This is our only chance to get the linetable for the outerScript
        // since it will run and be GC next.
        var script = frame.script;
        var url = Url.normalizeURL(script.fileName);

        if (FBTrace.DBG_TOPLEVEL)
            FBTrace.sysout("debugger.onTopLevelScriptCreated frame.script.tag="+frame.script.tag+
                " has url="+url);

        var isInline = false;

        /* The primary purpose here was to deal with http://code.google.com/p/fbug/issues/detail?id=2912
         * This approach could be applied to inline scripts, so I'll leave the code here until we decide.
        Win.iterateWindows(context.window, function isInlineScriptTag(win)
        {
            var location = Win.safeGetWindowLocation(win);
            if (location === url)
            {
                isInline = true;
                return isInline;
            }
        });
        */

        if (FBTrace.DBG_TOPLEVEL)
            FBTrace.sysout("debugger.onTopLevelScriptCreated has inLine:"+isInline+" url="+url);

        if (isInline) // never true see above
        {
            var href = url +"/"+context.dynamicURLIndex++;
            sourceFile = new Firebug.ScriptTagAppendSourceFile(href, script,
                script.lineExtent, innerScripts);
            this.watchSourceFile(context, sourceFile);
            context.pendingScriptTagSourceFile = sourceFile;
        }
        else
        {
            var sourceFile = context.sourceFileMap[url];

            // Multiple script tags in HTML or duplicate .js file names.
            if (sourceFile && (sourceFile instanceof Firebug.TopLevelSourceFile))
            {
                if (FBTrace.DBG_SOURCEFILES)
                    FBTrace.sysout("debugger.onTopLevelScriptCreated reuse sourcefile="+
                        sourceFile.toString()+" -> "+context.getName()+" ("+context.uid+")");

                if (!sourceFile.outerScript || !sourceFile.outerScript.isValid)
                    sourceFile.outerScript = outerScript;

                Firebug.SourceFile.addScriptsToSourceFile(sourceFile, outerScript,
                    innerScripts);
            }
            else
            {
                sourceFile = new Firebug.TopLevelSourceFile(url, script, script.lineExtent,
                    innerScripts);

                if (FBTrace.DBG_SOURCEFILES)
                    FBTrace.sysout("debugger.onTopLevelScriptCreated create sourcefile="+
                        sourceFile.toString()+" -> "+context.getName()+" ("+context.uid+")");
            }

            // If a script is inserted multiple times in HTML, we still need to make
            // sure that meta info is updated (e.g. sourceFileByTag in the context)
            // (see issue 4880)
            this.watchSourceFile(context, sourceFile);
        }

        Firebug.connection.dispatch("onTopLevelScriptCreated",[context, frame, sourceFile.href]);
        return sourceFile;
    },

    getContextByFrame: function(frame)
    {
        if (FBTrace.DBG_BP)
            FBTrace.sysout("debugger.getContextByFrame");

        var win = FBS.getOutermostScope(frame);
        return win ? Firebug.TabWatcher.getContextByWindow(win) : null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    watchSourceFile: function(context, sourceFile)
    {
        context.addSourceFile(sourceFile);  // store in the context and notify listeners
        //FBS.watchSourceFile(sourceFile);    // tell the service to watch this file

        // Update the Script panel, this script could have been loaded asynchronously
        // and perhaps is the only one that should be displayed (otherwise the panel
        // would show: No Javascript on this page). See issue 4932
        var panel = context.getPanel("script", true);
        if (panel)
            panel.context.invalidatePanels("script");
    },

    unwatchSourceFile: function(context, sourceFile)
    {
        //FBS.unwatchSourceFile(sourceFile);
        context.removeSourceFile(sourceFile);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onToggleBreakpoint: function(url, lineNo, isSet, props)
    {
        if (props.debuggerName != this.debuggerName) // then not for us
        {
            if (FBTrace.DBG_BP)
                FBTrace.sysout("debugger(" + this.debuggerName +
                    ").onToggleBreakpoint ignoring toggle for " +
                    props.debuggerName + " target " + lineNo + "@" + url);
            return;
        }

        var found = false;
        for (var i = 0; i < Firebug.TabWatcher.contexts.length; ++i)
        {
            var context = Firebug.TabWatcher.contexts[i];
            var sourceFile = context.sourceFileMap[url];
            if (sourceFile)
            {
                if (FBTrace.DBG_BP)
                    FBTrace.sysout("debugger(" + this.debuggerName +
                        ").onToggleBreakpoint found context " +
                        context.getName());

                if (!isSet && context.dynamicURLhasBP)
                    this.checkDynamicURLhasBP(context);

                var panel = context.getPanel("script", true);
                if (!panel)
                    continue;

                panel.context.invalidatePanels("breakpoints");

                var sourceBox = panel.getSourceBoxByURL(url);
                if (!sourceBox)
                {
                    if (FBTrace.DBG_BP)
                        FBTrace.sysout("debugger("+this.debuggerName+").onToggleBreakpoint context "+
                            i+" script panel no sourcebox for url: "+url, panel.sourceBoxes);
                    continue;
                }

                var row = sourceBox.getLineNode(lineNo);
                if (FBTrace.DBG_BP)
                    FBTrace.sysout(i+") onToggleBreakpoint getLineNode="+row+" lineNo="+lineNo+
                        " context:"+context.getName());

                if (!row)
                    continue;  // we *should* only be called for lines in the viewport...

                row.setAttribute("breakpoint", isSet);
                if (isSet && props)
                {
                    row.setAttribute("condition", props.condition ? "true" : "false");
                    row.breakpointCondition = props.condition ? props.condition : null;

                    if (props.condition)  // issue 1371
                    {
                        var watchPanel = this.ableWatchSidePanel(context);

                        if (watchPanel)
                        {
                            watchPanel.addWatch(props.condition);
                        }
                        else
                        {
                            if (FBTrace.DBG_ERRORS)
                                FBTrace.sysout("onToggleBreakpoint no watch panel in context "+
                                    context.getName());
                        }
                    }
                    row.setAttribute("disabledBreakpoint", new Boolean(props.disabled).toString());
                }
                else
                {
                    row.removeAttribute("condition");
                    if (props.condition)
                    {
                        var watchPanel = this.ableWatchSidePanel(context);
                        watchPanel.removeWatch(props.condition);
                        watchPanel.rebuild();
                    }
                    row.removeAttribute("disabledBreakpoint");
                }
                Firebug.connection.dispatch( "onToggleBreakpoint", [context, url, lineNo, isSet]);
                found = true;
                continue;
            }
        }

        if (FBTrace.DBG_BP && !found)
            FBTrace.sysout("debugger("+this.debuggerName+").onToggleBreakpoint no find context");
    },

    // xxxHonza, xxxjjb: duplicated in script.js, does it belong here?
    // But onToggleBreakpoint needs it.
    ableWatchSidePanel: function(context)
    {
        // TODO if (commandline is not active, then we should not show the new watch feature)
        var watchPanel = context.getPanel("watches", true);
        if (watchPanel)
            return watchPanel;
    },

    onToggleErrorBreakpoint: function(url, lineNo, isSet)
    {
        for (var i = 0; i < Firebug.TabWatcher.contexts.length; ++i)
        {
            var context = Firebug.TabWatcher.contexts[i];
            var panel = context.getPanel("console", true);
            if (panel)
            {
                panel.context.invalidatePanels("breakpoints");

                for (var row = panel.panelNode.firstChild; row; row = row.nextSibling)
                {
                    var errorMessage = row.getElementsByClassName("objectBox-errorMessage");
                    if (!errorMessage.length)
                        continue;

                    errorMessage = errorMessage[0];
                    var error = errorMessage.repObject;
                    if (error instanceof FirebugReps.ErrorMessageObj && error.href == url &&
                        error.lineNo == lineNo)
                    {
                        if (isSet)
                            Css.setClass(errorMessage, "breakForError");
                        else
                            Css.removeClass(errorMessage, "breakForError");

                        Firebug.connection.dispatch( "onToggleErrorBreakpoint",
                            [context, url, lineNo, isSet]);
                    }
                }
            }
        }
    },

    onToggleMonitor: function(url, lineNo, isSet)
    {
        for (var i = 0; i < Firebug.TabWatcher.contexts.length; ++i)
        {
            var panel = Firebug.TabWatcher.contexts[i].getPanel("console", true);
            if (panel)
                panel.context.invalidatePanels("breakpoints");
        }
    },

    checkDynamicURLhasBP: function (context)
    {
        context.dynamicURLhasBP = false;
        for (var url in context.sourceFileMap)
        {
             var sourceFile = context.sourceFileMap[url];
               if (sourceFile.isEval() || sourceFile.isEvent())
               {
                   FBS.enumerateBreakpoints(url, {call: function setDynamicIfSet(url, lineNo)
                   {
                       context.dynamicURLhasBP = true;
                   }});
               }
               if (context.dynamicURLhasBP)
                   break;
        }
        if (FBTrace.DBG_SOURCEFILES || FBTrace.DBG_BP)
            FBTrace.sysout("debugger.checkDynamicURLhasBP "+context.dynamicURLhasBP);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // XXXjjb this code is not called, because I found the scheme for detecting Function
    // too complex. I'm leaving it here to remind us that we need to support new Function().
    onFunctionConstructor: function(frame, ctor_script)
    {
       try
        {
            var context = this.breakContext;
            delete this.breakContext;

            var sourceFile = this.createSourceFileForFunctionConstructor(frame, ctor_script, context);

            if (FBTrace.DBG_EVAL)
            {
                FBTrace.sysout("debugger.onFunctionConstructor tag=" + ctor_script.tag +
                    " url=" + sourceFile.href);

                FBTrace.sysout(StackFrame.traceToString(
                    StackFrame.getCorrectedStackTrace(frame, context)));
            }

            Firebug.connection.dispatch("onFunctionConstructor",
                [context, frame, ctor_script, sourceFile.href]);

            return sourceFile.href;
        }
        catch(exc)
        {
            Debug.ERROR("debugger.onFunctionConstructor failed: "+exc);

            if (FBTrace.DBG_EVAL)
                FBTrace.sysout("debugger.onFunctionConstructor failed: ",exc);

            return null;
        }

    },

    createSourceFileForFunctionConstructor: function(caller_frame, ctor_script, context)
    {
        var ctor_expr = null; // this.getConstructorExpression(caller_frame, context);
        if (FBTrace.DBG_EVAL)
            FBTrace.sysout("createSourceFileForFunctionConstructor ctor_expr:"+ctor_expr+"\n");

        var source;
        if (ctor_expr)
        {
            source = this.getEvalBody(caller_frame,
                "lib.createSourceFileForFunctionConstructor ctor_expr", 1, ctor_expr);
        }
        else
        {
            source = " bah createSourceFileForFunctionConstructor"; //ctor_script.functionSource;
        }

        if (FBTrace.DBG_EVAL)
            FBTrace.sysout("createSourceFileForFunctionConstructor source:"+source);

        var url = this.getDynamicURL(context, Url.normalizeURL(caller_frame.script.fileName),
            source, "Function");

        var cachedSource = context.sourceCache.store(url.href, source);
        var lines = Str.splitLines(cachedSource);
        var sourceFile = new Firebug.FunctionConstructorSourceFile(url, caller_frame.script,
            ctor_expr, lines.length);

        this.watchSourceFile(context, sourceFile);

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("debugger.onNewFunction sourcefile="+sourceFile.toString()+" -> "+
                context.getName()+"\n");

        return sourceFile;
    },

    getConstructorExpression: function(caller_frame, context)
    {
        // We believe we are just after the ctor call.
        var decompiled_lineno = getLineAtPC(caller_frame, context);
        if (FBTrace.DBG_EVAL)
            FBTrace.sysout("debugger.getConstructoreExpression decompiled_lineno:"+
                decompiled_lineno+"\n");

        // TODO place in sourceCache?
        var decompiled_lines = Str.splitLines(caller_frame.script.functionSource);
        if (FBTrace.DBG_EVAL)
            FBTrace.sysout("debugger.getConstructoreExpression decompiled_lines:",decompiled_lines);

        var candidate_line = decompiled_lines[decompiled_lineno - 1]; // zero origin
        if (FBTrace.DBG_EVAL)
            FBTrace.sysout("debugger.getConstructoreExpression candidate_line:" + candidate_line);

        if (candidate_line && candidate_line != null)
        {
            var m = reFunction.exec(candidate_line);
            if (m)
                var arguments =  m[1];     // TODO Lame: need to count parens, with escapes and quotes
        }

        if (FBTrace.DBG_EVAL)
            FBTrace.sysout("debugger.getConstructoreExpression arguments:"+arguments+"\n");

        if (arguments) // need to break down commas and get last arg.
        {
            var lastComma = arguments.lastIndexOf(',');
            return arguments.substring(lastComma+1);  // if -1 then 0
        }

        return null;
    },

    // end of guilt trip
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    // Called by debugger.onEval() to store eval() source.
    // The frame has the blank-function-name script and it is not the top frame.
    // The frame.script.fileName is given by spidermonkey as file of the first eval().
    // The frame.script.baseLineNumber is given by spidermonkey as the line of the first eval() call
    // The source that contains the eval() call is the source of our caller.
    // If our caller is a file, the source of our caller is at frame.script.baseLineNumber
    // If our caller is an eval, the source of our caller is TODO Check Test Case
    getEvalLevelSourceFile: function(frame, context, innerScripts)
    {
        var eval_expr = this.getEvalExpression(frame, context);

        if (FBTrace.DBG_EVAL)
            FBTrace.sysout("getEvalLevelSourceFile eval_expr:"+eval_expr);

        if (eval_expr)
        {
            var source  = this.getEvalBody(frame, "lib.getEvalLevelSourceFile.getEvalBody",
                1, eval_expr);
            var mapType = PCMAP_SOURCETEXT;
        }
        else
        {
            var source = frame.script.functionSource; // XXXms - possible crash on OSX FF2
            var mapType = PCMAP_PRETTYPRINT;
        }

        var lines = Str.splitLines(source);

        if (FBTrace.DBG_EVAL)
            FBTrace.sysout("getEvalLevelSourceFile "+lines.length+ "lines, mapType:"+
                ((mapType==PCMAP_SOURCETEXT)?"SOURCE":"PRETTY")+" source:"+source);

        var url = this.getDynamicURL(context, Url.normalizeURL(frame.script.fileName),
            lines, "eval");

        context.sourceCache.invalidate(url.href);
        context.sourceCache.storeSplitLines(url.href, lines);

        var sourceFile = new Firebug.EvalLevelSourceFile(url, frame.script, eval_expr, lines,
            mapType, innerScripts);

        this.watchSourceFile(context, sourceFile);

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("debugger.getEvalLevelSourceFile sourcefile="+sourceFile.toString()+
                " -> "+context.getName()+"\n");

        return sourceFile;
    },

    getDynamicURL: function(context, callerURL, lines, kind)
    {
        var url = this.getURLFromLastLine(context, lines);
        if (url)
            return url;

        var url = this.getSequentialURL(context, callerURL, kind);
        if (url)
            return url;

        var url = this.getURLFromMD5(callerURL, lines, kind);
        if (url)
            return url;

        var url = this.getDataURLForScript(callerURL, lines);
        if (url)
            return url;

        return url;
    },

    getURLFromLastLine: function(context, lines)
    {
        var url = null;
        // Ignores any trailing whitespace in |source|
        const reURIinComment = /\/\/[@#]\ssourceURL=\s*(\S*?)\s*$/m;
        var m = reURIinComment.exec(lines[lines.length - 1]);

        if (m)
        {
            // add context info to the sourceURL so eval'd sources are grouped
            // correctly in the source file list
            if (m[1] && m[1].indexOf('://') == -1)
            {
                var loc = context.window.location;
                if (m[1].charAt(0) != '/') m[1] = '/'+m[1]; // prepend leading slash if necessary
                m[1] = loc.protocol + '//' + loc.host + m[1]; // prepend protocol and host
            }

            var href = new String(m[1]);
            href = Url.normalizeURL(href);

            url = {href: href, kind: "source"};
            if (FBTrace.DBG_SOURCEFILES)
                FBTrace.sysout("debugger.getURLFromLastLine "+url.href, url);
        }
        else
        {
            if (FBTrace.DBG_SOURCEFILES)
                FBTrace.sysout("debugger.getURLFromLastLine no match"+lines[lines.length - 1]);
        }

        return url;
    },

    getSequentialURL: function(context, callerURL, kind)
    {
        var url = null;
        if (!context.dynamicURLhasBP)
        {
            // If no breakpoints live in dynamic code then we don't need to compare
            // the previous and reloaded source. In that case let's use a cheap Url.
            var href = new String(callerURL + (kind ? "/"+kind+"/" : "/nokind/")+"seq/"
                +(context.dynamicURLIndex++));
            url = {href: href, kind: "seq"};

            if (FBTrace.DBG_SOURCEFILES || isNaN(context.dynamicURLIndex))
                FBTrace.sysout("debugger.getSequentialURL context:"+context.getName()+
                    " url:"+url.href+" index: "+context.dynamicURLIndex, url);
        }
        return url;
    },

    getURLFromMD5: function(callerURL, lines, kind)
    {
        this.hash_service.init(this.nsICryptoHash.MD5);
        var source = lines.join('\n'); // we could double loop, would that be any faster?
        byteArray = [];
        for (var j = 0; j < source.length; j++)
        {
            byteArray.push( source.charCodeAt(j) );
        }
        this.hash_service.update(byteArray, byteArray.length);
        var hash = this.hash_service.finish(true);

        // encoding the hash should be ok, it should be information-preserving?
        // Or at least reversable?
        var href= new String(callerURL + (kind ? "/"+kind+"/" : "/nokind/")+"MD5/" +
            encodeURIComponent(hash));
        url = {href: href, kind: "MD5"};

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("debugger.getURLFromMD5 "+url.href, url);

        return url;
    },

    getDataURLForScript: function(callerURL, lines)
    {
        var url = null;
        var href = null;
        if (!source)
        {
            href = "eval."+script.tag;
        }
        else
        {
            // data:text/javascript;fileName=x%2Cy.js;baseLineNumber=10,<the-url-encoded-data>
            href = new String("data:text/javascript;");
            href += "fileName="+encodeURIComponent(callerURL);
            var source = lines.join('\n');
            //url +=  ";"+ "baseLineNumber="+encodeURIComponent(script.baseLineNumber) +
            href +="," + encodeURIComponent(source);
        }

        url = {href:href, kind:"data"};
        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("debugger.getDataURLForScript "+url.href, url);

        return url;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getEvalExpression: function(frame, context)
    {
        var expr = this.getEvalExpressionFromEval(frame, context);  // eval in eval

        return (expr) ? expr : this.getEvalExpressionFromFile(Url.normalizeURL(frame.script.fileName),
            frame.script.baseLineNumber, context);
    },

    getEvalExpressionFromFile: function(url, lineNo, context)
    {
        if (context && context.sourceCache)
        {
            var in_url = Url.reJavascript.exec(url);
            if (in_url)
            {
                var m = reEval.exec(in_url[1]);
                if (m)
                    return m[1];
                else
                    return null;
            }

            var htm = reHTM.exec(url);
            if (htm)
                lineNo = lineNo + 1; // embedded scripts seem to be off by one?  XXXjjb heuristic

            // Walk backwards from the first line in the function until we find the line which
            // matches the pattern above, which is the eval call
            var line = "";
            for (var i = 0; i < 3; ++i)
            {
                line = context.sourceCache.getLine(url, lineNo-i) + line;
                if (line && line != null)
                {
                    var m = reEval.exec(line);
                    if (m)
                        return m[1];
                }
            }
        }
        return null;
    },

    getEvalExpressionFromEval: function(frame, context)
    {
        var callingFrame = frame.callingFrame;
        var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, callingFrame.script);
        if (sourceFile)
        {
            if (FBTrace.DBG_EVAL)
            {
                FBTrace.sysout("debugger.getEvalExpressionFromEval sourceFile.href=" +
                    sourceFile.href);

                FBTrace.sysout("debugger.getEvalExpressionFromEval callingFrame.pc=" +
                    callingFrame.pc + " callingFrame.script.baseLineNumber=" +
                    callingFrame.script.baseLineNumber);
            }

            var lineNo = callingFrame.script.pcToLine(callingFrame.pc, PCMAP_SOURCETEXT);
            lineNo = lineNo - callingFrame.script.baseLineNumber + 1;
            var url  = sourceFile.href;

            if (FBTrace.DBG_EVAL && !context.sourceCache)
                FBTrace.sysout("debugger.getEvalExpressionFromEval context.sourceCache null??\n");

            // Walk backwards from the first line in the function until we find the line which
            // matches the pattern above, which is the eval call
            var line = "";
            for (var i = 0; i < 3; ++i)
            {
                line = context.sourceCache.getLine(url, lineNo-i) + line;
                if (FBTrace.DBG_EVAL)
                    FBTrace.sysout("debugger.getEvalExpressionFromEval lineNo-i="+lineNo+"-"+i+"="+
                        (lineNo-i)+" line:"+line+"\n");

                if (line && line != null)
                {
                    var m = reEval.exec(line);
                    if (m)
                        return m[1];     // TODO Lame: need to count parens, with escapes and quotes
                }
            }
        }
        return null;
    },

    getEvalBody: function(frame, asName, asLine, evalExpr)
    {
        if (evalExpr)
        {
            var result_src = {};
            var evalThis = "new String("+evalExpr+");";
            var evaled = frame.eval(evalThis, asName, asLine, result_src);

            if (evaled)
            {
                var src = Wrapper.unwrapIValue(result_src.value);
                return src+"";
            }
            else
            {
                // Either we failed, or this was a window.eval() call
                var source;

                if (frame.callingFrame && !this.avoidRecursing)
                {
                    // Try the caller, in case we are in window.eval() where the scope is global
                    this.avoidRecursing = true;
                    source = this.getEvalBody(frame.callingFrame, asName, asLine, evalExpr);
                    delete this.avoidRecursing;

                    if (FBTrace.DBG_EVAL)
                        FBTrace.sysout("callingFrame used to get source ", source);

                    return source;
                }

                if(evalExpr == "function(p,a,c,k,e,r")
                    source = "/packer/ JS compressor detected";
                else
                    source = frame.script.functionSource;

                return source+" /* !eval("+evalThis+")) */";
            }
        }
        else
        {
            return frame.script.functionSource; // XXXms - possible crash on OSX FF2
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Module

    initialize: function()
    {
        Firebug.clientID = this.registerClient(Firebug.JSDebugClient);
        this.nsICryptoHash = Components.interfaces["nsICryptoHash"];

        this.debuggerName =  window.location.href +"-@-"+Obj.getUniqueId();
        this.toString = function() { return this.debuggerName; };

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("debugger.initialize "+ this.debuggerName+" Firebug.clientID "+
                Firebug.clientID);

        this.hash_service = Xpcom.CCSV("@mozilla.org/security/hash;1", "nsICryptoHash");


        this.wrappedJSObject = this;  // how we communicate with fbs

        this.onFunctionCall = Obj.bind(this.onFunctionCall, this);

        Firebug.ActivableModule.initialize.apply(this, arguments);
    },

    shutdown: function()
    {
        //Firebug.connection.unregisterTool(this.asTool);

        Firebug.ActivableModule.destroy.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // BTI

    toolName: "script",

    addListener: function(listener)
    {
        Firebug.connection.addListener(listener);
    },

    removeListener: function(listener)
    {
        Firebug.connection.removeListener(listener);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * per-XUL window registration; this method just allows us to keep fbs in this file.
     * @param clientAPI an object that implements functions called by fbs for clients.
     */
    registerClient: function(clientAPI)
    {
        return FBS.registerClient(clientAPI);
    },

    unregisterClient: function(clientAPI)
    {
        FBS.unregisterClient(clientAPI);
    },

    enable: function()
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.Firebug.Debugger.enable; " + this.enabled);
    },

    disable: function()
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.Firebug.Debugger.disable; " + this.enabled);
    },

    selfObserver: {}, // empty listener, registered as observer while Script panel is enabled.

    initializeUI: function()
    {
        Firebug.ActivableModule.initializeUI.apply(this, arguments);
        this.obeyPrefs();
        this.filterButton = Firebug.chrome.$("fbScriptFilterMenu");  // TODO move to script.js
        this.filterMenuUpdate();
        if (FBS.isJSDActive())  // notify frontend of current state
            Firebug.JSDebugClient.onJSDActivate(true, 'Firebug.Debugger.initializeUI');
    },

    obeyPrefs: function()
    {
        var name = "script.enableSites";
        var value = Firebug.Options.get("script.enableSites");
        this.updateOption(name, value);
    },

    initContext: function(context, persistedState)
    {
        if (persistedState)
            context.dynamicURLhasBP = persistedState.dynamicURLhasBP;

        context.dynamicURLIndex = 1; // any dynamic urls need to be unique to the context.

        context.jsDebuggerCalledUs = false;

        Firebug.ActivableModule.initContext.apply(this, arguments);
    },

    showContext: function(browser, context)
    {
        // then context was not active during load
        if (context && context.loaded && !context.onLoadWindowContent)
            this.updateScriptFiles(context);
    },

    // scan windows for 'script' tags (only if debugger is not enabled)
    updateScriptFiles: function(context)
    {
        function addFile(url, scriptTagNumber, dependentURL)
        {
            var sourceFile = new Firebug.ScriptTagSourceFile(context, url, scriptTagNumber);
            sourceFile.dependentURL = dependentURL;
            context.addSourceFile(sourceFile);
            return true;
        }

        Win.iterateWindows(context.window, function updateEachWin(win)
        {
            if (FBTrace.DBG_SOURCEFILES)
                FBTrace.sysout("updateScriptFiles Win.iterateWindows: "+win.location.href+
                    " documentElement: "+win.document.documentElement);

            if (!win.document.documentElement)
                return;

            var url = Url.normalizeURL(win.location.href);

            if (url)
            {
                if (!context.sourceFileMap.hasOwnProperty(url))
                {
                    var URLOnly = new Firebug.NoScriptSourceFile(context, url);
                    context.addSourceFile(URLOnly);

                    if (FBTrace.DBG_SOURCEFILES)
                        FBTrace.sysout("updateScriptFiles created NoScriptSourceFile for URL:" +
                            url, URLOnly);
                }
            }

            var baseUrl = win.location.href;
            var bases = win.document.documentElement.getElementsByTagName("base");
            if (bases && bases[0])
            {
                baseUrl = bases[0].href;
            }

            var scripts = win.document.documentElement.getElementsByTagName("script");
            for (var i = 0; i < scripts.length; ++i)
            {
                var scriptSrc = scripts[i].getAttribute('src'); // for XUL use attribute
                var url = scriptSrc ? Url.absoluteURL(scriptSrc, baseUrl) : win.location.href;
                url = Url.normalizeURL(url ? url : win.location.href);
                var added = addFile(url, i, (scriptSrc?win.location.href:null));

                if (FBTrace.DBG_SOURCEFILES)
                    FBTrace.sysout("updateScriptFiles "+(scriptSrc?"inclusion":"inline")+
                        " script #"+i+"/"+scripts.length+(added?" adding ":" readded ")+url+
                        " to context="+context.getName()+"\n");
            }
        });

        if (FBTrace.DBG_SOURCEFILES)
        {
            FBTrace.sysout("updateScriptFiles sourcefiles:",
                Firebug.SourceFile.sourceFilesAsArray(context.sourceFileMap));
        }
    },

    loadedContext: function(context)
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("loadedContext needs to trigger watchpanel updates");

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("debugger("+this.debuggerName+").loadedContext enabled on load: "+
                context.onLoadWindowContent+" context.sourceFileMap", context.sourceFileMap);
    },

    // clean up the source file map in case the frame is being reloaded.
    unwatchWindow: function(context, win)
    {
        var scriptTags = win.document.getElementsByTagName("script");
        for (var i = 0; i < scriptTags.length; i++)
        {
            var src = scriptTags[i].getAttribute("src");
            src = src ? src : Win.safeGetWindowLocation(win);

            // If the src is not in the source map, try to use absolute url.
            if (!context.sourceFileMap[src])
                src = Url.absoluteURL(src, win.location.href);

            delete context.sourceFileMap[src];

            if (FBTrace.DBG_SOURCEFILES)
                FBTrace.sysout("debugger.unWatchWindow; delete sourceFileMap entry for " + src);
        }
        if (scriptTags.length > 0)
            context.invalidatePanels('script');
    },

    destroyContext: function(context, persistedState)
    {
        Firebug.ActivableModule.destroyContext.apply(this, arguments);

        if (context.stopped)
        {
            // the abort will call resume, but the nestedEventLoop would continue the load...
            this.abort(context);
        }

        if (persistedState)
        {
            if (context.dynamicURLhasBP)
                persistedState.dynamicURLhasBP = context.dynamicURLhasBP;
            else
                delete persistedState.dynamicURLhasBP;
        }
    },

    updateOption: function(name, value)
    {
        if (name == "breakOnErrors")
            Firebug.chrome.getElementById("cmd_firebug_breakOnErrors").setAttribute("checked", value);
    },

    getObjectByURL: function(context, url)
    {
        var sourceFile = Firebug.SourceFile.getSourceFileByHref(url, context);
        if (sourceFile)
            return new SourceLink.SourceLink(sourceFile.href, 0, "js");
    },

    shutdown: function()
    {
        this.unregisterClient(Firebug.JSDebugClient);
        FBS.unregisterDebugger(this);
    },

    /**
     * 1.3.1 safe for multiple calls
     */
    registerDebugger: function()
    {
        // Do not activate JSD on shutdown.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=756267#c12
        if (Firebug.isShutdown)
            return;

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("registerDebugger");

        // this will eventually set 'jsd' on the statusIcon
        var check = FBS.registerDebugger(this);

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.registerDebugger "+check+" debuggers");
    },

    unregisterDebugger: function() // 1.3.1 safe for multiple calls
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.unregisterDebugger");

        // stay registered if we are profiling across a reload.
        if (Firebug.Profiler && Firebug.Profiler.isProfiling())
            return;

        var check = FBS.unregisterDebugger(this);

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.unregisterDebugger: "+check+" debuggers");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends ActivableModule

    onObserverChange: function(observer)
    {
        if (FBTrace.DBG_ACTIVATION)
        {
            var names = [];
            this.observers.forEach(function(ob){names.push(ob.name || ob.dispatchName || ob.toolName);});

            FBTrace.sysout("debugger.onObserverChange "+this.hasObservers()+" "+
                this.observers.length+": "+names.join(','), this.observers);
        }

        if (this.hasObservers())
            this.activateDebugger();
        else
            this.deactivateDebugger();
    },

    activateDebugger: function()
    {
        this.registerDebugger();

        // If jsd is already active, we'll notify true; else we'll get another event
        var isActive = FBS.isJSDActive();
        if (isActive)
            Firebug.JSDebugClient.onJSDActivate(true, 'activated already');

        if (FBTrace.DBG_PANELS || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.activateDebugger requested; activated already? "+isActive);
    },

    deactivateDebugger: function()
    {
        this.unregisterDebugger();

        var isActive = FBS.isJSDActive();
        if (!isActive)
            Firebug.JSDebugClient.onJSDDeactivate(false, 'deactivate');

        if (FBTrace.DBG_PANELS || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.deactivate");
    },

    onSuspendingFirebug: function()
    {
        var anyStopped = Firebug.TabWatcher.iterateContexts(function isAnyStopped(context)
        {
            return context.stopped;
        });

        return anyStopped;
    },

    onSuspendFirebug: function()
    {
        if (!Firebug.Debugger.isAlwaysEnabled())
            return;

        // can be called multiple times.
        var paused = FBS.pause(this.debuggerName);

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.onSuspendFirebug paused: "+paused+" isAlwaysEnabled " +
                Firebug.Debugger.isAlwaysEnabled());

        // JSD activation is not per browser-tab, so FBS.pause can return 'not-paused' when
        // Firebug is activated on another tab.
        // The start-button should somehow reflect that JSD can be still active (even if
        // Firebug is suspended for the current tab).
        if (!paused)  // then we failed to suspend, undo
            return true;

        return false;
    },

    onResumeFirebug: function()
    {
        if (!Firebug.Debugger.isAlwaysEnabled())
            return;

        var unpaused = FBS.unPause();

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.onResumeFirebug unpaused: "+unpaused+" isAlwaysEnabled " +
                Firebug.Debugger.isAlwaysEnabled());
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Menu in toolbar.

    onScriptFilterMenuTooltipShowing: function(tooltip, context)
    {
        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("onScriptFilterMenuTooltipShowing not implemented");
    },

    onScriptFilterMenuCommand: function(event, context)
    {
        var menu = event.target;
        Firebug.Options.set("scriptsFilter", menu.value);
        Firebug.Debugger.filterMenuUpdate();
    },

    menuFullLabel:
    {
        "static": Locale.$STR("ScriptsFilterStatic"),
        evals: Locale.$STR("ScriptsFilterEval"),
        events: Locale.$STR("ScriptsFilterEvent"),
        all: Locale.$STR("ScriptsFilterAll"),
    },

    menuShortLabel:
    {
        "static": Locale.$STR("ScriptsFilterStaticShort"),
        evals: Locale.$STR("ScriptsFilterEvalShort"),
        events: Locale.$STR("ScriptsFilterEventShort"),
        all: Locale.$STR("ScriptsFilterAllShort"),
    },

    onScriptFilterMenuPopupShowing: function(menu, context)
    {
        if (this.menuTooltip)
            this.menuTooltip.fbEnabled = false;

        var items = menu.getElementsByTagName("menuitem");
        var value = this.filterButton.value;

        for (var i=0; i<items.length; i++)
        {
            var option = items[i].value;
            if (!option)
                continue;

            if (option == value)
                items[i].setAttribute("checked", "true");

            items[i].label = Firebug.Debugger.menuFullLabel[option];
        }

        return true;
    },

    onScriptFilterMenuPopupHiding: function(tooltip, context)
    {
        if (this.menuTooltip)
            this.menuTooltip.fbEnabled = true;

        return true;
    },

    filterMenuUpdate: function()
    {
        var value = Firebug.Options.get("scriptsFilter");
        this.filterButton.value = value;
        this.filterButton.label = this.menuShortLabel[value];
        this.filterButton.removeAttribute("disabled");
        this.filterButton.setAttribute("value", value);
        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("debugger.filterMenuUpdate value: "+value+" label:"+
                this.filterButton.label+'\n');
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    resetAllOptions: function()
    {
        Firebug.TabWatcher.iterateContexts( function clearBPs(context)
        {
            Firebug.Debugger.clearAllBreakpoints(context);
        });

        var breakpointStore = FBS.getBreakpointStore();
        breakpointStore.clear(true);
    }
});

// ********************************************************************************************* //

Firebug.Debugger.Breakpoint = function(name, href, lineNumber, checked, sourceLine, isFuture)
{
    this.name = name;
    this.href = href;
    this.lineNumber = lineNumber;
    this.checked = checked;
    this.sourceLine = sourceLine;
    this.isFuture = isFuture;
};

// ********************************************************************************************* //

Firebug.DebuggerListener =
{
    onStop: function(context, frame, type, rv)
    {
    },

    onResume: function(context)
    {
    },

    onThrow: function(context, frame, rv)
    {
        return false; /* continue throw */
    },

    onError: function(context, frame, error)
    {
    },

    onEventScriptCreated: function(context, frame, url, sourceFile)
    {
    },

    onTopLevelScriptCreated: function(context, frame, url, sourceFile)
    {
    },

    onEvalScriptCreated: function(context, frame, url, sourceFile)
    {
    },

    onFunctionConstructor: function(context, frame, ctor_script, url, sourceFile)
    {
    }
};

// ********************************************************************************************* //
// Signals from fbs, passed along to our listeners

Firebug.JSDebugClient =
{
    onJSDActivate: function(active, fromMsg)
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.JSDebugClient onJSDActivate "+active+" "+fromMsg);
        Firebug.connection.dispatch("onActivateTool", ["script", active]);
    },

    onJSDDeactivate: function(active, fromMsg)
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.JSDebugClient onJSDDeactivate "+active+" "+fromMsg);
        Firebug.connection.dispatch("onActivateTool", ["script", active]);
    },

    onPauseJSDRequested: function(rejection, debuggerName)
    {
        // A debugger client (an instance of Firebug.JSDebugClient) asked to pause JSD.
        // Note that there is one instance of Firebug.JSDebugClient per browser (XUL) window.
        // If the debugger is 'on' in this browser window JSD and the request comes from
        // another window (debugger) JSD should *not* be paused (see issue 4609).
        // So, reject only if the request comes from another browser window and Firebug
        // is resumed in this window.
        if (debuggerName != Firebug.Debugger.debuggerName && !Firebug.getSuspended())
        {
            rejection.push(true);

            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Firebug.JSDebugClient onPauseJSDRequested rejected to suspend; " +
                    "Current debugger: " + Firebug.Debugger.debuggerName + ", requestor debugger: " +
                    debuggerName);
        }

        //Firebug.connection.dispatch("onPauseJSDRequested", arguments);

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("Firebug.JSDebugClient onPauseJSDRequested rejection: " +
                rejection.length + ", jsDebuggerOn: " + Firebug.jsDebuggerOn);
    }
};

// Recursively look for obj in container using array of visited objects
function findObjectPropertyPath(containerName, container, obj, visited)
{
    if (!container || !obj || !visited)
        return false;

    var referents = [];
    visited.push(container);
    for (var p in container)
    {
        if (container.hasOwnProperty(p))
        {
            var candidate = null;
            try
            {
                candidate = container[p];
            }
            catch(exc)
            {
                // eg sessionStorage
            }

            if (candidate === obj) // then we found a property pointing to our obj
            {
                referents.push(new Referent(containerName, container, p, obj));
            }
            else // recurse
            {
                var candidateType = typeof (candidate);
                if (candidateType === 'object' || candidateType === 'function')
                {
                    if (visited.indexOf(candidate) === -1)
                    {
                        var refsInChildren = findObjectPropertyPath(p, candidate, obj, visited);
                        if (refsInChildren.length)
                        {
                            // As we unwind the recursion we tack on layers of the path.
                            for (var i = 0; i < refsInChildren.length; i++)
                            {
                                var refInChildren = refsInChildren[i];
                                refInChildren.prependPath(containerName, container);
                                referents.push(refInChildren);

                                FBTrace.sysout(" Did prependPath with p "+p+" gave "+
                                    referents[referents.length - 1].getObjectPathExpression(),
                                    referents[referents.length - 1]);
                            }
                        }
                    }
                    //else we already looked at that object.
                } // else the object has no properties
            }
        }
    }

    FBTrace.sysout(" Returning "+referents.length+ " referents", referents);

    return referents;
}

// ********************************************************************************************* //

function getFrameWindow(frame)
{
    var result = {};
    if (frame.eval("window", "", 1, result))
    {
        var win = Wrapper.unwrapIValue(result.value, Firebug.viewChrome);
        return Win.getRootWindow(win);
    }
}

function ArrayEnumerator(array)
{
    this.index = 0;
    this.array = array;
    this.hasMoreElements = function()
    {
        return (this.index < array.length);
    };
    this.getNext = function()
    {
        return this.array[++this.index];
    };
}

// ********************************************************************************************* //
// Registration

Firebug.registerActivableModule(Firebug.Debugger);

return Firebug.Debugger;

// ********************************************************************************************* //
});
