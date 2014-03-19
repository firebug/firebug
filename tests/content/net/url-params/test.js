function runTest()
{
    FBTest.openNewTab(basePath + "net/url-params/test.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableNetPanel(function(win)
            {
                var panel = FW.Firebug.chrome.selectPanel("net");

                var config = {tagName: "tr", classes: "netRow category-xhr hasHeaders loaded"};
                FBTest.waitForDisplayedElement("net", null, function(netRow)
                {
                    // Expand net entry.
                    FBTest.click(netRow);

                    var netInfoRow = netRow.nextSibling;
                    FBTest.expandElements(netInfoRow, "netInfoParamsTab");

                    var paramsTable = netInfoRow.querySelector(".netInfoParamsTable");
                    FBTest.compare("value11value22value33", paramsTable.textContent,
                        "Ampersands must be propery encoded.");

                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
