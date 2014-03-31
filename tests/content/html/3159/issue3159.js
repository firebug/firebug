function runTest()
{
    FBTest.openNewTab(basePath + "html/3159/issue3159.html", function(win)
    {
        // 1. Open Firebug
        FBTest.openFirebug(function ()
        {
            // 2. Switch to the HTML panel
            // 3. Inspect the first minus of the formula above
            FBTest.selectElementInHtmlPanel("minus", function(node)
            {
               // 4. Click the item Show Entities As Symbols from the HTML panel options menu
               // 5. Click the item Show Entities As Names from the HTML panel options menu
               // 6. Click the item Show Entities As Unicode from the HTML panel options menu
                var tests = new FBTest.TaskList();

                var prevPrefValue = FBTest.getPref("entityDisplay");

                tests.push(verifyDisplay, "symbols", node, "\u2212");
                tests.push(verifyDisplay, "names", node, "&minus;");
                tests.push(verifyDisplay, "unicode", node, "&#8722;");

                tests.run(function()
                {
                    FBTest.setPref("entityDisplay", prevPrefValue);
                    FBTest.testDone();
                });
            });
        });
    });
}

function verifyDisplay(callback, prefValue, node, expected)
{
    FBTest.setPref("entityDisplay", prefValue);

    var nodeBox = FBTest.getSelectedNodeBox();
    var nodeText = nodeBox.getElementsByClassName("nodeText")[0];
    FBTrace.sysout("nodeText "+expected, nodeText);
    FBTest.compare(expected, nodeText.textContent,
        "Minus must be displayed as '" + expected + "'");
    callback();
}