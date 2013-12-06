/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/eventSource",
],
function(Firebug, FBTrace, Obj, EventSource) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Implementation

/**
 * @object Base class for all tool objects. Every derived tool must define a constructor and
 * register with <code>Firebug.registerTool</code> method. An instance of the tool
 * object is created by the framework for each browser tab where Firebug is activated.
 * The life cycle of a tool object is the same as for a {@Panel}, but there is no UI
 * associated with tools. Tool objects can often serve as controllers, where the view is
 * {@Panel} and the document is {@TabContext}.
 */
var Tool = Obj.extend(new EventSource(),
/** @lends Tool */
{
});

// ********************************************************************************************* //
// Registration

return Tool;

// ********************************************************************************************* //
});
