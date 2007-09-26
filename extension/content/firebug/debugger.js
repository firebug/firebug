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
        updateScriptFiles(context);

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
            if (!context.hideDebuggerUI || (Firebug.tabBrowser.selectedBrowser && Firebug.tabBrowser.selectedBrowser.showFirebug))
            {
                Firebug.showBar(true);
                if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("showBar done FirebugContext="+FirebugContext+"\n");           /*@explore*/

                if (Firebug.errorStackTrace)
                    var panel = context.chrome.selectPanel("script", "callstack");
                else
                    var panel = context.chrome.selectPanel("script");  // else use prev sidePanel

                if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("selectPanel done "+panel+"\n");                               /*@explore*/
                panel.select(context.debugFrame);

                var stackPanel = context.getPanel("callstack", true);
                if (stackPanel)
                    stackPanel.refresh(context);

                if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("select done; stackPanel="+stackPanel+"\n");                   /*@explore*/
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

    onThrow: function(frame,rv)
    {
        var context = this.breakContext;
        delete this.breakContext;

        if (!context)
            context = getFrameContext(frame);
        if (FBTrace.DBG_ERRORS) FBTrace.sysout("debugger.onThrow context:"+(context?"defined":"undefined")+"\n"); /*@explore*/
        if (!context)
            return RETURN_CONTINUE_THROW;

        if (dispatch2(listeners,"onThrow",[context, frame, rv]))
            return this.stop(context, frame, TYPE_THROW, rv);
        return RETURN_CONTINUE_THROW;
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

    onEvalScript: function(url, lineNo, script)
    {
        if (FBTrace.DBG_EVAL) FBTrace.sysout("debugger.onEvalScript url="+lineNo+"@"+url+"\n");                        /*@explore*/
        var context = this.breakContext;
        delete this.breakContext;

        context.evalSourceURLByTag[script.tag] = url;
        context.evalBaseLineNumberByTag[script.tag] = lineNo;  // offset into sourceFile
        var sourceFile = context.evalSourceFilesByURL[url];
        sourceFile.addToLineTable(script, lineNo, false);
        if (FBTrace.DBG_SOURCEFILES)                                                                                   /*@explore*/
                FBTrace.sysout("debugger.onEvalScript sourcefile="+sourceFile.toString()+"\n");                        /*@explore*/
    },

    onTopLevelScript: function(url, lineNo, script)
    {
        if (FBTrace.DBG_TOPLEVEL) FBTrace.sysout("debugger.onTopLevelScript url="+lineNo+"@"+url+" vs script.fileName="+script.fileName+"\n");     /*@explore*/
        var context = this.breakContext;
        delete this.breakContext;

        // caller should ensure (script.fileName == url)
        var sourceFile = context.sourceFileMap[script.fileName];
        if (sourceFile)
            sourceFile.addToLineTable(script, script.baseLineNumber, false);
        if (FBTrace.DBG_SOURCEFILES)                                                                                   /*@explore*/
            FBTrace.sysout("debugger.onTopLevelScript sourcefile="+sourceFile.toString()+"\n");                        /*@explore*/

    },

    onToggleBreakpoint: function(url, lineNo, isSet, props)
    {
        if (FBTrace.DBG_BP) FBTrace.sysout("debugger.onToggleBreakpoint: "+lineNo+"@"+url+"\n");                         /*@explore*/
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
        if (FBTrace.DBG_EVENTS) FBTrace.sysout("debugger.onEventLevel\n");                                             /*@explore*/
        var context = this.breakContext;
        delete this.breakContext;

        try {
            var script = frame.script;

            if (!context.sourceFileMap)
            {
                if (FBTrace.DBG_EVENTS) FBTrace.sysout("context.sourceFileMap missing!\n");                            /*@explore*/
                context.sourceFileMap = {};
            }

            var url = this.getDataURLForScript(script, script.functionName+"."+script.tag);
            if (FBTrace.DBG_EVENTS) FBTrace.sysout("debugger.onEventLevel url="+url+"\n");                             /*@explore*/

            var sourceFile = new FBL.SourceFile(url, context);

            sourceFile.tag = script.tag;
            sourceFile.title = script.functionName+"."+script.tag;
            if (FBTrace.DBG_EVENTS) FBTrace.sysout("debugger.onEventScript tag="+sourceFile.tag+"\n");                 /*@explore*/

            if (context.eventSourceURLByTag == undefined)
            {
                context.eventSourceURLByTag = {};
                context.eventSourceFilesByURL = {};
            }

            context.eventSourceURLByTag[script.tag] = url;
            context.eventSourceFilesByURL[url] = sourceFile;

            var lines = context.sourceCache.store(url, script.functionSource);
            if (FBTrace.DBG_EVENTS)                                                                                    /*@explore*/
                 for (var i = 0; i < lines.length; i++) FBTrace.sysout("["+(i+2)+"]="+lines[i]+"\n");                  /*@explore*/
            sourceFile.addToLineTable(script, 0, lines);    // trueBaselineNumber heursitic
            if (FBTrace.DBG_SOURCEFILES)                                                                               /*@explore*/
                FBTrace.sysout("debugger.onEventScript sourcefile="+sourceFile.toString()+"\n");                       /*@explore*/

            dispatch(listeners,"onEventScript",[context, frame, url]);
            return url;
        }
        catch(exc)
        {
            ERROR("debugger.onEventLevel failed: "+exc);
            return null;
        }
    },

    onTopLevel: function(frame)
    {
        if (FBTrace.DBG_TOPLEVEL) FBTrace.sysout("debugger.onTopLevel \n");                                            /*@explore*/
        var context = this.breakContext;
        delete this.breakContext;

        try {
            if (!context.sourceFileMap)
                context.sourceFileMap = {};

            var script = frame.script;
            var url = normalizeURL(script.fileName);

            if (url in context.sourceFileMap)
                var sourceFile = context.sourceFileMap[url];
            else
                var sourceFile = new FBL.SourceFile(url, context);

            sourceFile.tag = script.tag;

            if (FBTrace.DBG_TOPLEVEL) FBTrace.sysout("debugger.onTopLevel sourceFile.tag="+sourceFile.tag+" has fileName="+script.fileName+"\n"); /*@explore*/

            sourceFile.addToLineTable(script, script.baseLineNumber, false);
            if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("debugger.onTopLevel sourcefile="+sourceFile.toString()+"\n"); /*@explore*/

            dispatch(listeners,"onTopLevel",[context, frame, script.fileName]);  // XXXjjb script.fileName or URL?
            return script.fileName;
        }
        catch(exc)
        {
            ERROR("debugger.onTopLevel failed: "+exc);
            return null;
        }
    },

    onEval: function(frame)
    {
        try
        {
            var context = this.breakContext;
            delete this.breakContext;

            var sourceFile = this.createSourceFileForEval(frame, context);
            FBL.setSourceFileForEvalIntoContext(context, frame.script.tag, sourceFile);

            sourceFile.addToLineTable(frame.script, 1, false);

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
            if (FBTrace.DBG_EVAL) FBTrace.dumpProperties("debugger.onEval failed: ",exc);                              /*@explore*/
            return null;
        }

    },

// Called by debugger.onEval() to store eval() source.
// The frame has the blank-function-name script and it is not the top frame.
// The frame.script.fileName is given by spidermonkey as file of the first eval().
// The frame.script.baseLineNumber is given by spidermonkey as the line of the first eval() call
// The source that contains the eval() call is the source of our caller.
// If our caller is a file, the source of our caller is at frame.script.baseLineNumber
// If our caller is an eval, the source of our caller is getSourceFileForEval
    createSourceFileForEval: function(frame, context)
    {
        var eval_expr = this.getEvalExpression(frame, context);
        if (FBTrace.DBG_EVAL) FBTrace.sysout("createSourceFileForEval eval_expr:"+eval_expr+"\n");                     /*@explore*/
        var eval_body  = this.getEvalBody(frame, "lib.createSourceFileForEval.getEvalBody", 1, eval_expr);
        if (FBTrace.DBG_EVAL) FBTrace.sysout("createSourceFileForEval eval_body:"+eval_body+"\n");                     /*@explore*/

        if (Firebug.useDebugAdapter)
            var sourceFile = this.getSourceFileFromDebugAdapter(context, frame, eval_body);
        else if (Firebug.useLastLineForEvalName)
            var sourceFile = this.getSourceFileFromLastLine(context, frame, eval_body)
        else if (Firebug.useFirstLineForEvalName)
            var sourceFile = this.getSourceFileFromFirstSourceLine(context, frame, eval_body)

        if (sourceFile == undefined)
        {
            var evalURL = this.getDataURLForScript(frame.script, eval_body);
            var sourceFile = new FBL.SourceFile(evalURL, context);
            sourceFile.eval_body = eval_body;
        }

        sourceFile.evalExpression = eval_expr;
        sourceFile.tag = frame.script.tag;

        context.sourceCache.store(sourceFile.href, sourceFile.eval_body);

        delete sourceFile.eval_body;
        return sourceFile;
    },

    getSourceFileFromLastLine: function(context, frame, eval_body)
    {
        var lastLineLength = 0;
        var endLastLine = eval_body.length - 1;
        while(lastLineLength < 3) // skip newlines at end of buffer
        {
            var lastNewline = eval_body.lastIndexOf('\n', endLastLine);
            if (lastNewline < 0)
            {
                var lastNewLine = eval_body.lastIndexOf('\r', endLastLine);
                if (lastNewLine < 0)
                    return;
            }
            lastLineLength = eval_body.length - lastNewline;
            endLastLine = lastNewline - 1;
        }
        var lastLines = eval_body.slice(lastNewline + 1);
        return this.getSourceFileFromSourceLine(lastLines, eval_body, context);
    },

    getSourceFileFromFirstSourceLine: function(context, frame, eval_body)
    {
        var firstLine = eval_body.substr(0, 256);  // guard against giants
        return this.getSourceFileFromSourceLine(firstLine, eval_body, context);
    },

    getSourceFileFromSourceLine: function(line, eval_body, context)
    {
        var m = reURIinComment.exec(line);
        if (m)
        {
            var sourceFile = new FBL.SourceFile(m[1], context);
            sourceFile.eval_body = eval_body;
        }
        return sourceFile;
    },

    getSourceFileFromDebugAdapter: function(context, frame, eval_body)
    {
        var evalBufferInfo =
            {
                sourceURL: frame.script.fileName,
                source: eval_body,
                baseLineNumber: frame.script.baseLineNumber,
                invisible: false
            };

        var wasCurrentFrame = context.currentFrame;
        context.currentFrame = frame;

        try
        {
            var scope =
                {
                    api: {},
                    vars: {arg: evalBufferInfo},
                    userVars: {}
                };

            var adapterScript = "__debugAdapter__.onEval(arg);"

            if (FBTrace.DBG_EVAL)                                                                                      /*@explore*/
            {                                                                                                          /*@explore*/
                FBTrace.sysout("script="+adapterScript);                                                               /*@explore*/
                FBTrace.dumpProperties("\ndebugger.createSourceFileForEval evalBufferInfo before:", evalBufferInfo);   /*@explore*/
            }                                                                                                          /*@explore*/
            Firebug.Debugger.evaluate(adapterScript, context, scope);

            if (FBTrace.DBG_EVAL)                                                                                      /*@explore*/
                FBTrace.dumpProperties("\ndebugger.createSourceFileForEval after evalBufferInfo after:", evalBufferInfo); /*@explore*/
                                                                                                                       /*@explore*/
            var sourceFile = new FBL.SourceFile(evalBufferInfo.sourceURL, context);
            sourceFile.eval_body = evalBufferInfo.source;

            if (evalBufferInfo.invisible)
                sourceFile.invisible = evalBufferInfo.invisible;

        }
        catch (exc)
        {
            FBL.ERROR("Call into __debugAdapter__ fails: "+exc);
        }
        context.currentFrame = wasCurrentFrame;
        return sourceFile;
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

        var sourceFile = FBL.getSourceFileForEval(callingFrame.script, context);  // TODO this should be source for any script
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

    getDataURLForScript: function(script, eval_body)
    {
        if (!eval_body)
            return "eval."+script.tag;

        // data:text/javascript;fileName=x%2Cy.js;baseLineNumber=10,<the-url-encoded-data>
        var uri = "data:text/javascript;";
        uri += "fileName="+encodeURIComponent(script.fileName) + ";";
        uri += "baseLineNumber="+encodeURIComponent(script.baseLineNumber) + ","
        uri += encodeURIComponent(eval_body);

        return uri;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initialize: function()
    {
        $("cmd_breakOnErrors").setAttribute("checked", Firebug.breakOnErrors);
        $("cmd_breakOnTopLevel").setAttribute("checked", Firebug.breakOnTopLevel);
    },

    shutdown: function()
    {
        fbs.unregisterDebugger(this);
    },

    enable: function()
    {
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

    showStackFrame: function(frame)  // XXXjjb how about creating a lib.StackFrame?
    {
        this.context.currentFrame = frame;

        if (frame && !isValidFrame(frame))
            this.select(null);
        else
        {
            if (frame)
            {
                if (!frame.script.functionName && frame.callingFrame)  // eval-level
                {
                    if (FBTrace.DBG_STACK) FBTrace.sysout("showStackFrame eval-level\n");                              /*@explore*/
                    this.executionFile = getSourceFileForEval(frame.script, this.context);
                    this.executionLineNo = frame.line - frame.script.baseLineNumber + 1;
                }
                else
                {
                    if (this.context.evalSourceURLByTag && (frame.script.tag  in this.context.evalSourceURLByTag) ) // eval-script
                    {
                        if (FBTrace.DBG_STACK) FBTrace.sysout("showStackFrame evalSource\n");                          /*@explore*/
                        var url = this.context.evalSourceURLByTag[frame.script.tag];
                        this.executionFile = this.context.evalSourceFilesByURL[url];
                        this.executionLineNo = getLineAtPCForEvaled(frame, this.context);
                    }
                    else if (this.context.eventSourceURLByTag && (frame.script.tag  in this.context.eventSourceURLByTag) ) // event-script
                    {
                        if (FBTrace.DBG_STACK) FBTrace.sysout("showStackFrame eventSource\n");                         /*@explore*/
                        var url = this.context.eventSourceURLByTag[frame.script.tag];
                        if (FBTrace.DBG_STACK) FBTrace.sysout("showStackFrame eventSource url="+url+"\n");             /*@explore*/
                        this.executionFile = this.context.eventSourceFilesByURL[url];
                        if (FBTrace.DBG_STACK) FBTrace.sysout("showStackFrame exefile="+this.executionFile+"\n");      /*@explore*/
                        this.executionLineNo = getLineAtPCForEvent(frame, this.context);
                    }
                    else // top-level or top-level script
                    {
                        if (FBTrace.DBG_STACK) FBTrace.sysout("showStackFrame top\n");                                 /*@explore*/
                        var url = normalizeURL(frame.script.fileName);
                        this.executionFile = getScriptFileByHref(url, this.context);
                        this.executionLineNo = frame.line;
                    }
                }

                if (this.executionFile)
                {
                    this.navigate(this.executionFile);
                    this.context.throttle(this.setExecutionLine, this, [this.executionLineNo]);
                    this.context.throttle(this.updateInfoTip, this);
                }
            }
            else
            {
                if (FBTrace.DBG_STACK) FBTrace.sysout("showStackFrame no frame\n");                                    /*@explore*/
                this.executionFile = null;
                this.executionLineNo = -1;

                this.setExecutionLine(-1);
                this.updateInfoTip();
            }
        }
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
        var sourceFile = sourceBox.repObject;  // XXXjjb true but obscure
        if (FBTrace.DBG_BP) FBTrace.sysout("debugger.setExecutableLines: "+sourceFile.toString()+"\n");                /*@explore*/
        var lineNo = 1;
        while( lineNode = this.getLineNode(lineNo) )
        {
            if (sourceFile.isLineExecutable(lineNo))
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
        return object instanceof jsdIStackFrame
            || object instanceof SourceFile
            || (object instanceof SourceLink && object.type == "js")
            || typeof(object) == "function";
    },

    updateLocation: function(sourceFile)
    {
        this.showSourceFile(sourceFile, setLineBreakpoints);
    },

    updateSelection: function(object)
    {
        if (object instanceof jsdIStackFrame)
            this.showStackFrame(object);
        else if (object instanceof SourceLink)
            this.showSourceLink(object);
        else if (typeof(object) == "function")
            this.showFunction(object);
        else
            this.showStackFrame(null);
    },

    getLocationList: function()
    {
        return updateScriptFiles(this.context, true);
    },

    getDefaultLocation: function()
    {
        var sourceFiles = updateScriptFiles(this.context);
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
        return findScript(this.location.href, lineNo);
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
            optionMenu("ShowEvalSources", "showEvalSources"),
            optionMenu("ShowAllSourceFiles", "showAllSourceFiles"),
            optionMenu("UseLastLineForEvalName", "useLastLineForEvalName"),
            optionMenu("UseFirstLineForEvalName", "useFirstLineForEvalName")
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
    }
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
                var script = findScript(url, sourceLink.line);
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
    }
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
                FBTrace.dumpProperties("debugger.callstackPanel.showStackFrame  uid="+this.uid+" frame:", frame);      /*@explore*/
                                                                                                                       /*@explore*/
            FBL.setClass(this.panelNode, "objectBox-stackTrace");
            trace = FBL.getStackTrace(frame, this.context).reverse();
            if (FBTrace.DBG_STACK)                                                                                     /*@explore*/
                FBTrace.dumpProperties("debugger.callstackPanel.showStackFrame trace:", trace);                        /*@explore*/
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

function setLineBreakpoints(sourceFile, scriptBox)
{
    fbs.enumerateBreakpoints(sourceFile.href, {call: function(url, line, startLine, props)
    {
        var scriptRow = scriptBox.childNodes[line-1];
        scriptRow.setAttribute("breakpoint", "true");
        if (props.disabled)
            scriptRow.setAttribute("disabledBreakpoint", "true");
        if (props.condition)
            scriptRow.setAttribute("condition", "true");
    }});
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
    updateScriptFiles(context);
    for (var url in context.sourceFileMap)
        context.sourceCache.load(url);
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
