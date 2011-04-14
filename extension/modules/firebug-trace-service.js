/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var EXPORTED_SYMBOLS = ["traceConsoleService"];

// ************************************************************************************************
// Service implementation

/**
 * This implementation serves as a proxy to the FBTrace extension. All logs are forwarded
 * to t
 */
try
{
    Components.utils["import"]("resource://fbtrace/firebug-trace-service.js");
}
catch (err)
{
    dump("FBTrace is not installed, use default (empty) implementation.\n");

    var traceConsoleService =
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

