function runTest()
{
    FBTest.openNewTab(basePath + "console/4322/issue4322.html", function(win)
    {
        FBTest.openFirebug(function () {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "div", classes: "logRow logRow-errorMessage"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var title = row.querySelector(".errorTitle");
                    FBTest.compare(/getSession is not defined/, title.textContent,
                        "The error title must match.");

                    var link = row.querySelector(".objectLink.objectLink-sourceLink");
                    FBTest.compare(FW.FBL.$STRF("Line", ["issue4322.html", 10]), link.textContent,
                        "The source link must match.");

                    FBTest.testDone();
                });

                FBTest.clearConsole();
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
