function runTest()
{
    var url = basePath + "script/watch/7332/issue7332.html";
    FBTest.openNewTab(url, (win) =>
    {
        FBTest.enablePanels(["script"], () =>
        {
            FBTest.waitForBreakInDebugger(null, 13, false, function(row)
            {
                var row = FBTest.getWatchExpressionRow(null, "aaa");
                var label = row.querySelector(".memberLabelBox");
                FBTest.click(label);

                var value = FBTest.getWatchExpressionValue(null, "aaa");
                var expectedValue = "\"Hello Firebug user! Hello Firebug user! " +
                    "Hello Firebug user!\"";

                FBTest.compare(expectedValue, value, "The string must be expanded");

                FBTest.clickContinueButton(null, function()
                {
                    FBTest.testDone();
                });
            });

            FBTest.clickContentButton(win, "executeTest");
        });
    });
}
