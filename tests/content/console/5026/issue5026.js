function runTest()
{
    FBTest.openNewTab(basePath + "console/5026/issue5026.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanelAndReload(function(win)
            {
                var panel = FBTest.selectPanel("console");
                var logs = panel.panelNode.getElementsByClassName("logRow");

                var expected = [
                    /RegExp\s+\/a\/i/,
                    /RegExp\s+\/\(\[a-z\]\)\{3\}\/[ig]/,
                    /RegExp\s+\/\\\*\/[gm]/
                ];

                FBTest.compare(logs.length, expected.length, "There must be " + expected.length +
                    " log(s) in the Console panel");

                for(var i=0; i<logs.length; i++)
                {
                    var logMsg = logs[i].textContent.substring(0,
                        logs[i].textContent.indexOf("issue"));
                    FBTest.compare(expected[i], logMsg,
                        "The "+i+". regular expression log message must be correct");
                }

                FBTest.testDone();
            });
        });
    });
}
