function runTest()
{
    // Load test case page
    FBTest.openNewTab(basePath + "net/2763/issue2763.html", (win) =>
    {
        // Open Firebug and enable the Net panel.
        FBTest.openFirebug(() =>
        {
            // Select Net panel
            FBTest.enableNetPanel((win) =>
            {
                // The upload can take more time on slower connections, so wait
                // for 5 seconds at most, which is enough to reproduce the problem.
                var timeoutID = setTimeout(() =>
                {
                    FBTest.progress("Test finished on timeout.");
                    FBTest.testDone();
                }, 5000);

                // Wait for the only request that should be displayed in the Net panel.
                FBTest.waitForDisplayedElement("net", null, (netRow) =>
                {
                    clearTimeout(timeoutID);

                    // Finish test, if Firefox hasn't crashed by now, all is OK.
                    FBTest.testDone();
                });

                // Execute test by clicking on the 'Execute Test' button.
                FBTest.clickContentButton(win, "testButton");
                FBTest.progress("Test button clicked");
            });
        });
    });
}
