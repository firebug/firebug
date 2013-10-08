var CURL_HOST = FW.FBL.makeURI(basePath).host;
var CURL_REQUEST_URL = basePath + "lib/netUtils/server.php";
var CURL_REFERRER_URL = basePath + "lib/netUtils/curlMultipartFormData.html";
var CURL_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.8; rv:22.0) Gecko/20100101 Firefox/22.0";
var CURL_UPLOAD_FILE_NAME = "firebugTest_curlMultiPartFormData.txt";
var CURL_BOUNDARY = "---------------------------6640637784474033871168477162";
var CURL_BODY_BOUNDARY = "-----------------------------6640637784474033871168477162";

var EXPECTED_RESULT = "curl '" + CURL_REQUEST_URL + "' -H 'Host: " + CURL_HOST + "' -H 'User-Agent: " + CURL_USER_AGENT + "' " +
    "-H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.5' " +
    "-H 'Accept-Encoding: gzip, deflate' " +
    "-H 'Referer: " + CURL_REFERRER_URL + "' " +
    "-H 'Connection: keep-alive' " +
    "-H 'Content-Type: multipart/form-data; boundary=" + CURL_BOUNDARY + "' " +
    "--data-binary $'" +
    CURL_BODY_BOUNDARY + "\\r\\nContent-Disposition: form-data; name=\"user-param\"\\r\\n\\r\\n1234567\\r\\n" +
    CURL_BODY_BOUNDARY + "\\r\\nContent-Disposition: form-data; name=\"user-file-input\"; filename=\"" + CURL_UPLOAD_FILE_NAME + "\"\\r\\nContent-Type: text/plain\\r\\n\\r\\n" +
    CURL_BODY_BOUNDARY + "--\\r\\n'";

var panel;

function runTest()
{
    FBTest.sysout("curlMultiPartFormData.START");

    FBTest.setPref("net.curlAddCompressedArgument", false);

    FBTest.openNewTab(basePath + "lib/netUtils/curlMultipartFormData.html", function(win)
    {
        FBTest.enableNetPanel(function(win)
        {
            panel = FBTest.selectPanel("net");
            panel.clear();

            var doc = win.document;
            var iFrame = doc.getElementById("upload-target");
            var fileInput = doc.getElementById("user-file-input");

            iFrame.addEventListener("load", function()
            {
                setTimeout(onLoadResponseAndCompare, 400);
            }, true);

            fileInput.value = createFile(CURL_UPLOAD_FILE_NAME).path;

            FBTest.click(doc.getElementById("user-submit-button"));

        });

    });
}

function onLoadResponseAndCompare()
{
    FBTest.progress("curlMultiPartFormData; Test form submitted and response received.");

    var netRow = FW.FBL.getElementByClass(panel.panelNode, "netRow",
        "category-html", "hasHeaders", "loaded");
    var file = FW.Firebug.getRepObject(netRow);

    var generatedCurlCommand = FW.Firebug.NetMonitor.Utils.generateCurlCommand(file);

    var result = replaceUserAgentHeader(replaceBoundaries(generatedCurlCommand));

    FBTest.compare(EXPECTED_RESULT, result, "Should be a valid multipart/form-data request");

    FBTest.testDone("curlMultiPartFormData.DONE");
}


function replaceUserAgentHeader(generatedCurlCommand)
{
    return generatedCurlCommand.replace(/(-H 'User-Agent: ).+?(')/i, "$1" + CURL_USER_AGENT + "$2");
}

function replaceBoundaries(generatedCurlCommand)
{
    var s = generatedCurlCommand.replace(/boundary=(--+.+?)'/gm, "boundary=" + CURL_BOUNDARY + "'");

    s = s.replace(/([\$'|\\r\\n])--+.+?\\r\\n/gm, "$1" + CURL_BODY_BOUNDARY + "\\r\\n");

    s = s.replace(/\\r\\n'$/gm, "--\\r\\n'");

    return s;
}


// fixme: Share with issue1867
function createFile(name)
{
    var dirService = Cc["@mozilla.org/file/directory_service;1"]
        .getService(Ci.nsIProperties);

    // Get unique file within user profile directory.
    var file = dirService.get("TmpD", Ci.nsIFile);
    file.append(name);

    // Initialize output stream.
    var outputStream = Cc["@mozilla.org/network/file-output-stream;1"]
        .createInstance(Ci.nsIFileOutputStream);

    // Create some content.
    var text = "Test file for upload.";
    outputStream.init(file, 0x02|0x08|0x20, 0666, 0);
    outputStream.write(text, text.length);
    outputStream.close();

    FBTest.sysout("curlMultiPartFormData.createFile: " + file.path);

    return file;
}
