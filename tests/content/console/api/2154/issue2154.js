function runTest()
{
    FBTest.openNewTab(basePath + "console/api/2154/issue2154.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();
                var assertRe = new RegExp(FW.FBL.$STR("Assertion"));
                tasks.push(test, "console.log('hi')", /hi/, "div", "logRow-log");
                tasks.push(test, "console.log('HI %o', {a: 1})", /^Object\s*\{\s*a=1/, "a", "objectLink-object");
                tasks.push(testColor, "console.log('HI %c there', 'color:red')");
                tasks.push(test, "console.warn('hi')", /hi/, "div", "logRow-warn");
                tasks.push(test, "console.info('hi')", /hi/, "div", "logRow-info");
                tasks.push(test, "console.debug('hi')", /hi/, "div", "logRow-debug");
                tasks.push(test, "console.dir({a:123})", /123/, "td", "memberValueCell");
                tasks.push(test, "console.time('a'); setTimeout(console.timeEnd.bind(console, 'a'), 100)", /\./, "div", "logRow-info");
                tasks.push(test, "console.group('abc'); console.groupEnd()", /abc/, "div", "logRow-group");
                tasks.push(test, "console.groupCollapsed(123); console.groupEnd()", /123/, "div", "logRow-group");
                tasks.push(testDirectly, win, "console.count()", /1/, "span", "objectBox-text");
                tasks.push(testWithStack, "console.assert(true, 'fail'); console.assert(false)", assertRe, "div", "logRow-errorMessage");
                tasks.push(testWithStack, "console.error('what')", /what/, "div", "logRow-errorMessage");
                tasks.push(testWithStack, "console.exception(new Error('what'))", /Error: what/, "div", "logRow-errorMessage");

                tasks.run(FBTest.testDone);
            });
        });
    });
}

function test(callback, cmd, ...args)
{
    cmd = "w.postMessage(" + JSON.stringify(cmd) + ")";
    FBTest.executeCommandAndVerify(callback, cmd, ...args);
}
function testDirectly(callback, win, cmd, expected, tagName, classes)
{
    var config = {tagName: tagName, classes: classes};
    FBTest.waitForDisplayedElement("console", config, (row) =>
    {
        FBTest.compare(expected, row.textContent, "Verify: " +
            cmd + " SHOULD BE " + expected);
        FBTest.clearConsole();
        callback();
    });
    cmd = "w.postMessage(" + JSON.stringify(cmd) + ")";
    FBTest.progress("Execute expression: " + cmd);
    win.eval(cmd);
}
function testColor(callback, cmd)
{
    var config = {tagName: "div", classes: "logRow-log"};
    FBTest.waitForDisplayedElement("console", config, (row) =>
    {
        FBTest.ok(row.querySelector("[style]"), "log row must have a styled child");
        FBTest.clearConsole();
        callback();
    });
    cmd = "w.postMessage(" + JSON.stringify(cmd) + ")";
    FBTest.progress("Execute expression: " + cmd);
    FBTest.executeCommand(cmd);
}
function testWithStack(callback, cmd, expected, tagName, classes)
{
    var config = {tagName: tagName, classes: classes};
    FBTest.waitForDisplayedElement("console", config, (row) =>
    {
        FBTest.compare(expected, row.textContent, "Verify: " +
            cmd + " SHOULD BE " + expected);
        var title = row.getElementsByClassName("errorTitle")[0];
        title.click();
        var trace = row.getElementsByClassName("errorTrace")[0];
        FBTest.compare(/onmessage.*eval.*onmessage/, trace.textContent,
            "log must show a stack trace when clicked");
        FBTest.clearConsole();
        callback();
    });
    cmd = "w.postMessage(" + JSON.stringify(cmd) + ")";
    FBTest.progress("Execute expression: " + cmd);
    FBTest.executeCommand(cmd);
}
