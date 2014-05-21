function runTest()
{
    FBTest.openNewTab(basePath + "script/6566/issue6566.html", function(win)
    {
        FBTest.enablePanels(["console", "script"], function(win)
        {
            var taskList = new FBTest.TaskList();

            taskList.push(monitorFunction);
            taskList.push(createErrorBreakpoint, win);
            taskList.push(clickFunctionLink);
            taskList.push(verifyBreakpointsPanel);

            taskList.run(function()
            {
                FBTest.testDone();
            });
        });
    })
}

function monitorFunction(callback)
{
    FBTest.progress("monitorFunction");

    var config = {tagName: "div", classes: "logRow logRow-command"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.compare("monitor(onExecuteTest)", row.textContent, "The output must match");
        callback();
    });

    FBTest.executeCommand("monitor(onExecuteTest)");
}

function createErrorBreakpoint(callback, win)
{
    FBTest.progress("createErrorBreakpoint");

    var config = {tagName: "div", classes: "logRow logRow-errorMessage"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        // Verify displayed text.
        var reTextContent = /\s*asdf is not defineda\s*/;
        FBTest.compare(reTextContent, row.textContent, "Text content must match. " + row.textContent);

        // Create error breakpoint
        var br = row.getElementsByClassName("errorBreak")[0];
        FBTest.click(br);

        callback();
    });

    FBTest.click(win.document.getElementById("testButton"));
}

function clickFunctionLink(callback)
{
    FBTest.progress("clickFunctionLink");

    FBTest.waitForDisplayedText("console", "function()", function(element)
    {
        FBTest.progress("clickFunctionLink 1");

        var config = {tagName: "div", classes: "CodeMirror-highlightedLine"};
        FBTest.waitForDisplayedElement("script", config, function(element)
        {
            FBTest.progress("clickFunctionLink 2");

            FBTest.compare("15", element.children[0].textContent, "The line number must match.");
            callback();
        });

        FBTest.click(element);
    });

    FBTest.executeCommand("onExecuteTest");
}

function verifyBreakpointsPanel(callback)
{
    FBTest.progress("verifyBreakpointsPanel");

    var panel = FBTest.selectSidePanel("breakpoints");
    var panelNode = panel.panelNode;

    var bps = panelNode.getElementsByClassName("breakpointName");
    if (FBTest.compare(2, bps.length, "There must be two breakpoints"))
    {
        if (!FBTest.compare("onExecuteTest", bps[0].textContent,
            "The breakpoint name must match"))
        {
            var links = panelNode.getElementsByClassName("objectLink-sourceLink");
            FBTest.progress("sourceLink 1: " + links[0].textContent);
        }

        if (!FBTest.compare("onExecuteTest", bps[1].textContent,
            "The breakpoint name must match"))
        {
            var links = panelNode.getElementsByClassName("objectLink-sourceLink");
            FBTest.progress("sourceLink 2: " + links[1].textContent);
        }
    }

    callback();
}
