function runTest()
{
    FBTest.sysout("issue5058.START");

    FBTest.openNewTab(basePath + "html/5058/issue5058.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("html");

        FBTest.selectElementInHtmlPanel("inspectMe", function(node)
        {
            FBTest.clickToolbarButton(null, "fbToggleHTMLEditing");
            var panelNode = FBTest.getPanel("html").panelNode;
            var textArea = panelNode.querySelector("textarea");

            var expected = "<div id=\"inspectMe\">Inspect Me!</div>";
            FBTest.compare(expected, textArea.value,
                "The markup must be displayed now");

            FBTest.testDone("issue5058.DONE");
        });
    });
}
