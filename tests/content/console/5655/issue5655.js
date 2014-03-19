function runTest()
{
    FBTest.openNewTab(basePath + "console/api/log.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();

                var nothingToOutput = FW.FBL.$STR("console.msg.nothing_to_output");
                var emptyString = FW.FBL.$STR("console.msg.an_empty_string");

                tasks.push(executeAndVerify, "console.log()", nothingToOutput);
                tasks.push(executeAndVerify, "console.log(null)", /null/);
                tasks.push(executeAndVerify, "console.log(undefined)", /undefined/);
                tasks.push(executeAndVerify, "console.log(\"\")", emptyString);
                tasks.push(executeAndVerify, "console.log(\"TEXT\")", "TEXT");

                var expr = "console.log(1,2,0,NaN,null,undefined,\"\",3, \"TEXT\", {1:2},[1,2,\"\", undefined])";
                var expected = " 1 2 0 NaN null undefined " + emptyString +
                    " 3 TEXT Object { 1=2} [1, 2, \"\", undefined]";
                tasks.push(executeAndVerify, expr, expected);

                tasks.run(function() {
                    FBTest.testDone();
                });
            });
        });
    });
}

function executeAndVerify(callback, expression, expected)
{
    var config = {tagName: "div", classes: "logRow logRow-log"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.compare(expected, row.textContent, "Verify: " +
            expression + " SHOULD BE " + expected);

        FBTest.clickToolbarButton(null, "fbConsoleClear");
        callback();
    });

    FBTest.executeCommand(expression);
}
