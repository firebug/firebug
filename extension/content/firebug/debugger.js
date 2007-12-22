/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const jsdIScript = CI("jsdIScript");
const jsdIStackFrame = CI("jsdIStackFrame");
const jsdIExecutionHook = CI("jsdIExecutionHook");
const nsIFireBug = CI("nsIFireBug");
const nsIFireBugDebugger = CI("nsIFireBugDebugger");
const nsIFireBugURLProvider = CI("nsIFireBugURLProvider");
const nsISupports = CI("nsISupports");
const nsICryptoHash = CI["nsICryptoHash"];

const PCMAP_SOURCETEXT = jsdIScript.PCMAP_SOURCETEXT;

const RETURN_VALUE = jsdIExecutionHook.RETURN_RET_WITH_VAL;
const RETURN_THROW_WITH_VAL = jsdIExecutionHook.RETURN_THROW_WITH_VAL;
const RETURN_CONTINUE = jsdIExecutionHook.RETURN_CONTINUE;
const RETURN_CONTINUE_THROW = jsdIExecutionHook.RETURN_CONTINUE_THROW;
const RETURN_ABORT = jsdIExecutionHook.RETURN_ABORT;

const TYPE_THROW = jsdIExecutionHook.TYPE_THROW;

const STEP_OVER = nsIFireBug.STEP_OVER;
const STEP_INTO = nsIFireBug.STEP_INTO;
const STEP_OUT = nsIFireBug.STEP_OUT;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const tooltipTimeout = 300;

const reLineNumber = /^[^\\]?#(\d*)$/;

const reEval =  /\s*eval\s*\(([^)]*)\)/m;        // eval ( $1 )
const reHTM = /\.[hH][tT][mM]/;
const reURIinComment = /\/\/@\ssourceURL=\s*(.*)\s*$/m;
const reFunction = /\s*Function\s*\(([^)]*)\)/m;

const evalScriptPre =
    "with (__scope__.vars) { with (__scope__.api) { with (__scope__.userVars) { with (window) {";
const evalScriptPost =
    "}}}}";

const evalScriptPreWithThis =  "(function() {" + evalScriptPre + "return ";
const evalScriptPostWithThis = evalScriptPost + "; }).apply(__scope__.thisValue)";

// ************************************************************************************************

var listeners = [];

// ************************************************************************************************

Firebug.Debugger = extend(Firebug.Module,
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Debugging

    evaluate: function(js, context, scope)
    {
        var frame = context.currentFrame;
        if (frame)
        {
            iterateWindows(context.window, function(win) { win.__scope__ = scope; });

            frame.scope.refresh();

            var scriptToEval = scope && scope.thisValue
                ? [evalScriptPreWithThis, js, evalScriptPostWithThis]
                : [evalScriptPre, js, evalScriptPost];

            var script = scope ? scriptToEval.join("") : js;
            var result = {};
            var ok = frame.eval(script, "", 1, result);

            iterateWindows(context.window, function(win) { delete win.__scope__; });

            var value = result.value.getWrappedValue();
            if (ok)
                return value;
            else
                throw value;
        }
    },

    getCurrentFrameKeys: function(context)
    {
        var globals = keys(context.window);

        if (context.currentFrame)
            return this.getFrameKeys(context.currentFrame, globals);

        return globals;
    },

    getFrameKeys: function(frame, names)
    {
        var listValue = {value: null}, lengthValue = {value: 0};
        frame.scope.getProperties(listValue, lengthValue);

        for (var i = 0; i < lengthValue.value; ++i)
        {
            var prop = listValue.value[i];
            var name = prop.name.getWrappedValue();
            names.push(name);
        }
        return names;
    },

    focusWatch: function(context)
    {
        if (context.detached)
            context.chrome.focus();
        else
            Firebug.toggleBar(true);

        context.chrome.selectPanel("script");

        var watchPanel = context.getPanel("watches", true);
        if (watchPanel)
            watchPanel.editNewWatch();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    halt: function(fn)
    {
        this.haltCallback = fn;
        fbs.halt(this);
        debugger;
    },

    stop: function(context, frame, type, rv)
    {
        if (context.stopped)
            return RETURN_CONTINUE;

        var executionContext;
        try
        {
            executionContext = frame.executionContext;
        }
        catch (exc)
        {
            // Can't proceed with an execution context - it happens sometimes.
            return RETURN_CONTINUE;
        }

        context.debugFrame = frame;
        context.stopped = true;

        const hookReturn = dispatch2(listeners,"onStop",[context,type,rv]);
        if ( hookReturn && hookReturn >= 0 )
        {
            delete context.stopped;
            delete context.debugFrame;
            delete context;
            return hookReturn;
        }

        executionContext.scriptsEnabled = false;

        // Unfortunately, due to quirks in Firefox's networking system, we must
        // be sure to load and cache all scripts NOW before we enter the nested
        // event loop, or run the risk that some of them won't load while
        // the new event loop is nested.  It seems that the networking system
        // can't communicate with the nested loop.
        cacheAllScripts(context);

        try
        {
            // We will pause here until resume is called
            fbs.enterNestedEventLoop({onNest: bindFixed(this.startDebugging, this, context)});
        }
        catch (exc)
        {
            // Just ignore exceptions that happened while in the nested loop
            ERROR("debugger exception in nested event loop: "+exc+"\n");
        }

        executionContext.scriptsEnabled = true;

        this.stopDebugging(context);

        dispatch(listeners,"onResume",[context]);

        if (this.aborted)
        {
            delete this.aborted;
            return RETURN_ABORT;
        }
        else
            return RETURN_CONTINUE;
    },

    resume: function(context)
    {
        if (!context.stopped)
            return;

        delete context.stopped;
        delete context.debugFrame;
        delete context.currentFrame;
        delete context;

        fbs.exitNestedEventLoop();
    },

    abort: function(context)
    {
        if (context.stopped)
        {
            context.aborted = true;
            this.resume(context);
        }
    },

    stepOver: function(context)
    {
        if (!isValidFrame(context.debugFrame))
            return;

        fbs.step(STEP_OVER, context.debugFrame);
        this.resume(context);
    },

    stepInto: function(context)
    {
        if (!isValidFrame(context.debugFrame))
            return;

        fbs.step(STEP_INTO, context.debugFrame);
        this.resume(context);
    },

    stepOut: function(context)
    {
        if (!isValidFrame(context.debugFrame))
            return;

        fbs.step(STEP_OUT, context.debugFrame);
        this.resume(context);
    },

    suspend: function(context)
    {
        if (context.stopped)
            return;
        fbs.suspend();
    },

    runUntil: function(context, url, lineNo)
    {
        if (!isValidFrame(context.debugFrame))
            return;

        fbs.runUntil(url, lineNo, context.debugFrame);
        this.resume(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Breakpoints

    setBreakpoint: function(url, lineNo)
    {
        fbs.setBreakpoint(url, lineNo, null);
    },

    clearBreakpoint: function(url, lineNo)
    {
        fbs.clearBreakpoint(url, lineNo);
    },

    setErrorBreakpoint: function(url, line)
    {
        fbs.setErrorBreakpoint(url, line);
    },

    clearErrorBreakpoint: function(url, line)
    {
        fbs.clearErrorBreakpoint(url, line);
    },

    enableErrorBreakpoint: function(url, line)
    {
        fbs.enableErrorBreakpoint(url, line);
    },

    disableErrorBreakpoint: function(url, line)
    {
        fbs.disableErrorBreakpoint(url, line);
    },

    clearAllBreakpoints: function(context)
    {
        var urls = [];
        for (var url in context.sourceFileMap)
            urls.push(url);

        fbs.clearAllBreakpoints(urls.length, urls);
    },

    enableAllBreakpoints: function(context)
    {
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

    trace: function(fn, object, mode)
    {
        if (typeof(fn) == "function" || fn instanceof Function)
        {
            var script = findScriptForFunction(fn);
            if (script)
                this.traceFunction(fn, script, mode);
        }
    },

    untrace: function(fn, object, mode)
    {
        if (typeof(fn) == "function" || fn instanceof Function)
        {
            var script = findScriptForFunction(fn);
            if (script)
                this.untraceFunction(fn, script, mode);
        }
    },

    traceFunction: function(fn, script, mode)
    {
        if (mode == "debug")
        {
            var lineNo = findExecutableLine(script, script.baseLineNumber);
            this.setBreakpoint(script.fileName, lineNo);
        }
        else if (mode == "monitor")
            fbs.monitor(script, this);
    },

    untraceFunction: function(fn, script, mode)
    {
        if (mode == "debug")
        {
            var lineNo = findExecutableLine(script, script.baseLineNumber);
            this.clearBreakpoint(script.fileName, lineNo);
        }
        else if (mode == "monitor")
            fbs.unmonitor(script);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // UI Stuff

    startDebugging: function(context)
    {
        if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("startDebugging enter\n");                                             /*@explore*/
        try {
            fbs.lockDebugger();

            context.currentFrame = context.debugFrame;

            this.syncCommands(context);
            this.syncListeners(context);
            context.chrome.syncSidePanels();

            // XXXms : better way to do this ?
            if ( !context.hideDebuggerUI || (FirebugChrome.getCurrentBrowser() && FirebugChrome.getCurrentBrowser().showFirebug))
            {
                Firebug.showBar(true);
                if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("showBar done FirebugContext="+FirebugContext+"\n");           /*@explore*/

                if (Firebug.errorStackTrace)
                    var panel = context.chrome.selectPanel("script", "callstack");
                else
                    var panel = context.chrome.selectPanel("script");  // else use prev sidePanel

                if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("selectPanel done "+panel.name+"\n");                               /*@explore*/
                panel.select(context.debugFrame, true);

                var stackPanel = context.getPanel("callstack");
                if (stackPanel)
                    stackPanel.refresh(context);

                if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("select done; stackPanel="+stackPanel.name+"\n");                   /*@explore*/
                context.chrome.focus();
            } else {
                // XXXms: workaround for Firebug hang in selectPanel("script")
                // when stopping in top-level frame // investigate later
                context.chrome.updateViewOnShowHook = function()
                {
                    if (Firebug.errorStackTrace)
                        var panel = context.chrome.selectPanel("script", "callstack");
                    else
                        var panel = context.chrome.selectPanel("script");  // else use prev sidePanel

                    if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("selectPanel done "+panel+"\n");                           /*@explore*/
                    panel.select(context.debugFrame);

                    var stackPanel = context.getPanel("callstack", true);
                    if (stackPanel)
                        stackPanel.refresh(context);

                    if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("select done; stackPanel="+stackPanel+"\n");               /*@explore*/
                    context.chrome.focus();
                };
            }
        }
        catch(exc)
        {
            if (FBTrace.DBG_UI_LOOP) FBTrace.dumpProperties("Debugger UI error during debugging loop:", exc);          /*@explore*/
            ERROR("Debugger UI error during debugging loop:"+exc+"\n");
        }
        if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("startDebugging exit\n");                                              /*@explore*/
    },

    stopDebugging: function(context)
    {
        try
        {
            fbs.unlockDebugger();

            // If the user reloads the page while the debugger is stopped, then
            // the current context will be destroyed just before
            if (context)
            {
                var chrome = context.chrome;
                if (!chrome)
                    chrome = FirebugChrome;
                if ( chrome.updateViewOnShowHook )
                {
                    delete chrome.updateViewOnShowHook;
                    return;
                }

                this.syncCommands(context);
                this.syncListeners(context);

                if (FirebugContext && !FirebugContext.panelName) // XXXjjb all I know is that syncSidePanels() needs this set
                    FirebugContext.panelName = "script";

                chrome.syncSidePanels();

                var panel = context.getPanel("script", true);
                if (panel)
                    panel.select(null);
            }
        }
        catch (exc)
        {
            // If the window is closed while the debugger is stopped,
            // then all hell will break loose here
            ERROR(exc);
        }
    },

    syncCommands: function(context)
    {
        var chrome = context.chrome;
        if (!chrome)
            chrome = FirebugChrome;

        if (context.stopped)
        {
            chrome.setGlobalAttribute("fbDebuggerButtons", "stopped", "true");
            chrome.setGlobalAttribute("cmd_resumeExecution", "disabled", "false");
            chrome.setGlobalAttribute("cmd_stepOver", "disabled", "false");
            chrome.setGlobalAttribute("cmd_stepInto", "disabled", "false");
            chrome.setGlobalAttribute("cmd_stepOut", "disabled", "false");
        }
        else
        {
            chrome.setGlobalAttribute("fbDebuggerButtons", "stopped", "true");
            chrome.setGlobalAttribute("cmd_resumeExecution", "disabled", "true");
            chrome.setGlobalAttribute("cmd_stepOver", "disabled", "true");
            chrome.setGlobalAttribute("cmd_stepInto", "disabled", "true");
            chrome.setGlobalAttribute("cmd_stepOut", "disabled", "true");
        }
    },

    syncListeners: function(context)
    {
        var chrome = context.chrome;
        if (!chrome)
            chrome = FirebugChrome;

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
        for (var i = 0; i < this.keyListeners.length; ++i)
            chrome.keyIgnore(this.keyListeners[i]);
        delete this.keyListeners;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsISupports

    QueryInterface : function(iid)
    {
        if (iid.equals(nsIFireBugDebugger) ||
            iid.equals(nsIFireBugURLProvider) ||
            iid.equals(nsISupports))
        {
            return this;
        }

        throw Components.results.NS_NOINTERFACE;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsIFireBugDebugger

    supportsWindow: function(win)
    {
        var context = (win ? TabWatcher.getContextByWindow(win) : null);
        this.breakContext = context;
        return !!context;
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
            delete this.breakContext;

            if (FBTrace.DBG_BP || FBTrace.DBG_UI_LOOP) FBTrace.sysout("debugger.onBreak context="+context+"\n");       /*@explore*/
            if (!context)
                context = getFrameContext(frame);
            if (!context)
                return RETURN_CONTINUE;

            return this.stop(context, frame, type);
        }
        catch (exc)
        {
            FBTrace.dumpProperties("debugger.onBreak FAILS", exc);
            throw exc;
        }
    },

    onHalt: function(frame)
    {
        var callback = this.haltCallback;
        delete this.haltCallback;

        if (callback)
            callback(frame);

        return RETURN_CONTINUE;
    },

    onThrow: function(frame, rv)
    {
        // onThrow is called for throw and for any catch that does not succeed...
        var context = this.breakContext;
        delete this.breakContext;

        if (!context)
            context = getFrameContext(frame);
        if (FBTrace.DBG_THROW) FBTrace.sysout("debugger.onThrow context:"+(context?context.window.location:"undefined")+"\n"); /*@explore*/
        if (!context)
            return RETURN_CONTINUE_THROW;

        // TODO if(option)
        try
        {
            var isCatch = this.isCatchFromPreviousThrow(frame, context);
            if (!isCatch)
            {
                context.thrownStackTrace = getStackTrace(frame, context);
                if (FBTrace.DBG_THROW) FBTrace.dumpProperties("debugger.onThrow reset context.thrownStackTrace", context.thrownStackTrace.frames);
            }
            else
                if (FBTrace.DBG_THROW) FBTrace.sysout("debugger.onThrow isCatch\n");
        }
        catch  (exc)
        {
            ddd("onThrow FAILS: "+exc+"\n");
        }

        if (dispatch2(listeners,"onThrow",[context, frame, rv]))
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

    onCall: function(frame)
    {
        var context = this.breakContext;
        delete this.breakContext;

        if (!context)
            context = getFrameContext(frame);
        if (!context)
            return RETURN_CONTINUE;

        frame = getStackFrame(frame, context);
        Firebug.Console.log(frame, context);
    },

    onError: function(frame, error)
    {
        var context = this.breakContext;
        delete this.breakContext;

        try
        {
            Firebug.errorStackTrace = getStackTrace(frame, context);
            if (FBTrace.DBG_ERRORS) FBTrace.sysout("debugger.onError: "+error.message+"\n"+traceToString(Firebug.errorStackTrace)+"\n"); /*@explore*/
            if (Firebug.breakOnErrors)
                Firebug.Errors.showMessageOnStatusBar(error);
        }
        catch (exc) {
            ERROR("debugger.onError getStackTrace FAILED: "+exc+"\n");
            if (FBTrace.DBG_ERRORS) FBTrace.dumpProperties("debugger.onError getStackTrace FAILED:", exc);             /*@explore*/
        }

        var hookReturn = dispatch2(listeners,"onError",[context, frame, error]);
        if (hookReturn)
            return hookReturn;
        return -2; /* let firebug service decide to break or not */
    },

    onEvalScriptCreated: function(frame, outerScript, innerScripts)
    {
        try
        {
            if (FBTrace.DBG_EVAL) FBTrace.sysout("debugger.onEvalLevelScript script.fileName="+outerScript.fileName+"\n");     /*@explore*/
            var context = this.breakContext;
            delete this.breakContext;

            var sourceFile = this.getEvalLevelSourceFile(frame, context, innerScripts);

            if (FBTrace.DBG_EVAL)                                                                                      /*@explore*/
            {                                                                                                          /*@explore*/
                FBTrace.sysout("debugger.onEval url="+sourceFile.href+"\n");                                           /*@explore*/
                FBTrace.sysout( traceToString(FBL.getStackTrace(frame, context))+"\n" );                               /*@explore*/
            }                                                                                                          /*@explore*/

            dispatch(listeners,"onEval",[context, frame, sourceFile.href]);
           }
           catch (e)
           {
               FBTrace.dumpProperties("onEvalScriptCreated FaILS ", e);
        }
    },

    onEventScriptCreated: function(frame, outerScript, innerScripts)
    {
        if (FBTrace.DBG_EVENT) FBTrace.sysout("debugger.onEventScriptCreated script.fileName="+outerScript.fileName+"\n");     /*@explore*/
        var context = this.breakContext;
        delete this.breakContext;

        var script = frame.script;

        var source = script.functionSource;
        var url = this.getDynamicURL(frame, source, "event");

        var lines = context.sourceCache.store(url, source);
        var sourceFile = new FBL.EventSourceFile(url, frame.script, "event:"+script.functionName+"."+script.tag, lines.length, innerScripts);
        context.sourceFileMap[url] = sourceFile;

        if (FBTrace.DBG_EVENTS) FBTrace.sysout("debugger.onEventScript url="+sourceFile.href+"\n");   /*@explore*/
        if (FBTrace.DBG_EVENTS) FBTrace.sysout("debugger.onEventScript tag="+sourceFile.tag+"\n");                 /*@explore*/

        if (FBTrace.DBG_EVENTS)                                                                                    /*@explore*/
             for (var i = 0; i < lines.length; i++) FBTrace.sysout(i+": "+lines[i]+"\n");                  /*@explore*/
        if (FBTrace.DBG_SOURCEFILES)                                                                               /*@explore*/
            FBTrace.sysout("debugger.onEventScript sourcefile="+sourceFile.toString()+" -> "+context.window.location+"\n");                       /*@explore*/

        dispatch(listeners,"onEventScript",[context, frame, url]);
    },

    // We just compiled a bunch of JS, eg a script tag in HTML.  We are about to run the outerScript.
    onTopLevelScriptCreated: function(frame, outerScript, innerScripts)
    {
        if (FBTrace.DBG_TOPLEVEL) FBTrace.sysout("debugger.onTopLevelScript script.fileName="+outerScript.fileName+"\n");     /*@explore*/
        var context = this.breakContext;
        delete this.breakContext;

        // This is our only chance to get the linetable for the outerScript since it will run and be GC next.
        var script = frame.script;
        var url = normalizeURL(script.fileName);

        var sourceFile = context.sourceFileMap[url];
        if (!sourceFile || !(sourceFile instanceof FBL.TopLevelSourceFile) )      // TODO test multiple script tags in one html file
        {
            sourceFile = new FBL.TopLevelSourceFile(url, script, script.lineExtent, innerScripts);
            context.sourceFileMap[url] = sourceFile;
        }

        if (FBTrace.DBG_TOPLEVEL) FBTrace.sysout("debugger.onTopLevelScriptCreated outerScript.tag="+outerScript.tag+" has fileName="+outerScript.fileName+"\n"); /*@explore*/
        if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("debugger.onTopLevelScriptCreated sourcefile="+sourceFile.toString()+" -> "+context.window.location+"\n"); /*@explore*/

        dispatch(listeners,"onTopLevel",[context, frame, script.fileName]);  // XXXjjb script.fileName or URL?
    },


    onToggleBreakpoint: function(url, lineNo, isSet, props)
    {
        if (FBTrace.DBG_BP) FBTrace.sysout("debugger.onToggleBreakpoint: "+lineNo+"@"+url+" contexts:"+TabWatcher.contexts.length+"\n");                         /*@explore*/
        for (var i = 0; i < TabWatcher.contexts.length; ++i)
        {
            var panel = TabWatcher.contexts[i].getPanel("script", true);
            if (panel)
            {
                panel.context.invalidatePanels("breakpoints");

                url = normalizeURL(url);
                var sourceBox = panel.getSourceBoxByURL(url);
                if (sourceBox)
                {
                    if (FBTrace.DBG_BP)                                                                                /*@explore*/
                        FBTrace.sysout("onToggleBreakpoint sourceBox.childNodes.length="+sourceBox.childNodes.length+" [lineNo-1]="+sourceBox.childNodes[lineNo-1].innerHTML+"\n"); /*@explore*/
                    var row = sourceBox.childNodes[lineNo-1];
                    row.setAttribute("breakpoint", isSet);
                    if (isSet && props)
                    {
                        row.setAttribute("condition", props.condition ? true : false);
                        row.setAttribute("disabledBreakpoint", props.disabled);
                    } else
                    {
                        row.removeAttribute("condition");
                        row.removeAttribute("disabledBreakpoint");
                    }
                }
                else // trace on else
                {
                    if (FBTrace.DBG_BP) 										 													  /*@explore*/
                        FBTrace.dumpProperties("debugger.onToggleBreakPoint no find sourcebox, sourceBoxes[url]", panel.sourceBoxes); /*@explore*/
                }
            }
        }
    },

    onToggleErrorBreakpoint: function(url, lineNo, isSet)
    {
        for (var i = 0; i < TabWatcher.contexts.length; ++i)
        {
            var panel = TabWatcher.contexts[i].getPanel("console", true);
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

     // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsIFireBugURLProvider

    onEventScript: function(frame)
    {
        if (FBTrace.DBG_EVENTS) FBTrace.sysout("debugger.onEventScript\n");                                             /*@explore*/
        var context = this.breakContext;
        delete this.breakContext;

        if (!context)
        {
            FBTrace.dumpStack("debugger.onEventScript context null");
            return;
        }

        try {
            var script = frame.script;

            var source = "crashes"; // script.functionSource;
            var url = this.getDynamicURL(frame, source, "event");

            var lines = context.sourceCache.store(url, source);
            var sourceFile = new FBL.EventSourceFile(url, frame.script, "event:"+script.functionName+"."+script.tag, lines.length);
            context.sourceFileMap[url] = sourceFile;

            if (FBTrace.DBG_EVENTS) FBTrace.sysout("debugger.onEventScript url="+sourceFile.href+"\n");   /*@explore*/
            if (FBTrace.DBG_EVENTS) FBTrace.sysout("debugger.onEventScript tag="+sourceFile.tag+"\n");                 /*@explore*/

            if (FBTrace.DBG_EVENTS)                                                                                    /*@explore*/
                 for (var i = 0; i < lines.length; i++) FBTrace.sysout(i+": "+lines[i]+"\n");                  /*@explore*/
            if (FBTrace.DBG_SOURCEFILES)                                                                               /*@explore*/
                FBTrace.sysout("debugger.onEventScript sourcefile="+sourceFile.toString()+" -> "+context.window.location+"\n");                       /*@explore*/

            dispatch(listeners,"onEventScript",[context, frame, url]);
            return url;
        }
        catch(exc)
        {
            ERROR("debugger.onEventScript failed: "+exc);
            return null;
        }
    },

    // On compilation of a top-level (global-appending) function.
    // After this script executes we lose the jsdIScript so we can't build its line table. Build it here.
    onTopLevel: function(frame)
    {
        if (FBTrace.DBG_TOPLEVEL) FBTrace.sysout("debugger.onTopLevel \n");                                            /*@explore*/
        var context = this.breakContext;
        delete this.breakContext;

        try {
            var script = frame.script;
            var url = normalizeURL(script.fileName);

            if (url in context.sourceFileMap)
                var sourceFile = context.sourceFileMap[url];
            else
            {
                var sourceFile = new FBL.TopLevelSourceFile(url, script, script.lineExtent);
                context.sourceFileMap[url] = sourceFile;
            }

            sourceFile.tag = script.tag;

            if (FBTrace.DBG_TOPLEVEL) FBTrace.sysout("debugger.onTopLevel sourceFile.tag="+sourceFile.tag+" has fileName="+script.fileName+"\n"); /*@explore*/

            sourceFile.addToLineTable(script, script.baseLineNumber);
            if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("debugger.onTopLevel sourcefile="+sourceFile.toString()+" -> "+context.window.location+"\n"); /*@explore*/

            dispatch(listeners,"onTopLevel",[context, frame, script.fileName]);  // XXXjjb script.fileName or URL?
            return script.fileName;
        }
        catch(exc)
        {
            ERROR("debugger.onTopLevel failed: "+exc);
            return null;
        }
    },

    onFunctionConstructor: function(frame, ctor_script)
    {
       try
        {
            var context = this.breakContext;
            delete this.breakContext;

            var sourceFile = this.createSourceFileForFunctionConstructor(frame, ctor_script, context);

            if (FBTrace.DBG_EVAL)                                                                                      /*@explore*/
            {                                                                                                          /*@explore*/
                FBTrace.sysout("debugger.onFunctionConstructor tag="+ctor_script.tag+" url="+sourceFile.href+"\n");                            /*@explore*/
                FBTrace.sysout( traceToString(FBL.getStackTrace(frame, context))+"\n" );                               /*@explore*/
            }                                                                                                          /*@explore*/
                                                                                                                       /*@explore*/
            dispatch(listeners,"onFunctionConstructor",[context, frame, ctor_script, sourceFile.href]);
            return sourceFile.href;
        }
        catch(exc)
        {
            ERROR("debugger.onFunctionConstructor failed: "+exc);
            if (FBTrace.DBG_EVAL) FBTrace.dumpProperties("debugger.onFunctionConstructor failed: ",exc);                              /*@explore*/
            return null;
        }

    },

    onEval: function(frame)
    {
        try
        {
            var context = this.breakContext;
            delete this.breakContext;

            var sourceFile = this.getEvalLevelSourceFile(frame, context);

            if (FBTrace.DBG_EVAL)                                                                                      /*@explore*/
            {                                                                                                          /*@explore*/
                FBTrace.sysout("debugger.onEval url="+sourceFile.href+"\n");                                           /*@explore*/
                FBTrace.sysout( traceToString(FBL.getStackTrace(frame, context))+"\n" );                               /*@explore*/
            }                                                                                                          /*@explore*/
                                                                                                                       /*@explore*/
            dispatch(listeners,"onEval",[context, frame, sourceFile.href]);
            return sourceFile.href;
        }
        catch(exc)
        {
            ERROR("debugger.onEval failed: "+exc);
            if (FBTrace.DBG_EVAL || true) FBTrace.dumpProperties("debugger.onEval failed: ",exc);                              /*@explore*/
            return null;
        }

    },

    createSourceFileForFunctionConstructor: function(caller_frame, ctor_script, context)
    {
        var ctor_expr = null; // this.getConstructorExpression(caller_frame, context);
        if (FBTrace.DBG_EVAL) FBTrace.sysout("createSourceFileForFunctionConstructor ctor_expr:"+ctor_expr+"\n");                     /*@explore*/
        if (ctor_expr)
            var source  = this.getEvalBody(caller_frame, "lib.createSourceFileForFunctionConstructor ctor_expr", 1, ctor_expr);
        else
            var source = " bah createSourceFileForFunctionConstructor"; //ctor_script.functionSource;

        if (FBTrace.DBG_EVAL) FBTrace.sysout("createSourceFileForFunctionConstructor source:"+source+"\n");                     /*@explore*/
        var url = this.getDynamicURL(frame, source, "Function");

        var lines =	context.sourceCache.store(url, source);
        var sourceFile = new FBL.FunctionConstructorSourceFile(url, caller_frame.script, ctor_expr, lines.length);
        context.sourceFileMap[url] = sourceFile;

        if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("debugger.onNewFunction sourcefile="+sourceFile.toString()+" -> "+context.window.location+"\n"); /*@explore*/

        return sourceFile;
    },

    getConstructorExpression: function(caller_frame, context)
    {
        // We believe we are just after the ctor call.
        var decompiled_lineno = getLineAtPC(caller_frame, context);
        if (FBTrace.DBG_EVAL) FBTrace.sysout("debugger.getConstructoreExpression decompiled_lineno:"+decompiled_lineno+"\n");

        var decompiled_lines = splitLines(caller_frame.script.functionSource);  // TODO place in sourceCache?
        if (FBTrace.DBG_EVAL) FBTrace.dumpProperties("debugger.getConstructoreExpression decompiled_lines:",decompiled_lines);

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
        if (FBTrace.DBG_EVAL) FBTrace.sysout("getEvalLevelSourceFile eval_expr:"+eval_expr+"\n");                     /*@explore*/
        var source  = this.getEvalBody(frame, "lib.getEvalLevelSourceFile.getEvalBody", 1, eval_expr);
        if (FBTrace.DBG_EVAL) FBTrace.sysout("getEvalLevelSourceFile source:"+source+"\n");                     /*@explore*/

        var url = this.getDynamicURL(frame, source, "eval");

        var lines = context.sourceCache.store(url, source);
        var sourceFile = new FBL.EvalLevelSourceFile(url, frame.script, eval_expr, lines.length, innerScripts);
        context.sourceFileMap[url] = sourceFile;
        if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("debugger.getEvalLevelSourceFile sourcefile="+sourceFile.toString()+" -> "+context.window.location+"\n"); /*@explore*/

        return sourceFile;
    },

    getDynamicURL: function(frame, source, kind)
    {
        var url = this.getURLFromLastLine(source);
        if (!url)
            var url = this.getURLFromMD5(frame.script.fileName, source, kind);
        if (!url)
            var url = this.getDataURLForScript(frame.script, source);
        return url
    },

    getURLFromLastLine: function(source)
    {
        var lastLineLength = 0;
        var endLastLine = source.length - 1;
        while(lastLineLength < 3) // skip newlines at end of buffer
        {
            var lastNewline = source.lastIndexOf('\n', endLastLine);
            if (lastNewline < 0)
            {
                var lastNewLine = source.lastIndexOf('\r', endLastLine);
                if (lastNewLine < 0)
                    return;
            }
            lastLineLength = source.length - lastNewline;
            endLastLine = lastNewline - 1;
        }
        var lastLines = source.slice(lastNewline + 1);

        var m = reURIinComment.exec(lastLines);
        if (m)
            return m[1];
    },

    getURLFromMD5: function(callerFileName, source, kind)
    {
        this.hash_service.init(this.nsICryptoHash.MD5);
        byteArray = [];
        for (var j = 0; j < source.length; j++)
        {
            byteArray.push( source.charCodeAt(j) );
        }
        this.hash_service.update(byteArray, byteArray.length);
        var hash = this.hash_service.finish(true);
        var url = callerFileName + (kind ? "/"+kind+"/" : "/") + hash;

        return url;
    },

    getEvalExpression: function(frame, context)
    {
        var expr = this.getEvalExpressionFromEval(frame, context);  // eval in eval

        return (expr) ? expr : this.getEvalExpressionFromFile(frame.script.fileName, frame.script.baseLineNumber, context);
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
        if (!FBL.getSourceFileByScript)
            FBTrace.dumpProperties("getEvalExpressionFromEval: FBL",FBL);
        var sourceFile = FBL.getSourceFileByScript(context, callingFrame.script);
        if (sourceFile)
        {
            if (FBTrace.DBG_EVAL) {                                                                                    /*@explore*/
                FBTrace.sysout("debugger.getEvalExpressionFromEval sourceFile.href="+sourceFile.href+"\n");            /*@explore*/
                FBTrace.sysout("debugger.getEvalExpressionFromEval callingFrame.pc="+callingFrame.pc                   /*@explore*/
                                  +" callingFrame.script.baseLineNumber="+callingFrame.script.baseLineNumber+"\n");    /*@explore*/
            }                                                                                                          /*@explore*/
            var lineNo = callingFrame.script.pcToLine(callingFrame.pc, PCMAP_SOURCETEXT);
            lineNo = lineNo - callingFrame.script.baseLineNumber + 1;
            var url  = sourceFile.href;

            // Walk backwards from the first line in the function until we find the line which
            // matches the pattern above, which is the eval call
            var line = "";
            for (var i = 0; i < 3; ++i)
            {
                line = context.sourceCache.getLine(url, lineNo-i) + line;
                if (FBTrace.DBG_EVAL)                                                                                  /*@explore*/
                    FBTrace.sysout("debugger.getEvalExpressionFromEval lineNo-i="+lineNo+"-"+i+"="+(lineNo-i)+" line:"+line+"\n"); /*@explore*/
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
                var src = result_src.value.getWrappedValue();
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
            return frame.script.functionSource; // XXXms - possible crash on OSX
        }
    },

    getDataURLForScript: function(script, source)
    {
        if (!source)
            return "eval."+script.tag;

        // data:text/javascript;fileName=x%2Cy.js;baseLineNumber=10,<the-url-encoded-data>
        var uri = "data:text/javascript;";
        uri += "fileName="+encodeURIComponent(script.fileName) + ";";
        uri += "baseLineNumber="+encodeURIComponent(script.baseLineNumber) + ","
        uri += encodeURIComponent(source);

        return uri;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initialize: function()
    {
        this.nsICryptoHash = Components.interfaces["nsICryptoHash"];
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.dumpProperties("debugger.initialize nsICryptoHash", this.nsICryptoHash);
        this.hash_service = CCSV("@mozilla.org/security/hash;1", "nsICryptoHash");

        $("cmd_breakOnErrors").setAttribute("checked", Firebug.breakOnErrors);
        $("cmd_breakOnTopLevel").setAttribute("checked", Firebug.breakOnTopLevel);
    },

    shutdown: function()
    {
        fbs.unregisterDebugger(this);
    },

    enable: function()
    {
        this.wrappedJSObject = this;
        fbs.registerDebugger(this);
    },

    disable: function()
    {
        fbs.unregisterDebugger(this);
    },

    destroyContext: function(context)
    {
        if (context.stopped)
        {
            TabWatcher.cancelNextLoad = true;
            this.abort(context);
        }
    },

    updateOption: function(name, value)
    {
        if (name == "breakOnErrors")
            $("cmd_breakOnErrors").setAttribute("checked", value);
        else if (name == "breakOnTopLevel")
            $("cmd_breakOnTopLevel").setAttribute("checked", value);
    },

    showPanel: function(browser, panel)
    {
        var chrome =  browser.chrome;
        if (chrome.updateViewOnShowHook)
        {
            const hook = chrome.updateViewOnShowHook;
            delete chrome.updateViewOnShowHook;
            hook();
        }
        var isDebugger = panel && panel.name == "script";
        var debuggerButtons = chrome.$("fbDebuggerButtons");
        collapse(debuggerButtons, !isDebugger);
    },

    getObjectByURL: function(context, url)
    {
        var sourceFile = getScriptFileByHref(url, context);
        if (sourceFile)
            return new SourceLink(sourceFile.href, 0, "js");
    },

    addListener: function(listener)
    {
        listeners.push(listener);
    },

    removeListener: function(listener)
    {
        remove(listeners, listener);
    }

});

// ************************************************************************************************

function ScriptPanel() {}

ScriptPanel.prototype = extend(Firebug.SourceBoxPanel,
{
    updateSourceBox: function(sourceBox)
    {
        this.panelNode.appendChild(sourceBox);
        if (this.executionFile && this.location.href == this.executionFile.href)
            this.setExecutionLine(this.executionLineNo);
        this.setExecutableLines(sourceBox);
    },

    showFunction: function(fn)
    {
        var sourceLink = findSourceForFunction(fn, this.context);
        if (sourceLink)
            this.showSourceLink(sourceLink);
    },

    showSourceLink: function(sourceLink)
    {
        var sourceFile = getScriptFileByHref(sourceLink.href, this.context);
        if (sourceFile)
        {
            this.navigate(sourceFile);
            if (sourceLink.line)
                this.context.throttle(this.highlightLine, this, [sourceLink.line]);
        }
    },

    showStackFrame: function(frame)
    {
        this.context.currentFrame = frame;

        if (!frame || (frame && !isValidFrame(frame)))
        {
            if (FBTrace.DBG_STACK) FBTrace.sysout("showStackFrame no valid frame\n");
            this.showNoStackFrame();
            return;
        }

        this.executionFile = FBL.getSourceFileByScript(this.context, frame.script);
        if (this.executionFile)
        {
            var url = this.executionFile.href;
            var analyzer = this.executionFile.getScriptAnalyzer(frame.script);
            this.executionLineNo = analyzer.getSourceLineFromFrame(this.context, frame);  // TODo implement for each type
               if (FBTrace.DBG_STACK) FBTrace.sysout("showStackFrame executionFile:"+this.executionFile+"@"+this.executionLineNo+"\n"); /*@explore*/

            this.navigate(this.executionFile);
            this.context.throttle(this.setExecutionLine, this, [this.executionLineNo]);
            this.context.throttle(this.updateInfoTip, this);
            return;
        }
        else
        {
            if (FBTrace.DBG_STACK) FBTrace.sysout("showStackFrame no getSourceFileByScript for tag="+frame.script.tag+"\n");                                    /*@explore*/
            this.showNoStackFrame();
        }
    },

    showNoStackFrame: function()
    {
        this.executionFile = null;
        this.executionLineNo = -1;
        this.setExecutionLine(-1);
        this.updateInfoTip();
    },

    scrollToLine: function(lineNo)
    {
        this.context.setTimeout(bindFixed(function()
        {
            var lineNode = this.getLineNode(lineNo);
            if (lineNode)
                scrollIntoCenterView(lineNode, this.selectedSourceBox);
        }, this));
    },

    highlightLine: function(lineNo)
    {
        var lineNode = this.getLineNode(lineNo);
        if (lineNode)
        {
            scrollIntoCenterView(lineNode, this.selectedSourceBox);
            setClassTimed(lineNode, "jumpHighlight", this.context);
            return true;
        }
        else
            return false;
    },

    selectLine: function(lineNo)
    {
        var lineNode = this.getLineNode(lineNo);
        if (lineNode)
        {
            var selection = this.document.defaultView.getSelection();
            selection.selectAllChildren(lineNode);
        }
    },

    setExecutionLine: function(lineNo)
    {
        var lineNode = lineNo == -1 ? null : this.getLineNode(lineNo);
        if (lineNode)
            this.scrollToLine(lineNo);

        if (this.executionLine)
            this.executionLine.removeAttribute("exeLine");

        this.executionLine = lineNode;

        if (lineNode)
            lineNode.setAttribute("exeLine", "true");
                                                                                                                       /*@explore*/
        if (FBTrace.DBG_BP) FBTrace.sysout("debugger.setExecutionLine to lineNo: "+lineNo+" lineNode="+lineNode+"\n"); /*@explore*/
    },

    setExecutableLines: function(sourceBox)
    {
        var sourceFile = sourceBox.repObject;
        if (FBTrace.DBG_BP || FBTrace.DBG_LINETABLE) FBTrace.sysout("debugger.setExecutableLines: "+sourceFile.toString()+"\n");                /*@explore*/
        var lineNo = 1;
        while( lineNode = this.getLineNode(lineNo) )
        {
            if (sourceFile.getScriptByLineNumber(lineNo))
                lineNode.setAttribute("executable", "true");
            else
                lineNode.removeAttribute("executable");
            lineNo++;
        }
    },

    toggleBreakpoint: function(lineNo)
    {
        if (FBTrace.DBG_BP) FBTrace.sysout("debugger.toggleBreakpoint lineNo="+lineNo+"\n");                           /*@explore*/
        var lineNode = this.getLineNode(lineNo);
        if (lineNode.getAttribute("breakpoint") == "true")
            fbs.clearBreakpoint(this.location.href, lineNo);
        else
            fbs.setBreakpoint(this.location.href, lineNo, null);
    },

    toggleDisableBreakpoint: function(lineNo)
    {
        var lineNode = this.getLineNode(lineNo);
        if (lineNode.getAttribute("disabledBreakpoint") == "true")
            fbs.enableBreakpoint(this.location.href, lineNo);
        else
            fbs.disableBreakpoint(this.location.href, lineNo);
    },

    editBreakpointCondition: function(lineNo)
    {
        var sourceRow = this.getLineNode(lineNo);
        var sourceLine = getChildByClass(sourceRow, "sourceLine");
        var condition = fbs.getBreakpointCondition(this.location.href, lineNo);

        Firebug.Editor.startEditing(sourceLine, condition);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getLineNode: function(lineNo)
    {
        return this.selectedSourceBox ? this.selectedSourceBox.childNodes[lineNo-1] : null;
    },

    addSelectionWatch: function()
    {
        var watchPanel = this.context.getPanel("watches", true);
        if (watchPanel)
        {
            var selection = this.document.defaultView.getSelection().toString();
            watchPanel.addWatch(selection);
        }
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

        try
        {
            var value = Firebug.CommandLine.evaluate(expr, this.context);
            var rep = Firebug.getRep(value);
            var tag = rep.shortTag ? rep.shortTag : rep.tag;

            tag.replace({object: value}, infoTip);

            this.infoTipExpr = expr;
            return true;
        }
        catch (exc)
        {
            return false;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // UI event listeners

    onMouseDown: function(event)
    {
        var sourceLine = getAncestorByClass(event.target, "sourceLine");
        if (!sourceLine)
            return;

        var sourceRow = sourceLine.parentNode;
        var sourceFile = sourceRow.parentNode.repObject;
        var lineNo = parseInt(sourceLine.textContent);

        if (isLeftClick(event))
            this.toggleBreakpoint(lineNo);
        else if (isShiftClick(event))
            this.toggleDisableBreakpoint(lineNo);
        else if (isControlClick(event) || isMiddleClick(event))
        {
            Firebug.Debugger.runUntil(this.context, sourceFile.href, lineNo);
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "script",
    searchable: true,

    initialize: function(context, doc)
    {
        this.onMouseDown = bind(this.onMouseDown, this);
        this.onContextMenu = bind(this.onContextMenu, this);
        this.onMouseOver = bind(this.onMouseOver, this);
        this.onMouseOut = bind(this.onMouseOut, this);
        this.setLineBreakpoints = bind(setLineBreakpoints, this);

        Firebug.Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        persistObjects(this, state);

        var sourceBox = this.selectedSourceBox;
        state.lastScrollTop = sourceBox  && sourceBox.scrollTop
            ? sourceBox.scrollTop
            : this.lastScrollTop;

        Firebug.Panel.destroy.apply(this, arguments);
    },

    detach: function(oldChrome, newChrome)
    {
        this.lastSourceScrollTop = this.selectedSourceBox.scrollTop;

        if (this.context.stopped)
        {
            Firebug.Debugger.detachListeners(this.context, oldChrome);
            Firebug.Debugger.attachListeners(this.context, newChrome);
        }

        Firebug.Debugger.syncCommands(this.context);

        Firebug.Panel.detach.apply(this, arguments);
    },

    reattach: function(doc)
    {
        Firebug.Panel.reattach.apply(this, arguments);

        setTimeout(bind(function()
        {
            this.selectedSourceBox.scrollTop = this.lastSourceScrollTop;
            delete this.lastSourceScrollTop;
        }, this));
    },

    initializeNode: function(oldPanelNode)
    {
        this.tooltip = this.document.createElement("div");
        setClass(this.tooltip, "scriptTooltip");
        obscure(this.tooltip, true);
        this.panelNode.appendChild(this.tooltip);

        this.initializeSourceBoxes();

        this.panelNode.addEventListener("mousedown", this.onMouseDown, true);
        this.panelNode.addEventListener("contextmenu", this.onContextMenu, false);
        this.panelNode.addEventListener("mouseover", this.onMouseOver, false);
        this.panelNode.addEventListener("mouseout", this.onMouseOut, false);
    },

    destroyNode: function()
    {
        if (this.tooltipTimeout)
            clearTimeout(this.tooltipTimeout);

        this.panelNode.removeEventListener("mousedown", this.onMouseDown, true);
        this.panelNode.removeEventListener("contextmenu", this.onContextMenu, false);
        this.panelNode.removeEventListener("mouseover", this.onMouseOver, false);
        this.panelNode.removeEventListener("mouseout", this.onMouseOut, false);
    },

     loadedContext: function(context)
     {
         updateScriptFiles(context, reload);
     },

    show: function(state)
    {
        if (this.context.loaded && !this.location)
        {
            restoreObjects(this, state);

            if (state)
            {
                this.context.throttle(function()
                {
                    var sourceBox = this.selectedSourceBox;
                    if (sourceBox)
                        sourceBox.scrollTop = state.lastScrollTop;
                }, this);
            }

            var breakpointPanel = this.context.getPanel("breakpoints", true);
            if (breakpointPanel)
                breakpointPanel.refresh();
        }
    },

    hide: function()
    {
        delete this.infoTipExpr;

        var sourceBox = this.selectedSourceBox;
        if (sourceBox)
            this.lastScrollTop = sourceBox.scrollTop;
    },

    search: function(text)
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
            if (this.highlightLine(lineNo))
                return true;
        }

        var row;
        if (this.currentSearch && text == this.currentSearch.text)
            row = this.currentSearch.findNext(true);
        else
        {
            function findRow(node) { return getAncestorByClass(node, "sourceRow"); }
            this.currentSearch = new TextSearch(sourceBox, findRow);
            row = this.currentSearch.find(text);
        }

        if (row)
        {
            var sel = this.document.defaultView.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.currentSearch.range);

            scrollIntoCenterView(row, sourceBox);
            return true;
        }
        else
            return false;
    },

    supportsObject: function(object)
    {
        if( object instanceof jsdIStackFrame
            || object instanceof SourceFile
            || (object instanceof SourceLink && object.type == "js")
            || typeof(object) == "function" )
            return 1;
        else return 0;
    },

    updateLocation: function(sourceFile)
    {
        this.showSourceFile(sourceFile, this.setLineBreakpoints);
    },

    updateSelection: function(object)
    {
        if (FBTrace.DBG_PANELS) FBTrace.sysout("debugger updateSelection object:"+object+"\n");
        if (object instanceof jsdIStackFrame)
            this.showStackFrame(object);
        else if (object instanceof SourceFile)
            this.navigate(object);
        else if (object instanceof SourceLink)
            this.showSourceLink(object);
        else if (typeof(object) == "function")
            this.showFunction(object);
        else
            this.showStackFrame(null);
    },

    getLocationList: function()
    {
        var allSources = sourceFilesAsArray(this.context);
        if (FBTrace.DBG_SOURCEFILES) FBTrace.dumpProperties("debugger getLocationList ", allSources);
        if (Firebug.showAllSourceFiles)
            return allSources;

        var list = [];
        for (var i = 0; i < allSources.length; i++)
        {
            if (FBL.showThisSourceFile(allSources[i].href))
                list.push(allSources[i]);
        }
        if (FBTrace.DBG_SOURCEFILES) FBTrace.dumpProperties("debugger getLocationList ", list);
        return list;
    },

    getDefaultLocation: function()
    {
        var sourceFiles = this.getLocationList();
        return sourceFiles[0];
    },

    getTooltipObject: function(target)
    {
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
        return findScript(this.context, this.location.href, lineNo);
    },

    showInfoTip: function(infoTip, target, x, y)
    {
        var frame = this.context.currentFrame;
        if (!frame)
            return;

        var sourceRowText = getAncestorByClass(target, "sourceRowText");
        if (!sourceRowText)
            return;

        //var line = parseInt(sourceRowText.previousSibling.textContent);
        //if (!lineWithinFunction(frame.script, line))
            //return;

        var offset = getViewOffset(target);
        var text = sourceRowText.firstChild.nodeValue.replace("\t", "        ", "g");
        var offsetX = x-sourceRowText.offsetLeft;
        var charWidth = sourceRowText.offsetWidth/text.length;
        var charOffset = Math.floor(offsetX/charWidth);
        var expr = getExpressionAt(text, charOffset);
        if (!expr || !expr.expr)
            return;

        if (expr.expr == this.infoTipExpr)
            return true;
        else
            return this.populateInfoTip(infoTip, expr.expr);
    },

    getObjectPath: function(frame)
    {
        if (Firebug.omitObjectPathStack)
            return null;
        frame = this.context.debugFrame;

        var frames = [];
        for (; frame; frame = getCallingFrame(frame))
            frames.push(frame);

        return frames;
    },

    getObjectLocation: function(sourceFile)
    {
        return sourceFile.href;
    },

    getOptionsMenuItems: function()
    {
        var context = this.context;

        return [
            optionMenu("BreakOnAllErrors", "breakOnErrors"),
            // wait 1.2 optionMenu("BreakOnTopLevel", "breakOnTopLevel"),
            // wait 1.2 optionMenu("ShowEvalSources", "showEvalSources"),
            optionMenu("ShowAllSourceFiles", "showAllSourceFiles"),
            // 1.2: always check last line; optionMenu("UseLastLineForEvalName", "useLastLineForEvalName"),
            // 1.2: always use MD5 optionMenu("UseMD5ForEvalName", "useMD5ForEvalName")
            optionMenu("TrackThrowCatch", "trackThrowCatch")
        ];
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
                var sourceFile = sourceRow.parentNode.repObject;
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
                        sourceFile.href, lineNo) }
                );
            }
        }

        return items;
    },

    getEditor: function(target, value)
    {
        if (!this.conditionEditor)
            this.conditionEditor = new ConditionEditor(this.document);

        return this.conditionEditor;
    },

});

// ************************************************************************************************

var BreakpointsTemplate = domplate(Firebug.Rep,
{
    tag:
        DIV({onclick: "$onClick"},
            FOR("group", "$groups",
                DIV({class: "breakpointBlock breakpointBlock-$group.name"},
                    H1({class: "breakpointHeader groupHeader"},
                        "$group.title"
                    ),
                    FOR("bp", "$group.breakpoints",
                        DIV({class: "breakpointRow"},
                            DIV({class: "breakpointBlockHead"},
                                INPUT({class: "breakpointCheckbox", type: "checkbox",
                                    _checked: "$bp.checked"}),
                                SPAN({class: "breakpointName"}, "$bp.name"),
                                TAG(FirebugReps.SourceLink.tag, {object: "$bp|getSourceLink"}),
                                IMG({class: "closeButton", src: "blank.gif"})
                            ),
                            DIV({class: "breakpointCode"}, "$bp.sourceLine")
                        )
                    )
                )
            )
        ),

    getSourceLink: function(bp)
    {
        return new SourceLink(bp.href, bp.lineNumber, "js");
    },

    onClick: function(event)
    {
        var panel = Firebug.getElementPanel(event.target);

        if (getAncestorByClass(event.target, "breakpointCheckbox"))
        {
            var sourceLink =
                getElementByClass(event.target.parentNode, "objectLink-sourceLink").repObject;

            panel.noRefresh = true;
            if (event.target.checked)
                fbs.enableBreakpoint(sourceLink.href, sourceLink.line);
            else
                fbs.disableBreakpoint(sourceLink.href, sourceLink.line);
            panel.noRefresh = false;
        }
        else if (getAncestorByClass(event.target, "closeButton"))
        {
            var sourceLink =
                getElementByClass(event.target.parentNode, "objectLink-sourceLink").repObject;

            panel.noRefresh = true;

            var head = getAncestorByClass(event.target, "breakpointBlock");
            var groupName = getClassValue(head, "breakpointBlock");
            if (groupName == "breakpoints")
                fbs.clearBreakpoint(sourceLink.href, sourceLink.line);
            else if (groupName == "errorBreakpoints")
                fbs.clearErrorBreakpoint(sourceLink.href, sourceLink.line);
            else if (groupName == "monitors")
            {
                var url = normalizeURL(sourceLink.href);
                var script = findScript(FirebugContext, url, sourceLink.line);
                if (script)
                    fbs.unmonitor(script);
            }

            var row = getAncestorByClass(event.target, "breakpointRow");
            panel.removeRow(row);

            panel.noRefresh = false;
        }
    }
});

// ************************************************************************************************

function BreakpointsPanel() {}

BreakpointsPanel.prototype = extend(Firebug.Panel,
{
    removeRow: function(row)
    {
        row.parentNode.removeChild(row);

        var bpCount = countBreakpoints(this.context);
        if (!bpCount)
            this.refresh();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "breakpoints",
    parentPanel: "script",

    initialize: function()
    {
        Firebug.Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        Firebug.Panel.destroy.apply(this, arguments);
    },

    show: function(state)
    {
        if (this.context.loaded)
            this.refresh();
    },

    refresh: function()
    {
        updateScriptFiles(this.context);

        var breakpoints = [];
        var errorBreakpoints = [];
        var monitors = [];

        var context = this.context;

        for (var url in this.context.sourceFileMap)
        {
            fbs.enumerateBreakpoints(url, {call: function(url, line, startLine, props)
            {
                if (FBTrace.DBG_BP) FBTrace.sysout("debugger.refresh enumerateBreakpoints for startLine="+startLine+"\n"); /*@explore*/
                var name = guessFunctionName(url, startLine-1, context);
                var source = context.sourceCache.getLine(url, line);
                breakpoints.push({name : name, href: url, lineNumber: line,
                    checked: !props.disabled, sourceLine: source});
            }});

            fbs.enumerateErrorBreakpoints(url, {call: function(url, line, startLine)
            {
                var name = guessFunctionName(url, startLine-1, context);
                var source = context.sourceCache.getLine(url, line);
                errorBreakpoints.push({name: name, href: url, lineNumber: line, checked: true,
                    sourceLine: source});
            }});

            fbs.enumerateMonitors(url, {call: function(url, line)
            {
                var name = guessFunctionName(url, line-1, context);
                monitors.push({name: name, href: url, lineNumber: line, checked: true,
                        sourceLine: ""});
            }});
        }

        function sortBreakpoints(a, b)
        {
            if (a.href == b.href)
                return a.lineNumber < b.lineNumber ? -1 : 1;
            else
                return a.href < b.href ? -1 : 1;
        }

        breakpoints.sort(sortBreakpoints);
        errorBreakpoints.sort(sortBreakpoints);
        monitors.sort(sortBreakpoints);

        var groups = [];

        if (breakpoints.length)
            groups.push({name: "breakpoints", title: $STR("Breakpoints"),
                breakpoints: breakpoints});
        if (errorBreakpoints.length)
            groups.push({name: "errorBreakpoints", title: $STR("ErrorBreakpoints"),
                breakpoints: errorBreakpoints});
        if (monitors.length)
            groups.push({name: "monitors", title: $STR("LoggedFunctions"),
                breakpoints: monitors});

        if (groups.length)
            BreakpointsTemplate.tag.replace({groups: groups}, this.panelNode);
        else
            FirebugReps.Warning.tag.replace({object: "NoBreakpointsWarning"}, this.panelNode);

    },

    getOptionsMenuItems: function()
    {
        var items = [];

        var context = this.context;
        updateScriptFiles(context);

        var bpCount = 0, disabledCount = 0;
        for (var url in context.sourceFileMap)
        {
            fbs.enumerateBreakpoints(url, {call: function(url, line, startLine, disabled, condition)
            {
                ++bpCount;
                if (fbs.isBreakpointDisabled(url, line))
                    ++disabledCount;
            }});
        }

        if (disabledCount)
        {
            items.push(
                {label: "EnableAllBreakpoints",
                    command: bindFixed(
                        Firebug.Debugger.enableAllBreakpoints, Firebug.Debugger, context) }
            );
        }
        if (bpCount && disabledCount != bpCount)
        {
            items.push(
                {label: "DisableAllBreakpoints",
                    command: bindFixed(
                        Firebug.Debugger.disableAllBreakpoints, Firebug.Debugger, context) }
            );
        }

        items.push(
            "-",
            {label: "ClearAllBreakpoints", disabled: !bpCount,
                command: bindFixed(Firebug.Debugger.clearAllBreakpoints, Firebug.Debugger, context) }
        );

        return items;
    }
});

Firebug.DebuggerListener =
{
    onStop: function(context, type, rv)
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

    onEventScript: function(context, frame, url)
    {
    },

    onTopLevel: function(context, frame, url)
    {
    },

    onEval: function(context, frame, url)
    {
    },
    onFunctionConstructor: function(context, frame, ctor_script, url)
    {
    },
};

// ************************************************************************************************

function CallstackPanel() { }

CallstackPanel.prototype = extend(Firebug.Panel,
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "callstack",
    parentPanel: "script",

    initialize: function(context, doc)
    {
        if (FBTrace.DBG_STACK) {                                                                                       /*@explore*/
            this.uid = FBL.getUniqueId();                                                                              /*@explore*/
            FBTrace.sysout("CallstackPanel.initialize:"+this.uid+"\n");                                                /*@explore*/
        }                                                                                                              /*@explore*/
        Firebug.Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        Firebug.Panel.destroy.apply(this, arguments);
    },

    show: function(state)
    {
          this.refresh();
    },

    supportsObject: function(object)
    {
        return object instanceof jsdIStackFrame;
    },
    updateSelection: function(object)
    {
        if (object instanceof jsdIStackFrame)
            this.showStackFrame(object);
    },
    refresh: function()
    {
        if (FBTrace.DBG_STACK) FBTrace.sysout("debugger.callstackPanel.refresh uid="+this.uid+"\n");                   /*@explore*/
    },

    showStackFrame: function(frame)
    {
        clearNode(this.panelNode);
        var panel = this.context.getPanel("script", true);

        if (panel && frame)
        {
            if (FBTrace.DBG_STACK)                                                                                     /*@explore*/
                FBTrace.sysout("debugger.callstackPanel.showStackFrame  uid="+this.uid+" frame:", frame);      /*@explore*/
                                                                                                                       /*@explore*/
            FBL.setClass(this.panelNode, "objectBox-stackTrace");
            trace = FBL.getStackTrace(frame, this.context);
            if (FBTrace.DBG_STACK)                                                                                     /*@explore*/
                FBTrace.dumpProperties("debugger.callstackPanel.showStackFrame trace:", trace.frames);                        /*@explore*/
                                                                                                                       /*@explore*/
            FirebugReps.StackTrace.tag.append({object: trace}, this.panelNode);
        }
    },

    getOptionsMenuItems: function()
    {
        var items = [
            optionMenu("OmitObjectPathStack", "omitObjectPathStack"),
            ];
        return items;
    }
});

// ************************************************************************************************
// Local Helpers

function ConditionEditor(doc)
{
    this.box = this.tag.replace({}, doc, this);
    this.input = this.box.childNodes[1].firstChild.firstChild.lastChild;
    this.initialize();
}

ConditionEditor.prototype = domplate(Firebug.InlineEditor.prototype,
{
    tag:
        DIV({class: "conditionEditor"},
            DIV({class: "conditionEditorTop1"},
                DIV({class: "conditionEditorTop2"})
            ),
            DIV({class: "conditionEditorInner1"},
                DIV({class: "conditionEditorInner2"},
                    DIV({class: "conditionEditorInner"},
                        DIV({class: "conditionCaption"}, $STR("ConditionInput")),
                        INPUT({class: "conditionInput", type: "text"})
                    )
                )
            ),
            DIV({class: "conditionEditorBottom1"},
                DIV({class: "conditionEditorBottom2"})
            )
        ),

    show: function(sourceLine, panel, value)
    {
        this.target = sourceLine;
        this.panel = panel;

        this.getAutoCompleter().reset();

        hide(this.box, true);
        panel.selectedSourceBox.appendChild(this.box);

        this.input.value = value;

        setTimeout(bindFixed(function()
        {
            var offset = getClientOffset(sourceLine);

            var bottom = offset.y+sourceLine.offsetHeight;
            var y = bottom - this.box.offsetHeight;
            if (y < panel.selectedSourceBox.scrollTop)
            {
                y = offset.y;
                setClass(this.box, "upsideDown");
            }
            else
                removeClass(this.box, "upsideDown");

            this.box.style.top = y + "px";
            hide(this.box, false);

            this.input.focus();
            this.input.select();
        }, this));
    },

    hide: function()
    {
        this.box.parentNode.removeChild(this.box);

        delete this.target;
        delete this.panel;
    },

    layout: function()
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    endEditing: function(target, value, cancel)
    {
        if (!cancel)
        {
            var sourceFile = this.panel.location;
            var lineNo = parseInt(this.target.textContent);

            if (value)
                fbs.setBreakpointCondition(sourceFile.href, lineNo, value);
            else
                fbs.clearBreakpoint(sourceFile.href, lineNo);
        }
    }
});

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function setLineBreakpoints(sourceFile, sourceBox)
{
    fbs.enumerateBreakpoints(sourceFile.href, {call: function(url, line, startLine, props)
    {
        var scriptRow = sourceBox.childNodes[line-1];
        scriptRow.setAttribute("breakpoint", "true");
        if (props.disabled)
            scriptRow.setAttribute("disabledBreakpoint", "true");
        if (props.condition)
            scriptRow.setAttribute("condition", "true");
    }});

    if (FBTrace.DBG_LINETABLE) FBTrace.sysout("debugger.setLineBreakpoints for sourceFile.href:"+sourceFile.href+"\n")
    sourceFile.buildLineTable();

    if (!this.setExecutableLines)
        FBTrace.dumpStack("setLineBreakpoints no this.setExecutableLines\n");
    this.setExecutableLines(sourceBox);
}

function isValidFrame(frame)
{
    try
    {
        frame.script.fileName;
        return true;
    }
    catch (exc)
    {
        return false;
    }
}

function getCallingFrame(frame)
{
    try
    {
        do
        {
            frame = frame.callingFrame;
            if (!isSystemURL(frame.script.fileName))
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
        var win = result.value.getWrappedValue();
        return getRootWindow(win);
    }
}

function getFrameContext(frame)
{
    var win = getFrameWindow(frame);
    return win ? TabWatcher.getContextByWindow(win) : null;
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

function cacheAllScripts(context)
{
    for (var url in context.sourceFileMap)
        context.sourceFileMap[url].cache(context);
}

function countBreakpoints(context)
{
    var count = 0;
    for (var url in context.sourceFileMap)
    {
        fbs.enumerateBreakpoints(url, {call: function(url, lineNo)
        {
            ++count;
        }});
    }
    return count;
}
                                                                                                                       /*@explore*/
function traceToString(trace)                                                                                          /*@explore*/
{                                                                                                                      /*@explore*/
    var str = "<top>";                                                                                                 /*@explore*/
    for(var i = 0; i < trace.frames.length; i++)                                                                       /*@explore*/
        str += "\n" + trace.frames[i];                                                                                 /*@explore*/
    str += "\n<bottom>";                                                                                               /*@explore*/
    return str;                                                                                                        /*@explore*/
}                                                                                                                      /*@explore*/

// ************************************************************************************************

Firebug.registerModule(Firebug.Debugger);
Firebug.registerPanel(BreakpointsPanel);
Firebug.registerPanel(CallstackPanel);
Firebug.registerPanel(ScriptPanel);

// ************************************************************************************************

}});
