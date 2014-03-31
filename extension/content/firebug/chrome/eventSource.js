/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/events",
    "firebug/lib/array",
],
function(Firebug, FBTrace, Events, Arr) {

"use strict";

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Implementation

/**
 * Support for listeners registration. This object is also extended by Module,
 * so all modules supports listening automatically. Note that an array of listeners is
 * created for each instance of a module within the initialize method. Thus all derived
 * module classes must ensure that the Module.initialize method is called for the
 * super class.
 */
function EventSource()
{
    // The array is created when the first listeners is added.
    // It can't be created here since derived objects would share
    // the same array.
    this.fbListeners = null;
};

EventSource.prototype =
{
    addListener: function(listener)
    {
        if (!listener)
        {
            TraceError.sysout("firebug.Listener.addListener; ERROR null listener registered.");
            return;
        }

        // Delay the creation until the objects are created so 'this' causes new array
        // for this object (e.g. module, panel, etc.)
        if (!this.fbListeners)
            this.fbListeners = [];

        this.fbListeners.push(listener);
    },

    removeListener: function(listener)
    {
        // if this.fbListeners is null, remove is being called with no add
        if (this.fbListeners)
            Arr.remove(this.fbListeners, listener);
    },

    dispatch: function(eventName, args)
    {
        if (this.fbListeners && this.fbListeners.length > 0)
            return Events.dispatch(this.fbListeners, eventName, args);

        return [];
    },

    dispatch2: function(eventName, args)
    {
        if (this.fbListeners && this.fbListeners.length > 0)
            return Events.dispatch2(this.fbListeners, eventName, args);
    }
};

// ********************************************************************************************* //
// Registration

// xxxHonza: backward compatibility
Firebug.Listener = EventSource;

return EventSource;

// ********************************************************************************************* //
});
