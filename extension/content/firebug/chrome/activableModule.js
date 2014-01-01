/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/array",
    "firebug/chrome/module"
],
function(Firebug, FBTrace, Obj, Arr, Module) {

"use strict";

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// Implementation

/**
 * @module Should be used by modules (Firebug specific task controllers) that supports
 * activation. An example of such 'activable' module can be the debugger module
 * {@link Firebug.Debugger}, which can be disabled in order to avoid performance
 * penalties (in cases where the user doesn't need a debugger for the moment).
 */
var ActivableModule = Obj.extend(Module,
/** @lends ActivableModule */
{
    /**
     * Every activable module is disabled by default waiting for on a panel
     * that wants to have it enabled (and display provided data). The rule is
     * if there is no panel (view) the module is disabled.
     */
    enabled: false,

    /**
     * List of observers (typically panels). If there is at least one observer registered
     * The module becomes active.
     */
    observers: null,

    /**
     * List of dependent modules.
     */
    dependents: null,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Module.initialize.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Observers (dependencies)

    hasObservers: function()
    {
        return this.observers ? this.observers.length > 0 : false;
    },

    addObserver: function(observer)
    {
        if (!this.observers)
            this.observers = [];

        if (this.observers.indexOf(observer) === -1)
        {
            this.observers.push(observer);
            this.onObserverChange(observer);  // targeted, not dispatched.
        }
        // else no-op
    },

    removeObserver: function(observer)
    {
        if (!this.observers)
            return;

        if (this.observers.indexOf(observer) !== -1)
        {
            Arr.remove(this.observers, observer);
            this.onObserverChange(observer);  // targeted, not dispatched
        }
        // else no-op
    },

    /**
     * This method is called if an observer (e.g. {@link Panel}) is added or removed.
     * The module should decide about activation/deactivation upon existence of at least one
     * observer.
     */
    onObserverChange: function(observer)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Firebug Activation

    onSuspendingFirebug: function()
    {
        // Called before any suspend actions. First caller to return true aborts suspend.
    },

    onSuspendFirebug: function()
    {
        // When the number of activeContexts decreases to zero. Modules should remove
        // listeners, disable function that takes resources
    },

    onResumeFirebug: function()
    {
        // When the number of activeContexts increases from zero. Modules should undo the
        // work done in onSuspendFirebug
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module enable/disable APIs.

    isEnabled: function()
    {
        return this.hasObservers();
    },

    isAlwaysEnabled: function()
    {
        return this.hasObservers();
    }
});

// ********************************************************************************************* //
// Registration

// xxxHonza: backward compatibility
Firebug.ActivableModule = ActivableModule;

return ActivableModule;

// ********************************************************************************************* //
});
