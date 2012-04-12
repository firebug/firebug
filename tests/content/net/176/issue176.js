function runTest()
{
    FBTest.sysout("issue176.START");

    FBTest.openNewTab(basePath + "net/176/issue176.html", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            FBTest.clearCache();

            // Wait for two requests being displayed in the Net panel.
            var config = {
                counter: 2,
                tagName: "tr",
                classes: "netRow category-flash hasHeaders loaded",
            };

            waitForDisplayedElement("net", config, function(row)
            {
                var panel = FW.Firebug.chrome.selectPanel("net");

                // Set "Flash" filter and wait for relayout.
                FW.Firebug.NetMonitor.onToggleFilter(FW.Firebug.currentContext, "flash");
                setTimeout(checkNetPanelUI, 300);
            });

            // Execute test on the test page.
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

function waitForDisplayedElement(panelName, config, callback)
{
    FBTest.waitForDisplayedElement(panelName, config, function(row)
    {
        var panelNode = FBTest.getPanel(panelName).panelNode;
        var nodes = panelNode.getElementsByClassName(config.classes);

        if (nodes.length < config.counter)
            waitForDisplayedElement(panelName, config, callback);
        else
            callback();
    });
}

// Make sure the Net panel's UI is properly filtered.
function checkNetPanelUI()
{
    var panelNode = FBTest.getPanel("net").panelNode;

    // Check number of requests. Must be exactly two.
    var netRows = FW.FBL.getElementsByClass(panelNode, "netRow", "category-flash", "hasHeaders", "loaded");
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
    FBTest.testDone("issue1256.DONE");
}
