function runTest()
{
    FBTest.openNewTab(basePath + "console/882/issue882.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["console", "script"], function()
            {
                var config = {tagName: "div", classes: "logRow-info", count: 2};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var panel = FBTest.getSelectedPanel();
                    var rows = panel.panelNode.getElementsByClassName("logRow-info");

                    var expected = [
                    {
                        msg: "log",
                        link: FW.FBL.$STRF("Line", ["issue882.html", 9])
                    },
                    {
                        msg: "external",
                        link: FW.FBL.$STRF("Line", ["external.js", 2])
                    }];

                    for (var i=0; i < rows.length; ++i)
                    {
                        var msg = rows[i].getElementsByClassName("objectBox-text")[0];
                        FBTest.compare(expected[i].msg, msg.textContent,
                            "The proper message must be displayed: " + msg.textContent);

                        var sourceLink = rows[i].getElementsByClassName("objectLink")[0];
                        FBTest.compare(expected[i].link, sourceLink.textContent,
                            "The proper source link must be displayed: " + sourceLink.textContent);
                    }

                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("createLog"));
            });
        });
    });
}
