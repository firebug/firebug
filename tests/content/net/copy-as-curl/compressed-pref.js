function runTest()
{
    FBTest.sysout("compressed-pref.START");

    var EXPECTED_RESULT = "curl '" + basePath + "net/copy-as-curl/compressed-pref.html?param=value' -H 'Host: " + FW.FBL.makeURI(basePath).host + "' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Accept-Encoding: gzip, deflate' -H 'Referer: " + basePath + "net/copy-as-curl/compressed-pref.html' -H 'Connection: keep-alive'";

    var originalPrefValue = FBTest.getPref("net.curlAddCompressedArgument");

    FBTest.openNewTab(basePath + "net/copy-as-curl/compressed-pref.html", function (win)
    {
        FBTest.enableNetPanel(function (win)
        {
            var netPanel = FBTest.selectPanel("net");
            netPanel.clear();

            var options =
            {
                tagName: "tr",
                classes: "netRow category-html hasHeaders loaded"
            };

            FBTest.waitForDisplayedElement("net", options, function (row)
            {
                var tasks = new FBTest.TaskList();

                tasks.push(function (callback)
                {
                    FBTest.progress("Set the add --compressed preference to true");
                    FBTest.setPref("net.curlAddCompressedArgument", true);
                    executeAndVerify(/--compressed$/, "fbCopyAsCurl", row, callback);
                });

                tasks.push(function (callback)
                {
                    FBTest.progress("Set the add --compressed preference to false");
                    FBTest.setPref("net.curlAddCompressedArgument", false);
                    executeAndVerify(EXPECTED_RESULT, "fbCopyAsCurl", row, callback);
                });

                tasks.run(function ()
                {
                    FBTest.setPref("net.curlAddCompressedArgument", originalPrefValue);
                    FBTest.cleanUpTestTabs();
                    FBTest.testDone("compressed-pref.DONE");
                });

            });

            FBTest.click(win.document.getElementById("submit-button"));
        });
    });
}

function executeAndVerify(expectedResult, commandId, netRow, callback)
{
    // Open context menu on the specified target.
    FBTest.executeContextMenuCommand(netRow, commandId, function ()
    {
        // Data can be copyied into the clipboard asynchronously,
        // so wait till they are available.
        FBTest.waitForClipboard(expectedResult, function (clipboardText)
        {
            function replaceUserAgentHeader(str)
            {
                var replaceWithStr = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0";
                return str.replace(/(-H 'User-Agent: ).+?(')/i, "$1" + replaceWithStr + "$2");
            }

            // Verify data in the clipboard
            FBTest.compare(expectedResult, replaceUserAgentHeader(clipboardText), "Proper data must be in the clipboard.");

            callback();
        });
    });
}
