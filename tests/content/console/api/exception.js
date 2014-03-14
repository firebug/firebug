function runTest()
{
    FBTest.openNewTab(basePath + "console/api/exception.html", function(win)
    {
        FBTest.enablePanels(["console", "script"], function(win)
        {
            var text = "asdf.asdf = 1;";
            FBTest.waitForDisplayedText("console", text, function()
            {
                var panel = FBTest.getSelectedPanel();
                var row = panel.panelNode.getElementsByClassName("logRow-errorMessage")[0];

                var reTextContent = new RegExp(
                    "ReferenceError: asdf is not defined\\s*asdf.asdf = 1;\\s*" +
                    FW.FBL.$STRF("Line", ["exception.html", 35]).
                    replace(/([\\"'\(\)])/g, "\\$1"));

                FBTest.compare(reTextContent, row.textContent,
                    "The proper message must be displayed.");

                FBTest.testDone();
            });

            FBTest.clickContentButton(win, "testButton");
        });
    });
}
