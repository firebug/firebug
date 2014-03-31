function runTest()
{
    FBTest.openNewTab(basePath + "net/2209/issue2209.html", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            FBTest.selectPanel("net");

            FBTest.waitForDisplayedElement("net", null, function(netRow)
            {
                FBTest.click(netRow);

                var rowInfoBody = netRow.nextSibling;
                FBTest.ok(FW.FBL.hasClass(rowInfoBody, "netInfoRow"), "We need XHR entry body.");

                var jsonTab = rowInfoBody.querySelector(".netInfoJSONTab");
                if (FBTest.ok(jsonTab, "JSON tab must exist"))
                {
                    // Select JSON tab.
                    FBTest.click(jsonTab);

                    var label = rowInfoBody.querySelector(
                        ".netInfoJSONText.netInfoText .domTable .memberRow .memberLabel.userLabel");
                    FBTest.ok(label, "JSON DOM Tree must exist");
                    FBTest.compare("ResultSet", label.textContent, "The root label must be displayed");
                }

                FBTest.testDone();
            });

            // Execute Test
            FBTest.click(win.document.getElementById("executeTest"));
        });
    });
}
