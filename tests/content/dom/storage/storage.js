/**
 * Test for DOM session and local storage.
 * 
 * Related issues:
 * Issue 3611: localStorage and sessionStorage not shown in DOM panel
 */
function runTest()
{
    FBTest.sysout("storage.START");
    FBTest.openNewTab(basePath + "dom/storage/storage.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            var tasks = new FBTest.TaskList();
            tasks.push(testEmptySessionStorage, win);
            tasks.push(executeAndVerify, "sessionStorage",
                new RegExp("\\s*" + FW.FBL.$STRP("firebug.storage.totalItems", [0]) + "\\s*"),
                "a", "objectLink-Storage");

            tasks.push(testEmptyLocalStorage, win);
            tasks.push(executeAndVerify, "localStorage",
                new RegExp("\\s*" + FW.FBL.$STRP("firebug.storage.totalItems", [0]) + "\\s*"),
                "a", "objectLink-Storage");

            tasks.push(testEmptyGlobalStorage, win);
            tasks.push(executeAndVerify, "globalStorage",
                new RegExp("\\s*" + FW.FBL.$STRP("firebug.storage.totalItems", [0]) + "\\s*"),
                "a", "objectLink-StorageList");

            tasks.push(testSessionStorageData, win);
            tasks.push(executeAndVerify, "sessionStorage",
                new RegExp("\\s*" + FW.FBL.$STRP("firebug.storage.totalItems", [2]) +
                    "\\s*issue=\\\"value1\\\",\\s*name=\\\"item1\\\"\\s*"),
                "a", "objectLink-Storage");

            tasks.push(testLocalStorageData, win);
            tasks.push(executeAndVerify, "localStorage",
                new RegExp("\\s*" + FW.FBL.$STRP("firebug.storage.totalItems", [10]) +
                    "\\s*item6=\\\"6\\\", item3=\\\"3\\\", item8=\\\"8\\\", item0=\\\"0\\\", item5=\\\"5\\\", item2=\\\"2\\\", item7=\\\"7\\\", item4=\\\"4\\\", item9=\\\"9\\\", item1=\\\"1\\\""),
                "a", "objectLink-Storage");

            tasks.push(testGlobalStorageData, win);
            tasks.push(executeAndVerify, "globalStorage",
                new RegExp("\\s*" + FW.FBL.$STRP("firebug.storage.totalItems", [1]) +
                    "\\s*test1=\\\"Hello1\\\"\\s*"),
                "a", "objectLink-StorageList");

            tasks.run(function()
            {
                FBTest.testDone("storage.DONE");
            });
        });
    });
}

function testEmptySessionStorage(callback, win)
{
    FBTest.waitForDOMProperty("sessionStorage", function(row)
    {
        FBTest.compare(new RegExp("\\s*" + FW.FBL.$STRP("firebug.storage.totalItems", [0]) + "\\s*"),
            row.textContent, "The session storage must be empty now");
        callback();
    });

    // Clear storage and refresh panel content.
    FBTest.click(win.document.getElementById("clearStorage"));
    var panel = FBTest.selectPanel("dom");
    panel.rebuild(true);
}

function testEmptyLocalStorage(callback, win)
{
    FBTest.waitForDOMProperty("localStorage", function(row)
    {
        FBTest.compare(new RegExp("\\s*" + FW.FBL.$STRP("firebug.storage.totalItems", [0]) + "\\s*"),
            row.textContent, "The local storage must be empty now");
        callback();
    });

    // Clear storage and refresh panel content.
    FBTest.click(win.document.getElementById("clearStorage"));
    var panel = FBTest.selectPanel("dom");
    panel.rebuild(true);
}

function testEmptyGlobalStorage(callback, win)
{
    FBTest.waitForDOMProperty("localStorage", function(row)
    {
        FBTest.compare(new RegExp("\\s*" + FW.FBL.$STRP("firebug.storage.totalItems", [0]) + "\\s*"),
            row.textContent, "The global storage must be empty now");
        callback();
    });

    // Clear storage and refresh panel content.
    FBTest.click(win.document.getElementById("clearStorage"));
    var panel = FBTest.selectPanel("dom");
    panel.rebuild(true);
}

function testSessionStorageData(callback, win)
{
    FBTest.waitForDOMProperty("sessionStorage", function(row)
    {
        FBTest.compare(
            new RegExp("\\s*" + FW.FBL.$STRP("firebug.storage.totalItems", [2]) + 
                "\\s*issue=\\\"value1\\\",\\s*name=\\\"item1\\\"\\s*"),
            row.textContent, "The session storage must have proper data");
        callback();
    });

    // Init storage and refresh panel content.
    FBTest.click(win.document.getElementById("initStorage"));
    var panel = FBTest.selectPanel("dom");
    panel.rebuild(true);
}

function testLocalStorageData(callback, win)
{
    FBTest.waitForDOMProperty("localStorage", function(row)
    {
        FBTest.compare(
            new RegExp("\\s*" + FW.FBL.$STRP("firebug.storage.totalItems", [10]) +
                "\\s*item6=\\\"6\\\",\\s*item3=\\\"3\\\",\\s*" + FW.FBL.$STR("firebug.reps.more") + "...\\s*"),
            row.textContent, "The local storage must have proper data");
        callback();
    });

    // Clear storage and refresh panel content.
    FBTest.click(win.document.getElementById("initStorage"));
    var panel = FBTest.selectPanel("dom");
    panel.rebuild(true);
}

function testGlobalStorageData(callback, win)
{
    FBTest.waitForDOMProperty("globalStorage", function(row)
    {
        FBTest.compare(
            new RegExp("\\s*" + FW.FBL.$STRP("firebug.storage.totalItems", [1]) +
            "\\s*test1=\\\"Hello1\\\"\\s*"),
            row.textContent, "The local storage must have proper data");
        callback();
    });

    // Clear storage and refresh panel content.
    FBTest.click(win.document.getElementById("initStorage"));
    var panel = FBTest.selectPanel("dom");
    panel.rebuild(true);
}

// ********************************************************************************************* //
// xxxHonza: could be part of FBTest namespace.

/**
 * Helper function for executing expression on the command line.
 * @param {Function} callback Appended by the test harness.
 * @param {String} expression Expression to be executed.
 * @param {String} expected Expected value displayed.
 * @param {String} tagName Name of the displayed element.
 * @param {String} class Class of the displayed element.
 */
function executeAndVerify(callback, expression, expected, tagName, classes)
{
    var config = {tagName: tagName, classes: classes};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.compare(expected, row.textContent, "Verify: " +
            expression + " SHOULD BE " + expected);

        FBTest.clickToolbarButton(null, "fbConsoleClear");
        callback();
    });

    FBTest.selectPanel("console");
    FBTest.executeCommand(expression);
}
