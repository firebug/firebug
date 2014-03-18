function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/4209/issue4209.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "a", classes: "objectLink objectLink-object"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    FBTest.compare(/Object\s*{\s*obj={...}}/, row.textContent,
                        "The result must match");

                    FBTest.testDone();
                });

                FBTest.clickToolbarButton(null, "fbConsoleClear");
                FBTest.executeCommand("var a = {obj: {prop: 1}}; a;");
            });
        });
    });
}
