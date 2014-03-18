function runTest()
{
    FBTest.openNewTab(basePath + "console/3663/issue3663.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function()
            {
                var config = {tagName: "span", classes: "objectBox-array"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var expected = /\s*\[\"a1\"\,\s*\[\.\.\.\]\,\s*\"b1\"\]\s*/;
                    FBTest.compare(expected, row.textContent, "The log must match");
                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
