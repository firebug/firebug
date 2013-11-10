/* See license.txt for terms of usage */

define([
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/console/inlineJSEditor",
],
function(Dom, Domplate, Events, JSEditor) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, DIV, INPUT} = Domplate;

// ********************************************************************************************* //
// DOM Inline Editor

function DOMEditor(doc)
{
    this.box = this.tag.replace({}, doc, this);
    this.input = this.box.childNodes[1];

    var completionBox = this.box.childNodes[0];
    var options = {
        includeCurrentScope: true
    };

    this.setupCompleter(completionBox, options);
}

DOMEditor.prototype = domplate(JSEditor.prototype,
{
    tag:
        DIV({style: "position: absolute;"},
            INPUT({"class": "fixedWidthEditor completionBox", type: "text",
                tabindex: "-1"}),
            INPUT({"class": "fixedWidthEditor completionInput", type: "text",
                oninput: "$onInput", onkeypress: "$onKeyPress"})),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    endEditing: function(target, value, cancel)
    {
        // XXXjoe Kind of hackish - fix me
        delete this.panel.context.thisValue;

        if (cancel || value === "")
            return;

        var row = Dom.getAncestorByClass(target, "memberRow");

        Events.dispatch(this.panel.fbListeners, "onWatchEndEditing", [this.panel]);

        if (!row)
            this.panel.addWatch(value);
        else if (row.classList.contains("watchRow"))
            this.panel.setWatchValue(row, value);
        else
            this.panel.setPropertyValue(row, value);
    }
});

// ********************************************************************************************* //
// Registration

return DOMEditor;

// ********************************************************************************************* //
});
