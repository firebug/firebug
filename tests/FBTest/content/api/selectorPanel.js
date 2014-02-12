/* See license.txt for terms of usage */

/**
 * This file defines Selector APIs for test drivers.
 */

(function() {

//********************************************************************************************* //
// Selector Panel API

/**
* Appends a new selector trial to the Selectors panel (side panel of the CSS panel).
* @param {Object} chrome Current Firebug's chrome (can be null).
* @param {String} selector Selector to be added
* @param {Function} callback Callback function called after the result is displayed
*/
this.addSelectorTrial = function(chrome, selector, callback)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var selectorsPanel = FBTest.getPanel("selectors", true);
    FBTest.ok(selectorsPanel, "Selectors side panel must be there");

    // Create new selector trial
    var panelNode = selectorsPanel.panelNode;
    var trySelectorField = panelNode.getElementsByClassName("selectorEditorContainer")[0];
    FBTest.ok(trySelectorField, "Field to create a new selector group must be there");

    // Click to open a text editor
    FBTest.click(trySelectorField);

    var editor = panelNode.getElementsByClassName("selectorsPanelEditor")[0];
    FBTest.ok(editor, "Selector editor must be there");

    // Wait till the result is evaluated and displayed
    var doc = FBTest.getSidePanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, "a",
        {"class": "objectLink-element"});

    recognizer.onRecognizeAsync(function(objectLink)
    {
        if (callback)
            callback(objectLink);
    });

    // Type selector and press Enter
    FBTest.sendString(selector, editor);
    FBTest.sendKey("RETURN", editor);
};

// ********************************************************************************************* //
}).apply(FBTest);
