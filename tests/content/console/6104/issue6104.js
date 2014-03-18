function runTest()
{
    FBTest.openNewTab(basePath + "console/6104/issue6104.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "span", classes: "objectBox-array"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var expected = /DOMTokenList\[\"test1\"\, \"test2\"\]/;
                    FBTest.compare(expected, row.textContent, "The log must match");

                    FBTest.testDone();
                });

                FBTest.executeCommand("$('#testdiv').classList");
            });
        });
    });
}
