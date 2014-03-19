function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/5951/issue5951.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var expression = "document.getElementsByTagName('span')";
                var expected = "HTMLCollection[span.test, span#root]";

                var config = {tagName: "span", classes: "objectBox-array"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    FBTest.compare(expected, row.textContent, "Verify: " +
                        expression + " SHOULD BE " + expected);

                    var title = row.getElementsByClassName("objectTitle")[0];
                    if (FBTest.ok(title, "HTMLCollection title must exist"))
                    {
                        FBTest.click(title);

                        var panel = FBTest.getSelectedPanel();
                        FBTest.compare("dom", panel.name, "The DOM panel must be selected");
                    }

                    FBTest.testDone();
                });

                FBTest.executeCommand(expression);
            });
        });
    });
}
