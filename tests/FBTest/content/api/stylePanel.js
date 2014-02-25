/* See license.txt for terms of usage */

/**
 * This file defines Style side panel APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// Style side panel API

/**
 * Gets the CSS property with the given name
 * @param {String} selector Selector of the rule, in which the property is located
 * @param {String} propName Name of the property
 * @param {Function} callback Function called when the property is found
 */
this.getCSSProp = function(selector, propName, callback)
{
    var panel = FBTest.selectPanel("css");

    // Get element containing the rule selector
    var selectorNodes = panel.panelNode.getElementsByClassName("cssSelector");
    var selectorNode = null;
    for (var i = 0; i < selectorNodes.length; i++)
    {
        if (selectorNodes[i].textContent === selector)
        {
            selectorNode = selectorNodes[i];
            break;
        }
    }

    if (!this.ok(selectorNode, "Rule with selector '" + selector + "' must exist"))
    {
        callback(null);
        return;
    }

    // Get element containing the property name
    var rule = FW.FBL.getAncestorByClass(selectorNode, "cssRule");
    var propNameNodes = rule.getElementsByClassName("cssPropName");
    var propNameNode = null;
    for (var i = 0; i < propNameNodes.length; i++)
    {
        if (propNameNodes[i].textContent === propName)
        {
            propNameNode = propNameNodes[i];
            break;
        }
    }

    if (!this.ok(propNameNode, "Property '" + propName + "' must exist within '" + selector +
        "' rule"))
    {
        callback(null);
        return;
    }

    // Return element containing the property
    callback(FW.FBL.getAncestorByClass(propNameNode, "cssProp"));
};

// ********************************************************************************************* //
}).apply(FBTest);
