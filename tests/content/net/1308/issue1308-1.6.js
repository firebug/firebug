function runTest()
{
    var pageURI = basePath + "net/1308/issue1308-1.6.html";
    var scriptURI = basePath + "net/1308/issue1308.js";

    FBTest.openNewTab(pageURI, function(win)
    {
        FBTest.enableNetPanel(function()
        {
            var options = {
                tagName: "tr",
                classes: "netRow category-xhr hasHeaders loaded"
            };

            // Asynchronously wait for the request beeing displayed.
            FBTest.waitForDisplayedElement("net", options, function(netRow)
            {
                var panel = FBTest.getPanel("net");

                // Test the "Copy Location With Parameters action" available in the context menu
                // for specific Net panel entry.
                panel.copyParams(netRow.repObject);

                checkCopyLocationWithParametersAction(netRow, function() {
                    FBTest.testDone();
                });
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

function checkCopyLocationWithParametersAction(netRow, callback)
{
    setTimeout(function()
    {
        // Get data from the clipboard.
        var clipboard = FW.FBL.CCSV("@mozilla.org/widget/clipboard;1", "nsIClipboard");
        var trans = FW.FBL.CCIN("@mozilla.org/widget/transferable;1", "nsITransferable");
        trans.addDataFlavor("text/unicode");
        clipboard.getData(trans, Ci.nsIClipboard.kGlobalClipboard);

        var str = new Object();
        var strLength = new Object();
        trans.getTransferData("text/unicode", str, strLength);
        str = str.value.QueryInterface(Ci.nsISupportsString);
        var actual = str.data.substring(0, strLength.value / 2);

        // Complete expected result.
        var requestUri = FBTest.getHTTPURLBase() + "net/1308/issue1308.txt";
        var expected = requestUri + "?param1=1%20%2B%202";

        // Verification.
        FBTest.compare(expected, actual, "Verify that the copied URL is properly encoded.");
        callback();
    }, 1000);
}
