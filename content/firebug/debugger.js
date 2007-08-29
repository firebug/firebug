/* See license.txt for terms of usage */
 
FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const jsdIScript = CI("jsdIScript");
const jsdIStackFrame = CI("jsdIStackFrame");
const jsdIExecutionHook = CI("jsdIExecutionHook");
const nsIFireBug = CI("nsIFireBug");
const nsIFireBugDebugger = CI("nsIFireBugDebugger");
const nsISupports = CI("nsISupports");

const PCMAP_SOURCETEXT = jsdIScript.PCMAP_SOURCETEXT;

const RETURN_CONTINUE = jsdIExecutionHook.RETURN_CONTINUE;
const RETURN_CONTINUE_THROW = jsdIExecutionHook.RETURN_CONTINUE_THROW;
const RETURN_ABORT = jsdIExecutionHook.RETURN_ABORT;

const TYPE_THROW = jsdIExecutionHook.TYPE_THROW;

const STEP_OVER = nsIFireBug.STEP_OVER;
const STEP_INTO = nsIFireBug.STEP_INTO;
const STEP_OUT = nsIFireBug.STEP_OUT;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

const scriptBlockSize = 20;
const tooltipTimeout = 300;

const reLineNumber = /^[^\\]?#(\d*)$/;

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
        }

        executionContext.scriptsEnabled = true;

        this.stopDebugging(context);
        
        dispatch(listeners,"onResume",[context]);
        
        if (context.aborted)
        {
            delete context.aborted;
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
        fbs.lockDebugger();

        context.currentFrame = context.debugFrame;

        this.syncCommands(context);
        this.syncListeners(context);
        context.chrome.syncSidePanels();
        
        if (!context.hideDebuggerUI || (Firebug.tabBrowser.selectedBrowser && Firebug.tabBrowser.selectedBrowser.showFirebug))
        {
            Firebug.showBar(true);
            
            var panel = context.chrome.selectPanel("script");
            panel.select(context.debugFrame);
            context.chrome.focus();
        } else {
            // XXXmax: workaround for Firebug hang in selectPanel("script")
            // when stopping in top-level frame // investigate later
            context.chrome.updateViewOnShowHook = function()
            {
                var panel = context.chrome.selectPanel("script");
                panel.select(context.debugFrame);
                context.chrome.focus();
            };
        }
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
        var context = this.breakContext;
        delete this.breakContext;
        
        if (!context)
            context = getFrameContext(frame);
        if (!context)
            return RETURN_CONTINUE;

        return this.stop(context, frame, type);
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

    onError: function(frame,error)
    {
        var context = this.breakContext;
        delete this.breakContext;
        
        Firebug.errorStackTrace = getStackTrace(frame, context);
        var hookReturn = dispatch2(listeners,"onError",[context, frame, error]);
        if (hookReturn)
        	return hookReturn;
        return -2; /* let firebug service decide to break or not */
    },

    onEvalScript: function(url, lineNo, script)
    {
	},

    onTopLevelScript: function(url, lineNo, script)
    {
        var context = this.breakContext;
        delete this.breakContext;
        
        if (!context)
            context = getFrameContext(frame);
        if (!context)
            return;
        dispatch(listeners,"onTopLevelScript",[context, url, lineNo, script]);
    },

    onToggleBreakpoint: function(url, lineNo, isSet, props)
    {
        for (var i = 0; i < TabWatcher.contexts.length; ++i)
        {
            var panel = TabWatcher.contexts[i].getPanel("script", true);
            if (panel)
            {
                panel.context.invalidatePanels("breakpoints");

                url = normalizeURL(url);
                var sourceBox = panel.sourceBoxes[url];
                if (sourceBox)
                {
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
    // extends Module
    
    initialize: function()
    {
        $("cmd_breakOnErrors").setAttribute("checked", Firebug.breakOnErrors);
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

ScriptPanel.prototype = extend(Firebug.Panel,
{    
    showFunction: function(fn)
    {
        var sourceLink = findSourceForFunction(fn);
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

        if (frame && !isValidFrame(frame))
            this.select(null);
        else
        {
            if (frame)
            {
                var url = normalizeURL(frame.script.fileName);
                this.executionFile = getScriptFileByHref(url, this.context);
                this.executionLineNo = frame.line;

                if (this.executionFile)
                {
                    this.navigate(this.executionFile);
                    this.context.throttle(this.setExecutionLine, this, [frame.line]);
                    this.context.throttle(this.updateInfoTip, this);
                }
            }
            else
            {
                this.executionFile = null;
                this.executionLineNo = -1;
                
                this.setExecutionLine(-1);
                this.updateInfoTip();
            }
        }
    },

    showSourceFile: function(sourceFile)
    {
        var sourceBox = this.getSourceBoxBySourceFile(sourceFile);
        if (!sourceBox)
            sourceBox = this.createSourceBox(sourceFile);

        this.showSourceBox(sourceBox);
    },
    
    showSourceBox: function(sourceBox)
    {
        if (this.selectedSourceBox)
            collapse(this.selectedSourceBox, true);
        
        this.selectedSourceBox = sourceBox;
        delete this.currentSearch;
        
        if (sourceBox)
        {
            if (this.executionFile && this.location.href == this.executionFile.href)
                this.setExecutionLine(this.executionLineNo);

            collapse(sourceBox, false);
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
    },

    toggleBreakpoint: function(lineNo)
    {
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

    createSourceBox: function(sourceFile)
    {
        var lines = loadScriptLines(sourceFile, this.context);
        if (!lines)
            return null;

        var maxLineNoChars = (lines.length + "").length;

        var sourceBox = this.document.createElement("div");
        sourceBox.repObject = sourceFile;
        setClass(sourceBox, "sourceBox");
        collapse(sourceBox, true);
        this.panelNode.appendChild(sourceBox);

        // For performance reason, append script lines in large chunks using the throttler,
        // otherwise displaying a large script will freeze up the UI
        var min = 0;
        do
        {
            var max = min + scriptBlockSize;
            if (max > lines.length)
                max = lines.length;

            var args = [lines, min, max-1, maxLineNoChars, sourceBox];
            this.context.throttle(appendScriptLines, top, args);

            min += scriptBlockSize;
        } while (max < lines.length);

        this.context.throttle(setLineBreakpoints, top, [sourceFile, sourceBox]);

        if (sourceFile.text)
            this.anonSourceBoxes.push(sourceBox);
        else
            this.sourceBoxes[sourceFile.href] = sourceBox;

        return sourceBox;
    },
    
    getSourceBoxBySourceFile: function(sourceFile)
    {
        if (!sourceFile.text)
            return this.getSourceBoxByURL(sourceFile.href);
        
        for (var i = 0; i < this.anonSourceBoxes.length; ++i)
        {
            var sourceBox = this.anonSourceBoxes[i];
            if (sourceBox.repObject == sourceFile)
                return sourceBox;
        }
    },

    getSourceBoxByURL: function(url)
    {
        return this.sourceBoxes[url];
    },

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
        
        this.sourceBoxes = {};
        this.anonSourceBoxes = [];

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
        this.showSourceFile(sourceFile);
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
        updateScriptFiles(this.context);
        return this.context.sourceFiles[0];
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
            optionMenu("BreakOnAllErrors", "breakOnErrors")
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
	
	onTopLevelScript: function(context, frame, before)
	{
	}
};

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

function loadScriptLines(sourceFile, context)
{
    if (sourceFile.text)
        return splitLines(sourceFile.text);
    else
        return context.sourceCache.load(sourceFile.href);
}

function appendScriptLines(lines, min, max, maxLineNoChars, panelNode)
{
    var html = getSourceLineRange(lines, min, max, maxLineNoChars);
    appendInnerHTML(panelNode, html);
}

function setLineBreakpoints(sourceFile, scriptBox)
{
    fbs.enumerateBreakpoints(sourceFile.href, {call: function(url, line, startLine, disabled, condition)
    {
        var scriptRow = scriptBox.childNodes[line-1];
        scriptRow.setAttribute("breakpoint", "true");
        if (disabled)
            scriptRow.setAttribute("disabledBreakpoint", "true");
        if (condition)
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
    frame.eval("window", "", 1, result);
    
    var win = result.value.getWrappedValue();
    return getRootWindow(win);
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

// ************************************************************************************************

Firebug.registerModule(Firebug.Debugger);
Firebug.registerPanel(BreakpointsPanel);
Firebug.registerPanel(ScriptPanel);

// ************************************************************************************************
    
}});
