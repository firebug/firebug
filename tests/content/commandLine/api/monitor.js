function runTest()
{
    var url = basePath + "commandLine/api/monitor.html";
    FBTest.openNewTab(url, function(win)
    {
        FBTest.enablePanels(["console", "script"], function()
        {
            var tasks = new FBTest.TaskList();
            tasks.push(monitor, win);
            tasks.push(unmonitor, win);
            tasks.run(FBTest.testDone);
        });
    });
}

function monitor(callback, win)
{
    var browser = FBTest.getCurrentTabBrowser();

    var listener =
    {
        onBreakpointAdded: function(bp)
        {
            DebuggerController.removeListener(browser, listener);

            FBTest.clearConsole();
            FBTest.compare(31, bp.lineNo, "The breakpoint must be created on the right line");
            FBTest.compare(2 /*BP_MONITOR*/, bp.type, "The breakpoint must be BP_MONITOR");

            FBTest.waitForDisplayedText("console", "Hello World!", () =>
            {
                var panel = FBTest.getPanel("console").panelNode;
                var rows = panel.getElementsByClassName("logRow");
                if (!FBTest.compare(2, rows.length, "There must be two logs"))
                {
                    callback();
                    return;
                }

                var row = rows[0];
                var link = row.getElementsByClassName("functionCallTitle")[0];
                FBTest.click(link);

                var box = row.getElementsByClassName("objectBox-functionCall")[0];
                var frames = box.getElementsByClassName("objectBox-stackFrame");
                if (FBTest.compare(2, frames.length, "There must be two stack frames"))
                {
                    FBTest.compare("onExecuteTest()monitor.html (line 32)",
                        frames[0].textContent,
                        "Proper frame must be displayed");

                    FBTest.compare("onclick(event=click clientX=0, clientY=0)" +
                        "testBut...te Test (line 1)", frames[1].textContent,
                        "Proper frame must be displayed");
                }

                callback();
            });

            FBTest.clickContentButton(win, "testButton");
        }
    }

    DebuggerController.addListener(browser, listener);

    FBTest.executeCommand("monitor(onExecuteTest)");
}

function unmonitor(callback, win)
{
    var browser = FBTest.getCurrentTabBrowser();

    var listener =
    {
        onBreakpointRemoved: function(bp)
        {
            DebuggerController.removeListener(browser, listener);

            FBTest.clearConsole();
            FBTest.compare(31, bp.lineNo, "Proper breakpoint must be removed");
            FBTest.compare(2 /*BP_MONITOR*/, bp.type, "The breakpoint must be BP_MONITOR");

            FBTest.waitForDisplayedText("console", "Hello World!", () =>
            {
                var panel = FBTest.getPanel("console").panelNode;
                var rows = panel.getElementsByClassName("logRow");
                FBTest.compare(1, rows.length, "There must be one log");

                callback();
            });

            FBTest.clickContentButton(win, "testButton");
        }
    }

    DebuggerController.addListener(browser, listener);

    FBTest.executeCommand("unmonitor(onExecuteTest)");
}
