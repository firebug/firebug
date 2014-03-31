function runTest()
{
    FBTest.openNewTab(basePath + "script/dynamicScriptEval/test1.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["console", "script"], function()
            {
                var config = {tagName: "div", classes: "logRow logRow-log", counter: 2};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var panelNode = FBTest.getSelectedPanel().panelNode;

                    var rows = panelNode.querySelectorAll(".logRow.logRow-log");
                    FBTest.compare(2, rows.length, "There must be two logs");

                    FBTest.compare(/quack\s*/, rows[0].textContent, "The first log must say: quack");
                    FBTest.compare(/meow!!\s*/, rows[1].textContent, "The second log must say: meow!!");

                    FBTest.testDone();
                });

                FBTest.clearConsole();
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
