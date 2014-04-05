function runTest()
{
    FBTest.openNewTab(basePath + "script/watch/6855/issue6855.html", function(win)
    {
        FBTest.enableScriptPanel(function()
        {
            var tasks = new FBTest.TaskList();
            var btnTestReturn = win.document.getElementById("test_return");
            var btnTestException = win.document.getElementById("test_exception");

            var watchPanel = FBTest.selectSidePanel("watches");

            // Test <return value>
            tasks.push(triggerBreakpoint, btnTestReturn, 25);
            tasks.wrapAndPush(FBTest.clickStepOverButton);
            tasks.wrapAndPush(FBTest.clickStepOverButton);
            tasks.push(waitForFrameResult, "<return value>", 0);
            tasks.push(checkResultEditableThroughDoubleClick);
            tasks.wrapAndPush(FBTest.clickContinueButton);
            tasks.wrapAndPush(verifyReturnValueChanged, win);


            // Test <exception>
            tasks.push(triggerBreakpoint, btnTestException, 18);
            tasks.wrapAndPush(FBTest.clickStepOverButton);
            tasks.wrapAndPush(FBTest.clickStepOverButton);

            tasks.push(waitForFrameResult, "<exception>",
                'ReferenceError: waitIDontExist is not defined' +
                'return waitIDontExist("I will throw an exception!");');

            /*tasks.push(checkExceptionProperties, watchPanel);*/
            tasks.wrapAndPush(FBTest.clickContinueButton);
            tasks.run(function()
            {
                FBTest.testDone();
            });
        });
    });
}

function triggerBreakpoint(callback, btn, lineNo)
{
    FBTest.progress("clicking on #" + btn.id);
    setTimeout(function()
    {
        FBTest.click(btn);
    }, 0);
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
    var config = {tagName: "tr", classes: "frameResultValueRow"};
    FBTest.waitForDisplayedElement("watches", config, function(element)
    {
        FBTest.progress("=== Testing " + key + " ===");
        var tdKey = element.querySelector(".memberLabelCell");
        var tdValue = element.querySelector(".memberValueCell");
        FBTest.compare(key, tdKey.textContent, "The result value label should be " + key);
        FBTest.compare(value, tdValue.textContent, "The result value should be " + value);
        FBTest.progress("=== End Test ===");
        callback();
    });
}

function checkResultEditableThroughDoubleClick(callback)
{
    FBTest.setWatchExpressionValue(null, "<return value>", "window", callback);
}

function checkExceptionProperties(callback, watchPanel)
{
    FBTest.progress("=== Checking the exception properties ===");
    var exceptionElt = watchPanel.document.querySelector(".frameResultValueRow");

    FBTest.waitForDisplayedElement("watches", {tagName: "tr", classes: "userRow"}, function()
    {

        var properties = [];
        var curSibling = exceptionElt;
        while ((curSibling = curSibling.nextSibling) && curSibling.classList.contains("userRow"))
            properties.push(curSibling);

        FBTest.compare(4, properties.length, "There should be 4 properties");

        function getColumnElements(childrenSelector)
        {
            return properties.map(function(prop)
            {
                return prop.querySelector(childrenSelector).textContent;
            }).join(",");
        }

        var keys = getColumnElements(".memberLabelCell");
        FBTest.compare("columnNumber,fileName,lineNumber,stack", keys,
            "Checking the property names");

        var values = getColumnElements(".memberValueCell");
        FBTest.compare(/20,".*?issue6855\.html",19,"@.*?issue6855\.html:19\\n"/, values,
            "Checking the values");

        FBTest.progress("=== End Test ===");

        callback();
    });
    // Expand the properties.
    FBTest.click(exceptionElt.querySelector(".memberLabel"));
}

function verifyReturnValueChanged(win)
{
    var val = win.document.getElementById("testResultValueField").value
    FBTest.compare(42, val, "The return value should have been changed and the value of the field" + 
        " should be set to 42");
}
