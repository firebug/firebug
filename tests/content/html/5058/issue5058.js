function runTest()
{
    FBTest.openNewTab(basePath + "html/5058/issue5058.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("inspectMe", function(node)
            {
                FBTest.clickToolbarButton(null, "fbToggleHTMLEditing");

                var panel = FBTest.getPanel("html");
                var editor = panel.localEditors.html;

                var expected = "<div id=\"inspectMe\">Inspect Me!</div>";
                FBTest.compare(expected, editor.getValue(), "The markup must be displayed now");

                FBTest.testDone();
            });
        });
    });
}
