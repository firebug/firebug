/* See license.txt for terms of usage */
/*global define:1, Components:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/wrapper",
    "firebug/lib/xpcom",
    "firebug/chrome/panelActivation",
],
function(Firebug, FBTrace, Wrapper, Xpcom, PanelActivation) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;

var comparator = Xpcom.CCSV("@mozilla.org/xpcom/version-comparator;1", "nsIVersionComparator");
var appInfo = Xpcom.CCSV("@mozilla.org/xre/app-info;1", "nsIXULAppInfo");
var pre27 = (comparator.compare(appInfo.version, "27.0*") < 0);

// Debuggees
var dbgGlobalWeakMap = new WeakMap();

// Module object
var DebuggerLib = {};

// ********************************************************************************************* //
// Implementation

/**
 * Unwraps the value of a debuggee object. Primitive values are also allowed
 * and are let through unharmed.
 *
 * @param obj {Debugger.Object} The debuggee object to unwrap, or a primitive
 *
 * @return {object} the unwrapped object, or the same primitive
 */
DebuggerLib.unwrapDebuggeeValue = function(obj)
{
    // If not a debuggee object, return it immediately.
    if (typeof obj !== "object" || obj === null)
        return obj;

    return Wrapper.unwrapObject(obj.unsafeDereference());
};

/**
 * Gets or creates the debuggee global for the given global object
 *
 * @param {*} context The Firebug context
 * @param {Window} global The global object
 *
 * @return {Debuggee Window} The debuggee global
 */
DebuggerLib.getDebuggeeGlobal = function(context, global)
{
    global = global || context.getCurrentGlobal();

    var dbgGlobal = dbgGlobalWeakMap.get(global.document);
    if (!dbgGlobal)
    {
        var dbg = getInactiveDebuggerForContext(context);
        if (!dbg)
            return;

        // xxxFlorent: For a reason I ignore, there are some conflicts with the ShareMeNot addon.
        //   As a workaround, we unwrap the global object.
        //   TODO see what cause that behaviour, why, and if there are no other addons in that case.
        var contentView = Wrapper.getContentView(global);
        if (dbg.makeGlobalObjectReference)
        {
            dbgGlobal = dbg.makeGlobalObjectReference(contentView);
        }
        else
        {
            dbgGlobal = dbg.addDebuggee(contentView);
            dbg.removeDebuggee(contentView);
        }
        dbgGlobalWeakMap.set(global.document, dbgGlobal);

        if (FBTrace.DBG_DEBUGGER)
            FBTrace.sysout("new debuggee global instance created", dbgGlobal);
    }
    return dbgGlobal;
};

// temporary version-dependent check, should be removed when minVersion = 27
DebuggerLib._closureInspectionRequiresDebugger = function()
{
    return !pre27;
};

/**
 * Runs a callback with a debugger for a global temporarily enabled.
 *
 * Currently this throws an exception unless the Script panel is enabled, because
 * otherwise debug GCs kill us.
 */
DebuggerLib.withTemporaryDebugger = function(context, global, callback)
{
    // Pre Fx27, cheat and pass a disabled debugger, because closure inspection
    // works with disabled debuggers, and that's all we need this API for.
    if (!DebuggerLib._closureInspectionRequiresDebugger())
        return callback(DebuggerLib.getDebuggeeGlobal(context, global));

    if (!PanelActivation.isPanelEnabled(Firebug.getPanelType("script")))
        throw new Error("Script panel must be enabled");

    var dbg = getInactiveDebuggerForContext(context);
    var dbgGlobal = dbg.addDebuggee(global);
    try
    {
        return callback(dbgGlobal);
    }
    finally
    {
        dbg.removeDebuggee(dbgGlobal);
    }
};

/**
 * Returns true if the frame location refers to the command entered by the user
 * through the command line.
 *
 * @param {string} frameLocation
 *
 * @return {boolean}
 */
// xxxHonza: should be renamed. It's not only related to the CommandLine, but
// to all bogus scripts, e.g. generated from 'clientEvaluate' packets.
DebuggerLib.isFrameLocationEval = function(frameFilename)
{
    return frameFilename === "debugger eval code" || frameFilename === "self-hosted";
};

// ********************************************************************************************* //
// Local helpers

/**
 * Gets or creates the Inactive Debugger instance for the given context (singleton).
 *
 * @param context {*}
 *
 * @return {Debugger} The Debugger instance
 */
var getInactiveDebuggerForContext = function(context)
{
    var DebuggerClass;
    var scope = {};

    if (context.inactiveDebugger)
        return context.inactiveDebugger;

    try
    {
        Cu.import("resource://gre/modules/jsdebugger.jsm", scope);
        scope.addDebuggerToGlobal(window);
        DebuggerClass = window.Debugger;
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERROR)
            FBTrace.sysout("DebuggerLib.getInactiveDebuggerForContext; Debugger not found", exc);
    }

    // If the Debugger Class was not found, make this function no-op.
    if (!DebuggerClass)
        getInactiveDebuggerForContext = function() {};

    var dbg = new DebuggerClass();
    dbg.enabled = false;
    context.inactiveDebugger = dbg;
    return dbg;
};

// ********************************************************************************************* //
// Registration

return DebuggerLib;

// ********************************************************************************************* //
});
