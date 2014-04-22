function runTest()
{
    FBTest.openNewTab(basePath + "css/5244/issue5244.html", (win) =>
    {
        // 1. Open Firebug
        FBTest.openFirebug(() =>
        {
            // 2. Switch to the DOM panel
            FBTest.selectPanel("dom");

            var row = FBTest.getDOMPropertyRow(null, "importRule");
            var value = row.getElementsByClassName("memberValueCell")[0].
                getElementsByClassName("objectLink")[0];

            var config = {
                tagName: "div",
                class: "cssRule jumpHighlight"
            };

            // 3. Right-click on the value of the variable 'importRule' (CSSImportRule test.css)
            // 4. Click that option
            FBTest.executeContextMenuCommand(value, "InspectInstylesheetPanel", () =>
            {
                FBTest.waitForDisplayedElement("stylesheet", config, (rule) =>
                {
                    FBTest.progress("@import rule is highlighted");
                    FBTest.testDone();
                });
            }, FBTest.testDone);
        });
    });
}
