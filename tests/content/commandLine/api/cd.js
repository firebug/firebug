function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/api/cd.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();
                tasks.push(FBTest.executeCommandAndVerify, "cd(frames[0])",
                    /Window cdFrame\.html/,
                    "div", "logRow-info");

                tasks.push(FBTest.executeCommandAndVerify, "$(\"#test-iframe-1\")",
                    /<div\s*id=\"test-iframe-1\">/,
                    "a", "objectLink objectLink-element");

                tasks.push(FBTest.executeCommandAndVerify, "cd(top)",
                    /Window cd\.html/,
                    "div", "logRow-info");

                tasks.push(FBTest.executeCommandAndVerify, "cd(undefined)",
                    "Error: The cd() argument must be a window.", "div", "subLogRow", false);

                tasks.push(testErrorInfo);

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function testErrorInfo(callback)
{
    var panelNode = FBTest.getPanel("console").panelNode;
    var row = panelNode.querySelector(".logRow-errorMessage");
    var frames = row.getElementsByClassName("objectBox-stackFrame");

    FBTest.click(row.querySelector(".subLogRow"));

    FBTest.compare(1, frames.length,
        "there should be exactly one element in the stack trace");
    FBTest.compare("cd(undefined)", row.querySelector(".errorSourceCode").textContent,
        "the source of the error should be : \"cd(undefined)\"");

    // xxxFlorent: TODO ?: check the result of clicking the source link
    FBTest.clearConsole();

    callback();
}
