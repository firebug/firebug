/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/string"
],
function(FBTrace, Str) {

"use strict";

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;

var Xml = {};

// ********************************************************************************************* //
// HTML and XML Serialization

Xml.getElementType = function(node)
{
    if (isElementXUL(node))
        return 'xul';
    else if (isElementSVG(node))
        return 'svg';
    else if (isElementMathML(node))
        return 'mathml';
    else if (isElementXHTML(node))
        return 'xhtml';
    else if (isElementHTML(node))
        return 'html';
};

Xml.getElementSimpleType = function(node)
{
    if (isElementSVG(node))
        return 'svg';
    else if (isElementMathML(node))
        return 'mathml';
    else
        return 'html';
};

var isElementHTML = Xml.isElementHTML = function(node)
{
    return node.nodeName == node.nodeName.toUpperCase() && node.namespaceURI == 'http://www.w3.org/1999/xhtml';
};

var isElementXHTML = Xml.isElementXHTML = function(node)
{
    return node.nodeName != node.nodeName.toUpperCase() && node.namespaceURI == 'http://www.w3.org/1999/xhtml';
};

var isElementHTMLOrXHTML = Xml.isElementHTMLOrXHTML = function(node)
{
    return node.namespaceURI == "http://www.w3.org/1999/xhtml";
};

var isElementMathML = Xml.isElementMathML = function(node)
{
    return node.namespaceURI == 'http://www.w3.org/1998/Math/MathML';
};

var isElementSVG = Xml.isElementSVG = function(node)
{
    return node.namespaceURI == 'http://www.w3.org/2000/svg';
};

var isElementXUL = Xml.isElementXUL = function(node)
{
    return node instanceof XULElement;
};

var getNodeName = Xml.getNodeName = function(node)
{
    var name = node.nodeName;
    return isElementHTML(node) ? name.toLowerCase() : name;
};

Xml.getLocalName = function(node)
{
    var name = node.localName;
    return isElementHTML(node) ? name.toLowerCase() : name;
};

// End tags for void elements are forbidden http://wiki.whatwg.org/wiki/HTML_vs._XHTML
var selfClosingTags = Xml.selfClosingTags =
{
    "meta": 1,
    "link": 1,
    "area": 1,
    "base": 1,
    "col": 1,
    "input": 1,
    "img": 1,
    "br": 1,
    "hr": 1,
    "param": 1,
    "embed": 1
};

var isSelfClosing = Xml.isSelfClosing = function(element)
{
    if (isElementSVG(element) || isElementMathML(element))
        return true;
    var tag = element.localName.toLowerCase();
    return (selfClosingTags.hasOwnProperty(tag));
};

Xml.getElementHTML = function(element)
{
    function toHTML(elt, html)
    {
        if (elt.nodeType == Node.ELEMENT_NODE)
        {
            if (Firebug.shouldIgnore(elt))
                return;

            var nodeName = getNodeName(elt);
            html.push('<', nodeName);

            for (var i = 0; i < elt.attributes.length; ++i)
            {
                var attr = elt.attributes[i];

                // Hide attributes set by Firebug
                // XXX Do we even have any?
                if (Str.hasPrefix(attr.localName, "firebug-"))
                    continue;

                // MathML
                if (Str.hasPrefix(attr.localName, "-moz-math"))
                {
                    // just hide for now
                    continue;
                }

                html.push(' ', attr.name, '="', Str.escapeForElementAttribute(attr.value), '"');
            }

            if (elt.firstChild)
            {
                html.push('>');

                for (var child = elt.firstChild; child; child = child.nextSibling)
                    toHTML(child, html);

                html.push('</', nodeName, '>');
            }
            else if (isElementSVG(elt) || isElementMathML(elt))
            {
                html.push('/>');
            }
            else if (isSelfClosing(elt))
            {
                html.push((isElementXHTML(elt))?'/>':'>');
            }
            else
            {
                html.push('></', nodeName, '>');
            }
        }
        else if (elt.nodeType == Node.TEXT_NODE)
        {
            html.push(Str.escapeForTextNode(elt.textContent));
        }
        else if (elt.nodeType == Node.CDATA_SECTION_NODE)
        {
            html.push('<![CDATA[', elt.nodeValue, ']]>');
        }
        else if (elt.nodeType == Node.COMMENT_NODE)
        {
            html.push('<!--', elt.nodeValue, '-->');
        }
    }

    var html = [];
    toHTML(element, html);
    return html.join("");
};

Xml.getElementXML = function(element)
{
    function toXML(elt, xml)
    {
        if (elt.nodeType == Node.ELEMENT_NODE)
        {
            if (Firebug.shouldIgnore(elt))
                return;

            var nodeName = getNodeName(elt);
            xml.push('<', nodeName);

            for (var i = 0; i < elt.attributes.length; ++i)
            {
                var attr = elt.attributes[i];

                // Hide attributes set by Firebug
                if (Str.hasPrefix(attr.localName, "firebug-"))
                    continue;

                // MathML
                if (Str.hasPrefix(attr.localName, "-moz-math"))
                {
                    // just hide for now
                    continue;
                }

                xml.push(' ', attr.nodeName, '="', Str.escapeForElementAttribute(attr.value),'"');
            }

            if (elt.firstChild)
            {
                xml.push('>');

                for (var child = elt.firstChild; child; child = child.nextSibling)
                    toXML(child, xml);

                xml.push('</', nodeName, '>');
            }
            else
                xml.push('/>');
        }
        else if (elt.nodeType == Node.TEXT_NODE)
            xml.push(elt.nodeValue);
        else if (elt.nodeType == Node.CDATA_SECTION_NODE)
            xml.push('<![CDATA[', elt.nodeValue, ']]>');
        else if (elt.nodeType == Node.COMMENT_NODE)
            xml.push('<!--', elt.nodeValue, '-->');
    }

    var xml = [];
    toXML(element, xml);
    return xml.join("");
};

// ************************************************************************************************
// Whitespace and Entity conversions

var domUtils = Cc["@mozilla.org/inspector/dom-utils;1"].getService(Ci.inIDOMUtils);

/**
 * Returns true if given document is based on a XML and so displaying pretty printed XML elements.
 */
Xml.isXMLPrettyPrint = function(context, win)
{
    if (!context)
        return;

    if (context.isXMLPrettyPrintDetected)
        return context.isXMLPrettyPrint;

    try
    {
        var doc = win ? win.document : context.window.document;
        if (!doc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("lib.isXMLPrettyPrint; NO DOCUMENT", {win:win, context:context});
            return false;
        }
        if (!doc.documentElement)
            return false;

        var bindings = domUtils.getBindingURLs(doc.documentElement);
        for (var i = 0; i < bindings.length; i++)
        {
            var bindingURI = bindings.queryElementAt(i, Ci.nsIURI);
            if (FBTrace.DBG_CSS)
                FBTrace.sysout("bindingURL: " + i + " " + bindingURI.resolve(""));

            context.isXMLPrettyPrintDetected = true;
            return context.isXMLPrettyPrint = (bindingURI.resolve("") ===
                "chrome://global/content/xml/XMLPrettyPrint.xml");
        }
    }
    catch (e)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("xml.isXMLPrettyPrint; EXCEPTION "+e, e);
    }
};

// ************************************************************************************************

Xml.isVisible = function(elt)
{
    if (isElementXUL(elt))
    {
        //FBTrace.sysout("isVisible elt.offsetWidth: "+elt.offsetWidth+" offsetHeight:"+
        // elt.offsetHeight+" localName:"+ elt.localName+" nameSpace:"+elt.nameSpaceURI+"\n");
        return (!elt.hidden && !elt.collapsed);
    }

    try
    {
        return !isElementHTMLOrXHTML(elt) ||
            elt.offsetWidth > 0 ||
            elt.offsetHeight > 0 ||
            elt.localName in invisibleTags;
    }
    catch (err)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.isVisible; EXCEPTION " + err, err);
    }

    return false;
};

var invisibleTags = Xml.invisibleTags =
{
    "HTML": 1,
    "HEAD": 1,
    "TITLE": 1,
    "META": 1,
    "LINK": 1,
    "STYLE": 1,
    "SCRIPT": 1,
    "NOSCRIPT": 1,
    "BR": 1,
    "PARAM": 1,
    "COL": 1,

    "html": 1,
    "head": 1,
    "title": 1,
    "meta": 1,
    "link": 1,
    "style": 1,
    "script": 1,
    "noscript": 1,
    "br": 1,
    "param": 1,
    "col": 1,
    /*
    "window": 1,
    "browser": 1,
    "frame": 1,
    "tabbrowser": 1,
    "WINDOW": 1,
    "BROWSER": 1,
    "FRAME": 1,
    "TABBROWSER": 1,
    */
};

// ********************************************************************************************* //
// Registration

return Xml;

// ********************************************************************************************* //
});
