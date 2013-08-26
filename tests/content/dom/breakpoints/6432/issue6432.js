function runTest()
{
    FBTest.sysout("issue6432.START");

    FBTest.openNewTab(basePath + "dom/breakpoints/6432/issue6432.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableScriptPanel();
        FBTest.selectPanel("dom");

        FBTest.waitForDOMProperty("testString", function(row)
        {
            // Verify that the string value is cropped
            FBTest.compare(/\.{3}/, row.getElementsByClassName("memberValueCell")[0].textContent,
                "String value must be cropped");

            var config = {tagName: "tr", attributes: {"breakpoint": "true"}};

            // Check if the DOM breakpoint was set correctly
            FBTest.waitForDisplayedElement("dom", config, function(row)
            {
                // Check if the property the breakpoint is set for is "testString"
                FBTest.compare("testString", row.getElementsByClassName("memberLabel")[0].textContent,
                    "Breakpoint must be set for 'testString' property");

                FBTest.waitForBreakInDebugger(null, 16, false, function()
                {
                    FBTest.testDone("issue6432.DONE");
                });

                // Click the 'Change property value' button on the page
                FBTest.click(win.document.getElementById("changePropertyValue"));
            });

            // Create DOM breakpoint for the property
            var breakpointColumn = row.getElementsByClassName("sourceLine")[0];
            FBTest.click(breakpointColumn);
        });

        FBTest.reload();
    });
}
