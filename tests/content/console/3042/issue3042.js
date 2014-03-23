function runTest()
{
    FBTest.openNewTab(basePath + "console/3042/issue3042.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanelAndReload(function(win)
            {
                var config = {
                    tagName: "div",
                    classes: "logRow logRow-errorMessage"
                };

                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var errorIndicatorLeftPart = row.getElementsByClassName("errorColPosition");
                    if (FBTest.compare(1, errorIndicatorLeftPart.length,
                        "There must be an error indicator"))
                    {
                        FBTest.compare("---------------------------------------------------",
                            errorIndicatorLeftPart.item(0).textContent,
                            "The left part of the error indicator must be shown as dashes");

                       var errorIndicatorRightPart = errorIndicatorLeftPart.item(0).parentNode.
                           getElementsByClassName("errorColCaret").item(0);
                       var backgroundImage = win.getComputedStyle(errorIndicatorRightPart, "").
                           getPropertyValue("background-image");

                       FBTest.compare("url(\"chrome://firebug/skin/errorColumnIndicator.svg\")",
                           backgroundImage, "The right part of the error indicator must be shown as an arrow");

                       FBTest.testDone();
                    }
                });
            });
        });
    });
}
