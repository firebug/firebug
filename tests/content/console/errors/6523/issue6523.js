function runTest()
{
    FBTest.setPref("showStackTrace", true);

    FBTest.openNewTab(basePath + "console/errors/6523/issue6523.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["console", "script"], function()
            {
                var config = {tagName: "pre", classes: "errorSourceCode ", attributes: {
                    title: "throw new Error(\"b\");"
                }};
                FBTest.waitForDisplayedElement("console", config, function()
                {
                    var panelNode = FBTest.getPanel("console").panelNode;
                    var row = panelNode.querySelector(".logRow.logRow-errorMessage");

                    // Verify displayed text.
                    var reTextContent = /\s*b\s*throw new Error\(\"b\"\)\;\s*issue6...me\.html\s*\(line\s*17(,\s*col\s*8)?\)\s*/;
                    FBTest.compare(reTextContent, row.textContent, "Text content must match.");

                    // Show stack trace.
                    var objectBox = row.getElementsByClassName("errorTitle")[0];
                    FBTest.click(objectBox);

                    // Verify stack frames
                    var frames = panelNode.querySelectorAll(".objectBox-stackFrame");
                    if (FBTest.compare(4, frames.length, "There must be four frames"))
                    {
                        FBTest.compare(/^b\(age=12/, frames[0].textContent,
                            "The function name must be correct " + frames[0].textContent);

                        FBTest.compare(/^d\(age=12/, frames[1].textContent,
                            "The function name must be correct " + frames[1].textContent);

                        FBTest.compare(/^onExecuteTest2\(\)/, frames[2].textContent,
                            "The function name must be correct " + frames[2].textContent);

                        FBTest.compare(/onload/, frames[3].textContent,
                            "The function name must be correct " + frames[3].textContent);
                    }

                    FBTest.testDone();
                });

                FBTest.clickContentButton(win, "testButton");
            });
        });
    });
}
