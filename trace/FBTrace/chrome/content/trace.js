/* See license.txt for terms of usage */

define([
],
function() {

// ********************************************************************************************* //
// Implementation

var FBTrace = {};

try
{
    var scope = {};
    Components.utils["import"]("resource://fbtrace/firebug-trace-service.js", scope);

    FBTrace = scope.traceConsoleService.getTracer("extensions.firebug");
    FBTrace.setScope(window);

    function clearFBTraceScope()
    {
        window.removeEventListener("unload", clearFBTraceScope, true);
        FBTrace.setScope(null);
    }

    window.addEventListener("unload", clearFBTraceScope, true);
    FBTrace.time("SCRIPTTAG_TIME");
}
catch (err)
{
    dump("FBTrace; " + err);
}

// ********************************************************************************************* //
// Registration

return FBTrace;

// ********************************************************************************************* //
});
