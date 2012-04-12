function runTest()
{
    FBTest.sysout("issue3292.START");

    FBTest.openNewTab(basePath + "console/3292/issue3292.html", function(win)
    {
        FBTest.progress("Test page opened");

        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            FBTest.progress("Console panel enabled");

            var config = {
                tagName: "div",
                classes: "logRow logRow-log",
                counter: 4
            }

            waitForDisplayedElement("console", config, function(textNodes)
            {
                // Verify the log content
                FBTest.compare(/parent log\s*/, textNodes[0].textContent,
                    "parent log must be displayed");

                FBTest.compare(/included in iframe\s*/,textNodes[1].textContent,
                    "included in iframe must be displayed");

                FBTest.compare(/included in iframe\s*/, textNodes[2].textContent,
                    "included in iframe must be displayed");

                FBTest.compare(/iframe log\s*/, textNodes[3].textContent,
                    "iframe log must be displayed");

                FBTest.testDone("issue3292.DONE");
            });
        });
    });
}

// The elements might be displayed already or in the future.
// xxxHonza: if sucessfull, let's put it into FBTestFirebug
function waitForDisplayedElement(panelName, config, callback)
{
    var panelNode = FBTest.selectPanel(panelName).panelNode;
    var nodes = panelNode.getElementsByClassName(config.classes);
    FBTest.progress("Number of logs " + nodes.length);

    if (nodes.length >= config.counter)
    {
        FBTest.compare(config.counter, nodes.length, "Expected number of elements");

        // Callback is executed after timeout so, this fucntion can finish.
        // The callback usually ends the test.
        setTimeout(function() {
            callback(nodes);
        });
    }
    else
    {
        FBTest.waitForDisplayedElement(panelName, config, function()
        {
            waitForDisplayedElement(panelName, config, callback);
        });
    }
}
