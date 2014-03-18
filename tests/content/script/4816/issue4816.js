function runTest()
{
    var url = basePath + "script/4816/issue4816.html";
    FBTest.openNewTab(url, function(win)
    {
        FBTest.sysout("issue4816.tab opened");

        FBTest.enableScriptPanel(function(win)
        {
            FBTest.sysout("issue4816.script panel enabled");

            var tasks = new FBTest.TaskList();
            tasks.push(clickTestButton, win);
            tasks.push(openNewTab, url);
            tasks.push(resumeDebugger, url);

            tasks.run(function()
            {
                FBTest.clickContinueButton();
                FBTest.testDone();
            });
        });
    });
}

var debugContextId;

function clickTestButton(callback, win)
{
    FBTest.waitForBreakInDebugger(null, 18, false, function()
    {
        var panel = FBTest.getPanel("script");
        debugContextId = panel.panelNode.getAttribute("class");

        callback();
    });

    FBTest.click(win.document.getElementById("testButton"));
}

function openNewTab(callback, fileName)
{
    FBTest.openNewTab(fileName, function(win)
    {
        verifyWarning(callback)
    });
}

function verifyWarning(callback)
{
    var panel = FBTest.getPanel("script");
    var link = panel.panelNode.querySelector(".objectLink");

    var expected = FW.FBL.$STR("script.button.Go to that page");
    FBTest.compare(expected, link.innerHTML, "Proper warning message must be displayed.");

    // Select the debugging tab.
    FBTest.click(link);

    callback();
}

function resumeDebugger(callback)
{
    // Make sure we are in the right tab.
    var panel = FBTest.getPanel("script");
    var contextId = panel.panelNode.getAttribute("class");
    FBTest.compare(debugContextId, contextId, "The debugging tab must be selected");

    FBTest.waitForDebuggerResume(function()
    {
        callback();
    });

    FBTest.clickContinueButton();
}
