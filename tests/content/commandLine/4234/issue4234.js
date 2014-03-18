function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/4234/issue4234.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "a", classes: "objectLink objectLink-object"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    FBTest.compare(/Object\s*\{\s*arr\=\[3\]\s*\}/, row.textContent,
                        "The result must match '" + row.textContent + "'");

                    FBTest.testDone();
                });

                FBTest.clickToolbarButton(null, "fbConsoleClear");
                FBTest.executeCommand("var a = {arr: [1,2,3]}; a;");
            });
        });
    });
}
