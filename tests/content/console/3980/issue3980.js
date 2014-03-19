function runTest()
{
    FBTest.openNewTab(basePath + "console/3980/issue3980.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["console", "script"], function()
            {
                var tests = [];
                tests.push(testCPUProfileClearButton);
                tests.push(testCPUProfileConsoleClearCommand);

                FBTestFirebug.runTestSuite(tests, function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}


function testCPUProfileClearButton(callback)
{
    var config = {tagName: "div", classes: "logRow logGroupLabel"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        var chrome = FW.Firebug.chrome;
        var doc = chrome.window.document;
        FBTest.clickToolbarButton(chrome, "fbConsoleClear");

        var button = doc.getElementById("cmd_firebug_toggleProfiling");
        FBTest.ok(!button.checked, "'Profile' button must not be pressed when 'Clear' button was pressed");

        callback();
    });

    FBTest.clickToolbarButton(null, "fbToggleProfiling");
}

function testCPUProfileConsoleClearCommand(callback)
{
    var config = {tagName: "div", classes: "logRow logGroupLabel"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.executeCommand("console.clear()");

        var doc = FW.Firebug.chrome.window.document;
        var button = doc.getElementById("cmd_firebug_toggleProfiling");
        FBTest.ok(!button.checked, "'Profile' button must not be pressed when 'console.clear()' was executed");

        callback();
    });

    FBTest.clickToolbarButton(null, "fbToggleProfiling");
}
