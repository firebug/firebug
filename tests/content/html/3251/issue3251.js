function runTest()
{
    FBTest.openNewTab(basePath + "html/3251/issue3251.html", (win) =>
    {
        // 1. Open Firebug
        FBTest.openFirebug(() =>
        {
            // 2. Switch to the HTML panel
            // 3. Inspect the blue <div> (#element)
            FBTest.selectElementInHtmlPanel("element", (element) =>
            {
                // 4. Select the <body> tag
                FBTest.selectElementInHtmlPanel(win.document.body, () =>
                {
                    // 5. Hold down Alt and click on the <div>
                    FBTest.sendMouseEvent({type: "click", altKey: true}, element);

                    var panel = FBTest.getSelectedPanel();
                    var editor = panel.localEditors.html;
                    if (FBTest.ok(editor, "Edit Mode must be enabled"))
                    {
                        FBTest.compare("<div id=\"element\"></div>", editor.getValue(),
                            "Contents of <div> must be shown in editor");

                        // Stop Edit Mode
                        FBTest.clickToolbarButton(null, "fbToggleHTMLEditing");
                    }
                    FBTest.testDone();
                });
            });
        });
    });
}
