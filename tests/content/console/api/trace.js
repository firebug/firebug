function runTest()
{
    FBTest.sysout("console.trace.START");
    FBTest.openNewTab(basePath + "console/api/trace.html", function(win)
    {
        function compareFrames(callback, list)
        {
            var config = {tagName: "div", classes: "logRow logRow-stackTrace"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var stackFrames = row.getElementsByClassName("objectBox-stackFrame");
                FBTest.compare(list.length, stackFrames.length,
                    "There must be " + list.length + " stack frames.");
                for (var i = 0; i < list.length; i++)
                {
                    var entry = list[i];
                    var reStack = new RegExp(entry[0] + "\\(" + entry[1].join("\\s*") + "\\)\\s*" +
                        FW.FBL.$STRF("Line", [entry[2], entry[3]]).replace(/([\\"'\(\)])/g, "\\$1"));
                    FBTest.compare(reStack, stackFrames[i].textContent, "Stack frame text must match.");
                }
                callback();
            });
        }

        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            compareFrames(function()
            {
                compareFrames(function()
                {
                    FBTest.enableScriptPanel(function(win)
                    {
                        compareFrames(function()
                        {
                            FBTest.testDone("console.trace.DONE");
                        }, [
                            ["actualTrace", ["arg1=1,", "arg2=2,", "arg3=undefined"], "trace.html", 101],
                            ["rec", ["left=0"], "trace.html", 96],
                            ["rec", ["left=1"], "trace.html", 94],
                            ["rec", ["left=2"], "trace.html", 94],
                            ["onExecuteTest", [], "trace.html", 88],
                            ["onclick", ["event=click", "clientX=0,", "clientY=0"], "onclick", 2],
                        ]);

                        FBTest.clearConsole();
                        FBTest.click(win.document.getElementById("testButton"));
                    });
                }, [
                    ["strictTrace", [], "trace.html", 107],
                    ["onclick", [], "trace.html", 1],
                ]);

                FBTest.clearConsole();
                FBTest.click(win.document.getElementById("strictButton"));
            }, [
                ["actualTrace", ["arg1=1,", "arg2=2,", "arg3=undefined"], "trace.html", 101],
                ["rec", ["left=0"], "trace.html", 96],
                ["rec", [], "trace.html", 94],
                ["rec", [], "trace.html", 94],
                ["onExecuteTest", [], "trace.html", 88],
                ["onclick", [], "trace.html", 1],
            ]);

            FBTest.clearConsole();
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
