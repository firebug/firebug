/* See license.txt for terms of usage */

define([
],
function() {

"use strict";

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// Debugees
var dglobalWeakMap = new WeakMap();

// Module object
var DebuggerLib = {};

// ********************************************************************************************* //
// Implementation

/**
 * Unwraps the value of a debuggee object.
 *
 * @param obj {Debugger.Object} The debuggee object to unwrap
 * @param global {Window} The unwrapped global (window)
 * @param dglobal {Debugger.Object} The debuggee global object
 *
 * @return {object} the unwrapped object
 */
DebuggerLib.unwrapDebuggeeValue = function(obj, global, dglobal)
{
    // If not a debuggee object, return it immediately.
    if (typeof obj !== "object" || obj === null)
        return obj;

    if (obj.unsafeDereference)
        return obj.unsafeDereference();

    // Define a new property to get the debuggee value.
    dglobal.defineProperty("_firebugUnwrappedDebuggerObject", {
        value: obj,
        writable: true,
        configurable: true
    });

    // Get the debuggee value using the property through the unwrapped global object.
    return global._firebugUnwrappedDebuggerObject;
};

/**
 * Gets or creates the debuggee global for the given global object
 *
 * @param {Window} global The global object
 * @param {*} context The Firebug context
 *
 * @return {Debuggee Window} The debuggee global
 */
DebuggerLib.getDebuggeeGlobal = function(context, global)
{
    global = global || context.getCurrentGlobal();

    var dglobal = dglobalWeakMap.get(global.document);
    if (!dglobal)
    {
        var dbg = getInactiveDebuggerForContext(context);
        if (!dbg)
            return;

        dglobal = dbg.addDebuggee(global);
        dbg.removeDebuggee(global);
        dglobalWeakMap.set(global.document, dglobal);
    }
    return dglobal;
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
