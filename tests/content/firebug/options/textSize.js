function runTest()
{
    FBTest.openNewTab(basePath + "firebug/options/textSize.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "div", classes: "logRow logRow-log"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var normal = row.clientHeight;

                    // Increase text size and verify
                    FW.FBL.$("cmd_firebug_increaseTextSize").doCommand();
                    FBTest.ok(normal < row.clientHeight,
                        "Increased text size must be bigger than the default value.");

                    // Reset text size and verify
                    FW.FBL.$("cmd_firebug_normalTextSize").doCommand();
                    FBTest.ok(normal == row.clientHeight,
                        "Normal text size must correspond to the default value");

                    // Decrease text size and verify
                    FW.FBL.$("cmd_firebug_decreaseTextSize").doCommand();
                    FW.FBL.$("cmd_firebug_decreaseTextSize").doCommand();  // twice because of rounding error in the font-size-adjust version.
                    FBTest.ok(normal > row.clientHeight,
                        "Decreased text size must be smaller than the default value.");

                    FW.FBL.$("cmd_firebug_normalTextSize").doCommand();

                    FBTest.testDone();
                });

                // Execute test implemented on the test page.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
