function runTest()
{
    FBTest.openNewTab(basePath + "console/5135/issue5135.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                FBTest.selectPanel("console");
                FBTest.executeCommand("monitorEvents($('iframe').contentWindow, 'message')");
                FBTest.clearConsole();

                var config = {tagName: "div", classes: "logRow"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var iframe = win.wrappedJSObject.document.getElementById("iframe");
                    var origin = iframe.contentWindow.testOrigin;

                    var expected = "message origin=" + origin +", data=test\u00A0\u00BB\u00A0Window iframe.html";
                    FBTest.compare(expected, row.textContent,
                        "The proper message must be displayed. " + row.textContent);
                    FBTest.testDone();
                });

                // Execute test implemented on the test page.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
