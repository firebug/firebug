
function runTest()
{
    FBTest.sysout("issue6291.START");
    FBTest.openNewTab(basePath + "commandLine/6291/issue6291.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableScriptPanel();
        FBTest.selectPanel("console");
        FBTest.enableConsolePanel(function(win)
        {
            var panelNode = FBTest.getPanel("console").panelNode;
            var tasks = new FBTest.TaskList();

            // 3
            tasks.push(logProgress, "Testing the nsIXPCException's with alert()");
            var alertCommand = "alert({toString: function(){ throw 1; }})";
            tasks.push(FBTest.executeCommandAndVerify, alertCommand,
                "Error: Could not convert JavaScript argument arg 0 [nsIDOMWindow.alert]", "span",
                "errorMessage", false);
            tasks.push(testError, panelNode, alertCommand, 2);

            // 4.
            tasks.push(logProgress,
                "Testing the calls of the console API through the Command Line");
            var textToLog = "some text via the command line";
            tasks.push(FBTest.executeCommandAndVerify, "console.log('"+textToLog+"')", textToLog, 
                "div", "logRow-log");

            // 5.
            tasks.push(logProgress, "Testing the calls of the console API through the webpage");
            tasks.push(click, win.document.getElementById("logSomeText"));
            tasks.push(testLogMessageFromPage, panelNode, "some text via the webpage", 
                "issue6291.html (line 20)");

            // 6.
            tasks.push(logProgress, "Testing the evaluation of |debugger;|");
            tasks.push(FBTest.executeCommandAndVerify, "debugger;", "undefined", 
                "span", "objectBox-undefined", true, true);
            tasks.push(function(callback)
            {
                FBTest.compare(null, panelNode.querySelector(".fbCommandEditor"));
                callback();
            });

            // 7.
            tasks.push(logProgress, "Testing the click on \"debug Me\"");
            tasks.push(click, win.document.getElementById("debugMe"));
            // test whether the script panel is selected:
            tasks.push(testPanelSelected, "script");

            // 8.
            tasks.push(logProgress, "Testing the responsiveness of the Firebug UI");
            tasks.push(function(callback)
            {
                FBTest.selectSidePanel("callstack");
                callback();
            });
            tasks.push(testPanelSelected, "callstack");

            // 9.
            tasks.push(logProgress, "Go back to the Console Panel");
            tasks.push(function(callback)
            {
                FBTest.clickContinueButton();
                FBTest.selectPanel("console");
                callback();
            });

            // 10.
            tasks.push(logProgress, "Testing throwing error with a string");
            tasks.push(FBTest.executeCommandAndVerify, 'throw "aaa";', "Error: aaa", "span",
                "errorMessage");

            // 11. 
            tasks.push(logProgress, "Testing overriding commands");
            tasks.push(FBTest.executeCommandAndVerify, "window.cd = 'ok';", '"ok"', "span",
                "objectBox-string");

            // 12.
            tasks.push(FBTest.executeCommandAndVerify, "cd", '"ok"', "span", "objectBox-string");

            // 13.
            tasks.push(FBTest.executeCommandAndVerify, "delete window.cd;", "true",
                "span", "objectBox-number");

            // 14.
            tasks.push(FBTest.executeCommandAndVerify, "cd.toSource()", '"function () {\n'+
                '    [native code]\n}"', "pre", "objectBox-string");

            tasks.run(function()
            {
                FBTest.testDone("issue6291.DONE");
            }, 0);
        });
    });
}

function testError(callback, panelNode, errorSourceCode, lineNumber)
{
    var row = panelNode.querySelector(".logRow-errorMessage");
    var reTestLine = new RegExp("\\(line "+lineNumber+"\\)");
    var source = row.querySelector(".errorSourceBox");
    var sourceLink = row.querySelector(".objectLink-sourceLink");

    FBTest.compare(errorSourceCode, source.textContent,
        "the source of the error should be \""+errorSourceCode+"\"");

    FBTest.compare(reTestLine, sourceLink.textContent,
        "the error should be located at line "+lineNumber);

    callback();
}

function click(callback, node)
{
    node.ownerDocument.defaultView.setTimeout(function()
    {
        FBTest.click(node);
    }, 0)
    callback();
}

function testLogMessageFromPage(callback, panelNode, textToLog, source)
{
    FBTest.compare(textToLog, panelNode.querySelector(".objectBox-text").textContent,
        "the logged text should be: "+textToLog);
    FBTest.compare(source, panelNode.querySelector(".objectLink-sourceLink").textContent,
        "issue6291.html (line 1)");
    callback();
}

function logProgress(callback, message)
{
    FBTest.progress(message);
    callback();
}

function testPanelSelected(callback, panelName)
{
    FBTest.compare(true, FBTest.getPanel(panelName).visible);
    callback();
}
