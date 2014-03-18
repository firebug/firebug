var supportedVersion = FBTest.compareFirefoxVersion("15*") >= 0;

function runTest()
{
    // A bug needed for this feature has been fixed in Firefox 15
    // https://bugzilla.mozilla.org/show_bug.cgi?id=746601
    if (!supportedVersion)
    {
        FBTest.progress("This test needs Firefox 15+");
        FBTest.testDone();
        return;
    }

    // 1) Open test page
    FBTest.openNewTab(basePath + "dom/2558/issue2558.html", function(win)
    {
        // 2) Open Firebug and enable the Script panel.
        FBTest.openFirebug(function()
        {
            FBTest.enableScriptPanel(function()
            {
                FBTest.selectPanel("script");

                // Wait for break in debugger.
                var chrome = FW.Firebug.chrome;
                FBTest.waitForBreakInDebugger(chrome, 32, false, function(sourceRow)
                {
                    FBTest.progress("issue2558; Halted on debugger keyword.");
                    FW.Firebug.chrome.selectSidePanel("watches");
                    var watchPanel = FW.Firebug.currentContext.getPanel("watches", true);
                    FBTest.ok(watchPanel, "The watch panel must be there");

                    // 4) Create new watch expression 'arguments'.
                    watchPanel.addWatch("arguments");

                    //xxxHonza: sometimes the element is there synchronously
                    // sometimes asynchronously. This must be solved e.g. by
                    // MutationRecognizer?
                    setTimeout(function()
                    {
                        // 5) Check evaluated expression.
                        var watchEntry = watchPanel.panelNode.getElementsByClassName(
                            "memberRow watchRow hasChildren").item(0);
                        FBTest.ok(watchEntry, "There must be an expandable watch entry");

                        // Resume debugger, test done.
                        FBTest.clickContinueButton();
                        FBTest.testDone();
                    }, 300);
                });

                // 3) Execute test on the page (use async to have clean callstack).
                setTimeout(function()
                {
                    FBTest.click(win.document.getElementById("testButton"));
                }, 10);
            });
        });
    });
}
