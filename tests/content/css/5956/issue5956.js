function runTest()
{
    FBTest.openNewTab(basePath + "css/5956/issue5956.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            FBTest.selectPanelLocationByName(panel, "issue5956.html");

            var tests = [];
            tests.push(propDeclaration);
            tests.push(propName);
            tests.push(propValue);

            FBTest.runTestSuite(tests, function()
            {
                FBTest.testDone();
            });
        });
    });
}

function propDeclaration(callback)
{
    executeTest("fbCopyPropertyDeclaration",
        "background-image: -moz-linear-gradient(135deg, #788cff, #b4c8ff);",
        "Property declaration must be copied correctly", callback);
}

function propName(callback)
{
	executeTest("fbCopyPropertyName", "background-image", "Property name must be copied correctly",
		callback);
}

function propValue(callback)
{
	executeTest("fbCopyPropertyValue", "-moz-linear-gradient(135deg, #788cff, #b4c8ff)",
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

        function executeContextMenuCommand()
        {
            FBTest.executeContextMenuCommand(prop, contextMenuItemID);
        }

        FBTest.waitForClipboard(expectedValue, executeContextMenuCommand, function(copiedValue)
        {
            FBTest.compare(expectedValue, copiedValue, message);
            callback();
        });
    });
}
