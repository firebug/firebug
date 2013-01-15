/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/firebug",
],
function(FBTrace, Obj, Firebug) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var Trace = FBTrace.to("DBG_DEBUGGER");

// ********************************************************************************************* //

Firebug.JSD2.Debugger = Obj.extend(Firebug.ActivableModule,
{
    dispatchName: "JSD2.Debugger",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Firebug.ActivableModule.initialize.apply(this, arguments);
    },

    shutdown: function()
    {
        Firebug.ActivableModule.shutdown.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends ActivableModule

    onObserverChange: function(observer)
    {
        if (this.hasObservers())
            this.activateDebugger();
        else
            this.deactivateDebugger();
    },

    activateDebugger: function()
    {
        Trace.sysout("JSD2Debugger.activateDebugger;");
    },

    deactivateDebugger: function()
    {
        Trace.sysout("JSD2Debugger.deactivateDebugger;");
    },

    onSuspendFirebug: function()
    {
        if (!Firebug.JSD2.Debugger.isAlwaysEnabled())
            return;

        Trace.sysout("JSD2Debugger.onSuspendFirebug;");

        return false;
    },

    onResumeFirebug: function()
    {
        if (!Firebug.JSD2.Debugger.isAlwaysEnabled())
            return;

        Trace.sysout("JSD2Debugger.onResumeFirebug;");
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerActivableModule(Firebug.JSD2.Debugger);

return Firebug.JSD2.Debugger;

// ********************************************************************************************* //
});
