function runTest()
{
    FBTest.sysout("issue6116.START");
    FBTest.openNewTab(basePath + "console/6116/issue6116.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");

        FBTest.enableConsolePanel(function(win)
        {
            var config = {tagName: "div", classes: "logRow-log"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var expected = "\"foo\"undefined\"bar\"";
                FBTest.compare(expected, row.textContent, "The log must match: " +
                    row.textContent);

                FBTest.testDone("issue6116.DONE");
            });

            FBTest.executeCommand("console.log('%o%o%o', 'foo', undefined, 'bar')");
        });
    });
}
