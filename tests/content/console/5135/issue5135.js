function runTest()
{
    FBTest.sysout("issue5135.START");
    FBTest.openNewTab(basePath + "console/5135/issue5135.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            FBTest.selectPanel("console");
            FBTest.executeCommand("monitorEvents($('iframe').contentWindow, 'message')");
            FBTest.clearConsole();

            var config = {tagName: "div", classes: "logRow"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var expected = "message origin=http://legoas, data=test » Window iframe.html";
                FBTest.compare(expected, row.textContent,
                    "The proper message must be displayed. " + row.textContent);
                FBTest.testDone("issue5135.DONE");
            });

            // Execute test implemented on the test page.
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
