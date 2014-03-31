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
            tasks.push(triggerBreakpoint, btnTestReturn, 12);
            tasks.wrapAndPush(FBTest.clickStepOverButton);
            tasks.wrapAndPush(FBTest.clickStepOverButton);
            tasks.push(waitForFrameResult, "<return value>", 42);
            tasks.push(checkResultNonEditable, watchPanel);
            tasks.wrapAndPush(FBTest.clickContinueButton);


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

function checkResultNonEditable(callback, watchPanel)
{
    FBTest.progress("=== Testing that the result value is not editable ===");
    var resultValue = watchPanel.document.querySelector(".frameResultValueRow .memberValueCell");
    FBTest.ok(resultValue, "Get the element for the result value");

    checkResultNonEditableThroughDoubleClick(watchPanel, resultValue);
    checkResultNonEditableThroughContextMenu(watchPanel, resultValue, function()
    {
        FBTest.progress("=== End Test ===");
        callback();
    });
}

function checkResultNonEditableThroughDoubleClick(watchPanel, resultValue)
{
    FBTest.dblclick(resultValue);

    // If the editor appears, editorInput != null
    var editorInput = watchPanel.document.querySelector(".completionInput");

    FBTest.ok(!editorInput, "No editor should appear after double clicking");
}

function checkResultNonEditableThroughContextMenu(watchPanel, resultValue, callback)
{
    // Check that the context menu does not contain the "Edit Property..." item
    var contextMenu = ContextMenuController.getContextMenu(resultValue);
    function onPopupShown()
    {
        ContextMenuController.removeListener(resultValue, "popupshown", onPopupShown);
        var menuItems = Array.slice(contextMenu.getElementsByTagName("menuitem"));
        FBTest.ok(menuItems.length, "There should be context menu items");
        contextMenu.hidePopup();

        // xxxFlorent: TODO test that carefully
        var editPropertyExists = menuItems.some(function(elt)
        {
            return elt.getAttribute("label") === FW.FBL.$STR("EditProperty");
        });

        FBTest.ok(!editPropertyExists, "The property should not be editable through the context "+
            "menu");
        callback();
    }
    ContextMenuController.addListener(resultValue, "popupshown", onPopupShown);
    var eventDetails = {type: "contextmenu", button: 2};
    FBTest.synthesizeMouse(resultValue, 2, 2, eventDetails);
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
