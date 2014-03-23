// Custom timeout for this test. The dojo.js.uncompressed.js source file is relatively
// big and it can take some time to load the source over RDP. Increasin the timeout
// should avoid random failure.
window.FBTestTimeout = 20000;

function runTest()
{
    FBTest.setPref("preferJSDSourceLinks", true);
    FBTest.openNewTab(basePath + "console/4658/issue4658.html", function(win)
    {
        FBTest.enablePanels(["console", "script"], function(win)
        {
            FBTest.reload(function()
            {
                var config = {tagName: "div", classes: "logRow logRow-debug"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var expected = new RegExp("FirebugBug\\s*" + FW.FBL.$STRF("Line",
                        ["clickedFirebugBug.js", 6]).replace(/([\\"'\(\)])/g, "\\$1"));

                    FBTest.compare(expected, row.textContent,
                        "The proper message must be displayed.");

                    FBTest.testDone();
                });

                FBTest.clickContentButton(win, "testButton");
            });
        });
    });
}
