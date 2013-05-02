/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/http",
    "firebug/lib/dom",
],
function(Firebug, Http, Dom) {

// ********************************************************************************************* //
// Constants

var codeMirrorSrc = "chrome://firebug/content/editor/codemirror/codemirror.js";
var jsModeSrc = "chrome://firebug/content/editor/codemirror/mode/javascript.js";

var Trace = FBTrace.to("DBG_SCRIPTEDITOR");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Source Editor Implementation

function SourceEditor()
{
    this.config = {};
    this.editorObject = null;
}

SourceEditor.DefaultConfig =
{
    value: "",
    mode: "javascript",
    theme: "firebug",
    indentUnit: 2,
    tabSize: 4,
    smartIndent: true,
    extraKeys: {},
    lineWrapping: false,
    lineNumbers: true,
    firstLineNumber: 1,
    gutters: [],
    fixedGutter: false,
    readOnly: true,
    showCursorWhenSelecting: true,
    undoDepth: 200,
    autofocus: true
};

SourceEditor.Gutters =
{
    breakpoints: "breakpoints"
};

SourceEditor.Events =
{
    change: "change",
    beforeChange: "beforeChange",
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
    mouseOver: "mouseover"
};

SourceEditor.prototype =
{
    init: function(parentNode, config, callback)
    {
        var doc = parentNode.ownerDocument;

        // Append CM scripts into the panel.html
        Dom.addScript(doc, "cm", Http.getResource(codeMirrorSrc));
        Dom.addScript(doc, "cm-js", Http.getResource(jsModeSrc));

        for (var prop in SourceEditor.DefaultConfig)
        {
            this.config[prop] = prop in config ? config[prop] :
                SourceEditor.DefaultConfig[prop];
        }

        // Create editor;
        this.editorObject = doc.defaultView.CodeMirror(function(elt)
        {
            parentNode.appendChild(elt);
        }, config);

        callback();

        Trace.sysout("sourceEditor.init; ", this.view);
    },

    addEventListener: function(type, handler)
    {
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

            var func = function()
            {
                handler(getEventObject(type, arguments));
            };
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
                editorNode = this.editorObject.getWrapperElement();
                editorNode.removeEventListener(type, handler, false);
            }
        }
    },

    destroy: function()
    {
        // TODO
    },

    setText: function(text)
    {
        this.editorObject.setValue(text);
    },

    getText: function()
    {
        return this.editorObject.getValue();
    },

    getCharCount: function()
    {
        this.editorObject.getValue().length;
    },

    setDebugLocation: function()
    {
        // TODO
    },

    getTopIndex: function()
    {
        // TODO
        return 0;
    },

    focus: function()
    {
        this.editorObject.focus();
    },

    // ********************************************************************************************* //
    // Breakpoints

    addBreakpoint: function(lineNo)
    {
        var info = this.editorObject.lineInfo(lineNo);
        if (!info.gutterMarkers)
        {
            var breakpoint = this.getGutterElement().ownerDocument.createElement("div");
            breakpoint.className = "breakpoint";
            this.editorObject.setGutterMarker(lineNo, SourceEditor.Gutters.breakpoints, breakpoint);

            // dispatch event;
            if (this.bpChangingHandlers)
            {
                var event = {
                    added: [{ line: lineNo}],
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
        this.removeGutterMarker(SourceEditor.Gutters.breakpoints, lineNo);

        // dispatch event;
        if (this.bpChangingHandlers)
        {
            var event = {
                added: [],
                removed: [{ line: lineNo}]
            };

            this.bpChangingHandlers.forEach(function(handler)
            {
                handler(event);
            });
        }
    },

    // ************************************************************************************************** //
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
        var info = this.editorObject.lineInfo(lineNo);
        return (info.gutterMarkers && info.gutterMarkers[gutter] ?
            info.gutterMarkers[gutter] : null);
    },

    // ************************************************************************************************** //
    // Editor DOM nodes

    getViewElement: function()
    {
        return this.editorObject.getWrapperElement();
    },

    getGutterElement: function()
    {
        return this.editorObject.getGutterElement();
    }

};

// ************************************************************************************************** //
// Local Helpers

function getBuiltInEvents()
{
    return {
        change: "change",
        beforeChange: "beforeChange",
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
// Registration

return SourceEditor;

// ********************************************************************************************* //
});