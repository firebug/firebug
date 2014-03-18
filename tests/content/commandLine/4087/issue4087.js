function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/4087/issue4087.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var tests = [];
                tests.push(testCommandLine);
                tests.push(testCommandEditor);

                FBTest.runTestSuite(tests, function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function testCommandLine(callback)
{
    FBTest.clearAndTypeCommand("var test = 'Hello';");

    // Reload and check if the text persists
    FBTest.reload(function()
    {
        var doc = FW.Firebug.chrome.window.document;
        var commandLine = doc.getElementById("fbCommandLine");

        FBTest.compare("var test = 'Hello';", commandLine.value,
            "Content of Command Line must be: var test = 'Hello';");

        FBTest.clearCommand();

        callback();
    });
}

function testCommandEditor(callback)
{
    // Click the Command Line toggle button to switch to the Command Editor
    FBTest.clickToolbarButton(null, "fbToggleCommandLine");

    FBTest.clearAndTypeCommand("var test = 'Hello';", true);

    // Reload and check if the text persists
    FBTest.reload(function()
    {
        var doc = FW.Firebug.chrome.window.document;
        var commandEditor = FW.Firebug.CommandLine.getCommandEditor();

        FBTest.compare("var test = 'Hello';", commandEditor.value,
            "Content of Command Editor must be: var test = 'Hello';");

        FBTest.clearCommand(true);

        callback();
    });
}