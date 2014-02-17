/* See license.txt for terms of usage */

/**
 * This file defines CSS Panel APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// CSS Panel API

this.getAtRulesByType = function(type)
{
    var panel = FBTest.selectPanel("stylesheet");
    var ruleTypes = panel.panelNode.getElementsByClassName("cssRuleName");

    var rules = [];
    for (var i=0, len = ruleTypes.length; i<len; ++i)
    {
        if (ruleTypes[i].textContent == type)
            rules.push(FW.FBL.getAncestorByClass(ruleTypes[i], "cssRule"));
    }

    return rules;
};

this.getStyleRulesBySelector = function(selector)
{
    var panel = FBTest.selectPanel("stylesheet");
    var selectors = panel.panelNode.getElementsByClassName("cssSelector");

    var rules = [];
    for (var i = 0, len = selectors.length; i < len; ++i)
    {
        if (selectors[i].textContent.indexOf(selector) != -1)
            rules.push(FW.FBL.getAncestorByClass(selectors[i], "cssRule"));
    }

    return rules;
};

// ********************************************************************************************* //
}).apply(FBTest);
