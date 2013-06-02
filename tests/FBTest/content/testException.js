/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

FBTestApp.TestException = function(win, msg, err)
{
    var msg = msg + " " + err + " " + err.fileName + " (" + err.lineNumber + ")";
    FBTestApp.TestResult.call(this, win, false, msg);

    this.err = err;
    this.expected = null;
    this.result = null;
};

// ********************************************************************************************* //
// Registration

return FBTestApp.TestException;

// ********************************************************************************************* //
});
