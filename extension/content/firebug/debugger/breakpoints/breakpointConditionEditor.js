/* See license.txt for terms of usage */

define([
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/console/inlineJSEditor",
],
function(Domplate, Locale, Dom, JSEditor) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, DIV, INPUT} = Domplate;

// ********************************************************************************************* //
// Condition Editor

function ConditionEditor(doc)
{
    this.initialize(doc);
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

    initialize: function(doc)
    {
        this.box = this.tag.replace({}, doc, this);
        this.input = this.box.getElementsByClassName("completionInput").item(0);

        var completionBox = this.box.getElementsByClassName("completionBox").item(0);
        var options = {
            tabWarnings: true
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

        setTimeout(function()
        {
            var offset = Dom.getClientOffset(sourceLine);

            var bottom = offset.y + sourceLine.offsetHeight;

            var y = bottom - this.box.offsetHeight;
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
