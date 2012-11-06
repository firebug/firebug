/* See license.txt for terms of usage */

define([], function() {

// ********************************************************************************************* //
// Constants

const Cu = Components.utils;

var scope = {};
Cu["import"]("resource://firebug/fbtrace.js", scope);

// ********************************************************************************************* //
// Wrapper

/**
 * Wraps tracer for given option. Logs made through the wrapper will automatically
 * be checked against the option and only displayed if the option is true.
 * If FBTrace console isn't installed all options are false and there is no
 * additional performance penalty.
 */
function TraceWrapper(tracer, option)
{
    function createMethodWrapper(method)
    {
        return function()
        {
            // Check the option before the log is passed to the tracing console.
            if (tracer[option])
                tracer[method].apply(tracer, arguments);
        }
    }

    for (var i=0; i<TraceAPI.length; i++)
    {
        var method = TraceAPI[i];
        this[method] = createMethodWrapper(method);
    }
}

// ********************************************************************************************* //

var tracer = scope.FBTrace;

/**
 * Support for scoped logging.
 * 
 * Example:
 * FBTrace = FBTrace.to("DBG_NET");
 * 
 * // This log will be displayed only if DBG_NET option is on
 * FBTrace.sysout("net.initialiaze");
 */
tracer.to = function(option)
{
    return new TraceWrapper(this, option);
}

return tracer;

// ********************************************************************************************* //
});
