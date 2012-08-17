/* See license.txt for terms of usage */

define([], function() {

//********************************************************************************************* //
//Constants

const Cu = Components.utils;

// ********************************************************************************************* //
// Firebug Trace - FBTrace

var scope = {};

try
{
    Cu["import"]("resource://fbtrace/firebug-trace-service.js", scope);
}
catch (err)
{
    scope.traceConsoleService =
    {
        getTracer: function(prefDomain)
        {
            var TraceAPI = ["dump", "sysout", "setScope", "matchesNode", "time", "timeEnd"];
            var TraceObj = {};
            for (var i=0; i<TraceAPI.length; i++)
                TraceObj[TraceAPI[i]] = function() {};

            // If the FBTrace object is requested too soon, when the Tracing Console
            // doesn't yet exist, let's change that default sysout method so, it
            // tries to get the object again.
            TraceObj.sysout = function(msg)
            {
                try
                {
                    Cu.import("resource://fbtrace/firebug-trace-service.js", scope);
                    var FBTrace = scope.traceConsoleService.getTracer("extensions.firebug");
                    FBTrace.sysout.apply(FBTrace, arguments);
                }
                catch (err)
                {
                    //Cu.reportError(getStackDump());
                    Cu.reportError(msg);
                }

            }

            return TraceObj;
        }
    };
}

// ********************************************************************************************* //

function getStackDump()
{
    var lines = [];
    for (var frame = Components.stack; frame; frame = frame.caller)
        lines.push(frame.filename + " (" + frame.lineNumber + ")");

    return lines.join("\n");
};

// ********************************************************************************************* //

return scope.traceConsoleService.getTracer("extensions.firebug");

// ********************************************************************************************* //
});