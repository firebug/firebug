function runTest()
{
    var consoleButtons = [
        "fbBreakOnNextButton",
        "fbConsoleClear",
        "fbConsolePersist",
        "fbToggleProfiling",
        "fbConsoleFilter-all",
        "fbConsoleFilter-error",
        "fbConsoleFilter-warning",
        "fbConsoleFilter-info",
        "fbConsoleFilter-debug",
        "fbConsoleFilter-cookies",
    ];

    var htmlButtons = [
        "fbBreakOnNextButton",
        "fbToggleHTMLEditing",
        "fbPanelStatus",
    ];

    var cssButtons = [
        "fbToggleCSSEditing",
        "fbLocationList",
    ];

    var scriptButtons = [
        "fbBreakOnNextButton",
        "fbScriptFilterMenu",
        "fbLocationList",
    ];

    var domButtons = [
        "fbPanelStatus",
    ];

    var netButtons = [
        "fbBreakOnNextButton",
        "fbNetClear",
        "fbNetPersist",
        "fbNetFilter-all",
        "fbNetFilter-html",
        "fbNetFilter-css",
        "fbNetFilter-js",
        "fbNetFilter-xhr",
        "fbNetFilter-image",
        "fbNetFilter-plugin",
        "fbNetFilter-media",
        "fbNetFilter-font",
    ];

    var cookiesButtons = [
        "fbBreakOnNextButton",
        "fcCookiesMenu",
        "fcFilterMenu",
        "fcPerm",
    ];

    FBTest.openNewTab(basePath + "firebug/6300/issue6300.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["console", "script", "net", "cookies"], function()
            {
                FBTest.reload(function()
                {
                    var tasks = new FBTest.TaskList();
    
                    // Iterate from the first panel
                    tasks.push(verifyButtonVisibility, "console", consoleButtons);
                    tasks.push(verifyButtonVisibility, "html", htmlButtons);
                    tasks.push(verifyButtonVisibility, "stylesheet", cssButtons);
                    tasks.push(verifyButtonVisibility, "script", scriptButtons);
                    tasks.push(verifyButtonVisibility, "dom", domButtons);
                    tasks.push(verifyButtonVisibility, "net", netButtons);
                    tasks.push(verifyButtonVisibility, "cookies", cookiesButtons);
    
                    // ... and back
                    tasks.push(verifyButtonVisibility, "cookies", cookiesButtons);
                    tasks.push(verifyButtonVisibility, "net", netButtons);
                    tasks.push(verifyButtonVisibility, "dom", domButtons);
                    tasks.push(verifyButtonVisibility, "script", scriptButtons);
                    tasks.push(verifyButtonVisibility, "stylesheet", cssButtons);
                    tasks.push(verifyButtonVisibility, "html", htmlButtons);
                    tasks.push(verifyButtonVisibility, "console", consoleButtons);
    
                    tasks.run(function()
                    {
                        FBTest.testDone();
                    });
                });
            });
        });
    });
}

function verifyButtonVisibility(callback, panelName, buttons)
{
    FBTest.selectPanel(panelName);

    for (var i=0; i<buttons.length; i++)
    {
        var buttonId = buttons[i];
        var button = FW.Firebug.chrome.$(buttonId);

        if (!FBTest.ok(button, "The button must be there: " + buttonId + " (" + panelName + ")"))
            continue;

        FBTest.ok(isVisible(button), "The button must be visible: " + buttonId +
            " (" + panelName + ")");
    }

    callback();
}

function isVisible(elt)
{
    return (!elt.hidden && !elt.collapsed);
}
