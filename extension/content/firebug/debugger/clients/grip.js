/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function (FBTrace) {

// ********************************************************************************************* //
// Resources

// https://wiki.mozilla.org/Remote_Debugging_Protocol#Grips

// ********************************************************************************************* //
// Object Grip

function Grip(grip)
{
    this.grip = grip;
}

/**
 * @object Represents a grip object from RDP.
 * See also: https://wiki.mozilla.org/Remote_Debugging_Protocol#Grips
 */
Grip.prototype =
/** @lends Grip */
{
    getActor: function()
    {
        return this.grip.actor;
    },

    getType: function()
    {
        if (!this.grip)
            return "";

        if (this.grip.prototype)
            return this.grip.prototype["class"];

        return this.grip["class"];
    },

    getValue: function()
    {
        // The value must be provided by derived objects.
        return this.value;
    },

    getName: function()
    {
        // The name must be provided by derived objects
        return this.name;
    },
}

// ********************************************************************************************* //
// Registration

return Grip;

// ********************************************************************************************* //
});
