function runTest()
{
    FBTest.setPref("showClosures", true);

    FBTest.openNewTab(basePath + "dom/6481/issue6481.html", function()
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableScriptPanel(function(win)
            {
                var panel = FBTest.selectPanel("dom");

                FBTest.waitForDOMProperty("someone", function(row)
                {
                    FBTest.progress("Property someone is visible");

                    FBTest.waitForDOMProperty("introduce", function(row)
                    {
                        FBTest.progress("Function introduce is visible");

                        FBTest.waitForDOMProperty("(closure)", function(row)
                        {
                            FBTest.progress("Property (closure) is visible");

                            FBTest.waitForDOMProperty("_name", function(row)
                            {
                                FBTest.progress("Property _name is visible");

                                var value = row.querySelector(".memberValueCell .objectBox-string");
                                FBTest.compare("\"Arthur\"", value.textContent, "The value must match");

                                FBTest.waitForDOMProperty("_unused", function(row)
                                {
                                    FBTest.progress("Property _unused is visible");

                                    var value = row.querySelector(".memberValueCell .objectBox-optimizedAway");
                                    FBTest.compare(FW.FBL.$STR("firebug.reps.optimizedAway"), value.textContent,
                                        "The value must match");

                                    FBTest.testDone();
                                }, true);

                            }, true);

                            // Click to expand the '(closure)' item
                            FBTest.click(FW.FBL.getElementByClass(row, "memberLabel", "protoLabel"));
                        }, true);

                        // Click to expand the 'introduce' function
                        FBTest.click(FW.FBL.getElementByClass(row, "memberLabel", "userFunctionLabel"));
                    }, true);

                    // Click to expand the 'someone' property
                    FBTest.click(FW.FBL.getElementByClass(row, "memberLabel", "userLabel"));
                }, true);
            });
        });
    });
}
