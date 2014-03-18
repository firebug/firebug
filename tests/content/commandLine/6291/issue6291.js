
function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/6291/issue6291.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["console", "script"], function()
            {
                var panelNode = FBTest.getSelectedPanel().panelNode;
                var tasks = new FBTest.TaskList();

                // 3
                tasks.push(logProgress, "Testing the nsIXPCException's with alert()");
                var atobCommand = "atob('b');";
                var expected = {
                    sourceCode: atobCommand,
                    scriptName: "/* " + FW.FBL.$STR("commandline.errorSourceHeader").substr(0, 3) +
                        "...b('b');",
                    lineNo: 2
                };
                tasks.push(FBTest.executeCommandAndVerify, atobCommand,
                    "Error: String contains an invalid character", "span",
                    "errorMessage", false);
                tasks.push(testError, expected);

                // 4.
                tasks.push(logProgress,
                    "Testing the calls of the console API through the Command Line");
                var textToLog = "some text via the command line";
                tasks.push(FBTest.executeCommandAndVerify, "console.log('" + textToLog + "')",
                    textToLog, "div", "logRow-log");

                // 5.
                tasks.push(logProgress, "Testing the calls of the console API through the webpage");
                tasks.push(click, win.document.getElementById("logSomeText"));
                tasks.push(testLogMessageFromPage, panelNode, "some text via the webpage",
                    FW.FBL.$STRF("Line", ["issue6291.html", 10]));

                // 6.
                tasks.push(logProgress, "Testing the evaluation of |debugger;|");
                tasks.push(FBTest.executeCommandAndVerify, "debugger;", "undefined",
                    "span", "objectBox-undefined", true, true);
                tasks.push(function(callback)
                {
                    FBTest.compare(null, panelNode.getElementsByClassName("fbCommandEditor")[0],
                        "Command Editor should not be defined");
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
                    FBTest.testDone();
                }, 0);
            });
        });
    });
}

function testError(callback, expected)
{
    var panelNode = FBTest.getSelectedPanel().panelNode;
    var row = panelNode.getElementsByClassName("logRow-errorMessage")[0];
    var source = row.getElementsByClassName("errorSourceBox")[0];
    var sourceLink = row.getElementsByClassName("objectLink-sourceLink")[0];

    FBTest.compare(expected.sourceCode, source.textContent,
        "Source of the error should be \"" + expected.sourceCode + "\"");

    FBTest.compare(FW.FBL.$STRF("Line", [expected.scriptName, expected.lineNo]),
        sourceLink.textContent,
        "Location of the error should be '" + sourceLink + "'");

    callback();
}

function click(callback, node)
{
    node.ownerDocument.defaultView.setTimeout(function()
    {
        FBTest.click(node);
    }, 0);

    callback();
}

function testLogMessageFromPage(callback, panelNode, textToLog, source)
{
    FBTest.compare(textToLog, panelNode.getElementsByClassName("objectBox-text")[0].textContent,
        "Logged text should be: " + textToLog);
    FBTest.compare(source,
        panelNode.getElementsByClassName("objectLink-sourceLink")[0].textContent,
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
    FBTest.compare(true, FBTest.getPanel(panelName).visible,
        "'" + panelName + "' panel must be visible");
    callback();
}
