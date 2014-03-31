function runTest()
{
    var pageURI = basePath + "net/1308/issue1308.html";
    var scriptURI = basePath + "net/1308/issue1308.js";

    FBTest.openNewTab(pageURI, function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            win.runTest(checkCopyLocationWithParametersAction);
        });
    });
}

function checkCopyLocationWithParametersAction(request)
{
    // Expand the test request with params
    var panel = FBTest.selectPanel("net");
    var netRow = FW.FBL.getElementByClass(panel.panelNode, "netRow", "category-xhr",
        "hasHeaders", "loaded");

    if (!netRow)
    {
        FBTest.ok(false, "There must be a XHR entry within the Net panel.");
        return FBTest.testDone();
    }

    // Test the "Copy Location With Parameters action" available in the context menu
    // for specific Net panel entry.
    panel.copyParams(netRow.repObject);

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

    // Finish test
    FBTest.testDone();
}
