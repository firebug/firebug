function runTest()
{
    FBTest.sysout("issue5714.START");

    FBTest.openNewTab(basePath + "net/5714/issue5714.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableNetPanel(function(win)
        {
            FBTest.waitForDisplayedElement("net", null, function(row)
            {
                FBTest.waitForDisplayedElement("net", null, function(row)
                {
                    FBTest.progress("HTTP request has been resent!");
                    FBTest.testDone("issue5714.DONE");
                });

                FBTest.executeContextMenuCommand(row, "fbNetResend");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
