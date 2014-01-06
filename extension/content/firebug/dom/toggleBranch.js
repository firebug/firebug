/* See license.txt for terms of usage */
/*global define:1*/

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// ToggleBranch Implementation

function ToggleBranch()
{
    this.props = new Map();
}

/**
 * @object Helper object that stores presentation state (expanded nodes) of a {@DomTree} widget.
 * The object has an internal map, keys of which are property names, and values other
 * ToggleBranch objects.
 */
ToggleBranch.prototype =
/** @lends ToggleBranch */
{
    /**
     * return the toggle branch at name
     */
    get: function(name)
    {
        return this.props.get(name) || null;
    },

    /**
     * value will be another toggle branch
     */
    set: function(name, value)
    {
        if (value && !(value instanceof ToggleBranch))
        {
            TraceError.sysout("toggleBranch.set; ERROR " + name + ", " + value +
                " not set to a ToggleBranch!");
        }

        this.props.set(name, value);
    },

    /**
     * remove the toggle branch at name
     */
    remove: function(name)
    {
        this.props.delete(name);
    },

    toString: function()
    {
        return "[ToggleBranch]";
    },

    isEmpty: function()
    {
        return !this.props.size;
    },

    clone: function()
    {
        var newToggles = new ToggleBranch();
        this.props.forEach(function(value, name)
        {
            newToggles.set(name, value.clone());
        });
        return newToggles;
    }
};

// ********************************************************************************************* //

return {
    ToggleBranch: ToggleBranch
};

// ********************************************************************************************* //
});
