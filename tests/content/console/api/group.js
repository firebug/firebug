var testWindow;

function runTest()
{
    FBTest.openNewTab(basePath + "console/api/group.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                testWindow = win;

                var tests = [];
                tests.push(test1);
                tests.push(clear);
                tests.push(test2);
                FBTest.runTestSuite(tests, function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function test1(callback)
{
    FBTest.progress("Run opened group test");

    var config = {tagName: "div", classes: "logRow logRow-info"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        var panelNode = FBTest.getPanel("console").panelNode;
        var group = panelNode.getElementsByClassName("logRow logRow-group")[0];
        var groupContent = panelNode.getElementsByClassName("logContent logGroup")[0];

        FBTest.ok(FW.FBL.hasClass(groupContent, "opened"), "The group must be opened by default");
        var expected = /Group1\s*log\s*group.html\s*\(\w*\s*39\)\s*group.html\s*\(\w*\s*38\)/;
        FBTest.compare(expected, group.textContent, "The group must contain one log message");

        callback();
    });

    FBTest.click(testWindow.document.getElementById("testButton1"));
}

function clear(callback)
{
    FBTest.progress("Clear console");

    // Clear console content.
    FBTest.clickToolbarButton(null, "fbConsoleClear");

    callback();
}

function test2(callback)
{
    FBTest.progress("Run collapsed group test");

    var config = {tagName: "div", classes: "logRow logRow-info"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        var panelNode = FBTest.getPanel("console").panelNode;
        var group = panelNode.getElementsByClassName("logRow logRow-group")[0];
        var groupContent = panelNode.getElementsByClassName("logContent logGroup")[0];

        FBTest.ok(!FW.FBL.hasClass(groupContent, "opened"), "The group must be collapsed by default");
        var expected = /Group2\s*log\s*group.html\s*\(\w*\s*47\)\s*group.html\s*\(\w*\s*46\)/;
        FBTest.compare(expected, group.textContent, "The group must contain one log message");

        callback();
    });

    FBTest.click(testWindow.document.getElementById("testButton2"));
}
