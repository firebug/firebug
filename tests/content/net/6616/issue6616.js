function runTest()
{
    FBTest.openNewTab(basePath + "net/6616/issue6616.html", function(win)
    {
        FBTest.openFirebug(function() {
            FBTest.enableNetPanel(function(win)
            {
                var button = win.document.getElementById("sendRequest");

                var config = {
                    tagName: "tr",
                    classes: "netRow category-xhr loaded"
                }

                FBTest.waitForDisplayedElement("net", config, function(row)
                {
                    FBTest.executeContextMenuCommand(row, "fbCopyAsCurl", verifyCopiedCURL);
                });

                FBTest.click(button);
            });
        });
    });
}

function verifyCopiedCURL()
{
    var expected = new RegExp("curl \'" + basePath + "net\/6616\/issue6616.php\'" +
        " -X POST( -H \'.*?\')+");

    FBTest.waitForClipboard(expected, function(text)
    {
        FBTest.compare(expected, text, "Proper cURL must be copied");
        FBTest.testDone("issue6616.DONE");
    });
}
