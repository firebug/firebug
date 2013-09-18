/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/firebug",
    "firebug/lib/dom",
    "firebug/chrome/firefox",
],
function(Obj, Options, Firebug, Dom, Firefox) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //

/**
 * This module is responsible for various hacky solutions related to known issues.
 */
Firebug.KnownIssues = Obj.extend(Firebug.Module,
/** @lends Firebug.KnownIssues */
{
    dispatchName: "knownIssues",

    initialize: function()
    {
        // TODO: put any workarounds here
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.KnownIssues);

return Firebug.KnownIssues;

// ********************************************************************************************* //
});
