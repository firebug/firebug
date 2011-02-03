/* See license.txt for terms of usage */

define("javascriptmodule.js", ["bti/compilationunit.js"], function(CompilationUnit) { with (FBL) {

// ************************************************************************************************
// Constants
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const tooltipTimeout = 300;

const reEval =  /\s*eval\s*\(([^)]*)\)/m;        // eval ( $1 )
const reHTM = /\.[hH][tT][mM]/;
const reFunction = /\s*Function\s*\(([^)]*)\)/m;
const reTooMuchRecursion = /too\smuch\srecursion/;

// ************************************************************************************************

Firebug.JavaScriptModule = extend(Firebug.ActivableModule,
{
    dispatchName: "JavaScriptModule",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Debugging


    // on bti, method of stack
    evaluate: function(js, context, scope)  // TODO remote: move to backend, proxy to front
    {
        throw new Error("need bti");
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

    /*
     * Used by autocomplete in commandLine
     * @return array of global property names
     */

    // on bti
    getCurrentFrameKeys: function(context)  // TODO remote
    {
        throw new Error("need bti");
        var globals = keys(context.getGlobalScope().wrappedJSObject);  // return is safe

        if (context.currentFrame)
            return this.getFrameKeys(context.currentFrame, globals);

        return globals;
    },



    // on bti
    getCurrentStackTrace: function(context)
    {
        throw new Error("need bti");
        var trace = null;

        Firebug.JavaScriptModule.halt(function(frame)
        {
            if (FBTrace.DBG_STACK)
                FBTrace.sysout("lib.getCurrentStackTrace frame:", frame);

            trace = FBL.getCorrectedStackTrace(frame, context);

            if (FBTrace.DBG_STACK)
                FBTrace.sysout("lib.getCurrentStackTrace trace:", trace.toString().split('\n'));
        });

        return trace;
    },



    // This URL prefix is used to skip frames from chrome URLs. Note that sometimes chrome URLs
    // are used even in web pages, but only in rare cases so don't worry about it.
    // Don't be specific like: chrome://firebug/ since frames coming from extensions e.g.
    // chrome://firecookie/ wouldn't be skipped then.
    breakNowURLPrefix: "chrome://",

    // on bti
    breakNow: function(context)
    {
        throw new Error("need bti");
        Firebug.JavaScriptModule.halt(function haltAnalysis(frame)
        {
            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("JavaScriptModule.breakNow: frame "+frame.script.fileName+" context "+
                    context.getName(), getJSDStackDump(frame) );

            for (; frame && frame.isValid; frame = frame.callingFrame)
            {
                var fileName = frame.script.fileName;
                if (!fileName)
                    continue;
                else if (fileName.indexOf(Firebug.JavaScriptModule.breakNowURLPrefix) == 0)
                    continue;
                else if (fileName.indexOf("/modules/firebug-") != -1)
                    continue;
                else
                    break;
            }

            if (frame)
            {
                Firebug.JavaScriptModule.breakContext = context;

                // I just made up a type that won't match TYPE_DEBUGGER_KEYWORD
                Firebug.JavaScriptModule.onBreak(frame, "halt");
            }
            else
            {
                if (FBTrace.DBG_UI_LOOP)
                    FBTrace.sysout("JavaScriptModule.breakNow: no frame that not starting with "+
                        Firebug.JavaScriptModule.breakNowURLPrefix);
            }
        });
    },



    // on bti
    rerun: function(context)
    {
        throw new Error("need bti");
        if(!context.stopped)
        {
            FBTrace.sysout("JavaScriptModule.rerun FAILS: not stopped");
            return;
        }

        if (Firebug.rerun)
        {
            FBTrace.sysout("JavaScriptModule.rerun FAILS: Firebug.rerun in progress");
            return;
        }

        Firebug.rerun = this.getRerun(context);

        // now continue but abort the current call stack.
        this.resume(context);  // the Firebug.rerun will signal abort stack
    },



    // bti
    resume: function(context)
    {
        throw new Error("need bti");
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("JavaScriptModule.resume, context.stopped:"+context.stopped+"\n");

        // this will cause us to return to just after the enterNestedEventLoop call
        var depth = fbs.exitNestedEventLoop();

        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("JavaScriptModule.resume, depth:"+depth+"\n");
    },

    // bti
    abort: function(context)
    {
        throw new Error("need bti");
        if (context.stopped)
        {
            context.aborted = true;
            this.thaw(context);
            this.resume(context);
            fbs.unPause(true);
        }
    },

    // bti
    stepOver: function(context)
    {
        throw new Error("need bti");
        if (!context.stoppedFrame || !context.stoppedFrame.isValid)
            return;

        fbs.step(STEP_OVER, context, this);
        this.resume(context);
    },

    stepInto: function(context)
    {
        throw new Error("need bti");
        if (!context.stoppedFrame || !context.stoppedFrame.isValid)
            return;

        fbs.step(STEP_INTO, context, this);
        this.resume(context);
    },

    stepOut: function(context)
    {
        throw new Error("need bti");
        if (!context.stoppedFrame || !context.stoppedFrame.isValid)
            return;

        fbs.step(STEP_OUT, context, this);
        this.resume(context);
    },

    suspend: function(context)
    {
        throw new Error("need bti");
        if (context.stopped)
            return;
        fbs.suspend(this, context);
    },

    unSuspend: function(context)
    {
        throw new Error("need bti");
        fbs.stopStepping(null, context);  // TODO per context
        fbs.cancelBreakOnNextCall(this, context)
    },

    runUntil: function(context, compilationUnit, lineNo)
    {
        throw new Error("need bti");  // ??
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("runUntil "+lineNo+" @"+compilationUnit);

        if (!context.stoppedFrame || !context.stoppedFrame.isValid)
            return;

        var sourceFile = compilationUnit.sourceFile;
        fbs.runUntil(compilationUnit.sourceFile, lineNo, context.stoppedFrame, this);
        this.resume(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    // on bti
    toggleFreezeWindow: function(context)
    {
        throw new Error("need bti");
        if (!context.stopped) // then we need to break into debugger to get the executionContext
        {
            Firebug.JavaScriptModule.halt(function grabContext(frame)
            {
                context.stoppedFrame = frame;
                Firebug.JavaScriptModule.doToggleFreezeWindow(context);
                delete context.stoppedFrame;
            });

            Firebug.JavaScriptModule.toggleReportTopLevel(context);
            Firebug.JavaScriptModule.suspend(context);
        }
        else
        {
            Firebug.JavaScriptModule.doToggleFreezeWindow(context);
        }
    },


    toggleReportTopLevel: function(context)
    {
        throw new Error("need bti");
        if (context.reportTopLevel)
            fbs.setTopLevelHook(null);
        else
        {
            fbs.setTopLevelHook(Firebug.JavaScriptModule, function reportTopLevel(frame)
            {
                Firebug.Console.logFormatted(["JavaScript entered", frame.script.fileName, frame.line], context, "info");
            });
        }
    },

    setBreakOnNextCause: function(context, frame)  // TODO this should be in the panel (front end)
    {
        throw new Error("need bti");
        var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, frame.script);
        var analyzer = sourceFile.getScriptAnalyzer(frame.script);
        var lineNo = analyzer.getSourceLineFromFrame(context, frame);

        context.breakingCause =
        {
            title: $STR("Break On Next"),
            message: $STR("Disable converts pause to disabled breakpoint"), //xxxHonza localization
            skipAction: function addSkipperAndGo()
            {
                // a breakpoint that never hits, but prevents debugger keyword (see fbs.onDebugger as well)
                var bp = Firebug.JavaScriptModule.setBreakpoint(sourceFile, lineNo);
                fbs.disableBreakpoint(sourceFile.href, lineNo);

                if (FBTrace.DBG_BP)
                    FBTrace.sysout("JavaScriptModule.setBreakOnNextCause converted to disabled bp " +
                        sourceFile.href+"@"+lineNo+" tag: "+frame.script.tag, bp);

                Firebug.JavaScriptModule.resume(context);
            },
            okAction: function justGo()
            {
                Firebug.JavaScriptModule.resume(context);
            },
        };
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Breakpoints

    setBreakpoint: function(sourceFile, lineNo)
    {
        throw new Error("need bti");
        if (sourceFile instanceof CompilationUnit)
            sourceFile = sourceFile.sourceFile;  // see HACK in tabContext
        fbs.setBreakpoint(sourceFile, lineNo, null, Firebug.JavaScriptModule);
    },

    clearBreakpoint: function(sourceFile, lineNo)
    {
        throw new Error("need bti");
        fbs.clearBreakpoint(sourceFile.href, lineNo);
    },

    setErrorBreakpoint: function(compilationUnit, line)
    {
        throw new Error("need bti");
        fbs.setErrorBreakpoint(compilationUnit.sourceFile, line, Firebug.JavaScriptModule);
    },

    clearErrorBreakpoint: function(compilationUnit, line)
    {
        throw new Error("need bti");
        fbs.clearErrorBreakpoint(compilationUnit.getURL(), line, Firebug.JavaScriptModule);
    },

    clearAllBreakpoints: function(context)
    {
        throw new Error("need bti");
        if (context)
        {
            var units = context.getAllCompilationUnits();
            fbs.clearAllBreakpoints(units, Firebug.JavaScriptModule);
        }
        else
        {
            fbs.enumerateBreakpoints(null, {call: function(url, lineNo, bp) // null means all urls
            {
                if (bp.debuggerName !== Firebug.JavaScriptModule.debuggerName) // skip breakpoints of other debuggers.
                    return;

                if (context && !context.getCompilationUnit(url)) // then we want to clear only one context,
                    return;                                      // so skip URLs in other contexts

                fbs.clearBreakpoint(url, lineNo);
            }});
        }
    },

    enableAllBreakpoints: function(context)
    {
        throw new Error("need bti");

    },

    disableAllBreakpoints: function(context)
    {
        throw new Error("need bti");

    },

    getBreakpointCount: function(context)
    {
        throw new Error("need bti");

    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Debugging and monitoring

    traceAll: function(context)
    {
        throw new Error("need bti");
    },

    untraceAll: function(context)
    {
        throw new Error("need bti");
    },

    monitorFunction: function(fn, mode)
    {
        throw new Error("need bti");
    },

    unmonitorFunction: function(fn, mode)
    {
        throw new Error("need bti");
    },

    monitorScript: function(fn, script, mode)
    {
        throw new Error("need bti");
    },

    unmonitorScript: function(fn, script, mode)
    {
        throw new Error("need bti");
    },

    traceCalls: function(context, fn)
    {
        throw new Error("need bti");
    },

    untraceCalls: function(context, fn)
    {
        throw new Error("need bti");
    },


    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // UI Stuff

    /*
     * Called when a nestedEventLoop begins
     */
    startDebugging: function(context)
    {
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("startDebugging enter context.stopped:"+context.stopped+
                " for context: "+context.getName()+"\n");

        try
        {
            context.executingSourceFile =
                Firebug.SourceFile.getSourceFileByScript(context, context.stoppedFrame.script);

            // bail out, we don't want the user stuck in debug with out source.
            if (!context.executingSourceFile)
            {
                if (FBTrace.DBG_UI_LOOP)
                    FBTrace.sysout("startDebugging resuming, no sourceFile for "+
                        context.stoppedFrame.script.fileName, context.stoppedFrame.script.functionSource);

                this.resume(context);
                return;
            }

            var currentBreakable = Firebug.chrome.getGlobalAttribute("cmd_breakOnNext", "breakable");

            if (FBTrace.DBG_BP)
                FBTrace.sysout("JavaScriptModule.startDebugging; currentBreakable "+currentBreakable+
                    " in " + context.getName()+" currentContext "+Firebug.currentContext.getName());

            if (currentBreakable == "false") // then we are armed but we broke
                Firebug.chrome.setGlobalAttribute("cmd_breakOnNext", "breakable", "true");

            if (context != Firebug.currentContext)
                Firebug.selectContext(context);  // Make Firebug.currentContext = context and sync the UI

            if (Firebug.isMinimized()) // then open the UI to show we are stopped
                Firebug.unMinimize();

            this.syncCommands(context);
            this.syncListeners(context);

            // Update Break on Next lightning.
            var panel = context.getPanel("script", true);
            Firebug.Breakpoint.updatePanelTab(panel, false);
            Firebug.chrome.syncPanel("script");  // issue 3463
            context.stoppedFrameXB = FBL.getStackFrame(context.stoppedFrame, context);
            Firebug.chrome.select(context.stoppedFrameXB, "script", null, true);
            Firebug.chrome.focus();
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Resuming JavaScriptModule: error during debugging loop: "+exc, exc);
            Firebug.Console.log("Resuming JavaScriptModule: error during debugging loop: "+exc);
            this.resume(context);
        }

        dispatch(this.fbListeners, "onStartDebugging", [context]);

        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("startDebugging exit context.stopped:"+context.stopped+" for context: "+
                context.getName()+"\n");
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
            if (context && !context.aborted)
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
                    FBTrace.sysout("JavaScriptModule.stopDebugging else "+context.getName()+" "+
                        safeGetWindowLocation(context.window));
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("JavaScriptModule.stopDebugging FAILS", exc);
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
                FBTrace.sysout("JavaScriptModule.syncCommand, context with no chrome: "+context.getGlobalScope());
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
            if (FBTrace.DBG_PANELS) FBTrace.sysout("JavaScriptModule.showPanel this.location:"+this.location);
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


    /*
     * for |debugger;| keyword offer the skip/continue dialog (optionally?)
     */
    setDebuggerKeywordCause: function(context, frame)
    {
        var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, frame.script);
        if (!sourceFile)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("JavaScriptModule.setDebuggerKeywordCause FAILS, no sourceFile for "+
                    frame.script.tag+"@"+frame.script.fileName+" in "+context.getName());
            return;
        }

        var analyzer = sourceFile.getScriptAnalyzer(frame.script);
        var lineNo = analyzer.getSourceLineFromFrame(context, frame);

        context.breakingCause =
        {
            title: $STR("debugger keyword"),
            message: $STR("Disable converts keyword to disabled breakpoint"), //xxxHonza localization
            skipAction: function addSkipperAndGo()
            {
                // a breakpoint that never hits, but prevents debugger keyword (see fbs.onDebugger as well)
                var bp = Firebug.JavaScriptModule.setBreakpoint(sourceFile, lineNo);
                fbs.disableBreakpoint(sourceFile.href, lineNo);
                if (FBTrace.DBG_BP)
                    FBTrace.sysout("JavaScriptModule.onBreak converted to disabled bp "+sourceFile.href+
                        "@"+lineNo+" tag: "+frame.script.tag, bp);

                Firebug.JavaScriptModule.resume(context);
            },
            okAction: function justGo()
            {
                Firebug.JavaScriptModule.resume(context);
            },
        };
    },

    onToggleBreakpoint: function(url, lineNo, isSet, props)
    {
        if (props.debuggerName != this.debuggerName) // then not for us
        {
            if (FBTrace.DBG_BP)
                FBTrace.sysout("JavaScriptModule("+this.debuggerName+").onToggleBreakpoint ignoring toggle for "+
                    props.debuggerName+" target "+lineNo+"@"+url+"\n");
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
                    FBTrace.sysout("JavaScriptModule("+this.debuggerName+").onToggleBreakpoint found context "+
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
                        FBTrace.sysout("JavaScriptModule("+this.debuggerName+").onToggleBreakpoint context "+
                            i+" script panel no sourcebox for url: "+url, panel.sourceBoxes);
                    continue;
                }

                var row = sourceBox.getLineNode(lineNo);
                if (FBTrace.DBG_BP)
                    FBTrace.sysout(i+") onToggleBreakpoint getLineNode="+row+" lineNo="+lineNo+
                        " context:"+context.getName()+"\n");

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
                dispatch(this.fbListeners, "onToggleBreakpoint", [context, url, lineNo, isSet]);
                found = true;
                continue;
            }
        }
        if (FBTrace.DBG_BP && !found)
            FBTrace.sysout("JavaScriptModule("+this.debuggerName+").onToggleBreakpoint no find context");
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
        for (var i = 0; i < Firebug.TabWatcher.contexts.length; ++i)
        {
            var panel = Firebug.TabWatcher.contexts[i].getPanel("console", true);
            if (panel)
                panel.context.invalidatePanels("breakpoints");
        }
    },


    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
       // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initialize: function()
    {
        Firebug.clientID = this.registerClient(Firebug);
        this.nsICryptoHash = Components.interfaces["nsICryptoHash"];

        this.debuggerName =  window.location.href +"-@-"+FBL.getUniqueId();
        this.toString = function() { return this.debuggerName; }
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("JavaScriptModule.initialize "+ this.debuggerName);

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

    enable: function()
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("JavaScriptModule.Firebug.JavaScriptModule.enable; " + this.enabled);
    },

    disable: function()
    {
        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("JavaScriptModule.Firebug.JavaScriptModule.disable; " + this.enabled);
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

        context.jsDebuggerCalledUs = false;

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
        if (context && context.loaded && !context.onLoadWindowContent) // then context was not active during load
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
                FBTrace.sysout("updateScriptFiles iterateWindows: "+win.location.href+
                    " documentElement: "+win.document.documentElement);

            if (!win.document.documentElement)
                return;

            var url = normalizeURL(win.location.href);

            if (url)
            {
                if (!context.sourceFileMap.hasOwnProperty(url))
                {
                    var URLOnly = new Firebug.NoScriptSourceFile(context, url);
                    context.addSourceFile(URLOnly);
                    if (FBTrace.DBG_SOURCEFILES)
                        FBTrace.sysout("updateScriptFiles created NoScriptSourceFile for URL:"+url, URLOnly);
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
                    FBTrace.sysout("updateScriptFiles "+(scriptSrc?"inclusion":"inline")+
                        " script #"+i+"/"+scripts.length+(added?" adding ":" readded ")+url+
                        " to context="+context.getName()+"\n");
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
            FBTrace.sysout("JavaScriptModule("+this.debuggerName+").loadedContext enabled on load: "+
                context.onLoadWindowContent+" context.sourceFileMap", context.sourceFileMap);
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
        FBTrace.sysout("JavaScriptModule.watchScriptAdditions ", event.target.innerHTML);
        var location = safeGetWindowLocation(context.window);

        FBL.jsd.enumerateScripts({enumerateScript: function(script)
        {
            if (normalizeURL(script.fileName) === location)
            {
                var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, script);
                FBTrace.sysout('JavaScriptModule.watchScriptAdditions '+script.tag+" in "+
                    (sourceFile?sourceFile.href:"NONE")+" "+script.functionSource,
                    script.functionSource);
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

            FBTrace.sysout("JavaScriptModule.watchScriptAdditions connected tag to sourcefile", sourceFile);

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
                FBTrace.sysout("JavaScriptModule.unWatchWindow; delete sourceFileMap entry for " + src);
        }
        if (scriptTags.length > 0)
            context.invalidatePanels('script');
    },

    destroyContext: function(context, persistedState)
    {
        Firebug.ActivableModule.destroyContext.apply(this, arguments);

        context.window.document.removeEventListener("DOMNodeInserted",
            context.watchScriptAdditions, false);

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
            FBTrace.sysout("JavaScriptModule.registerDebugger "+check+" debuggers");
    },

    unregisterDebugger: function() // 1.3.1 safe for multiple calls
    {
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("JavaScriptModule.unregisterDebugger this.registered: "+this.registered);

        if (!this.registered)
            return;

        // stay registered if we are profiling across a reload.
        if (Firebug.Profiler.isProfiling())
            return;

        var check = fbs.unregisterDebugger(this);

        this.registered = false;

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("JavaScriptModule.unregisterDebugger: "+check+" debuggers");
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
        if (FBTrace.DBG_ACTIVATION)
        {
            var names = [];
            this.observers.forEach(function(ob){names.push(ob.name);});
            FBTrace.sysout("JavaScriptModule.onObserverChange "+this.hasObservers()+" "+
                this.observers.length+": "+names.join(','), this.observers);
        }

        if (this.hasObservers())
        {
            this.activateDebugger();
            if (Firebug.currentContext)
            {
                var name = observer.name || observer.dispatchName;
                Firebug.Console.log("enabling javascript JavaScriptModule "+(name?"to support "+name:""));
            }
        }
        else
        {
            this.deactivateDebugger();
        }
    },

    activateDebugger: function()
    {
        this.registerDebugger();

        if (FBTrace.DBG_PANELS || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("JavaScriptModule.activateDebugger requested;");
    },

    deactivateDebugger: function()
    {
        this.unregisterDebugger();

        if (FBTrace.DBG_PANELS || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("JavaScriptModule.deactivate");
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
        if (!Firebug.JavaScriptModule.isAlwaysEnabled())
            return;

        var paused = fbs.pause();  // can be called multiple times.

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("JavaScriptModule.onSuspendFirebug paused: "+paused+" isAlwaysEnabled " +
                Firebug.JavaScriptModule.isAlwaysEnabled()+"\n");

        if (!paused)  // then we failed to suspend, undo
            return true;

        return false;
    },

    onResumeFirebug: function()
    {
        if (!Firebug.JavaScriptModule.isAlwaysEnabled())
            return;

        var unpaused = fbs.unPause();

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("JavaScriptModule.onResumeFirebug unpaused: "+unpaused+" isAlwaysEnabled " +
                Firebug.JavaScriptModule.isAlwaysEnabled());

        if (FBTrace.DBG_ERRORS && !this.registered && Firebug.JavaScriptModule.isAlwaysEnabled())
            FBTrace.sysout("JavaScriptModule.onResumeFirebug but debugger " +
                Firebug.JavaScriptModule.debuggerName+" not registered! *** ");
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
        Firebug.JavaScriptModule.filterMenuUpdate();
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

            items[i].label = Firebug.JavaScriptModule.menuFullLabel[option];
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
            FBTrace.sysout("JavaScriptModule.filterMenuUpdate value: "+value+" label:"+
                this.filterButton.label+'\n');
    },
});

// ************************************************************************************************

Firebug.JavaScriptModule.Breakpoint = function(name, href, lineNumber, checked, sourceLine, isFuture)
{
    this.name = name;
    this.href = href;
    this.lineNumber = lineNumber;
    this.checked = checked;
    this.sourceLine = sourceLine;
    this.isFuture = isFuture;
}

// ************************************************************************************************

Firebug.JavaScriptModuleListener =
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





// ************************************************************************************************

Firebug.registerActivableModule(Firebug.JavaScriptModule);

// ************************************************************************************************

return Firebug.JavaScriptModule;
}});
