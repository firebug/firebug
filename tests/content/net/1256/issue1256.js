// Test entry point.
function runTest()
{
    FBTest.openNewTab(basePath + "net/1256/issue1256.html", function(win)
    {
        // Open Firebug UI and enable Net panel.
        FBTest.enableNetPanel(function(win)
        {
            FBTest.sysout("issue1256.onReload; " + win.location.href);

            var options = {
                tagName: "tr",
                classes: "netRow category-xhr hasHeaders loaded"
            };

            // Run test implemented on the page.
            FBTest.waitForDisplayedElement("net", options, function(netRow)
            {
                FBTest.sysout("issue1256.response received");

                // Expand net entry.
                FBTest.click(netRow);

                // Activate Params tab.
                var netInfoRow = netRow.nextSibling;
                FBTest.expandElements(netInfoRow, "netInfoPostTab");

                var postTable = FW.FBL.getElementByClass(netInfoRow, "netInfoPostParamsTable");
                if (FBTest.ok(postTable, "The post table must exist"))
                {
                    var paramName = FW.FBL.getElementByClass(postTable, "netInfoParamName").textContent;
                    var paramValue = FW.FBL.getElementByClass(postTable, "netInfoParamValue").textContent;

                    FBTest.compare("param1", paramName, "The parameter name must be 'param1'.");
                    FBTest.compare("1 + 2", paramValue, "The parameter value must be '1 + 2'");
                }

                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
