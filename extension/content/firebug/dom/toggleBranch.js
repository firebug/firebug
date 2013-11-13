/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

var metaNames =
[
    "prototype",
    "constructor",
    "__proto__",
    "toString",
    "toSource",
    "hasOwnProperty",
    "getPrototypeOf",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
    "__noSuchMethod__",
    "propertyIsEnumerable",
    "isPrototypeOf",
    "watch",
    "unwatch",
    "valueOf",
    "toLocaleString"
];

var Trace = FBTrace.to("DBG_DOM");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// ToggleBranch Implementation

function ToggleBranch()
{
    this.normal = {};
    this.meta = {};
}

/**
 * @object Helper object that stores presentation state (expanded nodes) of a {@DomTree} widget.
 * The object has two internal maps.
 *
 * 1) normal: the key is a name of expanded node and the value is instance of another
 *      {@ToggleBranch} object that keeps map of expanded nodes for the underlying (child) branch.
 * 2) meta: has the same structure as 'normal' map, but stores names that are considered
 *      as 'meta' and prefixed with 'meta_' string. See 'metaNames' array that lists all
 *      meta properties.
 */
ToggleBranch.prototype =
/** @lends ToggleBranch */
{
    /**
     * Another implementation could simply prefix all keys with "#".
     */
    getMeta: function(name)
    {
        if (metaNames.indexOf(name) !== -1)
            return "meta_" + name;
    },

    /**
     * return the toggle branch at name
     */
    get: function(name)
    {
        var metaName = this.getMeta(name);
        var value = null;

        if (metaName)
            value = this.meta[metaName];
        else if (this.normal.hasOwnProperty(name))
            value = this.normal[name];

        if (value && !(value instanceof ToggleBranch))
        {
            TraceError.sysout("toggleBranch.get; ERROR " + name +
                " not set to a ToggleBranch!");
        }

        return value;
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

        var metaName = this.getMeta(name);
        if (metaName)
            return this.meta[metaName] = value;
        else
            return this.normal[name] = value;
    },

    /**
     * remove the toggle branch at name
     */
    remove: function(name)
    {
        var metaName = this.getMeta(name);
        if (metaName)
            delete this.meta[metaName];
        else
            delete this.normal[name];
    },

    toString: function()
    {
        return "[ToggleBranch]";
    },

    isEmpty: function()
    {
        for (var name in this.normal)
            return false;

        for (var name in this.meta)
            return false;

        return true;
    },

    clone: function(toggles)
    {
        var newToggles = new ToggleBranch();

        for (var name in this.normal)
            newToggles.set(name, this.normal[name].clone());

        for (var name in this.meta)
            newToggles.set(name, this.meta[name].clone());

        return newToggles;
    }
};

// ********************************************************************************************* //

return {
    ToggleBranch: ToggleBranch
};

// ********************************************************************************************* //
});
