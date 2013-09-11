function runTest()
{
    FBTest.sysout("issue4658.START");
    FBTest.setPref("preferJSDSourceLinks", true);
    FBTest.openNewTab(basePath + "console/4658/issue4658.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableScriptPanel();
        FBTest.enableConsolePanel(function(win)
        {
            var config = {tagName: "div", classes: "logRow logRow-debug"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var expected = new RegExp("FirebugBug\\s*" + FW.FBL.$STRF("Line",
                    ["clickedFirebugBug.js", 6]).replace(/([\\"'\(\)])/g, "\\$1"));
                FBTest.compare(expected, row.textContent, "The proper message must be displayed.");
                FBTest.testDone("issue4658.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
