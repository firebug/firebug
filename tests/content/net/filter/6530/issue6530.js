function runTest()
{
    FBTest.openNewTab(basePath + "net/filter/6530/issue6530.html", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            FBTest.clearCache();

            var config = {
                tagName: "tr",
                classes: "netRow category-js hasHeaders loaded",
            };

            FBTest.waitForDisplayedElement("net", config, function(row)
            {
                var panel = FW.Firebug.chrome.selectPanel("net");

                FBTest.clickToolbarButton(null, "fbNetFilter-js");

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

    var netRows = panelNode.getElementsByClassName("netRow category-js hasHeaders loaded");
    FBTest.compare(1, netRows.length, "There must be exactly one request displayed!");

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
