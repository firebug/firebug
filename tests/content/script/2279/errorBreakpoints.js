function runTest()
{
    FBTest.openNewTab(basePath + "script/2279/testErrorBreakpoints.html", function(win)
    {
        FBTest.enablePanels(["console", "script"], function(win)
        {
            var config = {tagName: "div", classes: "logRow logRow-errorMessage"};
            FBTest.waitForDisplayedElement("console", config, function(el)
            {
                var objBox = el.querySelector("span.objectBox-errorMessage");
                var errBP = el.querySelector("span.errorBreak");

                FBTest.progress("Found Breakpoint button: " + errBP);

                FBTest.ok(!hasClass(objBox, "breakForError"), "Must be unchecked");

                var config = {
                    tagName: "span",
                    classes: "objectBox-errorMessage breakForError"
                };

                FBTest.waitForDisplayedElement("console", config, function(el)
                {
                    FBTest.ok(hasClass(objBox, "breakForError"), "Must be checked");

                    var chrome = FW.Firebug.chrome;
                    FBTest.waitForBreakInDebugger(chrome, 11, false, function(row)
                    {
                        FBTest.clickContinueButton();
                        FBTest.progress("Break on error!");
                        FBTest.testDone();
                    });

                    FBTest.reload(function(win)
                    {
                        FBTest.clickContentButton(win, "testButton");
                    });
                });

                // toggle breakpoint
                FBTest.click(errBP);
            });

            FBTest.clickContentButton(win, "testButton");
        });
    });
}

function hasClass(el, className)
{
    return (el.getAttribute("class").indexOf(className) != -1);
}
