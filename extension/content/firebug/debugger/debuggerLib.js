/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false*/
/*global FBTrace:true, Components:true, define:true */

define([
    "firebug/lib/wrapper",
],
function(Wrapper) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;

// Debuggees
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

        // xxxFlorent: For a reason I ignore, there are some conflicts with the ShareMeNot addon.
        //   As a workaround, we unwrap the global object.
        //   TODO see what cause that behaviour, why, and if there are no other addons in that case.
        var contentView = Wrapper.getContentView(global);
        dglobal = dbg.addDebuggee(contentView);
        dbg.removeDebuggee(contentView);
        dglobalWeakMap.set(global.document, dglobal);

        if (FBTrace.DBG_DEBUGGER)
            FBTrace.sysout("new debuggee global instance created", dglobal);
    }
    return dglobal;
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
}

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
