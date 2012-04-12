/* See license.txt for terms of usage */

var FBTrace = {};

try
{
    Components.utils["import"]("resource://fbtrace/firebug-trace-service.js");

    FBTrace = traceConsoleService.getTracer("extensions.firebug");
    FBTrace.setScope(window);

    function clearFBTraceScope()
    {
        window.removeEventListener('unload', clearFBTraceScope, true);
        FBTrace.setScope(null);
    }

    window.addEventListener('unload', clearFBTraceScope, true);
    FBTrace.time("SCRIPTTAG_TIME");
}
catch (err)
{
    dump("FBTrace; " + err);
}
