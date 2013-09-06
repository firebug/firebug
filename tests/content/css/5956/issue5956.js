function runTest()
{
    FBTest.sysout("issue5956.START");

    FBTest.openNewTab(basePath + "css/5956/issue5956.html", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("stylesheet");

        FBTest.selectPanelLocationByName(panel, "issue5956.html");

        var tests = [];
        tests.push(propDeclaration);
        tests.push(propName);
        tests.push(propValue);

        FBTest.runTestSuite(tests, function()
        {
            FBTest.testDone("issue5956; DONE");
        });
    });
}

function propDeclaration(callback)
{
    executeTest("fbCopyPropertyDeclaration",
        "background-image: -moz-linear-gradient(135deg, #788CFF, #B4C8FF);",
        "Property declaration must be copied correctly", callback);
}

function propName(callback)
{
	executeTest("fbCopyPropertyName", "background-image", "Property name must be copied correctly",
		callback);
}

function propValue(callback)
{
	executeTest("fbCopyPropertyValue", "-moz-linear-gradient(135deg, #788CFF, #B4C8FF)",
		"Property value must be copied correctly", callback);
}

//************************************************************************************************

function executeTest(contextMenuItemID, expectedValue, message, callback)
{
    FBTest.searchInCssPanel("element", function(node)
    {
        FBTest.sysout("issue4411; selection: ", node);

        var rule = FW.FBL.getAncestorByClass(node, "cssRule");
        var prop = rule.getElementsByClassName("cssProp").item(0);

        FBTest.waitForClipboard(expectedValue, function(copiedValue)
        {
            FBTest.compare(expectedValue, copiedValue, message);
            callback();
        });

        FBTest.executeContextMenuCommand(prop, contextMenuItemID);
    });
}
