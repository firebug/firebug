var testProp = "0123456789012345678901234567890123456789012345678901234567890123456789";
function runTest()
{
    FBTest.openNewTab(basePath + "console/3029/issue3029.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var panel = FW.Firebug.chrome.selectPanel("console");
                onTextDisplayed(panel, "myProperty", function(elt)
                {
                    // Expand the property (the label must be clicked).

                    var label = FW.FBL.getAncestorByClass(elt, "memberLabel");
                    if (!label)
                        FBTest.sysout("issue3029: no label "+elt, elt);

                    FBTest.click(label);

                    var row = FW.FBL.getAncestorByClass(elt, "memberRow");
                    var value = row.querySelector(".memberValueCell");
                    FBTest.compare("\"" + testProp + "\"",
                        value.textContent, "Full value must be displayed now.");

                    FBTest.testDone();
                });

                // Execute test.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}

// xxxHonza: this could be part of the shared lib.
function onTextDisplayed(panel, text, callback)
{
    var rec = new MutationRecognizer(panel.document.defaultView, "Text", {}, text);
    rec.onRecognizeAsync(callback);
}
