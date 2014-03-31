function runTest()
{
    FBTest.openNewTab(basePath + "html/layout/5885/issue5885.html", (win) =>
    {
        // 1. Open Firebug
        FBTest.openFirebug(() =>
        {
            // 2. Switch to the HTML panel and there to the Layout side panel
            var panel = FBTest.selectPanel("layout");

            // 3. Change the browser size
            FBTest.setBrowserWindowSize(600, 600);

            FBTest.waitForDisplayedText("layout", win.document.body.clientWidth, () =>
            {
                var layoutLabelWidth = panel.panelNode.
                    getElementsByClassName("layoutLabelWidth")[0];
                FBTest.compare(win.document.body.clientWidth, layoutLabelWidth.textContent,
                    "Width displayed inside the panel should be correct");
                FBTest.testDone();
            });
        });
    });
}
