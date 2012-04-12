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
            return TraceObj;
        }
    };
}

// ********************************************************************************************* //

return scope.traceConsoleService.getTracer("extensions.firebug");

// ********************************************************************************************* //
});