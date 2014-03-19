function runTest()
{
    FBTest.openNewTab(basePath + "net/5714/issue5714.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableNetPanel(function(win)
            {
                FBTest.waitForDisplayedElement("net", null, function(row)
                {
                    var config = {
                        tagName: "tr",
                        classes: "netRow category-xhr hasHeaders loaded",

                        // There is already one request displayed in the net panel
                        // (the one we want to resend) so, make sure the test is
                        // waiting for new entry (not the existing one)
                        onlyMutations: true
                    };

                    FBTest.waitForDisplayedElement("net", config, function(row)
                    {
                        FBTest.progress("HTTP request has been resent!");
                        FBTest.testDone();
                    });

                    FBTest.executeContextMenuCommand(row, "fbNetResend", function()
                    {
                        FBTest.progress("Context menu action executed");
                    });
                });

                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
