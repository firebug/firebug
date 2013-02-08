/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu["import"]("resource://gre/modules/Services.jsm");

var Diff = {};

try
{
    Services.scriptloader.loadSubScript("chrome://fbtest/content/jsdiff.js", Diff);
}
catch (err)
{
    if (FBTrace.DBG_ERRORS)
        FBTrace.sysout("jsStringDiff; EXCEPTION " + err, err);
}

// ********************************************************************************************* //
// Registration

return {
    diffString: Diff.diffString,
    escapeText: Diff.escapeText
}

// ********************************************************************************************* //
});
