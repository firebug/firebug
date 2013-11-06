/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/chrome/reps",
],
function(FBTrace, FirebugReps) {

"use strict"

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// ErrorCopy Object Implementation

/**
 * @object Represents custom error object with an error message. The UI should be able
 * to deal with the object through {@Exception} template (firebug/console/exceptionRep module)
 */
var ErrorCopy = function(message)
/** @lends ErrorCopy */
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
