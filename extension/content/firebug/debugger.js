/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
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

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const tooltipTimeout = 300;

const reLineNumber = /^[^\\]?#(\d*)$/;

const reEval =  /\s*eval\s*\(([^)]*)\)/m;        // eval ( $1 )
const reHTM = /\.[hH][tT][mM]/;
const reFunction = /\s*Function\s*\(([^)]*)\)/m;
const reTooMuchRecursion = /too\smuch\srecursion/;

// ************************************************************************************************

Firebug.Debugger = extend(Firebug.ActivableModule,
{
    dispatchName: "debugger",
    fbs: fbs, // access to firebug-service in chromebug under browser.xul.DOM.Firebug.Debugger.fbs /*@explore*/

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Debugging

    hasValidStack: function(context)
    {
        return context.stopped && context.currentFrame.isValid;
    },

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

        var value = unwrapIValue(result.value);
        if (ok)
            return value;
        else
            throw value;
    },

    evaluateInCallingFrame: function(js, fileName, lineNo)
    {
        return this.halt(function evalInFrame(frame)
        {
            window.dump("evaluateInCallingFrame "+frame.script.fileName+" stack: "+getJSDStackDump(frame)+"\n");
            var result = {};
            var ok = frame.eval(js, fileName, lineNo, result);
            var value = unwrapIValue(result.value);
            if (ok)
                return value;
            else
                throw value;
        });
    },

    /*
     * Used by autocomplete in commandLine
     * @return array of global property names
     */

    getCurrentFrameKeys: function(context)  // TODO remote
    {
        var globals = keys(context.getGlobalScope().wrappedJSObject);  // return is safe

        if (context.currentFrame)
            return this.getFrameKeys(context.currentFrame, globals);

        return globals;
    },

    /*
     * private to Debugger, returns list of strings
     */
    getFrameKeys: function(frame, names)  // TODO backend
    {
        var listValue = {value: null}, lengthValue = {value: 0};
        frame.scope.getProperties(listValue, lengthValue);

        for (var i = 0; i < lengthValue.value; ++i)
        {
            var prop = listValue.value[i];
            var name = unwrapIValue(prop.name);
            names.push(name);
        }
        return names;
    },

    /* @Deprecated  see chrome.js */
    focusWatch: function(context)  // TODO moved
    {
        return Firebug.chrome.focusWatch(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Private to Debugger

    beginInternalOperation: function() // stop debugger operations like breakOnErrors
    {
        var state = {breakOnErrors: Firebug.breakOnErrors};
        Firebug.breakOnErrors = false;
        return state;
    },

    endInternalOperation: function(state)  // pass back the object given by beginInternalOperation
    {
        Firebug.breakOnErrors = state.breakOnErrors;
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    halt: function(fnOfFrame)
    {
        if(FBTrace.DBG_BP)
            FBTrace.sysout('debugger.halt '+fnOfFrame);

        return fbs.halt(this, fnOfFrame);
    },

    breakAsIfDebugger: function(frame)
    {
        var debuggr = fbs.findDebugger(frame); // should return 'this' but also sets this.breakContext
        fbs.breakIntoDebugger(debuggr, frame, 3);
    },

    // This URL prefix is used to skip frames from chrome URLs. Note that sometimes chrome URLs
    // are used even in web pages, but only in rare cases so don't worry about it.
    // Don't be specific like: chrome://firebug/ since frames coming from extensions e.g.
    // chrome://firecookie/ wouldn't be skipped then.
    breakNowURLPrefix: "chrome://",

    breakNow: function(context)
    {
        Firebug.Debugger.halt(function haltAnalysis(frame)
        {
            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("debugger.breakNow: frame "+frame.script.fileName+" context "+context.getName(), getJSDStackDump(frame) );

            for (; frame && frame.isValid; frame = frame.callingFrame)
            {
                var fileName = frame.script.fileName;
                if (!fileName)
                    continue;
                else if (fileName.indexOf(Firebug.Debugger.breakNowURLPrefix) == 0)
                    continue;
                else if (fileName.indexOf("/modules/firebug-") != -1)
                    continue;
                else
                    break;
            }

            if (frame)
            {
                Firebug.Debugger.breakContext = context;
                Firebug.Debugger.onBreak(frame, "halt"); // I just made up a type that won't match TYPE_DEBUGGER_KEYWORD
            }
            else
            {
                if (FBTrace.DBG_UI_LOOP)
                    FBTrace.sysout("debugger.breakNow: no frame that not starting with "+Firebug.Debugger.breakNowURLPrefix);
            }
        });
    },

    stop: function(context, frame, type, rv)
    {
        if (context.stopped)
            return RETURN_CONTINUE;

        if (!this.isAlwaysEnabled())
            return RETURN_CONTINUE;

        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("debugger.stop "+context.getName()+" frame",frame);

        context.stoppedFrame = frame;  // the frame we stopped in, don't change this elsewhere.
        context.currentFrame = frame;  // the frame we show to user, depends on selection
        context.stopped = true;

        var hookReturn = dispatch2(this.fbListeners,"onStop",[context,frame, type,rv]);
        if ( hookReturn && hookReturn >= 0 )
        {
            delete context.stopped;
            delete context.stoppedFrame;
            delete context.currentFrame;
            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("debugger.stop extension vetoed stop with hookReturn "+hookReturn);

            return hookReturn;
        }

        try
        {
             this.freeze(context);
            // We will pause here until resume is called
            var depth = fbs.enterNestedEventLoop({onNest: bindFixed(this.startDebugging, this, context)});
            // For some reason we don't always end up here
            if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("debugger.stop, depth:"+depth+" context:"+context.getName());
        }
        catch (exc)
        {
            // Just ignore exceptions that happened while in the nested loop
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("debugger exception in nested event loop: "+exc, exc);
            else     // else /*@explore*/
                ERROR("debugger exception in nested event loop: "+exc+"\n");
        }
        finally
        {
            this.thaw(context);
        }

        this.stopDebugging(context);

        dispatch(this.fbListeners,"onResume",[context]);

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
                    dispatch(Firebug.Debugger.fbListeners, "onRerunComplete", [true, result]);
                }
                function exceptionFunction(result, context)
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("Firebug.debugger.reExecute FAILED "+result, result);
                    dispatch(Firebug.Debugger.fbListeners, "onRerunComplete", [failed, result]);
                }
                Firebug.CommandLine.evaluate("window._firebug.rerunFunction()", context, null, context.window, successConsoleFunction, exceptionFunction);

            });

            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("Firebug.debugger.reExecute return "+RETURN_HOOK_ERROR);

            return RETURN_HOOK_ERROR;
        }
        else
            return RETURN_CONTINUE;
    },

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
            //
            function getStoreRerunInfoScript(fnName)
            {
                var str = "if (!window._firebug)window._firebug={};\n";
                str += "window._firebug.rerunThis = this;\n";
                str += "window._firebug.rerunArgs = [];\n"
                str += "if (arguments && arguments.length) for (var i = 0; i < arguments.length; i++) window._firebug.rerunArgs.push(arguments[i]);\n"
                str += "window._firebug.rerunFunctionName = "+fnName+";\n"
                str +="window._firebug.rerunFunction = function _firebugRerun() { "+fnName+".apply(window._firebug.rerunThis, window._firebug.rerunArgs); }"
                return str;
            }

            var rerun = {};

            var fnName = getFunctionName(frame.script, context, frame, true);
            rerun.script = getStoreRerunInfoScript(fnName);
            var jsdFunctionName = frame.script.functionName;

            // now run the script that stores the rerun info in the page
            var result = {};
            var ok = frame.eval(rerun.script, context.window.location + "/RerunScript", 1, result);

            // If the eval goes off somewhere wacky, the frame may be invalid by this point.
            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("debugger.rerun "+ok+" and result: "+result+" for "+context.getName(), {result: result, rerun: rerun, functionName: jsdFunctionName});
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("debugger.rerun FAILS for "+context.getName()+" because "+exc, {exc:exc, rerun: rerun});
        }

        return rerun;
    },

    resume: function(context)
    {
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("debugger.resume, context.stopped:"+context.stopped+"\n");

        // this will cause us to return to just after the enterNestedEventLoop call
        var depth = fbs.exitNestedEventLoop();
        if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("debugger.resume, depth:"+depth+"\n");
    },

    abort: function(context)
    {
        if (context.stopped)
        {
            context.aborted = true;
            this.thaw(context);
            this.resume(context);
            fbs.unPause(true);
        }
    },

    stepOver: function(context)
    {
        if (!context.stoppedFrame || !context.stoppedFrame.isValid)
            return;

        fbs.step(STEP_OVER, context.stoppedFrame, this);
        this.resume(context);
    },

    stepInto: function(context)
    {
        if (!context.stoppedFrame || !context.stoppedFrame.isValid)
            return;

        fbs.step(STEP_INTO, context.stoppedFrame, this);
        this.resume(context);
    },

    stepOut: function(context)
    {
        if (!context.stoppedFrame || !context.stoppedFrame.isValid)
            return;

        fbs.step(STEP_OUT, context.stoppedFrame);
        this.resume(context);
    },

    suspend: function(context)
    {
        if (context.stopped)
            return;
        fbs.suspend(this, context);
    },

    unSuspend: function(context)
    {
        fbs.stopStepping();  // TODO per context
    },

    runUntil: function(context, compilationUnit, lineNo)
    {
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("runUntil "+lineNo+" @"+compilationUnit);

        if (!context.stoppedFrame || !context.stoppedFrame.isValid)
            return;

        fbs.runUntil(compilationUnit, lineNo, context.stoppedFrame, this);
        this.resume(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    freeze: function(context)
    {
        var executionContext = context.stoppedFrame.executionContext;
        try {
            executionContext.scriptsEnabled = false;
            this.suppressEventHandling(context);
            context.isFrozen = true;

            // https://developer.mozilla.org/en/XUL_Tutorial/Focus_and_Selection#Getting_the_currently_focused_element
            if (context.window.document.commandDispatcher)
            {
                context.saveFocus = context.window.document.commandDispatcher.focusedElement;
                if (context.saveFocus && !context.discardBlurEvents)
                {
                    context.discardBlurEvents = function blurDiscarder(event)
                    {
                        if (!context.saveFocus)
                        {
                            context.window.removeEventListener('blur', context.discardBlurEvents, true);
                            delete context.discardBlurEvents;
                        }

                        if (FBTrace.DBG_UI_LOOP)
                            FBTrace.sysout("debugger.freeze discard blur event "+context.saveFocus+" while focus is "+context.window.document.commandDispatcher.focusedElement, event);
                        event.preventDefault();
                        event.stopPropagation();
                    },

                    context.window.addEventListener('blur', context.discardBlurEvents, true);
                }
            }

            if (FBTrace.DBG_UI_LOOP)
            {
                FBTrace.sysout("debugger.freeze context.saveFocus "+context.saveFocus, context.saveFocus);
                FBTrace.sysout("debugger.freeze try to disable scripts "+(context.eventSuppressor?"and events":"but not events")+" in "+context.getName()+" executionContext.tag "+executionContext.tag+".scriptsEnabled: "+executionContext.scriptsEnabled);
            }
        }
        catch (exc)
        {
            // This attribute is only valid for contexts which implement nsIScriptContext.
            if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("debugger.freeze, freeze exception "+exc+" in "+context.getName(), exc);
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
                }

                if (FBTrace.DBG_UI_LOOP)
                {
                    var nowFocused = context.window.document.commandDispatcher ? context.window.document.commandDispatcher.focusedElement : null;
                    FBTrace.sysout("debugger.thaw context.saveFocus "+context.saveFocus+" vs "+nowFocused, context.saveFocus);
            }

                executionContext.scriptsEnabled = true;
            }
            else
            {
                if (FBTrace.DBG_UI_LOOP)
                    FBTrace.sysout("debugger.thaw "+executionContext.tag+" executionContext is not valid");
            }
            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("debugger.thaw try to enable scripts "+(context.eventSuppressor?"with events suppressed":"events enabled")+" in "+context.getName()+" executionContext.tag "+executionContext.tag+".scriptsEnabled: "+executionContext.scriptsEnabled);
        } catch (exc) {
            if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("debugger.stop, scriptsEnabled = true exception:", exc);
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

    toggleFreezeWindow: function(context)
    {
        if (!context.stopped) // then we need to break into debugger to get the executionContext
        {
            Firebug.Debugger.halt(function grabContext(frame)
            {
                context.stoppedFrame = frame;
                Firebug.Debugger.doToggleFreezeWindow(context);
                delete context.stoppedFrame;
            });

            Firebug.Debugger.toggleReportTopLevel(context);
            Firebug.Debugger.suspend(context);
        }
        else
        {
            Firebug.Debugger.doToggleFreezeWindow(context);
        }
    },

    doToggleFreezeWindow: function(context)
    {
        if (context.isFrozen)
            Firebug.Debugger.unsuppressEventHandling(context);
        else
            Firebug.Debugger.suppressEventHandling(context);
    },

    toggleReportTopLevel: function(context)
    {
        if (context.reportTopLevel)
            fbs.setTopLevelHook(null);
        else
        {
            fbs.setTopLevelHook(Firebug.Debugger, function reportTopLevel(frame)
            {
                Firebug.Console.logFormatted(["Javascript entered", frame.script.fileName, frame.line], context, "info");
            });
        }
    },
    setBreakOnNextCause: function(context, frame)  // TODO this should be in the panel (front end)
    {
        var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, frame.script);
        var analyzer = sourceFile.getScriptAnalyzer(frame.script);
        var lineNo = analyzer.getSourceLineFromFrame(context, frame);

        context.breakingCause = {
                title: $STR("Break On Next"),
                message: $STR("Disable converts pause to disabled breakpoint"), //xxxHonza localization
                skipAction: function addSkipperAndGo()
                {
                    // a breakpoint that never hits, but prevents debugger keyword (see fbs.onDebugger as well)
                    var bp = Firebug.Debugger.setBreakpoint(sourceFile, lineNo);
                    fbs.disableBreakpoint(sourceFile.href, lineNo);
                    if (FBTrace.DBG_BP)
                        FBTrace.sysout("debugger.setBreakOnNextCause converted to disabled bp "+sourceFile.href+"@"+lineNo+" tag: "+frame.script.tag, bp);

                    Firebug.Debugger.resume(context);
                },
                okAction: function justGo()
                {
                    Firebug.Debugger.resume(context);
                },
        };
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Breakpoints

    setBreakpoint: function(sourceFile, lineNo)
    {
        if (sourceFile instanceof CompilationUnit)
            sourceFile = sourceFile.sourceFile;  // see HACK in tabContext
        fbs.setBreakpoint(sourceFile, lineNo, null, Firebug.Debugger);
    },

    clearBreakpoint: function(sourceFile, lineNo)
    {
        fbs.clearBreakpoint(sourceFile.href, lineNo);
    },

    setErrorBreakpoint: function(sourceFile, line)
    {
        fbs.setErrorBreakpoint(sourceFile, line, Firebug.Debugger);
    },

    clearErrorBreakpoint: function(sourceFile, line)
    {
        fbs.clearErrorBreakpoint(sourceFile.href, line, Firebug.Debugger);
    },

    clearAllBreakpoints: function(context)
    {
        if (context)
        {
            var units = context.getAllCompilationUnits();
            fbs.clearAllBreakpoints(units, Firebug.Debugger);
        }
        else
        {
            fbs.enumerateBreakpoints(null, {call: function(url, lineNo, bp) // null means all urls
            {
                if (bp.debuggerName !== Firebug.Debugger.debuggerName) // skip breakpoints of other debuggers.
                    return;

                if (context && !context.getCompilationUnit(url)) // then we want to clear only one context,
                    return;                                      // so skip URLs in other contexts

                fbs.clearBreakpoint(url, lineNo);
            }});
        }
    },

    enableAllBreakpoints: function(context)
    {
        if (FBTrace.DBG_BP)
            FBTrace.sysout("enableAllBreakpoints sourceFileMap:", context.sourceFileMap);
        for (var url in context.sourceFileMap)
        {
            fbs.enumerateBreakpoints(url, {call: function(url, lineNo)
            {
                fbs.enableBreakpoint(url, lineNo);
            }});
        }
    },

    disableAllBreakpoints: function(context)
    {
        for (var url in context.sourceFileMap)
        {
            fbs.enumerateBreakpoints(url, {call: function(url, lineNo)
            {
                fbs.disableBreakpoint(url, lineNo);
            }});
        }
    },

    getBreakpointCount: function(context)
    {
        var count = 0;
        for (var url in context.sourceFileMap)
        {
            fbs.enumerateBreakpoints(url,
            {
                call: function(url, lineNo)
                {
                    ++count;
                }
            });

            fbs.enumerateErrorBreakpoints(url,
            {
                call: function(url, lineNo)
                {
                    ++count;
                }
            });
        }
        return count;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Debugging and monitoring

    traceAll: function(context)
    {
        fbs.traceAll(sourceURLsAsArray(context), this);
    },

    untraceAll: function(context)
    {
        fbs.untraceAll(this);
    },

    monitorFunction: function(fn, mode)
    {
        if (typeof(fn) == "function" || fn instanceof Function)
        {
            var script = findScriptForFunctionInContext(Firebug.currentContext, fn);
            if (script)
                this.monitorScript(fn, script, mode);
            else
                Firebug.Console.logFormatted(["Firebug unable to locate jsdIScript for function", fn], Firebug.currentContext, "info");
        }
        else
        {
            Firebug.Console.logFormatted(["Firebug.Debugger.monitorFunction requires a function", fn], Firebug.currentContext, "info");
        }
    },

    unmonitorFunction: function(fn, mode)
    {
        if (typeof(fn) == "function" || fn instanceof Function)
        {
            var script = findScriptForFunctionInContext(Firebug.currentContext, fn);
            if (script)
                this.unmonitorScript(fn, script, mode);
        }
    },

    monitorScript: function(fn, script, mode)
    {
        var scriptInfo = Firebug.SourceFile.getSourceFileAndLineByScript(Firebug.currentContext, script);
        if (scriptInfo)
        {
            if (mode == "debug")
                Firebug.Debugger.setBreakpoint(scriptInfo.sourceFile, scriptInfo.lineNo);
            else if (mode == "monitor")
                fbs.monitor(scriptInfo.sourceFile, scriptInfo.lineNo, Firebug.Debugger);
        }
    },

    unmonitorScript: function(fn, script, mode)
    {
        var scriptInfo = Firebug.SourceFile.getSourceFileAndLineByScript(Firebug.currentContext, script);
        if (scriptInfo)
        {
            if (mode == "debug")
                this.clearBreakpoint(scriptInfo.sourceFile, scriptInfo.lineNo);
            else if (mode == "monitor")
                fbs.unmonitor(scriptInfo.sourceFile.href, scriptInfo.lineNo);
        }
    },

    traceCalls: function(context, fn)
    {
        if (typeof(fn) == "function" || fn instanceof Function)
        {
            var script = findScriptForFunctionInContext(context, fn);
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
            var script = findScriptForFunctionInContext(context, fn);
            if (script)
                this.untraceScriptCalls(context, script);
        }
    },

    traceScriptCalls: function(context, script)
    {
        var scriptInfo = Firebug.SourceFile.getSourceFileAndLineByScript(context, script);
        if (scriptInfo)
            fbs.traceCalls(scriptInfo.sourceFile, scriptInfo.lineNo, Firebug.Debugger);
    },

    untraceScriptCalls: function(context, script)
    {
        var scriptInfo = Firebug.SourceFile.getSourceFileAndLineByScript(context, script);
        if (scriptInfo)
            fbs.untraceCalls(scriptInfo.sourceFile, scriptInfo.lineNo, Firebug.Debugger);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // UI Stuff

    /*
     * Called when a nestedEventLoop begins
     */
    startDebugging: function(context)
    {
        if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("startDebugging enter context.stopped:"+context.stopped+" for context: "+context.getName()+"\n");
        try {

            fbs.lockDebugger();

            context.executingSourceFile = Firebug.SourceFile.getSourceFileByScript(context, context.stoppedFrame.script);

            if (!context.executingSourceFile)  // bail out, we don't want the user stuck in debug with out source.
            {
                if (FBTrace.DBG_UI_LOOP)
                    FBTrace.sysout("startDebugging resuming, no sourceFile for "+context.stoppedFrame.script.fileName, context.stoppedFrame.script.functionSource);
                this.resume(context);
                return;
            }

            var currentBreakable = Firebug.chrome.getGlobalAttribute("cmd_breakOnNext", "breakable");

            if (FBTrace.DBG_BP)
                FBTrace.sysout("debugger.startDebugging; currentBreakable "+currentBreakable+" in " + context.getName());

            if (currentBreakable == "false") // then we are armed but we broke
                Firebug.chrome.setGlobalAttribute("cmd_breakOnNext", "breakable", "true");

            if (context != Firebug.currentContext || Firebug.isDetached())
                Firebug.selectContext(context);  // Make Firebug.currentContext = context and sync the UI

            if (Firebug.isMinimized()) // then open the UI to show we are stopped
                Firebug.unMinimize();

            this.syncCommands(context);
            this.syncListeners(context);

            // Update Break on Next lightning.
            var panel = context.getPanel("script", true);
            Firebug.Breakpoint.updatePanelTab(panel, false);
            Firebug.chrome.syncPanel("script");  // issue 3463
            Firebug.chrome.select(context.stoppedFrame, "script", null, true);
            Firebug.chrome.focus();
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Resuming debugger: error during debugging loop: "+exc, exc);
            Firebug.Console.log("Resuming debugger: error during debugging loop: "+exc);
            this.resume(context);
        }

        dispatch(this.fbListeners, "onStartDebugging", [context]);

        if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("startDebugging exit context.stopped:"+context.stopped+" for context: "+context.getName()+"\n");
    },

    /*
     * Called in the main event loop, from jsd, after we have exited the nested event loop
     */

    stopDebugging: function(context)
    {
        if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("stopDebugging enter context: "+context.getName()+"\n");
        try
        {
            fbs.unlockDebugger();

            // If the user reloads the page while the debugger is stopped, then
            // the current context will be destroyed just before
            if (context && context.window && !context.aborted)
            {
                delete context.stopped;
                delete context.stoppedFrame;
                delete context.currentFrame;
                context.executingSourceFile = null;
                delete context.breakLineNumber;

                var chrome = Firebug.chrome;

                this.syncCommands(context);
                this.syncListeners(context);

                var panel = context.getPanel("script", true);
                if (panel && panel == Firebug.chrome.getSelectedPanel())
                    panel.showNoStackFrame(); // unhighlight and remove toolbar-status line

                if (panel)
                    panel.highlight(false);

                chrome.syncSidePanels();  // after main panel is all updated.
            }
            else
            {
                if (FBTrace.DBG_UI_LOOP)
                    FBTrace.sysout("debugger.stopDebugging else "+context.getName()+" "+safeGetWindowLocation(context.window));
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("debugger.stopDebugging FAILS", exc);
            // If the window is closed while the debugger is stopped,
            // then all hell will break loose here
            ERROR(exc);
        }
    },

    syncCommands: function(context)
    {
        var chrome = Firebug.chrome;
        if (!chrome)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("debugger.syncCommand, context with no chrome: "+context.getGlobalScope());
            return;
        }

        if (context.stopped)
        {
            chrome.setGlobalAttribute("fbDebuggerButtons", "stopped", "true");
            chrome.setGlobalAttribute("cmd_rerun", "disabled", "false");
            chrome.setGlobalAttribute("cmd_resumeExecution", "disabled", "false");
            chrome.setGlobalAttribute("cmd_stepOver", "disabled", "false");
            chrome.setGlobalAttribute("cmd_stepInto", "disabled", "false");
            chrome.setGlobalAttribute("cmd_stepOut", "disabled", "false");
        }
        else
        {
            chrome.setGlobalAttribute("fbDebuggerButtons", "stopped", "false");
            chrome.setGlobalAttribute("cmd_rerun", "disabled", "true");
            chrome.setGlobalAttribute("cmd_stepOver", "disabled", "true");
            chrome.setGlobalAttribute("cmd_stepInto", "disabled", "true");
            chrome.setGlobalAttribute("cmd_stepOut", "disabled", "true");
            chrome.setGlobalAttribute("cmd_resumeExecution", "disabled", "true");
        }
    },

    syncListeners: function(context)
    {
        var chrome = Firebug.chrome;

        if (context.stopped)
            this.attachListeners(context, chrome);
        else
            this.detachListeners(context, chrome);
    },

    attachListeners: function(context, chrome)
    {
        this.keyListeners =
        [
            chrome.keyCodeListen("F8", null, bind(this.resume, this, context), true),
            chrome.keyListen("/", isControl, bind(this.resume, this, context)),
            chrome.keyCodeListen("F10", null, bind(this.stepOver, this, context), true),
            chrome.keyListen("'", isControl, bind(this.stepOver, this, context)),
            chrome.keyCodeListen("F11", null, bind(this.stepInto, this, context)),
            chrome.keyListen(";", isControl, bind(this.stepInto, this, context)),
            chrome.keyCodeListen("F11", isShift, bind(this.stepOut, this, context)),
            chrome.keyListen(",", isControlShift, bind(this.stepOut, this, context))
        ];
    },

    detachListeners: function(context, chrome)
    {
        if (this.keyListeners)
        {
            for (var i = 0; i < this.keyListeners.length; ++i)
                chrome.keyIgnore(this.keyListeners[i]);
            delete this.keyListeners;
        }
    },

    showPanel: function(browser, panel)
    {
        if (panel && panel.name == "script") // this test on name is a sign that this code belongs in panel.show()
        {
            this.syncCommands(panel.context);
            this.ableWatchSidePanel(panel.context);
            if (FBTrace.DBG_PANELS) FBTrace.sysout("debugger.showPanel this.location:"+this.location);
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    supportsWindow: function(win)
    {
        if (!this.isAlwaysEnabled())
            return false;

        var context = ( (win && TabWatcher) ? TabWatcher.getContextByWindow(win) : null);

        this.breakContext = context;
        return !!context;
    },

    supportsGlobal: function(frameWin) // This is call from fbs for almost all fbs operations
    {
        var context = ( (frameWin && TabWatcher) ? TabWatcher.getContextByWindow(frameWin) : null);
        if (!context)
            return false;

        context.jsDebuggerActive = true;

        if (!Firebug.Console.injector.isAttached(context, frameWin))
        {
            var win = frameWin.wrappedJSObject ? frameWin.wrappedJSObject : frameWin;
            this.injectConsole(context, win);
        }
        else
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("debugger.supportsGlobal console isAttached to "+safeGetWindowLocation(frameWin)+" in  "+context.getName());
        }

        this.breakContext = context;
        //FBTrace.sysout("debugger.js this.breakContext "+this.breakContext.getName());
        return true;
    },

    injectConsole: function(context, frameWin)
    {
        if (Firebug.Console.isAlwaysEnabled())
        {
            // This is how the console is injected ahead of JS running on the page
            fbs.filterConsoleInjections = true;
            try
            {
                var consoleReady = Firebug.Console.isReadyElsePreparing(context, frameWin);
            }
            catch(exc)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("debugger.supportsGlobal injectConsole FAILS: "+exc, exc);
            }
            finally
            {
                fbs.filterConsoleInjections = false;
            }
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("debugger.supportsGlobal injectConsole consoleReady:"+consoleReady+" jsDebuggerActive: "+context.jsDebuggerActive, frameWin);
        }
        else
        {
            if (FBTrace.DBG_CONSOLE)
                FBTrace.sysout("debugger.supportsGlobal injectConsole console NOT enabled ", frameWin);
        }
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
        try {
            var context = this.breakContext;

            if (FBTrace.DBG_BP || (!context && FBTrace.DBG_FBS_ERRORS) )
                FBTrace.sysout("debugger.onBreak breakContext: " + (context ? context.getName() : " none!"), getJSDStackDump(frame) );

            delete this.breakContext;

            if (!context)
                return RETURN_CONTINUE;

            if (type == TYPE_DEBUGGER_KEYWORD)
            {
                if (frame.functionName === 'firebugDebuggerTracer')
                    return this.debuggerTracer(context, frame);
                else
                    this.setDebuggerKeywordCause(context, frame);
            }

            return this.stop(context, frame, type);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_BP)
                FBTrace.sysout("debugger.onBreak FAILS", exc);
            throw exc;
        }
    },

    debuggerTracer: function(context, frame)
    {
        var trace = FBL.getCorrectedStackTrace(frame, context);
        if (FBTrace.DBG_ERRORLOG)
            FBTrace.sysout("debugger.firebugDebuggerTracer corrected trace.frames "+trace.frames.length, trace.frames);
        if (trace)
        {
            trace.frames = trace.frames.slice(1); // drop the firebugDebuggerTracer and reorder
            if (FBTrace.DBG_ERRORLOG)
                FBTrace.sysout("debugger.firebugDebuggerTracer dropped tracer trace.frames "+trace.frames.length, trace.frames);

            if (context.window.wrappedJSObject._firebugStackTrace == "requested")
            {
                trace.frames = trace.frames.slice(1);  // drop console.error() see consoleInjected.js
                if (FBTrace.DBG_ERRORLOG)
                    FBTrace.sysout("debugger.firebugDebuggerTracer requested trace.frames "+trace.frames.length, trace.frames);
                context.stackTrace = trace;
            }
            else
                Firebug.Console.log(trace, context, "stackTrace");
        }

        if(FBTrace.DBG_BP)
            FBTrace.sysout("debugger.onBreak "+(trace?"debugger trace":" debugger no trace!"));

        return RETURN_CONTINUE;
    },
    /*
     * for |debugger;| keyword offer the skip/continue dialog (optionally?)
     */
    setDebuggerKeywordCause: function(context, frame)
    {
        var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, frame.script);
        if (!sourceFile)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("debugger.setDebuggerKeywordCause FAILS, no sourceFile for "+frame.script.tag+"@"+frame.script.fileName+" in "+context.getName());
            return;
        }

        var analyzer = sourceFile.getScriptAnalyzer(frame.script);
        var lineNo = analyzer.getSourceLineFromFrame(context, frame);

        context.breakingCause = {
                title: $STR("debugger keyword"),
                message: $STR("Disable converts keyword to disabled breakpoint"), //xxxHonza localization
                skipAction: function addSkipperAndGo()
                {
                    // a breakpoint that never hits, but prevents debugger keyword (see fbs.onDebugger as well)
                    var bp = Firebug.Debugger.setBreakpoint(sourceFile, lineNo);
                    fbs.disableBreakpoint(sourceFile.href, lineNo);
                    if (FBTrace.DBG_BP)
                        FBTrace.sysout("debugger.onBreak converted to disabled bp "+sourceFile.href+"@"+lineNo+" tag: "+frame.script.tag, bp);

                    Firebug.Debugger.resume(context);
                },
                okAction: function justGo()
                {
                    Firebug.Debugger.resume(context);
                },
        };
    },

    onThrow: function(frame, rv)
    {
        // onThrow is called for throw and for any catch that does not succeed.
        var context = this.breakContext;
        delete this.breakContext;

        if (!context)
        {
            FBTrace.sysout("debugger.onThrow, no context, try to get from frame\n");
            context = this.getContextByFrame(frame);
        }
        if (FBTrace.DBG_BP) FBTrace.sysout("debugger.onThrow context:"+(context?context.getName():"undefined")+"\n");
        if (!context)
            return RETURN_CONTINUE_THROW;

        if (!fbs.trackThrowCatch)
            return RETURN_CONTINUE_THROW;

        try
        {
            var isCatch = this.isCatchFromPreviousThrow(frame, context);
            if (!isCatch)
            {
                context.thrownStackTrace = getCorrectedStackTrace(frame, context);
                if (FBTrace.DBG_BP) FBTrace.sysout("debugger.onThrow reset context.thrownStackTrace", context.thrownStackTrace.frames);
            }
            else
            {
                if (FBTrace.DBG_BP) FBTrace.sysout("debugger.onThrow isCatch\n");
            }
        }
        catch  (exc)
        {
            FBTrace.sysout("onThrow FAILS: "+exc+"\n");
        }

        if (dispatch2(this.fbListeners,"onThrow",[context, frame, rv]))
            return this.stop(context, frame, TYPE_THROW, rv);
        return RETURN_CONTINUE_THROW;
    },

    isCatchFromPreviousThrow: function(frame, context)
    {
        if (context.thrownStackTrace)
        {
            var trace = context.thrownStackTrace.frames;
            if (trace.length > 1)  // top of stack is [0]
            {
                var curFrame = frame;
                var curFrameSig = curFrame.script.tag +"."+curFrame.pc;
                for (var i = 1; i < trace.length; i++)
                {
                    var preFrameSig = trace[i].signature();
                    if (FBTrace.DBG_ERRORS && FBTrace.DBG_STACK) FBTrace.sysout("debugger.isCatchFromPreviousThrow "+curFrameSig+"=="+preFrameSig+"\n");
                    if (curFrameSig == preFrameSig)
                    {
                        return true;  // catch from previous throw (or do we need to compare whole stack?
                    }
                }
                // We looked at the previous stack and did not match the current frame
            }
        }
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

        frame = getStackFrame(frame, context);

        dispatch(this.fbListeners,"onMonitorScript",[context, frame]);
    },

    onFunctionCall: function(context, frame, depth, calling)
    {
        if (!context)
            context = this.getContextByFrame(frame);
        if (!context)
            return RETURN_CONTINUE;

        frame = getStackFrame(frame, context);

        dispatch(this.fbListeners,"onFunctionCall",[context, frame, depth, calling]);

        return context;  // returned as first arg on next call from same trace
    },

    onError: function(frame, error)
    {
        var context = this.breakContext;
        delete this.breakContext;

        try
        {
            if (FBTrace.DBG_ERRORS) FBTrace.sysout("debugger.onError: "+error.errorMessage+" in "+(context?context.getName():"no context"), error);

            if (reTooMuchRecursion.test(error.errorMessage))
                frame = fbs.discardRecursionFrames(frame);

            Firebug.errorStackTrace = getCorrectedStackTrace(frame, context);
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("debugger.onError errorStackTrace ", Firebug.errorStackTrace);

            delete context.breakingCause;

            if (Firebug.breakOnErrors)
            {
                var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, frame.script);
                if (!sourceFile)
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("debugger.breakon Errors no sourceFile for "+frame.script.tag+"@"+frame.script.fileName);
                    return;
                }
                var analyzer = sourceFile.getScriptAnalyzer(frame.script);
                var lineNo = analyzer.getSourceLineFromFrame(context, frame);

                var doBreak = true;
                fbs.enumerateBreakpoints(sourceFile.href, {call: function(url, line, props, scripts) {
                    if (FBTrace.DBG_FBS_BP)
                        FBTrace.sysout("debugger.breakon Errors bp "+url+"@"+line+" scripts "+(scripts?scripts.length:"none"));
                    if(line === lineNo)
                        doBreak = false;
                }});

                if (FBTrace.DBG_BP)
                    FBTrace.sysout("debugger.breakon Errors "+doBreak+" for "+sourceFile.href+"@"+lineNo);

                if (doBreak)
                {
                    context.breakingCause = {
                        title: $STR("Break on Error"),
                        message: error.message,
                        copyAction: bindFixed(FirebugReps.ErrorMessage.copyError,
                            FirebugReps.ErrorMessage, error),
                        skipAction: function addSkipperAndGo()
                        {
                            // a breakpoint that never hits, but prevents BON for errors
                            var bp = Firebug.Debugger.setBreakpoint(sourceFile, lineNo);
                            fbs.disableBreakpoint(sourceFile.href, lineNo);
                            if (FBTrace.DBG_BP)
                                FBTrace.sysout("debugger.breakon Errors set "+sourceFile.href+"@"+lineNo+" tag: "+frame.script.tag, bp);

                            Firebug.Debugger.resume(context);
                        },
                        okAction: function justGo()
                        {
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

        var hookReturn = dispatch2(this.fbListeners,"onError",[context, frame, error]);

        if (!context.breakingCause)
            return 0;

        if (Firebug.breakOnErrors)
        {
            // Switch of Break on Next tab lightning.
            var panel = context.getPanel("console", true);
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
                    FBTrace.sysout("debugger.onXULScriptCreated reuse sourcefile="+sourceFile.toString()+" -> "+context.getName()+" ("+context.uid+")"+"\n");
                Firebug.SourceFile.addScriptsToSourceFile(sourceFile, null, innerScriptEnumerator);
            }
            else
            {
                sourceFile = new Firebug.XULSourceFile(outerScript.fileName, outerScript, innerScriptEnumerator);
                this.watchSourceFile(context, sourceFile);
            }

            if (FBTrace.DBG_SOURCEFILES)
                FBTrace.sysout("debugger.onXULScriptCreated script.fileName="+outerScript.fileName+" in "+context.getName()+" "+sourceFile);

            dispatch(this.fbListeners,"onXULScriptCreated",[context, frame, sourceFile.href]);
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
            if (FBTrace.DBG_EVAL) FBTrace.sysout("debugger.onEvalLevelScript script.fileName="+outerScript.fileName+"\n");
            var context = this.breakContext;
            delete this.breakContext;

            var sourceFile = this.getEvalLevelSourceFile(frame, context, innerScripts);

            if (FBTrace.DBG_EVAL)
                FBTrace.sysout("debugger.onEvalScriptCreated url="+sourceFile.href, FBL.getCorrectedStackTrace(frame, context));

            dispatch(this.fbListeners,"onEvalScriptCreated",[context, frame, sourceFile.href]);
            return sourceFile;
        }
        catch (e)
        {
            if (FBTrace.DBG_EVAL || FBTrace.DBG_ERRORS)
                FBTrace.sysout("onEvalScriptCreated FaILS ", e);
        }
    },

    onEventScriptCreated: function(frame, outerScript, innerScripts)
    {
        if (FBTrace.DBG_EVENTS) FBTrace.sysout("debugger.onEventScriptCreated script.fileName="+outerScript.fileName+"\n");
        var context = this.breakContext;
        delete this.breakContext;

        var script = frame.script;
        var creatorURL = normalizeURL(frame.script.fileName);
        var innerScriptArray = [];
        try {
            var source = script.functionSource;

            while (innerScripts.hasMoreElements())
            {
                var inner = innerScripts.getNext();
                source += "\n"+inner.functionSource;
                innerScriptArray.push(inner);
            }

        } catch (exc) {
            /*Bug 426692 */
            var source = creatorURL + "/"+getUniqueId();
        }

        var lines = splitLines(source);

        var urlDescribed = this.getDynamicURL(context, normalizeURL(frame.script.fileName), lines, "event");
        var url = urlDescribed.href;

        context.sourceCache.invalidate(url);
        context.sourceCache.storeSplitLines(url, lines);

        var sourceFile = new Firebug.EventSourceFile(url, frame.script, "event:"+script.functionName+"."+script.tag, lines, new ArrayEnumerator(innerScriptArray));
        this.watchSourceFile(context, sourceFile);

        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("debugger.onEventScriptCreated url="+sourceFile.href+"\n");

        if (FBTrace.DBG_EVENTS)
             FBTrace.sysout("debugger.onEventScriptCreated sourceFileMap:", context.sourceFileMap);
        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("debugger.onEventScriptCreated sourcefile="+sourceFile.toString()+" -> "+context.getName()+"\n");

        dispatch(this.fbListeners,"onEventScriptCreated",[context, frame, url]);
        return sourceFile;
    },

    // We just compiled a bunch of JS, eg a script tag in HTML.  We are about to run the outerScript.
    onTopLevelScriptCreated: function(frame, outerScript, innerScripts)
    {
        if (FBTrace.DBG_TOPLEVEL) FBTrace.sysout("debugger("+this.debuggerName+").onTopLevelScriptCreated script.fileName="+outerScript.fileName+"\n");
        var context = this.breakContext;
        delete this.breakContext;

        // This is our only chance to get the linetable for the outerScript since it will run and be GC next.
        var script = frame.script;
        var url = normalizeURL(script.fileName);

        if (FBTrace.DBG_TOPLEVEL) FBTrace.sysout("debugger.onTopLevelScriptCreated frame.script.tag="+frame.script.tag+" has url="+url);

        var isInline = false;
        /* The primary purpose here was to deal with http://code.google.com/p/fbug/issues/detail?id=2912
         * This approach could be applied to inline scripts, so I'll leave the code here until we decide.
        iterateWindows(context.window, function isInlineScriptTag(win)
        {
            var location = safeGetWindowLocation(win);
            if (location === url)
            {
                isInline = true;
                return isInline;
            }
        });
    */
        if (FBTrace.DBG_TOPLEVEL) FBTrace.sysout("debugger.onTopLevelScriptCreated has inLine:"+isInline+" url="+url);

        if (isInline) // never true see above
        {
            var href = url +"/"+context.dynamicURLIndex++;
            sourceFile = new Firebug.ScriptTagAppendSourceFile(href, script, script.lineExtent, innerScripts);
            this.watchSourceFile(context, sourceFile);
            context.pendingScriptTagSourceFile = sourceFile;
        }
        else
        {
            var sourceFile = context.sourceFileMap[url];
            if (sourceFile && (sourceFile instanceof Firebug.TopLevelSourceFile) )  // Multiple script tags in HTML or duplicate .js file names.
            {
                    if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("debugger.onTopLevelScriptCreated reuse sourcefile="+sourceFile.toString()+" -> "+context.getName()+" ("+context.uid+")"+"\n");
                    if (!sourceFile.outerScript || !sourceFile.outerScript.isValid)
                        sourceFile.outerScript = outerScript;
                    Firebug.SourceFile.addScriptsToSourceFile(sourceFile, outerScript, innerScripts);
            }
            else
            {
                sourceFile = new Firebug.TopLevelSourceFile(url, script, script.lineExtent, innerScripts);
                this.watchSourceFile(context, sourceFile);
                if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("debugger.onTopLevelScriptCreated create sourcefile="+sourceFile.toString()+" -> "+context.getName()+" ("+context.uid+")"+"\n");
            }
        }

        dispatch(this.fbListeners,"onTopLevelScriptCreated",[context, frame, sourceFile.href]);
        return sourceFile;
    },

    getContextByFrame: function(frame)
    {
        if (FBTrace.DBG_BP)
            FBTrace.sysout("debugger.getContextByFrame");
        var win = fbs.getOutermostScope(frame);
        return win ? TabWatcher.getContextByWindow(win) : null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    watchSourceFile: function(context, sourceFile)
    {
        context.addSourceFile(sourceFile);  // store in the context and notify listeners
        //fbs.watchSourceFile(sourceFile);    // tell the service to watch this file
    },

    unwatchSourceFile: function(context, sourceFile)
    {
        //fbs.unwatchSourceFile(sourceFile);
        context.removeSourceFile(sourceFile);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onToggleBreakpoint: function(url, lineNo, isSet, props)
    {
        if (props.debuggerName != this.debuggerName) // then not for us
        {
            if (FBTrace.DBG_BP) FBTrace.sysout("debugger("+this.debuggerName+").onToggleBreakpoint ignoring toggle for "+props.debuggerName+" target "+lineNo+"@"+url+"\n");
            return;
        }

        var found = false;
        for (var i = 0; i < TabWatcher.contexts.length; ++i)
        {
            var context = TabWatcher.contexts[i];
            var sourceFile = context.sourceFileMap[url];
            if (sourceFile) {
                if (FBTrace.DBG_BP)
                    FBTrace.sysout("debugger("+this.debuggerName+").onToggleBreakpoint found context "+context.getName());

                if (!isSet && context.dynamicURLhasBP)
                    this.checkDynamicURLhasBP(context);

                var panel = context.getPanel("script", true);
                if (!panel)
                {
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("onToggleBreakpoint no panel in context "+context.getName());
                    continue;
                }

                panel.context.invalidatePanels("breakpoints");

                var sourceBox = panel.getSourceBoxByURL(url);
                if (!sourceBox)
                {
                    if (FBTrace.DBG_BP)
                        FBTrace.sysout("debugger("+this.debuggerName+").onToggleBreakpoint context "+i+" script panel no sourcebox for url: "+url, panel.sourceBoxes);
                    continue;
                }

                var row = sourceBox.getLineNode(lineNo);
                if (FBTrace.DBG_BP)
                    FBTrace.sysout(i+") onToggleBreakpoint getLineNode="+row+" lineNo="+lineNo+" context:"+context.getName()+"\n");
                if (!row)
                    continue;  // we *should* only be called for lines in the viewport...

                row.setAttribute("breakpoint", isSet);
                if (isSet && props)
                {
                    row.setAttribute("condition", props.condition ? "true" : "false");
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
                                FBTrace.sysout("onToggleBreakpoint no watch panel in context "+context.getName());
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
                dispatch(this.fbListeners, "onToggleBreakpoint", [context, url, lineNo, isSet]);
                found = true;
                continue;
            }
        }
        if (FBTrace.DBG_BP && !found)
            FBTrace.sysout("debugger("+this.debuggerName+").onToggleBreakpoint no find context");
    },

    onToggleErrorBreakpoint: function(url, lineNo, isSet)
    {
        for (var i = 0; i < TabWatcher.contexts.length; ++i)
        {
            var context = TabWatcher.contexts[i];
            var panel = context.getPanel("console", true);
            if (panel)
            {
                panel.context.invalidatePanels("breakpoints");

                for (var row = panel.panelNode.firstChild; row; row = row.nextSibling)
                {
                    var error = row.firstChild.repObject;
                    if (error instanceof ErrorMessage && error.href == url && error.lineNo == lineNo)
                    {
                        if (isSet)
                            setClass(row.firstChild, "breakForError");
                        else
                            removeClass(row.firstChild, "breakForError");

                        dispatch(this.fbListeners, "onToggleErrorBreakpoint", [context, url, lineNo, isSet]);
                    }
                }
            }
        }
    },

    onToggleMonitor: function(url, lineNo, isSet)
    {
        for (var i = 0; i < TabWatcher.contexts.length; ++i)
        {
            var panel = TabWatcher.contexts[i].getPanel("console", true);
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
                   fbs.enumerateBreakpoints(url, {call: function setDynamicIfSet(url, lineNo)
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // XXXjjb this code is not called, because I found the scheme for detecting Function too complex.
    // I'm leaving it here to remind us that we need to support new Function().
    onFunctionConstructor: function(frame, ctor_script)
    {
       try
        {
            var context = this.breakContext;
            delete this.breakContext;

            var sourceFile = this.createSourceFileForFunctionConstructor(frame, ctor_script, context);

            if (FBTrace.DBG_EVAL)
            {
                FBTrace.sysout("debugger.onFunctionConstructor tag="+ctor_script.tag+" url="+sourceFile.href+"\n");
                FBTrace.sysout( traceToString(FBL.getCorrectedStackTrace(frame, context))+"\n" );
            }

            dispatch(this.fbListeners,"onFunctionConstructor",[context, frame, ctor_script, sourceFile.href]);
            return sourceFile.href;
        }
        catch(exc)
        {
            ERROR("debugger.onFunctionConstructor failed: "+exc);
            if (FBTrace.DBG_EVAL)
                FBTrace.sysout("debugger.onFunctionConstructor failed: ",exc);
            return null;
        }

    },

    createSourceFileForFunctionConstructor: function(caller_frame, ctor_script, context)
    {
        var ctor_expr = null; // this.getConstructorExpression(caller_frame, context);
        if (FBTrace.DBG_EVAL) FBTrace.sysout("createSourceFileForFunctionConstructor ctor_expr:"+ctor_expr+"\n");
        if (ctor_expr)
            var source  = this.getEvalBody(caller_frame, "lib.createSourceFileForFunctionConstructor ctor_expr", 1, ctor_expr);
        else
            var source = " bah createSourceFileForFunctionConstructor"; //ctor_script.functionSource;

        if (FBTrace.DBG_EVAL) FBTrace.sysout("createSourceFileForFunctionConstructor source:"+source+"\n");
        var url = this.getDynamicURL(context, normalizeURL(caller_frame.script.fileName), source, "Function");

        var lines = context.sourceCache.store(url.href, source);
        var sourceFile = new Firebug.FunctionConstructorSourceFile(url, caller_frame.script, ctor_expr, lines.length);
        this.watchSourceFile(context, sourceFile);

        if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("debugger.onNewFunction sourcefile="+sourceFile.toString()+" -> "+context.getName()+"\n");

        return sourceFile;
    },

    getConstructorExpression: function(caller_frame, context)
    {
        // We believe we are just after the ctor call.
        var decompiled_lineno = getLineAtPC(caller_frame, context);
        if (FBTrace.DBG_EVAL) FBTrace.sysout("debugger.getConstructoreExpression decompiled_lineno:"+decompiled_lineno+"\n");

        var decompiled_lines = splitLines(caller_frame.script.functionSource);  // TODO place in sourceCache?
        if (FBTrace.DBG_EVAL) FBTrace.sysout("debugger.getConstructoreExpression decompiled_lines:",decompiled_lines);

        var candidate_line = decompiled_lines[decompiled_lineno - 1]; // zero origin
        if (FBTrace.DBG_EVAL) FBTrace.sysout("debugger.getConstructoreExpression candidate_line:"+candidate_line+"\n");

        if (candidate_line && candidate_line != null)
            {
                var m = reFunction.exec(candidate_line);
                if (m)
                    var arguments =  m[1];     // TODO Lame: need to count parens, with escapes and quotes
            }
        if (FBTrace.DBG_EVAL) FBTrace.sysout("debugger.getConstructoreExpression arguments:"+arguments+"\n");
        if (arguments) // need to break down commas and get last arg.
        {
                var lastComma = arguments.lastIndexOf(',');
                return arguments.substring(lastComma+1);  // if -1 then 0
        }
        return null;
    },

    // end of guilt trip
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

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
        if (FBTrace.DBG_EVAL) FBTrace.sysout("getEvalLevelSourceFile eval_expr:"+eval_expr+"\n");

        if (eval_expr && !Firebug.decompileEvals)
        {
            var source  = this.getEvalBody(frame, "lib.getEvalLevelSourceFile.getEvalBody", 1, eval_expr);
            var mapType = PCMAP_SOURCETEXT;
        }
        else
        {
            var source = frame.script.functionSource; // XXXms - possible crash on OSX FF2
            var mapType = PCMAP_PRETTYPRINT;
        }

        var lines = splitLines(source);

        if (FBTrace.DBG_EVAL)
            FBTrace.sysout("getEvalLevelSourceFile "+lines.length+ "lines, mapType:"+((mapType==PCMAP_SOURCETEXT)?"SOURCE":"PRETTY")+" source:"+source+"\n");

        var url = this.getDynamicURL(context, normalizeURL(frame.script.fileName), lines, "eval");

        context.sourceCache.invalidate(url.href);
        context.sourceCache.storeSplitLines(url.href, lines);

        var sourceFile = new Firebug.EvalLevelSourceFile(url, frame.script, eval_expr, lines, mapType, innerScripts);
        this.watchSourceFile(context, sourceFile);

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("debugger.getEvalLevelSourceFile sourcefile="+sourceFile.toString()+" -> "+context.getName()+"\n");

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
        const reURIinComment = /\/\/@\ssourceURL=\s*(\S*?)\s*$/m;
        var m = reURIinComment.exec(lines[lines.length - 1]);
        if (m)
        {
            // add context info to the sourceURL so eval'd sources are grouped correctly in the source file list
            if (m[1] && m[1].indexOf('://') == -1) {
                var loc = context.window.location;
                if (m[1].charAt(0) != '/') m[1] = '/'+m[1]; // prepend leading slash if necessary
                m[1] = loc.protocol + '//' + loc.host + m[1]; // prepend protocol and host
            }

            var href = new String(m[1]);

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
            // the previous and reloaded source. In that case let's use a cheap URL.
            var href = new String(callerURL + (kind ? "/"+kind+"/" : "/nokind/")+"seq/" +(context.dynamicURLIndex++));
            url = {href: href, kind: "seq"};
            if (FBTrace.DBG_SOURCEFILES || isNaN(context.dynamicURLIndex) )
                FBTrace.sysout("debugger.getSequentialURL context:"+context.getName()+" url:"+url.href+" index: "+context.dynamicURLIndex, url);
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

        // encoding the hash should be ok, it should be information-preserving? Or at least reversable?
        var href= new String(callerURL + (kind ? "/"+kind+"/" : "/nokind/")+"MD5/" + encodeURIComponent(hash));
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
            href = "eval."+script.tag;
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getEvalExpression: function(frame, context)
    {
        var expr = this.getEvalExpressionFromEval(frame, context);  // eval in eval

        return (expr) ? expr : this.getEvalExpressionFromFile(normalizeURL(frame.script.fileName), frame.script.baseLineNumber, context);
    },

    getEvalExpressionFromFile: function(url, lineNo, context)
    {
        if (context && context.sourceCache)
        {
            var in_url = FBL.reJavascript.exec(url);
            if (in_url)
            {
                var m = reEval.exec(in_url[1]);
                if (m)
                    return m[1];
                else
                    return null;
            }

            var htm = reHTM.exec(url);
            if (htm) {
                lineNo = lineNo + 1; // embedded scripts seem to be off by one?  XXXjjb heuristic
            }
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
            if (FBTrace.DBG_EVAL) {
                FBTrace.sysout("debugger.getEvalExpressionFromEval sourceFile.href="+sourceFile.href+"\n");
                FBTrace.sysout("debugger.getEvalExpressionFromEval callingFrame.pc="+callingFrame.pc
                    +" callingFrame.script.baseLineNumber="+callingFrame.script.baseLineNumber+"\n");
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
                    FBTrace.sysout("debugger.getEvalExpressionFromEval lineNo-i="+lineNo+"-"+i+"="+(lineNo-i)+" line:"+line+"\n");
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
        if (evalExpr  && !Firebug.decompileEvals)
        {
            var result_src = {};
            var evalThis = "new String("+evalExpr+");";
            var evaled = frame.eval(evalThis, asName, asLine, result_src);

            if (evaled)
            {
                var src = unwrapIValue(result_src.value);
                return src;
            }
            else
            {
                var source;
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initialize: function()
    {
        Firebug.clientID = this.registerClient(Firebug);
        this.nsICryptoHash = Components.interfaces["nsICryptoHash"];

        this.debuggerName =  window.location.href +"-@-"+FBL.getUniqueId();
        this.toString = function() { return this.debuggerName; }
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("debugger.initialize "+ this.debuggerName);

        this.hash_service = CCSV("@mozilla.org/security/hash;1", "nsICryptoHash");

        $("cmd_breakOnErrors").setAttribute("checked", Firebug.breakOnErrors);
        $("cmd_decompileEvals").setAttribute("checked", Firebug.decompileEvals);

        this.wrappedJSObject = this;  // how we communicate with fbs

        // This is a service operation, a way of encapsulating fbs which is in turn implementing this
        // simple service. We could implment a whole component for this service, but it hardly makes sense.
        Firebug.broadcast = function encapsulateFBSBroadcast(message, args)
        {
            fbs.broadcast(message, args);
        }

        this.onFunctionCall = bind(this.onFunctionCall, this);

        Firebug.ActivableModule.initialize.apply(this, arguments);
    },

    internationalizeUI: function(doc)
    {
        var elements = ["fbRerunButton", "fbContinueButton", "fbStepIntoButton", "fbStepOverButton",
            "fbStepOutButton"];

        for (var i=0; i<elements.length; i++)
        {
            var element = doc.getElementById(elements[i]);
            if (element.hasAttribute("label"))
                FBL.internationalize(element, "label");

            if (element.hasAttribute("tooltiptext"))
                FBL.internationalize(element, "tooltiptext");
        }
    },

    /*
     * per-XUL window registration; this method just allows us to keep fbs in this file.
     * @param clientAPI an object that implements functions called by fbs for clients.
     */
    registerClient: function(clientAPI)
    {
        return fbs.registerClient(clientAPI);
    },

    unregisterClient: function(clientAPI)
    {
        fbs.unregisterClient(clientAPI);
    },

    enable: function()
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.Firebug.Debugger.enable; " + this.enabled);

        //if (this.isAlwaysEnabled())
        //    this.registerDebugger(); // allow callbacks for jsd
    },

    disable: function()
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.Firebug.Debugger.disable; " + this.enabled);

        //this.unregisterDebugger();
    },

    initializeUI: function()
    {
        Firebug.ActivableModule.initializeUI.apply(this, arguments);
        this.filterButton = $("fbScriptFilterMenu");
        this.filterMenuUpdate();
        Firebug.setIsJSDActive(fbs.isJSDActive()); // jsd may be active before this XUL window was opened
    },

    initContext: function(context, persistedState)
    {
        if (persistedState)
            context.dynamicURLhasBP = persistedState.dynamicURLhasBP;

        context.dynamicURLIndex = 1; // any dynamic urls need to be unique to the context.

        context.jsDebuggerActive = false;

        Firebug.ActivableModule.initContext.apply(this, arguments);
    },

    reattachContext: function(browser, context)
    {
        this.filterButton = Firebug.chrome.$("fbScriptFilterMenu");  // connect to the button in the new window, not 'window'
        this.filterMenuUpdate();
        Firebug.ActivableModule.reattachContext.apply(this, arguments);
    },

    showContext: function(browser, context)
    {
        if (context && !context.onLoadWindowContent) // then context was not active during load
            this.updateScriptFiles(context);
    },

    updateScriptFiles: function(context)  // scan windows for 'script' tags (only if debugger is not enabled)
    {
        function addFile(url, scriptTagNumber, dependentURL)
        {
            var sourceFile = new Firebug.ScriptTagSourceFile(context, url, scriptTagNumber);
            sourceFile.dependentURL = dependentURL;
            context.addSourceFile(sourceFile);
            return true;
        }

        iterateWindows(context.window, function updateEachWin(win)
        {
            if (FBTrace.DBG_SOURCEFILES)
                FBTrace.sysout("updateScriptFiles iterateWindows: "+win.location.href, " documentElement: "+win.document.documentElement);
            if (!win.document.documentElement)
                return;

            var url = normalizeURL(win.location.href);

            if (url)
            {
                if (!context.sourceFileMap.hasOwnProperty(url))
                {
                    var URLOnly = new Firebug.NoScriptSourceFile(context, url);
                    context.addSourceFile(URLOnly);
                    if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("updateScriptFiles created NoScriptSourceFile for URL:"+url, URLOnly);
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
                var url = scriptSrc ? absoluteURL(scriptSrc, baseUrl) : win.location.href;
                url = normalizeURL(url ? url : win.location.href);
                var added = addFile(url, i, (scriptSrc?win.location.href:null));
                if (FBTrace.DBG_SOURCEFILES)
                    FBTrace.sysout("updateScriptFiles "+(scriptSrc?"inclusion":"inline")+" script #"+i+"/"+scripts.length+(added?" adding ":" readded ")+url+" to context="+context.getName()+"\n");
            }
        });

        if (FBTrace.DBG_SOURCEFILES)
        {
            FBTrace.sysout("updateScriptFiles sourcefiles:", sourceFilesAsArray(context.sourceFileMap));
        }
    },

    loadedContext: function(context)
    {
        var watchPanel = this.ableWatchSidePanel(context);
        var needNow = watchPanel && watchPanel.watches;
        var watchPanelState = Firebug.getPanelState({name: "watches", context: context});
        var needPersistent = watchPanelState && watchPanelState.watches;
        if (needNow || needPersistent)
        {
            Firebug.CommandLine.isReadyElsePreparing(context);
            if (watchPanel)
            {
                context.setTimeout(function refreshWatchesAfterCommandLineReady()
                {
                    watchPanel.refresh();
                });
            }
        }

        // context.watchScriptAdditions = bind(this.watchScriptAdditions, this, context);

        // context.window.document.addEventListener("DOMNodeInserted", context.watchScriptAdditions, false);

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("debugger("+this.debuggerName+").loadedContext enabled on load: "+context.onLoadWindowContent+" context.sourceFileMap", context.sourceFileMap);
    },

    /*
     * A DOM Mutation Event handler for script tag additions
     * FAILS see http://code.google.com/p/fbug/issues/detail?id=2912
     */
    watchScriptAdditions: function(event, context)
    {
        if (event.type !== "DOMNodeInserted")
            return;
        if (event.target.tagName.toLowerCase() !== "script")
            return;
        FBTrace.sysout("debugger.watchScriptAdditions ", event.target.innerHTML);
        var location = safeGetWindowLocation(context.window);

        FBL.jsd.enumerateScripts({enumerateScript: function(script)
        {
            if (normalizeURL(script.fileName) === location)
            {
                var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, script);
                FBTrace.sysout('debugger.watchScriptAdditions '+script.tag+" in "+(sourceFile?sourceFile.href:"NONE")+" "+script.functionSource, script.functionSource);
                // The dynamically added script tags via element.appendChild do not show up.
            }
        }});

        if (context.pendingScriptTagSourceFile)
        {
            var sourceFile = context.pendingScriptTagSourceFile;
            sourceFile.scriptTag = event.target;
            sourceFile.source = splitLines(event.target.innerHTML);

            var panel = context.getPanel("script", true);
            if (panel)
                panel.removeSourceBoxBySourceFile(sourceFile);

            FBTrace.sysout("debugger.watchScriptAdditions connected tag to sourcefile", sourceFile);

            delete context.pendingScriptTagSourceFile;
        }
    },

    unwatchWindow: function(context, win)  // clean up the source file map in case the frame is being reloaded.
    {
        var scriptTags = win.document.getElementsByTagName("script");
        for (var i = 0; i < scriptTags.length; i++)
        {
            var src = scriptTags[i].getAttribute("src");
            src = src ? src : safeGetWindowLocation(win);

            // If the src is not in the source map, try to use absolute url.
            if (!context.sourceFileMap[src])
                src = absoluteURL(src, win.location.href);

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

        context.window.document.removeEventListener("DOMNodeInserted", context.watchScriptAdditions, false);

        if (context.stopped)
        {
            // the abort will call resume, but the nestedEventLoop would continue the load...
            this.abort(context);
        }

        if(persistedState)
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
            $("cmd_breakOnErrors").setAttribute("checked", value);
        else if (name == "decompileEvals")
            $("cmd_decompileEvals").setAttribute("checked", value);
    },

    getObjectByURL: function(context, url)
    {
        var sourceFile = getSourceFileByHref(url, context);
        if (sourceFile)
            return new SourceLink(sourceFile.href, 0, "js");
    },

    shutdown: function()
    {
        this.unregisterClient(Firebug);
        fbs.unregisterDebugger(this);
    },

    registerDebugger: function() // 1.3.1 safe for multiple calls
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("registerDebugger this.registered: "+this.registered);

        if (this.registered)
            return;

        this.registered = true;

        var check = fbs.registerDebugger(this);  //  this will eventually set 'jsd' on the statusIcon

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("debugger.registerDebugger "+check+" debuggers");
    },

    unregisterDebugger: function() // 1.3.1 safe for multiple calls
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("debugger.unregisterDebugger this.registered: "+this.registered);

        if (!this.registered)
            return;

        // stay registered if we are profiling across a reload.
        if (Firebug.Profiler.isProfiling())
            return;

        var check = fbs.unregisterDebugger(this);

        this.registered = false;

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.unregisterDebugger: "+check+" debuggers");
    },

    onSourceFileCreated: function(context, sourceFile)
    {
        // This event can come at any time, eg by frame reloads or ajax,
        // so we need to update the display.
        context.invalidatePanels("script", "breakpoints");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends ActivableModule

    onObserverChange: function(observer)
    {
        if (this.hasObservers())
            this.activateDebugger()
        else
            this.deactivateDebugger();
    },

    activateDebugger: function()
    {
        this.registerDebugger();

        if (Firebug.currentContext && !fbs.isJSDActive())
            fbs.unPause();

        if (FBTrace.DBG_PANELS || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.activate;");
    },

    deactivateDebugger: function()
    {
        if (this.dependents && this.dependents.length > 0)
        {
            for(var i = 0; i < this.dependents.length; i++)
            {
                if (this.dependents[i].isAlwaysEnabled())
                {
                    // TODO getName() for modules required.
                    var name = this.dependents[0].dispatchName;

                    // Log message into the console to inform the user
                    if (Firebug.currentContext)
                        Firebug.Console.log("Cannot disable the script panel, " + name +
                            " panel requires it", Firebug.currentContext);

                    if (FBTrace.DBG_PANELS)
                        FBTrace.sysout("debugger.onPanelDisable rejected: " + name +
                            " dependent, with panelName: " + panelName);
                    return;
                }
            }
        }

        // else no dependents enabled:
        this.unregisterDebugger();

        if (FBTrace.DBG_PANELS || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.deactivate");

        // this.clearAllBreakpoints();  //XXXjjb I don't think we want to clear breakpoints here, just turn off jsd if no registered debuggers
    },

    onDependentModuleChange: function(dependentAddedOrRemoved)
    {
        if (this.dependents.length > 0) // then we have dependents now
        {
            if (!this.isAlwaysEnabled()) // then we need to enable
            {
                this.activateDebugger();
                if (Firebug.currentContext)
                    Firebug.Console.log("enabling javascript debugger to support "+dependentAddedOrRemoved.dispatchName, Firebug.currentContext);
            }
        }

        // xxxHonza, XXXjjb: what about else? In case there are no dependants we could perhaps
        // disable again...
    },

    onSuspendingFirebug: function()
    {
        var anyStopped = TabWatcher.iterateContexts(function isAnyStopped(context)
        {
            return context.stopped;
        });

        return anyStopped;
    },

    onSuspendFirebug: function()
    {
        if (!Firebug.Debugger.isAlwaysEnabled())
            return;

        var paused = fbs.pause();  // can be called multiple times.

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.onSuspendFirebug paused: "+paused+" isAlwaysEnabled " +
                Firebug.Debugger.isAlwaysEnabled()+"\n");

        if (!paused)  // then we failed to suspend, undo
            return true;

        return false;
    },

    onResumeFirebug: function()
    {
        if (!Firebug.Debugger.isAlwaysEnabled())
            return;

        var unpaused = fbs.unPause();

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("debugger.onResumeFirebug unpaused: "+unpaused+" isAlwaysEnabled " +
                Firebug.Debugger.isAlwaysEnabled());

        if (FBTrace.DBG_ERRORS && !this.registered && Firebug.Debugger.isAlwaysEnabled())
            FBTrace.sysout("debugger.onResumeFirebug but debugger " +
                Firebug.Debugger.debuggerName+" not registered! *** ");
    },

    ableWatchSidePanel: function(context)
    {
        if (Firebug.Console.isAlwaysEnabled())
        {
            var watchPanel = context.getPanel("watches", true);
            if (watchPanel)
                return watchPanel;
        }

        return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Menu in toolbar.

    onScriptFilterMenuTooltipShowing: function(tooltip, context)
    {
        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("onScriptFilterMenuTooltipShowing not implemented");
    },

    onScriptFilterMenuCommand: function(event, context)
    {
        var menu = event.target;
        Firebug.setPref(Firebug.servicePrefDomain, "scriptsFilter", menu.value);
        Firebug.Debugger.filterMenuUpdate();
    },

    menuFullLabel:
    {
        static: $STR("ScriptsFilterStatic"),
        evals: $STR("ScriptsFilterEval"),
        events: $STR("ScriptsFilterEvent"),
        all: $STR("ScriptsFilterAll"),
    },

    menuShortLabel:
    {
        static: $STR("ScriptsFilterStaticShort"),
        evals: $STR("ScriptsFilterEvalShort"),
        events: $STR("ScriptsFilterEventShort"),
        all: $STR("ScriptsFilterAllShort"),
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
        var value = Firebug.getPref(Firebug.servicePrefDomain, "scriptsFilter");
        this.filterButton.value = value;
        this.filterButton.label = this.menuShortLabel[value];
        this.filterButton.removeAttribute("disabled");
        this.filterButton.setAttribute("value", value);
        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("debugger.filterMenuUpdate value: "+value+" label:"+this.filterButton.label+'\n');
    },
});

// ************************************************************************************************

Firebug.ScriptPanel = function() {};

/*
 * object used to markup Javascript source lines.
 * In the namespace Firebug.ScriptPanel.
 */
Firebug.ScriptPanel.decorator = extend(new Firebug.SourceBoxDecorator,
{
    decorate: function(sourceBox, unused)
    {
        this.markExecutableLines(sourceBox);
        this.setLineBreakpoints(sourceBox.repObject, sourceBox)
    },

    markExecutableLines: function(sourceBox)
    {
        var compilationUnit = sourceBox.repObject;
        if (FBTrace.DBG_BP || FBTrace.DBG_LINETABLE)
            FBTrace.sysout("debugger.markExecutableLines START: "+compilationUnit.toString());

        var lineNo = sourceBox.firstViewableLine;
        while( lineNode = sourceBox.getLineNode(lineNo) )
        {
            if (lineNode.alreadyMarked)
            {
                lineNo++;
                continue;
            }

            var script = compilationUnit.isExecutableLine(lineNo);

            if (FBTrace.DBG_LINETABLE) FBTrace.sysout("debugger.markExecutableLines ["+lineNo+"]="+script);
            if (script)
                lineNode.setAttribute("executable", "true");
            else
                lineNode.removeAttribute("executable");

            lineNode.alreadyMarked = true;

            if (lineNo > sourceBox.lastViewableLine)
                break;

            lineNo++;
        }

        if (FBTrace.DBG_BP || FBTrace.DBG_LINETABLE)
            FBTrace.sysout("debugger.markExecutableLines DONE: "+compilationUnit.toString()+"\n");
    },

    setLineBreakpoints: function(compilationUnit, sourceBox)
    {
        fbs.enumerateBreakpoints(compilationUnit.getURL(), {call: function(url, line, props, scripts)
        {
            var scriptRow = sourceBox.getLineNode(line);
            if (scriptRow)
            {
                scriptRow.setAttribute("breakpoint", "true");
                if (props.disabled)
                    scriptRow.setAttribute("disabledBreakpoint", "true");
                if (props.condition)
                    scriptRow.setAttribute("condition", "true");
            }
            if (FBTrace.DBG_LINETABLE)
                FBTrace.sysout("debugger.setLineBreakpoints found "+scriptRow+" for "+line+"@"+compilationUnit.getURL()+"\n");
        }});
    },
});

// ************************************************************************************************

Firebug.ScriptPanel.prototype = extend(Firebug.SourceBoxPanel,
{
    /*
    * Framework connection
    */
    updateSourceBox: function(sourceBox)
    {
        if (this.scrollInfo && (this.scrollInfo.location == this.location))
            this.scrollToLine(this.location, this.scrollInfo.previousCenterLine);
        delete this.scrollInfo;
    },

    /*
    * Framework connection
    */
    getSourceType: function()
    {
        return "js";
    },

    /*
     * Framework connection
     */
    getDecorator: function(sourceBox)
    {
        return Firebug.ScriptPanel.decorator;
    },

    initialize: function(context, doc)
    {
        this.location = null;
        Firebug.SourceBoxPanel.initialize.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    showFunction: function(fn)
    {
        var sourceLink = findSourceForFunction(fn, this.context);
        if (sourceLink)
        {
            this.showSourceLink(sourceLink);
        }
        else
        {
            if (FBTrace.DBG_ERRORS) FBTrace.sysout("no sourcelink for function"); // want to avoid the debugger panel if possible
        }
    },

    showSourceLink: function(sourceLink)
    {
        var compilationUnit = this.context.getCompilationUnit(sourceLink.href);
        if (compilationUnit)
        {
            this.navigate(compilationUnit);
            if (sourceLink.line)
            {
                this.scrollToLine(sourceLink.href, sourceLink.line, this.jumpHighlightFactory(sourceLink.line, this.context));
                dispatch(this.fbListeners, "onShowSourceLink", [this, sourceLink.line]);
            }
            if (sourceLink == this.selection)  // then clear it so the next link will scroll and highlight.
                delete this.selection;
        }
    },

    highlightExecutionLine: function()
    {
        var highlightingAttribute = "exe_line";
        if (this.executionLine)  // could point to any node in any sourcebox, private to this function
            this.executionLine.removeAttribute(highlightingAttribute);

        var sourceBox = this.selectedSourceBox;
        var lineNode = sourceBox.getLineNode(this.executionLineNo);
        this.executionLine = lineNode;  // if null, clears

        if (sourceBox.breakCauseBox)
        {
            sourceBox.breakCauseBox.hide();
            delete sourceBox.breakCauseBox;
        }

        if (this.executionLine)
        {
            lineNode.setAttribute(highlightingAttribute, "true");
            if (this.context.breakingCause && !this.context.breakingCause.shown)
            {
                this.context.breakingCause.shown = true;
                var cause = this.context.breakingCause;
                if (cause)
                {
                    var sourceLine = getChildByClass(lineNode, "sourceLine");
                    sourceBox.breakCauseBox = new Firebug.Breakpoint.BreakNotification(this.document, cause);
                    sourceBox.breakCauseBox.show(sourceLine, this, "not an editor, yet?");
                }
            }
        }

        if (FBTrace.DBG_BP || FBTrace.DBG_STACK || FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("sourceBox.highlightExecutionLine lineNo: "+this.executionLineNo+" lineNode="+lineNode+" in "+sourceBox.repObject.href);

        return (this.executionLineNo > 0); // sticky if we have a valid line
    },

    showStackFrameXB: function(frameXB)
    {
        if (this.context.stopped)
        {
            this.setCurrentStackFrame(frameXB);
            this.showExecutingSourceFile(frameXB.sourceFile, frameXB);
        }
        else
            this.showNoStackFrame();
    },

    showStackFrame: function(frame)
    {
        if (!frame || (frame && !frame.isValid))
        {
            if (FBTrace.DBG_STACK) FBTrace.sysout("showStackFrame no valid frame\n");
            this.showNoStackFrame();
            return;
        }

        var sourceFile = Firebug.SourceFile.getSourceFileByScript(this.context, frame.script);
        if (!sourceFile)
        {
            if (FBTrace.DBG_STACK) FBTrace.sysout("showStackFrame no sourceFile in context "+this.context.getName()+"for frame.script: "+frame.script.fileName);
            this.showNoStackFrame()
            return;
        }

        this.setCurrentStackFrame(frame);

        this.showExecutingSourceFile(sourceFile, frame);
    },

    showExecutingSourceFile: function(sourceFile, frame)
    {
        this.context.executingSourceFile = sourceFile;
        this.executionFile = sourceFile;
        if (this.executionFile)
        {
            var url = this.executionFile.href;
            var analyzer = this.executionFile.getScriptAnalyzer(frame.script);
            this.executionLineNo = analyzer.getSourceLineFromFrame(this.context, frame);  // TODo implement for each type

            if (FBTrace.DBG_STACK)
                FBTrace.sysout("showStackFrame executionFile:"+this.executionFile+"@"+this.executionLineNo+"\n");

            if (this.context.breakingCause)
                this.context.breakingCause.lineNo = this.executionLineNo;

            this.scrollToLine(url, this.executionLineNo, bind(this.highlightExecutionLine, this) );
            this.context.throttle(this.updateInfoTip, this);
            return;
        }
        else
        {
            if (FBTrace.DBG_STACK) FBTrace.sysout("showStackFrame no getSourceFileByScript for tag="+frame.script.tag+"\n");
            this.showNoStackFrame();
        }
    },

    showNoStackFrame: function()
    {
        this.executionFile = null;
        this.executionLineNo = -1;

        if (this.selectedSourceBox)
            this.highlightExecutionLine();  // clear highlight

        var panelStatus = Firebug.chrome.getPanelStatusElements();
        panelStatus.clear(); // clear stack on status bar
        this.updateInfoTip();

        var watchPanel = this.context.getPanel("watches", true);
        if (watchPanel)
            watchPanel.showEmptyMembers();
    },

    /*
     * set the UI's current selected frame from any type of frame. This is the frame to use for evals
     * @param frame: native or XB frame
     */

    setCurrentStackFrame: function(frame)
    {
        if (frame instanceof Ci.jsdIStackFrame)
            this.context.currentFrame = frame;  // TODO XB reverse this so the XB frame is current
        else if (frame instanceof StackFrame)
            this.context.currentFrame = frame.getNativeFrame();
    },

    toggleBreakpoint: function(lineNo)
    {
        var href = this.getSourceBoxURL(this.selectedSourceBox);
        var lineNode = this.selectedSourceBox.getLineNode(lineNo);

        var sourceFile = this.context.sourceFileMap[href];

        if (!sourceFile && FBTrace.DBG_ERRORS)
            FBTrace.sysout("toggleBreakpoint no sourceFile! ", this);
        if (FBTrace.DBG_BP)
            FBTrace.sysout("debugger.toggleBreakpoint lineNo="+lineNo+" sourceFile.href:"+sourceFile.href+" lineNode.breakpoint:"+(lineNode?lineNode.getAttribute("breakpoint"):"(no lineNode)")+"\n", this.selectedSourceBox);

        if (lineNode.getAttribute("breakpoint") == "true")
            fbs.clearBreakpoint(sourceFile.href, lineNo);
        else
            Firebug.Debugger.setBreakpoint(sourceFile, lineNo);
    },

    toggleDisableBreakpoint: function(lineNo)
    {
        var href = this.getSourceBoxURL(this.selectedSourceBox);
        var lineNode = this.selectedSourceBox.getLineNode(lineNo);
        if (lineNode.getAttribute("disabledBreakpoint") == "true")
            fbs.enableBreakpoint(href, lineNo);
        else
            fbs.disableBreakpoint(href, lineNo);
    },

    editBreakpointCondition: function(lineNo)
    {
        var sourceRow = this.selectedSourceBox.getLineNode(lineNo);
        var sourceLine = getChildByClass(sourceRow, "sourceLine");
        var condition = fbs.getBreakpointCondition(this.location.href, lineNo);

        if (condition)
        {
            var watchPanel = this.context.getPanel("watches", true);
            watchPanel.removeWatch(condition);
            watchPanel.rebuild();
        }

        Firebug.Editor.startEditing(sourceLine, condition);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    addSelectionWatch: function()
    {
        var watchPanel = this.context.getPanel("watches", true);
        if (watchPanel)
        {
            var selection = this.document.defaultView.getSelection();
            var source = this.getSourceLinesFrom(selection);
            watchPanel.addWatch(source);
        }
    },

    copySource: function()
    {
        var selection = this.document.defaultView.getSelection();
        var source = this.getSourceLinesFrom(selection);
        copyToClipboard(source);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    updateInfoTip: function()
    {
        var infoTip = this.panelBrowser.infoTip;
        if (infoTip && this.infoTipExpr)
            this.populateInfoTip(infoTip, this.infoTipExpr);
    },

    populateInfoTip: function(infoTip, expr)
    {
        if (!expr || isJavaScriptKeyword(expr))
            return false;

        var self = this;
        // If the evaluate fails, then we report an error and don't show the infoTip
        Firebug.CommandLine.evaluate(expr, this.context, null, this.context.getGlobalScope(),
            function success(result, context)
            {
                var rep = Firebug.getRep(result, context);
                var tag = rep.shortTag ? rep.shortTag : rep.tag;

                if (FBTrace.DBG_STACK)
                    FBTrace.sysout("populateInfoTip result is "+result, result);

                tag.replace({object: result}, infoTip);

                Firebug.chrome.contextMenuObject = result;  // for context menu select()

                self.infoTipExpr = expr;
            },
            function failed(result, context)
            {
                self.infoTipExpr = "";
            }
        );
        return (self.infoTipExpr == expr);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // UI event listeners

    onMouseDown: function(event)
    {
        // Don't interfere with clicks made into a notification editor.
        if (getAncestorByClass(event.target, "breakNotification"))
            return;

        var sourceLine = getAncestorByClass(event.target, "sourceLine");
        if (!sourceLine)
            return;

        var sourceRow = sourceLine.parentNode;
        var compilationUnit = sourceRow.parentNode.repObject;
        var lineNo = parseInt(sourceLine.textContent);

        if (isLeftClick(event))
            this.toggleBreakpoint(lineNo);
        else if (isShiftClick(event))
            this.toggleDisableBreakpoint(lineNo);
        else if (isControlClick(event) || isMiddleClick(event))
        {
            Firebug.Debugger.runUntil(this.context, sourceFile, lineNo, Firebug.Debugger);
            cancelEvent(event);
        }
    },

    onContextMenu: function(event)
    {
        var sourceLine = getAncestorByClass(event.target, "sourceLine");
        if (!sourceLine)
            return;

        var lineNo = parseInt(sourceLine.textContent);
        this.editBreakpointCondition(lineNo);
        cancelEvent(event);
    },

    onMouseOver: function(event)
    {
        var sourceLine = getAncestorByClass(event.target, "sourceLine");
        if (sourceLine)
        {
            if (this.hoveredLine)
                removeClass(this.hoveredLine.parentNode, "hovered");

            this.hoveredLine = sourceLine;

            if (sourceLine)
                setClass(sourceLine.parentNode, "hovered");
        }
    },

    onMouseOut: function(event)
    {
        var sourceLine = getAncestorByClass(event.relatedTarget, "sourceLine");
        if (!sourceLine)
        {
            if (this.hoveredLine)
                removeClass(this.hoveredLine.parentNode, "hovered");

            delete this.hoveredLine;
        }
    },

    onScroll: function(event)
    {
        var scrollingElement = event.target;
        this.reView(scrollingElement);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "script",
    searchable: true,
    breakable: true,
    enableA11y: true,
    order: 40,

    initialize: function(context, doc)
    {
        this.onMouseDown = bind(this.onMouseDown, this);
        this.onContextMenu = bind(this.onContextMenu, this);
        this.onMouseOver = bind(this.onMouseOver, this);
        this.onMouseOut = bind(this.onMouseOut, this);
        this.onScroll = bind(this.onScroll, this);

        this.panelSplitter = $("fbPanelSplitter");
        this.sidePanelDeck = $("fbSidePanelDeck");

        Firebug.SourceBoxPanel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        delete this.selection; // We want the location (compilationUnit) to persist, not the selection (eg stackFrame).
        persistObjects(this, state);

        state.location = this.location;

        var sourceBox = this.selectedSourceBox;
        if (sourceBox)
        {
            state.previousCenterLine = sourceBox.centerLine;
            delete this.selectedSourceBox;
        }

        Firebug.SourceBoxPanel.destroy.apply(this, arguments);
    },

    detach: function(oldChrome, newChrome)
    {
        if (this.selectedSourceBox)
            this.lastSourceScrollTop = this.selectedSourceBox.scrollTop;

        if (this.context.stopped)
        {
            Firebug.Debugger.detachListeners(this.context, oldChrome);
            Firebug.Debugger.attachListeners(this.context, newChrome);
        }

        Firebug.Debugger.syncCommands(this.context);

        Firebug.SourceBoxPanel.detach.apply(this, arguments);
    },

    reattach: function(doc)
    {
        Firebug.SourceBoxPanel.reattach.apply(this, arguments);

        setTimeout(bind(function delayScrollToLastTop()
        {
            if (this.lastSourceScrollTop)
            {
                this.selectedSourceBox.scrollTop = this.lastSourceScrollTop;
                delete this.lastSourceScrollTop;
            }
        }, this));
    },

    initializeNode: function(oldPanelNode)
    {
        this.tooltip = this.document.createElement("div");
        setClass(this.tooltip, "scriptTooltip");
        this.tooltip.setAttribute('aria-live', 'polite')
        obscure(this.tooltip, true);
        this.panelNode.appendChild(this.tooltip);

        this.panelNode.addEventListener("mousedown", this.onMouseDown, true);
        this.panelNode.addEventListener("contextmenu", this.onContextMenu, false);
        this.panelNode.addEventListener("mouseover", this.onMouseOver, false);
        this.panelNode.addEventListener("mouseout", this.onMouseOut, false);
        this.panelNode.addEventListener("scroll", this.onScroll, true);

        Firebug.SourceBoxPanel.initializeNode.apply(this, arguments);
    },

    destroyNode: function()
    {
        if (this.tooltipTimeout)
            clearTimeout(this.tooltipTimeout);

        this.panelNode.removeEventListener("mousedown", this.onMouseDown, true);
        this.panelNode.removeEventListener("contextmenu", this.onContextMenu, false);
        this.panelNode.removeEventListener("mouseover", this.onMouseOver, false);
        this.panelNode.removeEventListener("mouseout", this.onMouseOut, false);
        this.panelNode.removeEventListener("scroll", this.onScroll, true);

        Firebug.SourceBoxPanel.destroyNode.apply(this, arguments);
    },

    clear: function()
    {
        clearNode(this.panelNode);
    },

    showWarning: function()
    {
        // Fill the panel node with a warning if needed
        var aLocation = this.getDefaultLocation();
        var jsEnabled = Firebug.getPref("javascript", "enabled");
        if (FBL.fbs.activitySuspended && !this.context.stopped)
        {
            // Make sure that the content of the panel is restored as soon as
            // the debugger is resumed.
            this.restored = false;
            this.activeWarningTag = WarningRep.showActivitySuspended(this.panelNode);
        }
        else if (!jsEnabled)
            this.activeWarningTag = WarningRep.showNotEnabled(this.panelNode);
        else if (this.context.allScriptsWereFiltered)
            this.activeWarningTag = WarningRep.showFiltered(this.panelNode);
        else if (aLocation && !this.context.jsDebuggerActive)
            this.activeWarningTag = WarningRep.showInactive(this.panelNode);
        else if (!aLocation) // they were not filtered, we just had none
            this.activeWarningTag = WarningRep.showNoScript(this.panelNode);
        else
            return false;

        return true;
    },

    show: function(state)
    {
        var enabled = Firebug.Debugger.isAlwaysEnabled();

        if (!enabled)
            return;

        var active = !this.showWarning();

        if (active)
        {
            this.location = this.getDefaultLocation();

            if (this.context.loaded)
            {
                if (!this.restored)
                {
                    delete this.location;  // remove the default location if any
                    restoreLocation(this, state);
                    this.restored = true;
                }
                else // we already restored
                {
                    if (!this.selectedSourceBox)  // but somehow we did not make a sourcebox?
                        this.navigate(this.location);
                    else  // then we can sync the location to the sourcebox
                        this.location = this.selectedSourceBox.repObject;
                }

                if (state && this.location)  // then we are restoring and we have a location, so scroll when we can
                    this.scrollInfo = { location: this.location, previousCenterLine: state.previousCenterLine};
            }
            else // show default
            {
                this.navigate(this.location);
            }

            this.highlight(this.context.stopped);

            var breakpointPanel = this.context.getPanel("breakpoints", true);
            if (breakpointPanel)
                breakpointPanel.refresh();
        }

        collapse(Firebug.chrome.$("fbToolbar"), !active);

        // These buttons are visible only if debugger is enabled.
        this.showToolbarButtons("fbLocationSeparator", active);
        this.showToolbarButtons("fbDebuggerButtons", active);
        this.showToolbarButtons("fbLocationButtons", active);
        this.showToolbarButtons("fbScriptButtons", active);
        this.showToolbarButtons("fbStatusButtons", active);

        // Additional debugger panels are visible only if debugger
        // is active.
        this.panelSplitter.collapsed = !active;
        this.sidePanelDeck.collapsed = !active;
    },

    hide: function(state)
    {
        this.highlight(this.context.stopped);

        var panelStatus = Firebug.chrome.getPanelStatusElements();
        FBL.hide(panelStatus, false);

        delete this.infoTipExpr;
    },

    search: function(text, reverse)
    {
        var sourceBox = this.selectedSourceBox;
        if (!text || !sourceBox)
        {
            delete this.currentSearch;
            return false;
        }

        // Check if the search is for a line number
        var m = reLineNumber.exec(text);
        if (m)
        {
            if (!m[1])
                return true; // Don't beep if only a # has been typed

            var lineNo = parseInt(m[1]);
            if (!isNaN(lineNo) && (lineNo > 0) && (lineNo < sourceBox.lines.length) )
            {
                this.scrollToLine(sourceBox.repObject.href, lineNo,  this.jumpHighlightFactory(lineNo, this.context))
                return true;
            }
        }

        var curDoc = this.searchCurrentDoc(!Firebug.searchGlobal, text, reverse);
        if (!curDoc && Firebug.searchGlobal)
        {
            return this.searchOtherDocs(text, reverse);
        }
        return curDoc;
    },

    searchOtherDocs: function(text, reverse)
    {
        var scanRE = Firebug.Search.getTestingRegex(text);

        var self = this;

        function scanDoc(compilationUnit) {
            var lines = compilationUnit.loadScriptLines(self.context);
            if (!lines)
                return;
            // we don't care about reverse here as we are just looking for existence,
            // if we do have a result we will handle the reverse logic on display
            for (var i = 0; i < lines.length; i++) {
                if (scanRE.test(lines[i]))
                {
                    return true;
                }
            }
        }

        if (this.navigateToNextDocument(scanDoc, reverse))
        {
            return this.searchCurrentDoc(true, text, reverse);
        }
    },

    searchCurrentDoc: function(wrapSearch, text, reverse)
    {
        var sourceBox = this.selectedSourceBox;

        var lineNo = null;
        if (this.currentSearch && text == this.currentSearch.text)
            lineNo = this.currentSearch.findNext(wrapSearch, reverse, Firebug.Search.isCaseSensitive(text));
        else
        {
            this.currentSearch = new SourceBoxTextSearch(sourceBox);
            lineNo = this.currentSearch.find(text, reverse, Firebug.Search.isCaseSensitive(text));
        }

        if (lineNo || lineNo === 0)
        {
            // this lineNo is an zero-based index into sourceBox.lines. Add one for user line numbers
            this.scrollToLine(sourceBox.repObject.href, lineNo, this.jumpHighlightFactory(lineNo+1, this.context));
            dispatch(this.fbListeners, 'onScriptSearchMatchFound', [this, text, sourceBox.repObject, lineNo]);

            return true;
        }
        else
        {
            dispatch(this.fbListeners, 'onScriptSearchMatchFound', [this, text, null, null]);
            return false;
        }
    },

    getSearchOptionsMenuItems: function()
    {
        return [
            Firebug.Search.searchOptionMenu("search.Case Sensitive", "searchCaseSensitive"),
            Firebug.Search.searchOptionMenu("search.Multiple Files", "searchGlobal"),
            Firebug.Search.searchOptionMenu("search.Use Regular Expression", "searchUseRegularExpression")
        ];
    },

    supportsObject: function(object, type)
    {
        if( object instanceof jsdIStackFrame
            || object instanceof CompilationUnit
            || (object instanceof SourceLink && object.type == "js")
            || typeof(object) == "function"
            || object instanceof StackFrame)
            return 1;
        else return 0;
    },

    refresh: function()  // delete any sourceBox-es that are not in sync with sourceFiles
    {
        for(var url in this.sourceBoxes)
        {
            if (this.sourceBoxes.hasOwnProperty(url))
            {
                var sourceBox = this.sourceBoxes[url];
                var compilationUnit = this.context.getCompilationUnit(url);
                if (!compilationUnit || compilationUnit != sourceBox.repObject) // then out of sync
                {
                   var victim = this.sourceBoxes[url];
                   delete this.sourceBoxes[url];
                   if (this.selectedSourceBox == victim)
                   {
                        collapse(this.selectedSourceBox, true);
                        delete this.selectedSourceBox;
                   }
                   if (FBTrace.DBG_SOURCEFILES)
                       FBTrace.sysout("debugger.refresh deleted sourceBox for "+url);
                }
            }
        }

        // then show() has not run, but we have to refresh, so do the default.
        if (!this.selectedSourceBox)
            this.navigate();
    },

    updateLocation: function(compilationUnit)
    {
        if (!compilationUnit)
            return;  // XXXjjb do we need to show a blank?

        // Since our last use of the compilationUnit we may have compiled or recompiled the source
        var updatedCompilationUnit = this.context.getCompilationUnit(compilationUnit.getURL());
        if (!updatedCompilationUnit)
            updatedCompilationUnit = this.getDefaultLocation();
        if (!updatedCompilationUnit)
            return;

        if (this.activeWarningTag)
        {
            clearNode(this.panelNode);
            delete this.activeWarningTag;

            // The user was seeing the warning, but selected a file to show in the script panel.
            // The removal of the warning leaves the panel without a clientHeight, so
            //  the old sourcebox will be out of sync. Just remove it and start over.
            this.removeAllSourceBoxes();
        }

        this.showSource(updatedCompilationUnit.getURL());
        dispatch(this.fbListeners, "onUpdateScriptLocation", [this, updatedCompilationUnit]);
    },

    updateSelection: function(object)
    {
        if (FBTrace.DBG_PANELS)
        {
            FBTrace.sysout("debugger updateSelection object:"+object+" of type "+typeof(object)+"\n");
            if (object instanceof jsdIStackFrame)
                FBTrace.sysout("debugger updateSelection this.showStackFrame(object)", object);
            else if (object instanceof CompilationUnit)
                FBTrace.sysout("debugger updateSelection this.navigate(object)", object);
            else if (object instanceof SourceLink)
                FBTrace.sysout("debugger updateSelection this.showSourceLink(object)", object);
            else if (typeof(object) == "function")
                FBTrace.sysout("debugger updateSelection this.showFunction(object)", object);
            else if (object instanceof StackFrame)
                FBTrace.sysout("debugger updateSelection this.showStackFrameXB(object)", object);
            else
                FBTrace.sysout("debugger updateSelection this.showStackFrame(null)", object);
        }

        if (object instanceof jsdIStackFrame)
            this.showStackFrame(object);
        else if (object instanceof CompilationUnit)
            this.navigate(object);
        else if (object instanceof SourceLink)
            this.showSourceLink(object);
        else if (typeof(object) == "function")
            this.showFunction(object);
        else if (object instanceof StackFrame)
            this.showStackFrameXB(object);
        else
            this.showStackFrame(null);
    },

    showThisCompilationUnit: function(compilationUnit)
    {
        //-----------------------------------123456789
        if (compilationUnit.getURL().substr(0, 9) == "chrome://")
            return false;

           if (compilationUnit.getKind() === CompilationUnit.EVAL && !this.showEvals)
               return false;

        if (compilationUnit.getKind() === CompilationUnit.BROWSER_GENERATED && !this.showEvents)
            return false;

        return true;
    },

    getLocationList: function()
    {
        var context = this.context;

        var allSources = context.getAllCompilationUnits();

        if (!allSources.length)
            return [];

        if (Firebug.showAllSourceFiles)
        {
            if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("debugger getLocationList "+context.getName()+" allSources", allSources);
            return allSources;
        }

        var filter = Firebug.getPref(Firebug.servicePrefDomain, "scriptsFilter");
        this.showEvents = (filter == "all" || filter == "events");
        this.showEvals = (filter == "all" || filter == "evals");

        var list = [];
        for (var i = 0; i < allSources.length; i++)
        {
            if (this.showThisCompilationUnit(allSources[i]))
                list.push(allSources[i]);
        }

        if (!list.length && allSources.length)
            this.context.allScriptsWereFiltered = true;
        else
            delete this.context.allScriptsWereFiltered;

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("debugger.getLocationList enabledOnLoad:"+context.onLoadWindowContent+" all:"+allSources.length+" filtered:"+list.length, list);
        return list;
    },

    getDefaultLocation: function()
    {
        var compilationUnits = this.getLocationList();
        if (!compilationUnits.length)
            return null;

        if (this.context)
        {
            var url = this.context.getWindowLocation();
            for (var i = 0; i < compilationUnits.length; i++)
            {
                if (url == compilationUnits[i].href)
                    return compilationUnits[i];
            }
            return compilationUnits[0];
        }
        else
            return compilationUnits[0];
    },

    getDefaultSelection: function()
    {
        return this.getDefaultLocation();
    },

    getTooltipObject: function(target)
    {
        // Target should be A element with class = sourceLine
        if ( hasClass(target, 'sourceLine') )
        {
            var lineNo = parseInt(target.innerHTML);

            if ( isNaN(lineNo) )
                return;
            var scripts = this.location.scriptsIfLineCouldBeExecutable(lineNo);
            if (scripts)
            {
                var str = "scripts ";
                for(var i = 0; i < scripts.length; i++)
                    str += scripts[i].tag +" ";
                return str;
            }
            else
                return new String("no executable script at "+lineNo);
        }
        return null;
    },

    getPopupObject: function(target)
    {
        // Don't show popup over the line numbers, we show the conditional breakpoint
        // editor there instead
        var sourceLine = getAncestorByClass(target, "sourceLine");
        if (sourceLine)
            return;

        var sourceRow = getAncestorByClass(target, "sourceRow");
        if (!sourceRow)
            return;

        var lineNo = parseInt(sourceRow.firstChild.textContent);
        var scripts = findScripts(this.context, this.location.href, lineNo);
        return scripts; // gee I wonder what will happen?
    },

    showInfoTip: function(infoTip, target, x, y, rangeParent, rangeOffset)
    {
        var frame = this.context.currentFrame;
        if (!frame)
            return;

        var sourceRowText = getAncestorByClass(target, "sourceRowText");
        if (!sourceRowText)
            return;

        // see http://code.google.com/p/fbug/issues/detail?id=889
        // idea from: Jonathan Zarate's rikaichan extension (http://www.polarcloud.com/rikaichan/)
        if (!rangeParent)
            return;
        rangeOffset = rangeOffset || 0;
        var expr = getExpressionAt(rangeParent.data, rangeOffset);
        if (!expr || !expr.expr)
            return;

        if (expr.expr == this.infoTipExpr)
            return true;
        else
            return this.populateInfoTip(infoTip, expr.expr);
    },

    getObjectPath: function(frame)
    {
        frame = this.context.currentFrame;

        if (FBTrace.DBG_STACK)
            FBTrace.sysout("debugger.getObjectPath "+((frame && frame.isValid)?("frame is good:"+frame.script.fileName+"@"+frame.line):(frame?"frame invalid":"no frame")), this.selection);

        var frames = [];
        for (; frame; frame = getCallingFrame(frame))
            frames.push(frame);

        return frames;
    },

    getObjectLocation: function(compilationUnit)
    {
        return compilationUnit.getURL();
    },

    // return.path: group/category label, return.name: item label
    getObjectDescription: function(compilationUnit)
    {
        if (compilationUnit instanceof Firebug.SourceFile)
            debugger;
        var kind = compilationUnit.getKind();
        if (kind == CompilationUnit.BROWSER_GENERATED)
        {
            var url = compilationUnit.getURL()
            var i = url.indexOf("/event/seq");
            var container = url.substr(0,i);
            var split = FBL.splitURLBase(container);  // path & name
            return {path: split.path, name: split.name+url.substr(i) };
        }
        return FBL.splitURLBase(compilationUnit.getURL());
    },

    getOptionsMenuItems: function()
    {
        var context = this.context;

        return [
            optionMenu("DecompileEvals", "decompileEvals"),
            serviceOptionMenu("ShowAllSourceFiles", "showAllSourceFiles"),
            // 1.2: always check last line; optionMenu("UseLastLineForEvalName", "useLastLineForEvalName"),
            // 1.2: always use MD5 optionMenu("UseMD5ForEvalName", "useMD5ForEvalName")
            serviceOptionMenu("TrackThrowCatch", "trackThrowCatch"),
            //"-",
            //1.2 option on toolbar this.optionMenu("DebuggerEnableAlways", enableAlwaysPref)
        ];
    },

    optionMenu: function(label, option)
    {
        var checked = Firebug.getPref(prefDomain, option);
        return {label: label, type: "checkbox", checked: checked,
            command: bindFixed(Firebug.setPref, Firebug, prefDomain, option, !checked) };
    },

    getContextMenuItems: function(fn, target)
    {
        if (getAncestorByClass(target, "sourceLine"))
            return;

        var sourceRow = getAncestorByClass(target, "sourceRow");
        if (!sourceRow)
            return;

        var sourceLine = getChildByClass(sourceRow, "sourceLine");
        var lineNo = parseInt(sourceLine.textContent);

        var items = [];

        var selection = this.document.defaultView.getSelection();
        if (selection.toString())
        {
            items.push(
                {label: "CopySourceCode", command: bind(this.copySource, this) },
                "-",
                {label: "AddWatch", command: bind(this.addSelectionWatch, this) }
            );
        }

        var hasBreakpoint = sourceRow.getAttribute("breakpoint") == "true";

        items.push(
            "-",
            {label: "SetBreakpoint", type: "checkbox", checked: hasBreakpoint,
                command: bindFixed(this.toggleBreakpoint, this, lineNo) }
        );
        if (hasBreakpoint)
        {
            var isDisabled = fbs.isBreakpointDisabled(this.location.href, lineNo);
            items.push(
                {label: "DisableBreakpoint", type: "checkbox", checked: isDisabled,
                    command: bindFixed(this.toggleDisableBreakpoint, this, lineNo) }
            );
        }
        items.push(
            {label: "EditBreakpointCondition",
                command: bindFixed(this.editBreakpointCondition, this, lineNo) }
        );

        if (this.context.stopped)
        {
            var sourceRow = getAncestorByClass(target, "sourceRow");
            if (sourceRow)
            {
                var compilationUnit = getAncestorByClass(sourceRow, "sourceBox").repObject;
                var lineNo = parseInt(sourceRow.firstChild.textContent);

                var debuggr = Firebug.Debugger;
                items.push(
                    "-",
                    {label: "Continue",
                        command: bindFixed(debuggr.resume, debuggr, this.context) },
                    {label: "StepOver",
                        command: bindFixed(debuggr.stepOver, debuggr, this.context) },
                    {label: "StepInto",
                        command: bindFixed(debuggr.stepInto, debuggr, this.context) },
                    {label: "StepOut",
                        command: bindFixed(debuggr.stepOut, debuggr, this.context) },
                    {label: "RunUntil",
                        command: bindFixed(debuggr.runUntil, debuggr, this.context,
                        compilationUnit, lineNo) }
                );
            }
        }

        return items;
    },

    getEditor: function(target, value)
    {
        if (!this.conditionEditor)
            this.conditionEditor = new Firebug.Breakpoint.ConditionEditor(this.document);

        return this.conditionEditor;
    },

    breakOnNext: function(enabled)
    {
        if (enabled)
            Firebug.Debugger.suspend(this.context);
        else
            Firebug.Debugger.unSuspend(this.context);
    },

    getBreakOnNextTooltip: function(armed)
    {
        return (armed ? $STR("script.Disable Break On Next") : $STR("script.Break On Next"));
    },

    shouldBreakOnNext: function()
    {
        var stepMode = fbs.getStepMode();
        return stepMode && (stepMode == "STEP_SUSPEND");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends ActivablePanel

    /**
     * Support for panel activation.
     */
    onActivationChanged: function(enable)
    {
        if (FBTrace.DBG_CONSOLE || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("console.ScriptPanel.onActivationChanged; " + enable);

        if (enable)
            Firebug.Debugger.addObserver(this);
        else
            Firebug.Debugger.removeObserver(this);
    },
});

// ************************************************************************************************

/**
 * @domplate Displays various warning messages within the Script panel.
 */
Firebug.ScriptPanel.WarningRep = domplate(Firebug.Rep,
{
    tag:
        DIV({"class": "disabledPanelBox"},
            H1({"class": "disabledPanelHead"},
                SPAN("$pageTitle")
            ),
            P({"class": "disabledPanelDescription", style: "margin-top: 15px;"},
                SPAN("$suggestion")
            )
        ),

    enableScriptTag:
        SPAN({"class": "objectLink", onclick: "$onEnableScript", style: "color: blue"},
            $STR("script.button.enable_javascript")
        ),

    focusDebuggerTag:
        SPAN({"class": "objectLink", onclick: "$onFocusDebugger", style: "color: blue"},
            $STR("script.button.Go to that page")
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onEnableScript: function(event)
    {
        Firebug.setPref("javascript", "enabled", true);

        this.reloadPageFromMemory(event.target);
    },

    reloadPageFromMemory: function(event)
    {
        var context= Firebug.getElementPanel(event.target).context;
        if (context.browser)
            context.browser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_CHARSET_CHANGE)
        else
            context.window.location.reload();
    },

    onFocusDebugger: function(event)
    {
        iterateBrowserWindows("navigator:browser", function(win)
        {
            return win.TabWatcher.iterateContexts(function(context)
            {
                if (context.stopped)
                {
                     win.Firebug.focusBrowserTab(context.window);
                     return true;
                }
            });
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    showInactive: function(parentNode)
    {
        var args = {
            pageTitle: $STR("script.warning.inactive_during_page_load"),
            suggestion: $STR("script.suggestion.inactive_during_page_load2")
        };

        var box = this.tag.replace(args, parentNode, this);
        var description = box.querySelector(".disabledPanelDescription");
        FirebugReps.Description.render(args.suggestion, description,
            bind(this.reloadPageFromMemory, this));

        return box;
    },

    showNotEnabled: function(parentNode)
    {
        var args = {
            pageTitle: $STR("script.warning.javascript_not_enabled"),
            suggestion: $STR("script.suggestion.javascript_not_enabled")
        }

        var box = this.tag.replace(args, parentNode, this);
        this.enableScriptTag.append({}, box, this);

        return box;
    },

    showFiltered: function(parentNode)
    {
        var args = {
            pageTitle: $STR("script.warning.all_scripts_filtered"),
            suggestion: $STR("script.suggestion.all_scripts_filtered")
        };
        return this.tag.replace(args, parentNode, this);
    },

    showNoScript: function(parentNode)
    {
        var args = {
            pageTitle: $STR("script.warning.no_javascript"),
            suggestion: $STR("script.suggestion.no_javascript")
        }
        return this.tag.replace(args, parentNode, this);
    },

    showActivitySuspended: function(parentNode)
    {
        var args = {
            pageTitle: $STR("script.warning.debugger_active"),
            suggestion: $STR("script.suggestion.debugger_active")
        }

        var box = this.tag.replace(args, parentNode, this);
        this.focusDebuggerTag.append({}, box, this);

        return box;
    }
});

var WarningRep = Firebug.ScriptPanel.WarningRep;

// ************************************************************************************************

Firebug.Debugger.Breakpoint = function(name, href, lineNumber, checked, sourceLine, isFuture)
{
    this.name = name;
    this.href = href;
    this.lineNumber = lineNumber;
    this.checked = checked;
    this.sourceLine = sourceLine;
    this.isFuture = isFuture;
}

// ************************************************************************************************

Firebug.DebuggerListener =
{
    /*
     * Called before pausing JSD to allow listeners to prevent the pause
     * @param rejection an array, push boolean true to cause rejection.
     */
    onPauseJSDRequested: function(rejection)
    {
    },

    /*
     * @param active the current value of  (jsd && jsd.isOn && (jsd.pauseDepth == 0) )
     * @param why a string explaining the change
     */
    onJSDActivate: function(active, why)  // start or unPause
    {

    },

    /*
     * @param active the current value of  (jsd && jsd.isOn && (jsd.pauseDepth == 0) )
     * @param why a string explaining the change
     */
    onJSDDeactivate: function(active, why) // stop or pause
    {

    },

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
    },
};

// ************************************************************************************************



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
                                FBTrace.sysout(" Did prependPath with p "+p+" gave "+referents[referents.length - 1].getObjectPathExpression(), referents[referents.length - 1]);

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
// ************************************************************************************************

function getCallingFrame(frame)
{
    try
    {
        do
        {
            frame = frame.callingFrame;
            if (!(Firebug.filterSystemURLs && isSystemURL(normalizeURL(frame.script.fileName))))
                return frame;
        }
        while (frame);
    }
    catch (exc)
    {
    }
    return null;
}

function getFrameWindow(frame)
{
    var result = {};
    if (frame.eval("window", "", 1, result))
    {
        var win = unwrapIValue(result.value);
        return getRootWindow(win);
    }
}

function ArrayEnumerator(array)
{
    this.index = 0;
    this.array = array;
    this.hasMoreElements = function()
    {
        return (this.index < array.length);
    }
    this.getNext = function()
    {
        return this.array[++this.index];
    }
}

// ************************************************************************************************

Firebug.registerActivableModule(Firebug.Debugger);
Firebug.registerPanel(Firebug.ScriptPanel);

// ************************************************************************************************
}});
