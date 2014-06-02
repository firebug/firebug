/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/console/inlineJSEditor",
],
function(FBTrace, Domplate, Locale, Dom, JSEditor) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, DIV, INPUT} = Domplate;

var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Condition Editor

function ConditionEditor(doc, sourceEditor)
{
    this.initialize(doc, sourceEditor);
}

ConditionEditor.prototype = domplate(JSEditor.prototype,
{
    tag:
        DIV({"class": "conditionEditor"},
            DIV({"class": "conditionCaption"}, Locale.$STR("ConditionInput")),
            INPUT({"class": "conditionInput completionBox", type: "text",
                tabindex: "-1"}),
            INPUT({"class": "conditionInput completionInput", type: "text",
                "aria-label": Locale.$STR("ConditionInput"),
                oninput: "$onInput", onkeypress: "$onKeyPress"}
            )
        ),

    initialize: function(doc, sourceEditor)
    {
        this.box = this.tag.replace({}, doc, this);
        this.input = this.box.getElementsByClassName("completionInput").item(0);
        var completionBox = this.box.getElementsByClassName("completionBox").item(0);
        this.sourceEditor = sourceEditor;

        var self = this;
        var options = {
            tabWarnings: true,
            get additionalGlobalCompletions()
            {
                return self.surroundings || [];
            }
        };

        this.setupCompleter(completionBox, options);
    },

    show: function(sourceLine, panel, value)
    {
        this.target = sourceLine;
        this.panel = panel;

        this.getAutoCompleter().reset();

        Dom.hide(this.box, true);
        panel.panelNode.appendChild(this.box);

        this.input.value = value;

        this.setSurroundings();

        setTimeout(function()
        {
            var offset = Dom.getClientOffset(sourceLine);

            var bottom = offset.y + sourceLine.offsetHeight;

            var y = bottom - this.box.offsetHeight;

            if(!panel.scrollTop)
                panel.scrollTop = 0;

            if (y < panel.scrollTop)
            {
                y = offset.y;
                this.box.classList.add("upsideDown");
            }
            else
            {
                this.box.classList.remove("upsideDown");
            }

            this.box.style.top = (y - panel.scrollTop) + "px";
            Dom.hide(this.box, false);

            this.input.focus();
            this.input.select();
        }.bind(this));
    },

    setSurroundings: function()
    {
        try
        {
            var editor = this.sourceEditor;
            var line = this.breakpoint.lineNo;
            var state = editor.getCodeMirrorStateForBreakpointLine(line);
            this.surroundings = editor.getSurroundingVariablesFromCodeMirrorState(state);
        }
        catch (exc)
        {
            TraceError.sysout("breakpointConditionEditor.getSurroundings FAILS", exc);
            this.surroundings = null;
        }
    },

    hide: function()
    {
        this.box.parentNode.removeChild(this.box);

        delete this.target;
        delete this.panel;
    },

    layout: function()
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    endEditing: function(target, value, cancel)
    {
        this.callback(this.breakpoint, value, cancel);
    },
});

// ********************************************************************************************* //
// Registration

return ConditionEditor;

// ********************************************************************************************* //
});
