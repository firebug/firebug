function runTest()
{
    FBTest.openNewTab(basePath + "script/breakpoints/4889/issue4889.html", function(win)
    {
        FBTest.enablePanels(["console", "script"], function(win)
        {
            var config = {tagName: "div", classes: "logRow logRow-errorMessage", counter: 2};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var panelNode = FW.FBL.getAncestorByClass(row, "panelNode");
                var errorMessages = panelNode.getElementsByClassName("logRow-errorMessage");

                for (var i=0; i<errorMessages.length; ++i)
                {
                    var breakpoint = errorMessages[i].getElementsByClassName("errorBreak").item(0);
                    var errorMessage = errorMessages[i].getElementsByClassName("errorMessage").item(0);

                    if (FBTest.ok(breakpoint, "There must be an breakpoint available for the error " +
                        "log '" + errorMessage.textContent +"'."))
                    {
                        FBTest.click(breakpoint);
                    }
                }

                FBTest.selectPanel("script");
                panelNode = FBTest.selectPanel("breakpoints").panelNode;

                var breakpointHeader = panelNode.getElementsByClassName("breakpointHeader").item(0);

                if (FBTest.compare("Error Breakpoints",
                    breakpointHeader && breakpointHeader.textContent,
                    "There must be a breakpoint category 'Error Breakpoints'"))
                {
                    var breakpointBlock = panelNode.getElementsByClassName("breakpointBlock").item(0);

                    FBTest.click(breakpointHeader);

                    FBTest.ok(!FW.FBL.hasClass(breakpointBlock, "opened"),
                        "The breakpoint category should be collapsed.");

                    FBTest.click(breakpointHeader);
                    FBTest.ok(FW.FBL.hasClass(breakpointBlock, "opened"),
                        "The breakpoint category should be expanded.");
                }

                // Finish test
                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("callFirstFunction"));
            FBTest.click(win.document.getElementById("callSecondFunction"));
        });
    });
}
