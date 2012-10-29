/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

var EXPORTED_SYMBOLS = ["traceConsoleService"];

// ********************************************************************************************* //
// Service implementation

/**
 * This implementation serves as a proxy to the FBTrace extension. All logs are forwarded
 * to the FBTrace service as soon as it's available.
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
            // Will be initialized as soon as FBTrace console is available.
            var FBTrace;

            // Fake FBTrace object (empty implementation)
            var TraceObj = {};
            var TraceAPI = ["dump", "sysout", "setScope", "matchesNode", "time", "timeEnd"];
            for (var i=0; i<TraceAPI.length; i++)
                TraceObj[TraceAPI[i]] = function() {};

            // Create FBTrace proxy. As soon as FBTrace console is available it'll forward
            // all calls to it.
            return Proxy.create(
            {
                get: function(target, name)
                {
                    FBTrace = getFBTrace();
                    return FBTrace ? FBTrace[name] : TraceObj[name];
                },

                set: function(target, name, value)
                {
                    if (FBTrace)
                        FBTrace[name] = value;
                    return true;
                },
            });
        }
    };
}

// ********************************************************************************************* //

function getFBTrace()
{
    try
    {
        var scope = {};
        Cu.import("resource://fbtrace/firebug-trace-service.js", scope);
        return scope.traceConsoleService.getTracer("extensions.firebug");
    }
    catch (err)
    {
        //Cu.reportError(getStackDump());
        //Cu.reportError(msg);
    }
}

// ********************************************************************************************* //

function getStackDump()
{
    var lines = [];
    for (var frame = Components.stack; frame; frame = frame.caller)
        lines.push(frame.filename + " (" + frame.lineNumber + ")");

    return lines.join("\n");
};
