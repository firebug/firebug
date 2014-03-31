function runTest()
{
    FBTest.openNewTab(basePath + "script/callstack/3645/issue3645.html", function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.selectSidePanel("callstack");

            var tasks = new FBTest.TaskList();
            tasks.push(executeTest, win);
            tasks.push(clickRerun, win);
            tasks.run(function() {
                FBTest.testDone();
            });
        });
    });
}

function executeTest(callback, win)
{
    FBTest.waitForBreakInDebugger(FW.Firebug.chrome, 19, false, function(row)
    {
        verifyStackFrames();
        callback();
    });

    FBTest.click(win.document.getElementById("testButton"));
}

function clickRerun(callback, win)
{
    FBTest.waitForBreakInDebugger(FW.Firebug.chrome, 19, false, function(row)
    {
        verifyStackFrames();
        FBTest.clickContinueButton();
        callback();
    });

    FBTest.clickRerunButton();
}

function verifyStackFrames()
{
    var stackPanel = FBTest.getPanel("callstack");
    var panelNode = stackPanel.panelNode;
    var frames = panelNode.querySelectorAll(".objectBox-stackFrame");
    FBTest.compare(4, frames.length, "There must be four frames");
}
