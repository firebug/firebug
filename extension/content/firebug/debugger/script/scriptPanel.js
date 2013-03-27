/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/array",
    "firebug/lib/css",
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
],
function (Obj, Locale, Events, Dom, Arr, Css, Domplate, ScriptView, CompilationUnit, Menu,
    StackFrame, SourceLink, SourceFile, Breakpoint, BreakpointStore, Persist,
    BreakpointConditionEditor, Keywords, System, Editor) {

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
        // We want the location (compilationUnit) to persist, not the selection (eg stackFrame).
        delete this.selection;

        // Remember data for Script panel restore.
        state.location = this.location;
        state.scrollTop = this.scriptView.getScrollTop();

        Trace.sysout("scriptPanel.destroy; " + state.scrollTop + ", " + state.location, state);

        this.scriptView.removeListener(this);
        this.scriptView.destroy();

        BreakpointStore.removeListener(this);

        this.tool.removeListener(this);

        BasePanel.destroy.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Panel show/hide

    show: function(state)
    {
        var enabled = this.isEnabled();
        if (!enabled)
            return;

        Trace.sysout("scriptPanel.show;", state);

        // Initialize the source view. Orion initialization here, when the
        // parentNode is actualy visible, solves the following problem:
        // Error: TypeError: this._iframe.contentWindow is undefined
        // Save for muliple calls.
        this.scriptView.initialize(this.panelNode);

        if (state && state.location)
        {
            // Create source link used to restore script view location. Specified source line
            // should be displayed at the top (as the first line).
            var sourceLink = new SourceLink(state.location.getURL(), state.scrollTop, "js");
            sourceLink.options.scrollTo = "top";

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
        Trace.sysout("scriptPanel.hide: ", state);

        state.location = this.location;
        state.scrollTop = this.scriptView.getScrollTop();
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
            this.context.breakingCause.lineNo = lineNo;

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
            if (counter < 0)
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
        this.scriptView.scrollToLineAsync(lineNo, options);
    },

    removeDebugLocation: function()
    {
        this.scriptView.setDebugLocationAsync(-1);
    },

    setDebugLocation: function(line)
    {
        this.scriptView.setDebugLocationAsync(line - 1);
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

    setBreakpoint: function(url, lineNo)
    {
        Trace.sysout("scriptPanel.setBreakpoint; " + url + " (" + lineNo + ")");

        var bp = BreakpointStore.findBreakpoint(url, lineNo);

        // Bail out if a (normal) breakpoint is already there.
        if (bp && bp.isNormal())
        {
            Trace.sysout("scriptPanel.setBreakpoint; ERROR breakpoint already exists", bp);
            return;
        }

        // Persist the breakpoint on the client side.
        BreakpointStore.addBreakpoint(url, lineNo);
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
            // There could have been more asynchronouse requests done at the same time
            // (e.g. show default script and restore the last visible script).
            // Use only the callback that corresponds to the current location URL.
            if (!self.location || self.location.getURL() != unit.getURL())
            {
                Trace.sysout("scriptPanel.showSource; Bail out, different location now");
                return;
            }

            Trace.sysout("scriptPanel.showSource; callback " + sourceLink, sourceLink);

            self.scriptView.showSource(lines.join(""));

            var options = sourceLink.getOptions();

            // Make sure the current execution line is marked if the current frame
            // is coming from the current location.
            var frame = self.context.currentFrame;
            if (frame && frame.href == self.location.href && frame.line == self.location.line)
                options.debugLocation = true;

            // If the location object is SourceLink automatically scroll to the
            // specified line.
            if (self.location && self.location.line)
                self.scrollToLine(self.location.line, options);
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

        var self = this;
        function doSetBreakpoint(response, bpClient)
        {
            Trace.sysout("scriptPanel.addBreakpoint; doSetBreakpoint", arguments);

            var actualLocation = response.actualLocation;

            // Remove temporary breakpoint(loading icon), is waiting for the response.
            self.scriptView.removeBreakpoint(bp);

            // The breakpoint is set on the server side even if the script doesn't
            // exist yet i.e. error == 'noScript' so, doesn't count this case as
            // an error.
            if (response.error && response.error != "noScript")
            {
                TraceError.sysout("scriptPanel.addBreakpoint; ERROR " + response,
                    {response: response, bpClient: bpClient});
                return;
            }

            // If the line that a breakpoint is set, isn't executable.
            if (actualLocation && actualLocation.line != (bp.lineNo + 1))
            {
                bp.lineNo = actualLocation.line - 1;
                // If the user sets a breakpoint via popup menu.
                self.closePopupMenu();
                // Scroll to actual line.
                self.scrollToLine(bp.lineNo);
            }

            if (bp.condition != null)
            {
                var existedBp = BreakpointStore.findBreakpoint(bp.href, bp.lineNo);
                if (existedBp)
                    bp.condition = existedBp.condition;
                self.startEditingConditionAsyn(bp.lineNo, bp.condition);
            }
            else
            {
                self.setBreakpoint(self.location.href, bp.lineNo);
            }

            // Cache the breakpoint-client object since it has API for removing itself.
            // (removal happens in the Script panel when the user clicks a breakpoint
            // in the breakpoint column).

            //xxxHonza: this must be context dependent. We need a list of Breakpoint
            // instances stored in the context pointing to the right BreakpointClient object.
            // This should be probably done in DebuggerTool
            //bp.params.client = bpClient;

            if (FBTrace.DBG_BP)
                FBTrace.sysout("scriptPanel.addBreakpoint; breakpoint added", bpClient);
        }

        this.tool.setBreakpoint(this.context, this.location.href, bp.lineNo, doSetBreakpoint);
    },

    removeBreakpoint: function(bp)
    {
        var url = this.getCurrentURL();

        bp = BreakpointStore.findBreakpoint(url, bp.line);
        if (!bp)
        {
            TraceError.sysout("scriptPanel.removeBreakpoint; ERROR doesn't exist!");
            return;
        }

        // Remove the breakpoint from the client side store. Breakpoint store
        // will notify all listeners (all Script panel including this one)
        // about breakpoint removal and so, it can be removed from all contexts
        BreakpointStore.removeBreakpoint(url, bp.lineNo);
    },

    getBreakpoints: function(breakpoints)
    {
        var url = this.getCurrentURL();
        if (!url)
            return;

        var bps = BreakpointStore.getBreakpoints(url);
        if (!bps || !bps.length)
            return;

        breakpoints.push.apply(breakpoints, bps);
    },

    openBreakpointConditionEditor: function(lineIndex, event)
    {
        Trace.sysout("scriptPanel.openBreakpointConditionEditor; Line: " + lineIndex);

        this.editBreakpointCondition(lineIndex);
        Events.cancelEvent(event);
    },

    onEditorMouseUp: function(event)
    {
        // Click anywhere in the script panel closes breakpoint-condition-editor
        // if it's currently opened. It's valid to close the editor this way
        // and that's why the 'cancel' argument is set to false.
        if (this.editing)
            Editor.stopEditing(false);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Conditional Breakpoints

    editBreakpointCondition: function(lineNo)
    {
        // Create helper object for remembering the line and URL. It's used when
        // the user right clicks on a line with no breakpoint and picks
        // Edit Breakpoint Condition. This should still work and the breakpoint
        // should be created automatically if the user provide a condition.
        var tempBp = {
            lineNo: lineNo,
            href: this.getCurrentURL(),
            condition: "",
        };

        // The breakpoint doesn't have to exist.
        var bp = BreakpointStore.findBreakpoint(this.getCurrentURL(), lineNo);
        var condition = bp ? bp.condition : tempBp.condition;

        // xxxHonza: displaying BP conditions in the Watch panel is not supported yet.
        /*if (condition)
        {
            var watchPanel = this.context.getPanel("watches", true);
            watchPanel.removeWatch(condition);
            watchPanel.rebuild();
        }*/

        // Reference to the edited breakpoint.
        var editor = this.getEditor();
        editor.breakpoint = bp ? bp : tempBp;
        this.scriptView.initializeBreakpoint(lineNo, condition);
    },

    startEditingCondition: function(lineNo, condition)
    {
        var target = this.scriptView.getAnnotationTarget(lineNo);
        if (!target)
            return;

        var conditionEditor = this.getEditor();
        conditionEditor.breakpoint.lineNo = lineNo;

        Firebug.Editor.startEditing(target, condition, null, null, this);
    },

    startEditingConditionAsyn: function(lineNo, condition)
    {
        // This should be called with a delay to sure some
        // async operations like scrollToLine is done.
        var self = this;
        setTimeout(function()
        {
            self.startEditingCondition(lineNo, condition);
        }, 200);
    },

    onSetBreakpointCondition: function(bp, value, cancel)
    {
        Trace.sysout("scriptPanel.onSetBreakpointCondition; " + value, bp);

        var availableBp = BreakpointStore.findBreakpoint(bp.href, bp.lineNo);
        if (!cancel)
        {
            if (!availableBp)
                this.setBreakpoint(bp.href, bp.lineNo);

            value = value ? value : null;
            BreakpointStore.setBreakpointCondition(bp.href, bp.lineNo, value);
        }
        else
        {
            if (!availableBp)
            {
                function removeCallback(response)
                {
                    Trace.sysout("scriptPanel.onSetBreakpointCondition; "+
                        "Response received:", response);
                }

                this.tool.removeBreakpoint(this.context, bp.href, bp.lineNo,
                    removeCallback);
            }
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
    // BreakpointStore Listener

    onBreakpointAdded: function(bp)
    {
        Trace.sysout("scriptPanel.onBreakpointAdded;", bp);

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

        // xxxHonza: if the breakpoint is added while the Script panel is not the selected
        // panel there is an exception coming from Orion:
        // "TypeError: sel is null" {file: "chrome://browser/content/orion.js" line: 8581}]
        // It causes the script-view to be broken and so, we need to reset it at the time
        // when it's selected again.
        if (!this.visible)
            this.scriptView.forceRefresh = true;
        else
            this.scriptView.removeBreakpoint(bp);
    },

    onBreakpointEnabled: function(bp)
    {
        this.tool.enableBreakpoint(this.context, bp.href, bp.lineNo, function()
        {
        });

        // Remove breakpoint from the UI.
        // xxxHonza: should be async
        this.scriptView.updateBreakpoint(bp);
    },

    onBreakpointDisabled: function(bp)
    {
        this.tool.disableBreakpoint(this.context, bp.href, bp.lineNo, function()
        {
        });

        // Remove breakpoint from the UI.
        // xxxHonza: should be async
        this.scriptView.updateBreakpoint(bp);
    },

    onBreakpointModified: function(bp)
    {
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
            this.tool.breakOnExceptions(this.context, value);
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

        // The target must be within viewConent DIV (Orion).
        // This could be changed if we decide to have a context menu displayed for
        // right-click on a breakpoint (in the column bar) instead of the condition-editor.
        // See issue 4378
        var viewContent = Dom.getAncestorByClass(target, "viewContent");
        if (!viewContent)
            return items;

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
        var isDisabled = BreakpointStore.isBreakpointDisabled(this.getCurrentURL(), line);
        if (isDisabled)
            BreakpointStore.enableBreakpoint(this.getCurrentURL(), line);
        else
            BreakpointStore.disableBreakpoint(this.getCurrentURL(), line);
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
            Firebug.chrome.select(this.context.currentFrame, "script", null, true);
            Firebug.chrome.syncPanel("script");  // issue 3463 and 4213
            Firebug.chrome.focus();
            //this.updateSelection(this.context.currentFrame);
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
        Trace.sysout("scriptPanel.onStopDebugging; " + this.context.getName(), packet);

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
        if (Css.hasClass(target, "breakpoint"))
            return this.populateBreakpointInfoTip(infoTip, target);

        // The source script must be within viewConent DIV (Orion).
        var viewContent = Dom.getAncestorByClass(target, "viewContent");
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

        //xxxHonza: expression evaluation is not finished.
        return false;

        var self = this;
        this.tool.eval(this.context, null, expr, function (context, event, packet)
        {
            var result = packet.why.frameFinished["return"];
            self.onPopulateInfoTip(infoTip, result);
        });

        // The result will be fetched asynchronously so, the tooltip should
        // display a throbber or something...
        return true;
    },

    onPopulateInfoTip: function(infoTip, result)
    {
        var gripObj = this.context.clientCache.getObject(result);
        gripObj.getProperties().then(function(props)
        {
            var value = gripObj.getValue();

            var rep = Firebug.getRep(value, context);
            var tag = rep.shortTag ? rep.shortTag : rep.tag;

            tag.replace({object: value}, infoTip);
        });
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
});

// ********************************************************************************************* //
// Breakpoint InfoTip Template

with (Domplate) {
var BreakpointInfoTip = domplate(Firebug.Rep,
{
    tag:
        DIV("$expr"),

    render: function(parentNode, expr)
    {
        this.tag.replace({expr: expr}, parentNode, this);
    }
})};

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