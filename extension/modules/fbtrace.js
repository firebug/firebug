/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Our global trace object.

var EXPORTED_SYMBOLS = ["FBTrace"];

var scope = {};
Components.utils["import"]("resource://firebug/firebug-trace-service.js", scope);
var FBTrace = scope.traceConsoleService.getTracer("extensions.firebug");

// ********************************************************************************************* //
