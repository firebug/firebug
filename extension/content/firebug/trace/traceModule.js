/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/chrome/module",
],
function(Firebug, Obj, Module) {

// ********************************************************************************************* //
// Trace Module

/**
 * @module Use Firebug.TraceModule to register/unregister a trace listener that can be
 * used to customize look and feel of log messages in Tracing Console.
 *
 * Firebug.TraceModule.addListener - appends a tracing listener.
 * Firebug.TraceModule.removeListener - removes a tracing listener.
 */
Firebug.TraceModule = Obj.extend(Module,
{
    dispatchName: "traceModule",

    getListenerByPrefix: function(prefix)
    {
        for (var i=0; i<this.fbListeners.length; i++)
        {
            var listener = this.fbListeners[i];
            if (listener.prefix == prefix)
                return listener;
        }
    }
});

// ********************************************************************************************* //
// Registration

return Firebug.TraceModule;

// ********************************************************************************************* //
});
