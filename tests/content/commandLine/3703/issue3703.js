function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/3703/issue3703.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "a", classes: "objectLink objectLink-element"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    FBTest.compare(/<li>/, row.textContent, "The result must be one 'li' element");
                    FBTest.testDone();
                });

                FBTest.clickToolbarButton(null, "fbConsoleClear");
                FBTest.executeCommand("$$('li')[1]");
            });
        });
    });
}
