/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/lib/css",
    "fbtrace/lib/array",
],
function(FBTrace, Css, Arr) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;

var Dom = {};
var domMemberCache = null;
var domMemberMap = {};
var domMappedData = new WeakMap();

Dom.domUtils = Cc["@mozilla.org/inspector/dom-utils;1"].getService(Ci.inIDOMUtils);

// ********************************************************************************************* //
// DOM APIs

Dom.getChildByClass = function(node) // ,classname, classname, classname...
{
    if (!node)
    {
        FBTrace.sysout("dom.getChildByClass; ERROR, no parent node!");
        return null;
    }

    for (var i = 1; i < arguments.length; ++i)
    {
        var className = arguments[i];
        var child = node.firstChild;
        node = null;
        for (; child; child = child.nextSibling)
        {
            if (Css.hasClass(child, className))
            {
                node = child;
                break;
            }
        }
    }

    return node;
};

Dom.getAncestorByClass = function(node, className)
{
    for (var parent = node; parent; parent = parent.parentNode)
    {
        if (Css.hasClass(parent, className))
            return parent;
    }

    return null;
};

Dom.getAncestorByTagName = function(node, tagName)
{
    for (var parent = node; parent; parent = parent.parentNode)
    {
        if (parent.localName && parent.tagName.toLowerCase() == tagName)
            return parent;
    }

    return null;
};

/* @Deprecated  Use native Firefox: node.getElementsByClassName(names).item(0) */
Dom.getElementByClass = function(node, className)  // className, className, ...
{
    return Dom.getElementsByClass.apply(this,arguments).item(0);
};

/* @Deprecated  Use native Firefox: node.getElementsByClassName(names) */
Dom.getElementsByClass = function(node, className)  // className, className, ...
{
    var args = Arr.cloneArray(arguments); args.splice(0, 1);
    return node.getElementsByClassName(args.join(" "));
};

Dom.getElementsByAttribute = function(node, attrName, attrValue)
{
    function iteratorHelper(node, attrName, attrValue, result)
    {
        // xxxFlorent: sadly, Documents and DocumentFragments do not have firstElementChild
        // properties currently.
        for (var child = node.firstChild; child; child = child.nextSibling)
        {
            if (child.nodeType !== document.ELEMENT_NODE)
                continue;

            if (child.getAttribute(attrName) == attrValue)
                result.push(child);

            iteratorHelper(child, attrName, attrValue, result);
        }
    }

    var result = [];
    iteratorHelper(node, attrName, attrValue, result);
    return result;
};

// ********************************************************************************************* //

Dom.collapse = function(elt, collapsed)
{
    if (!elt)
    {
        FBTrace.sysout("Dom.collapse; ERROR null element.");
        return;
    }

    elt.setAttribute("collapsed", collapsed ? "true" : "false");
};

Dom.isCollapsed = function(elt)
{
    return (elt.getAttribute("collapsed") == "true") ? true : false;
};

Dom.clearNode = function(node)
{
    node.textContent = "";
};

Dom.eraseNode = function(node)
{
    while (node.lastChild)
        node.removeChild(node.lastChild);
};

// ********************************************************************************************* //

/**
 * Checks whether an element is scrolled to the bottom
 * @param {Object} element Element to check
 * @returns {Boolean} True, if element is scrolled to the bottom, otherwise false
 */
Dom.isScrolledToBottom = function(element)
{
    var onBottom = (element.scrollTop + element.offsetHeight) == element.scrollHeight;

    if (FBTrace.DBG_CONSOLE)
    {
        FBTrace.sysout("Dom.isScrolledToBottom offsetHeight: " + element.offsetHeight +
            ", scrollTop: " + element.scrollTop + ", scrollHeight: " + element.scrollHeight +
            ", onBottom: " + onBottom);
    }

    return onBottom;
};

/**
 * Scrolls a scrollable element to the bottom
 * @param {Object} element Element to scroll
 * @returns {Boolean} True, if the element could be scrolled to the bottom, otherwise false
 */
Dom.scrollToBottom = function(element)
{
    element.scrollTop = element.scrollHeight;

    if (FBTrace.DBG_CONSOLE)
    {
        FBTrace.sysout("scrollToBottom reset scrollTop " + element.scrollTop + " = " +
            element.scrollHeight);

        if (element.scrollHeight == element.offsetHeight)
        {
            FBTrace.sysout("scrollToBottom attempt to scroll non-scrollable element " +
                element, element);
        }
    }

    return (element.scrollTop == element.scrollHeight);
};

// ********************************************************************************************* //
// Registration

return Dom;

// ********************************************************************************************* //
});
