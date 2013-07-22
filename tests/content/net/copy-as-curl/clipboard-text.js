function runTest()
{
    FBTest.sysout("clipboard-text.START");

    var HOST = FW.FBL.makeURI(basePath).host;
    var REQUEST_URL = basePath + "net/copy-as-curl/server.php";
    var REFERRER_URL = basePath + "net/copy-as-curl/clipboard-text-form.html";

    var EXPECTED_GET_RESULT = "curl '" + REQUEST_URL + "?param1=12345&param2=Test%20&%20Test&param3=$&+,/:;=?@%20#%{}|\\^~[]%C2%B4%27' -H 'Host: " + HOST + "' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Accept-Encoding: gzip, deflate' -H 'Referer: " + REFERRER_URL + "' -H 'Connection: keep-alive'";
    var EXPECTED_POST_RESULT = "curl '" + REQUEST_URL + "' -H 'Host: " + HOST + "' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Accept-Encoding: gzip, deflate' -H 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8' -H 'Referer: " + REFERRER_URL + "' -H 'Connection: keep-alive' -H 'Pragma: no-cache' -H 'Cache-Control: no-cache' --data $'param1=12345&param2=Test & Test&param3=$&+,/:;=?@ #%{}|\\\\^~[]\\xb4\\''";
    var EXPECTED_HEAD_RESULT = "curl '" + REQUEST_URL + "' -X HEAD -H 'Host: " + HOST + "' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Accept-Encoding: gzip, deflate' -H 'Referer: " + REFERRER_URL + "' -H 'Connection: keep-alive'";
    var EXPECTED_PUT_RESULT = "curl '" + REQUEST_URL + "' -X PUT -H 'Host: " + HOST + "' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Accept-Encoding: gzip, deflate' -H 'Content-Type: application/json; charset=UTF-8' -H 'Referer: " + REFERRER_URL + "' -H 'Connection: keep-alive' --data '{\"a\":\"1\", \"b\":\"2\", \"c\":\"3\"}'";
    var EXPECTED_DELETE_RESULT = "curl '" + REQUEST_URL + "' -X DELETE -H 'Host: " + HOST + "' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Accept-Encoding: gzip, deflate' -H 'Referer: " + REFERRER_URL + "' -H 'Connection: keep-alive'";

    FBTest.setPref("net.curlAddCompressedArgument", false);
    FBTest.openNewTab(basePath + "net/copy-as-curl/clipboard-text-form.html", function (win)
    {
        FBTest.enableNetPanel(function (win)
        {
            var tasks = new FBTest.TaskList();
            tasks.push(submitAndVerify, "GET", EXPECTED_GET_RESULT, win);
            tasks.push(submitAndVerify, "POST", EXPECTED_POST_RESULT, win);
            tasks.push(submitAndVerify, "HEAD", EXPECTED_HEAD_RESULT, win);
            tasks.push(submitAndVerify, "PUT", EXPECTED_PUT_RESULT, win);
            tasks.push(submitAndVerify, "DELETE", EXPECTED_DELETE_RESULT, win);

            tasks.run(function ()
            {
                FBTest.cleanUpTestTabs();
                FBTest.testDone("clipboard-text.DONE");
            });
        });
    });
}

function submitAndVerify(taskCallback, method, expectedResult, win)
{
    FBTest.progress("Test XHR " + method + " request");

    FBTest.selectPanel("net").clear();

    var options =
    {
        tagName: "tr",
        classes: "netRow category-xhr hasHeaders loaded"
    };

    FBTest.waitForDisplayedElement("net", options, function (row)
    {
        executeAndVerify(expectedResult, "fbCopyAsCurl", row, taskCallback);
    });

    win.wrappedJSObject.submitForm(method, true);
}

function executeAndVerify(expectedResult, commandId, netRow, taskCallback)
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
            FBTest.compare(expectedResult, replaceUserAgentHeader(clipboardText), "Proper data must be in the clipboard. Current: " + clipboardText);

            taskCallback();
        });
    });
}
