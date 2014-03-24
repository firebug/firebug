var testProp = "0123456789012345678901234567890123456789012345678901234567890123456789";
function runTest()
{
    FBTest.openNewTab(basePath + "console/3029/issue3029.html", (win) =>
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                FBTest.waitForDisplayedText("console", "myProperty", (elt) =>
                {
                    // Expand the property (the label must be clicked).

                    var label = FW.FBL.getAncestorByClass(elt, "memberLabel");
                    if (!label)
                        FBTest.sysout("issue3029: no label "+elt, elt);

                    FBTest.click(label);

                    var row = FW.FBL.getAncestorByClass(elt, "memberRow");
                    var value = row.querySelector(".memberValueCell");
                    FBTest.compare("\"" + testProp + "\"",
                        value.textContent, "Full value must be displayed now.");

                    FBTest.testDone();
                });

                // Execute test.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
