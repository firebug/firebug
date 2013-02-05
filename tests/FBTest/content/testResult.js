/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Helper Objects

/**
 * This object represents a test-result.
 */
FBTestApp.TestResult = function(win, pass, msg, expected, result)
{
    var location = win.location.href;
    this.fileName = location.substr(location.lastIndexOf("/") + 1);

    this.pass = pass ? true : false;
    this.msg = msg;//clean(msg);

    // Make sure the following values are strings.
    this.expected = expected ? expected + "" : null;
    this.result = result ? result + "" : null;

    // xxxHonza: there should be perhaps simple API in lib.js to get the stack trace.
    this.stack = [];
    for (var frame = Components.stack, i=0; frame; frame = frame.caller, i++)
    {
        var fileName = unescape(frame.filename ? frame.filename : "");
        //if (fileName.indexOf("chrome://fbtest/content") == 0)
        //    continue;

        var lineNumber = frame.lineNumber ? frame.lineNumber : "";
        this.stack.push({fileName:fileName, lineNumber:lineNumber});
    }
};

// ********************************************************************************************* //
// Registration

return FBTestApp.TestResult;

// ********************************************************************************************* //
});
