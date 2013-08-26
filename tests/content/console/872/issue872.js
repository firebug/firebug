function runTest()
{
    FBTest.sysout("issue872.START");

    FBTest.openNewTab(basePath + "console/872/issue872.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");

        FBTest.enableConsolePanel(function(win)
        {
            var config = {tagName: "div", classes: "logRow-errorMessage"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var message = row.getElementsByClassName("errorMessage").item(0);
                FBTest.compare(/This is an error from an iframe!/, message.textContent,
                    "Error message must be correct");

                FBTest.testDone("issue872.DONE");
            });

            var button = win.document.getElementById("refreshIFrame");
            FBTest.progress("testing " + button.getAttribute("id"));
            FBTest.click(button);
        });
    });
}
