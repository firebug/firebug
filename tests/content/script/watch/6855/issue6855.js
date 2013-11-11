function runTest()
{
    FBTest.sysout("issue6855.START");
    FBTest.openNewTab(basePath + "script/watch/6855/issue6855.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("script");
        FBTest.enableScriptPanel(function()
        {
            var tasks = new FBTest.TaskList();
            var btnTestReturn = win.document.getElementById("test_return");
            var btnTestException = win.document.getElementById("test_exception");

            tasks.push(triggerBreakpoint, btnTestReturn, 12);
            tasks.wrapAndPush(FBTest.clickStepOverButton);
            tasks.wrapAndPush(FBTest.clickStepOverButton);
            tasks.push(waitForFrameResult, "<return value>", 42);

            //tasks.push(check
            tasks.run(function()
            {
                FBTest.testDone("issue6855.DONE");
            });
        });
    });
}

function triggerBreakpoint(callback, btn, lineNo)
{
    FBTest.progress("clicking on #" + btn.id);
    FBTest.click(btn, btn.ownerDocument.defaultView);
    FBTest.progress("Waiting for debugger to break at line " + lineNo);
    var chrome = FW.Firebug.chrome;
    FBTest.waitForBreakInDebugger(chrome, lineNo, false, function()
    {
        FBTest.ok(true, "The execution is halted at line " + lineNo);
        callback();
    });
}

function waitForFrameResult(callback, key, value)
{
    var config = {tagName: "tr", classes: "memberRow frameResultValueRow"};
    FBTest.waitForDisplayedElement("watch", config, function(element)
    {
        var tdKey = element.querySelector("memberLabelCell");
        var tdValue = element.querySelector("memberValueCell");
        FBTest.compare(key, tdKey.textContent, "The result value label should be " + key);
        FBTest.compare(value, tdValue.textContent, "The result value should be " + value);
        callback();
    });
}

function checkResultNonEditable(callback)
{
    var resultValue = document.querySelector(".frameResultValueRow .memberValueCell");
    // xxxFlorent: TODO also check for  double-click
    FBTest.rightClick(resultValue);
    setTimeout(function()
    {
        var menuItems = Array.slice(document.querySelectorAll("#fbContextMenu menuitem"));
        // xxxFlorent: TODO test that carefully
        var editPropertyExists = menuItems.some(function(elt)
        {
            return elt.label === FW.Firebug.$STR("EditProperty");
        });
        FBTest.ok(!editPropertyExists, "The property should not be editable through the context "+
            "menu");
        callback();
    }, 0);
}

