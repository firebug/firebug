function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/6525/issue6525.php", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["net", "cookies", "console"], function()
            {
                var taskList = new FBTest.TaskList();
                taskList.push(checkNetPanel);
                taskList.push(checkCookiesPanel);

                taskList.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function checkNetPanel(callback)
{
    FBTest.selectPanel("net");

    var config = {
        tagName: "tr",
        classes: "netRow category-html hasHeaders loaded"
    };

    FBTest.waitForDisplayedElement("net", config, function(row)
    {
        FBTest.executeContextMenuCommand(row, "fbUseInCommandLine", function()
        {
            FBTest.executeCommandAndVerify(callback, "$p.responseHeaders[0].name", /^\".*\"$/,
                "span", "objectBox-string", true, false)
        });
    });
}

function checkCookiesPanel(callback)
{
    var panel = FBTest.selectPanel("cookies");

    var row = FBTest.getCookieRowByName(panel.panelNode, "TestCookieIssue6525");
    FBTest.executeContextMenuCommand(row, "fbUseInCommandLine", function()
    {
        FBTest.executeCommandAndVerify(callback, "$p.name", "\"TestCookieIssue6525\"",
            "span", "objectBox-string", true, false)
    });
}

