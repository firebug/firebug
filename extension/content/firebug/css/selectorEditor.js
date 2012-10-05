/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/locale",
],
function(Firebug, Domplate, Locale) {
with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// CSS Selector Editor

function SelectorEditor(panel)
{
    var doc = panel.document;

    this.panel = panel;
    this.box = this.tag.replace({}, doc, this);
    this.input = this.box;

    this.tabNavigation = false;
    this.tabCompletion = true;
    this.completeAsYouType = false;
    this.fixedWidth = true;
}

SelectorEditor.prototype = domplate(Firebug.InlineEditor.prototype,
{
    tag:
        INPUT({"class": "fixedWidthEditor a11yFocusNoTab",
            type: "text",
            title: Locale.$STR("Selector"),
            oninput: "$onInput",
            onkeypress: "$onKeyPress"}
        ),

    endEditing: function(target, value, cancel)
    {
        if (cancel)
            return;

        this.panel.setTrialSelector(target, value);
    },
});

// ********************************************************************************************* //
// Registration

return SelectorEditor;

// ********************************************************************************************* //
}});
