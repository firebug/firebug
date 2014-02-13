/* See license.txt for terms of usage */

/**
 * This file defines DOM Panel APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// DOM Panel API

/**
 * Waits till a specified property is displayed in the DOM panel.
 *
 * @param {String} propName Name of the property to be displayed
 * @param {Function} callback Function called after the property is visible.
 * @param {Boolean} checkAvailability Execute the callback synchronously if the property
 *      is already available.
 */
this.waitForDOMProperty = function(propName, callback, checkAvailability)
{
    var panel = FBTest.getPanel("dom");
    if (checkAvailability)
    {
        var row = getDOMMemberRow(panel, propName);
        if (row)
            return callback(row);
    }

    var recognizer = new MutationRecognizer(panel.document.defaultView,
        "Text", {}, propName);

    recognizer.onRecognizeAsync(function(element)
    {
        var row = FW.FBL.getAncestorByClass(element, "memberRow");

        // If the memberRow isn't there, the mutation comes from different panel (console?).
        if (!row)
            FBTest.waitForDOMProperty(propName, callback, checkAvailability);
        else
            callback(row);
    });
};

this.refreshDOMPanel = function()
{
    var panel = this.getPanel("dom");
    panel.rebuild(true);
};

/**
 * Returns the row element "&lt;tr&gt;" from the DOM panel for specified member name.
 *
 * @param {Object} chrome The current Firebug's chrome (optional)
 * @param {Object} propName The name of the member displayed in the panel.
 */
this.getDOMPropertyRow = function(chrome, propName)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var domPanel = FBTest.getPanel("dom", true);
    FBTest.ok(domPanel, "The DOM panel must be there");

    return getDOMMemberRow(domPanel, propName);
};

//********************************************************************************************* //
// Local Helpers

function getDOMMemberRow(panel, name)
{
    var panelNode = panel.panelNode;
    var rows = panelNode.getElementsByClassName("memberRow");

    // Iterate over all rows and pick the one that fits the name.
    for (var i=0; i<rows.length; i++)
    {
        var row = rows[i];
        var labelCell = row.getElementsByClassName("memberLabelCell")[0];
        if (labelCell.textContent == name)
            return row;
    }
}

// ********************************************************************************************* //
}).apply(FBTest);
