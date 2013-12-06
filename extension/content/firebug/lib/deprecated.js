/* See license.txt for terms of usage */

define([
    "firebug/lib/trace"
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci["nsIConsoleService"]);

// ********************************************************************************************* //
// Module implementation

var Deprecated = {};

Deprecated.method = function(msg, fnc, args)
{
    return function deprecationWrapper()
    {
        showMessage(this, msg);
        return fnc.apply(this, args || arguments);
    };
};

Deprecated.property = function(object, prop, value, msg)
{
    object.__defineGetter__(prop, function deprecatedGetter()
    {
        showMessage(this, msg);
        return value;
    });
};

// ********************************************************************************************* //
// Local helpers

function showMessage(self, msg)
{
    if (self.nagged)
        return;

    // Drop frames coming from this module.
    var caller = Components.stack.caller.caller;
    var explain = "Deprecated property, " + msg;

    if (typeof(FBTrace) !== undefined)
    {
        FBTrace.sysout(explain, getStackDump());
        FBTrace.sysout(explain + " " + caller.toString());
    }

    if (consoleService)
        consoleService.logStringMessage(explain + " " + caller.toString());

    self.nagged = true;
}

function getStackDump()
{
    var lines = [];
    for (var frame = Components.stack; frame; frame = frame.caller)
        lines.push(frame.filename + " (" + frame.lineNumber + ")");

    return lines.join("\n");
};

// ********************************************************************************************* //
// Registration

return Deprecated;

// ********************************************************************************************* //
});
