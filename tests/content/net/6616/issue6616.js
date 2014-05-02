function runTest()
{
    FBTest.openNewTab(basePath + "net/6616/issue6616.html", function(win)
    {
        var originalPrefValue = FBTest.getPref("net.curlAddCompressedArgument");

        FBTest.openFirebug(function()
        {
            FBTest.enableNetPanel(function(win)
            {
                var button = win.document.getElementById("sendRequest");

                var config = {
                    tagName: "tr",
                    classes: "netRow category-xhr loaded"
                }

                FBTest.waitForDisplayedElement("net", config, function(row)
                {
                    function executeContextMenuCommand()
                    {
                        FBTest.executeContextMenuCommand(row, "fbCopyAsCurl");
                    }

                    var tasks = new FBTest.TaskList();
                    var expected = new RegExp("curl \'" + basePath + "net\/6616\/issue6616.php\'" +
                        "( -H \'.*?\')+$");
                    var expectedCompressed = new RegExp("curl \'" + basePath + "net\/6616\/issue6616.php\'" +
                        "( -H \'.*?\')+ --compressed$");

                    if (FBTest.isWindows())
                    {
                        expected = new RegExp("curl \"" + basePath + "net\/6616\/issue6616.php\" .+$");
                        expectedCompressed = new RegExp("curl \"" + basePath + "net\/6616\/issue6616.php\" .+ --compressed$");
                    }

                    tasks.push(verifyCopiedCURL, executeContextMenuCommand, false, expected);
                    tasks.push(verifyCopiedCURL, executeContextMenuCommand, true, expectedCompressed);

                    tasks.run(function ()
                    {
                        FBTest.setPref("net.curlAddCompressedArgument", originalPrefValue);
                        FBTest.testDone();
                    });
                });

                FBTest.click(button);
            });
        });
    });
}

function verifyCopiedCURL(callback, executeContextMenuCommand, compressed, expected)
{
    FBTest.setPref("net.curlAddCompressedArgument", compressed);
    FBTest.waitForClipboard(expected, executeContextMenuCommand, (text) =>
    {
        FBTest.compare(expected, text, "Proper cURL must be copied");

        callback();
    });
}
