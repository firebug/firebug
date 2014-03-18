function runTest()
{
    FBTest.openNewTab(basePath + "net/4689/issue4689.html", function()
    {
        //FBTest.clearConsole();
        var tasks = new FBTest.TaskList();
        tasks.push(testConsolPanel);
        tasks.push(testNetPanel);

        tasks.run(function()
        {
            FBTest.testDone();
        });
    })
}

function testNetPanel(callback)
{
    FBTest.enableNetPanel(function(win)
    {
        FBTest.selectPanel("net");
        FBTest.waitForDisplayedElement("net", null, function(netRow)
        {
            FBTest.click(netRow);

            var rowInfoBody = netRow.nextSibling;
            var jsonTab = rowInfoBody.querySelector(".netInfoJSONTab");

            // Select JSON tab.
            FBTest.click(jsonTab);

            var panel = FBTest.getPanel("net");
            var openedGroups = panel.panelNode.querySelectorAll(".memberLabelCell");

            function executeContextMenuCommand()
            {
                FBTest.executeContextMenuCommand(openedGroups[0], "fbNetCopyJSON");
            }

            var expected =
                '{"name":"foo","surname":"bar","address":{"no":"15","name":"foobar"}}';

            FBTest.waitForClipboard(expected, executeContextMenuCommand, (text) =>
            {
                FBTest.compare(expected, text,
                    "Proper JSON must be in the clipboard. Current: " + text);
                callback();
            });
        });

        FBTest.click(win.document.getElementById("testButton"));
    });
}

function testConsolPanel(callback)
{
    FBTest.enableConsolePanel(function(win)
    {
        FBTest.waitForDisplayedElement("console", null, function(row)
        {
            var  panel = FBTest.selectPanel("console");
            var spyLogRow = FW.FBL.getElementByClass(panel.panelNode, "spyTitleCol","spyCol");

            FBTest.click(spyLogRow);

            var spyLogRow2 = FW.FBL.getElementByClass(panel.panelNode, "netInfoJSONTab","netInfoTab");
            FBTest.click(spyLogRow2);

            var openedGroups = panel.panelNode.querySelectorAll(".memberLabel");

            function executeContextMenuCommand()
            {
                FBTest.executeContextMenuCommand(openedGroups[0], "fbNetCopyJSON");
            }

            var expected =
                '{"name":"foo","surname":"bar","address":{"no":"15","name":"foobar"}}';

            FBTest.waitForClipboard(expected, executeContextMenuCommand, (text) =>
            {
                FBTest.compare(expected, text,
                    "Proper JSON must be in the clipboard. Current: " + text);
                callback();
            });
        });

        FBTest.click(win.document.getElementById("testButton"));
    });
}