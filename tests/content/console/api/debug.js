function runTest()
{
    FBTest.openNewTab(basePath + "console/api/debug.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "div", classes: "logRow logRow-debug"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    FBTest.compare(new RegExp("This is a debug message\\s*Object\\s*{\\s*a=1\\s*}" +
                        FW.FBL.$STRF("Line", ["debug.html", 31]).replace(/([\\"'\(\)])/g, "\\$1")),
                        row.textContent, "The proper message must be displayed.");
                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
