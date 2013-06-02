function runTest()
{
    FBTest.sysout("issue6104.START");
    FBTest.openNewTab(basePath + "console/6104/issue6104.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");

        FBTest.enableConsolePanel(function(win)
        {
            var config = {tagName: "span", classes: "objectBox-array"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var expected = /DOMTokenList\[\"test1\"\, \"test2\"\]/;
                FBTest.compare(expected, row.textContent, "The log must match");

                FBTest.testDone("issue6104.DONE");
            });

            FBTest.executeCommand("$('#testdiv').classList");
        });
    });
}
