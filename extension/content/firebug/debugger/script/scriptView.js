/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/events",
    "firebug/lib/options",
    "firebug/chrome/eventSource",
    "firebug/chrome/menu",
    "firebug/chrome/infotip",
    "firebug/chrome/firefox",
    "firebug/editor/sourceEditor",
],
function(FBTrace, Obj, Dom, Css, Events, Options, EventSource, Menu, InfoTip, Firefox,
    SourceEditor) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var Trace = FBTrace.to("DBG_SCRIPTVIEW");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Source View

function ScriptView()
{
    this.editor = null;
    this.skipEditorBreakpointChange = false;
}

/**
 * ScriptView wraps SourceEditor component that is built on top of CodeMirror editor.
 * This object is responsible for displaying JS source code in the debugger panel.
 */
ScriptView.prototype = Obj.extend(new EventSource(),
/** @lends ScriptView */
{
    dispatchName: "ScriptView",
    initialized: false,
    initializeExecuted: false,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(parentNode)
    {
        if (this.initializeExecuted)
        {
            //this.showSource();
            return;
        }

        this.initializeExecuted = true;

        //xxxHonza: do we need this? this.onContextMenuListener = this.onContextMenu.bind(this);
        this.onBreakpointChangeListener = this.onBreakpointChange.bind(this);
        this.onMouseMoveListener = this.onMouseMove.bind(this);
        this.onMouseOutListener = this.onMouseOut.bind(this);
        this.onGutterClickListener = this.onGutterClick.bind(this);
        this.onMouseUpListener = this.onEditorMouseUp.bind(this);
        this.onKeyDownListener = this.onKeyDown.bind(this);
        this.onViewportChangeListener = this.onViewportChange.bind(this);

        // Initialize source editor.
        this.editor = new SourceEditor();
        this.editor.init(parentNode, SourceEditor.ReadOnlyConfig, this.onEditorLoad.bind(this));

        Trace.sysout("scriptView.initialize; " + parentNode);
    },

    onEditorLoad: function()
    {
        Trace.sysout("scriptView.onEditorLoad;", this.defaultSource);

        this.initialized = true;

        // Add editor listeners
        this.editor.addEventListener(SourceEditor.Events.contextMenu,
            this.onContextMenuListener);
        this.editor.addEventListener(SourceEditor.Events.breakpointChange,
            this.onBreakpointChangeListener);
        this.editor.addEventListener(SourceEditor.Events.mouseMove,
            this.onMouseMoveListener);
        this.editor.addEventListener(SourceEditor.Events.mouseOut,
            this.onMouseOutListener);
        this.editor.addEventListener(SourceEditor.Events.keyDown,
            this.onKeyDownListener);

        // Hook gutter clicks
        this.editor.addEventListener(SourceEditor.Events.gutterClick,
            this.onGutterClickListener);

        // Hook view body mouse up (for breakpoint condition editor).
        this.editor.addEventListener(SourceEditor.Events.mouseUp,
            this.onMouseUpListener);

        // Hook scrolling (viewport change).
        this.editor.addEventListener(SourceEditor.Events.viewportChange,
            this.onViewportChangeListener);

        // Focus so, keyboard works as expected.
        this.editor.focus();

        if (this.defaultSource)
            this.showSource(this.defaultSource.source, this.defaultSource.type);

        if (this.defaultLine > 0)
            this.scrollToLine(this.defaultLine, this.defaultOptions);

        this.initBreakpoints();
    },

    destroy: function()
    {
        Trace.sysout("scriptView.destroy; " + this.initialized);

        if (!this.initialized)
            return;

        this.editor.removeEventListener(SourceEditor.Events.contextMenu,
            this.onContextMenuListener);
        this.editor.removeEventListener(SourceEditor.Events.breakpointChange,
            this.onBreakpointChangeListener);
        this.editor.removeEventListener(SourceEditor.Events.mouseMove,
            this.onMouseMoveListener);
        this.editor.removeEventListener(SourceEditor.Events.mouseOut,
            this.onMouseOutListener);
        this.editor.removeEventListener(SourceEditor.Events.keyDown,
            this.onKeyDownListener);
        this.editor.removeEventListener(SourceEditor.Events.gutterClick,
            this.onGutterClickListener);
        this.editor.removeEventListener(SourceEditor.Events.mouseUp,
            this.onMouseUpListener);
        this.editor.removeEventListener(SourceEditor.Events.viewportChange,
            this.onViewportChangeListener);

        try
        {
            this.editor.destroy();
        }
        catch (e)
        {
            TraceError.sysout("scriptView.destroy; EXCEPTION " + e, e);
        }

        this.initialized = false;
        this.initializeExecuted = false;
        this.editor = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public API

    showSource: function(source, type)
    {
        if (!this.initialized)
        {
            this.defaultSource = {source: source, type: type};
            Trace.sysout("scriptView.showSource; not initialized");
            return;
        }

        var text = this.editor.getText();
        if (text == source && !this.forceRefresh)
            return;

        Trace.sysout("scriptView.showSource; ", {
            equal: (source == text),
            source: source,
            text: text,
            type: type
        });

        this.editor.setText(source, type);

        // Breakpoints and annotations in general must be set again after setText.
        this.initBreakpoints();

        this.forceRefresh = false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    onContextMenu: function(event)
    {
        Trace.sysout("scripView.onContextMenu;", event);

        var popup = document.getElementById("fbScriptViewPopup");
        Dom.eraseNode(popup);

        var browserWindow = Firebug.chrome.window;
        var commandDispatcher = browserWindow.document.commandDispatcher;

        var items = [];
        this.dispatch("onEditorContextMenu", [event, items]);

        for (var i=0; i<items.length; i++)
            Menu.createMenuItem(popup, items[i]);

        if (!popup.childNodes.length)
            return;

        popup.openPopupAtScreen(event.screenX, event.screenY, true);
    },

    getContextMenuInfo: function()
    {
        return this.editor.getContextMenuInfo();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Search

    search: function(text, options)
    {
        return this.editor.search(text, options);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

    initBreakpoints: function()
    {
        this.removeAllBreakpoints();

        var bps = [];
        this.dispatch("getBreakpoints", [bps]);

        Trace.sysout("scriptView.initBreakpoints; " + bps.length, bps);

        for (var i = 0; i < bps.length; i++)
        {
            var bp = bps[i];
            this.addBreakpoint(bp);
        }
    },

    onBreakpointChange: function(event)
    {
        if (this.skipEditorBreakpointChange)
            return;

        event.added.forEach(function(bp) {
            this.dispatch("addBreakpoint", [bp]);
        }, this);

        event.removed.forEach(function(bp) {
            this.dispatch("removeBreakpoint", [bp]);
        }, this);
    },

    safeSkipEditorBreakpointChange: function(callback)
    {
        try
        {
            // Ignore events about breakpoint changes.
            this.skipEditorBreakpointChange = true;

            // Modify editor breakpoints.
            callback();
        }
        catch (e)
        {
            TraceError.sysout("scriptView.safeSkipEditorBreakpointChange; EXCEPTION " + e, e);
        }
        finally
        {
            this.skipEditorBreakpointChange = false;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoint API

    removeBreakpoint: function(bp)
    {
        if (!this.editor)
            return;

        var self = this;
        this.safeSkipEditorBreakpointChange(function()
        {
            self.editor.removeBreakpoint(bp.lineNo);
        });
    },

    addBreakpoint: function(bp)
    {
        if (!this.editor)
            return;

        var self = this;
        this.safeSkipEditorBreakpointChange(function()
        {
            self.editor.addBreakpoint(bp.lineNo);

            // Make sure to update the icon if breakpoint is disabled.
            self.updateBreakpoint(bp);
        });
    },

    toggleBreakpoint: function(lineIndex)
    {
        var marker = this.editor.getGutterMarker(SourceEditor.Gutters.breakpoints, lineIndex);

        if (marker)
        {
            this.editor.removeBreakpoint(lineIndex);
        }
        else
        {
            this.initializeBreakpoint(lineIndex);
        }
    },

    initializeBreakpoint: function(lineIndex, condition)
    {
        Trace.sysout("scriptView.initializeBreakpoint; " + lineIndex + ", condition: " +
            condition);

        var bpWaiting = this.editor.getGutterElement().ownerDocument.createElement("div");
        bpWaiting.className = "breakpointLoading";

        this.editor.setGutterMarker(SourceEditor.Gutters.breakpoints,
            lineIndex, bpWaiting);

        // Simulate editor event sent when the user creates a breakpoint by
        // clicking on the breakpoint ruler.
        this.onBreakpointChange({
            added: [{ line: lineIndex, condition: condition}],
            removed: []
        });
    },

    updateBreakpoint: function(bp)
    {
        var lineCount = this.editor.getLineCount();

        if (bp.lineNo >= lineCount)
        {
            Trace.sysout("scriptView.updateBreakpoint; script not ready for a breakpoint.");
            return;
        }

        var bpMarker = this.editor.getGutterMarker(SourceEditor.Gutters.breakpoints,
            bp.lineNo);

        if (!bpMarker)
        {
            TraceError.sysout("scriptView.updateBreakpoint; ERROR bpMarker is null! " +
                "Line count: " + lineCount, bp);
            return;
        }

        Trace.sysout("scriptView.updateBreakpoint; (line: " + bp.lineNo + ") disabled: " +
            bp.disabled + ", condition: " + bp.condition + ", prev className: " +
            bpMarker.className + ", line count: " + lineCount, bp);

        bpMarker.className = "breakpoint";

        if (bp.disabled)
            bpMarker.className += " disabled";

        if (bp.condition)
            bpMarker.className += " condition";
    },

    removeAllBreakpoints: function()
    {
        Trace.sysout("scriptView.removeAllBreakpoints;");

        if (this.editor)
            this.editor.removeAllBreakpoints();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Content Scroll

    getScrollTop: function()
    {
        if (!this.initialized)
            return 0;

        return this.editor.getTopIndex() + 1;
    },

    scrollToLine: function(line, options)
    {
        if (!this.initialized)
            return;

        options = options || {};

        // Convert to index based.
        line = line - 1;

        this.editor.scrollToLine(line, options);

        Trace.sysout("scriptView.scrollToLine; " + line, options);

        if (options.debugLocation)
            this.editor.setDebugLocation(line);
        else if (options.highlight)
            this.highlightLine(line);
    },

    getScrollInfo: function()
    {
        if (!this.initialized)
            return;

        return this.editor.getScrollInfo();
    },

    highlightLine: function(lineIndex)
    {
        Trace.sysout("scriptView.highlightLine; " + lineIndex);

        if (this.initialized)
            this.editor.highlightLine(lineIndex);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debug Location

    setDebugLocation: function(line, noScroll)
    {
        if (!this.initialized)
            return;

        if (this.editor)
            this.editor.setDebugLocation(line);

        // If the debug location is being removed (line == -1) or |noScroll|
        // is explicitly set do not scroll.
        if (line > 0 && !noScroll)
            this.scrollToLine(line);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Editor Enhancements

    onGutterClick: function(event)
    {
        var e = event.rawEvent;

        if (event.lineNo != null)
        {
            // Right click on the breakpoint column opens the breakpoint condition editor.
            // Shift + left clicking disables/enables the breakpoint.
            // Simple clicking adds or removes the breakpoint.
            if (Events.isRightClick(e))
                this.dispatch("startBreakpointConditionEditor", [event.lineNo, e]);
            else if (Events.isShiftClick(e))
                this.dispatch("disableBreakpoint", [event.lineNo, e]);
            else
                this.dispatch("toggleBreakpoint", [event.lineNo, e]);
        }
    },

    onEditorMouseUp: function(event)
    {
        Trace.sysout("scripView.onEditorMouseUp;", event);

        this.dispatch("onEditorMouseUp", [event]);
    },

    onKeyDown: function(event)
    {
        Trace.sysout("scripView.onKeyDown;", event);

        this.dispatch("onEditorKeyDown", [event]);
    },

    onViewportChange: function(event)
    {
        Trace.sysout("scripView.onViewportChange; " + event.from + " -> " + event.to);

        this.dispatch("onViewportChange", [event.from, event.to]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // InfoTip

    onMouseMove: function(event)
    {
        var browser = Firefox.getCurrentBrowser();
        InfoTip.onMouseMove(event, browser);
    },

    onMouseOut: function(event)
    {
        var browser = Firefox.getCurrentBrowser();
        InfoTip.onMouseOut(event, browser);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Annotations

    /**
     * Returns related annotation target (an element) associated with the given line.
     * @param {Object} line Given line number. Line numbers are zero-based.
     */
    getGutterMarkerTarget: function(line, gutter)
    {
        gutter = gutter || SourceEditor.Gutters.breakpoints;

        var marker = this.editor.getGutterMarker(gutter, line);
        if (marker)
        {

            return marker;
        }

        return null;
    },

    getAnnotationsByType: function(aType, aStart, aEnd)
    {
        var annotations = this.editor._annotationModel.getAnnotations(aStart, aEnd);
        var annotation, result = [];
        while (annotation = annotations.next())
        {
            if (annotation.type == aType)
                result.push(annotation);
        }
        return result;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getLineIndex: function(target)
    {
        return this.editor.getLineIndex(target);
    },

    getSelectedText: function()
    {
        return this.editor.getSelectedText();
    },

    getInternalEditor: function()
    {
        return this.editor;
    },
});

// ********************************************************************************************* //
// Export

return ScriptView;

// ********************************************************************************************* //
});
