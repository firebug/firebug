function runTest()
{
    FBTest.openNewTab(basePath + "script/callstack/3596/issue3596.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            var panel = FW.Firebug.chrome.selectPanel("script");

            // Asynchronously wait for break in debugger.
            FBTest.waitForBreakInDebugger(FW.Firebug.chrome, 19, false, function(row)
            {
                var stackPanel = FW.Firebug.chrome.selectSidePanel("callstack");
                var panelNode = stackPanel.panelNode;

                // There should be 4 frames.
                var frames = panelNode.querySelectorAll(".objectBox-stackFrame");
                FBTest.compare(4, frames.length, "There must be four frames");

                // Verify expandable frames.
                FBTest.ok(FW.FBL.hasClass(frames[1], "hasTwisty"),
                    "The second frame must be expandable");
                FBTest.ok(FW.FBL.hasClass(frames[3], "hasTwisty"),
                    "The fourth frame must be expandable");

                // Expand the second frames parameters.
                FBTest.click(frames[1]);

                // Get link to the third frame function and select it.
                var funcLink = frames[2].querySelector(".objectLink");
                FBTest.click(funcLink);

                // Switch to another side panel and back.
                FW.Firebug.chrome.selectSidePanel("watches");
                FW.Firebug.chrome.selectSidePanel("callstack");

                frames = panelNode.querySelectorAll(".objectBox-stackFrame");

                // Verify expanded frame.
                FBTest.ok(FW.FBL.hasClass(frames[1], "hasTwisty.opened"),
                    "The second frame must be expanded");

                // Verify selected frame.
                var selected = frames[2].getAttribute("selected");
                FBTest.compare("true", selected, "The third frame must be selected");

                // Finish the test.
                FBTest.clickContinueButton();
                FBTest.testDone();
            });

            // Run test to break in debugger.
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
