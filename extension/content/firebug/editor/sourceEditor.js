/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/http",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/wrapper",
    "firebug/lib/array",
    "firebug/lib/options",
    "firebug/editor/sourceSearch"
],
function(Firebug, FBTrace, Obj, Http, Dom, Css, Wrapper, Arr, Options, SourceSearch) {

"use strict";

// ********************************************************************************************* //
// Resources

// CodeMirror: http://codemirror.net/

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;

// CodeMirror files. These scripts are dynamically included into panel.html
// Note that panel.html runs in content scope with restricted (no chrome) privileges.
var codeMirrorSrc = "chrome://firebug/content/editor/codemirror/codemirror.js";
var showHintSrc = "chrome://firebug/content/editor/codemirror/addon/show-hint.js";
var searchCursorSrc = "chrome://firebug/content/editor/codemirror/addon/search/searchcursor.js";
var jsModeSrc = "chrome://firebug/content/editor/codemirror/mode/javascript.js";
var htmlMixedModeSrc = "chrome://firebug/content/editor/codemirror/mode/htmlmixed.js";
var xmlModeSrc = "chrome://firebug/content/editor/codemirror/mode/xml.js";
var cssModeSrc = "chrome://firebug/content/editor/codemirror/mode/css.js";

// Tracing helpers
var Trace = FBTrace.to("DBG_SOURCEEDITOR");
var TraceError = FBTrace.toError();

// Debug location style classes
var WRAP_CLASS = "CodeMirror-debugLocation";
var BACK_CLASS = "CodeMirror-debugLocation-background";
var HIGHLIGHTED_LINE_CLASS = "CodeMirror-highlightedLine";
var BP_WRAP_CLASS = "CodeMirror-breakpoint";

var unhighlightDelay = 1300;
var tabSize = Options.get("replaceTabs");

// ********************************************************************************************* //
// Source Editor Constructor

function SourceEditor()
{
    this.editorObject = null;
    this.debugLocation = -1;
    this.highlighter = null;
}

// ********************************************************************************************* //
// Gutters

SourceEditor.Gutters =
{
    breakpoints: "breakpoints",
};

// Shortcut
var bpGutter = SourceEditor.Gutters.breakpoints;

// ********************************************************************************************* //
// Config

SourceEditor.DefaultConfig =
{
    value: "",
    mode: "htmlmixed",
    theme: "firebug",
    indentUnit: tabSize || 4,
    tabSize: tabSize || 4,
    indentWithTabs: tabSize == 0,
    smartIndent: true,
    extraKeys: {},
    lineWrapping: false,
    lineNumbers: true,
    firstLineNumber: 1,
    gutters: [bpGutter],
    fixedGutter: false,

    showCursorWhenSelecting: false,
    undoDepth: 200,

    resetSelectionOnContextMenu: false,

    // xxxHonza: this is weird, when this props is set the editor is displayed twice.
    // There is one-line editor created at the bottom of the Script panel.
    // Just switch to the CSS panel and back to reproduce the problem.
    // autofocus: true
};

SourceEditor.ReadOnlyConfig = Obj.extend(SourceEditor.DefaultConfig,
{
    // Do not use "nocursor" to hide the cursor otherwise Ctrl+C doesn't work (see issue 6819)
    readOnly: true,

    // Hide the cursor setting its height and blink rate to zero (see issue 6794)
    // cursorBlinkRate doesn't have to be actually zero, but safes one time interval.
    cursorBlinkRate: 0,
    cursorHeight: 0
});

SourceEditor.Events =
{
    textChange: "change",
    beforeTextChange: "beforeChange",
    cursorActivity: "cursorActivity",
    beforeSelectionChange: "beforeSelectionChange",
    viewportChange: "viewportChange",
    gutterClick: "gutterClick",
    focus: "focus",
    blur: "blur",
    scroll: "scroll",
    update: "update",
    renderLine: "renderLine",
    breakpointChange: "breakpointchange",
    contextMenu: "contextmenu",
    mouseMove: "mousemove",
    mouseOut: "mouseout",
    mouseOver: "mouseover",
    mouseUp: "mouseup",
    keyDown: "keydown"
};

// ********************************************************************************************* //
// Source Editor Implementation

/**
 * @object This object represents a wrapper for CodeMirror editor. The rest of Firebug
 * should access all CodeMirror features through this object and so, e.g. make it easy to
 * switch to another editor in the future.
 *
 * Note that CodeMirror instances are running within Firebug UI (panel.html) that has
 * restricted (content) privileges. All objects passed into CM APIs (such as rectangles,
 * coordinates, positions, etc.) must be properly exposed to the content. You should usually
 * utilize {@SourceEditor.cloneIntoCMScope} method for this purpose.
 *
 * Use {@ScriptLoader} implemented at the bottom of this file if you want to use FBTrace
 * API from within CodeMirror files. See {@SourceEditor.loadScripts} for more details.
 */
SourceEditor.prototype =
/** @lends SourceEditor */
{
    savedCursorLocation: null,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    init: function(parentNode, config, callback)
    {
        var onInit = this.onInit.bind(this, parentNode, config, callback);

        this.loadScripts(parentNode.ownerDocument, onInit);
    },

    onInit: function(parentNode, config, callback)
    {
        this.parentNode = parentNode;

        var doc = parentNode.ownerDocument;
        this.win = doc.defaultView;

        // Unwrap Firebug content view (panel.html). This view is running in
        // content mode with no chrome privileges.
        var contentView = Wrapper.getContentView(this.win);

        Trace.sysout("sourceEditor.onInit; " + contentView.CodeMirror);

        config = Obj.extend(SourceEditor.DefaultConfig, config);

        // The config object passed to the view must be content-accessible.
        // CodeMirror writes to it, so make sure properties are writable (we
        // cannot use plain cloneIntoCMScope).
        var newConfig = new this.win.Object();
        for (var prop in config)
            newConfig[prop] = Wrapper.cloneIntoContentScope(this.win, config[prop]);
        Cu.makeObjectPropsNormal(newConfig);

        var self = this;

        // Create editor;
        this.editorObject = contentView.CodeMirror(function(view)
        {
            Trace.sysout("sourceEditor.onEditorCreate;");

            parentNode.appendChild(view);
            self.view = view;
        }, newConfig);

        // Mark lines so, we can search for them (see e.g. getLineIndex method).
        this.editorObject.on("renderLine", function(cm, lineHandle, element)
        {
            Css.setClass(element, "firebug-line");
        });

        // xxxHonza: 'contextmenu' event provides wrong target (clicked) element.
        // So, handle 'mousedown' first to remember the clicked element, etc. and
        // allow to use it through getContextMenuInfo.
        var scroller = this.editorObject.display.scroller;
        scroller.addEventListener("mousedown", this.onMouseDown.bind(this));

        Trace.sysout("sourceEditor.init; ", this.view);

        // Execute callback function. It could be done asynchronously
        callback();
    },

    destroy: function()
    {
        Trace.sysout("sourceEditor.destroy;");

        this.removeHighlighter();
    },

    isInitialized: function()
    {
        return (this.editorObject != null);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Events

    onMouseDown: function(event)
    {
        var target = event.target;

        // Click info object can be retrieved through getContextMenuInfo method.
        this.clickInfo = {};

        this.clickInfo.currentTarget = target;
        this.clickInfo.rangeParent = event.rangeParent;
        this.clickInfo.rangeOffset = event.rangeOffset;

        var scrollParent = Dom.getOverflowParent(target);
        var scrollX = event.clientX + (scrollParent ? scrollParent.scrollLeft : 0);

        this.clickInfo.x = scrollX;
        this.clickInfo.y = event.clientY;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Load CM Scripts

    loadScripts: function(doc, callback)
    {
        Trace.sysout("sourceEditor.loadScripts;");

        var loader = this;

        // Support for CM debugging. If <script> tags are inserted with
        // properly set 'src' attribute, stack traces produced by Firebug tracing
        // console are correct. But it's asynchronous causing the Script panel UI
        // to blink so, we don't need it for production. The following loader
        // also injects FBTracei into panel.html, so it can be used within codemirror.js
        // Just uncomment the following line:
        //loader = new ScriptLoader(doc, callback);

        loader.addScript(doc, "cm", codeMirrorSrc);
        loader.addScript(doc, "cm-showhint", showHintSrc);
        loader.addScript(doc, "cm-searchcursor", searchCursorSrc);
        loader.addScript(doc, "cm-js", jsModeSrc);
        loader.addScript(doc, "cm-xml", xmlModeSrc);
        loader.addScript(doc, "cm-css", cssModeSrc);
        loader.addScript(doc, "cm-htmlmixed", htmlMixedModeSrc);

        if (loader == this)
            callback();
    },

    addScript: function(doc, id, url)
    {
        // Synchronous injecting of CM source into Firebug UI (panel.html).
        Dom.addScript(doc, id, Http.getResource(url));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Event Listeners

    addEventListener: function(type, handler)
    {
        Trace.sysout("sourceEditor.addEventListener; " + type);

        var editorNode;

        if (isBuiltInEvent(type))
        {
            var func = function()
            {
                handler(getEventObject(type, arguments));
            };

            if (!this.BuiltInEventsHandlers)
                this.BuiltInEventsHandlers = {};

            if (!this.BuiltInEventsHandlers[type])
            {
                this.BuiltInEventsHandlers[type] = [];
            }
            else
            {
                for (var i = 0; i < this.BuiltInEventsHandlers[type].length; i++)
                {
                    // There is already the same handler.
                    if (this.BuiltInEventsHandlers[type][i].handler == handler)
                        return;
                }

                editorNode = this.editorObject.getWrapperElement();
                editorNode.addEventListener(type, handler, false);
            }

            this.BuiltInEventsHandlers[type].push({ handler: handler, func: func });
            this.editorObject.on(type, func);
        }
        else if (type == SourceEditor.Events.breakpointChange)
        {
            if (!this.bpChangingHandlers)
                this.bpChangingHandlers = [];

            this.bpChangingHandlers.push(handler);
        }
        else
        {
            var supportedEvent = false;
            for (var eventType in SourceEditor.Events)
            {
                if (type == SourceEditor.Events[eventType])
                {
                    supportedEvent = true;
                    break;
                }
            }

            if (supportedEvent)
            {
                editorNode = this.editorObject.getWrapperElement();
                editorNode.addEventListener(type, handler, false);
            }
        }
    },

    removeEventListener: function(type, handler)
    {
        if (isBuiltInEvent(type))
        {
            if (!this.BuiltInEventsHandlers || !this.BuiltInEventsHandlers[type])
                return;

            for (var i = 0; i < this.BuiltInEventsHandlers[type].length; i++)
            {
                if (this.BuiltInEventsHandlers[type][i].handler == handler)
                {
                    this.editorObject.off(type, this.BuiltInEventsHandlers[type][i].func);

                    this.BuiltInEventsHandlers[type].splice(i, 1);
                    if (!this.BuiltInEventsHandlers[type].length)
                    {
                        delete this.BuiltInEventsHandlers[type];
                        return;
                    }
                }
            }
        }
        else if (type == SourceEditor.Events.breakpointChange)
        {
            if (!this.bpChangingHandlers)
                return;

            this.bpChangingHandlers = this.bpChangingHandlers.filter(function(func)
            {
                if (func != handler)
                    return func;
            });

            if (!this.bpChangingHandlers)
                this.bpChangingHandlers = null;
        }
        else
        {
            var supportedEvent = false;
            for (var eventType in SourceEditor.Events)
            {
                if (type == SourceEditor.Events[eventType])
                {
                    supportedEvent = true;
                    break;
                }
            }

            if (supportedEvent)
            {
                var editorNode = this.editorObject.getWrapperElement();
                editorNode.removeEventListener(type, handler, false);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Text Content

    setText: function(text, type)
    {
        // The text is changing, remove markers.
        this.removeDebugLocation();
        this.removeHighlighter();

        Trace.sysout("sourceEditor.setText: " + type + " " + text, text);

        // xxxHonza: the default 'mixedmode' mode should be set only if the text
        // is actually a markup (first letter == '<'?). Note that applying mixed mode
        // on plain JS doesn't work (no color syntax at all).
        var mode = "htmlmixed";
        switch (type)
        {
            case "js":
                mode = "javascript";
            break;
            case "css":
                mode = "css";
            break;
            case "xml":
                mode = "xml";
            break;
        }

        this.editorObject.setOption("mode", mode);

        text = text || "";
        this.editorObject.setValue(text);
    },

    getText: function()
    {
        return this.editorObject.getValue();
    },

    getCharCount: function(line)
    {
        if (line != null)
            return this.getDocument().getLine(line).length;

        return this.editorObject.getValue().length;
    },

    getLineCount: function()
    {
        return this.getDocument().lineCount();
    },

    getCharacterOffsets: function(start, end)
    {
        var startOffset = 0;
        var endOffset = 0;

        // Count the chars of the lines before the
        // end/start lines, including newlines.
        for (var i = 0; i < end.line; i++)
        {
            var lineCharCount = this.getCharCount(i);
            if (start.line > i)
                startOffset += lineCharCount + 1;

            endOffset += lineCharCount + 1;
        }

        // Add the number of chars between the first char
        // of the lines and cursor position.
        startOffset += start.ch;
        endOffset += end.ch;

        return {
            start: startOffset,
            end: endOffset
        };
    },

    getSelectedText: function()
    {
        return this.editorObject.getSelection();
    },

    setSelection: function(start, end)
    {
        Trace.sysout("sourceEditor.setSelection; " + start + ", " + end);

        var allCharCount = this.getCharCount();

        // It would be wrong If start is out of the body
        // or end(in positive case) is less than start.
        if (start > allCharCount || (end > 0 && end < start))
            return;

        var lineCount = this.getDocument().lineCount();
        var startLine = -1;
        var endLine = lineCount - 1;
        var startChar = 0;
        var endChar = 0;

        // In cases that both/one of the inputs is negative,
        // indicate an offset from the end of the text.
        start  = start < 0 ? allCharCount + start + 1 : start;
        end = end < 0 ? allCharCount + end + 1 : end;

        // If the one of the inputs, in negative case,
        // is out of the body.
        if (end < 0 || start < 0)
            return;

        // It's also possible that the end parameter, in negative case,
        // would be less than the start (e.g. setSelection(-1, -5)), so
        // just need to be swapped.
        if (end < start)
        {
            var temp = start;
            start = end;
            end = temp;
        }

        var charCount = 0;

        // Since Codemirror only accepts the positions in (line, ch) format, we
        // need to go through the editor lines and manually convert the positions.
        for (var i = 0; i < lineCount; i++)
        {
            charCount += this.getCharCount(i) + 1;
            if (startLine == -1 && charCount > start)
            {
                startLine = i;
                startChar = start - (charCount - this.getCharCount(i) - 1);
            }

            if (charCount > end)
            {
                endLine = i;
                endChar = end - (charCount - this.getCharCount(i) - 1);
                break;
            }
        }

        this.editorObject.setSelection(
            this.cloneIntoCMScope({line: startLine, ch: startChar}),
            this.cloneIntoCMScope({line: endLine, ch: endChar})
        );
    },

    getSelection: function()
    {
        var start = this.getCursor("start");
        var end = this.getCursor("end");

        return this.getCharacterOffsets(start, end);
    },

    hasSelection: function()
    {
        return this.getDocument().somethingSelected();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    clearHistory: function()
    {
        this.editorObject.clearHistory();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // CodeMirror internals

    getDocument: function()
    {
        return this.editorObject.getDoc();
    },

    cloneIntoCMScope: function(obj)
    {
        return Wrapper.cloneIntoContentScope(this.win, obj);
    },

    getCodeMirrorSingleton: function()
    {
        var contentView = Wrapper.getContentView(this.win);
        return contentView.CodeMirror;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Commands

    // xxxHonza: see onInit for more details
    getContextMenuInfo: function()
    {
        return this.clickInfo;
    },

    getContextMenuItems: function()
    {
        var items = [];
        items.push({label: "Cut", command: Obj.bind(this.onCommand, this, "cmd_cut")});
        items.push({label: "Copy", command: Obj.bind(this.onCommand, this, "cmd_copy")});
        items.push({label: "Paste", command: Obj.bind(this.onCommand, this, "cmd_paste")});
        items.push({label: "Delete", command: Obj.bind(this.onCommand, this, "cmd_delete")});
        items.push("-");
        items.push({label: "SelectAll", command: Obj.bind(this.onCommand, this, "cmd_selectAll")});
        return items;
    },

    onCommand: function(event, cmd)
    {
        Trace.sysout("sourceEditor.onCommand; " + cmd);

        var map = {
            "cmd_selectAll": "selectAll",
            "cmd_undo": "undo",
            "cmd_redo": "redo",
            "cmd_delete": "delCharAfter",
        };

        if (map[cmd])
            return this.editorObject.execCommand(map[cmd]);

        // Default command dispatch.
        Firebug.BaseEditor.onCommand(event, cmd);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    autoComplete: function(hintFunction)
    {
        var clone = this.cloneIntoCMScope.bind(this);
        var self = this;
        var contentHintFunction = function(editor)
        {
            var ret = hintFunction(self, editor);
            if (!ret)
                return;
            return clone({
                list: clone(ret.list.map(function(prop)
                {
                    return clone(prop);
                })),
                from: clone(ret.from),
                to: clone(ret.to)
            });
        };
        this.getCodeMirrorSingleton().showHint(this.editorObject, contentHintFunction);
    },

    tab: function()
    {
        this.editorObject.execCommand("indentMore");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Cursor Methods

    setCursor: function(line, ch)
    {
        this.editorObject.setCursor(line, ch);
        this.editorObject.focus();
    },

    getCursor: function(start)
    {
        return this.getDocument().getCursor(start || "head");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Line API

    lastLineNo: function()
    {
        return this.editorObject.lastLine();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Search

    search: function(text, options)
    {
        var offsets = this.find(text, options.start, options);
        if (offsets)
        {
            var characterOffsets = this.getCharacterOffsets(offsets.start, offsets.end);

            this.scrollToLine(offsets.start.line);
            this.highlightLine(offsets.start.line);

            this.setSelection(characterOffsets.start, characterOffsets.end);

            return offsets;
        }

        return null;
    },

    find: function(text, start, options)
    {
        if (!this.sourceSearch)
            this.sourceSearch = new SourceSearch(this);

        return this.sourceSearch.findNext(text, start, options);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    setDebugLocation: function(line)
    {
        Trace.sysout("sourceEditor.setDebugLocation; line: " + line +
            ", this.debugLocation: " + this.debugLocation);

        if (this.debugLocation != -1)
        {
            var handle = this.editorObject.getLineHandle(this.debugLocation);
            if (handle)
            {
                this.editorObject.removeLineClass(handle, "wrap", WRAP_CLASS);
                this.editorObject.removeLineClass(handle, "background", BACK_CLASS);

                // Remove debug location marker (we are reusing breakpoints gutter for it).
                var marker = this.getGutterMarker(bpGutter, this.debugLocation);
                if (marker && marker.className == "debugLocation")
                    this.removeGutterMarker(bpGutter, this.debugLocation);
            }
        }

        this.debugLocation = line;

        if (this.debugLocation != -1)
        {
            var handle = this.editorObject.getLineHandle(line);
            if (handle)
            {
                this.editorObject.addLineClass(handle, "wrap", WRAP_CLASS);
                this.editorObject.addLineClass(handle, "background", BACK_CLASS);

                // Debug location marker is using breakpoints gutter and so, create the marker
                // only if there is no breakpoint marker already. This 'gutter reuse' allows to
                // place the debug location icon over a breakpoint icon and save some space.
                var marker = this.getGutterMarker(bpGutter, line);
                if (!marker)
                {
                    var marker = this.getGutterElement().ownerDocument.createElement("div");
                    marker.className = "debugLocation";
                    this.editorObject.setGutterMarker(line, bpGutter, marker);
                }
            }
        }
    },

    removeDebugLocation: function()
    {
        this.setDebugLocation(-1);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Line Highlight

    highlightLine: function(line)
    {
        Trace.sysout("sourceEditor.highlightLine; line: " + line);

        // If an existing highlighter is in place, cancel it (i.e. clear the timeout),
        // so there are no two highlighted lines at the same time.
        this.removeHighlighter();

        // Create highlighter in order to highlight given line. The highlighter will
        // automatically unhighlight it after a timeout.
        this.highlighter = new LineHighlighter(this);
        this.highlighter.highlight(line);
    },

    unhighlightLine: function()
    {
        this.removeHighlighter();
    },

    removeHighlighter: function()
    {
        if (this.highlighter)
            this.highlighter.cancel();

        this.highlighter = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Scroll

    scrollToLine: function(line, options)
    {
        Trace.sysout("sourceEditor.scrollToLine; " + line, options);

        line = line || 0;
        options = options || {};

        var pos = this.cloneIntoCMScope({line: line, ch: 0});
        var coords = this.editorObject.charCoords(pos, "local");

        // If direct scroll (pixel) position is specified use it.
        if (options.scrollTop)
        {
            Trace.sysout("sourceEditor.scrollToLine; scrollTop: " + options.scrollTop);
            this.editorObject.scrollTo(null, options.scrollTop);
        }
        else
        {
            // xxxHonza: the scroll position isn't set immediatelly after
            // seting the source. So, we need to update it asynchronously :-(
            // (see also issue 7160)
            // We might want to re-check when the next CM version is used.
            // xxxHonza: how to avoid using the Firebug.currentContext global?
            var context = Firebug.currentContext;
            context.setTimeout(() =>
            {
                var scrollInfo = this.editorObject.getScrollInfo();
                var hScrollBar = this.view.getElementsByClassName("CodeMirror-hscrollbar")[0];

                // Do not include h-scrollbar in editor height (even if CM docs says getScrollInfo
                // returns the visible area minus scrollbars, it doesn't seem to work).
                var editorHeight = scrollInfo.clientHeight - hScrollBar.offsetHeight;
                var top = coords.top;
                var bottom = coords.bottom;

                // Scroll only if the target line is outside of the viewport.
                var scrollNeeded = (top <= scrollInfo.top ||
                    bottom >= (scrollInfo.top + editorHeight));

                Trace.sysout("sourceEditor.scrollToLine; (" + line + ") top: " + top +
                    ", bottom: " + bottom + ", scrollbar height: " + hScrollBar.offsetHeight +
                    ", editorHeight: " + editorHeight + ", " + "scrollNeeded: " + scrollNeeded,
                    {scrollInfo: scrollInfo, coords: coords});

                if (scrollNeeded)
                {
                    var middle = top - (editorHeight / 2);
                    this.editorObject.scrollTo(null, middle);
                }
            });
        }
    },

    scrollTo: function(left, top)
    {
        Trace.sysout("sourceEditor.scrollTo; left: " + left + ", top: " + top);

        this.editorObject.scrollTo(left, top);
    },

    getScrollInfo: function()
    {
        return this.editorObject.getScrollInfo();
    },

    getTopIndex: function()
    {
        var scrollInfo = this.getScrollInfo();
        scrollInfo = this.cloneIntoCMScope(scrollInfo);
        var coords = this.editorObject.coordsChar(scrollInfo, "local");
        return coords.line;
    },

    setTopIndex: function(line)
    {
        Trace.sysout("sourceEditor.setTopIndex; line: " + line);

        var coords = this.cloneIntoCMScope({line: line, ch: 0});
        this.editorObject.scrollTo(0, this.editor.charCoords(coords, "local").top);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Focus

    hasFocus: function()
    {
        return this.editorObject.hasFocus();
    },

    focus: function()
    {
        this.editorObject.focus();
        if (this.savedCursorLocation)
        {
            this.setSelection(this.savedCursorLocation.start, this.savedCursorLocation.end);
            this.savedCursorLocation = null;
        }
    },

    blur: function(saveCursorLocation)
    {
        if (saveCursorLocation)
            this.savedCursorLocation = this.getSelection();
        this.win.blur();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

    addBreakpoint: function(lineNo)
    {
        if (!this.editorObject)
            return;

        Trace.sysout("sourceEditor.addBreakpoint; line: " + lineNo);

        var info = this.editorObject.lineInfo(lineNo);
        if (!info)
        {
            Trace.sysout("sourceEditor.addBreakpoint; ERROR line doesn't exist: " + lineNo);
            return;
        }

        if (!info.gutterMarkers)
        {
            var breakpoint = this.getGutterElement().ownerDocument.createElement("div");
            breakpoint.className = "breakpoint";
            this.editorObject.setGutterMarker(lineNo, bpGutter, breakpoint);

            // Modify also the line-wrap element (also used by FBTest)
            var handle = this.editorObject.getLineHandle(lineNo);
            if (handle)
                this.editorObject.addLineClass(handle, "wrap", BP_WRAP_CLASS);

            // dispatch event;
            if (this.bpChangingHandlers)
            {
                var event = {
                    added: [{line: lineNo}],
                    removed: []
                };

                this.bpChangingHandlers.forEach(function(handler)
                {
                    handler(event);
                });
            }
        }
    },

    removeBreakpoint: function(lineNo)
    {
        if (!this.editorObject)
            return;

        Trace.sysout("sourceEditor.removeBreakpoint; line: " + lineNo);

        this.removeGutterMarker(bpGutter, lineNo);

        // Modify also the line-wrap element (also used by FBTest)
        var handle = this.editorObject.getLineHandle(lineNo);
        if (handle)
            this.editorObject.removeLineClass(handle, "wrap", BP_WRAP_CLASS);

        // Make sure the debug location marker is not removed together with the breakpoint.
        if (this.debugLocation == lineNo)
            this.setDebugLocation(lineNo);

        // dispatch event;
        if (this.bpChangingHandlers)
        {
            var event = {
                added: [],
                removed: [{line: lineNo}]
            };

            this.bpChangingHandlers.forEach(function(handler)
            {
                handler(event);
            });
        }
    },

    removeAllBreakpoints: function()
    {
        var viewport = this.editorObject.getViewport();
        var currentLine = viewport.from;

        // Iterate over all visible lines.
        this.editorObject.eachLine(viewport.from, viewport.to, () =>
        {
            this.removeGutterMarker(bpGutter, currentLine++);
        });
    },

    getCodeMirrorStateForBreakpointLine: function(lineNo)
    {
        // Let's assume the breakpoint breaks at around the start of this line.
        // Start by searching for the next non-comment, non-whitespace CodeMirror
        // token, which holds the most relevant parse state.
        // ({line: lineNo, ch: 0} is one step behind apparently.)
        // We limit ourselves to 500 tokens of look-ahead as a precaution, though
        // it's probably unnecessary).
        var editor = this.editorObject;
        var ch = 1, line = lineNo;
        var token;
        for (var steps = 0; steps < 500; steps++)
        {
            token = editor.getTokenAt(this.cloneIntoCMScope({line: line, ch: ch}));
            if (!token.end || (token.string.trim() && token.type !== "comment"))
                break;

            if (token.end >= ch)
            {
                ch = token.end + 1;
            }
            else
            {
                ch = 1;
                line++;
            }
        }

        if (steps == 500)
            TraceError.sysout("getCodeMirrorStateForBreakpointLine; too much look-ahead");

        var cm = this.getCodeMirrorSingleton();
        return cm.innerMode(editor.getMode(), token.state).state;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getSurroundingVariablesFromCodeMirrorState: function(state)
    {
        var list = [];
        if (!state || !state.localVars)
            return list;
        var addVars = function(vars)
        {
            for (var v = vars; v; v = v.next)
                list.push(v.name);
        };
        addVars(state.localVars);
        addVars(state.globalVars);
        for (var c = state.context; c && c.vars; c = c.prev)
            addVars(c.vars);
        return list;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Gutters and Marker API

    setGutterMarker: function(gutter, lineNo, markerElt)
    {
        this.editorObject.setGutterMarker(lineNo, gutter, markerElt);
    },

    removeGutterMarker: function(gutter, lineNo)
    {
        this.editorObject.setGutterMarker(lineNo, gutter, null);
    },

    clearGutter: function(gutter)
    {
        this.editorObject.clearGutter(gutter);
    },

    getGutterMarker: function(gutter, lineNo)
    {
        if (!this.editorObject)
            return;

        var info = this.editorObject.lineInfo(lineNo);
        return (info && info.gutterMarkers && info.gutterMarkers[gutter] ?
            info.gutterMarkers[gutter] : null);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Editor DOM nodes

    getViewElement: function()
    {
        return this.editorObject.getWrapperElement();
    },

    getGutterElement: function()
    {
        return this.editorObject.getGutterElement();
    },

    getScrollerElement: function()
    {
        return this.editorObject.getScrollerElement();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getLineIndex: function(target)
    {
        var lineElement;

        if (Css.hasClass(target, "breakpoint"))
        {
            // Sadly, CM doesn't use much class attributes so, this needs to be hardcoded.
            target = target.parentNode.parentNode.parentNode;
            lineElement = target.getElementsByClassName("firebug-line").item(0);
        }
        else
        {
            lineElement = Dom.getAncestorByClass(target, "firebug-line");
        }

        if (!lineElement)
            return -1;

        lineElement = lineElement.parentNode;

        var lineNumber = lineElement.getElementsByClassName("CodeMirror-linenumber")[0];
        var lineNo = parseInt(lineNumber.textContent, 10);
        if (isNaN(lineNo))
            return -1;

        // Return index (zero based)
        return lineNo - 1;
    },

    // Method used for the hack of issue 6824 (Randomly get "Unresponsive Script Warning" with
    // commandEditor.html). Adds or removes the .CommandEditor-Hidden class.
    // IMPORTANT: that method should only be used within the Firebug code, and may be removed soon.
    addOrRemoveClassCommandEditorHidden: function(addClass)
    {
        if (!this.view)
        {
            TraceError.sysout("SourceEditor.addOrRemoveClassCommandEditorHidden; " +
                "the view is undefined. Abort!");
            return;
        }

        if (addClass)
            this.view.classList.add("CommandEditor-hidden");
        else
            this.view.classList.remove("CommandEditor-hidden");
    }
};

// ********************************************************************************************* //
// Local Helpers

function getBuiltInEvents()
{
    return {
        textChange: "change",
        beforeTextChange: "beforeChange",
        cursorActivity: "cursorActivity",
        beforeSelectionChange: "beforeSelectionChange",
        viewportChange: "viewportChange",
        gutterClick: "gutterClick",
        focus: "focus",
        blur: "blur",
        scroll: "scroll",
        update: "update",
        renderLine: "renderLine"
    };
}

function isBuiltInEvent(eventType)
{
    var builtInEvents = getBuiltInEvents();
    for (var event in builtInEvents)
    {
        if (eventType == builtInEvents[event])
            return true;
    }

    return false;
}

function getEventObject(type, eventArg)
{
    var event = {};

    switch (type)
    {
        case "change":
        case "beforeChange":
            event.changedObj = eventArg[1];
            break;
        case "beforeSelectionChange":
            event.selection = eventArg[1];
            break;
        case "viewportChange":
            event.from = eventArg[1];
            event.to = eventArg[2];
            break;
        case "gutterClick":
            event.lineNo = eventArg[1];
            event.gutter = eventArg[2];
            event.rawEvent = eventArg[3];
            break;
    }

    return event;
}

// ********************************************************************************************* //
// Line Highlighter Implementation

function LineHighlighter(editor)
{
    this.line = -1;
    this.timeout = null;
    this.editor = editor;
    this.cm = editor.editorObject;
}

LineHighlighter.prototype =
{
    highlight: function(line)
    {
        // If the highlighter is currently in progress, just reset the timeout.
        // Otherwise, make sure to highlight the line.
        if (this.timeout)
        {
            clearInterval(this.timeout);
        }
        else
        {
            this.line = line;
            var handle = this.cm.getLineHandle(line);
            this.cm.addLineClass(handle, "wrap", HIGHLIGHTED_LINE_CLASS);

            var lineText = this.editor.getDocument().getLine(this.line);
            var panel = Firebug.getElementPanel(this.editor.parentNode);
            Firebug.dispatchEvent(panel.context.browser, "onLineHighlight",
                [this.line, lineText]);
        }

        // Unhighlight after a timeout.
        // xxxHonza: it's not nice to use the Firebug.currentContext global, but every
        // setTimeout should be initialized through the context. It ensures that
        // any running timeout is cleared when the context is destroyed.
        var context = Firebug.currentContext;
        this.timeout = context.setTimeout(this.unhighlight.bind(this), unhighlightDelay);
    },

    unhighlight: function()
    {
        if (this.line == -1)
            return;

        // Remove the previously highlighted line.
        var handle = this.cm.getLineHandle(this.line);
        if (handle)
            this.cm.removeLineClass(handle, "wrap", HIGHLIGHTED_LINE_CLASS);

        // Do not forget to delete the highlighter.
        this.editor.highlighter = null;

        var lineText = this.editor.getDocument().getLine(this.line);
        var panel = Firebug.getElementPanel(this.editor.parentNode);
        Firebug.dispatchEvent(panel.context.browser, "onLineUnhighlight",
            [this.line, lineText]);
    },

    cancel: function()
    {
        clearInterval(this.timeout);
        this.unhighlight();
    }
};

// ********************************************************************************************* //
// Support for Debugging - Tracing

/**
 * Expose FBTrace to the Firebug UI (panel.html). This help to debug problems
 * with CodeMirror, since tracing lines can be directly inserted into CM code.
 * See also {@SourceEditor.init} where the exposure happens.
 */
var ExposedFBTrace =
{
    sysout: function(msg, obj)
    {
        FBTrace.sysout(msg, obj);
    },

    __exposedProps__:
    {
        sysout: "r"
    }
};

// ********************************************************************************************* //
// Support for Debugging - Async script loader

function ScriptLoader(doc, callback)
{
    this.callback = callback;

    this.waiting = [];
    this.scripts = [];

    // Expose FBTrace into the panel.html (and codemirror.js), so
    // debugging is easier. Should *not* be part of the distribution.
    var view = Wrapper.getContentView(doc.defaultView);
    view.FBTrace = ExposedFBTrace;
}

/**
 * Helper object for tracing from within the CM files.
 */
ScriptLoader.prototype =
/** @lends ScriptLoader */
{
    addScript: function(doc, id, url)
    {
        if (this.scripts.length > 0)
        {
            this.waiting.push(Arr.cloneArray(arguments));
            return;
        }

        // xxxHonza: the callback should be executed, otherwise it fails in case
        // where only some scripts are already presented (should not happen in
        // our case, but it would make this object more generic).
        var script = doc.getElementById(id);
        if (script)
            return script;

        script = doc.createElementNS("http://www.w3.org/1999/xhtml", "html:script");
        script.onload = this.onScriptLoaded.bind(this);

        this.scripts.push(script);

        script.setAttribute("type", "text/javascript");
        script.setAttribute("id", id);
        script.setAttribute("src", url);

        doc.documentElement.appendChild(script);
    },

    onScriptLoaded: function(event)
    {
        Arr.remove(this.scripts, event.target);

        if (this.waiting.length > 0)
        {
            var args = this.waiting.shift();
            this.addScript.apply(this, args);
            return;
        }

        if (!this.scripts.length)
            this.callback();
    }
};

// ********************************************************************************************* //
// Registration

return SourceEditor;

// ********************************************************************************************* //
});
