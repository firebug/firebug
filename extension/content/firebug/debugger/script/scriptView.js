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

var annonTypeHighlightedLine = "firefox.annotation.highlightedLine";

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
 *
 * TODO:
 * 1) Since the {@ScriptView} is using Orion's private API, we should have some
 * tests (could be within the lib group) that are checking every new Orion version.
 *
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
        {
            this.showSource();
            return;
        }

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

        // Register custom annotation type
        this.editor._annotationRuler.addAnnotationType(annonTypeHighlightedLine);
        this.editor._overviewRuler.addAnnotationType(annonTypeHighlightedLine);
        this.editor._annotationStyler.addAnnotationType(annonTypeHighlightedLine);

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
            this.scrollToLineAsync(this.defaultLine, this.defaultOptions);

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
        if (!this.initialized)
        {
            this.defaultSource = source;
            return;
        }

        var text = this.editor.getText();
        if (text == source && !this.forceRefresh)
            return;

        this.editor.setText(source);

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
        this.dispatch("onContextMenu", [event.event, items]);

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
        {
            var bp = bps[i];

            // Only standard breakpoints are displayed as red circles
            // in the breakpoint column.
            if (bp.isNormal())
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

        if (!bp.isNormal())
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
        if (!this.editor)
            return;

        var lineStart = this.editor.getLineStart(lineIndex);
        var lineEnd = this.editor.getLineEnd(lineIndex);
        var annotations = this.editor._getAnnotationsByType("breakpoint", lineStart, lineEnd);

        if (annotations.length > 0)
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
        var lineStart = this.editor.getLineStart(lineIndex);
        var lineEnd = this.editor.getLineEnd(lineIndex);
        var annotation = {
            type: "orion.annotation.breakpoint",
            start: lineStart,
            end: lineEnd,
            style: {styleClass: "annotation breakpointLoading"},
            html: "<div class='annotationHTML'></div>",
            overviewStyle: {styleClass: "annotationOverview"},
            rangeStyle: {styleClass: "annotationRange"}
        };

        var annotations = this.editor._getAnnotationsByType("breakpoint", lineStart, lineEnd);

        if (annotations.length == 0)
        {
            this.editor._annotationModel.addAnnotation(annotation);
        }
        else
        {
            // If the user wanted to set a condition on a existed bp
            // it's no need to show loading icon and wait to receive
            // the response.
            this.dispatch("startEditingCondition", [lineIndex, condition]);
            return;
        }

        // Simulate editor event sent when the user creates a breakpoint by
        // clicking on the breakpoint ruler.
        this.onBreakpointChange({
            added:[{lineNo: lineIndex, condition: condition}],
            removed:[]
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

        this.modifyAnnotation("breakpoint", bp.lineNo, annotation);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Content Scroll

    getScrollTop: function()
    {
        if (!this.initialized)
            return 0;

        return this.editor.getTopIndex() + 1;
    },

    scrollToLineAsync: function(lineNo, options)
    {
        Trace.sysout("scriptView.scrollToLineAsync; " + lineNo, options);

        if (!this.initialized)
        {
            this.defaultLine = lineNo;
            this.defaultOptions = options;
            return;
        }

        // Scroll the content so the debug-location (execution line) is visible
        // xxxHonza: must be done asynchronously otherwise doesn't work :-(
        // xxxHonza: since it's async the content visualy jump to the top (y scroll
        // position being reset in _updatePage) and then scrolled at the right
        // position in doScrollToLine. Ask Mihai!
        this.asyncUpdate(this.scrollToLine.bind(this, lineNo, options));
    },

    scrollToLine: function(line, options)
    {
        options = options || {};

        var editorHeight = this.editor._view.getClientArea().height;
        var lineHeight = this.editor._view.getLineHeight();
        var linesVisible = Math.floor(editorHeight/lineHeight);
        var halfVisible = Math.round(linesVisible/2);
        var firstVisible = this.editor.getTopIndex();
        var lastVisible = this.editor._view.getBottomIndex(true);

        // Convert to index based.
        line = line - 1;

        var topIndex;
        if (options.scrollTo == "top")
        {
            topIndex = line;
        }
        else
        {
            // Calculate center line
            topIndex = Math.max(line - halfVisible, 0);
            topIndex = Math.min(topIndex, this.editor.getLineCount());

            // If the target line is in view, keep the top index
            if (line <= lastVisible && line >= firstVisible)
            {
                Trace.sysout("scriptView.scrollToLine; adjust line: " + line +
                    ", firstVisible: " + firstVisible + ", lastVisible: " + lastVisible);

                topIndex = firstVisible;
            }
        }

        Trace.sysout("scriptView.scrollToLine; setTopIndex " + topIndex, options);

        this.editor.setTopIndex(topIndex);

        if (options.debugLocation)
            this.editor.setDebugLocation(line);
        else if (options.highlight)
            this.highlightLine(line);
    },

    highlightLine: function(lineIndex)
    {
        Trace.sysout("scriptView.highlightLine; " + lineIndex);

        if (!this.editor)
            return;

        var annotations = this.getAnnotationsByType(annonTypeHighlightedLine, 0,
            this.editor.getCharCount());

        if (annotations.length > 0)
        {
            annotations.forEach(this.editor._annotationModel.removeAnnotation,
                this.editor._annotationModel);
        }

        if (lineIndex < 0)
            return;

        var lineStart = this.editor._model.getLineStart(lineIndex);
        var lineEnd = this.editor._model.getLineEnd(lineIndex);
        var lineText = this.editor._model.getLine(lineIndex);

        var annotation = {
            type: annonTypeHighlightedLine,
            start: lineStart,
            end: lineEnd,
            title: "",
            style: {styleClass: "annotation highlightedLine"},
            html: "<div class='annotationHTML highlightedLine'></div>",
            overviewStyle: {styleClass: "annotationOverview highlightedLine"},
            rangeStyle: {styleClass: "annotationRange highlightedLine"},
            lineStyle: {styleClass: "annotationLine highlightedLine"},
        };

        this.editor._annotationModel.addAnnotation(annotation);

        // Unhighlight after timeout.
        var self = this;
        setTimeout(function()
        {
            self.highlightLine(-1);
        }, 1300);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debug Location

    setDebugLocationAsync: function(line)
    {
        if (!this.initialized)
        {
            this.defaultLine = line;
            return;
        }

        this.asyncUpdate(this.setDebugLocation.bind(this, line));
    },

    setDebugLocation: function(line)
    {
        if (!this.initialized)
            return;

        if (this.editor)
            this.editor.setDebugLocation(line);

        // If the debug location is being removed (line == -1) do not scroll.
        if (line > 0)
            this.scrollToLine(line);
    },

    asyncUpdate: function(callback)
    {
        Trace.sysout("scriptView.asyncUpdate;");

        // If there is an update in progress cancel it. E.g. removeDebugLocation should not
        // be called if scrollToLine is about to execute.
        if (this.updateTimer)
        {
            Trace.sysout("scriptView.asyncUpdate; Cancel existing update");
            clearTimeout(this.updateTimer);
        }

        var self = this;
        this.updateTimer = setTimeout(function()
        {
            self.updateTimer = null;
            callback();
        });
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

        if (lineIndex || lineIndex == 0)
            this.toggleBreakpoint(lineIndex);
    },

    annotationRulerClick: function(lineIndex, event)
    {
        Trace.sysout("scriptView.annotationRulerClick; " + lineIndex, event);

        if (lineIndex || lineIndex == 0)
            this.toggleBreakpoint(lineIndex);
    },

    bodyMouseUp: function(event)
    {
        Trace.sysout("scripView.bodyMouseUp;", event);

        this.dispatch("onEditorMouseUp", [event]);

        // We are only interested in right-click events...
        if (!Events.isRightClick(event))
            return;

        // ... on the breakpoint-column (to show the breakpoint condition editor).
        var target = event.target;
        var ruler = Dom.getAncestorByClass(target, "ruler");
        if (!Css.hasClass(ruler, "annotations") && !Css.hasClass(ruler, "lines"))
            return;

        // The breakpoint condition editor is about to be opened.
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Annotations

    /**
     * Returns related annotation target (an element) associated with the given line.
     * @param {Object} line Given line number. Line numbers are zero-based.
     */
    getAnnotationTarget: function(line)
    {
        // This method is using Orion's private API.
        var viewLeftRuler = this.editor._view._leftDiv;
        var annotationsRuler = viewLeftRuler.querySelector(".ruler.annotations");

        // Search through the annotations for the one associated with the given
        // line number.
        var length = annotationsRuler.children.length;
        for (var i=0; i<length; i++)
        {
            var annotation = annotationsRuler.children[i];
            if (annotation.lineIndex == line)
                return annotation;
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

    getSelectedText: function()
    {
        return this.editor.getSelectedText();
    }
});

// ********************************************************************************************* //
// Export

return ScriptView;

// ********************************************************************************************* //
});