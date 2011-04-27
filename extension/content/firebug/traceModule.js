/* See license.txt for terms of usage */

define([], function() {

// ************************************************************************************************
// Trace Module

/**
 * @module Use Firebug.TraceModule to register/unregister a trace listener that can be
 * used to customize look and feel of log messages in Tracing Console.
 * 
 * Firebug.TraceModule.addListener - appends a tracing listener.
 * Firebug.TraceModule.removeListener - removes a tracing listener.
 */
Firebug.TraceModule = FBL.extend(Firebug.Module,
{
    dispatchName: "traceModule",
});

return Firebug.TraceModule;

// ************************************************************************************************
});
