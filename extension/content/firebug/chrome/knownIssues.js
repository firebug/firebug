/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/object",
    "firebug/chrome/module",
],
function(Firebug, Obj, Module) {

"use strict";

// ********************************************************************************************* //

/**
 * This module is responsible for various hacks and workarounds related
 * to known platform issues.
 */
var KnownIssues = Obj.extend(Module,
/** @lends KnownIssues */
{
    dispatchName: "knownIssues",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(prefDomain, prefNames)
    {
        // TODO: put any workarounds here
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(KnownIssues);

return KnownIssues;

// ********************************************************************************************* //
});
