/* See license.txt for terms of usage */

/**
 * This file defines Computed panel APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Computed panel API

this.getComputedProperty = function(name)
{
    var panel = FBTest.selectPanel("computed");
    var stylePropNames = panel.panelNode.getElementsByClassName("stylePropName");

    for (var i = 0; i < stylePropNames.length; i++)
    {
        if (stylePropNames[i].textContent === name)
            return FW.FBL.getAncestorByClass(stylePropNames[i], "computedStyle");
    }

    return null;
};

// ********************************************************************************************* //
}).apply(FBTest);
