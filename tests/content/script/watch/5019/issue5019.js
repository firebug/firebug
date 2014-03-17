function runTest()
{
    FBTest.openNewTab(basePath + "script/watch/5019/issue5019.html", function(win)
    {
        FBTest.enablePanels(["script", "console"], function(win)
        {
            FBTest.waitForBreakInDebugger(null, 17, false, function()
            {
                FBTest.setWatchExpressionValue(null, "a", "200", function()
                {
                    FBTest.setWatchExpressionValue(null, "b", "helloworld", function()
                    {
                        FBTest.toggleWatchExpressionBooleanValue(null, "c", function()
                        {
                            // Verify all edits
                            var a = FBTest.getWatchExpressionValue(null, "a");
                            var b = FBTest.getWatchExpressionValue(null, "b");
                            var c = FBTest.getWatchExpressionValue(null, "c");

                            FBTest.compare("200", a, "a variable value must match");
                            FBTest.compare("\"helloworld\"", b, "b variable value must match");
                            FBTest.compare("true", c, "c variable value must match");

                            // Resume debugger
                            FBTest.clickContinueButton(null);

                            // Verify a log in the Console panel.
                            FBTest.selectPanel("console");
                            var config = {tagName: "div", classes: "logRow logRow-log"};
                            FBTest.waitForDisplayedElement("console", config, function(row)
                            {
                                var expected = /200\s*helloworld\s*true\s*/;
                                FBTest.compare(expected, row.textContent,
                                    "The proper message must be displayed.");
                                FBTest.testDone();
                            });
                        });
                    });
                });
            });

            FBTest.click(win.document.getElementById("executeTest"));
        });
    });
}
