function runTest()
{
    FBTest.openNewTab(basePath + "console/5216/issue5216.html", (win) =>
    {
        // 1. Open Firebug
        FBTest.openFirebug(() =>
        {
            // 2. Enable and switch to the Console panel
            FBTest.enableConsolePanel(() =>
            {
                var config = {
                    tagName: "div",
                    classes: "errorSourceBox"
                };
                FBTest.waitForDisplayedElement("console", config, (errorBreakpoint) =>
                {
                    var row = FW.FBL.getAncestorByClass(errorBreakpoint, "logRow");
                    // 4. Right-click the error
                    FBTest.checkIfContextMenuCommandExists(row, "breakOnThisError", (exists) =>
                    {
                        FBTest.ok(exists,
                            "Context menu item for setting an error breakpoint must exist");
                        FBTest.testDone();
                    }, {x: row.offsetWidth / 2, y: row.offsetHeight / 2});
                });

                // 3. Click the 'Cause exception' button
                FBTest.clickContentButton(win, "causeException");
            });
        });
    });
}
