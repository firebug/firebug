var supportedVersion = FBTest.compareFirefoxVersion("15*") >= 0;

function runTest()
{
    FBTest.sysout("issue3645.START");

    // A bug needed for this feature has been fixed in Firefox 15
    // https://bugzilla.mozilla.org/show_bug.cgi?id=746601
    if (!supportedVersion)
    {
        FBTest.progress("This test needs Firefox 15+");
        FBTest.testDone("issue1811.DONE");
        return;
    }

    FBTest.openNewTab(basePath + "script/callstack/3645/issue3645.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableScriptPanel(function(win)
        {
            FW.Firebug.chrome.selectPanel("script");
            FW.Firebug.chrome.selectSidePanel("callstack");

            var tasks = new FBTest.TaskList();
            tasks.push(executeTest, win);
            tasks.push(clickRerun, win);
            tasks.run(function() {
                FBTest.testDone("issue3645.DONE");
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

    /*FBTest.*/clickRerunButton();
}

function verifyStackFrames()
{
    var stackPanel = FBTest.getPanel("callstack");
    var panelNode = stackPanel.panelNode;
    var frames = panelNode.querySelectorAll(".objectBox-stackFrame");
    FBTest.compare(4, frames.length, "There must be four frames");
}

// xxxHonza: use the one from FBTest (since 1.8b6)
function clickRerunButton()
{
    FBTest.clickToolbarButton(FW.Firebug.chrome, "fbRerunButton");
}

