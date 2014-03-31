/**
 * 1) Open a new tab and Firebug on it.
 * 2) Select e.g. Net panel
 * 3) Reload the page.
 * 4) Verify that the context associated with the page exists and is active.
 */
function runTest()
{
    FBTest.openNewTab(basePath + "firebug/OpenFirebugOnThisPage.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableNetPanel();

            FBTest.reload(function()
            {
                FBTest.progress("reloaded");
                FBTest.ok(FW.Firebug.currentContext, "The current context must not be null");
                FBTest.ok(FW.Firebug.currentContext.browser.showFirebug, "The browser should have showFirebug set")
                FBTest.testDone();
            });
        });
    });
}
