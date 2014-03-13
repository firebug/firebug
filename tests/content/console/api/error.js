function runTest()
{
    FBTest.openNewTab(basePath + "console/api/error.html", function(win)
    {
        FBTest.enablePanels(["console", "script"], function(win)
        {
            var config = {tagName: "div", classes: "logRow logRow-errorMessage"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                // Verify displayed text.
                var reTextContent = new RegExp("This is a test error\\s*console.error\\" +
                    "(\\\"This is a test error\\\"\\);\\s*" +
                    FW.FBL.$STRF("Line", ["error.html", 32]).replace(/([\\"'\(\)])/g, "\\$1"));

                FBTest.compare(reTextContent, row.textContent, "Text content must match.");

                // Show stack trace.
                var objectBox = row.getElementsByClassName("errorTitle")[0];
                FBTest.click(objectBox);

                // Verify the first stack frame.
                var stackFrame = row.getElementsByClassName("objectBox-stackFrame")[0];
                FBTest.compare(new RegExp("onExecuteTest\\(\\)\\s*" +
                    FW.FBL.$STRF("Line", ["error.html", 32]).replace(/([\\"'\(\)])/g, "\\$1")),
                    stackFrame.textContent, "Stack frame content must match.");

                FBTest.testDone();
            });

            FBTest.clickContentButton(win, "testButton");
        });
    });
}
