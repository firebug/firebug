function runTest()
{
    FBTest.openNewTab(basePath + "console/api/info.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "div", classes: "logRow logRow-info"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var reTextContent = new RegExp("This is a test info\\s*" +
                        FW.FBL.$STRF("Line", ["info.html", 31]).replace(/([\\"'\(\)])/g, "\\$1"));
                    FBTest.compare(reTextContent, row.textContent, "The proper message must be displayed.");
                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
