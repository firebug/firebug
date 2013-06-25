function runTest()
{
    FBTest.openNewTab(basePath + "script/2279/testErrorBreakpoints.html", function(win)
    {
        // xxxHonza: enable also the Script panel so, response cache is activated.
        FBTest.enableScriptPanel();
        FBTest.enableConsolePanel(function(win)
        {
            var config = {tagName: "div", classes: "logRow logRow-errorMessage"};
            FBTest.waitForDisplayedElement("console", config, function(el)
            {
                FBTest.progress("recognized error row: " + el);

                var objBox = el.querySelector("span.objectBox-errorMessage");
                var errBP = el.querySelector("span.errorBreak");

                FBTest.progress("Found Breakpoint button: " + errBP);

                // test unchecked
                FBTest.ok(!hasClass(objBox, "breakForError"), "Must be unchecked");

                // toggle breakpoint
                FBTest.click(errBP);

                // xxxHonza: the timeout is a hack (but should fix test-bot failure)
                setTimeout(function()
                {
                    // test checked
                    FBTest.ok(hasClass(objBox, "breakForError"), "Must be checked");

                    FBTest.click(errBP);
                    setTimeout(function()
                    {
                        // test unchecked again
                        FBTest.ok(!hasClass(objBox, "breakForError"), "Must be unchecked again");
                        FBTest.testDone();
                    });
                });
            });

            FBTest.progress("waiting for an error to appear");
        });
    });
}

function hasClass(el, className)
{
    return (el.getAttribute("class").indexOf(className) != -1);
}
