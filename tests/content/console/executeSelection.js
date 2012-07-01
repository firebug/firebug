var testPageURL = basePath + "console/executeSelection.html";
var fileName = "index.js";

function runTest()
{
    FBTest.sysout("executeSelection.START");
    FBTest.openNewTab(testPageURL, function(win)
    {
        FBTest.openFirebug();
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
                FBTest.testDone("executeSelection.DONE");
            });
        });
    });
}

function executeAndVerifyNoSelection(callback, instructions, expected, useCommandEditor)
{
    executeAndVerifySelection(callback, instructions, expected, useCommandEditor);
}

function executeAndVerifySelection(callback, instructions, expected, useCommandEditor, 
                                   selectionStart, selectionEnd)
{
    FBTrace.sysout("executeSelection executeAndVerifySelection : instructions : \"" + 
                    instructions + "\"; useCommandEditor : " + 
                    useCommandEditor + "; expect : "+expected);
    FBTest.clearConsole();
    FBTest.clearAndTypeCommand(instructions, useCommandEditor);

    if(selectionStart !== undefined)
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

    FW.Firebug.CommandLine.enter(FW.Firebug.currentContext);
}

