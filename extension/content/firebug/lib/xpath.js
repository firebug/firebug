/* See license.txt for terms of usage */

define([
    "firebug/lib/string"
],
function(Str) {

// ********************************************************************************************* //
// Constants

var Xpath = {};

// ********************************************************************************************* //
// XPATH

/**
 * Gets an XPath for an element which describes its hierarchical location.
 */
Xpath.getElementXPath = function(element)
{
    if (element && element.id)
        return '//*[@id="' + element.id + '"]';
    else
        return Xpath.getElementTreeXPath(element);
};

Xpath.getElementTreeXPath = function(element)
{
    var paths = [];

    // Use nodeName (instead of localName) so namespace prefix is included (if any).
    for (; element && element.nodeType == Node.ELEMENT_NODE; element = element.parentNode)
    {
        var index = 0;
        for (var sibling = element.previousSibling; sibling; sibling = sibling.previousSibling)
        {
            // Ignore document type declaration.
            if (sibling.nodeType == Node.DOCUMENT_TYPE_NODE)
                continue;

            if (sibling.nodeName == element.nodeName)
                ++index;
        }

        var tagName = (element.prefix ? element.prefix + ":" : "") + element.localName;
        var pathIndex = (index ? "[" + (index+1) + "]" : "");
        paths.splice(0, 0, tagName + pathIndex);
    }

    return paths.length ? "/" + paths.join("/") : null;
};

Xpath.cssToXPath = function(rule)
{
    var regElement = /^([#.]?)([a-z0-9\\*_-]*)((\|)([a-z0-9\\*_-]*))?/i;
    var regAttr1 = /^\[([^\]]*)\]/i;
    var regAttr2 = /^\[\s*([^~=\s]+)\s*(~?=)\s*"([^"]+)"\s*\]/i;
    var regPseudo = /^:([a-z_-])+/i;
    var regCombinator = /^(\s*[>+\s])?/i;
    var regComma = /^\s*,/i;

    var index = 1;
    var parts = ["//", "*"];
    var lastRule = null;

    while (rule.length && rule != lastRule)
    {
        lastRule = rule;

        // Trim leading whitespace
        rule = Str.trim(rule);
        if (!rule.length)
            break;

        // Match the element identifier
        var m = regElement.exec(rule);
        if (m)
        {
            if (!m[1])
            {
                // XXXjoe Namespace ignored for now
                if (m[5])
                    parts[index] = m[5];
                else
                    parts[index] = m[2];
            }
            else if (m[1] == '#')
                parts.push("[@id='" + m[2] + "']");
            else if (m[1] == '.')
                parts.push("[contains(concat(' ',normalize-space(@class),' '), ' " + m[2] + " ')]");

            rule = rule.substr(m[0].length);
        }

        // Match attribute selectors
        m = regAttr2.exec(rule);
        if (m)
        {
            if (m[2] == "~=")
                parts.push("[contains(@" + m[1] + ", '" + m[3] + "')]");
            else
                parts.push("[@" + m[1] + "='" + m[3] + "']");

            rule = rule.substr(m[0].length);
        }
        else
        {
            m = regAttr1.exec(rule);
            if (m)
            {
                parts.push("[@" + m[1] + "]");
                rule = rule.substr(m[0].length);
            }
        }

        // Skip over pseudo-classes and pseudo-elements, which are of no use to us
        m = regPseudo.exec(rule);
        while (m)
        {
            rule = rule.substr(m[0].length);
            m = regPseudo.exec(rule);
        }

        // Match combinators
        m = regCombinator.exec(rule);
        if (m && m[0].length)
        {
            if (m[0].indexOf(">") != -1)
                parts.push("/");
            else if (m[0].indexOf("+") != -1)
                parts.push("/following-sibling::");
            else
                parts.push("//");

            index = parts.length;
            parts.push("*");
            rule = rule.substr(m[0].length);
        }

        m = regComma.exec(rule);
        if (m)
        {
            parts.push(" | ", "//", "*");
            index = parts.length-1;
            rule = rule.substr(m[0].length);
        }
    }

    var xpath = parts.join("");
    return xpath;
};

Xpath.getElementsBySelector = function(doc, css)
{
    var xpath = Xpath.cssToXPath(css);
    return Xpath.getElementsByXPath(doc, xpath);
};

Xpath.getElementsByXPath = function(doc, xpath)
{
    var result = Xpath.evaluateXPath(doc, xpath);

    if (result instanceof Array)
        return result;

    return [];
};

/**
 * Evaluates an XPath expression.
 *
 * @param Document doc
 * @param String xpath The XPath expression.
 * @param Node contextNode The context node.
 * @param int resultType
 * @param [bool] throwException If set to true, an invalid XPath expression throws an error.
 *
 * @return * the result of the XPath expression
 */
Xpath.evaluateXPath = function(doc, xpath, contextNode, resultType, throwException)
{
    if (contextNode === undefined)
        contextNode = doc;

    if (resultType === undefined)
        resultType = XPathResult.ANY_TYPE;

    try
    {
        var result = doc.evaluate(xpath, contextNode, null, resultType, null);
    }
    catch (exc)
    {
        if (throwException)
            throw exc;
        // If an invalid XPath expression was entered, it should be caught without exception.
        return;
    }

    switch (result.resultType)
    {
        case XPathResult.NUMBER_TYPE:
            return result.numberValue;

        case XPathResult.STRING_TYPE:
            return result.stringValue;

        case XPathResult.BOOLEAN_TYPE:
            return result.booleanValue;

        case XPathResult.UNORDERED_NODE_ITERATOR_TYPE:
        case XPathResult.ORDERED_NODE_ITERATOR_TYPE:
            var nodes = [];
            for (var item = result.iterateNext(); item; item = result.iterateNext())
                nodes.push(item);
            return nodes;

        case XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE:
        case XPathResult.ORDERED_NODE_SNAPSHOT_TYPE:
            var nodes = [];
            for (var i = 0; i < result.snapshotLength; ++i)
                nodes.push(result.snapshotItem(i));
            return nodes;

        case XPathResult.ANY_UNORDERED_NODE_TYPE:
        case XPathResult.FIRST_ORDERED_NODE_TYPE:
            return result.singleNodeValue;
    }
};

Xpath.getRuleMatchingElements = function(rule, doc)
{
    var css = rule.selectorText;
    var xpath = Xpath.cssToXPath(css);
    return Xpath.getElementsByXPath(doc, xpath);
};

// ********************************************************************************************* //

return Xpath;

// ********************************************************************************************* //
});
