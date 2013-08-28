function runTest()
{
    FBTest.sysout("issue5544.START");
    FBTest.setPref("showStackTrace", true);

    FBTest.openNewTab(basePath + "script/callstack/5544/issue5544.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");

        FBTest.enableScriptPanel();
        FBTest.enableConsolePanel(function(win)
        {
            var config = {tagName: "div", classes: "logRow logRow-errorMessage"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var panelNode = FBTest.getPanel("console").panelNode;
                var node = panelNode.querySelectorAll(".objectBox-errorMessage.hasTwisty.hasBreakSwitch");
                FBTest.ok(node, "The error message must have a break switch");

                // Verify displayed text.
                var reTextContent = /\s*\s*foops is not defined\s*/;
                FBTest.compare(reTextContent, row.textContent, "Text content must match.");

                // Show stack trace.
                var objectBox = row.getElementsByClassName("errorTitle")[0];
                FBTest.click(objectBox);

                // Verify stack frames
                var frames = panelNode.getElementsByClassName("objectBox-stackFrame");
                if (FBTest.compare(1, frames.length, "There must be one frame"))
                {
                    FBTest.compare("onclick",
                        frames[0].getElementsByClassName("objectLink")[0].textContent,
                        "The function name must be correct");
                }

                var sourceBox = row.getElementsByClassName("objectLink-sourceLink")[0];
                if (FBTest.ok(node, "Source line must be there"))
                {
                    var expected = /\s*onclick\s*\(line\s*2\)\s*/;
                    FBTest.compare(expected, sourceBox.textContent, "The source must match: " +
                        sourceBox.textContent);
                }

                FBTest.testDone("issue5544.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
