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
                var expected = [
                {
                    msg: "Error in parsing value for 'background'.  Declaration dropped.",
                    source: "background: not-existing-function();",
                    link: "cssWithErrors.css (line 2, col 47)"
                },
                {
                    msg: "Expected color but found 'notacolor'.  Error in parsing value for 'color'.  Declaration dropped.",
                    source: "color: notacolor;",
                    link: "cssWithErrors.css (line 6, col 84)"
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
