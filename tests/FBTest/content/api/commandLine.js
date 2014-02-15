/* See license.txt for terms of usage */

/**
 * This file defines Command Line APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Command Line API

function getCommandLine(useCommandEditor)
{
    return useCommandEditor ?
        FW.Firebug.CommandEditor :
        FW.Firebug.CommandLine.getSingleRowCommandLine();
}

/**
 * executes an expression inside the Command Line
 * @param {String} the command to execute
 * @param {Object} the Firebug.chrome object
 * @param {Boolean} if set to true, type in the CommandEditor, or in the CommandLine otherwise
 */
this.executeCommand = function(expr, chrome, useCommandEditor, callback)
{
    FBTest.clearAndTypeCommand(expr, useCommandEditor);

    if (useCommandEditor)
    {
        // A delay of 20ms (somehow) exists between the time when the expression has been typed and
        // the Command Line / Command Editor is really updated.
        setTimeout(function()
        {
            FBTest.clickToolbarButton(chrome, "fbCmdLineRunButton");
            if (callback)
                callback();
        }, 20);
    }
    else
    {
        FBTest.sendKey("RETURN", "fbCommandLine");
        if (callback)
            callback();
    }
};

/**
 * clears the Command Line or the Command Editor
 */
this.clearCommand = function()
{
    FW.Firebug.CommandLine.clear(FW.Firebug.currentContext);
};


/**
 * clears and types a command into the Command Line or the Command Editor
 * @param {String} the command to type
 * @param {Boolean} if set to true, type in the CommandEditor, or in the CommandLine otherwise
 *
 */
this.clearAndTypeCommand = function(string, useCommandEditor)
{
    FBTest.clearCommand();
    FBTest.typeCommand(string, useCommandEditor);
};

/**
 * types a command into the Command Line or the Command Editor
 * @param {String} the command to type
 * @param {Boolean} if set to true, type in the CommandEditor, or in the CommandLine otherwise
 *
 */
this.typeCommand = function(string, useCommandEditor)
{
    var doc = FW.Firebug.chrome.window.document;
    var panelBar1 = doc.getElementById("fbPanelBar1");
    var cmdLine = getCommandLine(useCommandEditor);
    var win = panelBar1.browser.contentWindow;

    FBTest.setPref("commandEditor", (useCommandEditor == true));

    FW.Firebug.chrome.window.focus();
    panelBar1.browser.contentWindow.focus();
    cmdLine.focus();

    FBTest.sysout("typing "+string+" in to "+cmdLine+" focused on "+
        FW.FBL.getElementCSSSelector(doc.commandDispatcher.focusedElement)+
        " win "+panelBar1.browser.contentWindow);

    this.sendString(string, doc.commandDispatcher.focusedElement);
};

/**
 * Helper function for executing expression on the command line.
 * @param {Function} callback Appended by the test harness.
 * @param {String} expression Expression to be executed.
 * @param {String} expected Expected value displayed.
 * @param {String} tagName Name of the displayed element.
 * @param {String} class Class of the displayed element.
 * @param {Boolean} if set to false, does not clear the console logs
 * @param {Boolean} if set to true, use the Command Editor instead of the Command Line
 */
this.executeCommandAndVerify = function(callback, expression, expected, tagName, classes, clear,
    useCommandEditor)
{
    if (clear !== false)
        FBTest.clearConsole();

    var config = {tagName: tagName, classes: classes};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.compare(expected, row.textContent, "Verify: " +
            expression + " SHOULD BE " + expected);
        if (clear !== false)
            FBTest.clearConsole();

        if (callback)
            callback();
    });

    FBTest.progress("Execute expression: " + expression);
    FBTest.executeCommand(expression, undefined, useCommandEditor);
};

/**
 * Simulate selection in the Command Editor or the Command Line
 * @param {Integer} the index of the start of the selection
 * @param {Integer} the index of the end of the selection
 */
/*this.setCommandSelectionRange = function(selectionStart, selectionEnd)
{
    FW.Firebug.CommandLine.getCommandLine().setSelectionRange(selectionStart, selectionEnd);
}*/

// ********************************************************************************************* //
}).apply(FBTest);
