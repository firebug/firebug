function runTest()
{
    FBTest.setPref("showStackTrace", true);

    FBTest.openNewTab(basePath + "script/callstack/5400/issue5400.html", function(win)
    {
        FBTest.enablePanels(["console", "script"], function(win)
        {
            var config = {tagName: "div", classes: "logRow logRow-errorMessage"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                // Verify displayed text.
                var reTextContent = /\s*b\s*throw new Error\(\"b\"\)\;\s*issue5400\.html\s*\(line\s*25(,\s*col\s*8)?\)\s*/;
                FBTest.compare(reTextContent, row.textContent, "Text content must match.");

                // Show stack trace.
                var objectBox = row.getElementsByClassName("errorTitle")[0];
                FBTest.click(objectBox);

                // Verify stack frames
                var panelNode = FBTest.getPanel("console").panelNode;
                var frames = panelNode.querySelectorAll(".objectBox-stackFrame");
                if (FBTest.compare(4, frames.length, "There must be four frames"))
                {
                    FBTest.compare(/b/, frames[0].textContent,
                        "The function name must be correct " + frames[0].textContent);

                    FBTest.compare(/d/, frames[1].textContent,
                        "The function name must be correct " + frames[1].textContent);

                    FBTest.compare(/onExecuteTest/, frames[2].textContent,
                        "The function name must be correct " + frames[2].textContent);

                    FBTest.compare(/onclick/, frames[3].textContent,
                        "The function name must be correct " + frames[3].textContent);
                }

                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
