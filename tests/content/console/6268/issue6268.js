function runTest()
{
    FBTest.sysout("issue6268.START");

    FBTest.openNewTab(basePath + "console/6268/issue6268.html", function(win)
    {
        FBTest.openFirebug();

        FBTest.enableConsolePanel(function(win)
        {
            var $id = document.getElementById.bind(win.document);
            FBTest.selectPanel("console");
            var tasks = new FBTest.TaskList();

            // 3.
            tasks.push(FBTest.executeCommandAndVerify, "console === window.console", "false",
                "span", "objectBox-number");
            // 4.
            tasks.wrapAndPush(FBTest.executeCommand, "console.expando = 'commandLine'");
            // 5.
            tasks.wrapAndPush(FBTest.click, $id("setExpandos"), win);
            // 6.
            tasks.push(FBTest.executeCommandAndVerify, "console.expando", '"commandLine"',
                "span", "objectBox-string");
            // 7.
            tasks.push(FBTest.executeCommandAndVerify, "console.webpageExpando", '"webpage"',
                "span", "objectBox-string");
            // 8.
            tasks.push(FBTest.executeCommandAndVerify, "console.log('commandLine');",
                "commandLine", "div", "logRow-log");
            // 9.
            tasks.wrapAndPush(FBTest.executeCommand, "window.console.log('console');");
            // 10.
            tasks.wrapAndPush(FBTest.click, $id("hackedConsoleLog"), win);
            // 11.
            tasks.wrapAndPush(FBTest.executeCommand, 
                "console.log = function(){window.hackedFromCL = true;}");
            // 12.
            tasks.wrapAndPush(FBTest.click, $id("hackedConsoleLog"), win);
            // 13.
            tasks.push(FBTest.executeCommandAndVerify, "hackedFromCL", "true", "span",
                "objectBox-number");
            // 14.
            tasks.push(FBTest.executeCommandAndVerify, "window.numberOfCalls", 2, "span",
                "objectBox-number");
            // 15.
            tasks.push(FBTest.executeCommandAndVerify, "console.debug() === '_firebugIgnore'",
                "true", "span", "objectBox-number");
            // 16.
            tasks.push(FBTest.executeCommandAndVerify,
                "window.console.debug() === undefined", "true", "span", "objectBox-number");

            tasks.run(function()
            {
                FBTest.testDone("issue6268.DONE");
            });
        });
    });
}

function click(callback, win, id)
{
    FBTest.click(win.document.getElementById(id));
    callback();
}
