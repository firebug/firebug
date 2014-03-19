function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/api/$x.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var taskList = new FBTest.TaskList();

                taskList.push(FBTest.executeCommandAndVerify, "$x(\"//button\")",
                    "[button#btn1, button#btn2, button#btn3, button#btn4, button#btn5]",
                    "span", "objectBox objectBox-array");
                taskList.push(FBTest.executeCommandAndVerify, "$x(\"count(//button)\")", "5", "span",
                    "objectBox objectBox-number");
                taskList.push(FBTest.executeCommandAndVerify, "$x(\"string(//button/text())\")",
                    "\"Button 1\"", "span", "objectBox objectBox-string");
                taskList.push(FBTest.executeCommandAndVerify, "$x(\"count(//button)>2\")", "true",
                    "span", "objectBox objectBox-number");
                taskList.push(FBTest.executeCommandAndVerify,
                    "$x(\".//button\", document.getElementById(\"buttonGroup2\"))",
                    "[button#btn4, button#btn5]", "span", "objectBox objectBox-array");
                taskList.push(FBTest.executeCommandAndVerify, "$x(\"//button\", document, \"node\")",
                    /<button\sid="btn1">/, "a", "objectLink objectLink-element");
                taskList.push(FBTest.executeCommandAndVerify,
                    "$x(\"count(//button)>2\", document, \"number\")", "1", "span",
                    "objectBox objectBox-number");
                taskList.push(FBTest.executeCommandAndVerify,
                    "$x(\"count(//button)>2\", document, \"string\")", "\"true\"", "span",
                    "objectBox objectBox-string");
                taskList.push(FBTest.executeCommandAndVerify,
                    "$x(\"//button\", document, \"bool\")", "true", "span",
                    "objectBox objectBox-number");
                taskList.push(FBTest.executeCommandAndVerify,
                    "try{$x(\"test test\")} catch(e){'ex';}", "\"ex\"", "span",
                    "objectBox objectBox-string");

                taskList.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}
