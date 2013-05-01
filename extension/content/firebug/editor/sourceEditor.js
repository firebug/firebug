/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/http",
    "firebug/lib/dom",
],
function (Firebug, Http, Dom) {

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
    this.view = null;
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
    init: function (parentNode, config, callback)
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

        function onEditorCreate(elt)
        {
            parentNode.appendChild(elt);

            callback();
        }

        // Create editor;
        this.editorObject = doc.defaultView.CodeMirror(
            onEditorCreate.bind(this), config);

        Trace.sysout("sourceEditor.init; ", this.view);
    },

    addEventListener: function (type, handler)
    {
        if (type in SourceEditor.Editor)
        {
            if (isSupportedEvent(type))
            {
                this.editorObject.on(SourceEditor.Events[type], function ()
                {
                    handler(getEventObject(type, arguments));
                });
            }
            else if (type == SourceEditor.Events.breakpointChange)
            {
                this.bpChangingHandler = handler;
            }
            else
            {
                editorNode = this.editorObject.getWrapperElement();
                editorNode.addEventListener(SourceEditor.Events[type], handler, false);
            }
        }
    },

    removeEventListener: function (type, handler)
    {
        if (type in SourceEditor.Editor)
        {
            if (isSupportedEvent(type))
            {
                this.editorObject.off(SourceEditor.Events[type], handler);
            }
            else
            {
                editorNode = this.editorObject.getWrapperElement();
                editorNode.removeEventListener(SourceEditor.Events[type], handler, false);
            }
        }
    },

    addBreakpoint: function (lineNo, condition)
    {
        this.editorObject.on(SourceEditor.Events.gutterClick,
            function (cmInstance, line, gutter, event)
            {
                if (gutter == "breakpoints")
                {
                    // TODO: add breakpoint

                    /*var info = this.editorObject.lineInfo(lineNo);
                    if (info.gutterMarkers)
                    this.editorObject.setGutterMarker(lineNo, "breakpoints", breakpointIcon);*/

                    if (this.bpChangingHandler)
                    {
                        var event = {
                            added: [{ line: lineNo, condition: condition}],
                            removed: []
                        };
                        this.bpChangingHandler(event);
                    }
                }
            });
    },

    removeBreakpoint: function (lineNo, condition)
    {
        this.editorObject.on(SourceEditor.Events.gutterClick,
            function (cmInstance, line, gutter, event)
            {
                if (gutter == "breakpoints")
                {
                    var info = this.editorObject.lineInfo(lineNo);
                    if (info.gutterMarkers)
                        this.editorObject.setGutterMarker(lineNo, "breakpoints", null);

                    if (this.bpChangingHandler)
                    {
                        var event = {
                            added: [],
                            removed: [{ line: lineNo, condition: condition}]
                        };
                        this.bpChangingHandler(event);
                    }
                }
            });
    },

    destroy: function ()
    {
        // TODO
    },

    setText: function (text)
    {
        this.editorObject.setValue(text);
    },

    getText: function ()
    {
        return this.editorObject.getValue();
    },

    getCharCount: function ()
    {
        this.editorObject.getValue().length;
    },

    setDebugLocation: function ()
    {
        // TODO
    },

    getTopIndex: function ()
    {
        // TODO
        return 0;
    }
};

// ********************************************************************************************* //
// Local Helpers

function editorSupportedEvenets()
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

function isSupportedEvent(eventType)
{
    var supportedEvents = editorSupportedEvenets();
    return (eventType in supportedEvents ? true : false);
}

function getEventObject(type, eventArg)
{
    var eventName = SourceEditor.Events[type];
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
            event.line = eventArg[1];
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
