function runTest()
{
    FBTest.openNewTab(basePath + "console/6778/issue6778.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanelAndReload(function()
            {
                var config = {tagName: "SPAN", classes: "objectBox-text"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    FBTest.compare("XDM Console message", row.textContent, "check the console logs");
                    FBTest.testDone();
                });
            });
        });
    });
}
