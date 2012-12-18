function runTest()
{
    FBTest.sysout("issue4932.START");

    FBTest.openNewTab(basePath + "script/4932/issue4932.html", function(win)
    {
        FBTest.selectPanel("script");
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.progress("Wait till the iframe is loaded");

            var config = {tagName: "span", classes: "sourceRowText"};
            var panelNode = FBTest.getPanel("script").panelNode;
            var nodes = panelNode.getElementsByClassName(config.classes);
            FBTest.progress("Nodes: " + nodes.length);

            FBTest.waitForDisplayedElement("script", config, function(row)
            {
                var expected = /function funcTest\(\) \{\}\s*/;
                FBTest.compare(expected, row.textContent,
                    "The script panel must show expected source: " + row.textContent);

                FBTest.testDone("issue4932.DONE");
            });
        });
    });
}
