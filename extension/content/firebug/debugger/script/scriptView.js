/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/events",
    "firebug/chrome/menu",
    "firebug/chrome/infotip",
    "firebug/chrome/firefox",
],
function (FBTrace, Obj, Dom, Css, Events, Menu, InfoTip, Firefox) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// Introduced in Firefox 8
// We might want to switch to CodeMirror:
// Bug 816756 - CodeMirror as an alternative to Orion
// Issue 5353: please integrate Codemirror2 instead of Orion editor
Cu["import"]("resource:///modules/source-editor.jsm");

var Trace = FBTrace.to("DBG_SCRIPTVIEW");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Source View

function ScriptView()
{
    this.editor = null;
    this.skipEditorBreakpointChange = false;
}

/**
 * ScriptView wraps SourceEditor component that is built on top of Orion editor.
 * This object is responsible for displaying JS source code in the debugger panel.
 */
ScriptView.prototype = Obj.extend(new Firebug.EventSource(),
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
            return;

        this.initializeExecuted = true;

        Trace.sysout("scriptView.initialize; " + parentNode);

        this.onContextMenuListener = this.onContextMenu.bind(this);
        this.onBreakpointChangeListener = this.onBreakpointChange.bind(this);
        this.onMouseMoveListener = this.onMouseMove.bind(this);
        this.onMouseOutListener = this.onMouseOut.bind(this);

        var config = {
            mode: SourceEditor.MODES.JAVASCRIPT,
            showLineNumbers: true,
            readOnly: true,
            showAnnotationRuler: true,
            showOverviewRuler: true,
            theme: "chrome://firebug/skin/orion-firebug.css",
        };

        this.editor = new SourceEditor();
        this.editor.init(parentNode, config, this.onEditorLoad.bind(this));

        // xxxHonza: use CSS?
        this.editor._iframe.style.width = "100%";
        this.editor._iframe.style.height = "100%";
    },

    onEditorLoad: function()
    {
        Trace.sysout("scriptView.onEditorLoad;", this.defaultSource);

        this.initialized = true;

        // Add editor listeners
        this.editor.addEventListener(SourceEditor.EVENTS.CONTEXT_MENU,
            this.onContextMenuListener);
        this.editor.addEventListener(SourceEditor.EVENTS.BREAKPOINT_CHANGE,
            this.onBreakpointChangeListener);
        this.editor.addEventListener(SourceEditor.EVENTS.MOUSE_MOVE,
            this.onMouseMoveListener);
        this.editor.addEventListener(SourceEditor.EVENTS.MOUSE_OUT,
            this.onMouseOutListener);

        // Hook annotation and lines ruler clicks
        this.editor._annotationRuler.onClick = this.annotationRulerClick.bind(this);
        this.editor._linesRuler.onClick = this.linesRulerClick.bind(this);

        // Hook view body mouse up (for breakpoint condition editor).
        this.editor._view._handleBodyMouseUp = this.bodyMouseUp.bind(this);

        // Focus so, keyboard works as expected.
        this.editor.focus();

        if (this.defaultSource)
            this.showSource(this.defaultSource);

        if (this.defaultLine > 0)
            this.scrollToLine("", this.defaultLine);

        this.initBreakpoints();
    },

    destroy: function()
    {
        Trace.sysout("scriptView.destroy; " + this.initialized);

        if (!this.initialized)
            return;

        this.editor.removeEventListener(SourceEditor.EVENTS.CONTEXT_MENU,
            this.onContextMenuListener);
        this.editor.removeEventListener(SourceEditor.EVENTS.BREAKPOINT_CHANGE,
            this.onBreakpointChangeListener);
        this.editor.removeEventListener(SourceEditor.EVENTS.MOUSE_MOVE,
            this.onMouseMoveListener);
        this.editor.removeEventListener(SourceEditor.EVENTS.MOUSE_OUT,
            this.onMouseOutListener);

        if (this.initialized)
            this.editor.destroy();

        this.editor = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public API

    showSource: function(source)
    {
        Trace.sysout("scriptView.showSource; initialized: " + this.initialized, source);

        if (!this.initialized)
        {
            this.defaultSource = source;
            return;
        }

        var text = this.editor.getText();
        if (text == source)
            return;

        this.editor.setText(source);

        // Breakpoints and annotations in general must be set again after setText.
        this.initBreakpoints();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    onContextMenu: function(event)
    {
        var popup = document.getElementById("fbScriptViewPopup");
        Dom.eraseNode(popup);

        var browserWindow = Firebug.chrome.window;
        var commandDispatcher = browserWindow.document.commandDispatcher;

        var items = [];
        this.dispatch("onContextMenu", [items]);

        for (var i=0; i<items.length; i++)
            Menu.createMenuItem(popup, items[i]);

        if (!popup.childNodes.length)
            return;

        popup.openPopupAtScreen(event.screenX, event.screenY, true);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Search

    search: function(text, reverse)
    {
        var curDoc = this.searchCurrentDoc(!Firebug.searchGlobal, text, reverse);
        if (!curDoc && Firebug.searchGlobal)
        {
            return this.searchOtherDocs(text, reverse) ||
                this.searchCurrentDoc(true, text, reverse);
        }
        return curDoc;
    },

    searchOtherDocs: function(text, reverse)
    {
        var scanRE = Firebug.Search.getTestingRegex(text);

        var self = this;

        function scanDoc(compilationUnit)
        {
            var lines = null;

            // TODO The source lines arrive asynchronous in general
            compilationUnit.getSourceLines(-1, -1, function loadSource(unit, firstLineNumber,
                lastLineNumber, linesRead)
            {
                lines = linesRead;
            });

            if (!lines)
                return;

            // We don't care about reverse here as we are just looking for existence.
            // If we do have a result, we will handle the reverse logic on display.
            for (var i = 0; i < lines.length; i++)
            {
                if (scanRE.test(lines[i]))
                    return true;
            }
        }

        if (this.dispatch("onNavigateToNextDocument", [scanDoc, reverse]))
            return this.searchCurrentDoc(true, text, reverse) && "wraparound";
    },

    searchCurrentDoc: function(wrapSearch, text, reverse)
    {
        var options =
        {
            ignoreCase: !Firebug.Search.isCaseSensitive(text),
            backwards: reverse
        };

        if (this.currentSearch && text == this.currentSearch.text)
        {
            options.start = this.currentSearch.start;
            if (reverse)
                options.start -= text.length + 1;
        }
        else
        {
            this.currentSearch = {text: text, start: 0};
        }

        var offset = this.editor.find(text, options);
        Trace.sysout("search", {options: options, offset: offset});

        if (offset != -1)
        {
            this.editor.setSelection(offset, offset + text.length);
            this.currentSearch.start = offset + text.length;
            return true;
        }

        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

    initBreakpoints: function()
    {
        var bps = [];
        this.dispatch("getBreakpoints", [bps]);

        for (var i=0; i<bps.length; i++)
            this.addBreakpoint(bps[i]);
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
        var self = this;
        this.safeSkipEditorBreakpointChange(function()
        {
            self.editor.removeBreakpoint(bp.lineNo - 1);
        });
    },

    addBreakpoint: function(bp)
    {
        var self = this;
        this.safeSkipEditorBreakpointChange(function()
        {
            self.editor.addBreakpoint(bp.lineNo - 1);

            // Make sure to update the icon if breakpoint is disabled.
            self.updateBreakpoint(bp);
        });
    },

    updateBreakpoint: function(bp)
    {
        var annotation = {
            style: {styleClass: "annotation breakpoint"},
            overviewStyle: {styleClass: "annotationOverview breakpoint"},
            rangeStyle: {styleClass: "annotationRange breakpoint"}
        };

        if (bp.disabled)
        {
            annotation.style.styleClass += " disabled";
            annotation.overviewStyle.styleClass += " disabled";
            annotation.rangeStyle.styleClass += " disabled";
        }

        if (bp.condition)
        {
            annotation.style.styleClass += " condition";
            annotation.overviewStyle.styleClass += " condition";
            annotation.rangeStyle.styleClass += " condition";
        }

        this.modifyAnnotation("breakpoint", bp.lineNo - 1, annotation);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Highlight Line

    scrollToLine: function(href, lineNo, highlighter)
    {
        if (!this.initialized)
        {
            this.defaultLine = lineNo;
            return;
        }

        // Convert to index based.
        lineNo = lineNo - 1;

        this.editor.setDebugLocation(lineNo);

        // xxxHonza: this should scroll the content to make the debug line visible
        // but doesn't work, why?
        this.editor.setCaretPosition(lineNo, 0, SourceEditor.VERTICAL_ALIGN.CENTER);
    },

    removeDebugLocation: function()
    {
        if (!this.initialized)
        {
            this.defaultLine = -1;
            return;
        }

        this.editor.setDebugLocation(-1);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Editor Enhancements

    modifyAnnotation: function(type, lineIndex, props)
    {
        var lineStart = this.editor.getLineStart(lineIndex);
        var lineEnd = this.editor.getLineEnd(lineIndex);

        var annotations = this.editor._getAnnotationsByType(type, lineStart, lineEnd);
        annotations.forEach(function(annotation)
        {
            // Modify existing properties
            for (var p in props)
                annotation[p] = props[p];

            // Apply modifications.
            this.editor._annotationModel.modifyAnnotation(annotation);
        }, this);
    },

    linesRulerClick: function(lineIndex, event)
    {
        Trace.sysout("scriptView.linesRulerClick; " + lineIndex, event);

        this.editor._annotationRulerClick.call(this.editor, lineIndex, event);
    },

    annotationRulerClick: function(lineIndex, event)
    {
        Trace.sysout("scriptView.annotationRulerClick; " + lineIndex, event);

        // Clicking on a line number also toggles breakpoint.
        this.editor._annotationRulerClick.call(this.editor, lineIndex, event);
    },

    bodyMouseUp: function(event)
    {
        if (!Events.isRightClick(event))
            return;

        // We are only interested in right-click events on a breakpoint 
        // (to show the breakpoint condition editor)
        var target = event.target;
        if (!Css.hasClass(target, "breakpoint"))
            return;

        // The condittion editor for breakpoints should be opened now.
        var lineIndex = this.getLineIndex(target);
        this.dispatch("openBreakpointConditionEditor", [lineIndex, event]);
    },

    getLineIndex: function(target)
    {
        // Compute the clicked line index (see _handleRulerEvent in orion.js).
        var lineIndex = target.lineIndex;
        var element = target;

        while (element && !element._ruler)
        {
            if (lineIndex === undefined && element.lineIndex !== undefined)
                lineIndex = element.lineIndex;
            element = element.parentNode;
        }

        return lineIndex;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // InfoTip

    onMouseMove: function(params)
    {
        var event = params.event;
        var browser = Firefox.getCurrentBrowser();
        InfoTip.onMouseMove(event, browser);
    },

    onMouseOut: function(params)
    {
        var event = params.event;
        var browser = Firefox.getCurrentBrowser();
        InfoTip.onMouseOut(event, browser);
    },
});

// ********************************************************************************************* //
// Export

return ScriptView;

// ********************************************************************************************* //
});