/* See license.txt for terms of usage */

define([
    "firebug/lib/trace"
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci["nsIConsoleService"]);

// ********************************************************************************************* //
// Module implementation

var Deprecated = {};
Deprecated.deprecated = function(msg, fnc, args)
{
    return function deprecationWrapper()
    {
        if (!this.nagged)
        {
            // drop frame with deprecated()
            var caller = Components.stack.caller;
            var explain = "Deprecated function, " + msg;

            if (typeof(FBTrace) !== undefined)
            {
                FBTrace.sysout(explain, getStackDump());

                //if (exc.stack)
                //    exc.stack = exc.stack.split("\n");

                FBTrace.sysout(explain + " " + caller.toString());
            }

            if (consoleService)
                consoleService.logStringMessage(explain + " " + caller.toString());

            this.nagged = true;
        }

        return fnc.apply(this, args || arguments);
    };
};

// ********************************************************************************************* //
// Local helpers

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
