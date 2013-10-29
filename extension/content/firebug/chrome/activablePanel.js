/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/chrome/panel",
],
function(Firebug, FBTrace, Obj, Options, Panel) {

"use strict";

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// Implementation

/**
 * @panel This object represents a panel with two states: enabled/disabled. Such support
 * is important for panel that represents performance penalties and it's useful for the
 * user to have the option to disable them.
 *
 * All methods in this object are used on the prototype object (they represent class methods)
 * and so, |this| points to the panel's prototype and *not* to the panel instance.
 */
var ActivablePanel = Obj.extend(Panel,
/** @lends ActivablePanel */
{
    activable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    isActivable: function()
    {
        return this.activable;
    },

    isEnabled: function()
    {
        if (!this.isActivable())
            return true;

        if (!this.name)
            return false;

        return Options.get(this.name + ".enableSites");
    },

    setEnabled: function(enable)
    {
        if (!this.name || !this.activable)
            return;

        Options.set(this.name + ".enableSites", enable);
    },

    /**
     * Called when an instance of this panel type is enabled or disabled. Again notice that
     * this is a class method and so, panel instance variables (like e.g. context) are
     * not accessible from this method.
     * @param {Object} enable Set to true if this panel type is now enabled.
     */
    onActivationChanged: function(enable)
    {
        // TODO: Use ActivableModule.addObserver to express dependencies on modules.
    },
});

// ********************************************************************************************* //
// Registration

// xxxHonza: backward compatibility
Firebug.ActivablePanel = ActivablePanel;

return ActivablePanel;

// ********************************************************************************************* //
});
