/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
],
function(Obj, Firebug) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //

Firebug.JSD2Debugger = Obj.extend(Firebug.ActivableModule,
{
    dispatchName: "JSD2Debugger",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Firebug.ActivableModule.initialize.apply(this, arguments);
    },

    shutdown: function()
    {
        Firebug.ActivableModule.destroy.apply(this, arguments);
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerActivableModule(Firebug.JSD2Debugger);

return Firebug.JSD2Debugger;

// ********************************************************************************************* //
});
