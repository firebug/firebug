/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/chrome/reps",
],
function(FBTrace, FirebugReps) {

"use strict"

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// ErrorCopy Object Implementation

var ErrorCopy = function(message)
{
    this.message = message;
}

// ********************************************************************************************* //
// Registration

// xxxHonza: back compatibility
FirebugReps.ErrorCopy = ErrorCopy;

return ErrorCopy;

// ********************************************************************************************* //
});
