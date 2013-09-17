function runTest()
{
    FBTest.sysout("issue6778.START");

    FBTest.openNewTab(basePath + "console/6778/issue6778.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel();

        FBTest.reload(function()
        {
            var config = {tagName: "SPAN", classes: "objectBox-text"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                FBTest.compare("XDM Console message", row.textContent, "check the console logs");
                FBTest.testDone("issue6778.DONE");
            });
        });

    });
}
