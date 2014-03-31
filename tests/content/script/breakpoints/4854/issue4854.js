function runTest()
{
    FBTest.openNewTab(basePath + "script/breakpoints/4854/issue4854.html", function(win)
    {
        FBTest.enablePanels(["net", "script"], function(win)
        {
            var options =
            {
                tagName: "tr",
                classes: "netRow category-xhr hasHeaders loaded"
            };

            FBTest.getSelectedPanel().clear();

            FBTest.waitForDisplayedElement("net", options, function(row)
            {
                var breakpointColumn = row.getElementsByClassName("sourceLine").item(0);
                FBTest.click(breakpointColumn);

                FBTest.selectPanel("script");
                var panelNode = FBTest.selectPanel("breakpoints").panelNode;
                var breakpoints =
                    panelNode.getElementsByClassName("breakpointBlock-netBreakpoints");

                if (FBTest.ok(breakpoints.length == 1, "There must be an XHR breakpoint"))
                {
                    var options =
                    {
                        tagName: "div",
                        classes: "warning focusRow",
                    };

                    // If we include this within previous waitForDisplayedElement callback,
                    // the test bot fails on timeout since this callback is never executed.
                    // xxxHonza: I am not sure why.
                    FBTest.waitForDisplayedElement("breakpoints", options, function(row)
                    {
                        FBTest.ok(true, "XHR breakpoint must be deleted");
                        FBTest.testDone();
                    });

                    setTimeout(function()
                    {
                        var closeButton = breakpoints.item(0).getElementsByClassName("closeButton").item(0);
                        FBTest.click(closeButton);
                    });
                }
                else
                {
                    FBTest.testDone();
                }
            });

            FBTest.progress("Clicking on the test button");
            FBTest.click(win.document.getElementById("makeXHR"));
        });
    });
}
