function runTest()
{
    FBTest.openNewTab(basePath + "console/5216/issue5216.html", (win) =>
    {
        FBTest.openFirebug(() =>
        {
            FBTest.enableConsolePanel(() =>
            {
                var config = {
                    tagName: "div",
                    classes: "errorSourceBox"
                };
                FBTest.waitForDisplayedElement("console", config, (errorBreakpoint) =>
                {
                    var row = FW.FBL.getAncestorByClass(errorBreakpoint, "logRow");
                    FBTest.checkIfContextMenuCommandExists(row, "breakOnThisError", (exists) =>
                    {
                        FBTest.ok(exists,
                            "Context menu item for setting an error breakpoint must exist");
                        FBTest.testDone();
                    }, {x: row.offsetWidth / 2, y: row.offsetHeight / 2});
                });

                FBTest.clickContentButton(win, "causeException");
            });
        });
    });
}
