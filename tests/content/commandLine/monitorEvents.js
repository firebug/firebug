function runTest()
{
    FBTest.sysout("commandline.monitorEvents.START");
    FBTest.openNewTab(basePath + "commandLine/monitorEvents.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            var tasks = new FBTest.TaskList();

            // Monitor click events of a button on the test page.
            tasks.push(monitorClickEvents);

            // Click the button to generate a click event.
            tasks.push(clickButton, win);

            tasks.run(function() {
                FBTest.testDone("commandline.monitorEvents.DONE");
            });
        });
    });
}

function monitorClickEvents(callback)
{
    var config = {tagName: "pre", classes: "objectBox objectBox-text"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.compare(">>> monitorEvents($(\"testButton\"), \"click\")",
            row.textContent,
            "The command line should display standard output for executed command.");
        callback();
    });

    FBTest.executeCommand("monitorEvents($(\"testButton\"), \"click\")");
}

function clickButton(callback, win)
{
    var config = {tagName: "a", classes: "objectLink objectLink-object"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.compare(/click clientX=\d+, clientY=\d+/,
            row.textContent,
            "The command line should display an info about the click event.");
        callback();
    });

    FBTest.click(win.document.getElementById("testButton"));
}
