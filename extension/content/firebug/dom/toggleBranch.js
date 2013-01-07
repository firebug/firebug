/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

function ToggleBranch()
{
    this.normal = {};
    this.meta = {};
}

var metaNames =
[
 'prototype',
 'constructor',
 '__proto__',
 'toString',
 'toSource',
 'hasOwnProperty',
 'getPrototypeOf',
 '__defineGetter__',
 '__defineSetter__',
 '__lookupGetter__',
 '__lookupSetter__',
 '__noSuchMethod__',
 'propertyIsEnumerable',
 'isPrototypeOf',
 'watch',
 'unwatch',
 'valueOf',
 'toLocaleString'
];

ToggleBranch.prototype =
{
    // Another implementation could simply prefix all keys with "#".
    getMeta: function(name)
    {
        if (metaNames.indexOf(name) !== -1)
            return "meta_"+name;
    },

    get: function(name)  // return the toggle branch at name
    {
        var metaName = this.getMeta(name);
        var value = null;
        if (metaName)
            value = this.meta[metaName];
        else if (this.normal.hasOwnProperty(name))
            value = this.normal[name];

        if (FBTrace.DBG_DOMPLATE)
            if (value && !(value instanceof ToggleBranch))
                FBTrace.sysout("ERROR ToggleBranch.get("+name+") not set to a ToggleBranch!");

        return value;
    },

    set: function(name, value)  // value will be another toggle branch
    {
        if (FBTrace.DBG_DOMPLATE)
            if (value && !(value instanceof ToggleBranch))
                FBTrace.sysout("ERROR ToggleBranch.set("+name+","+value+") not set to a ToggleBranch!");

        var metaName = this.getMeta(name);
        if (metaName)
            return this.meta[metaName] = value;
        else
            return this.normal[name] = value;
    },

    remove: function(name)  // remove the toggle branch at name
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
};

// ********************************************************************************************* //

return {
    ToggleBranch: ToggleBranch
};

// ********************************************************************************************* //
});
