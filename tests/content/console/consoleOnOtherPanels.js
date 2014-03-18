/**
 * 1) Open a new tab and Firebug on it.
 * 2) Select and enable the Console panel.
 * 3) Verify visibility of the console preview (must be collapsed).
 * 4) Switch to the HTML panel.
 * 5) Verify visibility of the console preview (must be visible).
 * 6) Switch to the Console panel and disable it.
 * 7) Verify visibility of the console preview (must be collapsed).
 * 8) Switch to the HTML panel.
 * 9) Verify visibility of the console preview (must be collapsed).
 */
function runTest()
{
    FBTest.openNewTab(basePath + "console/consoleOnOtherPanels.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var tasks = new FBTest.TaskList();
            tasks.push(enableConsole);
            tasks.push(disableConsole);

            tasks.run(function()
            {
                FBTest.testDone();
            });
        });
    });
}

// ************************************************************************************************
// Tasks

function enableConsole(callback)
{
    FBTest.selectPanel("console");
    FBTest.enableConsolePanel(function()
    {
        verifyConsolePopup(false);
        FBTest.selectPanel("html");

        FBTest.clickConsolePreviewButton();
        verifyConsolePopup(true);

        callback();
    });
}

function disableConsole(callback)
{
    FBTest.selectPanel("console");
    FBTest.disableConsolePanel(function()
    {
        verifyConsolePopup(false);
        FBTest.selectPanel("html");

        verifyConsolePopup(false);
        callback();
    });
}

// ************************************************************************************************
// Helpers

function verifyConsolePopup(shouldBeVisible)
{
    var preview = FW.Firebug.chrome.$("fbCommandPopup");
    var splitter = FW.Firebug.chrome.$("fbCommandPopupSplitter");

    var previewCollapsed = preview.getAttribute("collapsed");
    var splitterCollapsed = splitter.getAttribute("collapsed");
    var expectedValue = shouldBeVisible ? "false" : "true";

    FBTest.compare(expectedValue, previewCollapsed,
        "Preview splitter must be " + (shouldBeVisible ? "visible" : "hidden"));
    FBTest.compare(expectedValue, splitterCollapsed,
        "Console preview must be " + (shouldBeVisible ? "visible" : "hidden"));
}
