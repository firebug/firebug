function runTest()
{
    FBTest.openNewTab(basePath + "script/callstack/4845/issue4845.html", function(win)
    {
        FBTest.enablePanels(["script", "console"], function()
        {
            FBTest.waitForBreakInDebugger(null, 11, false, function()
            {
                var panel = FBTest.selectPanel("console");
                var logRows = panel.panelNode.getElementsByClassName("objectBox-text");
                var logMessages = 0;
                for (var i = 0; i < logRows.length; ++i)
                {
                    if (logRows.item(i).textContent == "Hello Firebug user!")
                        logMessages++;
                }

                FBTest.compare(1, logMessages,
                    "There must be one 'Hello Firebug user!' message logged to the console.");

                panel = FBTest.selectPanel("script");

                var config = {
                    tagName: "div",
                    classes: "logRow logRow-log",
                    count: 2,
                    onlyMutations: true
                };

                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    panel = FBTest.selectPanel("console");
                    var counterValue =
                        row.getElementsByClassName("logCounterValue")[0].textContent;

                    FBTest.compare(2, counterValue,
                        "There must be two 'Hello Firebug user!' messages logged to the console.");

                    FBTest.clickContinueButton();
                    FBTest.testDone();
                });

                FBTest.sendShortcut("VK_F8", {shiftKey: true});
            });

            FBTest.reload();
        });
    });
}
