function runTest()
{
    FBTest.openNewTab(basePath + "net/2209/issue2209-2.html", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            FBTest.waitForDisplayedElement("net", null, function(netRow)
            {
                FBTest.click(netRow);

                var rowInfoBody = netRow.nextSibling;
                FBTest.ok(FW.FBL.hasClass(rowInfoBody, "netInfoRow"), "We need XHR entry body.");

                var jsonTab = rowInfoBody.querySelector(".netInfoJSONTab");
                FBTest.ok(jsonTab, "JSON tab must exist");
                FBTest.testDone();
            });

            FBTest.click(win.document.getElementById("executeTest"));
        });
    });
}
