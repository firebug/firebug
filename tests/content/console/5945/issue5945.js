function runTest()
{
    FBTest.sysout("issue5945.START");

    FBTest.openNewTab(basePath + "console/5945/issue5945.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            FBTest.selectPanel("console");

            FBTest.setPref("showCSSErrors", true);

            var config = {tagName: "div", classes: "logRow", counter: 2};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var panel = FBTest.getSelectedPanel();
                var rows = panel.panelNode.getElementsByClassName("logRow");

                // The exact column number is not tested since it can differ
                // for some unknown reason. Sounds like Firefox bug, but we
                // don't have a test case.
                // Also the full messages are not checked to avoid language conflicts
                var expected = [
                {
                    msg: /'background'/,
                    source: "background: not-existing-function();",
                    link: /cssWithErrors\.css\s*\(line\s*2\,\s*col\s*\d+\)/
                },
                {
                    msg: /'notacolor'.*?'color'/,
                    source: "color: notacolor;",
                    link: /cssWithErrors\.css\s*\(line\s*6\,\s*col\s*\d+\)/
                }]

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
                FBTest.testDone("issue5945.DONE");
            });

            FBTest.reload();
        });
    });
}
