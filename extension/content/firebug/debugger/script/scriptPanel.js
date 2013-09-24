/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/array",
    "firebug/lib/css",
    "firebug/lib/url",
    "firebug/lib/domplate",
    "firebug/debugger/script/scriptView",
    "arch/compilationunit",
    "firebug/chrome/menu",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/script/sourceLink",
    "firebug/debugger/script/sourceFile",
    "firebug/debugger/breakpoints/breakpoint",
    "firebug/debugger/breakpoints/breakpointStore",
    "firebug/lib/persist",
    "firebug/debugger/breakpoints/breakpointConditionEditor",
    "firebug/lib/keywords",
    "firebug/lib/system",
    "firebug/editor/editor",
    "firebug/debugger/script/scriptPanelWarning",
    "firebug/debugger/script/breakNotification",
    "firebug/console/commandLine",
    "firebug/debugger/debuggerLib",
],
function (Obj, Locale, Events, Dom, Arr, Css, Url, Domplate, ScriptView, CompilationUnit, Menu,
    StackFrame, SourceLink, SourceFile, Breakpoint, BreakpointStore, Persist,
    BreakpointConditionEditor, Keywords, System, Editor, ScriptPanelWarning,
    BreakNotification, CommandLine, DebuggerLib) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, DIV} = Domplate;

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
    dispatchName: "ScriptPanel",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "script",
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

        // Create source view for JS source code. Initialization is made when the Script
        // panel is actually displayed (in 'show' method).
        this.scriptView = new ScriptView();
        this.scriptView.addListener(this);

        // The tool/controller (serves as a proxy to the back-end service) is registered dynamically.
        // Depending on the current tool the communication can be local or remote.
        // Access to the back-end debugger service (JSD2) must always be done through the tool.
        this.tool = this.context.getTool("debugger");
        this.tool.addListener(this);

        this.context.getTool("breakpoint").addListener(this);
    },

    destroy: function(state)
    {
        // We want the location (compilationUnit) to persist, not the selection (e.g. stackFrame).
        this.selection = null;

        Trace.sysout("scriptPanel.destroy; " + state.scrollTop + ", " + state.location, state);

        this.scriptView.removeListener(this);
        this.scriptView.destroy();

        this.tool.removeListener(this);

        this.context.getTool("breakpoint").removeListener(this);

        BasePanel.destroy.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Panel show/hide

    show: function(state)
    {
        var enabled = this.isEnabled();
        if (!enabled)
            return;

        var active = !ScriptPanelWarning.showWarning(this);

        Trace.sysout("scriptPanel.show; active: " + active + ", " + this.context.getName(), {
            location: state ? state.location : null,
            scrollTop: state ? state.scrollTop : null,
            topLine: state ? state.topLine : null,
        });

        // Initialize the source view.
        // xxxHonza: from some reason the script is not visible the first time
        // Firebug is opened if this is done in scriptPanel.initialize.
        // Do not initialize the script view if the panel is not active (e.g. the debugger
        // is stopped in another tab), it would be asynchronously displayed over the
        // displayed warning message.
        if (active)
            this.scriptView.initialize(this.panelNode);

        if (active && state && state.location)
        {
            // Create source link used to restore script view location. In this specific
            // case scroll (pixel) position is used ('scrollTop' option set), so the
            // location is accurate (not rounded to lines).
            var sourceLink = new SourceLink(state.location.getURL(), state.topLine, "js");
            sourceLink.options.scrollTop = state.scrollTop;

            // Causes the Script panel to show the proper location.
            // Do not highlight the line (second argument true), we just want
            // to restore the position.
            // Also do it asynchronously, the script doesn't have to be
            // available immediately.
            this.showSourceLinkAsync(sourceLink);

            // Do not restore the location again, it could happen during
            // the single stepping and overwrite the debugger location.
            delete state.location;
        }

        // These buttons are visible only, if debugger is enabled.
        this.showToolbarButtons("fbLocationSeparator", active);
        this.showToolbarButtons("fbDebuggerButtons", active);
        this.showToolbarButtons("fbLocationButtons", active);
        this.showToolbarButtons("fbScriptButtons", active);
        this.showToolbarButtons("fbStatusButtons", active);
        this.showToolbarButtons("fbLocationList", active);
        this.showToolbarButtons("fbToolbar", active);

        // Additional debugger panels are visible only, if debugger is active.
        this.panelSplitter.collapsed = !active;
        this.sidePanelDeck.collapsed = !active;

        this.syncCommands(this.context);
    },

    hide: function(state)
    {
        Trace.sysout("scriptPanel.hide: ", state);

        if (!state)
        {
            TraceError.sysout("scriptPanel.hide; ERROR null state?");
            return;
        }

        state.location = this.location;

        if (this.scriptView.initialized)
        {
            state.topLine = this.scriptView.getScrollTop();
            state.scrollTop = this.scriptView.getScrollInfo().top;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Show Stack Frames

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
        this.context.currentFrame = frame;

        Trace.sysout("scriptPanel.showStackFrame: " + frame, frame);

        if (this.context.breakingCause)
            this.context.breakingCause.lineNo = frame.getLineNumber();

        this.navigate(frame.toSourceLink());
    },

    showNoStackFrame: function()
    {
        this.removeDebugLocation();

        // Clear the stack on the panel toolbar
        var panelStatus = Firebug.chrome.getPanelStatusElements();
        panelStatus.clear();

        this.updateInfoTip();
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

    showSourceLink: function(sourceLink)
    {
        this.navigate(sourceLink);
    },

    showFunction: function(fn)
    {
        Trace.sysout("scriptPanel.showFunction; " + fn, fn);

        var sourceLink = SourceFile.findSourceForFunction(fn, this.context);
        if (sourceLink)
        {
            this.showSourceLink(sourceLink);
        }
        else
        {
            // Want to avoid the Script panel if possible
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("no sourcelink for function");
        }
    },

    /**
     * Some source files (compilation units) can be loaded asynchronously (e.g. when using
     * RequireJS). If this case happens, this method tries it again after a short timeout.
     *
     * @param {Object} sourceLink  Link to the script and line to be displayed.
     * @param {Boolean} noHighlight Do not highlight the line
     * @param {Number} counter  Number of async attempts.
     */
    showSourceLinkAsync: function(sourceLink, counter)
    {
        Trace.sysout("scriptPanel.showSourceLinkAsync; " + counter + ", " +
            sourceLink, sourceLink);

        var compilationUnit = this.context.getCompilationUnit(sourceLink.href);
        if (compilationUnit)
        {
            this.showSourceLink(sourceLink);
        }
        else
        {
            if (typeof(counter) == "undefined")
                counter = 15;

            // Stop trying. The target script is probably not going to appear. At least,
            // make sure default script (location) is displayed.
            if (counter <= 0)
            {
                if (!this.location)
                    this.navigate(null);
                return;
            }

            var self = this;
            this.context.setTimeout(function()
            {
                // If JS execution is stopped at a breakpoint, do not restore the previous
                // location. The user wants to see the breakpoint now.
                if (!self.context.stopped)
                    self.showSourceLinkAsync(sourceLink, --counter);
            }, 50);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Scrolling & Highlighting

    scrollToLine: function(lineNo, options)
    {
        this.scriptView.scrollToLine(lineNo, options);
    },

    removeDebugLocation: function()
    {
        this.scriptView.setDebugLocation(-1);
    },

    setDebugLocation: function(lineNo)
    {
        this.scriptView.setDebugLocation(lineNo);
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

    updateLocation: function(object)
    {
        Trace.sysout("scriptPanel.updateLocation; " + object, object);

        // Make sure the update panel's content. If there is currently a warning displayed
        // it might disappears since no longer valid (e.g. "Debugger is already active").
        if (ScriptPanelWarning.updateLocation(this))
            return;

        var sourceLink = object;

        if (object instanceof CompilationUnit)
            sourceLink = new SourceLink(object.getURL(), null, "js");

        if (sourceLink instanceof SourceLink)
            this.showSource(sourceLink);

        Events.dispatch(this.fbListeners, "onUpdateScriptLocation", [this, sourceLink]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getCurrentURL: function()
    {
        if (this.location instanceof CompilationUnit)
            return this.location.getURL();

        if (this.location instanceof SourceLink)
            return this.location.getURL();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends ActivablePanel

    onActivationChanged: function(enable)
    {
        // xxxHonza: needs to be revisited
        if (enable)
        {
            Firebug.Debugger.addObserver(this);
        }
        else
        {
            Firebug.Debugger.removeObserver(this);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breadcrumbs (object path)

    framesadded: function(stackTrace)
    {
        // Invoke breadcrumbs update.
        Firebug.chrome.syncStatusPath();
    },

    framescleared: function()
    {
        Firebug.chrome.syncStatusPath();
    },

    getObjectPath: function(frame)
    {
        Trace.sysout("scriptPanel.getObjectPath; frame " + frame, frame);

        if (this.context.currentTrace)
            return this.context.currentTrace.frames;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Source

    showSource: function(sourceLink)
    {
        Trace.sysout("scriptPanel.showSource; " + sourceLink, sourceLink);

        var compilationUnit = this.context.getCompilationUnit(sourceLink.href);
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
            // There could have been more asynchronous requests done at the same time
            // (e.g. show default script and restore the last visible script).
            // Use only the callback that corresponds to the current location URL.
            if (!self.location || self.location.getURL() != unit.getURL())
            {
                Trace.sysout("scriptPanel.showSource; Bail out, different location now");
                return;
            }

            Trace.sysout("scriptPanel.showSource; callback " + sourceLink, sourceLink);

            var type = Url.getFileExtension(sourceLink.href);
            self.scriptView.showSource(lines.join(""), type);

            var options = sourceLink.getOptions();

            // Make sure the current execution line is marked if the current frame
            // is coming from the current location.
            var frame = self.context.currentFrame;
            if (frame && frame.href == self.location.href && frame.line == self.location.line)
                options.debugLocation = true;

            // If the location object is SourceLink automatically scroll to the
            // specified line. Otherwise make sure to reset the scroll position
            // to the top since new script is probably just being displayed.
            if (self.location instanceof SourceLink)
                self.scrollToLine(self.location.line, options);
            else
                self.scrollToLine(0);
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
        Trace.sysout("scriptPanel.addBreakpoint;", bp);

        var url = this.getCurrentURL();
        BreakpointStore.addBreakpoint(url, bp.line, bp.condition);

        // Enable by default.
        if (bp.condition == null)
            BreakpointStore.enableBreakpoint(url, bp.line);
    },

    removeBreakpoint: function(bp)
    {
        Trace.sysout("scriptPanel.removeBreakpoint;", bp);

        // Remove the breakpoint from the client side store. Breakpoint store
        // will notify all listeners (all Script panel including this one)
        // about breakpoint removal and so, it can be removed from all contexts
        var url = this.getCurrentURL();
        BreakpointStore.removeBreakpoint(url, bp.line);
    },

    disableBreakpoint: function(lineIndex, event)
    {
        Trace.sysout("scriptPanel.disableBreakpoint; line: " + lineIndex, event);

        this.toggleDisableBreakpoint(lineIndex);

        Events.cancelEvent(event);
    },

    getBreakpoints: function(breakpoints)
    {
        var url = this.getCurrentURL();
        if (!url)
            return;

        // Get only standard breakpoints. Breakpoints for errors or monitors, etc.
        // Are not displayed in the breakpoint column.
        BreakpointStore.enumerateBreakpoints(url, function(bp)
        {
            // xxxHonza: perhaps we should pass only line numbers to the ScriptView?
            breakpoints.push(bp);
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Conditional Breakpoints

    startBreakpointConditionEditor: function(lineIndex, event)
    {
        Trace.sysout("scriptPanel.startBreakpointConditionEditor; line: " + lineIndex, event);

        this.initializeEditBreakpointCondition(lineIndex);

        Events.cancelEvent(event);
    },

    onEditorMouseUp: function(event)
    {
        Trace.sysout("scriptPanel.onEditorMouseUp;", event);

        // Click anywhere in the script panel closes breakpoint-condition-editor
        // if it's currently opened. It's valid to close the editor this way
        // and that's why the 'cancel' argument is set to false.
        if (this.editing)
            Editor.stopEditing(false);
    },

    initializeEditBreakpointCondition: function(lineNo)
    {
        Trace.sysout("scriptPanel.initializeEditBreakpointCondition; " + lineNo);

        var url = this.getCurrentURL();
        var editor = this.getEditor();

        // The breakpoint doesn't have to exist. The editor can be also opened
        // at line with no breakpoint. The breakpoint will be created eventually if the
        // user creates a condition.
        var bp = BreakpointStore.findBreakpoint(url, lineNo);
        if (bp)
        {
            // Reference to the edited breakpoint.
            editor.breakpoint = bp;

            // if there is alreay a bp, the line is executable, so we just need to
            // open the editor.
            this.openBreakpointConditionEditor(lineNo, bp.condition);
            return;
        }

        // xxxHonza: displaying BP conditions in the Watch panel is not supported yet.
        /*if (condition)
        {
            var watchPanel = this.context.getPanel("watches", true);
            watchPanel.removeWatch(condition);
            watchPanel.rebuild();
        }*/

        // Create helper object for remembering the line and URL. It's used when
        // the user right clicks on a line with no breakpoint and picks
        // Edit Breakpoint Condition. This should still work and the breakpoint
        // should be created automatically if the user provide a condition.
        var tempBp = {
            lineNo: lineNo,
            href: url,
            condition: "",
        };

        editor.breakpoint = tempBp;
        this.scriptView.initializeBreakpoint(lineNo, tempBp.condition);
    },

    openBreakpointConditionEditor: function(lineNo, condition, originalLineNo)
    {
        Trace.sysout("scriptPanel.openBreakpointConditionEditor; " + lineNo +
            ", condition: " + condition + ", original line: " + originalLineNo);

        var bp = BreakpointStore.findBreakpoint(this.getCurrentURL(), lineNo);
        var target = null;

        if (!bp)
        {
            // If a bp didn't exist at the line, loading icon is showing
            // and it needs to be removed.
            // The loading icon isn't shown if the user wanted to set a condition
            // on an existing bp (See initializeEditBreakpointCondition()).
            this.scriptView.removeBreakpoint({lineNo: lineNo});
        }
        else
        {
            // There is already a bp at the line, so get the element (target)
            // of bp icon. we should also verify if the bp is a conditional
            // bp, if so, load the expression into the editor.
            target = this.scriptView.getGutterMarkerTarget(lineNo);
            condition = bp.condition;
        }

        if (!target)
        {
            this.scriptView.addBreakpoint({lineNo: lineNo});
            target = this.scriptView.getGutterMarkerTarget(lineNo);
        }

        var conditionEditor = this.getEditor();
        conditionEditor.breakpoint.lineNo = lineNo;

        // As Editor scrolls(not panel itself) with long scripts, we need to set
        // scrollTop manually to show the editor properly(at the right y coord).
        // getScrollInfo() can return null if the underlying editor is not
        // initialized, but it should never happen at this moment.
        this.scrollTop = this.scriptView.getScrollInfo().top;

        Firebug.Editor.startEditing(target, condition, null, null, this);
    },

    onSetBreakpointCondition: function(bp, value, cancel)
    {
        Trace.sysout("scriptPanel.onSetBreakpointCondition; " + value + "cancel: " + cancel, bp);

        var availableBp = BreakpointStore.findBreakpoint(bp.href, bp.lineNo);

        if (!cancel)
        {
            if (!availableBp)
                this.addBreakpoint({line: bp.lineNo});

            value = value ? value : null;
            BreakpointStore.setBreakpointCondition(bp.href, bp.lineNo, value);
        }
        else
        {
            if (!availableBp)
                this.scriptView.removeBreakpoint({lineNo: bp.lineNo});
        }
    },

    getEditor: function(target, value)
    {
        if (!this.conditionEditor)
        {
            this.conditionEditor = new BreakpointConditionEditor(this.document);
            this.conditionEditor.callback = this.onSetBreakpointCondition.bind(this);
        }

        return this.conditionEditor;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // BreakpointTool Listener

    onBreakpointAdded: function(context, bp)
    {
        // The Script panel displays only standard (BP_NORMAL) breakpoints.
        if (!bp.isNormal())
            return;

        // The script panel is only interested in breakpoints coming from the same URL.
        var url = this.getCurrentURL();
        if (bp.href != url)
            return;

        Trace.sysout("scriptPanel.onBreakpointAdded; origin line: " +
            bp.params.originLineNo, bp);

        // Update the UI, remove the temporary(loading) bp icon.
        if (bp.params.originLineNo)
            this.scriptView.removeBreakpoint({lineNo: bp.params.originLineNo});
        else
            this.scriptView.removeBreakpoint({lineNo: bp.lineNo});

        // Now insert the breakpoint at the right location.
        this.scriptView.addBreakpoint(bp);

        // If BP condition is set, the breakpoint has been initialized by the condition
        // editor. Note that the editor can be opened even on line with no breakpoint
        // and is such case the bp is created after the condition is set.
        // The breakpoint has been already created on the server side at this point,
        // (its line location corrected), and we can now continue with the editor opening.
        if (bp.condition != null)
        {
            // Just open the condition editor at the corrected line.
            this.openBreakpointConditionEditor(bp.lineNo, bp.condition, bp.params.originLineNo);
        }
    },

    onBreakpointRemoved: function(context, bp)
    {
        // The script panel is only interested in breakpoints coming from the same URL.
        var url = this.getCurrentURL();
        if (bp.href != url)
            return;

        Trace.sysout("scriptPanel.onBreakpointRemoved;", bp);

        // Remove breakpoint from the UI.
        this.scriptView.removeBreakpoint(bp);
    },

    onBreakpointEnabled: function(context, bp, bpClient)
    {
        var url = this.getCurrentURL();
        if (bp.href == url)
            this.scriptView.updateBreakpoint(bp);
    },

    onBreakpointDisabled: function(context, bp, bpClient)
    {
        var url = this.getCurrentURL();
        if (bp.href == url)
            this.scriptView.updateBreakpoint(bp);
    },

    onBreakpointModified: function(context, bp)
    {
        var url = this.getCurrentURL();
        if (bp.href == url)
            this.scriptView.updateBreakpoint(bp);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    getOptionsMenuItems: function()
    {
        return [
            Menu.optionMenu("firebug.debugger.breakOnExceptions",
                "breakOnExceptions",
                "firebug.debugger.tip.breakOnExceptions"),
            Menu.optionMenu("firebug.breakpoint.showBreakNotifications",
                "showBreakNotification",
                "firebug.breakpoint.tip.Show_Break_Notifications")
        ];
    },

    updateOption: function(name, value)
    {
        if (name == "breakOnExceptions")
            this.tool.breakOnExceptions(value);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    onContextMenu: function(event, items)
    {
        var target = event.target;
        var menuItems = this.getContextMenuItems(null, target);
        items.push.apply(items, menuItems);
    },

    getContextMenuItems: function(object, target)
    {
        var items = [];

        // The target must be within the right DIV (CodeMirror).
        // This could be changed if we decide to have a context menu displayed for
        // right-click on a breakpoint (in the column bar) instead of the condition-editor.
        // See issue 4378
        var content = Dom.getAncestorByClass(target, "CodeMirror");
        if (!content)
            return;

        var lineNo = this.scriptView.getLineIndex(target);
        var text = this.scriptView.getSelectedText();
        if (text.toString())
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

        var hasBreakpoint = BreakpointStore.hasBreakpoint(this.getCurrentURL(), lineNo);
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
            var isDisabled = BreakpointStore.isBreakpointDisabled(this.getCurrentURL(), lineNo);
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
            var debuggr = this;
            items.push(
                "-",
                // xxxHonza: TODO
                /*{
                    label: "script.Rerun",
                    tooltiptext: "script.tip.Rerun",
                    id: "contextMenuRerun",
                    command: Obj.bindFixed(debuggr.rerun, debuggr, this.context),
                    acceltext: "Shift+F8"
                },*/
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
                }
                //xxxHonza: TODO
                /*{
                    label: "firebug.RunUntil",
                    tooltiptext: "script.tip.Run_Until",
                    id: "contextMenuRunUntil",
                    command: Obj.bindFixed(debuggr.runUntil, debuggr, this.context,
                        compilationUnit, lineNo)
                }*/
            )
        }

        return items;
    },

    closePopupMenu: function()
    {
        var popupMenu = document.getElementById("fbScriptViewPopup");
        if (popupMenu.state === "open")
            popupMenu.hidePopup();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu Commands

    copySource: function()
    {
        var text = this.scriptView.getSelectedText();
        System.copyToClipboard(text);
    },

    addSelectionWatch: function()
    {
        var watchPanel = this.context.getPanel("watches", true);
        if (!watchPanel)
            return;

        var text = this.scriptView.getSelectedText();
        watchPanel.addWatch(text);
    },

    toggleBreakpoint: function(line)
    {
        Trace.sysout("scriptPanel.toggleBreakpoint; " + line);

        var hasBreakpoint = BreakpointStore.hasBreakpoint(this.getCurrentURL(), line);
        if (hasBreakpoint)
            BreakpointStore.removeBreakpoint(this.getCurrentURL(), line);
        else
            this.scriptView.initializeBreakpoint(line);
    },

    toggleDisableBreakpoint: function(line)
    {
        var currentUrl = this.getCurrentURL();
        // create breakpoint if it doesn't exist
        var hasBreakpoint = BreakpointStore.hasBreakpoint(currentUrl, line);
        if (!hasBreakpoint)
            BreakpointStore.addBreakpoint(currentUrl, line);

        var isDisabled = BreakpointStore.isBreakpointDisabled(currentUrl, line);
        if (isDisabled)
            BreakpointStore.enableBreakpoint(currentUrl, line);
        else
            BreakpointStore.disableBreakpoint(currentUrl, line);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // BON

    supportsBreakOnNext: function()
    {
        // xxxHonza: jsDebuggerOn is an artifact from JSD1. Do we need a replacement for JSD2?
        return this.breakable/* && Firebug.jsDebuggerOn;*/
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
        Trace.sysout("scriptPanel.syncCommands; stopped: " + context.stopped +
            ", " + context.getName());

        var chrome = Firebug.chrome;
        if (!chrome)
        {
            TraceError.sysout("scriptPanel.syncCommand, context with no chrome: " +
                context.getCurrentGlobal());

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
    // DebuggerTool Listener

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
            Firebug.chrome.select(this.context.currentFrame, "script", null, true);
            Firebug.chrome.syncPanel("script");  // issue 3463 and 4213
            Firebug.chrome.focus();
            //this.updateSelection(this.context.currentFrame);

            // Display break notification box.
            BreakNotification.show(this.context, this.panelNode, packet.why.type);
        }
        catch (exc)
        {
            TraceError.sysout("Resuming debugger: ERROR during debugging loop: " + exc, exc);
            Firebug.Console.log("Resuming debugger: ERROR during debugging loop: " + exc);

            this.resume(this.context);
        }
    },

    onStopDebugging: function(context)
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

            // Make sure the break notification box is hidden when debugger resumes.
            BreakNotification.hide(this.context);
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
        //self.tool.setBreakpoints(bps, function(response){});
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
        if (Css.hasClass(target, "breakpoint condition"))
            return this.populateBreakpointInfoTip(infoTip, target);

        // The source script must be within proper content.
        var viewContent = Dom.getAncestorByClass(target, "CodeMirror");
        if (!viewContent)
            return;

        // See http://code.google.com/p/fbug/issues/detail?id=889
        // Idea from: Jonathan Zarate's rikaichan extension (http://www.polarcloud.com/rikaichan/)
        if (!rangeParent)
            return false;

        rangeOffset = rangeOffset || 0;
        var expr = getExpressionAt(rangeParent.data, rangeOffset);
        if (!expr || !expr.expr)
            return false;

        if (expr.expr == this.infoTipExpr)
            return true;
        else
            return this.populateInfoTip(infoTip, expr.expr);
    },

    populateInfoTip: function(infoTip, expr)
    {
        if (!expr || Keywords.isJavaScriptKeyword(expr))
            return false;

        // Tooltips for variables in the script source are only displayed if the
        // script execution is halted (i.e. there is a current frame).
        var frame = this.context.currentFrame;
        if (!frame)
            return false;

        var self = this;

        // If the evaluate fails, then we report an error and don't show the infotip
        CommandLine.evaluate(expr, this.context, null, this.context.getCurrentGlobal(),
            function success(result, context)
            {
                var rep = Firebug.getRep(result, context);
                var tag = rep.shortTag ? rep.shortTag : rep.tag;

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
                Trace.sysout("scriptPanel.populateInfoTip; ERROR " + result, result);

                self.infoTipExpr = "";
            }
        );

        return (this.infoTipExpr == expr);
    },

    populateBreakpointInfoTip: function(infoTip, target)
    {
        var lineNo = this.scriptView.getLineIndex(target);
        var bp = BreakpointStore.findBreakpoint(this.getCurrentURL(), lineNo);
        if (!bp)
            return false;

        var expr = bp.condition;
        if (!expr)
            return false;

        if (expr == this.infoTipExpr)
            return true;

        BreakpointInfoTip.render(infoTip, expr);

        this.infoTipExpr = expr;

        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Executable Lines

    onViewportChange: function(from, to)
    {
        // Run executable-line decorating on 150ms timeout, which is bigger than
        // the period in which scroll events are fired. So, if the user is moving
        // scroll-bar thumb (or quickly clicking on scroll-arrows), the line numbers
        // are not decorated and the scrolling is fast.
        // All this optimalization due to peformance penalities when computing exe lines.
        if (this.context.markExeLinesTimeout)
            this.context.clearTimeout(this.context.markExeLinesTimeout);

        this.context.markExeLinesTimeout = this.context.setTimeout(
            this.markExecutableLines.bind(this, from, to), 150);
    },

    markExecutableLines: function(from, to)
    {
        var self = this;
        var currentLine = from;
        var editor = this.scriptView.editor.editorObject;

        // Iterate over all visible lines.
        editor.eachLine(from, to, function(handle)
        {
            currentLine++;

            // Bail out if the exe-flag for this line has been already computed.
            if (typeof(handle.executableLine) != "undefined")
                return;

            // Check if the line is executable (performance expensive operation).
            handle.executableLine = DebuggerLib.isExecutableLine(self.context, {
                url: self.getCurrentURL(),
                line: currentLine,
            });

            // Mark the line as executable.
            if (handle.executableLine)
                editor.addLineClass(handle, "executable", "CodeMirror-executableLine");
        });
    },
});

// ********************************************************************************************* //
// Breakpoint InfoTip Template

var BreakpointInfoTip = domplate(Firebug.Rep,
{
    tag:
        DIV("$expr"),

    render: function(parentNode, expr)
    {
        this.tag.replace({expr: expr}, parentNode, this);
    }
});

// ********************************************************************************************* //

const reWord = /([A-Za-z_$0-9]+)(\.([A-Za-z_$0-9]+)|\[([A-Za-z_$0-9]+|["'].+?["'])\])*/;

function getExpressionAt(text, charOffset)
{
    var offset = 0;
    for (var m = reWord.exec(text); m; m = reWord.exec(text.substr(offset)))
    {
        var word = m[0];
        var wordOffset = offset+m.index;
        if (charOffset >= wordOffset && charOffset <= wordOffset+word.length)
        {
            var innerOffset = charOffset-wordOffset;
            m = word.substr(innerOffset+1).match(/\.|\]|\[|$/);
            var end = m.index + innerOffset + 1, start = 0;

            var openBr = word.lastIndexOf('[', innerOffset);
            var closeBr = word.lastIndexOf(']', innerOffset);

            if (openBr == innerOffset)
                end++;
            else if (closeBr < openBr)
            {
                if (/['"\d]/.test(word[openBr+1]))
                    end++;
                else
                    start = openBr + 1;
            }

            word = word.substring(start, end);

            if (/^\d+$/.test(word) && word[0] != '0')
                word = '';

            return {expr: word, offset: wordOffset-start};
        }
        offset = wordOffset+word.length;
    }

    return {expr: null, offset: -1};
};

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(ScriptPanel);
Firebug.registerTracePrefix("scriptPanel.", "DBG_SCRIPTPANEL", false);

return ScriptPanel;

// ********************************************************************************************* //
});
