/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/array",
    "firebug/debugger/script/scriptView",
    "arch/compilationunit",
    "firebug/debugger/debuggerTool",
    "firebug/chrome/menu",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/script/sourceLink",
    "firebug/debugger/breakpoint/breakpoint",
    "firebug/debugger/breakpoint/breakpointStore",
    "firebug/trace/traceModule",
    "firebug/trace/traceListener",
],
function (Obj, Locale, Events, Dom, Arr, ScriptView, CompilationUnit, DebuggerTool, Menu,
    StackFrame, SourceLink, Breakpoint, BreakpointStore, TraceModule, TraceListener) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_SCRIPTPANEL");

// ********************************************************************************************* //
// Script panel

/**
 * @Panel This object represents the 'Script' panel that is used for debugging JavaScript.
 * This panel is using JSD2 API for debugging.
 */
function ScriptPanel() {}
var BasePanel = Firebug.ActivablePanel;
ScriptPanel.prototype = Obj.extend(BasePanel,
/** @lends ScriptPanel */
{
    dispatchName: "JSD2.ScriptPanel",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "jsd2script",
    searchable: true,
    breakable: true,
    enableA11y: true,
    order: 45,

    // Will appear in detached Firebug Remote XUL window.
    remotable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(context, doc)
    {
        BasePanel.initialize.apply(this, arguments);

        // Custom tracing.
        this.traceListener = new TraceListener("scriptPanel.", "DBG_SCRIPTPANEL", false);
        TraceModule.addListener(this.traceListener);

        this.panelSplitter = Firebug.chrome.$("fbPanelSplitter");
        this.sidePanelDeck = Firebug.chrome.$("fbSidePanelDeck");

        // Create source view for JS source code. Initialization is made when the Script
        // panel is actualy displayed (in 'show' method).
        this.scriptView = new ScriptView();
        this.scriptView.addListener(this);

        // Listen to breakpoint changes (add/remove).
        BreakpointStore.addListener(this);

        // The tool/controller (serves as a proxy to the backend service) is registered dynamicaly.
        // Depending on the current tool the communication can be local or remote.
        // Access to the back-end debugger service (JSD2) must always be done through the tool.
        this.tool = this.context.getTool("debugger");
        this.tool.addListener(this);
    },

    destroy: function(state)
    {
        this.scriptView.removeListener(this);
        this.scriptView.destroy();

        BreakpointStore.removeListener(this);

        this.tool.removeListener(this);

        TraceModule.removeListener(this.traceListener);

        BasePanel.destroy.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends ActivablePanel

    onActivationChanged: function(enable)
    {
        // xxxHonza: needs to be revisited
        if (enable)
        {
            Firebug.JSD2.Debugger.addObserver(this);
            Firebug.TabCacheModel.addObserver(this);
        }
        else
        {
            Firebug.JSD2.Debugger.removeObserver(this);
            Firebug.TabCacheModel.removeObserver(this);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Panel show/hide

    show: function(state)
    {
        var enabled = this.isEnabled();
        if (!enabled)
            return;

        Trace.sysout("scriptPanel.show;", state);

        // Initialize the source view. In case of Orion initialization here, when the 
        // parentNode is actualy visible, also solves Orion's problem:
        // Error: TypeError: this._iframe.contentWindow is undefined
        // Save for muliple calls.
        this.scriptView.initialize(this.panelNode);

        var active = true;

        // These buttons are visible only, if debugger is enabled.
        this.showToolbarButtons("fbLocationSeparator", active);
        this.showToolbarButtons("fbDebuggerButtons", active);
        this.showToolbarButtons("fbLocationButtons", active);
        this.showToolbarButtons("fbScriptButtons", active);
        this.showToolbarButtons("fbStatusButtons", active);

        Firebug.chrome.$("fbRerunButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut", [Locale.$STR("script.Rerun"), "Shift+F8"]));
        Firebug.chrome.$("fbContinueButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut", [Locale.$STR("script.Continue"), "F8"]));
        Firebug.chrome.$("fbStepIntoButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut", [Locale.$STR("script.Step_Into"), "F11"]));
        Firebug.chrome.$("fbStepOverButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut", [Locale.$STR("script.Step_Over"), "F10"]));
        Firebug.chrome.$("fbStepOutButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut",
                [Locale.$STR("script.Step_Out"), "Shift+F11"]));

        // Additional debugger panels are visible only, if debugger is active.
        this.panelSplitter.collapsed = !active;
        this.sidePanelDeck.collapsed = !active;
    },

    hide: function(state)
    {
    },

    showStackFrame: function(frame)
    {
        if (this.context.stopped)
            this.showStackFrameTrue(frame);
        else
            this.showNoStackFrame();
    },

    showStackFrameTrue: function(frame)
    {
        // Make sure the current frame seen by the user is set (issue 4818)
        // xxxHonza: Better solution (important for remoting)
        // Set this.context.currentFrame = frame (meaning frameXB) and pass the value of
        // frameXB during evaluation calls, causing the backend to select the appropriate
        // frame for frame.eval().
        //this.context.currentFrame = frame.nativeFrame;

        var url = frame.getURL();
        var lineNo = frame.getLineNumber();

        if (FBTrace.DBG_STACK)
            FBTrace.sysout("showStackFrame: " + url + "@" + lineNo);

        if (this.context.breakingCause)
            this.context.breakingCause.lineNo = lineNo;

        this.scrollToLine(url, lineNo/*, this.highlightLine(lineNo, this.context)*/);
        //this.context.throttle(this.updateInfoTip, this);
    },

    showNoStackFrame: function()
    {
        this.removeExeLineHighlight();

        // Clear the stack on the panel toolbar
        var panelStatus = Firebug.chrome.getPanelStatusElements();
        panelStatus.clear();

        this.updateInfoTip();

        var watchPanel = this.context.getPanel("jsd2watches", true);
        if (watchPanel)
            watchPanel.showEmptyMembers();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Selection

    updateSelection: function(object)
    {
        if (FBTrace.DBG_PANELS)
        {
            FBTrace.sysout("script updateSelection object:" + object + " of type " +
                typeof(object), object);

            if (object instanceof CompilationUnit)
                FBTrace.sysout("script updateSelection this.navigate(object)", object);
            else if (object instanceof SourceLink)
                FBTrace.sysout("script updateSelection this.showSourceLink(object)", object);
            else if (typeof(object) == "function")
                FBTrace.sysout("script updateSelection this.showFunction(object)", object);
            else if (object instanceof StackFrame)
                FBTrace.sysout("script updateSelection this.showStackFrame(object)", object);
            else
                FBTrace.sysout("script updateSelection this.showStackFrame(null)", object);
        }

        if (object instanceof CompilationUnit)
            this.navigate(object);
        else if (object instanceof SourceLink)
            this.showSourceLink(object);
        else if (typeof(object) == "function")
            this.showFunction(object);
        else if (object instanceof StackFrame)
            this.showStackFrame(object);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Scrolling & Highlighting

    scrollToLine: function(href, lineNo, highlighter)
    {
        this.scriptView.scrollToLine(href, lineNo, highlighter);
    },

    removeExeLineHighlight: function(href, lineNo, highlighter)
    {
        this.scriptView.removeDebugLocation();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Location List

    getLocationList: function()
    {
        return this.context.getAllCompilationUnits();
    },

    getDefaultLocation: function()
    {
        var compilationUnits = this.getLocationList();
        if (!compilationUnits.length)
            return null;

        return compilationUnits[0];
    },

    getObjectLocation: function(compilationUnit)
    {
        return compilationUnit.getURL();
    },

    updateLocation: function(compilationUnit)
    {
        Trace.sysout("scriptPanel.updateLocation; " + (compilationUnit ? compilationUnit.url :
            "no compilation unit"), compilationUnit);

        this.showSource(compilationUnit);

        Events.dispatch(this.fbListeners, "onUpdateScriptLocation",
            [this, compilationUnit]);
    },

    showSource: function(compilationUnit)
    {
        Trace.sysout("scriptPanel.showSource; " + (compilationUnit ? compilationUnit.url :
            "no compilation unit"), compilationUnit);

        if (!compilationUnit)
            compilationUnit = this.getDefaultLocation();

        // Sources doesn't have to be fetched from the server yet. In such case there
        // are not compilation units and so, no default location. We need to just wait
        // since sources are coming asynchronously (the UI will auto update after
        // newScript event).
        if (!compilationUnit)
            return;

        var self = this;
        function callback(unit, firstLineNumber, lastLineNumber, lines)
        {
            self.scriptView.showSource(lines.join(""));
        }

        compilationUnit.getSourceLines(-1, -1, callback);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Search

    search: function(text, reverse)
    {
        return this.scriptView.search(text, reverse);
    },

    onNavigateToNextDocument: function(scanDoc, reverse)
    {
        return this.navigateToNextDocument(scanDoc, reverse);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // ScriptView Listener

    addBreakpoint: function(bp)
    {
        var url = this.location.href;
        var line = bp.line + 1;

        // Persist the breakpoint on the client side.
        BreakpointStore.addBreakpoint(url, line);
    },

    removeBreakpoint: function(bp)
    {
        var url = this.location.href;
        var line = bp.line + 1;

        var bp = BreakpointStore.findBreakpoint(url, line);
        if (!bp)
        {
            TraceError.sysout("scriptPanel.removeBreakpoint; ERROR doesn't exist!");
            return;
        }

        // Remove the breakpoint from the client side store. Breakpoint store
        // will notify all listeners (all Script panel including this one)
        // about breakpoint removal and so, it can be removed from all contexts
        BreakpointStore.removeBreakpoint(url, line);
    },

    getBreakpoints: function(breakpoints)
    {
        if (!this.location)
            return;

        var url = this.location.href;
        var bps = BreakpointStore.getBreakpoints(url);
        if (!bps || !bps.length)
            return;

        breakpoints.push.apply(breakpoints, bps);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // BreakpointStore Listener

    onBreakpointAdded: function(bp)
    {
        Trace.sysout("scriptPanel.onBreakpointAdded;", bp);

        var self = this;

        function callback(response, bpClient)
        {
            // The breakpoint is set on the server side even if the script doesn't
            // exist yet i.e. error == 'noScript' so, doesn't count this case as
            // an error.
            if (response.error && response.error != "noScript")
            {
                TraceError.sysout("scriptPanel.onBreakpointAdd; ERROR " + response,
                    {response: response, bpClient: bpClient});
                return;
            }

            // Cache the breakpoint-client object since it has API for removing itself.
            // (removal happens in the Script panel when the user clicks a breakpoint
            // in the breakpoint column).

            //xxxHonza: this must be context dependent. We need a list of Breakpoint
            // instances stored in the context pointing to the right BreakpointClient object.
            // This should be probably done in DebuggerTool
            //bp.params.client = bpClient;

            if (FBTrace.DBG_BP)
                FBTrace.sysout("scriptPanel.onBreakpointAdd; breakpoint added", bpClient);
        }

        // Append the new breakpoint to the panel/context.
        // xxxHonza: append the breakpoint only if the script is loaded in this context?
        // But, what if the script is loaded later?
        this.tool.setBreakpoint(this.context, bp.href, bp.lineNo, callback);

        // Ass breakpoint to the UI.
        // xxxHonza: we should add a disabled breakpoint and wait for async response.
        this.scriptView.addBreakpoint(bp);
    },

    onBreakpointRemoved: function(bp)
    {
        Trace.sysout("scriptPanel.onBreakpointRemoved;", bp);

        function callback(response)
        {
            Trace.sysout("scriptPanel.onBreakpointRemoved; Response from the server:", response);
        }

        // Remove the breakpoint from this panel/context.
        this.tool.removeBreakpoint(this.context, bp.href, bp.lineNo, callback);

        // Remove breakpoint from the UI.
        // xxxHonza: we should mark it as disabled and wait for the response from the server.
        this.scriptView.removeBreakpoint(bp);
    },

    onBreakpointEnabled: function(bp)
    {
        this.tool.enableBreakpoint(this.context, bp.href, bp.lineNo, function()
        {
        });

        // Remove breakpoint from the UI.
        // xxxHonza: should be async
        this.scriptView.enableBreakpoint(bp);
    },

    onBreakpointDisabled: function(bp)
    {
        this.tool.disableBreakpoint(this.context, bp.href, bp.lineNo, function()
        {
        });

        // Remove breakpoint from the UI.
        // xxxHonza: should be async
        this.scriptView.disableBreakpoint(bp);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    onContextMenu: function(items)
    {
        var menuItems = this.getOptionsMenuItems();
        items.push.apply(items, menuItems);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    getOptionsMenuItems: function()
    {
        var context = this.context;

        return [
            // 1.2: always check last line; optionMenu("UseLastLineForEvalName", "useLastLineForEvalName"),
            // 1.2: always use MD5 optionMenu("UseMD5ForEvalName", "useMD5ForEvalName")
            Menu.optionMenu("script.option.Track_Throw_Catch", "trackThrowCatch",
                "script.option.tip.Track_Throw_Catch"),
            //"-",
            //1.2 option on toolbar this.optionMenu("DebuggerEnableAlways", enableAlwaysPref)
            Menu.optionMenu("firebug.breakpoint.showBreakNotifications", "showBreakNotification",
                "firebug.breakpoint.tip.Show_Break_Notifications")
        ];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    getContextMenuItems: function(fn, target)
    {
        if (Dom.getAncestorByClass(target, "sourceLine"))
            return;

        var sourceRow = Dom.getAncestorByClass(target, "sourceRow");
        if (!sourceRow)
            return;

        var sourceLine = Dom.getChildByClass(sourceRow, "sourceLine");
        var lineNo = parseInt(sourceLine.textContent);

        var items = [];

        var selection = this.document.defaultView.getSelection();
        if (selection.toString())
        {
            items.push({
                label: "CopySourceCode",
                tooltiptext: "script.tip.Copy_Source_Code",
                command: Obj.bind(this.copySource, this)
            },
            "-",
            {
                label: "AddWatch",
                tooltiptext: "watch.tip.Add_Watch",
                command: Obj.bind(this.addSelectionWatch, this)
            });
        }

        var hasBreakpoint = sourceRow.getAttribute("breakpoint") == "true";

        items.push("-",
        {
            label: "SetBreakpoint",
            tooltiptext: "script.tip.Set_Breakpoint",
            type: "checkbox",
            checked: hasBreakpoint,
            command: Obj.bindFixed(this.toggleBreakpoint, this, lineNo)
        });

        if (hasBreakpoint)
        {
            var isDisabled = this.tool.isBreakpointDisabled(this.context, this.location.href,
                lineNo);

            items.push({
                label: "breakpoints.Disable_Breakpoint",
                tooltiptext: "breakpoints.tip.Disable_Breakpoint",
                type: "checkbox",
                checked: isDisabled,
                command: Obj.bindFixed(this.toggleDisableBreakpoint, this, lineNo)
            });
        }

        items.push({
            label: "EditBreakpointCondition",
            tooltiptext: "breakpoints.tip.Edit_Breakpoint_Condition",
            command: Obj.bindFixed(this.editBreakpointCondition, this, lineNo)
        });

        if (this.context.stopped)
        {
            var sourceRow = Dom.getAncestorByClass(target, "sourceRow");
            if (sourceRow)
            {
                var compilationUnit = Dom.getAncestorByClass(sourceRow, "sourceBox").repObject;
                var lineNo = parseInt(sourceRow.firstChild.textContent);

                var debuggr = this;
                items.push(
                    "-",
                    {
                        label: "script.Rerun",
                        tooltiptext: "script.tip.Rerun",
                        id: "contextMenuRerun",
                        command: Obj.bindFixed(debuggr.rerun, debuggr, this.context),
                        acceltext: "Shift+F8"
                    },
                    {
                        label: "script.Continue",
                        tooltiptext: "script.tip.Continue",
                        id: "contextMenuContinue",
                        command: Obj.bindFixed(debuggr.resume, debuggr, this.context),
                        acceltext: "F8"
                    },
                    {
                        label: "script.Step_Over",
                        tooltiptext: "script.tip.Step_Over",
                        id: "contextMenuStepOver",
                        command: Obj.bindFixed(debuggr.stepOver, debuggr, this.context),
                        acceltext: "F10"
                    },
                    {
                        label: "script.Step_Into",
                        tooltiptext: "script.tip.Step_Into",
                        id: "contextMenuStepInto",
                        command: Obj.bindFixed(debuggr.stepInto, debuggr, this.context),
                        acceltext: "F11"
                    },
                    {
                        label: "script.Step_Out",
                        tooltiptext: "script.tip.Step_Out",
                        id: "contextMenuStepOut",
                        command: Obj.bindFixed(debuggr.stepOut, debuggr, this.context),
                        acceltext: "Shift+F11"
                    },
                    {
                        label: "firebug.RunUntil",
                        tooltiptext: "script.tip.Run_Until",
                        id: "contextMenuRunUntil",
                        command: Obj.bindFixed(debuggr.runUntil, debuggr, this.context,
                            compilationUnit, lineNo)
                    }
                );
            }
        }

        return items;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Editors

    getEditor: function(target, value)
    {
        if (!this.conditionEditor)
            this.conditionEditor = new Firebug.Breakpoint.ConditionEditor(this.document);

        return this.conditionEditor;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // BON

    supportsBreakOnNext: function()
    {
        return this.breakable && Firebug.jsDebuggerOn;
    },

    breakOnNext: function(enabled)
    {
        if (enabled)
            this.tool.breakOnNext(this.context, true);
        else
            this.tool.breakOnNext(this.context, false);
    },

    getBreakOnNextTooltip: function(armed)
    {
        return (armed ?
            Locale.$STR("script.Disable Break On Next") : Locale.$STR("script.Break On Next"));
    },

    shouldBreakOnNext: function()
    {
        return !!this.context.breakOnNextHook;  // TODO BTI
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Toolbar functions

    attachListeners: function(context, chrome)
    {
        this.keyListeners =
        [
            chrome.keyCodeListen("F8", Events.isShift, Obj.bind(this.rerun, this, context), true),
            chrome.keyCodeListen("F8", null, Obj.bind(this.resume, this, context), true),
            chrome.keyCodeListen("F10", null, Obj.bind(this.stepOver, this, context), true),
            chrome.keyCodeListen("F11", null, Obj.bind(this.stepInto, this, context)),
            chrome.keyCodeListen("F11", Events.isShift, Obj.bind(this.stepOut, this, context))
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

    syncListeners: function(context)
    {
        var chrome = Firebug.chrome;

        if (context.stopped)
            this.attachListeners(context, chrome);
        else
            this.detachListeners(context, chrome);
    },

    syncCommands: function(context)
    {
        var chrome = Firebug.chrome;
        if (!chrome)
        {
            TraceError.sysout("debugger.syncCommand, context with no chrome: " +
                context.getGlobalScope());

            return;
        }

        if (context.stopped)
        {
            chrome.setGlobalAttribute("fbDebuggerButtons", "stopped", "true");
            chrome.setGlobalAttribute("cmd_firebug_rerun", "disabled", "false");
            chrome.setGlobalAttribute("cmd_firebug_resumeExecution", "disabled", "false");
            chrome.setGlobalAttribute("cmd_firebug_stepOver", "disabled", "false");
            chrome.setGlobalAttribute("cmd_firebug_stepInto", "disabled", "false");
            chrome.setGlobalAttribute("cmd_firebug_stepOut", "disabled", "false");
        }
        else
        {
            chrome.setGlobalAttribute("fbDebuggerButtons", "stopped", "false");
            chrome.setGlobalAttribute("cmd_firebug_rerun", "disabled", "true");
            chrome.setGlobalAttribute("cmd_firebug_stepOver", "disabled", "true");
            chrome.setGlobalAttribute("cmd_firebug_stepInto", "disabled", "true");
            chrome.setGlobalAttribute("cmd_firebug_stepOut", "disabled", "true");
            chrome.setGlobalAttribute("cmd_firebug_resumeExecution", "disabled", "true");
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Toolbar functions

    rerun: function(context)
    {
        this.tool.rerun(context);
    },

    resume: function(context)
    {
        this.tool.resume(context);
    },

    stepOver: function(context)
    {
        this.tool.stepOver(context);
    },

    stepInto: function(context)
    {
        this.tool.stepInto(context);
    },

    stepOut: function(context)
    {
        this.tool.stepOut(context);
    },

    runUntil: function(context, compilationUnit, lineNo)
    {
        this.tool.runUntil(compilationUnit, lineNo);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    supportsObject: function(object, type)
    {
        if (object instanceof CompilationUnit
            || (object instanceof SourceLink && object.type == "js")
            || typeof(object) == "function"
            || object instanceof StackFrame)
        {
            // Higher priority than the DOM panel.
            return 2;
        }

        return 0;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tool Listener

    onStartDebugging: function(context, event, packet)
    {
        Trace.sysout("scriptPanel.onStartDebugging; " + this.context.getName());

        try
        {
            var currentBreakable = Firebug.chrome.getGlobalAttribute(
                "cmd_firebug_toggleBreakOn", "breakable");

            Trace.sysout("scriptPanel.onStartDebugging; currentBreakable " + currentBreakable +
                " in " + this.context.getName() + " currentContext " +
                Firebug.currentContext.getName());

            // If currentBreakable is false, then we are armed, but we broke
            if (currentBreakable == "false")
                Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable", "true");

            // If Firebug is minimized, open the UI to show we are stopped
            if (Firebug.isMinimized())
                Firebug.unMinimize();

            this.syncCommands(this.context);
            this.syncListeners(this.context);

            // Update Break on Next lightning
            //Firebug.Breakpoint.updatePanelTab(this, false);

            // This is how the Watch panel is synchronized.
            Firebug.chrome.select(this.context.currentFrame, "jsd2script", null, true);
            Firebug.chrome.syncPanel("jsd2script");  // issue 3463 and 4213
            Firebug.chrome.focus();
        }
        catch (exc)
        {
            TraceError.sysout("Resuming debugger: error during debugging loop: " + exc, exc);
            Firebug.Console.log("Resuming debugger: error during debugging loop: " + exc);

            this.resume(this.context);
        }
    },

    onStopDebugging: function(context, event, packet)
    {
        Trace.sysout("scriptPanel.onStopDebugging; " + this.context.getName());

        try
        {
            var chrome = Firebug.chrome;

            /*if (this.selectedSourceBox && this.selectedSourceBox.breakCauseBox)
            {
                this.selectedSourceBox.breakCauseBox.hide();
                delete this.selectedSourceBox.breakCauseBox;
            }*/

            this.syncCommands(this.context);
            this.syncListeners(this.context);
            this.showNoStackFrame();

            // After main panel is completely updated
            chrome.syncSidePanels();
        }
        catch (exc)
        {
            TraceError.sysout("scriptPanel.onStopDebugging; EXCEPTION " + exc, exc);
        }
    },

    newScript: function(sourceFile)
    {
        Trace.sysout("scriptPanel.newScript; " + sourceFile.href, sourceFile);

        // New script has been appended, update the default location if necessary.
        if (!this.location)
            this.navigate(null);

        // Initialize existing breakpoints
        //var bps = BreakpointStore.getBreakpoints(sourceFile.href);
        //self.tool.setBreakpoints(self.context, bps, function(response){});
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Info Tips

    updateInfoTip: function()
    {
        var infoTip = this.panelBrowser ? this.panelBrowser.infoTip : null;
        if (infoTip && this.infoTipExpr)
            this.populateInfoTip(infoTip, this.infoTipExpr);
    },

    showInfoTip: function(infoTip, target, x, y, rangeParent, rangeOffset)
    {
        var sourceLine = Dom.getAncestorByClass(target, "sourceLine");
        if (sourceLine)
            return this.populateBreakpointInfoTip(infoTip, sourceLine);

        var frame = this.context.currentFrame;
        if (!frame)
            return;

        var sourceRowText = Dom.getAncestorByClass(target, "sourceRowText");
        if (!sourceRowText)
            return;

        // See http://code.google.com/p/fbug/issues/detail?id=889
        // Idea from: Jonathan Zarate's rikaichan extension (http://www.polarcloud.com/rikaichan/)
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

    populateInfoTip: function(infoTip, expr)
    {
        if (!expr || Keywords.isJavaScriptKeyword(expr))
            return false;

        var self = this;

        // If the evaluate fails, then we report an error and don't show the infotip
        Firebug.CommandLine.evaluate(expr, this.context, null, this.context.getGlobalScope(),
            function success(result, context)
            {
                var rep = Firebug.getRep(result, context);
                var tag = rep.shortTag ? rep.shortTag : rep.tag;

                if (FBTrace.DBG_STACK)
                    FBTrace.sysout("populateInfoTip result is "+result, result);

                tag.replace({object: result}, infoTip);

                // If the menu is never displayed, the contextMenuObject is not reset
                // (back to null) and is reused at the next time the user opens the
                // context menu, which is wrong.
                // This line was appended when fixing:
                // http://code.google.com/p/fbug/issues/detail?id=1700
                // The object should be returned by getPopupObject(),
                // that is called when the context menu is showing.
                // The problem is, that the "onContextShowing" event doesn't have the
                // rangeParent field set and so it isn't possible to get the
                // expression under the cursor (see getExpressionAt).
                //Firebug.chrome.contextMenuObject = result;

                self.infoTipExpr = expr;
            },
            function failed(result, context)
            {
                self.infoTipExpr = "";
            }
        );
        return (self.infoTipExpr == expr);
    },

    populateBreakpointInfoTip: function(infoTip, sourceLine)
    {
        var sourceRow = Dom.getAncestorByClass(sourceLine, "sourceRow");
        var condition = sourceRow.getAttribute("condition");
        if (!condition)
            return false;

        var expr = sourceRow.breakpointCondition;
        if (!expr)
            return false;

        if (expr == this.infoTipExpr)
            return true;

        Firebug.ScriptPanel.BreakpointInfoTip.render(infoTip, expr);

        this.infoTipExpr = expr;

        return true;
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(ScriptPanel);

return ScriptPanel;

// ********************************************************************************************* //
});