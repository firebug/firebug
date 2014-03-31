function runTest()
{
    FBTest.openNewTab(basePath + "html/5448/issue5448.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function()
            {
                FBTest.selectPanel("html");

                // Set display of entities to show them as names
                FBTest.setPref("entityDisplay", "names");

                FBTest.selectElementInHtmlPanel("content", function(node)
                {
                    // Execute an expression on the Command Line
                    FBTest.selectPanel("console");
                    var expr = "$0.appendChild(document.createTextNode(' tnode')); $0.normalize();";
                    FBTest.executeCommand(expr);

                    // Switch back to the HTML panel
                    FBTest.selectPanel("html");

                    // Wait till the executed expression causes HTML panel update.
                    FBTest.waitForHtmlMutation(null, "div", function(node)
                    {
                        // Verify HTML panel content after mutation.
                        var expected = /section.*a &aring;&auml;&ouml; b.*section/;
                        FBTest.compare(expected, node.textContent, "The text content must match");

                        FBTest.testDone();
                    });
                });
            });
        });
    });
}
