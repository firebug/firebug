function runTest()
{
    FBTest.setPref("showXMLHttpRequests", true);
    FBTest.openNewTab(basePath + "console/spy/5049/issue5049.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var options = {
                    tagName: "div",
                    classes: "logRow logRow-spy loaded",
                    counter: 2
                };

                waitForDisplayedElementAsync("console", options, function(row)
                {
                    var panel = FBTest.getPanel("console");
                    var root = panel.panelNode;

                    var statuses = root.querySelectorAll(".spyRow .spyStatus");
                    if (FBTest.compare(2, statuses.length, "There must be two statuses"))
                    {
                        FBTest.ok(statuses[0].textContent, "There must be a status info: " +
                            statuses[0].textContent);
                        FBTest.ok(statuses[1].textContent, "There must be a status info: " +
                            statuses[1].textContent);
                    }

                    var times = root.querySelectorAll(".spyRow .spyTime");
                    FBTest.compare(2, times.length, "There must be two time fields");
                    {
                        FBTest.ok(times[0].textContent, "There must be a time info: " +
                            times[0].textContent);
                        FBTest.ok(times[1].textContent, "There must be a time info: " +
                            times[1].textContent);
                    }

                    FBTest.testDone();
                });

                // Execute test implemented on the test page.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}

function waitForDisplayedElementAsync(panelName, config, callback)
{
    FBTest.waitForDisplayedElement(panelName, config, function(element)
    {
        setTimeout(function(element)
        {
            callback(element);
        }, 1000);
    });
}
