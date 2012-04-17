function runTest()
{
    FBTest.sysout("console.warn.START");
    FBTest.openNewTab(basePath + "console/api/warn.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            var config = {tagName: "div", classes: "logRow logRow-warn"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var reTextContent = new RegExp("This is a test warning\\s*" +
                    FW.FBL.$STRF("Line", ["warn.html", 31]).replace(/([\\"'\(\)])/g, "\\$1"));
                FBTest.compare(reTextContent, row.textContent, "The proper message must be displayed.");
                FBTest.testDone("console.warn.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
