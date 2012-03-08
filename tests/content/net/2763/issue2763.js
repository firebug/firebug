function runTest()
{
    FBTest.sysout("issue2763.START");

    // Load test case page
    FBTest.openNewTab(basePath + "net/2763/issue2763.html", function(win)
    {
        // Open Firebug and enable the Net panel.
        FBTest.openFirebug();
        FBTest.enableNetPanel(function(win)
        {
            // Select Net panel
            var panel = FW.Firebug.chrome.selectPanel("net");

            // The upload can take more time on slower connetions, so wait
            // for 5 sec at most, which is enough to repro the problem.
            var timeoutID = setTimeout(function() {
                FBTest.progress("Test finished on timeout.");
                FBTest.testDone("issue2763.DONE");
            }, 5000);

            // Wait for the only request that should be displayed in the Net panel.
            onRequestDisplayed(function(netRow)
            {
                clearTimeout(timeoutID);

                // Finish test, if Firefox hasn't crashed by now, all is OK.
                FBTest.testDone("issue2763.DONE");
            });

            // Execute test by clicking on the 'Execute Test' button.
            FBTest.click(win.document.getElementById("testButton"));
            FBTest.progress("Test button clicked");
        });
    });
}

function onRequestDisplayed(callback)
{
    // Create listener for mutation events.
    var doc = FBTest.getPanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, "tr",
        {"class": "netRow category-xhr hasHeaders loaded"});

    // Wait for a XHR log to appear in the Net panel.
    recognizer.onRecognizeAsync(callback);
}
