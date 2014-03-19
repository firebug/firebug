// Test entry point (executed by FBTest)
function runTest()
{
    // Open a manual test page.
    var urlBase = FBTest.getHTTPURLBase();
    FBTest.openNewTab(urlBase + "console/onreadystatechange.html", function(win)
    {
        FBTest.enableConsolePanel(logTestResult);
    })
}

function logTestResult(event)
{
    // TODO: verify FB UI

    // Log test results.
    FBTest.ok(true, "Test OK");
    FBTest.progress("Example progress message");

    // Finish test
    //cleanUpTestTabs();
    FBTest.testDone();
}