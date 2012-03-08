function runTest()
{
    FBTest.sysout("issue3703.START");
    FBTest.openNewTab(basePath + "commandLine/3703/issue3703.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");
        FBTest.enableConsolePanel(function(win)
        {
            var config = {tagName: "a", classes: "objectLink objectLink-element"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                FBTest.compare(/<li>/, row.textContent, "The result must be one 'li' element");
                FBTest.testDone("issue3703.DONE");
            });

            FBTest.clickToolbarButton(null, "fbConsoleClear");
            FBTest.executeCommand("$$('li')[1]");
        });
    });
}
