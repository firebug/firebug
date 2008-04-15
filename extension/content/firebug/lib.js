/* See license.txt for terms of usage */

var FBL = XPCOMUtils;

try { /*@explore*/

(function() {

// ************************************************************************************************
// Constants

this.fbs = this.CCSV("@joehewitt.com/firebug;1", "nsIFireBug").wrappedJSObject;
this.jsd = this.CCSV("@mozilla.org/js/jsd/debugger-service;1", "jsdIDebuggerService");

const Cc = Components.classes;
const Ci = Components.interfaces;
const finder = this.finder = this.CCIN("@mozilla.org/embedcomp/rangefind;1", "nsIFind");

const PCMAP_SOURCETEXT = Ci.jsdIScript.PCMAP_SOURCETEXT;
const PCMAP_PRETTYPRINT = Ci.jsdIScript.PCMAP_PRETTYPRINT;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const reNotWhitespace = /[^\s]/;
const reSplitFile = /:\/{1,3}(.*?)\/([^\/]*?)\/?($|\?.*)/;
const reURL = /(([^:]+:)\/{1,2}[^\/]*)(.*?)$/;  // This RE and the previous one should changed to be consistent
// Globals
this.reDataURL = /data:text\/javascript;fileName=([^;]*);baseLineNumber=(\d*?),((?:.*?%0A)|(?:.*))/g;
this.reJavascript = /\s*javascript:\s*(.*)/;
this.reChrome = /chrome:\/\/([^\/]*)\//;
this.reCSS = /\.css$/;

const reSplitLines = /\r\n|\r|\n/;
const reFunctionArgNames = /function ([^(]*)\(([^)]*)\)/;
const reGuessFunction = /['"]?([0-9A-Za-z_]+)['"]?\s*[:=]\s*(function|eval|new Function)/;
const reWord = /([A-Za-z_][A-Za-z_0-9]*)(\.([A-Za-z_][A-Za-z_0-9]*))*/;

const restoreRetryTimeout = 500;

const NS_SEEK_SET = Ci.nsISeekableStream.NS_SEEK_SET;

// ************************************************************************************************
// Namespaces

var namespaces = [];

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

this.ns = function(fn)
{
    var ns = {};
    namespaces.push(fn, ns);
    return ns;
};

this.initialize = function()
{
    if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("FBL.initialize BEGIN "+namespaces.length+" namespaces\n");             /*@explore*/
                                                                                                                       /*@explore*/
    for (var i = 0; i < namespaces.length; i += 2)
    {
        var fn = namespaces[i];
        var ns = namespaces[i+1];
        fn.apply(ns);
    }
                                                                                                                       /*@explore*/
    if (FBTrace.DBG_INITIALIZE) FBTrace.sysout("FBL.initialize END "+namespaces.length+" namespaces\n");               /*@explore*/
};

// ************************************************************************************************
// Basics

this.bind = function()
{
   var args = cloneArray(arguments), fn = args.shift(), object = args.shift();
   return function() { return fn.apply(object, arrayInsert(cloneArray(args), 0, arguments)); }
};

this.bindFixed = function()
{
    var args = cloneArray(arguments), fn = args.shift(), object = args.shift();
    return function() { return fn.apply(object, args); }
};

this.extend = function(l, r)
{
    var newOb = {};
    for (var n in l)
        newOb[n] = l[n];
    for (var n in r)
        newOb[n] = r[n];
    return newOb;
};

this.keys = function(map)  // At least sometimes the keys will be on user-level window objects
{
    var keys = [];
    try
    {
        for (var name in map)  // enumeration is safe
            keys.push(name);   // name is string, safe
    }
    catch (exc)
    {
        // Sometimes we get exceptions trying to iterate properties
    }

    return keys;  // return is safe
};

this.values = function(map)
{
    var values = [];
    try
    {
        for (var name in map)
        {
            try
            {
                values.push(map[name]);
            }
            catch (exc)
            {
                // Sometimes we get exceptions trying to access properties
                if (FBTrace.DBG_ERRORS) /*@explore*/
                    FBTrace.dumpPropreties("lib.values FAILED ", exc); /*@explore*/
            }

        }
    }
    catch (exc)
    {
        // Sometimes we get exceptions trying to iterate properties
        if (FBTrace.DBG_ERRORS) /*@explore*/
            FBTrace.dumpPropreties("lib.values FAILED ", exc); /*@explore*/
    }

    return values;
};

this.remove = function(list, item)
{
    for (var i = 0; i < list.length; ++i)
    {
        if (list[i] == item)
        {
            list.splice(i, 1);
            break;
        }
    }
};

this.sliceArray = function(array, index)
{
    var slice = [];
    for (var i = index; i < array.length; ++i)
        slice.push(array[i]);

    return slice;
};

function cloneArray(array, fn)
{
   var newArray = [];

   if (fn)
       for (var i = 0; i < array.length; ++i)
           newArray.push(fn(array[i]));
   else
       for (var i = 0; i < array.length; ++i)
           newArray.push(array[i]);

   return newArray;
}

function extendArray(array, array2)
{
   var newArray = [];
   newArray.push.apply(newArray, array);
   newArray.push.apply(newArray, array2);
   return newArray;
}

this.extendArray = extendArray;
this.cloneArray = cloneArray;

function arrayInsert(array, index, other)
{
   for (var i = 0; i < other.length; ++i)
       array.splice(i+index, 0, other[i]);

   return array;
}

this.arrayInsert = arrayInsert;

this.safeToString = function(ob)
{
    try
    {
        return ob.toString();
    }
    catch (exc)
    {
        return "";
    }
};

this.convertToUnicode = function(text, charset)
{
    if (!text)
        return "";

    try
    {
        var conv = this.CCSV("@mozilla.org/intl/scriptableunicodeconverter", "nsIScriptableUnicodeConverter");
        conv.charset = charset ? charset : "UTF-8";
        return conv.ConvertToUnicode(text);
    }
    catch (exc)
    {
        this.ERROR("lib.convertToUnicode: fails"+exc);
        return text;
    }
};

this.getPlatformName = function()
{
    return this.CCSV("@mozilla.org/xre/app-info;1", "nsIXULRuntime").OS;
};

this.beep = function()
{
    var sounder = this.CCSV("@mozilla.org/sound;1", "nsISound");
    sounder.beep();
};

this.getUniqueId = function() {
    return this.getRandomInt(0,65536);
}

this.getRandomInt = function(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

this.createStyleSheet = function(doc, url)
{
    var link = doc.createElementNS("http://www.w3.org/1999/xhtml", "link");
    link.setAttribute("charset","utf-8");
    link.firebugIgnore = true;
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("type", "text/css");
    link.setAttribute("href", url);
    return link;
}

this.addStyleSheet = function(doc, link)
{
    var heads = doc.getElementsByTagName("head");
    if (heads.length)
        heads[0].appendChild(link);
    else
        doc.documentElement.appendChild(link);
};

this.addScript = function(doc, id, src)
{
    var element = doc.createElementNS("http://www.w3.org/1999/xhtml", "script");
    element.setAttribute("type", "text/javascript");
    element.setAttribute("id", id);
    element.firebugIgnore = true;
    element.setAttribute("style", "display:none");
    element.innerHTML = src;
    doc.documentElement.appendChild(element);
}

// ************************************************************************************************
// Localization

function $STR(name)
{
    return document.getElementById("strings_firebug").getString(name);
}

function $STRF(name, args)
{
    return document.getElementById("strings_firebug").getFormattedString(name, args);
}

this.$STR = $STR;
this.$STRF = $STRF;

// ************************************************************************************************
// Visibility

this.isVisible = function(elt)
{
    if (elt instanceof XULElement)
    {
        //FBTrace.sysout("isVisible elt.offsetWidth: "+elt.offsetWidth+" offsetHeight:"+ elt.offsetHeight+" localName:"+ elt.localName+" nameSpace:"+elt.nameSpaceURI+"\n");
        return (!elt.hidden && !elt.collapsed);
    }
    return elt.offsetWidth > 0 || elt.offsetHeight > 0 || elt.localName in invisibleTags
        || elt.namespaceURI == "http://www.w3.org/2000/svg";
};

this.collapse = function(elt, collapsed)
{
    elt.setAttribute("collapsed", collapsed);
};

this.obscure = function(elt, obscured)
{
    if (obscured)
        this.setClass(elt, "obscured");
    else
        this.removeClass(elt, "obscured");
};

this.hide = function(elt, hidden)
{
    elt.style.visibility = hidden ? "hidden" : "visible";
};

this.clearNode = function(node)
{
    node.innerHTML = "";
};

this.eraseNode = function(node)
{
    while (node.lastChild)
        node.removeChild(node.lastChild);
};

// ************************************************************************************************
// Window iteration

this.iterateWindows = function(win, handler)
{
    if (!win || !win.document)
        return;

    handler(win);

    if (win == top) return; // XXXjjb hack for chromeBug

    for (var i = 0; i < win.frames.length; ++i)
    {
        var subWin = win.frames[i];
        if (subWin != win)
            this.iterateWindows(subWin, handler);
    }
};

this.getRootWindow = function(win)
{
    for (; win; win = win.parent)
    {
        if (!win.parent || win == win.parent || !(win.parent instanceof Window) )
            return win;
    }
    return null;
};

// ************************************************************************************************
// CSS classes

this.hasClass = function(node, name)
{
    if (!node || node.nodeType != 1)
        return false;
    else
    {
        var re = new RegExp("(^|\\s)"+name+"($|\\s)");
        return re.exec(node.getAttribute("class")) != null;
    }
};

this.setClass = function(node, name)
{
    if (node && !this.hasClass(node, name))
        node.className += " " + name;
};

this.getClassValue = function(node, name)
{
    var re = new RegExp(name+"-([^ ]+)");
    var m = re.exec(node.className);
    return m ? m[1] : "";
};

this.removeClass = function(node, name)
{
    if (node && node.className)
    {
        var index = node.className.indexOf(name);
        if (index >= 0)
        {
            var size = name.length;
            node.className = node.className.substr(0,index-1) + node.className.substr(index+size);
        }
    }
};

this.toggleClass = function(elt, name)
{
    if (this.hasClass(elt, name))
        this.removeClass(elt, name);
    else
        this.setClass(elt, name);
};

this.setClassTimed = function(elt, name, context, timeout)
{
    if (!timeout)
        timeout = 1300;

    if (elt.__setClassTimeout)
        context.clearTimeout(elt.__setClassTimeout);
    else
        this.setClass(elt, name);

    elt.__setClassTimeout = context.setTimeout(function()
    {
        delete elt.__setClassTimeout;

        FBL.removeClass(elt, name);
    }, timeout);
};

this.cancelClassTimed = function(elt, name, context)
{
    if (elt.__setClassTimeout)
    {
        FBL.removeClass(elt, name);
        context.clearTimeout(elt.__setClassTimeout);
        delete elt.__setClassTimeout;
    }
};

// ************************************************************************************************
// DOM queries

this.$ = function(id, doc)
{
    if (doc)
        return doc.getElementById(id);
    else
        return document.getElementById(id);
};

this.getChildByClass = function(node)
{
    for (var i = 1; i < arguments.length; ++i)
    {
        var className = arguments[i];
        var child = node.firstChild;
        node = null;
        for (; child; child = child.nextSibling)
        {
            if (this.hasClass(child, className))
            {
                node = child;
                break;
            }
        }
    }

    return node;
};

this.getAncestorByClass = function(node, className)
{
    for (var parent = node; parent; parent = parent.parentNode)
    {
        if (this.hasClass(parent, className))
            return parent;
    }

    return null;
};

this.getElementByClass = function(node, className)
{
    for (var child = node.firstChild; child; child = child.nextSibling)
    {
        if (this.hasClass(child, className))
            return child;
        else
        {
            var found = this.getElementByClass(child, className);
            if (found)
                return found;
        }
    }

    return null;
};

this.isAncestor = function(node, potentialAncestor)
{
    for (var parent = node; parent; parent = parent.parentNode)
    {
        if (parent == potentialAncestor)
            return true;
    }

    return false;
};

this.getNextElement = function(node)
{
    while (node && node.nodeType != 1)
        node = node.nextSibling;

    return node;
};

this.getPreviousElement = function(node)
{
    while (node && node.nodeType != 1)
        node = node.previousSibling;

    return node;
};

this.getBody = function(doc)
{
    if (doc.body)
        return doc.body;

    var body = doc.getElementsByTagName("body")[0];
    if (body)
        return body;

    return doc.firstChild;  // For non-HTML docs
};

this.findNextDown = function(node, criteria)
{
    if (!node)
        return null;

    for (var child = node.firstChild; child; child = child.nextSibling)
    {
        if (criteria(child))
            return child;

        var next = this.findNextDown(child, criteria);
        if (next)
            return next;
    }
};

this.findPreviousUp = function(node, criteria)
{
    if (!node)
        return null;

    for (var child = node.lastChild; child; child = child.previousSibling)
    {
        var next = this.findPreviousUp(child, criteria);
        if (next)
            return next;

        if (criteria(child))
            return child;
    }
};

this.findNext = function(node, criteria, upOnly, maxRoot)
{
    if (!node)
        return null;

    if (!upOnly)
    {
        var next = this.findNextDown(node, criteria);
        if (next)
            return next;
    }

    for (var sib = node.nextSibling; sib; sib = sib.nextSibling)
    {
        if (criteria(sib))
            return sib;

        var next = this.findNextDown(sib, criteria);
        if (next)
            return next;
    }

    if (node.parentNode && node.parentNode != maxRoot)
        return this.findNext(node.parentNode, criteria, true);
};

this.findPrevious = function(node, criteria, downOnly, maxRoot)
{
    if (!node)
        return null;

    for (var sib = node.previousSibling; sib; sib = sib.previousSibling)
    {
        var prev = this.findPreviousUp(sib, criteria);
        if (prev)
            return prev;

        if (criteria(sib))
            return sib;
    }

    if (!downOnly)
    {
        var next = this.findPreviousUp(node, criteria);
        if (next)
            return next;
    }

    if (node.parentNode && node.parentNode != maxRoot)
    {
        if (criteria(node.parentNode))
            return node.parentNode;

        return this.findPrevious(node.parentNode, criteria, true);
    }
};

this.getNextByClass = function(root, state)
{
    function iter(node) { return node.nodeType == 1 && FBL.hasClass(node, state); }
    return this.findNext(root, iter);
};

this.getPreviousByClass = function(root, state)
{
    function iter(node) { return node.nodeType == 1 && FBL.hasClass(node, state); }
    return this.findPrevious(root, iter);
};

this.hasChildElements = function(node)
{
    if (node.contentDocument) // iframes
        return true;

    for (var child = node.firstChild; child; child = child.nextSibling)
    {
        if (child.nodeType == 1)
            return true;
    }

    return false;
};

this.isElement = function(o)
{
    try {
        return o && o instanceof Element;
    }
    catch (ex) {
        return false;
    }
};

this.isNode = function(o)
{
    try {
        return o && o instanceof Node;
    }
    catch (ex) {
        return false;
    }
};

// ************************************************************************************************
// DOM Modification

this.setOuterHTML = function(element, html)
{
    var doc = element.ownerDocument;
    var range = doc.createRange();
    range.selectNode(doc.documentElement);

    var fragment = range.createContextualFragment(html);
    var first = fragment.firstChild;
    var last = fragment.lastChild;
    element.parentNode.replaceChild(fragment, element);
    return [first, last];
};

this.appendInnerHTML = function(element, html)
{
    var doc = element.ownerDocument;
    var range = doc.createRange();
    range.selectNode(doc.body);

    var fragment = range.createContextualFragment(html);
    element.appendChild(fragment);
};

this.insertTextIntoElement = function(element, text)
{
    var command = "cmd_insertText";

    var controller = element.controllers.getControllerForCommand(command);
    if (!controller || !controller.isCommandEnabled(command))
        return;

    var params = this.CCIN("@mozilla.org/embedcomp/command-params;1", "nsICommandParams");
    params.setStringValue("state_data", text);

    controller = this.QI(controller, Ci.nsICommandController);
    controller.doCommandWithParams(command, params);
};

// ************************************************************************************************
// XPath

/**
 * Gets an XPath for an element which describes its hierarchical location.
 */
this.getElementXPath = function(element)
{
    if (element && element.id)
        return '//*[@id="' + element.id + '"]';
    else
        return this.getElementTreeXPath(element);
};

this.getElementTreeXPath = function(element)
{
    var paths = [];

    for (; element && element.nodeType == 1; element = element.parentNode)
    {
        var index = 0;
        for (var sibling = element.previousSibling; sibling; sibling = sibling.previousSibling)
        {
            if (sibling.localName == element.localName)
                ++index;
        }

        var tagName = element.localName.toLowerCase();
        var pathIndex = (index ? "[" + (index+1) + "]" : "");
        paths.splice(0, 0, tagName + pathIndex);
    }

    return paths.length ? "/" + paths.join("/") : null;
};

this.cssToXPath = function(rule)
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
        rule = rule.replace(/^\s*|\s*$/g,"");
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
                parts.push("[contains(@class, '" + m[2] + "')]");

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

this.getElementsBySelector = function(doc, css)
{
    var xpath = this.cssToXPath(css);
    return this.getElementsByXPath(doc, xpath);
};

this.getElementsByXPath = function(doc, xpath)
{
    var nodes = [];

    try {
        var result = doc.evaluate(xpath, doc, null, XPathResult.ANY_TYPE, null);
        for (var item = result.iterateNext(); item; item = result.iterateNext())
            nodes.push(item);
    }
    catch (exc)
    {
        // Invalid xpath expressions make their way here sometimes.  If that happens,
        // we still want to return an empty set without an exception.
    }

    return nodes;
};

this.getRuleMatchingElements = function(rule, doc)
{
    var css = rule.selectorText;
    var xpath = this.cssToXPath(css);
    return this.getElementsByXPath(doc, xpath);
};

// ************************************************************************************************
// Clipboard

this.copyToClipboard = function(string)
{
    var clipboard = this.CCSV("@mozilla.org/widget/clipboardhelper;1", "nsIClipboardHelper");
    clipboard.copyString(string);
};

// ************************************************************************************************
// Graphics

this.getClientOffset = function(elt)
{
    function addOffset(elt, coords, view)
    {
        var p = elt.offsetParent;

        var style = view.getComputedStyle(elt, "");

        if (elt.offsetLeft)
            coords.x += elt.offsetLeft + parseInt(style.borderLeftWidth);
        if (elt.offsetTop)
            coords.y += elt.offsetTop + parseInt(style.borderTopWidth);

        if (p)
        {
            if (p.nodeType == 1)
                addOffset(p, coords, view);
        }
        else if (elt.ownerDocument.defaultView.frameElement)
            addOffset(elt.ownerDocument.defaultView.frameElement, coords, elt.ownerDocument.defaultView);
    }

    var coords = {x: 0, y: 0};
    if (elt)
    {
        var view = elt.ownerDocument.defaultView;
        addOffset(elt, coords, view);
    }

    return coords;
};

this.getViewOffset = function(elt, singleFrame)
{
    function addOffset(elt, coords, view)
    {
        var p = elt.offsetParent;
        coords.x += elt.offsetLeft - (p ? p.scrollLeft : 0);
        coords.y += elt.offsetTop - (p ? p.scrollTop : 0);

        if (p)
        {
            if (p.nodeType == 1)
            {
                var parentStyle = view.getComputedStyle(p, "");
                if (parentStyle.position != "static")
                {
                    coords.x += parseInt(parentStyle.borderLeftWidth);
                    coords.y += parseInt(parentStyle.borderTopWidth);

                    if (p.localName == "TABLE")
                    {
                        coords.x += parseInt(parentStyle.paddingLeft);
                        coords.y += parseInt(parentStyle.paddingTop);
                    }
                    else if (p.localName == "BODY")
                    {
                        var style = view.getComputedStyle(elt, "");
                        coords.x += parseInt(style.marginLeft);
                        coords.y += parseInt(style.marginTop);
                    }
                }
                else if (p.localName == "BODY")
                {
                    coords.x += parseInt(parentStyle.borderLeftWidth);
                    coords.y += parseInt(parentStyle.borderTopWidth);
                }

                var parent = elt.parentNode;
                while (p != parent)
                {
                    coords.x -= parent.scrollLeft;
                    coords.y -= parent.scrollTop;
                    parent = parent.parentNode;
                }
                addOffset(p, coords, view);
            }
        }
        else
        {
            if (elt.localName == "BODY")
            {
                var style = view.getComputedStyle(elt, "");
                coords.x += parseInt(style.borderLeftWidth);
                coords.y += parseInt(style.borderTopWidth);

                var htmlStyle = view.getComputedStyle(elt.parentNode, "");
                coords.x -= parseInt(htmlStyle.paddingLeft);
                coords.y -= parseInt(htmlStyle.paddingTop);
            }

            if (elt.scrollLeft)
                coords.x += elt.scrollLeft;
            if (elt.scrollTop)
                coords.y += elt.scrollTop;

            var win = elt.ownerDocument.defaultView;
            if (win && (!singleFrame && win.frameElement))
                addOffset(win.frameElement, coords, win);
        }

    }

    var coords = {x: 0, y: 0};
    if (elt)
        addOffset(elt, coords, elt.ownerDocument.defaultView);

    return coords;
};

this.getOffsetSize = function(elt)
{
    return {width: elt.offsetWidth, height: elt.offsetHeight};
};

this.getOverflowParent = function(element)
{
    for (var scrollParent = element.parentNode; scrollParent; scrollParent = scrollParent.offsetParent)
    {
        if (scrollParent.scrollHeight > scrollParent.offsetHeight)
            return scrollParent;
    }
};

this.isScrolledToBottom = function(element)
{
    return element.scrollTop + element.offsetHeight == element.scrollHeight;
};

this.scrollToBottom = function(element)
{
    element.scrollTop = element.scrollHeight - element.offsetHeight;
};

this.move = function(element, x, y)
{
    element.style.left = x + "px";
    element.style.top = y + "px";
};

this.resize = function(element, w, h)
{
    element.style.width = w + "px";
    element.style.height = h + "px";
};

this.scrollIntoCenterView = function(element, scrollBox, notX, notY)
{
    if (!element)
        return;

    if (!scrollBox)
        scrollBox = this.getOverflowParent(element);

    if (!scrollBox)
        return;

    var offset = this.getClientOffset(element);

    if (!notY)
    {
        var topSpace = offset.y - scrollBox.scrollTop;
        var bottomSpace = (scrollBox.scrollTop + scrollBox.clientHeight)
            - (offset.y + element.offsetHeight);

        if (topSpace < 0 || bottomSpace < 0)
        {
            var centerY = offset.y - (scrollBox.clientHeight/2);
            scrollBox.scrollTop = centerY;
        }
    }

    if (!notX)
    {
        var leftSpace = offset.x - scrollBox.scrollLeft;
        var rightSpace = (scrollBox.scrollLeft + scrollBox.clientWidth)
            - (offset.x + element.clientWidth);

        if (leftSpace < 0 || rightSpace < 0)
        {
            var centerX = offset.x - (scrollBox.clientWidth/2);
            scrollBox.scrollLeft = centerX;
        }
    }
    if (FBTrace.DBG_SOURCEFILES) /*@explore*/
        FBTrace.sysout("lib.scrollIntoCenterView ","Element:"+element.innerHTML); /*@explore*/
};

// ************************************************************************************************
// CSS

var cssKeywordMap = null;
var cssPropNames = null;
var cssColorNames = null;

this.getCSSKeywordsByProperty = function(propName)
{
    if (!cssKeywordMap)
    {
        cssKeywordMap = {};

        for (var name in this.cssInfo)
        {
            var list = [];

            var types = this.cssInfo[name];
            for (var i = 0; i < types.length; ++i)
            {
                var keywords = this.cssKeywords[types[i]];
                if (keywords)
                    list.push.apply(list, keywords);
            }

            cssKeywordMap[name] = list;
        }
    }

    return propName in cssKeywordMap ? cssKeywordMap[propName] : [];
};

this.getCSSPropertyNames = function()
{
    if (!cssPropNames)
    {
        cssPropNames = [];

        for (var name in this.cssInfo)
            cssPropNames.push(name);
    }

    return cssPropNames;
};

this.isColorKeyword = function(keyword)
{
    if (keyword == "transparent")
        return false;

    if (!cssColorNames)
    {
        cssColorNames = [];

        var colors = this.cssKeywords["color"];
        for (var i = 0; i < colors.length; ++i)
            cssColorNames.push(colors[i].toLowerCase());

        var systemColors = this.cssKeywords["systemColor"];
        for (var i = 0; i < systemColors.length; ++i)
            cssColorNames.push(systemColors[i].toLowerCase());
    }

    return cssColorNames.indexOf(keyword.toLowerCase()) != -1;
};

this.copyTextStyles = function(fromNode, toNode, style)
{
    var view = fromNode.ownerDocument.defaultView;
    if (view)
    {
        if (!style)
            style = view.getComputedStyle(fromNode, "");

        toNode.style.fontFamily = style.getPropertyCSSValue("font-family").cssText;
        toNode.style.fontSize = style.getPropertyCSSValue("font-size").cssText;
        toNode.style.fontWeight = style.getPropertyCSSValue("font-weight").cssText;
        toNode.style.fontStyle = style.getPropertyCSSValue("font-style").cssText;

        return style;
    }
};

this.copyBoxStyles = function(fromNode, toNode, style)
{
    var view = fromNode.ownerDocument.defaultView;
    if (view)
    {
        if (!style)
            style = view.getComputedStyle(fromNode, "");

        toNode.style.marginTop = style.getPropertyCSSValue("margin-top").cssText;
        toNode.style.marginRight = style.getPropertyCSSValue("margin-right").cssText;
        toNode.style.marginBottom = style.getPropertyCSSValue("margin-bottom").cssText;
        toNode.style.marginLeft = style.getPropertyCSSValue("margin-left").cssText;
        toNode.style.borderTopWidth = style.getPropertyCSSValue("border-top-width").cssText;
        toNode.style.borderRightWidth = style.getPropertyCSSValue("border-right-width").cssText;
        toNode.style.borderBottomWidth = style.getPropertyCSSValue("border-bottom-width").cssText;
        toNode.style.borderLeftWidth = style.getPropertyCSSValue("border-left-width").cssText;

        return style;
    }
};

this.readBoxStyles = function(style)
{
    const styleNames = {
        "margin-top": "marginTop", "margin-right": "marginRight",
        "margin-left": "marginLeft", "margin-bottom": "marginBottom",
        "border-top-width": "borderTop", "border-right-width": "borderRight",
        "border-left-width": "borderLeft", "border-bottom-width": "borderBottom",
        "padding-top": "paddingTop", "padding-right": "paddingRight",
        "padding-left": "paddingLeft", "padding-bottom": "paddingBottom"
    };

    var styles = {};
    for (var styleName in styleNames)
        styles[styleNames[styleName]] = parseInt(style.getPropertyCSSValue(styleName).cssText);
    return styles;
};

this.getElementCSSSelector = function(element)
{
    var label = element.localName.toLowerCase();
    if (element.id)
        label += "#" + element.id;
    if (element.hasAttribute("class"))
        label += "." + element.getAttribute("class").split(" ")[0];

    return label;
};

this.getURLForStyleSheet= function(styleSheet)
{
    return (styleSheet.href ? styleSheet.href : styleSheet.ownerNode.ownerDocument.URL);
};

// ************************************************************************************************
// XML Serialization

this.getElementXML = function(element)
{
    function toXML(elt)
    {
        if (elt.nodeType == 1)
        {
            xml.push('<', elt.localName.toLowerCase());

            for (var i = 0; i < elt.attributes.length; ++i)
            {
                var attr = elt.attributes[i];

                // Hide attributes set by Firebug
                if (attr.localName.indexOf("firebug-") == 0)
                    continue;

                xml.push(' ', attr.localName, '=', escapeHTMLAttribute(attr.nodeValue));
            }

            if (elt.firstChild)
            {
                xml.push('>');

                for (var child = elt.firstChild; child; child = child.nextSibling)
                    toXML(child);

                xml.push('</', elt.localName.toLowerCase(), '>');
            }
            else
                xml.push('/>');
        }
        else if (elt.nodeType == 3)
            xml.push(elt.nodeValue);
        else if (elt.nodeType == 4)
            xml.push('<![CDATA[', elt.nodeValue, ']]>');
        else if (elt.nodeType == 8)
            xml.push('<!--', elt.nodeValue, '-->');
    }

    var xml = [];
    toXML(element);
    return xml.join("");
};

// ************************************************************************************************
// String escaping

this.escapeNewLines = function(value)
{
    return value.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
};

this.stripNewLines = function(value)
{
    return typeof(value) == "string" ? value.replace(/[\r\n]/g, " ") : value;
};

this.escapeJS = function(value)
{
    return value.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace('"', '\\"', "g");
};

function escapeHTMLAttribute(value)
{
    function replaceChars(ch)
    {
        switch (ch)
        {
            case "&":
                return "&amp;";
            case "'":
                return apos;
            case '"':
                return quot;
        }
        return "?";
    };
    var apos = "&#39;", quot = "&quot;", around = '"';
    if( value.indexOf('"') == -1 ) {
        quot = '"';
        apos = "'";
    } else if( value.indexOf("'") == -1 ) {
        quot = '"';
        around = "'";
    }
    return around + (String(value).replace(/[&'"]/g, replaceChars)) + around;
}


function escapeHTML(value)
{
    function replaceChars(ch)
    {
        switch (ch)
        {
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case "&":
                return "&amp;";
            case "'":
                return "&#39;";
            case '"':
                return "&quot;";
        }
        return "?";
    };
    return String(value).replace(/[<>&"']/g, replaceChars);
}

this.escapeHTML = escapeHTML;

this.cropString = function(text, limit)
{
    text = text + "";

    if (!limit)
        var halfLimit = 50;
    else
        var halfLimit = limit / 2;

    if (text.length > limit)
        return this.escapeNewLines(text.substr(0, halfLimit) + "..." + text.substr(text.length-halfLimit));
    else
        return this.escapeNewLines(text);
};

this.isWhitespace = function(text)
{
    return !reNotWhitespace.exec(text);
};

this.splitLines = function(text)
{
    if (text.split)
        return text.split(reSplitLines);
    else
    {
        var str = new String(text);
        return str.split(reSplitLines);  // TODO this does not work
    }
};

// ************************************************************************************************
// Menus

this.createMenu = function(popup, label)
{
    var menu = popup.ownerDocument.createElement("menu");
    menu.setAttribute("label", label);

    var menuPopup = popup.ownerDocument.createElement("menupopup");

    popup.appendChild(menu);
    menu.appendChild(menuPopup);

    return menuPopup;
};

this.createMenuItem = function(popup, item, before)
{
    if (typeof(item) == "string" && item.indexOf("-") == 0)
        return this.createMenuSeparator(popup, before);

    var menuitem = popup.ownerDocument.createElement("menuitem");

    this.setItemIntoElement(menuitem, item);

    if (before)
        popup.insertBefore(menuitem, before);
    else
        popup.appendChild(menuitem);
    return menuitem;
};

this.setItemIntoElement = function(element, item)
{
    var label = item.nol10n ? item.label : this.$STR(item.label);

    element.setAttribute("label", label);
    element.setAttribute("type", item.type);
    if (item.checked)
        element.setAttribute("checked", "true");
    if (item.disabled)
        element.setAttribute("disabled", "true");
    if (item.image)
    {
        element.setAttribute("class", "element-iconic");
        element.setAttribute("image", item.image);
    }

    if (item.command)
        element.addEventListener("command", item.command, false);

    return element;
}


this.createMenuHeader = function(popup, item)
{
    var header = popup.ownerDocument.createElement("label");
    header.setAttribute("class", "menuHeader");

    var label = item.nol10n ? item.label : this.$STR(item.label);

    header.setAttribute("value", label);

    popup.appendChild(header);
    return header;
};

this.createMenuSeparator = function(popup, before)
{
    if (!popup.firstChild)
        return;

    var menuitem = popup.ownerDocument.createElement("menuseparator");
    if (before)
        popup.insertBefore(menuitem, before);
    else
        popup.appendChild(menuitem);
    return menuitem;
};

this.optionMenu = function(label, option)
{
    return {label: label, type: "checkbox", checked: Firebug[option],
        command: this.bindFixed(Firebug.setPref, Firebug, Firebug.prefDomain, option, !Firebug[option]) };
};

this.serviceOptionMenu = function(label, option)
{
    return {label: label, type: "checkbox", checked: Firebug[option],
        command: this.bindFixed(Firebug.setPref, Firebug, "extensions.firebug-service", option, !Firebug[option]) };
};

// ************************************************************************************************
// Stack Traces

this.getCurrentStackTrace = function(context)
{
    var trace = null;

    Firebug.Debugger.halt(function(frame)
    {
        if (FBTrace.DBG_STACK) FBTrace.dumpProperties("lib.getCurrentStackTrace frame:", frame);
        trace = FBL.getStackTrace(frame, context);
        if (FBTrace.DBG_STACK) FBTrace.dumpProperties("lib.getCurrentStackTrace trace:", trace);
    });

    return trace;
};

this.getStackTrace = function(frame, context)
{
    var trace = new this.StackTrace();

    for (; frame; frame = frame.callingFrame)
    {
        if (!this.isSystemURL(FBL.normalizeURL(frame.script.fileName)))
        {
            var stackFrame = this.getStackFrame(frame, context);
            if (stackFrame)
                trace.frames.push(stackFrame);
        }
        else                                                                                                           /*@explore*/
            if (FBTrace.DBG_STACK)                                                                                     /*@explore*/
                FBTrace.sysout("lib.getStackTrace isSystemURL frame.script.fileName "+frame.script.fileName+"\n");     /*@explore*/
    }

    return trace;
};

this.getStackFrame = function(frame, context)
{
    if (frame.isNative || frame.isDebugger)
    {
        var excuse = (frame.isNative) ?  "(native)" : "(debugger)";
        if (FBTrace.DBG_STACK) FBTrace.sysout("lib.getStackFrame "+excuse+" frame\n");                                 /*@explore*/
        return new this.StackFrame(context, excuse, null, excuse, 0, []);
    }
    try
    {
        var sourceFile = this.getSourceFileByScript(context, frame.script);
        if (sourceFile)
        {
            var url = sourceFile.href;
            var analyzer = sourceFile.getScriptAnalyzer(frame.script);

            var lineNo = analyzer.getSourceLineFromFrame(context, frame);
            var fncSpec = analyzer.getFunctionDescription(frame.script, context, frame);

            if (FBTrace.DBG_STACK) FBTrace.sysout("lib.getStackFrame for sourceFile", sourceFile);
            return new this.StackFrame(context, fncSpec.name, frame.script, url, lineNo, fncSpec.args, frame.pc);
        }
        else
        {
            if (FBTrace.DBG_STACK) FBTrace.sysout("lib.getStackFrame NO sourceFile tag@file:", frame.script.tag+"@"+frame.script.fileName);
            var script = frame.script;

            return new this.StackFrame(context, script.functionName, frame.script, FBL.normalizeURL(script.fileName), frame.line, [], frame.pc);
        }
    }
    catch (exc)
    {
        if (FBTrace.DBG_STACK) FBTrace.dumpProperties("getStackTrace fails:", exc);                                    /*@explore*/
        return null;
    }
};

this.getStackDump = function()
{
    var lines = [];
    for (var frame = Components.stack; frame; frame = frame.caller)
        lines.push(frame.filename + " (" + frame.lineNumber + ")");

    return lines.join("\n");
};

this.getStackSourceLink = function()
{
    for (var frame = Components.stack; frame; frame = frame.caller)
    {
        if (frame.filename && frame.filename.indexOf("chrome://firebug/") == 0)
        {
            for (; frame; frame = frame.caller)
            {
                if (frame.filename && frame.filename.indexOf("chrome://firebug/") != 0)
                    break;
            }
            break;
        }
    }
    return this.getFrameSourceLink(frame);
}

this.getFrameSourceLink = function(frame)
{
    if (frame && frame.filename && frame.filename.indexOf(Firebug.CommandLine.evalScript) == -1)
        return new FBL.SourceLink(frame.filename, frame.lineNumber, "js");
    else
        return null;
};

this.getStackFrameId = function()
{
    for (var frame = Components.stack; frame; frame = frame.caller)
    {
        if (frame.languageName == "JavaScript"
            && !(frame.filename && frame.filename.indexOf("chrome://firebug/") == 0))
        {
            return frame.filename + "/" + frame.lineNumber;
        }
    }
    return null;
};

// ************************************************************************************************
// Event Monitoring

this.toggleMonitorEvents = function(object, type, state, context)
{
    if (state)
        this.unmonitorEvents(object, type, context);
    else
        this.monitorEvents(object, type, context);
};

this.monitorEvents = function(object, type, context)
{
    if (!this.areEventsMonitored(object, type, context) && object && object.addEventListener)
    {
        if (!context.onMonitorEvent)
            context.onMonitorEvent = function(event) { Firebug.Console.log(event, context); };

        if (!context.eventsMonitored)
            context.eventsMonitored = [];

        context.eventsMonitored.push({object: object, type: type});

        if (!type)
            this.attachAllListeners(object, context.onMonitorEvent, context);
        else
            object.addEventListener(type, context.onMonitorEvent, false);
    }
};

this.unmonitorEvents = function(object, type, context)
{
    var eventsMonitored = context.eventsMonitored;

    for (var i = 0; i < eventsMonitored.length; ++i)
    {
        if (eventsMonitored[i].object == object && eventsMonitored[i].type == type)
        {
            eventsMonitored.splice(i, 1);

            if (!type)
                this.detachAllListeners(object, context.onMonitorEvent, context);
            else
                object.removeEventListener(type, context.onMonitorEvent, false);
            break;
        }
    }
};

this.areEventsMonitored = function(object, type, context)
{
    var eventsMonitored = context.eventsMonitored;
    if (eventsMonitored)
    {
        for (var i = 0; i < eventsMonitored.length; ++i)
        {
            if (eventsMonitored[i].object == object && eventsMonitored[i].type == type)
                return true;
        }
    }

    return false;
};

// ************************************************************************************************
// Functions

this.findScript = function(context, url, line)
{
    var sourceFile = context.sourceFileMap[url];
    if (sourceFile)
        var script = sourceFile.getScriptByLineNumber(line);
    else
        FBTrace.sysout("lib.findScript, no sourceFile in context for url=", url);
    return script;
};

this.findScriptForFunction = function(fn)
{
    var found = null;

    this.jsd.enumerateScripts({enumerateScript: function(script)
    {
        try {
            if (script.functionObject.getWrappedValue() == fn)
                found = script;
        } catch (exc) {}
    }});

    return found;
};

this.findSourceForFunction = function(fn, context)
{
    var script = this.findScriptForFunction(fn);
    return (script)? this.getSourceLinkForScript(script, context) : null;
};

this.getSourceLinkForScript = function(script, context)
{
    var sourceFile = this.getSourceFileByScript(context, script);
    if (sourceFile)
    {
        var scriptAnalyzer = sourceFile.getScriptAnalyzer(script);
        return scriptAnalyzer.getSourceLinkForScript(script);
    }
};

this.getFunctionName = function(script, context, frame)
{
    if (!script)
    {
        if (FBTrace.DBG_STACK) FBTrace.dumpStack("lib.getFunctionName FAILS typeof(script)="+typeof(script)+"\n");     /*@explore*/
        return "(no script)";
    }
    var name = script.functionName;

    if (!name || (name == "anonymous"))
    {
        var analyzer = FBL.getScriptAnalyzer(context, script);
        if (analyzer)
        {
            if (FBTrace.DBG_STACK) FBTrace.dumpProperties("getFunctionName analyzer:", analyzer);     /*@explore*/
            var functionSpec = analyzer.getFunctionDescription(script, context, frame);
            name = functionSpec.name +"("+functionSpec.args.join(',')+")";
        }
        else
        {
            if (FBTrace.DBG_STACK) FBTrace.sysout("getFunctionName no analyzer, "+script.baseLineNumber+"@"+script.fileName+"\n");     /*@explore*/
            name =  this.guessFunctionName(FBL.normalizeURL(script.fileName), script.baseLineNumber, context);
        }
    }
    if (FBTrace.DBG_STACK) FBTrace.sysout("getFunctionName "+script.tag+" ="+name+"\n");     /*@explore*/

    return name;
};

this.guessFunctionName = function(url, lineNo, context)
{
    if (context)
    {
        if (context.sourceCache)
            return this.guessFunctionNameFromLines(url, lineNo, context.sourceCache);
    }
    return "? in "+this.getFileName(url)+"@"+lineNo;
};

this.guessFunctionNameFromLines = function(url, lineNo, sourceCache) {
        // Walk backwards from the first line in the function until we find the line which
        // matches the pattern above, which is the function definition
        var line = "";
        if (FBTrace.DBG_STACK) FBTrace.sysout("getFunctionNameFromLines for line@URL="+lineNo+"@"+url+"\n");           /*@explore*/
        for (var i = 0; i < 4; ++i)
        {
            line = sourceCache.getLine(url, lineNo-i) + line;
            if (line != undefined)
            {
                var m = reGuessFunction.exec(line);
                if (m)
                    return m[1];
                else
                    if (FBTrace.DBG_FUNCTION_NAMES)                                                                    /*@explore*/
                        FBTrace.sysout("lib.guessFunctionName re failed for lineNo-i="+lineNo+"-"+i+" line="+line+"\n");    /*@explore*/
                m = reFunctionArgNames.exec(line);
                if (m && m[1])
                    return m[1];
            }
        }
        return "(?)";
};

this.getFunctionArgNames = function(fn)
{
    var m = reFunctionArgNames.exec(this.safeToString(fn));
    if (m)
    {
        var argNames = m[2].split(", ");
        if (argNames.length && argNames[0])
            return argNames;
    }
    return [];
};

this.getFunctionArgValues = function(fn, frame)
{
    var values = [];

    var argNames = this.getFunctionArgNames(fn);
    for (var i = 0; i < argNames.length; ++i)
    {
        var argName = argNames[i];
        var pvalue = frame.scope.getProperty(argName);
        var value = pvalue ? pvalue.value.getWrappedValue() : undefined;
        values.push({name: argName, value: value});
    }

    return values;
};

// ************************************************************************************************
// Source Files

this.getScriptFileByHref = function(url, context)
{
    return context.sourceFileMap[url];
};

this.getStyleSheetByHref = function(url, context)
{
    function addSheet(sheet)
    {
        if (sheet.href == null) //http://www.w3.org/TR/DOM-Level-2-Style/stylesheets.html#StyleSheets-StyleSheet. For inline style sheets, the value of this attribute is null.
            return sheet;

        for (var i = 0; i < sheet.cssRules.length; ++i)
        {
            var rule = sheet.cssRules[i];
            if (rule instanceof CSSImportRule)
            {
                var found = addSheet(rule.styleSheet);
                if (found)
                    return found;
            }
        }
    }

    var rootSheets = context.window.document.styleSheets;
    for (var i = 0; i < rootSheets.length; ++i)
    {
        var found = addSheet(rootSheets[i]);
        if (found)
            return found;
    }
};

this.sourceFilesAsArray = function(context)
{
    var sourceFiles = [];
    var sourceFileMap = context.sourceFileMap;
    for (var url in sourceFileMap)
        sourceFiles.push(sourceFileMap[url]);
    if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("sourceFilesAsArray sourcefiles="+sourceFiles.length+" -> "+context.window.location+"\n"); /*@explore*/

    return sourceFiles;
};

this.updateScriptFiles = function(context, eraseSourceFileMap)  // scan windows for 'script' tags
{
    var oldMap = eraseSourceFileMap ? null : context.sourceFileMap;

    if (FBTrace.DBG_SOURCEFILES)
    {
        FBTrace.sysout("updateScriptFiles eraseSourceFileMap: "+eraseSourceFileMap);
        this.sourceFilesAsArray(context);  // just for length trace
    }

    function addFile(url, scriptTagNumber, dependentURL)
    {
            if (oldMap && url in oldMap)
            {
                var sourceFile = oldMap[url];
                sourceFile.dependentURL = dependentURL;
                context.sourceFileMap[url] = sourceFile;
                return false;
            }
            else
            {
                var sourceFile = new FBL.ScriptTagSourceFile(context, url, scriptTagNumber);
                sourceFile.dependentURL = dependentURL;
                context.sourceFileMap[url] = sourceFile;
                return true;
            }
    }

    this.iterateWindows(context.window, this.bind(function(win)
    {
        if (FBTrace.DBG_SOURCEFILES)  																								/*@explore*/
            FBTrace.sysout("updateScriptFiles iterateWindows: "+win.location.href, " documentElement: "+win.document.documentElement);  /*@explore*/
        if (!win.document.documentElement)
            return;

        var baseUrl = win.location.href;
        var bases = win.document.documentElement.getElementsByTagName("base");
        if (bases && bases[0])
        {
            baseUrl = bases[0].href;
        }

        var scripts = win.document.documentElement.getElementsByTagName("script");
        for (var i = 0; i < scripts.length; ++i)
        {
            var scriptSrc = scripts[i].getAttribute('src'); // for XUL use attribute
            var url = scriptSrc ? this.absoluteURL(scriptSrc, baseUrl) : win.location.href;
            url = this.normalizeURL(url ? url : win.location.href);
            var added = addFile(url, i, (scriptSrc?win.location.href:null));
            if (FBTrace.DBG_SOURCEFILES)                                                                           /*@explore*/
                FBTrace.sysout("updateScriptFiles "+(scriptSrc?"inclusion":"inline")+" script #"+i+"/"+scripts.length+(added?" adding ":" readded ")+url+" to context="+context.window.location+"\n");  /*@explore*/
        }
    }, this));
};

this.showThisSourceFile = function(url)
{
    //-----------------------123456789
    if (url.substr(0, 9) == "chrome://")
        return false;
    return true;
}

// ************************************************************************************************
// Firefox browsing

this.openNewTab = function(url)
{
    if (url)
        gBrowser.selectedTab = gBrowser.addTab(url);
};

this.openWindow = function(windowType, url, features, params)
{
    var wm = this.CCSV("@mozilla.org/appshell/window-mediator;1", "nsIWindowMediator");

    var win = windowType ? wm.getMostRecentWindow(windowType) : null;
    if (win) {
      if ("initWithParams" in win)
        win.initWithParams(params);
      win.focus();
    }
    else {
      var winFeatures = "resizable,dialog=no,centerscreen" + (features != "" ? ("," + features) : "");
      var parentWindow = (this.instantApply || !window.opener || window.opener.closed) ? window : window.opener;
      win = parentWindow.openDialog(url, "_blank", winFeatures, params);
    }
    return win;
};

this.viewSource = function(url, lineNo)
{
    window.openDialog("chrome://global/content/viewSource.xul", "_blank",
        "all,dialog=no", url, null, null, lineNo);
};

// ************************************************************************************************
// JavaScript Parsing

this.getExpressionAt = function(text, charOffset)
{
    var offset = 0;
    for (var m = reWord.exec(text); m; m = reWord.exec(text.substr(offset)))
    {
        var word = m[0];
        var wordOffset = offset+m.index;
        if (charOffset >= wordOffset && charOffset <= wordOffset+word.length)
        {
            var innerOffset = charOffset-wordOffset;
            var dots = word.substr(0, innerOffset).split(".").length;
            var subExpr = word.split(".").slice(0, dots).join(".");
            return {expr: subExpr, offset: wordOffset};
        }

        offset = wordOffset+word.length;
    }

    return {expr: null, offset: -1};
};

var jsKeywords =
{
    "var": 1,
    "const": 1,
    "class": 1,
    "extends": 1,
    "import": 1,
    "namespace": 1,
    "function": 1,
    "debugger": 1,
    "new": 1,
    "delete": 1,
    "null": 1,
    "undefined": 1,
    "true": 1,
    "false": 1,
    "void": 1,
    "typeof": 1,
    "instanceof": 1,
    "break": 1,
    "continue": 1,
    "return": 1,
    "throw": 1,
    "try": 1,
    "catch": 1,
    "finally": 1,
    "if": 1,
    "else": 1,
    "for": 1,
    "while": 1,
    "do": 1,
    "with": 1,
    "switch": 1,
    "case": 1,
    "default": 1
};

this.isJavaScriptKeyword = function(name)
{
    return name in jsKeywords;
};

// ************************************************************************************************
// Events

this.cancelEvent = function(event)
{
    event.stopPropagation();
    event.preventDefault();
};

this.isLeftClick = function(event)
{
    return event.button == 0 && this.noKeyModifiers(event);
};

this.isMiddleClick = function(event)
{
    return event.button == 1 && this.noKeyModifiers(event);
};

this.isRightClick = function(event)
{
    return event.button == 2 && this.noKeyModifiers(event);
};

this.noKeyModifiers = function(event)
{
    return !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey;
};

this.isControlClick = function(event)
{
    return event.button == 0 && this.isControl(event);
};

this.isShiftClick = function(event)
{
    return event.button == 0 && this.isShift(event);
};

this.isControl = function(event)
{
    return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
};

this.isControlShift = function(event)
{
    return (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey;
};

this.isShift = function(event)
{
    return event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
};

this.dispatch = function(listeners, name, args)
{
    if (FBTrace.DBG_DISPATCH) FBTrace.sysout("FBL.dispatch "+name+" to "+listeners.length+" listeners\n");              /*@explore*/
                                                                                                                       /*@explore*/
    try {
        for (var i = 0; i < listeners.length; ++i)
        {
            var listener = listeners[i];
            if ( listener.hasOwnProperty(name) )
                listener[name].apply(listener, args);
        }
    }
    catch (exc)
    {
            FBTrace.dumpProperties(" Exception in lib.dispatch "+ name, exc); // XXXjjb
    }
};

this.dispatch2 = function(listeners, name, args)
{
    if (FBTrace.DBG_DISPATCH) FBTrace.sysout("FBL.dispatch2 "+name+" to "+listeners.length+" listeners\n");              /*@explore*/

    for (var i = 0; i < listeners.length; ++i)
    {
        var listener = listeners[i];
        if ( listener.hasOwnProperty(name) )
        {
            var result = listener[name].apply(listener, args);
            if ( result )
                return result;
        }
    }
};

// ************************************************************************************************
// DOM Events

const eventTypes =
{
    composition: [
        "composition",
        "compositionstart",
        "compositionend" ],
    contextmenu: [
        "contextmenu" ],
    drag: [
        "dragenter",
        "dragover",
        "dragexit",
        "dragdrop",
        "draggesture" ],
    focus: [
        "focus",
        "blur" ],
    form: [
        "submit",
        "reset",
        "change",
        "select",
        "input" ],
    key: [
        "keydown",
        "keyup",
        "keypress" ],
    load: [
        "load",
        "beforeunload",
        "unload",
        "abort",
        "error" ],
    mouse: [
        "mousedown",
        "mouseup",
        "click",
        "dblclick",
        "mouseover",
        "mouseout",
        "mousemove" ],
    mutation: [
        "DOMSubtreeModified",
        "DOMNodeInserted",
        "DOMNodeRemoved",
        "DOMNodeRemovedFromDocument",
        "DOMNodeInsertedIntoDocument",
        "DOMAttrModified",
        "DOMCharacterDataModified" ],
    paint: [
        "paint",
        "resize",
        "scroll" ],
    scroll: [
        "overflow",
        "underflow",
        "overflowchanged" ],
    text: [
        "text" ],
    ui: [
        "DOMActivate",
        "DOMFocusIn",
        "DOMFocusOut" ],
    xul: [
        "popupshowing",
        "popupshown",
        "popuphiding",
        "popuphidden",
        "close",
        "command",
        "broadcast",
        "commandupdate" ]
};

this.getEventFamily = function(eventType)
{
    if (!this.families)
    {
        this.families = {};

        for (var family in eventTypes)
        {
            var types = eventTypes[family];
            for (var i = 0; i < types.length; ++i)
                this.families[types[i]] = family;
        }
    }

    return this.families[eventType];
};

this.attachAllListeners = function(object, listener)
{
    for (var family in eventTypes)
    {
        if (family != "mutation" || Firebug.attachMutationEvents)
            this.attachFamilyListeners(family, object, listener);
    }
};

this.detachAllListeners = function(object, listener)
{
    for (var family in eventTypes)
    {
        if (family != "mutation" || Firebug.attachMutationEvents)
            this.detachFamilyListeners(family, object, listener);
    }
};

this.attachFamilyListeners = function(family, object, listener)
{
    var types = eventTypes[family];
    for (var i = 0; i < types.length; ++i)
        object.addEventListener(types[i], listener, false);
};

this.detachFamilyListeners = function(family, object, listener)
{
    var types = eventTypes[family];
    for (var i = 0; i < types.length; ++i)
        object.removeEventListener(types[i], listener, false);
};

// ************************************************************************************************
// URLs

this.getFileName = function(url)
{
    var split = this.splitURLBase(url);
    return split.name;
};

this.splitFileName = function(url)
{ // Dead code
    var d = this.reDataURL.exec(url);
    if (d)
    {
        var path = decodeURIComponent(d[1]);
        if (!d[2])
            return { path: path, name: 'eval' };
        else
            return { path: path, name: 'eval', line: d[2] };
    }

    var m = reSplitFile.exec(url);
    if (!m)
        return {name: url, path: url};
    else if (!m[2])
        return {path: m[1], name: m[1]};
    else
        return {path: m[1], name: m[2]};
};

this.splitURLBase = function(url)
{
    this.reDataURL.lastIndex = 0;
    var d = this.reDataURL.exec(url); // 1: fileName, 2: baseLineNumber, 3: first line
    if (d)
    {
        var src_starts = this.reDataURL.lastIndex;
        var caller_URL = decodeURIComponent(d[1]);
        var caller_split = this.splitURLTrue(caller_URL);

        if (!d[3])
            var hint = url.substr(src_starts);
        else
            var hint = decodeURIComponent(d[3]).replace(/\s*$/, "");

        if (!d[2])
            return { path: caller_split.path, name: 'eval->'+hint };
        else
            return { path: caller_split.path, name: 'eval->'+hint, line: d[2] };
    }
    return this.splitURLTrue(url);
};

this.splitURLTrue = function(url)
{
    var m = reSplitFile.exec(url);
    if (!m)
        return {name: url, path: url};
    else if (!m[2])
        return {path: m[1], name: m[1]};
    else
        return {path: m[1], name: m[2]+m[3]};
};

this.getFileExtension = function(url)
{
    var lastDot = url.lastIndexOf(".");
    return url.substr(lastDot+1);
};

this.isSystemURL = function(url)
{
    if (!Firebug.filterSystemURLs) return false;
    if (!url) return true;
    if (url.length == 0) return true; // spec for about:blank
    if (url[0] == 'h') return false;
    if (url.substr(0, 9) == "resource:")
        return true;
    else if (url.substr(0, 17) == "chrome://firebug/")
        return true;
    else if (url.substr(0, 6) == "about:")
        return true;
    else if (url.indexOf("firebug-service.js") != -1)
        return true;
    else
        return false;
};

this.isSystemPage = function(win)
{
    try
    {
        var doc = win.document;
        if (!doc)
            return false;

        // Detect pages for pretty printed XML
        if ((doc.styleSheets.length && doc.styleSheets[0].href
                == "chrome://global/content/xml/XMLPrettyPrint.css")
            || (doc.styleSheets.length > 1 && doc.styleSheets[1].href
                == "chrome://browser/skin/feeds/subscribe.css"))
            return true;

        return FBL.isSystemURL(win.location.href);
    }
    catch (exc)
    {
        // Sometimes documents just aren't ready to be manipulated here, but don't let that
        // gum up the works
        ERROR("tabWatcher.isSystemPage document not ready:"+ exc);
        return false;
    }
}

this.getURIHost = function(uri)
{
    try
    {
        return uri.host;
    }
    catch (exc)
    {
        return "";
    }
}

this.isLocalURL = function(url)
{
    if (url.substr(0, 5) == "file:")
        return true;
    else
        return false;
};

this.getLocalPath = function(url)
{
    if (this.isLocalURL(url))
    {
        var ioService = this.CCSV("@mozilla.org/network/io-service;1", "nsIIOService");
        var fileHandler = ioService.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler);
        var file = fileHandler.getFileFromURLSpec(url);
        return file.path;
    }
};

this.getURLFromLocalFile = function(file)
{
    var ioService = this.CCSV("@mozilla.org/network/io-service;1", "nsIIOService");  // TODO cache?
    var fileHandler = ioService.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler);
    var URL = fileHandler.getURLSpecFromFile(file);
    return URL;
};

this.getDomain = function(url)
{
    var m = /[^:]+:\/{1,3}([^\/]+)/.exec(url);
    return m ? m[1] : "";
};

this.getURLPath = function(url)
{
    var m = /[^:]+:\/{1,3}[^\/]+(\/.*?)$/.exec(url);
    return m ? m[1] : "";
};

this.getPrettyDomain = function(url)
{
    var m = /[^:]+:\/{1,3}(www.)?([^\/]+)/.exec(url);
    return m ? m[2] : "";
};

this.absoluteURL = function(url, baseURL)
{
    if (url[0] == "?")
        return baseURL + url;

    var reURL = /(([^:]+:)\/{1,2}[^\/]*)(.*?)$/;
    var m = reURL.exec(url);
    if (m)
        return url;

    var m = reURL.exec(baseURL);
    if (!m)
        return "";

    var head = m[1];
    var tail = m[3];
    if (url.substr(0, 2) == "//")
        return m[2] + url;
    else if (url[0] == "/")
    {
        return head + url;
    }
    else if (tail[tail.length-1] == "/")
        return baseURL + url;
    else
    {
        var parts = tail.split("/");
        return head + parts.slice(0, parts.length-1).join("/") + "/" + url;
    }
}

this.normalizeURL = function(url)
{
    // For some reason, JSDS reports file URLs like "file:/" instead of "file:///", so they
    // don't match up with the URLs we get back from the DOM
    return url ? url.replace(/file:\/([^/])/g, "file:///$1") : "";
};

this.denormalizeURL = function(url)
{
    return url.replace(/file:\/\/\//g, "file:/");
};

this.parseURLParams = function(url)
{
    var q = url ? url.indexOf("?") : -1;
    if (q == -1)
        return [];

    var search = url.substr(q+1);
    var h = search.lastIndexOf("#");
    if (h != -1)
        search = search.substr(0, h);

    if (!search)
        return [];

    return this.parseURLEncodedText(search);
};

this.parseURLEncodedText = function(text)
{
    const maxValueLength = 25000;

    var params = [];

    var args = text.split("&");
    for (var i = 0; i < args.length; ++i)
    {
        var parts = args[i].split("=");
        if (parts.length == 2)
        {
            if (parts[1].length > maxValueLength)
                parts[1] = this.$STR("LargeData");

            params.push({name: unescape(parts[0]), value: unescape(parts[1])});
        }
        else
            params.push({name: unescape(parts[0]), value: ""});
    }

    params.sort(function(a, b) { return a.name < b.name ? -1 : 1; });

    return params;
};

this.getResource = function(aURL)
{
    var ioService=Components.classes["@mozilla.org/network/io-service;1"]
        .getService(Components.interfaces.nsIIOService);
    var scriptableStream=Components
        .classes["@mozilla.org/scriptableinputstream;1"]
        .getService(Components.interfaces.nsIScriptableInputStream);

    var channel=ioService.newChannel(aURL,null,null);
    var input=channel.open();
    scriptableStream.init(input);
    var str=scriptableStream.read(input.available());
    scriptableStream.close();
    input.close();
    return str;
};
// ************************************************************************************************
// Network

this.readFromStream = function(stream, charset)
{
    try
    {
        var sis = this.CCSV("@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream");
        sis.setInputStream(stream);

        var segments = [];
        for (var count = stream.available(); count; count = stream.available())
            segments.push(sis.readBytes(count));

        var text = segments.join("");
        return this.convertToUnicode(text, charset);
     }
     catch(exc)
     {
     }
};

this.readPostTextFromPage = function(url, context)
{
    if (url == context.browser.contentWindow.location.href)
    {
        try
        {
            var webNav = context.browser.webNavigation;
            var descriptor = this.QI(webNav, Ci.nsIWebPageDescriptor).currentDescriptor;
            var entry = this.QI(descriptor, Ci.nsISHEntry);
            if (entry && entry.postData)
            {
                var postStream = this.QI(entry.postData, Ci.nsISeekableStream);
                postStream.seek(NS_SEEK_SET, 0);

                var charset = context.window.document.characterSet;
                return this.readFromStream(postStream, charset);
            }
         }
         catch (exc)
         {
             if (FBTrace.DBG_ERRORS)                                                         /*@explore*/
                FBTrace.dumpProperties("lib.readPostText FAILS, url:"+url, exc);                    /*@explore*/
         }
     }
};

this.readPostTextFromXHR = function(xhrRequest, context)
{
    try
    {
        var is = this.QI(xhrRequest.channel, Ci.nsIUploadChannel).uploadStream;
        if (is)
        {
            var ss = this.QI(is, Ci.nsISeekableStream);
            if (ss) ss.seek(NS_SEEK_SET, 0);
            var charset = context.window.document.characterSet;
            var text = this.readFromStream(is, charset);
            if (ss) ss.seek(NS_SEEK_SET, 0);
            return text;
        }
    }
    catch(exc)
    {
        if (FBTrace.DBG_ERRORS)                                                                                        /*@explore*/
            FBTrace.dumpProperties("lib.readPostTextFromXHR FAILS ", exc);                                             /*@explore*/
    }

    return null;
}

this.getStateDescription = function(flag) {
    var state = "";
    var nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;
    if (flag & nsIWebProgressListener.STATE_START) state += "STATE_START ";
    else if (flag & nsIWebProgressListener.STATE_REDIRECTING) state += "STATE_REDIRECTING ";
    else if (flag & nsIWebProgressListener.STATE_TRANSFERRING) state += "STATE_TRANSFERRING ";
    else if (flag & nsIWebProgressListener.STATE_NEGOTIATING) state += "STATE_NEGOTIATING ";
    else if (flag & nsIWebProgressListener.STATE_STOP) state += "STATE_STOP ";

    if (flag & nsIWebProgressListener.STATE_IS_REQUEST) state += "STATE_IS_REQUEST ";
    if (flag & nsIWebProgressListener.STATE_IS_DOCUMENT) state += "STATE_IS_DOCUMENT ";
    if (flag & nsIWebProgressListener.STATE_IS_NETWORK) state += "STATE_IS_NETWORK ";
    if (flag & nsIWebProgressListener.STATE_IS_WINDOW) state += "STATE_IS_WINDOW ";
    if (flag & nsIWebProgressListener.STATE_RESTORING) state += "STATE_RESTORING ";
    if (flag & nsIWebProgressListener.STATE_IS_INSECURE) state += "STATE_IS_INSECURE ";
    if (flag & nsIWebProgressListener.STATE_IS_BROKEN) state += "STATE_IS_BROKEN ";
    if (flag & nsIWebProgressListener.STATE_IS_SECURE) state += "STATE_IS_SECURE ";
    if (flag & nsIWebProgressListener.STATE_SECURE_HIGH) state += "STATE_SECURE_HIGH ";
    if (flag & nsIWebProgressListener.STATE_SECURE_MED) state += "STATE_SECURE_MED ";
    if (flag & nsIWebProgressListener.STATE_SECURE_LOW) state += "STATE_SECURE_LOW ";

    return state;
}
// ************************************************************************************************
// Programs

this.launchProgram = function(exePath, args)
{
    try {
        var file = this.CCIN("@mozilla.org/file/local;1", "nsILocalFile");
        file.initWithPath(exePath);
        if (this.getPlatformName() == "Darwin" && file.isDirectory())
        {
            args = this.extendArray(["-a", exePath], args);
            file.initWithPath("/usr/bin/open");
        }
        if (!file.exists())
            return false;
        var process = this.CCIN("@mozilla.org/process/util;1", "nsIProcess");
        process.init(file);
        process.run(false, args, args.length, {});
        return true;
    }
    catch(exc)
    {
        this.ERROR(exc);
    }
    return false;
};

this.getIconURLForFile = function(path)
{
    var ioService = this.CCSV("@mozilla.org/network/io-service;1", "nsIIOService");
    var fileHandler = ioService.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler);
    try {
        var file = this.CCIN("@mozilla.org/file/local;1", "nsILocalFile");
        file.initWithPath(path);
        if ((this.getPlatformName() == "Darwin") && !file.isDirectory() && (path.indexOf(".app/") != -1))
        {
            path = path.substr(0,path.lastIndexOf(".app/")+4);
            file.initWithPath(path);
        }
        return "moz-icon://" + fileHandler.getURLSpecFromFile(file) + "?size=16";
    }
    catch(exc)
    {
        this.ERROR(exc);
    }
    return null;
}

// ************************************************************************************************

this.getSourceLines = function(lines)
{
    var maxLineNoChars = (lines.length + "").length;
    return this.getSourceLineRange(lines, 1, lines.length, maxLineNoChars);
};

this.getSourceLineRange = function(lines, min, max, maxLineNoChars)
{
    var html = [];

    for (var i = min; i <= max; ++i)
    {
        // Make sure all line numbers are the same width (with a fixed-width font)
        var lineNo = i + "";
        while (lineNo.length < maxLineNoChars)
            lineNo = " " + lineNo;

        var line = escapeHTML(lines[i-1]);

        html.push(
            '<div class="sourceRow"><a class="sourceLine">',
            lineNo,
            '</a><span class="sourceRowText">',
            line,
            '</span></div>'
        );
    }

    return html.join("");
};

// ************************************************************************************************

this.persistObjects = function(panel, panelState)
{
    // Persist the location and selection so we can restore them in case of a reload
    if (panel.location)
        panelState.persistedLocation = this.persistObject(panel.location, panel.context);

    if (panel.selection)
        panelState.persistedSelection = this.persistObject(panel.selection, panel.context);
};

this.persistObject = function(object, context)
{
    var rep = Firebug.getRep(object);
    return rep ? rep.persistObject(object, context) : null;
};

this.restoreObjects = function(panel, panelState)
{
    // Persist the location and selection so we can restore them in case of a reload
    if (!panel.location && panelState && panelState.persistedLocation)
    {
        var location = panelState.persistedLocation(panel.context);
        if (location)
            panel.navigate(location);
    }

    if (!panel.location)
        panel.navigate(null);

    if (!panel.selection && panelState && panelState.persistedSelection)
    {
        var selection = panelState.persistedSelection(panel.context);
        if (selection)
            panel.select(selection);
    }

    if (!panel.selection)
    {
        // Couldn't restore the selection, so select the default object
        panel.select(null);

        if (panelState && panelState.persistedSelection)
        {
            // If we couldn't restore the selection, wait a bit and try again
            panel.context.setTimeout(function()
            {
                if (panel.selection == panel.getDefaultSelection())
                {
                    var selection = panelState.persistedSelection(panel.context);
                    if (selection)
                        panel.select(selection);
                }
            }, restoreRetryTimeout);
        }
    }
};

this.getPersistedState = function(context, panelName)
{
    if (!context)
        return null;

    var persistedState = context.persistedState;
    if (!persistedState)
        persistedState = context.persistedState = {};

    if (!persistedState.panelState)
        persistedState.panelState = {};

    var panelState = persistedState.panelState[panelName];
    if (!panelState)
        panelState = persistedState.panelState[panelName] = {};

    return panelState;
};

// ************************************************************************************************

this.ErrorMessage = function(message, href, lineNo, source, category, context, trace)
{
    this.message = message;
    this.href = href;
    this.lineNo = lineNo;
    this.source = source;
    this.category = category;
    this.context = context;
    this.trace = trace;
};

this.ErrorMessage.prototype =
{
    getSourceLine: function()
    {
        return this.context.sourceCache.getLine(this.href, this.lineNo);
    }
};

// ************************************************************************************************

this.TextSearch = function(rootNode, rowFinder)
{
    var doc = rootNode.ownerDocument;
    var count, searchRange, startPt, endPt;

    this.find = function(text)
    {
        this.text = text;

        var range = this.range = finder.Find(text, searchRange, startPt, endPt);
        var match = range ?  range.startContainer : null;
        return this.currentNode = (rowFinder && match ? rowFinder(match) : match);
    };

    this.findNext = function(wrapAround, sameNode)
    {
        startPt = doc.createRange();
        startPt.setStartAfter(this.currentNode ? this.currentNode : rootNode);

        var match = this.find(this.text);
        if (!match && wrapAround)
        {
            this.reset();
            return this.find(this.text);
        }

        return match;
    };

    this.reset = function()
    {
        count = rootNode.childNodes.length;
        searchRange = doc.createRange();
        searchRange.setStart(rootNode, 0);
        searchRange.setEnd(rootNode, count);

        startPt = doc.createRange();
        startPt.setStart(rootNode, 0);
        startPt.setEnd(rootNode, 0);

        endPt = doc.createRange();
        endPt.setStart(rootNode, count);
        endPt.setEnd(rootNode, count);
    };

    this.reset();
};

// ************************************************************************************************

this.Continued = function()
{

};

this.Continued.prototype =
{
    complete: function()
    {
        if (this.callback)
            this.callback.apply(top, arguments);
        else
            this.result = cloneArray(arguments);
    },

    wait: function(cb)
    {
        if ("result" in this)
            cb.apply(top, this.result);
        else
            this.callback = cb;
    }
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

this.SourceLink = function(url, line, type, object)
{
    this.href = url;
    this.line = line;
    this.type = type;
    this.object = object;
};

this.SourceLink.prototype =
{
    toString: function()
    {
        return this.href;
    }
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
// SourceFile one for every compilation unit.
// Unique URL for each. (href)
// Unique outerScript, the statements outside of any function defintion
// sourceCache keyed by href has source for this compilation unit
// Stored by href in context.
// Contains array of jsdIScript for functions (scripts) defined in this unit
// May contain line table (for sources viewed)
//
this.SourceFile = function (compilation_unit_type)
{
    this.compilation_unit_type = compilation_unit_type; /*@explore*/
    this.OuterScriptAnalyzer = function(sourceFile)
    {
        this.sourceFile = sourceFile;
    };
}

this.SourceFile.prototype =
{
    toString: function()
    {
        var str = (this.compilation_unit_type?this.compilation_unit_type+" ":"")+this.href+" script.tags( ";
        if (this.outerScript)
            str += (this.outerScript.isValid?this.outerScript.tag:"X") +"| ";
        if (this.innerScripts)
        {
            for (var i = 0; i < this.innerScripts.length; i++)
            {
                var script = this.innerScripts[i];
                if (script.isValid)  str += script.tag+" ";
            }
        }
        str += ")";
        return str;
    },

    dumpLineTable: function()
    {
        var str = "SourceFile " + this.href+"; lineMap: ";
        if (this.lineMap)
            for (line in this.lineMap) str += "["+line+"]="+this.lineMap[line].tag;
        else
            str += '(not built)';
        return str;
    },

    hasLineTable: function()
    {
        return this.lineMap ? true : false;
    },

    getSourceLength: function()
    {
            return this.sourceLength;
    },

    buildLineTable: function()
    {
        // FYI, the outerScript is already in the line table.
        for (var i = 0; i < this.innerScripts.length; i++)
        {
            var script = this.innerScripts[i];
            if (script.isValid)  this.addToLineTable(script);
        }
        this.lineMap.complete = true;
    },

    addToLineTable: function(script)
    {
        if (!this.lineMap)
            this.lineMap = {};

        var lineCount = this.getSourceLength();
        if (!lineCount)
            FBTrace.sysout("addToLineTable no lineCount this.compilation_unit_type", this.compilation_unit_type);
        var offset = this.getBaseLineOffset();
        if (FBTrace.DBG_LINETABLE)                                                                                     /*@explore*/
            FBTrace.sysout("lib.SourceFile.addToLineTable script.tag:"+script.tag+" lineCount="+lineCount+" offset="+offset+" for "+this.compilation_unit_type+"\n");  /*@explore*/

        for (var i = 0; i <= lineCount; i++)
        {
            var scriptLineNo = i + script.baseLineNumber;
            var mapLineNo = scriptLineNo - offset;

            if (script.isValid && script.isLineExecutable(scriptLineNo, this.pcmap_type)) // extra isValid test should not be needed.
                this.lineMap[mapLineNo] = script;
                                                                                                                       /*@explore*/
            if (FBTrace.DBG_LINETABLE)                                                                                 /*@explore*/
            {                                                                                                          /*@explore*/
                var pcFromLine = script.lineToPc(scriptLineNo, this.pcmap_type);                                            /*@explore*/
                var lineFromPC = script.pcToLine(pcFromLine, this.pcmap_type);                                              /*@explore*/
                                                                                                                       /*@explore*/
                if (this.lineMap[mapLineNo])                                                                  /*@explore*/
                    FBTrace.sysout("lib.SourceFile.addToLineTable ["+mapLineNo+"]="+this.lineMap[mapLineNo].tag+" for scriptLineNo="+scriptLineNo+" vs "+lineFromPC+"=lineFromPC; lineToPc="+pcFromLine+" with map="+(this.pcmap_type==PCMAP_PRETTYPRINT?"PP":"SOURCE")+"\n"); /*@explore*/
                else                                                                                                   /*@explore*/
                    FBTrace.sysout("lib.SourceFile.addToLineTable not executable scriptLineNo="+scriptLineNo+" vs "+lineFromPC+"=lineFromPC; lineToPc="+pcFromLine+"\n");     /*@explore*/
            }                                                                                                          /*@explore*/
        }
        if (FBTrace.DBG_LINETABLE) FBTrace.sysout("SourceFile.addToLineTable: "+this.toString()+"\n");                 /*@explore*/
    },

    getScriptByLineNumber: function(lineNo)
    {
        if (!this.lineMap || !this.lineMap.complete)
            this.buildLineTable();
        return this.lineMap[lineNo];
    },

    getLineNumberByScript: function(script)
    {
        if (!this.hasLineTable())
            FBTrace.dumpStack("lib.getNestedScriptAnalyzer no linetable TODO!");

        var tag = script.tag;
        for (var i = 1; i < this.sourceLength; i++)
        {
            var mapScript = this.lineMap[i];
            if (mapScript && mapScript.isValid && mapScript.tag == tag)
                return i;
        }
    },

    hasScript: function(script)
    {
        if (this.outerScript && (this.outerScript.tag == script.tag) )
            return true;
        // XXXjjb Don't use indexOf or similar tests that rely on ===, since we are really working with
        // wrappers around jsdIScript, not script themselves.  I guess.

        for (var j = 0; j < this.innerScripts.length; j++)
        {
            if (script.tag == this.innerScripts[j].tag)
                return this.innerScripts[j];
        }
        return false;
    },

    // these objects map JSD's values to correct values
    getScriptAnalyzer: function(script)
    {
        if (this.outerScript && (script.tag == this.outerScript.tag) )
            return new this.OuterScriptAnalyzer(this); // depends on type
        return new this.NestedScriptAnalyzer(this);
    },

    NestedScriptAnalyzer: function(sourceFile)
    {
        this.sourceFile = sourceFile;
    },

    // return.path: group/category label, return.name: item label
    getObjectDescription: function()
    {
        return FBL.splitURLBase(this.href);
    }
}

this.SourceFile.prototype.NestedScriptAnalyzer.prototype =
{
    // Adjust JSD line numbers based on origin of script
    getSourceLineFromFrame: function(context, frame)
    {
        if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("NestedScriptAnalyzer in "+this.sourceFile.compilation_unit_type+": frame.line  - this.sourceFile.getBaseLineOffset()",
             frame.line +" - "+this.sourceFile.getBaseLineOffset());

        return frame.line - (this.sourceFile.getBaseLineOffset());
    },
    // Interpret frame to give fn(args)
    getFunctionDescription: function(script, context, frame)
    {
        var fnc = script.functionObject.getWrappedValue();
        var name = fnc.name;
        if (name ==  "anonymous")
        {
            name = FBL.guessFunctionName(this.sourceFile.href, this.getBaseLineNumberByScript(script), context);
        }

        if (frame)
            var args = FBL.getFunctionArgValues(fnc, frame);
        else
            var args = [];

        return {name: name, args: args};
    },

    // link to source for this script.
    getSourceLinkForScript: function (script)
    {
        if (!this.sourceFile.hasLineTable())
            FBTrace.dumpStack("lib.getNestedScriptAnalyzer no linetable TODO!");
        var line = this.getBaseLineNumberByScript(script);
        return new FBL.SourceLink(this.sourceFile.href, line, "js");
    },

    getBaseLineNumberByScript: function(script)
    {
        return script.baseLineNumber - (this.sourceFile.getBaseLineOffset() - 1);
    }
}

this.addScriptsToSourceFile = function(sourceFile, outerScript, innerScripts)
{
    if (outerScript.isValid)
        sourceFile.addToLineTable(outerScript, outerScript.baseLineNumber);
    if (FBTrace.DBG_SOURCEFILES)                                                                                   /*@explore*/
        FBTrace.sysout("FBL.addScriptsToSourceFile sourcefile="+sourceFile.toString()+"\n");                        /*@explore*/

    // Attach the innerScripts for use later
    if (!sourceFile.innerScripts)
        sourceFile.innerScripts = [];

    while (innerScripts.hasMoreElements())
    {
        sourceFile.innerScripts.push(innerScripts.getNext());
    }
}

//------------
this.EvalLevelSourceFile = function(url, script, eval_expr, sourceLength, innerScriptEnumerator) // ctor
{
    this.href = url;
    this.outerScript = script;
    this.evalExpression = eval_expr;
    this.sourceLength = sourceLength;
    this.pcmap_type = PCMAP_SOURCETEXT;
    this.lineMap = {};
    FBL.addScriptsToSourceFile(this, script, innerScriptEnumerator);
};

this.EvalLevelSourceFile.prototype = new this.SourceFile("eval-level"); // shared prototype

this.EvalLevelSourceFile.prototype.OuterScriptAnalyzer.prototype =
{
    // Adjust JSD line numbers based on origin of script
    getSourceLineFromFrame: function(context, frame)
    {
        return frame.line - this.sourceFile.getBaseLineOffset();
    },
    // Interpret frame to give fn(args)
    getFunctionDescription: function(script, context, frame)
    {
        return {name: "eval", args: [this.evalExpression] };
    },
    getSourceLinkForScript: function (script)
    {
        return new FBL.SourceLink(this.sourceFile.href, 1, "js");
    }
}

this.EvalLevelSourceFile.prototype.getBaseLineOffset = function()
{
    return this.outerScript.baseLineNumber - 1; // baseLineNumber always valid even after jsdIscript isValid false
}

this.EvalLevelSourceFile.prototype.getObjectDescription = function()
{
    if (this.href.kind == "source")
        return FBL.splitURL(this.href);

    if (!this.summary)
    {
        if (this.evalExpression)
            this.summary = FBL.summarizeSourceLineArray(this.evalExpression.substr(0, 240).split('/\r/'));
        else
            this.summary = "null";
    }
    return {path: this.href.replace(/\/eval\/[^\/]+$/, "/eval"), name: this.summary };
}
//------------
this.EventSourceFile = function(url, script, title, source, innerScriptEnumerator)
{
    this.href = url;
    this.outerScript = script;
    this.title = title;
    this.sourceLines = source; // points to the sourceCache lines
    this.sourceLength = source.length;
    this.pcmap_type = PCMAP_PRETTYPRINT;
    this.lineMap = {};

    FBL.addScriptsToSourceFile(this, script, innerScriptEnumerator);
};

this.EventSourceFile.prototype = new this.SourceFile("event"); // prototypical inheritance

this.EventSourceFile.prototype.OuterScriptAnalyzer.prototype =
{
    // Adjust JSD line numbers based on origin of script
    getSourceLineFromFrame: function(context, frame)
    {
        var script = frame.script;
        var line = script.pcToLine(frame.pc, PCMAP_PRETTYPRINT);
        return line - 1;
    },
    // Interpret frame to give fn(args)
    getFunctionDescription: function(script, context, frame)
    {
        var fn = script.functionObject.getWrappedValue();  //?? should be name of?
        if (frame)
            var args = FBL.getFunctionArgValues(fn, frame);
        else
            var args = [];
        return {name: fn, args: args};
    },
    getSourceLinkForScript: function (script)
    {
        return new FBL.SourceLink(this.sourceFile.href, 1, "js");  // XXXjjb why do we need FBL.??
    }
}

this.EventSourceFile.prototype.getBaseLineOffset = function()
{
    return 1;
}

this.summarizeSourceLineArray = function(sourceLines)
{
    var buf  = "";
    for (var i = 0; i < sourceLines.length; i++)
    {
        buf += sourceLines[i].replace(/\s/, " ", "g");
        if (buf.length > 120)
            break;
    }
    return buf.substr(0, 120);
};

this.EventSourceFile.prototype.getObjectDescription = function()
{
    if (!this.summary)
    {
        this.summary = FBL.summarizeSourceLineArray(this.sourceLines);
    }

    return {path: this.href.replace(/\/event\/[^\/]+$/, "/event"), name: this.summary };
}

//-----------
this.FunctionConstructorSourceFile = function(url, script, ctor_expr, sourceLength, innerScriptEnumerator)
{
    this.href = url;
    this.outerScript = script;
    this.evalExpression = eval_expr;
    this.sourceLength = sourceLength;
    this.pcmap_type = PCMAP_SOURCETEXT;
    this.lineMap = {};

    FBL.addScriptsToSourceFile(this, script, innerScriptEnumerator);
}

this.FunctionConstructorSourceFile.prototype = new this.SourceFile("newFunction");

this.FunctionConstructorSourceFile.prototype.OuterScriptAnalyzer.prototype =
{
    // Adjust JSD line numbers based on origin of script
    getSourceLineFromFrame: function(context, frame)
    {
        return frame.line - this.sourceFile.getBaseLineOffset();
    },
    // Interpret frame to give fn(args)
    getFunctionDescription: function(script, context, frame)
    {
        return {name: "new Function", args: [this.evalExpression] };
    },
    getSourceLinkForScript: function (script)
    {
        return new SourceLink(this.sourceFile.href, 1, "js");
    }
}
this.FunctionConstructorSourceFile.prototype.getBaseLineOffset = function()
{
    this.outerScript.baseLineNumber; // always valid
}

//-----------
this.TopLevelSourceFile = function(url, outerScript, sourceLength, innerScriptEnumerator)
{
    this.href = url;
    this.outerScript = outerScript;  // Beware may not be valid after we return!!
    this.sourceLength = sourceLength;
    this.pcmap_type = PCMAP_SOURCETEXT;
    this.lineMap = {};

    FBL.addScriptsToSourceFile(this, outerScript, innerScriptEnumerator);
}

this.TopLevelSourceFile.prototype = new this.SourceFile("top-level");

this.TopLevelSourceFile.prototype.OuterScriptAnalyzer.prototype =
{
    // Adjust JSD line numbers based on origin of script
    getSourceLineFromFrame: function(context, frame)
    {
        return frame.line;
    },
    // Interpret frame to give fn(args)
    getFunctionDescription: function(script, context, frame)
    {
        var file_name = FBL.getFileName(FBL.normalizeURL(script.fileName)); // this is more useful that just "top_level"
        file_name = file_name ? file_name: "__top_level__";
        return {name: file_name, args: []};
    },
    getSourceLinkForScript: function (script)
    {
        return SourceLink(FBL.normalizeURL(script.fileName), script.baseLineNumber, "js")
    }
}

this.TopLevelSourceFile.prototype.getBaseLineOffset = function()
{
    return 0;  // TODO depends on number of script tags https://bugzilla.mozilla.org/show_bug.cgi?id=396568
}
//-------
this.EnumeratedSourceFile = function(context, url) // we don't have the outer script and we delay source load.
{
    this.context = context;  // XXXjjb the context of the enumeration, not useful
    this.href = url;  // may not be outerScript file name, eg this could be an enumerated eval
    this.innerScripts = [];
    this.pcmap_type = PCMAP_SOURCETEXT;
    this.lineMap = {};
}

this.EnumeratedSourceFile.prototype = new this.SourceFile("enumerated");

this.EnumeratedSourceFile.prototype.OuterScriptAnalyzer.prototype =
    this.TopLevelSourceFile.prototype.OuterScriptAnalyzer.prototype;

this.EnumeratedSourceFile.prototype.getBaseLineOffset = function()
{
    // The outer script is gone, that is what the frame.line is relative to?
    return 0;  // TODO
}

this.EnumeratedSourceFile.prototype.getSourceLength = function()
{
    if (!this.sourceLength)
        this.sourceLength = this.context.sourceCache.load(this.href).length;
    return this.sourceLength;
}
//---------
this.NoScriptSourceFile = function(context, url) // Somehow we got the URL, but not the script
{
     this.href = url;  // we know this much
     this.innerScripts = [];
     this.lineMap = {};
     this.lineMap.complete = true;  // that is, we know nothing
}
this.NoScriptSourceFile.prototype = new this.SourceFile("URLOnly");

this.NoScriptSourceFile.prototype.OuterScriptAnalyzer.prototype =
    this.TopLevelSourceFile.prototype.OuterScriptAnalyzer.prototype;

this.NoScriptSourceFile.prototype.getBaseLineOffset = function()
{
    // The outer script is gone, that is what the frame.line is relative to?
    return 0;  // TODO
}

this.NoScriptSourceFile.prototype.getSourceLength = function()
{
    if (!this.sourceLength)
        this.sourceLength = this.context.sourceCache.load(this.href).length;
    return this.sourceLength;
}
//---------

this.ScriptTagSourceFile = function(context, url, scriptTagNumber) // we don't have the outer script and we delay source load
{
    this.context = context;
    this.href = url;  // we know this is not an eval
    this.scriptTagNumber = scriptTagNumber;
    this.innerScripts = [];
    this.pcmap_type = PCMAP_SOURCETEXT;
    this.lineMap = {};
}

this.ScriptTagSourceFile.prototype = new this.SourceFile("scriptTag");

this.ScriptTagSourceFile.prototype.OuterScriptAnalyzer =
    this.TopLevelSourceFile.prototype.OuterScriptAnalyzer;

this.ScriptTagSourceFile.prototype.getBaseLineOffset = function()
{
    return 0;
}

this.ScriptTagSourceFile.prototype.getSourceLength = function()
{
    return this.context.sourceCache.load(this.href).length;
}

this.ScriptTagSourceFile.prototype.cache = function(context)
{
    return context.sourceCache.load(this.href);
},

//-------------------
this.getSourceFileByScript = function(context, script)
{
    // Other algorithms are possible:
    //   We could store an index, context.sourceFileByTag
    //   Or we could build a tree keyed by url, with SpiderMonkey script.fileNames at the top and our urls below
    var lucky = context.sourceFileMap[script.fileName];  // we won't be lucky for file:/ urls, no normalizeURL applied
    if (FBTrace.DBG_SOURCEFILES && lucky) FBTrace.sysout("getSourceFileByScript trying to be lucky for "+script.tag, " in "+lucky);
    if (lucky && lucky.hasScript(script))
        return lucky;

    if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("getSourceFileByScript looking for "+script.tag, " in "+context.window.location); /*@explore*/

    for (var url in context.sourceFileMap)
    {
        var sourceFile = context.sourceFileMap[url];
        if (sourceFile.hasScript(script))
            return sourceFile;
    }
};

this.getScriptAnalyzer = function(context, script)
{
    var sourceFile = this.getSourceFileByScript(context, script);
    if (FBTrace.DBG_STACK) /*@explore*/
        FBTrace.sysout("getScriptAnalyzer finds sourceFile: ", sourceFile); /*@explore*/
    if (sourceFile)
    {
        var analyzer = sourceFile.getScriptAnalyzer(script);
        if (FBTrace.DBG_STACK) /*@explore*/
            FBTrace.sysout("getScriptAnalyzer finds analyzer: ", analyzer);  /*@explore*/

        return analyzer;
    }
};

this.getSourceFileAndLineByScript= function(context, script, frame)
{
    var sourceFile = FBL.getSourceFileByScript(FirebugContext, script);
    if (sourceFile)
    {
        var analyzer = sourceFile.getScriptAnalyzer(script);
        if (analyzer)
            var line = frame ? analyzer.getSourceLineFromFrame(context, frame) : analyzer.getBaseLineNumberByScript(script);
        else
            var line = 0;

        return { sourceFile: sourceFile, lineNo: line };
    }
};

this.guessEnclosingFunctionName = function(url, line)
{
    var sourceFile = this.context.sourceFileMap[url];
    if (sourceFile)
    {
        var script = sourceFile.getScriptByLineNumber(line);
        var analyzer = sourceFile.getScriptAnalyzer(script);
         line = analyzer.getBaseLineNumberByScript(script);
    }
     return guessFunctionName(url, line-1, context);
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

this.SourceText = function(lines, owner)
{
    this.lines = lines;
    this.owner = owner;
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

this.StackTrace = function()
{
    this.frames = [];
};

this.StackTrace.prototype =
{
    toString: function()
    {
        var trace = "<top>\n";
        for (var i = 0; i < this.frames.length; i++)
        {
            trace += "[" + i + "]"+ this.frames[i]+"\n";
        }
        trace += "<bottom>\n";
        return trace;
    },
    reverse: function()
    {
        this.frames.reverse();
        return this;
    },

    destroy: function()
    {
        for (var i = 0; i < this.frames.length; i++)
        {
            this.frames[i].destroy();
        }
        if (FBTrace.DBG_STACK) FBTrace.sysout("lib.StackTrace destroy "+this.uid+"\n");                                /*@explore*/
    }
};

this.traceToString = function(trace)                                                                                          /*@explore*/
{                                                                                                                      /*@explore*/
    var str = "<top>";                                                                                                 /*@explore*/
    for(var i = 0; i < trace.frames.length; i++)                                                                       /*@explore*/
        str += "\n" + trace.frames[i];                                                                                 /*@explore*/
    str += "\n<bottom>";                                                                                               /*@explore*/
    return str;                                                                                                        /*@explore*/
}
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

this.StackFrame = function(context, fn, script, href, lineNo, args, pc)
{
    this.context = context;
    this.fn = fn;
    this.script = script;
    this.href = href;
    this.lineNo = lineNo;
    this.args = args;
    this.flags = script.flags;
    this.pc = pc;
};

this.StackFrame.prototype =
{
    toString: function()
    {
        // XXXjjb analyze args and fn?
        return "("+this.flags+")"+this.href+":"+this.script.baseLineNumber+"-"
                  +(this.script.baseLineNumber+this.script.lineExtent)+"@"+this.lineNo;
    },
    destroy: function()
    {
        if (FBTrace.DBG_STACK) FBTrace.sysout("StackFrame destroyed:"+this.uid+"\n");                                  /*@explore*/
        this.script = null;
        this.fn = null;
    },
    signature: function()
    {
        return this.script.tag +"." + this.pc;
    }
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

this.Property = function(object, name)
{
    this.object = object;
    this.name = name;

    this.getObject = function()
    {
        return object[name];
    };
};

this.ErrorCopy = function(message)
{
    this.message = message;
};

function EventCopy(event)
{
    // Because event objects are destroyed arbitrarily by Gecko, we must make a copy of them to
    // represent them long term in the inspector.
    for (var name in event)
    {
        try {
            this[name] = event[name];
        } catch (exc) { }
    }
}

this.EventCopy = EventCopy;

// ************************************************************************************************
// DOM Constants

this.getDOMMembers = function(object)
{
    if (!domMemberCache)
    {
        domMemberCache = {};

        for (var name in domMemberMap)
        {
            var builtins = domMemberMap[name];
            var cache = domMemberCache[name] = {};

            for (var i = 0; i < builtins.length; ++i)
                cache[builtins[i]] = i;
        }
    }

    if (object instanceof Window)
        { return domMemberCache.Window; }
    else if (object instanceof Document || object instanceof XMLDocument)
        { return domMemberCache.Document; }
    else if (object instanceof Location)
        { return domMemberCache.Location; }
    else if (object instanceof HTMLImageElement)
        { return domMemberCache.HTMLImageElement; }
    else if (object instanceof HTMLAnchorElement)
        { return domMemberCache.HTMLAnchorElement; }
    else if (object instanceof HTMLInputElement)
        { return domMemberCache.HTMLInputElement; }
    else if (object instanceof HTMLButtonElement)
        { return domMemberCache.HTMLButtonElement; }
    else if (object instanceof HTMLFormElement)
        { return domMemberCache.HTMLFormElement; }
    else if (object instanceof HTMLBodyElement)
        { return domMemberCache.HTMLBodyElement; }
    else if (object instanceof HTMLHtmlElement)
        { return domMemberCache.HTMLHtmlElement; }
    else if (object instanceof HTMLScriptElement)
        { return domMemberCache.HTMLScriptElement; }
    else if (object instanceof HTMLTableElement)
        { return domMemberCache.HTMLTableElement; }
    else if (object instanceof HTMLTableRowElement)
        { return domMemberCache.HTMLTableRowElement; }
    else if (object instanceof HTMLTableCellElement)
        { return domMemberCache.HTMLTableCellElement; }
    else if (object instanceof HTMLIFrameElement)
        { return domMemberCache.HTMLIFrameElement; }
    else if (object instanceof SVGSVGElement)
        { return domMemberCache.SVGSVGElement; }
    else if (object instanceof SVGElement)
        { return domMemberCache.SVGElement; }
    else if (object instanceof Element)
        { return domMemberCache.Element; }
    else if (object instanceof Text || object instanceof CDATASection)
        { return domMemberCache.Text; }
    else if (object instanceof Attr)
        { return domMemberCache.Attr; }
    else if (object instanceof Node)
        { return domMemberCache.Node; }
    else if (object instanceof Event || object instanceof EventCopy)
        { return domMemberCache.Event; }
    else
        return {};
};

this.isDOMMember = function(object, propName)
{
    var members = this.getDOMMembers(object);
    return members && propName in members;
};

var domMemberCache = null;
var domMemberMap = {};

domMemberMap.Window =
[
    "document",
    "frameElement",

    "innerWidth",
    "innerHeight",
    "outerWidth",
    "outerHeight",
    "screenX",
    "screenY",
    "pageXOffset",
    "pageYOffset",
    "scrollX",
    "scrollY",
    "scrollMaxX",
    "scrollMaxY",

    "status",
    "defaultStatus",

    "parent",
    "opener",
    "top",
    "window",
    "content",
    "self",

    "location",
    "history",
    "frames",
    "navigator",
    "screen",
    "menubar",
    "toolbar",
    "locationbar",
    "personalbar",
    "statusbar",
    "directories",
    "scrollbars",
    "fullScreen",
    "netscape",
    "java",
    "console",
    "Components",
    "controllers",
    "closed",
    "crypto",
    "pkcs11",

    "name",
    "property",
    "length",

    "sessionStorage",
    "globalStorage",

    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
    "addEventListener",
    "removeEventListener",
    "dispatchEvent",
    "getComputedStyle",
    "captureEvents",
    "releaseEvents",
    "routeEvent",
    "enableExternalCapture",
    "disableExternalCapture",
    "moveTo",
    "moveBy",
    "resizeTo",
    "resizeBy",
    "scroll",
    "scrollTo",
    "scrollBy",
    "scrollByLines",
    "scrollByPages",
    "sizeToContent",
    "setResizable",
    "getSelection",
    "open",
    "openDialog",
    "close",
    "alert",
    "confirm",
    "prompt",
    "dump",
    "focus",
    "blur",
    "find",
    "back",
    "forward",
    "home",
    "stop",
    "print",
    "atob",
    "btoa",
    "updateCommands",
    "XPCNativeWrapper",
    "GeckoActiveXObject"
];

domMemberMap.Location =
[
    "href",
    "protocol",
    "host",
    "hostname",
    "port",
    "pathname",
    "search",
    "hash",

    "assign",
    "reload",
    "replace"
];

domMemberMap.Node =
[
    "id",
    "className",

    "nodeType",
    "tagName",
    "nodeName",
    "localName",
    "prefix",
    "namespaceURI",
    "nodeValue",

    "ownerDocument",
    "parentNode",
    "offsetParent",
    "nextSibling",
    "previousSibling",
    "firstChild",
    "lastChild",
    "childNodes",
    "attributes",

    "dir",
    "baseURI",
    "textContent",
    "innerHTML",

    "addEventListener",
    "removeEventListener",
    "dispatchEvent",
    "cloneNode",
    "appendChild",
    "insertBefore",
    "replaceChild",
    "removeChild",
    "compareDocumentPosition",
    "hasAttributes",
    "hasChildNodes",
    "lookupNamespaceURI",
    "lookupPrefix",
    "normalize",
    "isDefaultNamespace",
    "isEqualNode",
    "isSameNode",
    "isSupported",
    "getFeature",
    "getUserData",
    "setUserData"
];

domMemberMap.Document = extendArray(domMemberMap.Node,
[
    "documentElement",
    "body",
    "title",
    "location",
    "referrer",
    "cookie",
    "contentType",
    "lastModified",
    "characterSet",
    "inputEncoding",
    "xmlEncoding",
    "xmlStandalone",
    "xmlVersion",
    "strictErrorChecking",
    "documentURI",
    "URL",

    "defaultView",
    "doctype",
    "implementation",
    "styleSheets",
    "images",
    "links",
    "forms",
    "anchors",
    "embeds",
    "plugins",
    "applets",

    "width",
    "height",

    "designMode",
    "compatMode",
    "async",
    "preferredStylesheetSet",

    "alinkColor",
    "linkColor",
    "vlinkColor",
    "bgColor",
    "fgColor",
    "domain",

    "addEventListener",
    "removeEventListener",
    "dispatchEvent",
    "captureEvents",
    "releaseEvents",
    "routeEvent",
    "clear",
    "open",
    "close",
    "execCommand",
    "execCommandShowHelp",
    "getElementsByName",
    "getSelection",
    "queryCommandEnabled",
    "queryCommandIndeterm",
    "queryCommandState",
    "queryCommandSupported",
    "queryCommandText",
    "queryCommandValue",
    "write",
    "writeln",
    "adoptNode",
    "appendChild",
    "removeChild",
    "renameNode",
    "cloneNode",
    "compareDocumentPosition",
    "createAttribute",
    "createAttributeNS",
    "createCDATASection",
    "createComment",
    "createDocumentFragment",
    "createElement",
    "createElementNS",
    "createEntityReference",
    "createEvent",
    "createExpression",
    "createNSResolver",
    "createNodeIterator",
    "createProcessingInstruction",
    "createRange",
    "createTextNode",
    "createTreeWalker",
    "domConfig",
    "evaluate",
    "evaluateFIXptr",
    "evaluateXPointer",
    "getAnonymousElementByAttribute",
    "getAnonymousNodes",
    "addBinding",
    "removeBinding",
    "getBindingParent",
    "getBoxObjectFor",
    "setBoxObjectFor",
    "getElementById",
    "getElementsByTagName",
    "getElementsByTagNameNS",
    "hasAttributes",
    "hasChildNodes",
    "importNode",
    "insertBefore",
    "isDefaultNamespace",
    "isEqualNode",
    "isSameNode",
    "isSupported",
    "load",
    "loadBindingDocument",
    "lookupNamespaceURI",
    "lookupPrefix",
    "normalize",
    "normalizeDocument",
    "getFeature",
    "getUserData",
    "setUserData"
]);

domMemberMap.Element = extendArray(domMemberMap.Node,
[
    "clientWidth",
    "clientHeight",
    "offsetLeft",
    "offsetTop",
    "offsetWidth",
    "offsetHeight",
    "scrollLeft",
    "scrollTop",
    "scrollWidth",
    "scrollHeight",

    "style",

    "tabIndex",
    "title",
    "lang",
    "align",
    "spellcheck",

    "addEventListener",
    "removeEventListener",
    "dispatchEvent",
    "focus",
    "blur",
    "cloneNode",
    "appendChild",
    "insertBefore",
    "replaceChild",
    "removeChild",
    "compareDocumentPosition",
    "getElementsByTagName",
    "getElementsByTagNameNS",
    "getAttribute",
    "getAttributeNS",
    "getAttributeNode",
    "getAttributeNodeNS",
    "setAttribute",
    "setAttributeNS",
    "setAttributeNode",
    "setAttributeNodeNS",
    "removeAttribute",
    "removeAttributeNS",
    "removeAttributeNode",
    "hasAttribute",
    "hasAttributeNS",
    "hasAttributes",
    "hasChildNodes",
    "lookupNamespaceURI",
    "lookupPrefix",
    "normalize",
    "isDefaultNamespace",
    "isEqualNode",
    "isSameNode",
    "isSupported",
    "getFeature",
    "getUserData",
    "setUserData"
]);

domMemberMap.SVGElement = extendArray(domMemberMap.Element,
[
    "x",
    "y",
    "width",
    "height",
    "rx",
    "ry",
    "transform",
    "href",

    "ownerSVGElement",
    "viewportElement",
    "farthestViewportElement",
    "nearestViewportElement",

    "getBBox",
    "getCTM",
    "getScreenCTM",
    "getTransformToElement",
    "getPresentationAttribute",
    "preserveAspectRatio"
]);

domMemberMap.SVGSVGElement = extendArray(domMemberMap.Element,
[
    "x",
    "y",
    "width",
    "height",
    "rx",
    "ry",
    "transform",

    "viewBox",
    "viewport",
    "currentView",
    "useCurrentView",
    "pixelUnitToMillimeterX",
    "pixelUnitToMillimeterY",
    "screenPixelToMillimeterX",
    "screenPixelToMillimeterY",
    "currentScale",
    "currentTranslate",
    "zoomAndPan",

    "ownerSVGElement",
    "viewportElement",
    "farthestViewportElement",
    "nearestViewportElement",
    "contentScriptType",
    "contentStyleType",

    "getBBox",
    "getCTM",
    "getScreenCTM",
    "getTransformToElement",
    "getEnclosureList",
    "getIntersectionList",
    "getViewboxToViewportTransform",
    "getPresentationAttribute",
    "getElementById",
    "checkEnclosure",
    "checkIntersection",
    "createSVGAngle",
    "createSVGLength",
    "createSVGMatrix",
    "createSVGNumber",
    "createSVGPoint",
    "createSVGRect",
    "createSVGString",
    "createSVGTransform",
    "createSVGTransformFromMatrix",
    "deSelectAll",
    "preserveAspectRatio",
    "forceRedraw",
    "suspendRedraw",
    "unsuspendRedraw",
    "unsuspendRedrawAll",
    "getCurrentTime",
    "setCurrentTime",
    "animationsPaused",
    "pauseAnimations",
    "unpauseAnimations"
]);

domMemberMap.HTMLImageElement = extendArray(domMemberMap.Element,
[
    "src",
    "naturalWidth",
    "naturalHeight",
    "width",
    "height",
    "x",
    "y",
    "name",
    "alt",
    "longDesc",
    "lowsrc",
    "border",
    "complete",
    "hspace",
    "vspace",
    "isMap",
    "useMap",
]);

domMemberMap.HTMLAnchorElement = extendArray(domMemberMap.Element,
[
    "name",
    "target",
    "accessKey",
    "href",
    "protocol",
    "host",
    "hostname",
    "port",
    "pathname",
    "search",
    "hash",
    "hreflang",
    "coords",
    "shape",
    "text",
    "type",
    "rel",
    "rev",
    "charset"
]);

domMemberMap.HTMLIFrameElement = extendArray(domMemberMap.Element,
[
    "contentDocument",
    "contentWindow",
    "frameBorder",
    "height",
    "longDesc",
    "marginHeight",
    "marginWidth",
    "name",
    "scrolling",
    "src",
    "width"
]);

domMemberMap.HTMLTableElement = extendArray(domMemberMap.Element,
[
    "bgColor",
    "border",
    "caption",
    "cellPadding",
    "cellSpacing",
    "frame",
    "rows",
    "rules",
    "summary",
    "tBodies",
    "tFoot",
    "tHead",
    "width",

    "createCaption",
    "createTFoot",
    "createTHead",
    "deleteCaption",
    "deleteRow",
    "deleteTFoot",
    "deleteTHead",
    "insertRow"
]);

domMemberMap.HTMLTableRowElement = extendArray(domMemberMap.Element,
[
    "bgColor",
    "cells",
    "ch",
    "chOff",
    "rowIndex",
    "sectionRowIndex",
    "vAlign",

    "deleteCell",
    "insertCell"
]);

domMemberMap.HTMLTableCellElement = extendArray(domMemberMap.Element,
[
    "abbr",
    "axis",
    "bgColor",
    "cellIndex",
    "ch",
    "chOff",
    "colSpan",
    "headers",
    "height",
    "noWrap",
    "rowSpan",
    "scope",
    "vAlign",
    "width"

]);

domMemberMap.HTMLScriptElement = extendArray(domMemberMap.Element,
[
    "src"
]);

domMemberMap.HTMLButtonElement = extendArray(domMemberMap.Element,
[
    "accessKey",
    "disabled",
    "form",
    "name",
    "type",
    "value",

    "click"
]);

domMemberMap.HTMLInputElement = extendArray(domMemberMap.Element,
[
    "type",
    "value",
    "checked",
    "accept",
    "accessKey",
    "alt",
    "controllers",
    "defaultChecked",
    "defaultValue",
    "disabled",
    "form",
    "maxLength",
    "name",
    "readOnly",
    "selectionEnd",
    "selectionStart",
    "size",
    "src",
    "textLength",
    "useMap",

    "click",
    "select",
    "setSelectionRange"
]);

domMemberMap.HTMLFormElement = extendArray(domMemberMap.Element,
[
    "acceptCharset",
    "action",
    "author",
    "elements",
    "encoding",
    "enctype",
    "entry_id",
    "length",
    "method",
    "name",
    "post",
    "target",
    "text",
    "url",

    "reset",
    "submit"
]);

domMemberMap.HTMLBodyElement = extendArray(domMemberMap.Element,
[
    "aLink",
    "background",
    "bgColor",
    "link",
    "text",
    "vLink"
]);

domMemberMap.HTMLHtmlElement = extendArray(domMemberMap.Element,
[
    "version"
]);

domMemberMap.Text = extendArray(domMemberMap.Node,
[
    "data",
    "length",

    "appendData",
    "deleteData",
    "insertData",
    "replaceData",
    "splitText",
    "substringData"
]);

domMemberMap.Attr = extendArray(domMemberMap.Node,
[
    "name",
    "value",
    "specified",
    "ownerElement"
]);

domMemberMap.Event =
[
    "type",
    "target",
    "currentTarget",
    "originalTarget",
    "explicitOriginalTarget",
    "relatedTarget",
    "rangeParent",
    "rangeOffset",
    "view",

    "keyCode",
    "charCode",
    "screenX",
    "screenY",
    "clientX",
    "clientY",
    "layerX",
    "layerY",
    "pageX",
    "pageY",

    "detail",
    "button",
    "which",
    "ctrlKey",
    "shiftKey",
    "altKey",
    "metaKey",

    "eventPhase",
    "timeStamp",
    "bubbles",
    "cancelable",
    "cancelBubble",

    "isTrusted",
    "isChar",

    "getPreventDefault",
    "initEvent",
    "initMouseEvent",
    "initKeyEvent",
    "initUIEvent",
    "preventBubble",
    "preventCapture",
    "preventDefault",
    "stopPropagation"
];

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

this.domConstantMap =
{
    "ELEMENT_NODE": 1,
    "ATTRIBUTE_NODE": 1,
    "TEXT_NODE": 1,
    "CDATA_SECTION_NODE": 1,
    "ENTITY_REFERENCE_NODE": 1,
    "ENTITY_NODE": 1,
    "PROCESSING_INSTRUCTION_NODE": 1,
    "COMMENT_NODE": 1,
    "DOCUMENT_NODE": 1,
    "DOCUMENT_TYPE_NODE": 1,
    "DOCUMENT_FRAGMENT_NODE": 1,
    "NOTATION_NODE": 1,

    "DOCUMENT_POSITION_DISCONNECTED": 1,
    "DOCUMENT_POSITION_PRECEDING": 1,
    "DOCUMENT_POSITION_FOLLOWING": 1,
    "DOCUMENT_POSITION_CONTAINS": 1,
    "DOCUMENT_POSITION_CONTAINED_BY": 1,
    "DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC": 1,

    "UNKNOWN_RULE": 1,
    "STYLE_RULE": 1,
    "CHARSET_RULE": 1,
    "IMPORT_RULE": 1,
    "MEDIA_RULE": 1,
    "FONT_FACE_RULE": 1,
    "PAGE_RULE": 1,

    "CAPTURING_PHASE": 1,
    "AT_TARGET": 1,
    "BUBBLING_PHASE": 1,

    "SCROLL_PAGE_UP": 1,
    "SCROLL_PAGE_DOWN": 1,

    "MOUSEUP": 1,
    "MOUSEDOWN": 1,
    "MOUSEOVER": 1,
    "MOUSEOUT": 1,
    "MOUSEMOVE": 1,
    "MOUSEDRAG": 1,
    "CLICK": 1,
    "DBLCLICK": 1,
    "KEYDOWN": 1,
    "KEYUP": 1,
    "KEYPRESS": 1,
    "DRAGDROP": 1,
    "FOCUS": 1,
    "BLUR": 1,
    "SELECT": 1,
    "CHANGE": 1,
    "RESET": 1,
    "SUBMIT": 1,
    "SCROLL": 1,
    "LOAD": 1,
    "UNLOAD": 1,
    "XFER_DONE": 1,
    "ABORT": 1,
    "ERROR": 1,
    "LOCATE": 1,
    "MOVE": 1,
    "RESIZE": 1,
    "FORWARD": 1,
    "HELP": 1,
    "BACK": 1,
    "TEXT": 1,

    "ALT_MASK": 1,
    "CONTROL_MASK": 1,
    "SHIFT_MASK": 1,
    "META_MASK": 1,

    "DOM_VK_TAB": 1,
    "DOM_VK_PAGE_UP": 1,
    "DOM_VK_PAGE_DOWN": 1,
    "DOM_VK_UP": 1,
    "DOM_VK_DOWN": 1,
    "DOM_VK_LEFT": 1,
    "DOM_VK_RIGHT": 1,
    "DOM_VK_CANCEL": 1,
    "DOM_VK_HELP": 1,
    "DOM_VK_BACK_SPACE": 1,
    "DOM_VK_CLEAR": 1,
    "DOM_VK_RETURN": 1,
    "DOM_VK_ENTER": 1,
    "DOM_VK_SHIFT": 1,
    "DOM_VK_CONTROL": 1,
    "DOM_VK_ALT": 1,
    "DOM_VK_PAUSE": 1,
    "DOM_VK_CAPS_LOCK": 1,
    "DOM_VK_ESCAPE": 1,
    "DOM_VK_SPACE": 1,
    "DOM_VK_END": 1,
    "DOM_VK_HOME": 1,
    "DOM_VK_PRINTSCREEN": 1,
    "DOM_VK_INSERT": 1,
    "DOM_VK_DELETE": 1,
    "DOM_VK_0": 1,
    "DOM_VK_1": 1,
    "DOM_VK_2": 1,
    "DOM_VK_3": 1,
    "DOM_VK_4": 1,
    "DOM_VK_5": 1,
    "DOM_VK_6": 1,
    "DOM_VK_7": 1,
    "DOM_VK_8": 1,
    "DOM_VK_9": 1,
    "DOM_VK_SEMICOLON": 1,
    "DOM_VK_EQUALS": 1,
    "DOM_VK_A": 1,
    "DOM_VK_B": 1,
    "DOM_VK_C": 1,
    "DOM_VK_D": 1,
    "DOM_VK_E": 1,
    "DOM_VK_F": 1,
    "DOM_VK_G": 1,
    "DOM_VK_H": 1,
    "DOM_VK_I": 1,
    "DOM_VK_J": 1,
    "DOM_VK_K": 1,
    "DOM_VK_L": 1,
    "DOM_VK_M": 1,
    "DOM_VK_N": 1,
    "DOM_VK_O": 1,
    "DOM_VK_P": 1,
    "DOM_VK_Q": 1,
    "DOM_VK_R": 1,
    "DOM_VK_S": 1,
    "DOM_VK_T": 1,
    "DOM_VK_U": 1,
    "DOM_VK_V": 1,
    "DOM_VK_W": 1,
    "DOM_VK_X": 1,
    "DOM_VK_Y": 1,
    "DOM_VK_Z": 1,
    "DOM_VK_CONTEXT_MENU": 1,
    "DOM_VK_NUMPAD0": 1,
    "DOM_VK_NUMPAD1": 1,
    "DOM_VK_NUMPAD2": 1,
    "DOM_VK_NUMPAD3": 1,
    "DOM_VK_NUMPAD4": 1,
    "DOM_VK_NUMPAD5": 1,
    "DOM_VK_NUMPAD6": 1,
    "DOM_VK_NUMPAD7": 1,
    "DOM_VK_NUMPAD8": 1,
    "DOM_VK_NUMPAD9": 1,
    "DOM_VK_MULTIPLY": 1,
    "DOM_VK_ADD": 1,
    "DOM_VK_SEPARATOR": 1,
    "DOM_VK_SUBTRACT": 1,
    "DOM_VK_DECIMAL": 1,
    "DOM_VK_DIVIDE": 1,
    "DOM_VK_F1": 1,
    "DOM_VK_F2": 1,
    "DOM_VK_F3": 1,
    "DOM_VK_F4": 1,
    "DOM_VK_F5": 1,
    "DOM_VK_F6": 1,
    "DOM_VK_F7": 1,
    "DOM_VK_F8": 1,
    "DOM_VK_F9": 1,
    "DOM_VK_F10": 1,
    "DOM_VK_F11": 1,
    "DOM_VK_F12": 1,
    "DOM_VK_F13": 1,
    "DOM_VK_F14": 1,
    "DOM_VK_F15": 1,
    "DOM_VK_F16": 1,
    "DOM_VK_F17": 1,
    "DOM_VK_F18": 1,
    "DOM_VK_F19": 1,
    "DOM_VK_F20": 1,
    "DOM_VK_F21": 1,
    "DOM_VK_F22": 1,
    "DOM_VK_F23": 1,
    "DOM_VK_F24": 1,
    "DOM_VK_NUM_LOCK": 1,
    "DOM_VK_SCROLL_LOCK": 1,
    "DOM_VK_COMMA": 1,
    "DOM_VK_PERIOD": 1,
    "DOM_VK_SLASH": 1,
    "DOM_VK_BACK_QUOTE": 1,
    "DOM_VK_OPEN_BRACKET": 1,
    "DOM_VK_BACK_SLASH": 1,
    "DOM_VK_CLOSE_BRACKET": 1,
    "DOM_VK_QUOTE": 1,
    "DOM_VK_META": 1,

    "SVG_ZOOMANDPAN_DISABLE": 1,
    "SVG_ZOOMANDPAN_MAGNIFY": 1,
    "SVG_ZOOMANDPAN_UNKNOWN": 1
};

this.cssInfo =
{
    "background": ["bgRepeat", "bgAttachment", "bgPosition", "color", "systemColor", "none"],
    "background-attachment": ["bgAttachment"],
    "background-color": ["color", "systemColor"],
    "background-image": ["none"],
    "background-position": ["bgPosition"],
    "background-repeat": ["bgRepeat"],

    "border": ["borderStyle", "thickness", "color", "systemColor", "none"],
    "border-top": ["borderStyle", "borderCollapse", "color", "systemColor", "none"],
    "border-right": ["borderStyle", "borderCollapse", "color", "systemColor", "none"],
    "border-bottom": ["borderStyle", "borderCollapse", "color", "systemColor", "none"],
    "border-left": ["borderStyle", "borderCollapse", "color", "systemColor", "none"],
    "border-collapse": ["borderCollapse"],
    "border-color": ["color", "systemColor"],
    "border-top-color": ["color", "systemColor"],
    "border-right-color": ["color", "systemColor"],
    "border-bottom-color": ["color", "systemColor"],
    "border-left-color": ["color", "systemColor"],
    "border-spacing": [],
    "border-style": ["borderStyle"],
    "border-top-style": ["borderStyle"],
    "border-right-style": ["borderStyle"],
    "border-bottom-style": ["borderStyle"],
    "border-left-style": ["borderStyle"],
    "border-width": ["thickness"],
    "border-top-width": ["thickness"],
    "border-right-width": ["thickness"],
    "border-bottom-width": ["thickness"],
    "border-left-width": ["thickness"],

    "bottom": ["auto"],
    "caption-side": ["captionSide"],
    "clear": ["clear", "none"],
    "clip": ["auto"],
    "color": ["color", "systemColor"],
    "content": ["content"],
    "counter-increment": ["none"],
    "counter-reset": ["none"],
    "cursor": ["cursor", "none"],
    "direction": ["direction"],
    "display": ["display", "none"],
    "empty-cells": [],
    "float": ["float", "none"],
    "font": ["fontStyle", "fontVariant", "fontWeight", "fontFamily"],

    "font-family": ["fontFamily"],
    "font-size": ["fontSize"],
    "font-size-adjust": [],
    "font-stretch": [],
    "font-style": ["fontStyle"],
    "font-variant": ["fontVariant"],
    "font-weight": ["fontWeight"],

    "height": ["auto"],
    "left": ["auto"],
    "letter-spacing": [],
    "line-height": [],

    "list-style": ["listStyleType", "listStylePosition", "none"],
    "list-style-image": ["none"],
    "list-style-position": ["listStylePosition"],
    "list-style-type": ["listStyleType", "none"],

    "margin": [],
    "margin-top": [],
    "margin-right": [],
    "margin-bottom": [],
    "margin-left": [],

    "marker-offset": ["auto"],
    "min-height": ["none"],
    "max-height": ["none"],
    "min-width": ["none"],
    "max-width": ["none"],

    "outline": ["borderStyle", "color", "systemColor", "none"],
    "outline-color": ["color", "systemColor"],
    "outline-style": ["borderStyle"],
    "outline-width": [],

    "overflow": ["overflow", "auto"],
    "overflow-x": ["overflow", "auto"],
    "overflow-y": ["overflow", "auto"],

    "padding": [],
    "padding-top": [],
    "padding-right": [],
    "padding-bottom": [],
    "padding-left": [],

    "position": ["position"],
    "quotes": ["none"],
    "right": ["auto"],
    "table-layout": ["tableLayout", "auto"],
    "text-align": ["textAlign"],
    "text-decoration": ["textDecoration", "none"],
    "text-indent": [],
    "text-shadow": [],
    "text-transform": ["textTransform", "none"],
    "top": ["auto"],
    "unicode-bidi": [],
    "vertical-align": ["verticalAlign"],
    "white-space": ["whiteSpace"],
    "width": ["auto"],
    "word-spacing": [],
    "z-index": [],

    "-moz-appearance": ["mozAppearance"],
    "-moz-border-radius": [],
    "-moz-border-radius-bottomleft": [],
    "-moz-border-radius-bottomright": [],
    "-moz-border-radius-topleft": [],
    "-moz-border-radius-topright": [],
    "-moz-border-top-colors": ["color", "systemColor"],
    "-moz-border-right-colors": ["color", "systemColor"],
    "-moz-border-bottom-colors": ["color", "systemColor"],
    "-moz-border-left-colors": ["color", "systemColor"],
    "-moz-box-align": ["mozBoxAlign"],
    "-moz-box-direction": ["mozBoxDirection"],
    "-moz-box-flex": [],
    "-moz-box-ordinal-group": [],
    "-moz-box-orient": ["mozBoxOrient"],
    "-moz-box-pack": ["mozBoxPack"],
    "-moz-box-sizing": ["mozBoxSizing"],
    "-moz-opacity": [],
    "-moz-user-focus": ["userFocus", "none"],
    "-moz-user-input": ["userInput"],
    "-moz-user-modify": [],
    "-moz-user-select": ["userSelect", "none"],
    "-moz-background-clip": [],
    "-moz-background-inline-policy": [],
    "-moz-background-origin": [],
    "-moz-binding": [],
    "-moz-column-count": [],
    "-moz-column-gap": [],
    "-moz-column-width": [],
    "-moz-image-region": []
};

this.inheritedStyleNames =
{
    "border-collapse": 1,
    "border-spacing": 1,
    "border-style": 1,
    "caption-side": 1,
    "color": 1,
    "cursor": 1,
    "direction": 1,
    "empty-cells": 1,
    "font": 1,
    "font-family": 1,
    "font-size-adjust": 1,
    "font-size": 1,
    "font-style": 1,
    "font-variant": 1,
    "font-weight": 1,
    "letter-spacing": 1,
    "line-height": 1,
    "list-style": 1,
    "list-style-image": 1,
    "list-style-position": 1,
    "list-style-type": 1,
    "quotes": 1,
    "text-align": 1,
    "text-decoration": 1,
    "text-indent": 1,
    "text-shadow": 1,
    "text-transform": 1,
    "white-space": 1,
    "word-spacing": 1
};

this.cssKeywords =
{
    "appearance":
    [
        "button",
        "button-small",
        "checkbox",
        "checkbox-container",
        "checkbox-small",
        "dialog",
        "listbox",
        "menuitem",
        "menulist",
        "menulist-button",
        "menulist-textfield",
        "menupopup",
        "progressbar",
        "radio",
        "radio-container",
        "radio-small",
        "resizer",
        "scrollbar",
        "scrollbarbutton-down",
        "scrollbarbutton-left",
        "scrollbarbutton-right",
        "scrollbarbutton-up",
        "scrollbartrack-horizontal",
        "scrollbartrack-vertical",
        "separator",
        "statusbar",
        "tab",
        "tab-left-edge",
        "tabpanels",
        "textfield",
        "toolbar",
        "toolbarbutton",
        "toolbox",
        "tooltip",
        "treeheadercell",
        "treeheadersortarrow",
        "treeitem",
        "treetwisty",
        "treetwistyopen",
        "treeview",
        "window"
    ],

    "systemColor":
    [
        "ActiveBorder",
        "ActiveCaption",
        "AppWorkspace",
        "Background",
        "ButtonFace",
        "ButtonHighlight",
        "ButtonShadow",
        "ButtonText",
        "CaptionText",
        "GrayText",
        "Highlight",
        "HighlightText",
        "InactiveBorder",
        "InactiveCaption",
        "InactiveCaptionText",
        "InfoBackground",
        "InfoText",
        "Menu",
        "MenuText",
        "Scrollbar",
        "ThreeDDarkShadow",
        "ThreeDFace",
        "ThreeDHighlight",
        "ThreeDLightShadow",
        "ThreeDShadow",
        "Window",
        "WindowFrame",
        "WindowText",
        "-moz-field",
        "-moz-fieldtext",
        "-moz-workspace",
        "-moz-visitedhyperlinktext",
        "-moz-use-text-color"
    ],

    "color":
    [
        "AliceBlue",
        "AntiqueWhite",
        "Aqua",
        "Aquamarine",
        "Azure",
        "Beige",
        "Bisque",
        "Black",
        "BlanchedAlmond",
        "Blue",
        "BlueViolet",
        "Brown",
        "BurlyWood",
        "CadetBlue",
        "Chartreuse",
        "Chocolate",
        "Coral",
        "CornflowerBlue",
        "Cornsilk",
        "Crimson",
        "Cyan",
        "DarkBlue",
        "DarkCyan",
        "DarkGoldenRod",
        "DarkGray",
        "DarkGreen",
        "DarkKhaki",
        "DarkMagenta",
        "DarkOliveGreen",
        "DarkOrange",
        "DarkOrchid",
        "DarkRed",
        "DarkSalmon",
        "DarkSeaGreen",
        "DarkSlateBlue",
        "DarkSlateGray",
        "DarkTurquoise",
        "DarkViolet",
        "DeepPink",
        "DarkSkyBlue",
        "DimGray",
        "DodgerBlue",
        "Feldspar",
        "FireBrick",
        "FloralWhite",
        "ForestGreen",
        "Fuchsia",
        "Gainsboro",
        "GhostWhite",
        "Gold",
        "GoldenRod",
        "Gray",
        "Green",
        "GreenYellow",
        "HoneyDew",
        "HotPink",
        "IndianRed",
        "Indigo",
        "Ivory",
        "Khaki",
        "Lavender",
        "LavenderBlush",
        "LawnGreen",
        "LemonChiffon",
        "LightBlue",
        "LightCoral",
        "LightCyan",
        "LightGoldenRodYellow",
        "LightGrey",
        "LightGreen",
        "LightPink",
        "LightSalmon",
        "LightSeaGreen",
        "LightSkyBlue",
        "LightSlateBlue",
        "LightSlateGray",
        "LightSteelBlue",
        "LightYellow",
        "Lime",
        "LimeGreen",
        "Linen",
        "Magenta",
        "Maroon",
        "MediumAquaMarine",
        "MediumBlue",
        "MediumOrchid",
        "MediumPurple",
        "MediumSeaGreen",
        "MediumSlateBlue",
        "MediumSpringGreen",
        "MediumTurquoise",
        "MediumVioletRed",
        "MidnightBlue",
        "MintCream",
        "MistyRose",
        "Moccasin",
        "NavajoWhite",
        "Navy",
        "OldLace",
        "Olive",
        "OliveDrab",
        "Orange",
        "OrangeRed",
        "Orchid",
        "PaleGoldenRod",
        "PaleGreen",
        "PaleTurquoise",
        "PaleVioletRed",
        "PapayaWhip",
        "PeachPuff",
        "Peru",
        "Pink",
        "Plum",
        "PowderBlue",
        "Purple",
        "Red",
        "RosyBrown",
        "RoyalBlue",
        "SaddleBrown",
        "Salmon",
        "SandyBrown",
        "SeaGreen",
        "SeaShell",
        "Sienna",
        "Silver",
        "SkyBlue",
        "SlateBlue",
        "SlateGray",
        "Snow",
        "SpringGreen",
        "SteelBlue",
        "Tan",
        "Teal",
        "Thistle",
        "Tomato",
        "Turquoise",
        "Violet",
        "VioletRed",
        "Wheat",
        "White",
        "WhiteSmoke",
        "Yellow",
        "YellowGreen",
        "transparent",
        "invert"
    ],

    "auto":
    [
        "auto"
    ],

    "none":
    [
        "none"
    ],

    "captionSide":
    [
        "top",
        "bottom",
        "left",
        "right"
    ],

    "clear":
    [
        "left",
        "right",
        "both"
    ],

    "cursor":
    [
        "auto",
        "cell",
        "context-menu",
        "crosshair",
        "default",
        "help",
        "pointer",
        "progress",
        "move",
        "e-resize",
        "all-scroll",
        "ne-resize",
        "nw-resize",
        "n-resize",
        "se-resize",
        "sw-resize",
        "s-resize",
        "w-resize",
        "ew-resize",
        "ns-resize",
        "nesw-resize",
        "nwse-resize",
        "col-resize",
        "row-resize",
        "text",
        "vertical-text",
        "wait",
        "alias",
        "copy",
        "move",
        "no-drop",
        "not-allowed",
        "-moz-alias",
        "-moz-cell",
        "-moz-copy",
        "-moz-grab",
        "-moz-grabbing",
        "-moz-contextmenu",
        "-moz-zoom-in",
        "-moz-zoom-out",
        "-moz-spinning"
    ],

    "direction":
    [
        "ltr",
        "rtl"
    ],

    "bgAttachment":
    [
        "scroll",
        "fixed"
    ],

    "bgPosition":
    [
        "top",
        "center",
        "bottom",
        "left",
        "right"
    ],

    "bgRepeat":
    [
        "repeat",
        "repeat-x",
        "repeat-y",
        "no-repeat"
    ],

    "borderStyle":
    [
        "hidden",
        "dotted",
        "dashed",
        "solid",
        "double",
        "groove",
        "ridge",
        "inset",
        "outset",
        "-moz-bg-inset",
        "-moz-bg-outset",
        "-moz-bg-solid"
    ],

    "borderCollapse":
    [
        "collapse",
        "separate"
    ],

    "overflow":
    [
        "visible",
        "hidden",
        "scroll",
        "-moz-scrollbars-horizontal",
        "-moz-scrollbars-none",
        "-moz-scrollbars-vertical"
    ],

    "listStyleType":
    [
        "disc",
        "circle",
        "square",
        "decimal",
        "decimal-leading-zero",
        "lower-roman",
        "upper-roman",
        "lower-greek",
        "lower-alpha",
        "lower-latin",
        "upper-alpha",
        "upper-latin",
        "hebrew",
        "armenian",
        "georgian",
        "cjk-ideographic",
        "hiragana",
        "katakana",
        "hiragana-iroha",
        "katakana-iroha",
        "inherit"
    ],

    "listStylePosition":
    [
        "inside",
        "outside"
    ],

    "content":
    [
        "open-quote",
        "close-quote",
        "no-open-quote",
        "no-close-quote",
        "inherit"
    ],

    "fontStyle":
    [
        "normal",
        "italic",
        "oblique",
        "inherit"
    ],

    "fontVariant":
    [
        "normal",
        "small-caps",
        "inherit"
    ],

    "fontWeight":
    [
        "normal",
        "bold",
        "bolder",
        "lighter",
        "inherit"
    ],

    "fontSize":
    [
        "xx-small",
        "x-small",
        "small",
        "medium",
        "large",
        "x-large",
        "xx-large",
        "smaller",
        "larger"
    ],

    "fontFamily":
    [
        "Arial",
        "Comic Sans MS",
        "Georgia",
        "Tahoma",
        "Verdana",
        "Times New Roman",
        "Trebuchet MS",
        "Lucida Grande",
        "Helvetica",
        "serif",
        "sans-serif",
        "cursive",
        "fantasy",
        "monospace",
        "caption",
        "icon",
        "menu",
        "message-box",
        "small-caption",
        "status-bar",
        "inherit"
    ],

    "display":
    [
        "block",
        "inline",
        "list-item",
        "marker",
        "run-in",
        "compact",
        "table",
        "inline-table",
        "table-row-group",
        "table-column",
        "table-column-group",
        "table-header-group",
        "table-footer-group",
        "table-row",
        "table-cell",
        "table-caption",
        "-moz-box",
        "-moz-compact",
        "-moz-deck",
        "-moz-grid",
        "-moz-grid-group",
        "-moz-grid-line",
        "-moz-groupbox",
        "-moz-inline-block",
        "-moz-inline-box",
        "-moz-inline-grid",
        "-moz-inline-stack",
        "-moz-inline-table",
        "-moz-marker",
        "-moz-popup",
        "-moz-runin",
        "-moz-stack"
    ],

    "position":
    [
        "static",
        "relative",
        "absolute",
        "fixed",
        "inherit"
    ],

    "float":
    [
        "left",
        "right"
    ],

    "textAlign":
    [
        "left",
        "right",
        "center",
        "justify"
    ],

    "tableLayout":
    [
        "fixed"
    ],

    "textDecoration":
    [
        "underline",
        "overline",
        "line-through",
        "blink"
    ],

    "textTransform":
    [
        "capitalize",
        "lowercase",
        "uppercase",
        "inherit"
    ],

    "unicodeBidi":
    [
        "normal",
        "embed",
        "bidi-override"
    ],

    "whiteSpace":
    [
        "normal",
        "pre",
        "nowrap"
    ],

    "verticalAlign":
    [
        "baseline",
        "sub",
        "super",
        "top",
        "text-top",
        "middle",
        "bottom",
        "text-bottom",
        "inherit"
    ],

    "thickness":
    [
        "thin",
        "medium",
        "thick"
    ],

    "userFocus":
    [
        "ignore",
        "normal"
    ],

    "userInput":
    [
        "disabled",
        "enabled"
    ],

    "userSelect":
    [
        "normal"
    ],

    "mozBoxSizing":
    [
        "content-box",
        "padding-box",
        "border-box"
    ],

    "mozBoxAlign":
    [
        "start",
        "center",
        "end",
        "baseline",
        "stretch"
    ],

    "mozBoxDirection":
    [
        "normal",
        "reverse"
    ],

    "mozBoxOrient":
    [
        "horizontal",
        "vertical"
    ],

    "mozBoxPack":
    [
        "start",
        "center",
        "end"
    ]
};

this.nonEditableTags =
{
    "HTML": 1,
    "HEAD": 1,
    "html": 1,
    "head": 1
};

this.innerEditableTags =
{
    "BODY": 1,
    "body": 1
};

const invisibleTags = this.invisibleTags =
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

    "html": 1,
    "head": 1,
    "title": 1,
    "meta": 1,
    "link": 1,
    "style": 1,
    "script": 1,
    "noscript": 1,
    "br": 1,
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

// ************************************************************************************************
// Debug Logging

this.ERROR = function(exc)
{
    if (FBTrace) {                                              /*@explore*/
        FBTrace.dumpProperties("lib.ERROR:", exc);  /*@explore*/
        FBTrace.dumpStack("lib.ERROR");
    }
    else                                                      /*@explore*/
        ddd("FIREBUG WARNING: " + exc);
}

// ************************************************************************************************
// Time Utils

this.formatTime = function(elapsed)
{
    if (elapsed == -1)
        return "_"; // should be &nbsp; but this will be escaped so we need something that is no whitespace
    else if (elapsed < 1000)
        return elapsed + "ms";
    else if (elapsed < 60000)
        return (Math.ceil(elapsed/10) / 100) + "s";
    else
        return (Math.ceil((elapsed/60000)*100)/100) + "m";
}

// ************************************************************************************************

}).apply(FBL);
} catch(e) {																			/*@explore*/
    dump("FBL Fails "+e+"\n");																/*@explore*/
    FBTrace.dumpProperties("FBL FAILS", e);									/*@explore*/
    FBTrace.sysout("If the service @joehewitt.com/firebug;1 fails, try deleting compreg.dat, xpti.dat\n");/*@explore*/
    FBTrace.sysout("Another cause can be mangled install.rdf.\n");/*@explore*/
}   																		/*@explore*/
