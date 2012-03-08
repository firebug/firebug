function runTest()
{
    FBTest.sysout("console.exception.START");
    FBTest.openNewTab(basePath + "console/api/exception.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            var config = {tagName: "div", classes: "logRow logRow-errorMessage"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var reTextContent = new RegExp("ReferenceError: asdf is not defined\\s*asdf.asdf = 1;\\s*" +
                    FW.FBL.$STRF("Line", ["exception.html", 34]).replace(/([\\"'\(\)])/g, "\\$1"));
                FBTest.compare(reTextContent, row.textContent, "The proper message must be displayed.");
                FBTest.testDone("console.exception.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
