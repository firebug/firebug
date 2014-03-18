function runTest()
{
    FBTest.openNewTab(basePath + "net/filter/176/issue176.html", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            FBTest.clearCache();

            // Wait for two requests being displayed in the Net panel.
            var config = {
                counter: 2,
                tagName: "tr",
                classes: "netRow category-media hasHeaders loaded",
            };

            FBTest.waitForDisplayedElement("net", config, function(row)
            {
                var panel = FW.Firebug.chrome.selectPanel("net");

                // Set "Media" filter and wait for relayout.
                FBTest.clickToolbarButton(null, "fbNetFilter-media");

                setTimeout(checkNetPanelUI, 300);
            });

            // Execute test on the test page.
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

// Make sure the Net panel's UI is properly filtered.
function checkNetPanelUI()
{
    var panelNode = FBTest.getPanel("net").panelNode;

    // Check number of requests. Must be exactly two.
    var netRows = panelNode.getElementsByClassName("netRow category-media hasHeaders loaded");
    FBTest.compare(2, netRows.length, "There must be exactly two requests displayed!");

    // Each row can specify just one category.
    for (var i=0; i<netRows.length; i++)
    {
        var row = netRows[i];
        var file = FW.Firebug.getRepObject(row);
        var m = row.className.match(/category-/gi);
        FBTest.compare(1, m.length, "There must be just one file category specified for a request: " +
            file.href);
    }

    FW.Firebug.NetMonitor.onToggleFilter(FW.Firebug.currentContext, "all");
    FBTest.testDone();
}
