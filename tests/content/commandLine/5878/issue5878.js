function runTest()
{
    var basePath5878 = basePath + "commandLine/5878/";
    FBTest.openNewTab(basePath5878 + "issue5878.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();

                tasks.push(executeIncludeCommand, 'include("./myScript.js");');
                tasks.push(FBTest.executeCommandAndVerify, 'window.a', "1", "span", "objectBox-number");
                tasks.push(executeIncludeCommand, 'include("./myScript.js", "myscript");');
                tasks.push(FBTest.executeCommandAndVerify, 'window.a', "2", "span", "objectBox-number");

                var contextMenuTarget = null;
                var expectedMyScriptURL = basePath5878 + "myScript.js";
                tasks.push(checkTableContent, "myscript", function(table, row, aliasName, url)
                {
                    FBTest.ok(aliasName, "There should be an alias whose name is \"myscript\"");
                    if (aliasName)
                    {
                        contextMenuTarget = row;
                        FBTest.compare(expectedMyScriptURL, url,
                            "The alias should redirect to " + expectedMyScriptURL);
                    }
                });
                // test context menu:
                // (1): test include
                tasks.push(function(callback)
                {
                    if (contextMenuTarget)
                        FBTest.executeContextMenuCommand(contextMenuTarget, "fbInclude", callback);
                });
                tasks.push(FBTest.executeCommandAndVerify, 'window.a', "3",
                    "span", "objectBox-number", false);
                // (2): test copy location
                tasks.push(function(callback)
                {
                    FBTest.executeContextMenuCommand(contextMenuTarget, "fbCopyLocation", function()
                    {
                        FBTest.compare(FBTest.getClipboardText(), expectedMyScriptURL,
                            "The copied location should be: " + expectedMyScriptURL);
                        callback();
                    });
                });
                tasks.push(executeIncludeCommand, 'include("./myOtherScript.js", "myScript");');
                tasks.push(checkTableContent, "myscript", function(table, row, aliasName, url)
                {
                    FBTest.ok(aliasName, "There should be an alias whose name is \"myscript\"");
                    if (aliasName)
                    {
                        var expectedURL = basePath5878 + "myOtherScript.js";
                        FBTest.compare(expectedURL, url,
                            "The alias should redirect to " + expectedURL);
                    }
                });
                tasks.push(executeIncludeCommand, 'include(null, "myScript");');
                tasks.push(checkTableContent, "myscript", function(table, row, aliasName, url)
                {
                    FBTest.compare(aliasName, undefined,
                        "There should not be any alias whose name is \"myscript\" anymore");
                });
                // test for pending scripts
                tasks.push(executeIncludeCommand, 'include("./pendingScript.php")');
                tasks.push(FBTest.executeCommandAndVerify, "window.pendingDone", "1", "span",
                    "objectBox-number");
                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function checkTableContent(callback, expectedAliasName, checkFunction)
{
    FBTest.clearConsole();

    var config = {tagName: "div", classes: "logRow", counter: 2};
    FBTest.waitForDisplayedElement("console", config, function(element)
    {
        var table = element.getElementsByClassName("tableCommandLineInclude")[0];
        var aliasNameCell = table && table.querySelector("*[data-aliasname='myscript']");
        if (!table || !aliasNameCell)
        {
            checkFunction(table, null, null);
        }
        else
        {
            var row = FW.FBL.getAncestorByTagName(aliasNameCell, "tr");
            var aliasValueCell = row.getElementsByClassName("url")[0];
            checkFunction(table, row, aliasNameCell.dataset.aliasname, aliasValueCell.href);
        }
        callback();
    });
    FBTest.executeCommand("include()");
}

function executeIncludeCommand(callback, includeCommand)
{
    FBTest.clearConsole();
    var config = {tagName: "div", classes: "logRow-info"};
    FBTest.waitForDisplayedElement("console", config, function()
    {
        callback();
    });
    FBTest.executeCommand(includeCommand);
}
