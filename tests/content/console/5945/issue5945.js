function runTest()
{
    FBTest.openNewTab(basePath + "console/5945/issue5945.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                FBTest.setPref("showCSSErrors", true);

                var config = {tagName: "div", classes: "logRow", counter: 2};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var panel = FBTest.getSelectedPanel();
                    var rows = panel.panelNode.getElementsByClassName("logRow-warningMessage");

                    // The exact column number is not tested since it can differ
                    // for some unknown reason. Sounds like Firefox bug, but we
                    // don't have a test case.
                    // Also the full messages are not checked to avoid language conflicts
                    var expected = [
                    {
                        msg: /'background'/,
                        source: "background: not-existing-function();",
                        link: FW.FBL.$STRF("LineAndCol", ["cssWithErrors.css", 2, 16])
                    },
                    {
                        msg: /'notacolor'.*?'color'/,
                        source: "color: notacolor;",
                        link: FW.FBL.$STRF("LineAndCol", ["cssWithErrors.css", 6, 11])
                    }];

                    for (var i=0; i < rows.length; ++i)
                    {
                        var msg = rows[i].getElementsByClassName("errorMessage")[0];
                        FBTest.compare(expected[i].msg, msg.textContent,
                            "The proper message must be displayed. " + row.textContent);

                        var source = rows[i].getElementsByClassName("errorSourceCode")[0];
                        FBTest.compare(expected[i].source, source.textContent,
                            "The proper source must be displayed. " + source.textContent);

                        var sourceLink = rows[i].getElementsByClassName("objectLink")[0];
                        FBTest.compare(expected[i].link, sourceLink.textContent,
                            "The proper source link must be displayed. " + sourceLink.textContent);
                    }
                    FBTest.testDone();
                });

                FBTest.reload();
            });
        });
    });
}
