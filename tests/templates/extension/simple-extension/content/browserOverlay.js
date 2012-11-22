/* See license.txt for terms of usage */

(function() {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;

var jsd = Cc["@mozilla.org/js/jsd/debugger-service;1"].getService(Ci.jsdIDebuggerService);

// ********************************************************************************************* //
// Initialization

var Extension =
{
    initialize: function()
    {
    },

    shutdown: function()
    {
    },
};

// ********************************************************************************************* //
// Logging

function sysout(msg)
{
    Components.utils.reportError(msg);
    dump(msg + "\n");
}

// ********************************************************************************************* //
// Registration

window.addEventListener("load", function() { Extension.initialize(); }, false);
window.addEventListener("unload", function() { Extension.shutdown(); }, false);

// ********************************************************************************************* //
})();
