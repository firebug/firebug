function runTest()
{
    FBTest.sysout("console.trace.START");
    FBTest.openNewTab(basePath + "console/api/trace.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            var config = {tagName: "div", classes: "logRow logRow-stackTrace"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var stackFrames = row.getElementsByClassName("objectBox-stackFrame");
                FBTest.compare(2, stackFrames.length, "There must be 2 stack frames.");

                var reStack1 = new RegExp("onExecuteTest\\(\\)\\s*" +
                    FW.FBL.$STRF("Line", ["trace.html", 34]).replace(/([\\"'\(\)])/g, "\\$1"));
                FBTest.compare(reStack1, stackFrames[0].textContent, "The first stack frame text must match.");

                FBTest.progress("Found stack frame "+stackFrames[1].textContent);
                var reStack2 = new RegExp("onclick\\(Object\\s*{\\s*name=\\\"event\\\"}\\)1\\s*" +
                    FW.FBL.$STRF("Line", ["", 2]).replace(/([\\"'\(\)])/g, "\\$1"));  // before R5281
                var reStack2 = new RegExp("onclick\\(event=click\\s*clientX=0,\\s*clientY=0\\)1\\s*" +
                    FW.FBL.$STRF("Line", ["", 2]).replace(/([\\"'\(\)])/g, "\\$1")); // after R7281
                var reStack3 = new RegExp("onclick\\(event=click\\s*clientX=0,\\s*clientY=0\\)" +
                    FW.FBL.$STRF("Line", ["onclick", 2]).replace(/([\\"'\(\)])/g, "\\$1")); // after R10542
                FBTest.compare(reStack3, stackFrames[1].textContent, "The second stack frame text must match.");

                FBTest.testDone("console.trace.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
