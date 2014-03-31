function runTest()
{
    FBTest.openNewTab(basePath + "console/7068/issue7068.html?automated=true", function(win)
    {
        FBTest.openFirebug(function()
        {
            // Note: we don't test the Firefox DevTools logs directly.
            // The webpage overwrited the console.log() function and just appends the logged messages
            // into win.logged.
            FBTest.selectPanel("console");
            FBTest.reload(function(win)
            {
                var logged = win.wrappedJSObject.logged;
                FBTest.compare("log from the main window,log from the iframe", logged.toString(),
                    "Two messages should have been logged into the DevTools");
                FBTest.click(win.document.getElementById("button"));
                FBTest.compare("log from the button", logged[2],
                    "the button should have logged something into the DevTools");
                FBTest.enableConsolePanel(function()
                {
                    FBTest.click(win.document.getElementById("button"));
                    var options = {tagName: "span", classes:"objectBox-text"};
                    FBTest.waitForDisplayedElement("console", options, function(row)
                    {
                        FBTest.compare("log from the button", row.textContent,
                            "a log should appear in the Firebug Console");
                        FBTest.reload(function(win)
                        {
                            var panel = FBTest.getPanel("console").panelNode;
                            var loggedInFB = Array.map(panel.querySelectorAll(".objectBox-text"),
                                (node) => node.textContent).join(",");
                            FBTest.compare("log from the main window,log from the iframe", loggedInFB,
                                "Two logs should have appeared in the Firebug Console");
                            FBTest.testDone();
                        });
                    });
                });
            });
        });
    });
}
