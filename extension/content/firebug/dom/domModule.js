/* See license.txt for terms of usage */

define([
    "firebug/chrome/module",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/dom/domBreakpointGroup",
],
function(Module, Obj, Firebug, DOMBreakpointGroup) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// DOM Module

Firebug.DOMModule = Obj.extend(Module,
{
    dispatchName: "domModule",

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
});

// ********************************************************************************************* //

Firebug.DOMModule.DebuggerListener =
{
    getBreakpoints: function(context, groups)
    {
        if (!context.dom.breakpoints.isEmpty())
            groups.push(context.dom.breakpoints);
    }
};

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.DOMModule);

return Firebug.DOMModule;

// ********************************************************************************************* //
});

