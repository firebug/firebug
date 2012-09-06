/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/debugger/scriptView",
    "arch/compilationunit",
    "firebug/debugger/debuggerTool",
    "firebug/chrome/menu",
    "firebug/debugger/stackFrame",
    "firebug/debugger/sourceLink",
],
function (Obj, Locale, Events, Dom, ScriptView, CompilationUnit, DebuggerTool, Menu,
    StackFrame, SourceLink) {

// ********************************************************************************************* //
// Script panel

/**
 * @Panel
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

        this.panelSplitter = Firebug.chrome.$("fbPanelSplitter");
        this.sidePanelDeck = Firebug.chrome.$("fbSidePanelDeck");

        Firebug.connection.addListener(this);

        this.scriptView = new ScriptView();
        this.scriptView.addListener(this);
        this.scriptView.initialize(this.panelNode);
    },

    destroy: function(state)
    {
        Firebug.connection.removeListener(this);

        this.scriptView.removeListener(this);
        this.scriptView.destroy();

        BasePanel.destroy.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    onConnect: function(proxy)
    {
        FBTrace.sysout("JSD2ScriptPanel.onConnect;");

        // The tool (serves as a proxy to the backend service) is registered dynamicaly.
        // Depending on the current tool the communication can be local or remote.
        // Access to the back-end debugger service (JSD2) must always be done through the tool.
        this.tool = this.context.getTool("debugger");
        this.tool.attach(this.context, proxy.connection, this);
    },

    onDisconnect: function(proxy)
    {
        FBTrace.sysout("JSD2ScriptPanel.onDisconnect;");

        // Detach from the current tool.
        this.tool.detach(this.context, proxy.connection, this);
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

        var watchPanel = this.context.getPanel("watches", true);
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
        this.showSource(compilationUnit);

        Events.dispatch(this.fbListeners, "onUpdateScriptLocation",
            [this, compilationUnit]);
    },

    showSource: function(compilationUnit)
    {
        if (!compilationUnit)
            compilationUnit = this.getDefaultLocation();

        // Sources doesn't have to be fetched from the server yet. In such case there
        // are not compilation units and so, no default location.
        if (!compilationUnit)
        {
            FBTrace.sysout("scriptPanel.showSource; ERROR no compilation unit");
            return;
        }

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

    onBreakpointAdd: function(bp)
    {
        var self = this;
        function callback()
        {
            FBTrace.sysout("scriptPanel.onBreakpointAdd; breakpoint added", arguments);
        }

        this.tool.setBreakpoint(this.context, this.location.href, bp.line, callback);
    },

    onBreakpointRemove: function(bp)
    {
        FBTrace.sysout("scriptPanel.onBreakpointRemove " + bp, bp);
    },

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
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("debugger.syncCommand, context with no chrome: " +
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

    onStartDebugging: function(frame)
    {
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("script.startDebugging enter context: " + this.context.getName(), frame);

        try
        {
            var currentBreakable = Firebug.chrome.getGlobalAttribute(
                "cmd_firebug_toggleBreakOn", "breakable");

            if (FBTrace.DBG_BP)
            {
                FBTrace.sysout("debugger.startDebugging; currentBreakable " + currentBreakable +
                    " in " + this.context.getName() + " currentContext " +
                    Firebug.currentContext.getName());
            }

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
            Firebug.chrome.select(frame, "jsd2script", null, true);
            Firebug.chrome.syncPanel("jsd2script");  // issue 3463 and 4213
            Firebug.chrome.focus();
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Resuming debugger: error during debugging loop: " + exc, exc);

            Firebug.Console.log("Resuming debugger: error during debugging loop: " + exc);
            this.resume(this.context);
        }

        if (FBTrace.DBG_UI_LOOP)
        {
            FBTrace.sysout("script.onStartDebugging exit context.stopped:" +
                this.context.stopped + " for context: " + this.context.getName());
        }
    },

    onStopDebugging: function()
    {
        //if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("script.onStopDebugging enter context: " + this.context.getName());

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
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("scriptPanel.onStopDebugging; EXCEPTION " + exc, exc);
        }
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