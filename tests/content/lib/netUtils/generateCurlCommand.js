function runTest()
{
    FBTest.sysout("generateCurlCommand.START");

    var HOST = FW.FBL.makeURI(basePath).host;
    var REQUEST_URL = basePath + "lib/netUtils/server.php";
    var REFERRER_URL = basePath + "lib/netUtils/generateCurlCommand.html";

    var EXPECTED_GET_RESULT = "curl '" + REQUEST_URL + "?param1=12345&param2=Test+%26+Test&param3=%24%26%2B%2C%2F%3A%3B%3D%3F%40+%23%25%7B%7D%7C%5C%5E~%5B%5D%C2%B4%27' -H 'Host: " + HOST + "' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Accept-Encoding: gzip, deflate' -H 'Referer: " + REFERRER_URL + "' -H 'Connection: keep-alive'";
    var EXPECTED_POST_RESULT = "curl '" + REQUEST_URL + "' -H 'Host: " + HOST + "' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Accept-Encoding: gzip, deflate' -H 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8' -H 'Referer: " + REFERRER_URL + "' -H 'Connection: keep-alive' -H 'Pragma: no-cache' -H 'Cache-Control: no-cache' --data $'param1=12345&param2=Test+%26+Test&param3=%24%26%2B%2C%2F%3A%3B%3D%3F%40+%23%25%7B%7D%7C%5C%5E~%5B%5D%C2%B4\\''";
    var EXPECTED_HEAD_RESULT = "curl '" + REQUEST_URL + "' -X HEAD -H 'Host: " + HOST + "' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Accept-Encoding: gzip, deflate' -H 'Referer: " + REFERRER_URL + "' -H 'Connection: keep-alive'";
    var EXPECTED_PUT_RESULT = "curl '" + REQUEST_URL + "' -X PUT -H 'Host: " + HOST + "' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Accept-Encoding: gzip, deflate' -H 'Content-Type: application/json; charset=UTF-8' -H 'Referer: " + REFERRER_URL + "' -H 'Connection: keep-alive' --data '{\"a\":\"1\", \"b\":\"2\", \"c\":\"3\"}'";
    var EXPECTED_DELETE_RESULT = "curl '" + REQUEST_URL + "' -X DELETE -H 'Host: " + HOST + "' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0' -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' -H 'Accept-Encoding: gzip, deflate' -H 'Referer: " + REFERRER_URL + "' -H 'Connection: keep-alive'";

    FBTest.setPref("net.curlAddCompressedArgument", false);
    FBTest.openNewTab(basePath + "lib/netUtils/generateCurlCommand.html", function(win)
    {
        FBTest.enableNetPanel(function (win)
        {
            var tasks = new FBTest.TaskList();
            tasks.push(submitAndVerify, "GET", EXPECTED_GET_RESULT, win, "Generated cURL command from a GET request result should be correct");
            tasks.push(submitAndVerify, "POST", EXPECTED_POST_RESULT, win, "Generated cURL command from a POST request result should be correct");
            tasks.push(submitAndVerify, "HEAD", EXPECTED_HEAD_RESULT, win, "Generated cURL command from a HEAD request result should be correct");
            tasks.push(submitAndVerify, "PUT", EXPECTED_PUT_RESULT, win, "Generated cURL command from a PUT request result should be correct");
            tasks.push(submitAndVerify, "DELETE", EXPECTED_DELETE_RESULT, win, "Generated cURL command from a DELETE request result should be correct");

            tasks.run(function ()
            {
                FBTest.testDone("generateCurlCommand.DONE");
            });
        });
    });
}

function submitAndVerify(taskCallback, method, expectedResult, win, whatToExpectText)
{
    FBTest.progress("Test XHR " + method + " request");
    FBTest.selectPanel("net").clear();

    function replaceUserAgentHeader(str)
    {
        var replaceWithStr = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0";
        return str.replace(/(-H 'User-Agent: ).+?(')/i, "$1" + replaceWithStr + "$2");
    }

    onRequestDisplayed(function(netRow)
    {
        var file = FW.Firebug.getRepObject(netRow);
        var generatedCommand = FW.Firebug.NetMonitor.Utils.generateCurlCommand(file);
        FBTest.compare(replaceUserAgentHeader(generatedCommand), expectedResult, whatToExpectText);

        taskCallback();
    });

    win.wrappedJSObject.submitForm(method, true);
}

function onRequestDisplayed(callback)
{
    // Create listener for mutation events.
    var doc = FBTest.getPanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, "tr",
        {"class": "netRow category-xhr loaded"});

    // Wait for a XHR log to appear in the Net panel.
    recognizer.onRecognizeAsync(callback);
}