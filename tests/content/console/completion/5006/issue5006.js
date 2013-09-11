function runTest()
{
    FBTest.sysout("issue5006.START");
    FBTest.openNewTab(basePath + "console/completion/5006/issue5006.html", function(win)
    {
        FBTest.openFirebug();

        var tasks = new FBTest.TaskList();
        tasks.push(enablePreview);
        tasks.push(testCompletions, win);
        tasks.push(openEditor);
        tasks.push(testCompletions, win);

        tasks.run(function() {
            FBTest.testDone("issue5006.DONE");
        });
    });
}

// ********************************************************************************************* //
// Tasks

function enablePreview(callback)
{
    FBTest.selectPanel("html");
    FBTest.enableConsolePanel(function(win)
    {
        verifyConsolePopup(false);

        FBTest.clickConsolePreviewButton();
        verifyConsolePopup(true);

        callback();
    });
}

function openEditor(callback)
{
    FBTest.selectPanel("console");
    verifyConsolePopup(false);

    // Click the Command Line toggle button to switch to the Command Editor
    FBTest.clickToolbarButton(null, "fbToggleCommandLine");

    FBTest.selectPanel("html");
    verifyConsolePopup(true);

    callback();
}

function testCompletions(callback, win)
{
    var cmdLine = FW.Firebug.chrome.$("fbCommandLine");

    FBTest.clearAndTypeCommand("win");
    FBTest.synthesizeKey("VK_TAB", null, win);
    FBTest.compare("window", cmdLine.value,
        "The command line must display 'window' after tab key completion.");

    cmdLine.value = "";
    callback();
}

// ********************************************************************************************* //
// Helpers

function verifyConsolePopup(shouldBeVisible)
{
    var preview = FW.Firebug.chrome.$("fbCommandPopup");

    var previewCollapsed = preview.getAttribute("collapsed");
    var expectedValue = shouldBeVisible ? "false" : "true";

    FBTest.compare(expectedValue, previewCollapsed,
            "Console preview must be " + (shouldBeVisible ? "visible" : "hidden"));
}
