/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
],
function (Obj, Firebug) {

// ********************************************************************************************* //
// Script panel

Firebug.JSD2ScriptPanel = function() {};

Firebug.JSD2ScriptPanel.prototype = Obj.extend(Firebug.SourceBoxPanel,
{
    dispatchName: "JSD2ScriptPanel",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "jsd2script",
    searchable: true,
    breakable: true,
    enableA11y: true,
    order: 45,

    initialize: function(context, doc)
    {
        Firebug.SourceBoxPanel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        Firebug.SourceBoxPanel.destroy.apply(this, arguments);
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(Firebug.JSD2ScriptPanel);

return Firebug.JSD2ScriptPanel;

// ********************************************************************************************* //
});