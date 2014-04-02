/* See license.txt for terms of usage */

/**
 * This file defines Watch Panel APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// Watch Panel API

/**
 * Appends a new expression into the Watch panel (the side panel for the Script panel).
 * @param {Object} chrome The current Firebug's chrome (can be null).
 * @param {Object} expression The expression to be evaluated.
 * @param {Object} callback Called after the result is displayed.
 */
this.addWatchExpression = function(chrome, expression, callback)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var watchPanel = FBTest.getPanel("watches", true);
    FBTest.ok(watchPanel, "The watch panel must be there; " + expression);

    // Create new watch expression (should be done by events).
    var panelNode = watchPanel.panelNode;
    var watchNewRow = panelNode.querySelector(".watchEditBox");
    FBTest.ok(watchNewRow, "The watch edit box must be there; " + expression);

    // Click to open a text editor.
    FBTest.mouseDown(watchNewRow);

    var editor = panelNode.querySelector(".completionInput");
    FBTest.ok(editor, "The editor must be there; " + expression);

    // Wait till the result is evaluated and displayed.
    var doc = FBTest.getSidePanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, "tr",
        {"class": "memberRow watchRow"}, FW.FBL.cropString(expression, 25));

    recognizer.onRecognizeAsync((row) =>
    {
        var value = FW.FBL.getChildByClass(row, "memberValueCell");
        if (callback)
            callback(value);
    });

    // Set expression and press enter.
    FBTest.sendString(expression, editor);
    FBTest.sendKey("RETURN", editor);
};

/**
 * Sets new value for specified expression in the Watch side panel.
 *
 * @param {Object} chrome The current Firebug's chrome (can be null).
 * @param {Object} varName Name of the variable in the Watch panel.
 * @param {Object} expression New expression/value
 * @param {Object} callback Called after the result is displayed.
 */
this.setWatchExpressionValue = function(chrome, varName, expression, callback)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    if (!callback)
    {
        FBTest.sysout("setWatchExpressionValue; ERROR missing callback");
        return;
    }

    var watchPanel = FBTest.getPanel("watches", true);
    var row = this.getWatchExpressionRow(chrome, varName);
    if (!row)
        return null;

    // Click to open a text editor.
    FBTest.dblclick(row);

    var panelNode = watchPanel.panelNode;
    var editor = panelNode.querySelector(".completionInput");
    FBTest.ok(editor, "The editor must be there; " + varName);

    // Wait till the tree-row (with given variable name) is refreshed
    var doc = FBTest.getSidePanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, "Text",
        {"class": "memberLabelBox"}, varName);

    recognizer.onRecognizeAsync(function(element)
    {
        FBTest.sysout("setWatchExpressionValue; row refreshed: " + varName);

        var row = FW.FBL.getAncestorByClass(element, "memberRow");
        callback(row);
    });

    // Set expression and press enter.
    FBTest.sendString(expression, editor);
    FBTest.sendKey("RETURN", editor);
}

/**
 * Toggles boolean value in the Watch side panel.
 *
 * @param {Object} chrome The current Firebug's chrome (can be null).
 * @param {Object} varName Variable name
 * @param {Object} callback Called after the result is displayed.
 */
this.toggleWatchExpressionBooleanValue = function(chrome, varName, callback)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    if (!callback)
    {
        FBTest.sysout("setWatchExpressionValue; ERROR missing callback");
        return;
    }

    var watchPanel = FBTest.getPanel("watches", true);
    var row = this.getWatchExpressionRow(chrome, varName);
    if (!row)
        return null;

    // Click to open a text editor.
    FBTest.dblclick(row);

    // Wait till the tree-row (with given variable name) is refreshed
    var doc = FBTest.getSidePanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, "Text",
        {"class": "memberLabelBox"}, varName);

    recognizer.onRecognizeAsync(function(element)
    {
        FBTest.sysout("toggleWatchExpressionBooleanValue; row refreshed: " + varName);

        var row = FW.FBL.getAncestorByClass(element, "memberRow");
        callback(row);
    });
}

/**
 * Returns value for specified expression displayed in the Watch panel.
 *
 * @param {Object} chrome The current Firebug's chrome (optional)
 * @param {Object} expression The expression we are looking for.
 */
this.getWatchExpressionValue = function(chrome, expression)
{
    var row = this.getWatchExpressionRow(chrome, expression);
    if (!row)
        return null;

    var cell = row.querySelector(".memberValueCell");
    return cell.textContent;
};

/**
 * Returns the row element "&lt;tr&gt;" from the 'watches' side-panel for specified expression.
 *
 * @param {Object} chrome The current Firebug's chrome (optional)
 * @param {Object} expression The expression we are looking for.
 */
this.getWatchExpressionRow = function(chrome, expression)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var watchPanel = FBTest.getPanel("watches", true);
    FBTest.ok(watchPanel, "The watch panel must be there; " + expression);

    return getDOMMemberRow(watchPanel, expression);
};

// ********************************************************************************************* //
// Local Helpers

function getDOMMemberRow(panel, name)
{
    var panelNode = panel.panelNode;
    var rows = panelNode.querySelectorAll(".memberRow");

    // Iterate over all rows and pick the one that fits the name.
    for (var i=0; i<rows.length; i++)
    {
        var row = rows[i];
        var labelCell = row.querySelector(".memberLabelCell");
        if (labelCell.textContent == name)
            return row;
    }
}

// ********************************************************************************************* //
}).apply(FBTest);
