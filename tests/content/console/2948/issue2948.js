function runTest()
{
    FBTest.openNewTab(basePath + "console/2948/issue2948.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var panel = FW.Firebug.chrome.selectPanel("console");

                // Define individual async tasks.
                var tasks = new FBTest.TaskList();
                tasks.push(executeResponse, win);
                tasks.push(openPopup, win);
                tasks.push(executeResponse, win);

                // Run them all.
                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function executeResponse(callback, win)
{
    FBTest.progress("XHR is going to be executed.");

    // Wait for request being displayed in the Console panel.
    FBTest.waitForDisplayedElement("console", null, function(row)
    {
        FBTest.progress("Cool, XHR log has been created.");

        callback();
    });

    FBTest.click(win.document.getElementById("executeRequest"));
}

function openPopup(callback, win)
{
    win.document.addEventListener("popup-loaded", function()
    {
        FBTest.progress("Great, the popup is loaded");

        // close the popup window.
        var popup = win.wrappedJSObject.popup;
        delete win.wrappedJSObject.popup;
        popup.close();

        FBTest.progress("The popup should be closed now");

        callback();
    }, true);

    FBTest.click(win.document.getElementById("openPopup"));
}
