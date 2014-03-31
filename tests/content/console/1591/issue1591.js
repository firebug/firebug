/*
 * issue1591.js
 * test for http://code.google.com/p/fbug/issues/detail?id=1591
 * Author: Rob Campbell, Mozilla Corp., Mar 20, 2009
 */

function isEmpty(obj)
{
    if (obj)
        return obj.length == 0;
    return true;
}

function testCommandLineForError()
{
    var panel = FW.Firebug.chrome.selectPanel("console");
    FBTest.progress("looking up command line in " + panel);
    FBTest.ok(panel, "The console panel is found ");

    var clickTarget = FW.Firebug.chrome.$("fbCommandLine");

    FBTest.progress("command line: " + clickTarget);
    FBTest.focus(clickTarget);

    // gather rows from panel
    var rows = FW.FBL.getElementsByClass(panel.panelNode,
        "logRow", "logRow-error");
    FBTest.ok(isEmpty(rows), "Checking for Errors");
    // Finish test
    FBTest.testDone();
}

// Test entry point.
function runTest()
{
    FBTest.openNewTab(basePath + "console/1591/issue1591.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(testCommandLineForError);
        });
    });
}