function runTest()
{
    FBTest.openNewTab(basePath + "console/2914/issue2914.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["console", "script"], function()
            {
                FBTest.reload(function()
                {
                    var panelNode = FBTest.getSelectedPanel().panelNode;

                    var errorNode = panelNode.querySelector(".objectBox.objectBox-errorMessage");
                    var titleNode = errorNode.querySelector(".errorTitle");

                    // Verify the error message
                    FBTest.compare(titleNode.textContent, "iframe error",
                        "An error message must be displayed");

                    // The expandable button must be displayed.
                    FBTest.ok(FW.FBL.hasClass(errorNode, "hasTwisty"),
                        "The error must be expandable.");

                    // Open stack trace info.
                    FBTest.click(titleNode);

                    // Verify stack trace.
                    var traceNode = errorNode.querySelector(".errorTrace");
                    FBTest.compare(
                        "logError()" + FW.FBL.$STRF("Line", ["issue2...me.html", 11]) +
                            "issue2914-innerFrame.html()" + FW.FBL.$STRF("Line", ["issue2...me.html", 13]),
                        traceNode.textContent,
                        "The stack trace must be properly displayed.");

                    FBTest.testDone();
                });
            });
        });
    });
}
