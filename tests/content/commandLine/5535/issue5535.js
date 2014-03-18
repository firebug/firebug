var testPageURL = basePath + "commandLine/5535/issue5535.html";
var fileName = "index.js";

function runTest()
{
    FBTest.openNewTab(testPageURL, function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function()
            {
                var tasks = new FBTest.TaskList();
                FBTest.selectPanel("console");
                // we create the instructions we will play with
                var instructions = "var a = \"no selection\";";
                instructions += "var b = window.a || \"selection\";";
                instructions += "console.log(b);";

                var selectionStart = instructions.indexOf(";")+1;

                // expected results :
                var RES_NO_SELECTION = 'no selection';
                var RES_SELECTION = 'selection';

                tasks.push(executeAndVerifySelection, instructions, RES_SELECTION,
                    true, selectionStart);

                tasks.push(executeAndVerifyNoSelection, instructions, RES_NO_SELECTION, true);

                tasks.push(executeAndVerifySelection, instructions, RES_NO_SELECTION,
                    false, selectionStart);

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

// Apparently, a delay of 20ms is applied when a text is entered in the command editor.
var DELAY = 20;

function executeAndVerifyNoSelection(callback, instructions, expected, useCommandEditor)
{
    executeAndVerifySelection(callback, instructions, expected, useCommandEditor);
}

function executeAndVerifySelection(callback, instructions, expected, useCommandEditor,
    selectionStart, selectionEnd)
{
    FBTest.sysout("issue5535 executeAndVerifySelection : instructions : \"" +
        instructions + "\"; useCommandEditor : " +
        useCommandEditor + "; expect : "+expected);

    FBTest.clearConsole();
    FBTest.clearAndTypeCommand(instructions, useCommandEditor);
    setTimeout(() => {
        if (selectionStart !== undefined)
        {
            var cmdLine = FW.Firebug.CommandLine.getCommandLine(FW.Firebug.currentContext);
            cmdLine.setSelectionRange(selectionStart, selectionEnd || cmdLine.value.length);
        }

        var config = {tagName: "div", classes: "logRow logRow-command"};
        FBTest.waitForDisplayedElement("console", config, function(row)
        {
            var panelNode = FBTest.getPanel("console").panelNode;
            var rows = panelNode.querySelectorAll(".logRow .objectBox-text");
            if (FBTest.compare(2, rows.length, "There must be two logs"))
            {
                FBTest.compare(expected, rows[1].textContent, "\"" + expected + "\" must be shown");
            }
            callback();
        });

        FBTest.clickToolbarButton(null, "fbCmdLineRunButton");
    }, DELAY);
}

