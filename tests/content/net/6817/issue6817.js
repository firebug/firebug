function runTest()
{
    FBTest.openNewTab(basePath + "net/6817/issue6817.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableNetPanel(function()
            {
                var button = win.frames[0].document.getElementById("sendRequest");

                var config = {
                    tagName: "tr",
                    classes: "netRow category-html loaded",
                    counter: 3
                }

                FBTest.waitForDisplayedElement("net", config, function(row)
                {
                    function executeContextMenuCommand()
                    {
                        FBTest.executeContextMenuCommand(row, "fbCopyAsCurl");
                    }

                    verifyCopiedCURL(executeContextMenuCommand);
                });

                FBTest.click(button);
            });
        });
    });
}

function verifyCopiedCURL(executeContextMenuCommand)
{
    var expected = new RegExp("curl \'" + basePath + "net\/6817\/issue6817.php\'" +
        "( -H \'.*?\')+ --data-binary \\$\'(-+\\d+)\\\\r\\\\nContent-Disposition: form-data; " +
        "name=\"text\"(\\\\r\\\\n){2}Hello Firebug user!\\\\r\\\\n\\2\\\\r\\\\n" +
        "Content-Disposition: form-data; name=\"file\"; filename=\"\"\\\\r\\\\nContent-Type: " +
        "application\/octet-stream(\\\\r\\\\n){3}\\2--\\\\r\\\\n\'");

    FBTest.waitForClipboard(expected, executeContextMenuCommand, (text) =>
    {
        FBTest.compare(expected, text, "Proper cURL must be copied");
        FBTest.testDone();
    });
}
