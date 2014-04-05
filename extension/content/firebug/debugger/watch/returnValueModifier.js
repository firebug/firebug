/* See license.txt for terms of usage */
/*jshint noempty:false, esnext:true, curly:false, moz:true*/
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/module",
    "firebug/debugger/debuggerLib",
], function(Firebug, FBTrace, Obj, Module, DebuggerLib) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_RETURNVALUEMODIFIER");

// ********************************************************************************************* //
// Variables

var wmUserReturnValues = new WeakMap();
var wmDbg = new WeakMap();

// ********************************************************************************************* //
// Return Value Modifier

/**
 * @module Module to manage the user-defined return value:
 *  - responsible of storing and fetching the user-defined return values of the frames.
 *  - manages the debugger that changes them (i.e. it creates and destroy it by its own).
 *  - listens to the onPop() event so it modifies the value being returned.
 */
var ReturnValueModifier = Obj.extend(Module, {
/** @lends BreakOnNext */

    dispatchName: "ReturnValueModifier",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initContext: function(context)
    {
        var tool = context.getTool("debugger");
        tool.addListener(this);
    },

    destroyContext: function(context)
    {
        var tool = context.getTool("debugger");
        tool.removeListener(this);
        destroyDebuggerForContext(context);
    },

    setUserReturnValue: function(context, userReturnValue)
    {
        var frame = getDebugger(context).getNewestFrame();
        if (!frame)
        {
            TraceError.sysout("debuggerTool.setReturnValue; newest frame not found");
            return;
        }

        // Note: userReturnValue is not a grip, so undefined and null are valid values.
        wmUserReturnValues.set(frame, userReturnValue);

        if (frame.onPop)
        {
            Trace.sysout("debuggerTool.attachOnPopToTopFrame; frame.onPop already attached");
            return;
        }

        frame.onPop = this.onPopFrame.bind(this, frame, context);
    },

    /**
     * Returns the return value set by the user, as follow:
     * - If there is no return value, return {"found": false}
     * - If there is, return an object of this form: {"userReturnValue": returnValue, "found": true}
     *
     * Note that the return value can be null or undefined. That's why an object is returned
     * in any case with the "found" property.
     *
     * @return {Object} The object has described above.
     */
    getUserReturnValue: function(context)
    {
        var frame = getDebugger(context).getNewestFrame();
        if (!frame || !wmUserReturnValues.has(frame))
            return {"found": false};

        var userReturnValue = wmUserReturnValues.get(frame);

        return {"found": true, "userReturnValue": userReturnValue};
    },

    /**
     * Gets the return value set by the user as a Grip, or null if not found.
     * Note: if the user has set it to null, the grip would be {type: "null"}.
     *
     * @return {Grip} The return value grip or null if not found.
     */
    getUserReturnValueAsGrip: function(context)
    {
        var {userReturnValue, found} = this.getUserReturnValue(context);
        if (!found)
            return null;

        var dbgGlobal = DebuggerLib.getThreadActor(context.browser).globalDebugObject;
        var dbgUserReturnValue = dbgGlobal.makeDebuggeeValue(userReturnValue);
        return DebuggerLib.createValueGrip(context, dbgUserReturnValue);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debugger.Frame Listeners

    /**
     * Debugger.Frame.prototype.onPop handler.
     * Responsible for changing the return value if the user has modified it.
     *
     * @param {Debugger.Frame} frame The frame in which we change the return value.
     * @param {TabContext} context
     * @param {*} completionValue The initial completion value
     *
     * @return {*} The modified return value.
     */
    onPopFrame: function(frame, context, completionValue)
    {
        if (!completionValue || !completionValue.hasOwnProperty("return"))
            return completionValue;

        var userReturnValue = wmUserReturnValues.get(frame);

        var wrappedUserReturnValue = frame.callee.global.makeDebuggeeValue(userReturnValue);

        return {"return": wrappedUserReturnValue};
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debugger Listeners

    onStartDebugging: function(context)
    {
        // getNewestFrame() is a Singleton that creates a Frame object (if not done before) and
        // returns it. We need to force that Frame object to be created while the debugger pauses
        // because it fetches only the instances that have been created to call the "onPop"
        // handlers. So when calling setReturnValue, it is too late to create that Frame object.
        // Also see: http://ur1.ca/gc9dy
        getDebugger(context).getNewestFrame();
    },

    onResumeDebugger: function(context)
    {
        // A debugger degrades performance a bit. So destroy it when the user resumes it.
        destroyDebuggerForContext(context);
    },

});

// ********************************************************************************************* //
// Helpers

/**
 * Singleton. Gets (and instanciate if not created) the debugger used to change the return value.
 *
 * @param {TabContext} context
 */
function getDebugger(context)
{
    var dbg = wmDbg.get(context);
    if (!dbg)
    {
        dbg = DebuggerLib.makeDebuggerForContext(context);
        wmDbg.set(context, dbg);

        // Make sure that the debugger is destroyed when the oldest frame is popped,
        // so we prevent useless performance penalty due to an active debugger.
        var oldestFrame = getOldestFrame(dbg.getNewestFrame());
        oldestFrame.onPop = destroyDebuggerForContext.bind(null, context);
    }

    return dbg;
}

/**
 * Returns the oldest frame of a call stack.
 * @param {Debugger.Frame} frame A frame of that call stack.
 */
function getOldestFrame(frame)
{
    var curFrame = frame;
    while (curFrame.older)
        curFrame = curFrame.older;

    return curFrame;
}

/**
 * Destroys the debugger.
 *
 * @param {TabContext} context
 */
function destroyDebuggerForContext(context)
{
    var dbg = wmDbg.get(context);
    if (!dbg)
        return;
    Trace.sysout("ReturnValueModifier.destroyDebuggerForContext", context);
    wmDbg.delete(context);
    DebuggerLib.destroyDebuggerForContext(context, dbg);
}
// ********************************************************************************************* //
// Registration

Firebug.registerModule(ReturnValueModifier);

return ReturnValueModifier;

});
