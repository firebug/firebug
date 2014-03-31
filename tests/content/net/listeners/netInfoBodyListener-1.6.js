function runTest()
{
    var NetInfoBody = FW.Firebug.NetMonitor.NetInfoBody;
    FBTest.openNewTab(basePath + "net/listeners/netInfoBodyListener-1.6.html", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            NetInfoBody.addListener(netInfoBodyListener);

            var options = {
                tagName: "tr",
                classes: "netRow category-xhr hasHeaders loaded"
            };

            // Asynchronously wait for the request beeing displayed.
            FBTest.waitForDisplayedElement("net", options, function(netRow)
            {
                var panelNode = FBTest.getPanel("net").panelNode;

                // Click to open + click to close.
                FBTest.click(netRow);
                FBTest.click(netRow);

                NetInfoBody.removeListener(netInfoBodyListener);

                FBTest.ok(initTabBody, "initTabBody callback verified");
                FBTest.ok(updateTabBody, "updateTabBody callback verified");
                FBTest.ok(destroyTabBody, "destroyTabBody callback verified");

                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

var initTabBody = false;
var updateTabBody = false;
var destroyTabBody = false;

var netInfoBodyListener =
{
    initTabBody: function(infoBox, file) {
        initTabBody = true;
    },

    updateTabBody: function(infoBox, file, context) {
        updateTabBody = true;
    },

    destroyTabBody: function(infoBox, file) {
        destroyTabBody = true;
    }
}
