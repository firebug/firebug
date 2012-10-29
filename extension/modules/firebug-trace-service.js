/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

var EXPORTED_SYMBOLS = ["traceConsoleService"];

// ************************************************************************************************
// Service implementation

/**
 * This implementation serves as a proxy to the FBTrace extension. All logs are forwarded
 * to the FBTrace service.
 */
try
{
    Cu["import"]("resource://fbtrace/firebug-trace-service.js");
}
catch (err)
{
    var traceConsoleService =
    {
        getTracer: function(prefDomain)
        {
            var TraceAPI = ["dump", "sysout", "setScope", "matchesNode", "time", "timeEnd"];
            var TraceObj = {};
            for (var i=0; i<TraceAPI.length; i++)
                TraceObj[TraceAPI[i]] = function() {};

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
