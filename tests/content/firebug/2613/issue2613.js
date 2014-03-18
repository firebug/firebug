// 1) Load test page
// 2) Open Firebug UI and Enable all panels
// 3) Step by step reload the page with css, html and dom panel selected.
// 4) Verify content of each selected panel after reload.
function runTest()
{
    FBTest.openNewTab(basePath + "firebug/2613/issue2613.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            // The reload functions will be called three times. Once for each panel.
            var testSuite = [];
            testSuite.push(function(callback)
            {
                reload("stylesheet", callback);
            });
            testSuite.push(function(callback)
            {
                reload("html", callback);
            });
            testSuite.push(function(callback)
            {
                reload("dom", callback);
            });

            // Run test suite.
            FBTest.runTestSuite(testSuite, function()
            {
                FBTest.testDone();
            });
        });
    });
}

function reload(panelName, callback)
{
    FBTest.clearCache();

    // Select specified panel.
    FBTest.selectPanel(panelName);

    // Reload with the panel selected (it takes 2 sec to get the
    // DOMContentLoaded event on this page)
    FBTest.reload(function()
    {
        var panel = FBTest.getPanel(panelName);
        FBTest.ok(panel.panelNode.firstChild, "The " + panelName + " panel must not be empty");
        callback();
    })
}
