function runTest()
{
    FBTest.sysout("issue1854.START");

    FBTest.openNewTab(basePath + "commandLine/1854/issue1854.html", function(win)
    {
        // Step 1: Open Firebug
        FBTest.openFirebug();

        // Step 2: Enable the Script and the Console panel
        FBTest.enableScriptPanel();
        FBTest.enableConsolePanel(function(win)
        {
            // Step 4: Reload the page (is done within FBTest.enableConsolePanel())

            // Step 3: Switch to the Console panel
            FBTest.selectPanel("console");

            // Asynchronously wait for result in the Console panel.
            var config = {tagName: "div", classes: "logRow logRow-command"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                FBTest.compare(">>> debug(showOutput)", row.textContent,
                    "The command line should display: >>> debug(showOutput)");

                // Asynchronously wait for break in debugger.
                FBTest.waitForBreakInDebugger(FW.Firebug.chrome, 11, false, function(row)
                {
                    FBTest.clickContinueButton();
                    FBTest.testDone("issue1854.DONE");
                });

                // Step 6: Click the 'Show output' button
                FBTest.click(win.document.getElementById("showOutput"));
            });

            // Step 5: Type debug(showOutput) into the Command Line and hit Enter
            FBTest.executeCommand("debug(showOutput)");

        });
    });
}
