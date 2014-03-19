function runTest()
{
    FBTest.openNewTab(basePath + "console/4384/issue4384.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var doc = FW.Firebug.chrome.window.document;
                var button = doc.getElementById("fbToggleProfiling");

                FBTest.ok(button.disabled, "Profile button should be disabled");

                function onMutationObserve(records)
                {
                    mutationObserver.disconnect();

                    FBTest.ok(!button.disabled, "Profile button should not be disabled");

                    FBTest.testDone();
                }

                var mutationObserver = new MutationObserver(onMutationObserve);
                mutationObserver.observe(button, {attributes: true});

                FBTest.enableScriptPanel();
            });
        });
    });
}
