/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/module",
    "firebug/dom/domBreakpointGroup",
],
function(Firebug, FBTrace, Obj, Module, DOMBreakpointGroup) {

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_DOM");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// DOM Module

var DOMModule = Obj.extend(Module,
{
    dispatchName: "domModule",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(prefDomain, prefNames)
    {
        Module.initialize.apply(this, arguments);

        if (Firebug.Debugger)
            Firebug.connection.addListener(this.DebuggerListener);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        if (Firebug.Debugger)
            Firebug.connection.removeListener(this.DebuggerListener);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context

    initContext: function(context, persistedState)
    {
        Firebug.Module.initContext.apply(this, arguments);

        context.dom = {breakpoints: new DOMBreakpointGroup()};
    },

    loadedContext: function(context, persistedState)
    {
        context.dom.breakpoints.load(context);
    },

    destroyContext: function(context, persistedState)
    {
        Firebug.Module.destroyContext.apply(this, arguments);

        context.dom.breakpoints.store(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DOM Breakpoints

    toggleBreakpoint: function(context, object, name)
    {
        var breakpoints = context.dom.breakpoints;
        var bp = breakpoints.findBreakpoint(object, name);

        Trace.sysout("domModule.toggleBreakpoint; " + name, object);

        // Add new or remove an existing breakpoint.
        if (bp)
        {
            breakpoints.removeBreakpoint(object, name);
            this.dispatch("onDomBreakpointRemoved", [context, object, name]);
        }
        else
        {
            breakpoints.addBreakpoint(object, name, context);
            this.dispatch("onDomBreakpointAdded", [context, object, name]);
        }
    }
});

// ********************************************************************************************* //

DOMModule.DebuggerListener =
{
    getBreakpoints: function(context, groups)
    {
        if (!context.dom.breakpoints.isEmpty())
            groups.push(context.dom.breakpoints);
    }
};

// ********************************************************************************************* //
// Registration

Firebug.registerModule(DOMModule);

// xxxHonza: backward compatibility
Firebug.DOMModule = DOMModule;

return DOMModule;

// ********************************************************************************************* //
});

