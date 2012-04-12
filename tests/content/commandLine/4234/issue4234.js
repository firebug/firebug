function runTest()
{
    FBTest.sysout("issue4234.START");
    FBTest.openNewTab(basePath + "commandLine/4234/issue4234.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");
        FBTest.enableConsolePanel(function(win)
        {
            var config = {tagName: "a", classes: "objectLink objectLink-object"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                FBTest.compare(/Object\s*\{\s*arr\=\[3\]\s*\}/, row.textContent,
                    "The result must match '" + row.textContent + "'");

                FBTest.testDone("issue4234.DONE");
            });

            FBTest.clickToolbarButton(null, "fbConsoleClear");
            FBTest.executeCommand("var a = {arr: [1,2,3]}; a;");
        });
    });
}
