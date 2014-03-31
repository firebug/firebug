function runTest()
{
    var basePath6422 = basePath + "commandLine/6422/";
    FBTest.openNewTab(basePath6422 + "issue6422.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();
                var panelNode = FBTest.getPanel("console").panelNode;
                var doc = FW.Firebug.chrome.window.document;
                var cmdLine = doc.getElementById("fbCommandLine");

                function logSomething(callback, code, classes)
                {
                    var config = {tagName: "span", classes: classes};
                    FBTest.waitForDisplayedElement("console", config, function(elem)
                    {
                        callback(elem);
                    });
                    FBTest.executeCommand(code);
                }
                function useInCmdLine(callback, elem)
                {
                    FBTest.executeContextMenuCommand(elem, "fbUseInCommandLine", callback);
                }
                function testEmptyCmdLine(callback)
                {
                    logSomething(function(elem)
                    {
                        useInCmdLine(function()
                        {
                            FBTest.compare("$p", cmdLine.value, "Command Line must show $p");
                            FBTest.compare(0, cmdLine.selectionStart, "$p must be selected (start)");
                            FBTest.compare(2, cmdLine.selectionEnd, "$p must be selected (end)");
                            FBTest.executeCommandAndVerify(function()
                            {
                                callback();
                            }, "$p", "0", "span", "objectBox-number", true);
                        }, elem);
                    }, "0", "objectBox-number");
                }

                function testNonEmptyCmdLine(callback)
                {
                    logSomething(function(elem)
                    {
                        FBTest.typeCommand("a");
                        useInCmdLine(function()
                        {
                            FBTest.compare("a$p", cmdLine.value, "Command Line must show a$p");
                            FBTest.compare(1, cmdLine.selectionStart, "$p must be selected (start)");
                            FBTest.compare(3, cmdLine.selectionEnd, "$p must be selected (end)");
                            FBTest.executeCommandAndVerify(function()
                            {
                                callback();
                            }, "$p", "\"\"", "span", "objectBox-string", true);
                        }, elem);
                    }, "console.log('%o', '');", "objectBox-string");
                }

                tasks.push(FBTest.executeCommandAndVerify, "$p", "undefined", "span", "objectBox-undefined", true);
                tasks.push(testEmptyCmdLine);
                tasks.push(testNonEmptyCmdLine);
                tasks.run(function()
                {
                    FBTest.testDone();
                }, 0);
            });
        });
    });
}
