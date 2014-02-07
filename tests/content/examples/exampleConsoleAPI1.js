function runTest()
{
    FBTest.sysout("examples.console.START");
    FBTest.openNewTab(basePath + "examples/exampleConsoleAPI1.html", function(win)
    {
        FBTest.enableConsolePanel(function(win)
        {
            var config = {tagName: "div", classes: "logRow logRow-log"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                FBTest.compare(/Hello World!\s*/, row.textContent,
                    "The proper message must be displayed.");

                FBTest.testDone("examples.console.DONE");
            });

            // Execute test implemented on the test page.
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
