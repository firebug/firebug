function runTest()
{
    var url = basePath + "commandLine/1854/issue1854.html";
    FBTest.openNewTab(url, function()
    {
        // Step 1: Open Firebug
        FBTest.openFirebug(function()
        {
            // Step 2: Enable the Script and the Console panel
            // Step 3: Switch to the Console panel
            FBTest.enablePanels(["console", "script"], function()
            {
                // Step 4: Reload the page
                FBTest.reload(function(win)
                {
                    // Asynchronously wait for result in the Console panel.
                    var config = {tagName: "div", classes: "logRow logRow-command"};
                    FBTest.waitForDisplayedElement("console", config, function(row)
                    {
                        FBTest.compare("debug(showOutput)", row.textContent,
                            "The command line should display: debug(showOutput)");

                        FBTest.waitForBreakpoint(url, 11, function()
                        {
                            // Asynchronously wait for break in debugger.
                            FBTest.waitForBreakInDebugger(null, 11, false, function(row)
                            {
                                FBTest.clickContinueButton();
                                FBTest.testDone();
                            });

                            // Step 6: Click the 'Show output' button
                            FBTest.clickContentButton(win, "showOutput");
                        });
                    });

                    // Step 5: Type debug(showOutput) into the Command Line and hit Enter
                    FBTest.executeCommand("debug(showOutput)");
                });
            });
        });
    });
}
