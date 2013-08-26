/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);

const WARNING_FLAG = Ci.nsIScriptError.warningFlag;

// ********************************************************************************************* //
// Trace Window Implementation

var TraceErrorListener =
{
    startObserving: function()
    {
        if (this.isObserving)
            return;

        if (consoleService)
            consoleService.registerListener(this);

        this.isObserving = true;
    },

    stopObserving: function()
    {
        if (!this.isObserving)
            return;

        if (consoleService)
            consoleService.unregisterListener(this);

        this.isObserving = false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends consoleListener

    observe: function(object)
    {
        // Query interface (to access 'flags')
        var ScriptError = object instanceof Ci.nsIScriptError;

        // Ignore warnings
        if (object.flags & WARNING_FLAG)
            return;

        var message = (object.message ? object.message : object);
        FBTrace.sysout("Console Service ERROR " + message, object);
    },
};

// ********************************************************************************************* //
// Registration

return TraceErrorListener;

// ********************************************************************************************* //
});
