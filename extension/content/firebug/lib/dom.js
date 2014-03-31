/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/deprecated",
    "firebug/lib/css",
    "firebug/lib/array",
    "firebug/lib/xml",
    "firebug/lib/wrapper",
],
function(FBTrace, Deprecated, Css, Arr, Xml, Wrapper) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;

var Dom = {};
var domMemberCache = null;
var domMemberMap = {};
var domMappedData = new WeakMap();

Dom.domUtils = Cc["@mozilla.org/inspector/dom-utils;1"].getService(Ci.inIDOMUtils);

// Tracing
var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_DOM");

// ********************************************************************************************* //
// DOM APIs

Dom.getChildByClass = function(node) // ,classname, classname, classname...
{
    if (!node)
    {
        TraceError.sysout("dom.getChildByClass; ERROR, no parent node!");
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

Dom.getTopAncestorByTagName = function(node, tagName)
{
    var topNode = node;
    for (var parent = node; parent; parent = parent.parentNode)
    {
        if (parent.localName && parent.tagName.toLowerCase() == tagName)
            topNode = parent;
    }

    return topNode;
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

Dom.isAncestor = function(node, potentialAncestor)
{
    for (var parent = node; parent; parent = parent.parentNode)
    {
        if (parent == potentialAncestor)
            return true;
    }

    return false;
};

Dom.getNextElement = function(node)
{
    while (node && node.nodeType != Node.ELEMENT_NODE)
        node = node.nextSibling;

    return node;
};

Dom.getPreviousElement = function(node)
{
    while (node && node.nodeType != Node.ELEMENT_NODE)
        node = node.previousSibling;

    return node;
};

Dom.getBody = function(doc)
{
    if (doc.body)
        return doc.body;

    var body = doc.getElementsByTagName("body")[0];
    if (body)
        return body;

    return doc.documentElement;  // For non-HTML docs
};

Dom.getNonFrameBody = function(elt)
{
    if (Dom.isRange(elt))
        elt = elt.commonAncestorContainer;

    var body = Dom.getBody(elt.ownerDocument);
    return (body.localName && body.localName.toUpperCase() === "FRAMESET") ? null : body;
}

/**
 * @return {@Boolean} true if the given element is currently attached to the document.
 */
Dom.isAttached = function(element)
{
    var doc = element.ownerDocument;
    if (!doc)
        return false;

    return doc.contains(element);
};

// ********************************************************************************************* //
// DOM Modification

Dom.insertAfter = function(newNode, referenceNode)
{
    if (referenceNode.parentNode)
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
};

Dom.addScript = function(doc, id, src)
{
    var element = doc.getElementById(id);
    if (element)
        return element;

    element = doc.createElementNS("http://www.w3.org/1999/xhtml", "html:script");
    element.setAttribute("type", "text/javascript");
    element.setAttribute("id", id);

    Firebug.setIgnored(element);

    element.textContent = src;

    if (doc.documentElement)
    {
        doc.documentElement.appendChild(element);
    }
    else
    {
        // See issue 1079, the svg test case gives this error
        TraceError.sysout("dom.addScript; ERROR doc has no documentElement (" +
            doc.readyState + ") " + doc.location, doc);
        return;
    }

    return element;
};

Dom.setOuterHTML = function(element, html)
{
    try
    {
        var fragment = Dom.markupToDocFragment(html, element);

        var first = fragment.firstChild;
        var last = fragment.lastChild;
        element.parentNode.replaceChild(fragment, element);
        return [first, last];
    }
    catch (e)
    {
        return [element, element];
    }
};

Dom.markupToDocFragment = function(markup, parent)
{
    var doc = parent.ownerDocument;
    var range = doc.createRange();
    range.selectNode(parent || doc.documentElement);

    return range.createContextualFragment(markup);
};

Dom.appendInnerHTML = function(element, html, referenceElement)
{
    var doc = element.ownerDocument;
    var range = doc.createRange();  // a helper object
    range.selectNodeContents(element); // the environment to interpret the html

    var fragment = range.createContextualFragment(html);  // parse
    var firstChild = fragment.firstChild;
    element.insertBefore(fragment, referenceElement);

    return firstChild;
};

Dom.insertTextIntoElement = function(element, text)
{
    var command = "cmd_insertText";

    var controller = element.controllers.getControllerForCommand(command);
    if (!controller || !controller.isCommandEnabled(command))
        return;

    var params = Cc["@mozilla.org/embedcomp/command-params;1"].createInstance(Ci.nsICommandParams);
    params.setStringValue("state_data", text);

    if (controller instanceof Ci.nsICommandController)
        controller.doCommandWithParams(command, params);
};

// ********************************************************************************************* //

Dom.collapse = function(elt, collapsed)
{
    if (!elt)
    {
        TraceError.sysout("dom.collapse; ERROR null element.");
        return;
    }

    elt.setAttribute("collapsed", collapsed ? "true" : "false");
};

Dom.isCollapsed = function(elt)
{
    return (elt.getAttribute("collapsed") == "true") ? true : false;
};

Dom.hide = function(elt, hidden)
{
    elt.style.visibility = hidden ? "hidden" : "visible";
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

Dom.isNode = function(o)
{
    try {
        return o && o instanceof window.Node;
    }
    catch (ex) {
        return false;
    }
};

Dom.isElement = function(o)
{
    try {
        return o && o instanceof window.Element;
    }
    catch (ex) {
        return false;
    }
};

Dom.isRange = function(o)
{
    try {
        return o && o instanceof window.Range;
    }
    catch (ex) {
        return false;
    }
};

Dom.hasChildElements = function(node)
{
    if (node.contentDocument) // iframes
        return true;

    for (var child = node.firstChild; child; child = child.nextSibling)
    {
        if (child.nodeType == Node.ELEMENT_NODE)
            return true;
    }

    return false;
};

// ********************************************************************************************* //

Dom.getNextByClass = function(root, state)
{
    function iter(node) { return node.nodeType == Node.ELEMENT_NODE && Css.hasClass(node, state); }
    return Dom.findNext(root, iter);
};

Dom.getPreviousByClass = function(root, state)
{
    function iter(node) { return node.nodeType == Node.ELEMENT_NODE && Css.hasClass(node, state); }
    return Dom.findPrevious(root, iter);
};

Dom.findNextDown = function(node, criteria)
{
    if (!node)
        return null;

    for (var child = node.firstChild; child; child = child.nextSibling)
    {
        if (criteria(child))
            return child;

        var next = Dom.findNextDown(child, criteria);
        if (next)
            return next;
    }
};

Dom.findPreviousUp = function(node, criteria)
{
    if (!node)
        return null;

    for (var child = node.lastChild; child; child = child.previousSibling)
    {
        var next = Dom.findPreviousUp(child, criteria);
        if (next)
            return next;

        if (criteria(child))
            return child;
    }
};

Dom.findNext = function(node, criteria, upOnly, maxRoot)
{
    if (!node)
        return null;

    if (!upOnly)
    {
        var next = Dom.findNextDown(node, criteria);
        if (next)
            return next;
    }

    for (var sib = node.nextSibling; sib; sib = sib.nextSibling)
    {
        if (criteria(sib))
            return sib;

        var next = Dom.findNextDown(sib, criteria);
        if (next)
            return next;
    }

    if (node.parentNode && node.parentNode != maxRoot)
    {
        return Dom.findNext(node.parentNode, criteria, true, maxRoot);
    }

    return null;
};

Dom.findPrevious = function(node, criteria, downOnly, maxRoot)
{
    if (!node)
        return null;

    for (var sib = node.previousSibling; sib; sib = sib.previousSibling)
    {
        var prev = Dom.findPreviousUp(sib, criteria);
        if (prev)
            return prev;

        if (criteria(sib))
            return sib;
    }

    if (!downOnly)
    {
        var next = Dom.findPreviousUp(node, criteria);
        if (next)
            return next;
    }

    if (node.parentNode && node.parentNode != maxRoot)
    {
        if (criteria(node.parentNode))
            return node.parentNode;

        return Dom.findPrevious(node.parentNode, criteria, true, maxRoot);
    }

    return null;
};

// ********************************************************************************************* //
// Graphics

/**
 * Gets the absolute offset of an element
 * @param {Element} elt Element to get the info for
 * @returns {Object} x and y offset of the element
 */
Dom.getClientOffset = function(elt)
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
            if (p.nodeType == Node.ELEMENT_NODE)
                addOffset(p, coords, view);
        }
        else if (elt.ownerDocument.defaultView.frameElement)
        {
            addOffset(elt.ownerDocument.defaultView.frameElement, coords,
                elt.ownerDocument.defaultView);
        }
    }

    var coords = {x: 0, y: 0};
    if (elt)
    {
        var view = elt.ownerDocument.defaultView;
        addOffset(elt, coords, view);
    }

    return coords;
};

/**
 * Gets layout info about an element
 * @param {Object} elt Element to get the info for
 * @returns {Object} Layout information including "left", "top", "right", "bottom",
 *     "width" and "height"
 */
Dom.getLTRBWH = function(elt)
{
    var bcrect;
    var dims = {"left": 0, "top": 0, "right": 0, "bottom": 0, "width": 0, "height": 0};

    if (elt)
    {
        bcrect = elt.getBoundingClientRect();
        dims.left = bcrect.left;
        dims.top = bcrect.top;
        dims.right = bcrect.right;
        dims.bottom = bcrect.bottom;

        if (bcrect.width)
        {
            dims.width = bcrect.width;
            dims.height = bcrect.height;
        }
        else
        {
            dims.width = dims.right - dims.left;
            dims.height = dims.bottom - dims.top;
        }
    }

    return dims;
};

/**
 * Gets the offset of an element relative to an ancestor
 * @param {Element} elt Element to get the info for
 * @param {Element} ancestor Ancestor element used as origin
 */
Dom.getAncestorOffset = function(elt, ancestor)
{
    var offset = {x: 0, y: 0};
    var offsetParent = elt;
    do
    {
        offset.x += offsetParent.offsetLeft;
        offset.y += offsetParent.offsetTop;
        offsetParent = offsetParent.offsetParent;
    } while (offsetParent && offsetParent !== ancestor);

    return offset;
};

/**
 * Gets the offset size of an element
 * @param {Object} elt Element to move
 * @returns {Object} Offset width and height of the element
 */
Dom.getOffsetSize = function(elt)
{
    return {width: elt.offsetWidth, height: elt.offsetHeight};
};

/**
 * Get the next scrollable ancestor
 * @param {Object} element Element to search the ancestor for
 * @returns {Object} Scrollable ancestor
 */
Dom.getOverflowParent = function(element)
{
    for (var scrollParent = element.parentNode; scrollParent;
        scrollParent = scrollParent.offsetParent)
    {
        if (scrollParent.scrollHeight > scrollParent.offsetHeight)
            return scrollParent;
    }
};

/**
 * Checks whether an element is scrolled to the bottom
 * @param {Object} element Element to check
 * @returns {Boolean} True, if element is scrolled to the bottom, otherwise false
 */
Dom.isScrolledToBottom = function(element)
{
    var onBottom = (element.scrollTop + element.offsetHeight) == element.scrollHeight;

    Trace.sysout("dom.isScrolledToBottom; offsetHeight: " + element.offsetHeight +
        ", scrollTop: " + element.scrollTop + ", scrollHeight: " + element.scrollHeight +
        ", onBottom: " + onBottom);

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

    if (Trace.active)
    {
        Trace.sysout("dom.scrollToBottom; reset scrollTop " + element.scrollTop + " = " +
            element.scrollHeight);

        if (element.scrollHeight == element.offsetHeight)
        {
            Trace.sysout("dom.scrollToBottom; attempt to scroll non-scrollable element " +
                element, element);
        }
    }

    return (element.scrollTop == element.scrollHeight);
};

/**
 * Moves an element
 * @param {Object} element Element to move
 * @param {Number} x New horizontal position
 * @param {Number} y New vertical position
 */
Dom.move = function(element, x, y)
{
    element.style.left = x + "px";
    element.style.top = y + "px";
};

/**
 * Resizes an element
 * @param {Object} element Element to resize
 * @param {Number} w New width
 * @param {Number} h New height
 */
Dom.resize = function(element, w, h)
{
    element.style.width = w + "px";
    element.style.height = h + "px";
};

Dom.linesIntoCenterView = function(element, scrollBox)  // {before: int, after: int}
{
    if (!scrollBox)
        scrollBox = Dom.getOverflowParent(element);

    if (!scrollBox)
        return;

    var offset = Dom.getClientOffset(element);

    var topSpace = offset.y - scrollBox.scrollTop;
    var bottomSpace = (scrollBox.scrollTop + scrollBox.clientHeight) -
        (offset.y + element.offsetHeight);

    if (topSpace < 0 || bottomSpace < 0)
    {
        var split = (scrollBox.clientHeight/2);
        var centerY = offset.y - split;
        scrollBox.scrollTop = centerY;
        topSpace = split;
        bottomSpace = split - element.offsetHeight;
    }

    return {
        before: Math.round((topSpace/element.offsetHeight) + 0.5),
        after: Math.round((bottomSpace/element.offsetHeight) + 0.5)
    };
};

/**
 * Scrolls an element into view
 * @param {Object} element Element to scroll to
 * @param {Object} scrollBox Scrolled element (Must be an ancestor of "element" or
 *     null for automatically determining the ancestor)
 * @param {String} alignmentX Horizontal alignment for the element
 *     (valid values: "centerOrLeft", "left", "middle", "right", "none")
 * @param {String} alignmentY Vertical alignment for the element
 *     (valid values: "centerOrTop", "top", "middle", "bottom", "none")
 * @param {Boolean} scrollWhenVisible Specifies whether "scrollBox" should be scrolled even when
 *     "element" is completely visible
 */
Dom.scrollTo = function(element, scrollBox, alignmentX, alignmentY, scrollWhenVisible)
{
    if (!element)
        return;

    if (!scrollBox)
        scrollBox = Dom.getOverflowParent(element);

    if (!scrollBox)
        return;

    var offset = Dom.getAncestorOffset(element, scrollBox);

    if (!alignmentX)
        alignmentX = "centerOrLeft";

    if (!alignmentY)
        alignmentY = "centerOrTop";

    if (alignmentY)
    {
        var topSpace = offset.y - scrollBox.scrollTop;
        var bottomSpace = (scrollBox.scrollTop + scrollBox.clientHeight) -
            (offset.y + element.offsetHeight);

        // Element is vertically not completely visible or scrolling is enforced
        if (topSpace < 0 || bottomSpace < 0 || scrollWhenVisible)
        {
            switch (alignmentY)
            {
                case "top":
                    scrollBox.scrollTop = offset.y;
                    break;

                case "center":
                case "centerOrTop":
                    var elementFitsIntoScrollBox = element.offsetHeight <= scrollBox.clientHeight;
                    var y = elementFitsIntoScrollBox || alignmentY != "centerOrTop" ?
                        offset.y - (scrollBox.clientHeight - element.offsetHeight) / 2 :
                        offset.y;
                    scrollBox.scrollTop = y;
                    break;

                case "bottom":
                    var y = offset.y + element.offsetHeight - scrollBox.clientHeight;
                    scrollBox.scrollTop = y;
                    break;
            }
        }
    }

    if (alignmentX)
    {
        var leftSpace = offset.x - scrollBox.scrollLeft;
        var rightSpace = (scrollBox.scrollLeft + scrollBox.clientWidth) -
            (offset.x + element.clientWidth);

        // Element is horizontally not completely visible or scrolling is enforced
        if (leftSpace < 0 || rightSpace < 0 || scrollWhenVisible)
        {
            switch (alignmentX)
            {
                case "left":
                    scrollBox.scrollLeft = offset.x;
                    break;

                case "center":
                case "centerOrLeft":
                    var elementFitsIntoScrollBox = element.offsetWidth <= scrollBox.clientWidth;
                    var x = elementFitsIntoScrollBox || alignmentX != "centerOrLeft" ?
                        offset.x - (scrollBox.clientWidth - element.offsetWidth) / 2 :
                        offset.x;
                    scrollBox.scrollLeft = x;
                    break;

                case "right":
                    var x = offset.x + element.offsetWidth - scrollBox.clientWidth;
                    scrollBox.scrollLeft = x;
                    break;
            }
        }
    }

    Trace.sysout("dom.scrollTo;", element);
};

/**
 * Centers an element inside a scrollable area
 * @param {Object} element Element to scroll to
 * @param {Object} scrollBox Scrolled element (Must be an ancestor of "element" or
 *     null for automatically determining the ancestor)
 * @param {Boolean} notX Specifies whether the element should be centered horizontally
 * @param {Boolean} notY Specifies whether the element should be centered vertically
 */
Dom.scrollIntoCenterView = function(element, scrollBox, notX, notY)
{
    Dom.scrollTo(element, scrollBox, notX ? "none" : "centerOrLeft",
        notY ? "none" : "centerOrTop");
};

Dom.scrollMenupopup = function(popup, item)
{
    var doc = popup.ownerDocument;
    var box = doc.getAnonymousNodes(popup)[0];
    var scrollBox = doc.getAnonymousNodes(box)[1];

    if (item == undefined)
    {
        scrollBox.scrollTop = scrollBox.scrollHeight + 100;
    }
    else if (item == 0)
    {
        scrollBox.scrollTop = 0;
    }
    else
    {
        var popupRect = popup.getBoundingClientRect();
        var itemRect = item.getBoundingClientRect();

        if (itemRect.top < popupRect.top + itemRect.height)
        {
            scrollBox.scrollTop += itemRect.top - popupRect.top - itemRect.height;
        }
        else if (itemRect.bottom + itemRect.height > popupRect.bottom)
        {
            scrollBox.scrollTop -= popupRect.bottom - itemRect.bottom - itemRect.height;
        }
    }
};

// ********************************************************************************************* //
// MappedData

function getElementData(element)
{
    var elementData;

    // force element to be wrapped:
    element = new XPCNativeWrapper(element);

    if (!domMappedData.has(element))
    {
        elementData = {};
        domMappedData.set(element, elementData);
    }
    else
        elementData = domMappedData.get(element);

    return elementData;
}

Dom.getMappedData = function(element, key)
{
    var elementData = getElementData(element);
    return elementData[key];
};

Dom.setMappedData = function(element, key, value)
{
    if (!Dom.isNode(element))
        throw new TypeError("expected an element as the first argument");

    if (typeof key !== "string")
        throw new TypeError("the key argument must be a string");

    var elementData = getElementData(element);
    elementData[key] = value;
};

Dom.deleteMappedData = function(element, key)
{
    var elementData = getElementData(element);
    delete elementData[key];
};

// ********************************************************************************************* //
// DOM Members

Dom.getDOMMembers = function(object)
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
    else if (object instanceof Document)
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
    else if (object instanceof Event || object instanceof Dom.EventCopy)
        { return domMemberCache.Event; }
    else if (Array.isArray(object))
        { return domMemberCache.Array; }

    return null;
};

Dom.isDOMMember = function(object, propName)
{
    // We use "in" here instead of "hasOwnProperty" so that things on Object.prototype
    // also get treated as DOM members.
    // XXXsimon: Non-DOM objects should also get this behavior.
    var members = Dom.getDOMMembers(object);
    return members && propName in members;
};

Dom.isDOMConstant = function(object, name)
{
    if (!Dom.domConstantMap.hasOwnProperty(name))
        return false;

    try
    {
        // Test for nativeness. This is a fragile piece of dark magic, and might be
        // equivalent to |Cu.isXrayWrapper(XPCNativeWrapper(object))| in >= Fx 20.
        object = XPCNativeWrapper.unwrap(object);
        var isNative = (XPCNativeWrapper(object).toString !== XPCNativeWrapper(object.toString));
        return (isNative ||
            object instanceof window.Event ||
            object instanceof Dom.EventCopy);
    }
    catch (exc)
    {
        return false;
    }
};

Dom.isInlineEventHandler = function(name)
{
    return !!Dom.domInlineEventHandlersMap[name];
};

Dom.EventCopy = function(event)
{
    // Because event objects are destroyed arbitrarily by Gecko, we must make a copy of them to
    // represent them long term in the inspector.
    for (var name in event)
    {
        try {
            this[name] = event[name];
        } catch (exc) { }
    }
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

// Note: Missing HTML elements:
// <tbody>, <object>, <embed>, <video>, <audio>, <source>, <option>, <select>, <textarea>, <br>,
// <frame>, <iframe>, <frameset>, <link>, <meta>, <style>, probably more
// Instead of adding them, effort should rather be spent on automatic scanning.

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
    "mozInnerScreenX",
    "mozInnerScreenY",
    "pageXOffset",
    "pageYOffset",
    "scrollX",
    "scrollY",
    "scrollMaxX",
    "scrollMaxY",

    "URL", //FF4.0
    "mozAnimationStartTime", //FF4.0
    "mozPaintCount", //FF4.0
    "mozRequestAnimationFrame", //FF4.0
    "mozCancelAnimationFrame",
    "mozCancelRequestAnimationFrame",

    "mozCancelAnimationFrame",
    "mozCancelRequestAnimationFrame",
    "indexedDB",

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
    "applicationCache",      // FF3
    "postMessage",
    "localStorage",  // FF3.5
    "showModalDialog", // FF 3.0, MS IE4

    "InstallTrigger",

    "performance",
    "matchMedia",

    "getInterface",

    "BarProp",
    "Controllers",
    "Crypto",
    "DOMException",
    "DOMStringList",
    "EventTarget",
    "History",
    "MimeTypeArray",
    "Navigator",
    "NodeList",
    "OfflineResourceList",
    "Screen",
    "Storage",
    "XULControllers",
    "Document",
    "Element",
    "Attr",
    "CharacterData",
    "DOMTokenList",
    "Text",
    "Proxy",
    "Blob",
    "File",
    "Image",
    "Option",

    "HTMLDocument",
    "HTMLByteRanges",
    "HTMLCollection",
    "HTMLOptionsCollection",
    "HTMLPropertiesCollection",

    "HTMLElement",
    "HTMLUnknownElement",
    "HTMLAnchorElement",
    "HTMLAppletElement",
    "HTMLAreaElement",
    "HTMLAudioElement",
    "HTMLBaseElement",
    "HTMLBodyElement",
    "HTMLBRElement",
    "HTMLButtonElement",
    "HTMLCanvasElement",
    "HTMLCommandElement",
    "HTMLDataListElement",
    "HTMLDirectoryElement",
    "HTMLDivElement",
    "HTMLDListElement",
    "HTMLEmbedElement",
    "HTMLFieldSetElement",
    "HTMLFontElement",
    "HTMLFormElement",
    "HTMLFrameElement",
    "HTMLFrameSetElement",
    "HTMLHeadElement",
    "HTMLHeadingElement",
    "HTMLHRElement",
    "HTMLHtmlElement",
    "HTMLHtmlElement",
    "HTMLIFrameElement",
    "HTMLImageElement",
    "HTMLInputElement",
    "HTMLLabelElement",
    "HTMLLegendElement",
    "HTMLLIElement",
    "HTMLLinkElement",
    "HTMLMapElement",
    "HTMLMediaElement",
    "HTMLMenuElement",
    "HTMLMenuItemElement",
    "HTMLMetaElement",
    "HTMLMeterElement",
    "HTMLModElement",
    "HTMLObjectElement",
    "HTMLOListElement",
    "HTMLOptGroupElement",
    "HTMLOptionElement",
    "HTMLOutputElement",
    "HTMLParagraphElement",
    "HTMLParamElement",
    "HTMLPreElement",
    "HTMLProgressElement",
    "HTMLQuoteElement",
    "HTMLScriptElement",
    "HTMLSelectElement",
    "HTMLSourceElement",
    "HTMLSpanElement",
    "HTMLStyleElement",
    "HTMLTableCaptionElement",
    "HTMLTableCellElement",
    "HTMLTableColElement",
    "HTMLTableElement",
    "HTMLTableRowElement",
    "HTMLTableSectionElement",
    "HTMLTextAreaElement",
    "HTMLTitleElement",
    "HTMLUListElement",
    "HTMLVideoElement",

    "JSON",
    "Location",
    "Math",
    "Node",
    "StopIteration",
    "Window",
    "XULElement",
    "CSS2Properties",
    "CSSStyleDeclaration",
    "Error",
    "EvalError",
    "InternalError",
    "Namespace",
    "QName",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError",
    "Array",
    "ArrayBuffer",
    "Boolean",
    "DataView",
    "Date",
    "Float32Array",
    "Float64Array",
    "Function",
    "Int16Array",
    "Int32Array",
    "Int8Array",
    "Iterator",
    "Map",
    "Number",
    "Object",
    "ParallelArray",
    "QueryInterface",
    "RegExp",
    "Set",
    "String",
    "Uint16Array",
    "Uint32Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "WeakMap",
    "XML",
    "XMLList",
    "decodeURI",
    "decodeURIComponent",
    "dumpProfile",
    "encodeURI",
    "encodeURIComponent",
    "escape",
    "isFinite",
    "isNaN",
    "isXMLName",
    "parseFloat",
    "parseInt",
    "pauseProfilers",
    "resumeProfilers",
    "startProfiling",
    "stopProfiling",
    "unescape",
    "uneval",
    "Performance",
    "PerformanceNavigation",
    "PerformanceTiming",

    "AnimationEvent",
    "BeforeUnloadEvent",
    "CommandEvent",
    "CompositionEvent",
    "DataContainerEvent",
    "DataErrorEvent",
    "DeviceMotionEvent",
    "DragEvent",
    "IDBVersionChangeEvent",
    "KeyEvent",
    "KeyboardEvent",
    "LSProgressEvent",
    "MessageEvent",
    "MouseScrollEvent",
    "MozSmsEvent",
    "MutationEvent",
    "NSEvent",
    "NotifyAudioAvailableEvent",
    "NotifyPaintEvent",
    "SVGEvent",
    "SVGZoomEvent",
    "ScrollAreaEvent",
    "SimpleGestureEvent",
    "SmartCardEvent",
    "TimeEvent",
    "TransitionEvent",
    "USSDReceivedEvent",
    "XMLHttpProgressEvent",
    "XULCommandEvent",

    "Event",
    "CloseEvent",
    "CustomEvent",
    "DOMTransactionEvent",
    "DeviceLightEvent",
    "DeviceOrientationEvent",
    "DeviceProximityEvent",
    "DeviceStorageChangeEvent",
    "HashChangeEvent",
    "MouseEvent",
    "MozApplicationEvent",
    "MozContactChangeEvent",
    "MozSettingsEvent",
    "PageTransitionEvent",
    "PopStateEvent",
    "PopupBlockedEvent",
    "ProgressEvent",
    "StorageEvent",
    "UIEvent",
    "UserProximityEvent",
    "WheelEvent",

    "AsyncScrollEventDetail",
    "BatteryManager",
    "BoxObject",
    "CRMFObject",
    "CSSCharsetRule",
    "CSSConditionRule",
    "CSSFontFaceRule",
    "CSSGroupRuleRuleList",
    "CSSGroupingRule",
    "CSSImportRule",
    "CSSMediaRule",
    "CSSMozDocumentRule",
    "CSSNameSpaceRule",
    "CSSPageRule",
    "CSSRect",
    "CSSRule",
    "CSSRuleList",
    "CSSStyleRule",
    "CSSStyleSheet",
    "CSSSupportsRule",
    "CSSUnknownRule",
    "CameraCapabilities",
    "CameraControl",
    "CameraManager",
    "CanvasGradient",
    "CanvasPattern",
    "ChromeWindow",
    "ClientInformation",
    "ClientRect",
    "Contact",
    "ContactAddress",
    "ContactField",
    "ContactFindOptions",
    "ContactManager",
    "ContactProperties",
    "ContactTelField",
    "Counter",
    "CryptoDialogs",
    "DOMError",
    "DOMRequest",
    "DataChannel",
    "DataTransfer",
    "DesktopNotification",
    "DesktopNotificationCenter",
    "DeviceAcceleration",
    "DeviceRotationRate",
    "DeviceStorage",
    "DeviceStorageCursor",
    "DeviceStorageStat",
    "DocumentTouch",
    "DocumentXBL",
    "ElementCSSInlineStyle",
    "ElementTimeControl",
    "EventListener",
    "EventListenerInfo",
    "FileRequest",
    "FontFace",
    "FontFaceList",
    "GeoGeolocation",
    "GeoPosition",
    "GeoPositionCallback",
    "GeoPositionCoords",
    "GeoPositionError",
    "GeoPositionErrorCallback",
    "GetSVGDocument",
    "GetUserMediaErrorCallback",
    "GetUserMediaSuccessCallback",
    "GlobalObjectConstructor",
    "GlobalPropertyInitializer",
    "IDBCursor",
    "IDBCursorWithValue",
    "IDBDatabase",
    "IDBFactory",
    "IDBIndex",
    "IDBKeyRange",
    "IDBObjectStore",
    "IDBOpenDBRequest",
    "IDBRequest",
    "IDBTransaction",
    "ImageDocument",
    "JSWindow",
    "LinkStyle",
    "LoadStatus",
    "LocalMediaStream",
    "LockedFile",
    "MediaError",
    "MediaList",
    "MediaQueryList",
    "MediaQueryListListener",
    "MediaStream",
    "MimeType",
    "ModalContentWindow",
    "MozAlarmsManager",
    "MozBrowserFrame",
    "MozCSSKeyframeRule",
    "MozCSSKeyframesRule",
    "MozCanvasPrintState",
    "MozConnection",
    "MozNavigatorNetwork",
    "MozNavigatorSms",
    "MozPowerManager",
    "MozSmsCursor",
    "MozSmsManager",
    "MozSmsMessage",
    "MozSmsRequest",
    "MozSmsSegmentInfo",
    "MozWakeLock",
    "MozWakeLockListener",
    "NSEditableElement",
    "NSXPathExpression",
    "NamedNodeMap",
    "NavigatorCamera",
    "NavigatorDesktopNotification",
    "NavigatorDeviceStorage",
    "NavigatorGeolocation",
    "NavigatorUserMedia",
    "NodeFilter",
    "NodeIterator",
    "NodeSelector",
    "OpenWindowEventDetail",
    "Parser",
    "PermissionSettings",
    "Pkcs11",
    "Plugin",
    "PluginArray",
    "RTCIceCandidate",
    "RTCPeerConnection",
    "RTCSessionDescription",
    "Range",
    "RequestService",
    "Selection",
    "Serializer",
    "SettingsLock",
    "SettingsManager",
    "StorageIndexedDB",
    "StorageItem",
    "StorageManager",
    "StorageObsolete",
    "StyleSheet",
    "StyleSheetList",
    "TCPSocket",
    "TextMetrics",
    "TimeRanges",
    "ToString",
    "TreeColumn",
    "TreeColumns",
    "TreeContentView",
    "TreeSelection",
    "TreeWalker",
    "UserDataHandler",
    "ValidityState",
    "WindowCollection",
    "WindowInternal",
    "WindowPerformance",
    "WindowUtils",
    "XMLDocument",
    "XMLStylesheetProcessingInstruction",
    "XPathExpression",
    "XPathNSResolver",
    "XPathNamespace",
    "XPathResult",

    "Audio",
    "AudioBuffer",
    "AudioBufferSourceNode",
    "AudioDestinationNode",
    "AudioListener",
    "AudioNode",
    "AudioParam",
    "AudioSourceNode",
    "BiquadFilterNode",
    "CDATASection",
    "CSSPrimitiveValue",
    "CSSValue",
    "CSSValueList",
    "CanvasRenderingContext2D",
    "CaretPosition",
    "ClientRectList",
    "Comment",
    "DOMImplementation",
    "DOMParser",
    "DOMSettableTokenList",
    "DelayNode",
    "DocumentFragment",
    "DocumentType",
    "DynamicsCompressorNode",
    "EventSource",
    "FileHandle",
    "FileList",
    "FileReader",
    "FormData",
    "GainNode",
    "ImageData",
    "MozSmsFilter",
    "MutationObserver",
    "MutationRecord",
    "PaintRequest",
    "PaintRequestList",
    "PannerNode",
    "ProcessingInstruction",
    "PropertyNodeList",
    "RGBColor",
    "Rect",
    "TextDecoder",
    "TextEncoder",
    "WebGLActiveInfo",
    "WebGLRenderingContext",
    "WebGLShaderPrecisionFormat",
    "WebSocket",
    "XMLHttpRequest",
    "XMLHttpRequestUpload",
    "XMLSerializer",
    "XPathEvaluator",
    "XSLTProcessor",

    "SVGAElement",
    "SVGAltGlyphElement",
    "SVGAngle",
    "SVGAnimatedAngle",
    "SVGAnimatedBoolean",
    "SVGAnimatedEnumeration",
    "SVGAnimatedInteger",
    "SVGAnimatedLength",
    "SVGAnimatedLengthList",
    "SVGAnimatedNumber",
    "SVGAnimatedNumberList",
    "SVGAnimatedPathData",
    "SVGAnimatedPoints",
    "SVGAnimatedPreserveAspectRatio",
    "SVGAnimatedRect",
    "SVGAnimatedString",
    "SVGAnimatedTransformList",
    "SVGAnimateElement",
    "SVGAnimateMotionElement",
    "SVGAnimateTransformElement",
    "SVGAnimationElement",
    "SVGCircleElement",
    "SVGClipPathElement",
    "SVGComponentTransferFunctionElement",
    "SVGDefsElement",
    "SVGDescElement",
    "SVGDocument",
    "SVGElement",
    "SVGEllipseElement",
    "SVGFEBlendElement",
    "SVGFEColorMatrixElement",
    "SVGFEComponentTransferElement",
    "SVGFECompositeElement",
    "SVGFEConvolveMatrixElement",
    "SVGFEDiffuseLightingElement",
    "SVGFEDisplacementMapElement",
    "SVGFEDistantLightElement",
    "SVGFEFloodElement",
    "SVGFEFuncAElement",
    "SVGFEFuncBElement",
    "SVGFEFuncGElement",
    "SVGFEFuncRElement",
    "SVGFEGaussianBlurElement",
    "SVGFEImageElement",
    "SVGFEMergeElement",
    "SVGFEMergeNodeElement",
    "SVGFEMorphologyElement",
    "SVGFEOffsetElement",
    "SVGFEPointLightElement",
    "SVGFESpecularLightingElement",
    "SVGFESpotLightElement",
    "SVGFETileElement",
    "SVGFETurbulenceElement",
    "SVGFilterElement",
    "SVGFilterPrimitiveStandardAttributes",
    "SVGFitToViewBox",
    "SVGForeignObjectElement",
    "SVGGElement",
    "SVGGradientElement",
    "SVGGraphicsElement",
    "SVGImageElement",
    "SVGLength",
    "SVGLengthList",
    "SVGLinearGradientElement",
    "SVGLineElement",
    "SVGLocatable",
    "SVGLocatableElement",
    "SVGMarkerElement",
    "SVGMaskElement",
    "SVGMatrix",
    "SVGMetadataElement",
    "SVGMpathElement",
    "SVGMPathElement",
    "SVGNumber",
    "SVGNumberList",
    "SVGPathElement",
    "SVGPathSeg",
    "SVGPathSegArcAbs",
    "SVGPathSegArcRel",
    "SVGPathSegClosePath",
    "SVGPathSegCurvetoCubicAbs",
    "SVGPathSegCurvetoCubicRel",
    "SVGPathSegCurvetoCubicSmoothAbs",
    "SVGPathSegCurvetoCubicSmoothRel",
    "SVGPathSegCurvetoQuadraticAbs",
    "SVGPathSegCurvetoQuadraticRel",
    "SVGPathSegCurvetoQuadraticSmoothAbs",
    "SVGPathSegCurvetoQuadraticSmoothRel",
    "SVGPathSegLinetoAbs",
    "SVGPathSegLinetoHorizontalAbs",
    "SVGPathSegLinetoHorizontalRel",
    "SVGPathSegLinetoRel",
    "SVGPathSegLinetoVerticalAbs",
    "SVGPathSegLinetoVerticalRel",
    "SVGPathSegList",
    "SVGPathSegMovetoAbs",
    "SVGPathSegMovetoRel",
    "SVGPatternElement",
    "SVGPoint",
    "SVGPointList",
    "SVGPolygonElement",
    "SVGPolylineElement",
    "SVGPreserveAspectRatio",
    "SVGRadialGradientElement",
    "SVGRect",
    "SVGRectElement",
    "SVGScriptElement",
    "SVGSetElement",
    "SVGStopElement",
    "SVGStringList",
    "SVGStyleElement",
    "SVGSVGElement",
    "SVGSwitchElement",
    "SVGSymbolElement",
    "SVGTests",
    "SVGTextContentElement",
    "SVGTextElement",
    "SVGTextPathElement",
    "SVGTextPositioningElement",
    "SVGTitleElement",
    "SVGTransform",
    "SVGTransformable",
    "SVGTransformableElement",
    "SVGTransformList",
    "SVGTSpanElement",
    "SVGUnitTypes",
    "SVGURIReference",
    "SVGUseElement",
    "SVGViewElement",

    "XULButtonElement",
    "XULCheckboxElement",
    "XULCommandDispatcher",
    "XULContainerElement",
    "XULContainerItemElement",
    "XULControlElement",
    "XULDescriptionElement",
    "XULDocument",
    "XULImageElement",
    "XULLabelElement",
    "XULLabeledControlElement",
    "XULMenuListElement",
    "XULMultiSelectControlElement",
    "XULPopupElement",
    "XULRelatedElement",
    "XULSelectControlElement",
    "XULSelectControlItemElement",
    "XULTemplateBuilder",
    "XULTextBoxElement",
    "XULTreeBuilder",
    "XULTreeElement",

    "mozAudioContext",
    "BrowserFeedWriter",
    "CSS",
    "DOMStringMap",
    "WebGLBuffer",
    "WebGLFramebuffer",
    "WebGLProgram",
    "WebGLRenderbuffer",
    "WebGLShader",
    "WebGLTexture",
    "WebGLUniformLocation",
    "mozContact",
    "mozRTCIceCandidate",
    "mozRTCPeerConnection",
    "mozRTCSessionDescription",

    "devicePixelRatio",
    "external",
    "mozIndexedDB",
    "sidebar",
    "getDefaultComputedStyle",

    "Infinity",
    "NaN",
    "undefined",
    "eval",

    "speechSynthesis",
    "requestAnimationFrame",
    "cancelAnimationFrame",
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
    "replace",

    "QueryInterface"
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
    "parentElement",
    "offsetParent",
    "nextSibling",
    "previousSibling",
    "firstChild",
    "lastChild",
    "childNodes",
    "attributes",
    "contains",

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
    "setUserData",

    "QueryInterface"
];

domMemberMap.Document = Arr.extendArray(domMemberMap.Node,
[
    "documentElement",
    "body",
    "head",
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
    "readyState",

    "preferredStyleSheetSet",
    "lastStyleSheetSet",
    "styleSheetSets",
    "selectedStyleSheetSet",
    "enableStyleSheetsForSet",

    "elementFromPoint",
    "hasFocus",
    "activeElement",

    "getElementsByClassName",
    "querySelector",
    "querySelectorAll",

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
    "setUserData",

    "hidden",
    "mozFullScreen",
    "mozFullScreenElement",
    "mozFullScreenEnabled",
    "mozHidden",
    "mozPointerLockElement",
    "mozSyntheticDocument",
    "mozVisibilityState",
    "currentScript",
    "scripts",
    "visibilityState",
    "caretPositionFromPoint",
    "getItems",
    "mozCancelFullScreen",
    "mozExitPointerLock",
    "mozSetImageElement",
    "releaseCapture"
]);

domMemberMap.Element = Arr.extendArray(domMemberMap.Node,
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
    "click",
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
    "setUserData",

    "childElementCount",
    "children",
    "classList",
    "clientLeft",
    "clientTop",
    "contentEditable",
    "draggable",
    "firstElementChild",
    "lastElementChild",
    "nextElementSibling",
    "previousElementSibling",

    "getBoundingClientRect",
    "getClientRects",
    "getElementsByClassName",
    "mozMatchesSelector",
    "querySelector",
    "querySelectorAll",
    "scrollIntoView",

    "isContentEditable",
    "dataset",
    "contextMenu",
    "accessKey",
    "accessKeyLabel",
    "outerHTML",
    "properties",
    "scrollLeftMax",
    "scrollTopMax",
    "insertAdjacentHTML",
    "mozRequestFullScreen",
    "mozRequestPointerLock",

    "itemId",
    "itemRef",
    "itemScope",
    "itemProp",
    "itemType",
    "itemValue",

    "onload",
    "hidden",
    "setCapture",
    "releaseCapture"
]);

domMemberMap.SVGElement = Arr.extendArray(domMemberMap.Element,
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

domMemberMap.SVGSVGElement = Arr.extendArray(domMemberMap.Element,
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

domMemberMap.HTMLImageElement = Arr.extendArray(domMemberMap.Element,
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

domMemberMap.HTMLAnchorElement = Arr.extendArray(domMemberMap.Element,
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
    "ping",
    "download",
    "charset"
]);

domMemberMap.HTMLIFrameElement = Arr.extendArray(domMemberMap.Element,
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

domMemberMap.HTMLTableElement = Arr.extendArray(domMemberMap.Element,
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

domMemberMap.HTMLTableRowElement = Arr.extendArray(domMemberMap.Element,
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

domMemberMap.HTMLTableCellElement = Arr.extendArray(domMemberMap.Element,
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

domMemberMap.HTMLScriptElement = Arr.extendArray(domMemberMap.Element,
[
    "src",
    "type",
    "async",
    "charset",
    "crossOrigin",
    "defer",
    "event",
    "htmlFor",
    "text"
]);

domMemberMap.HTMLButtonElement = Arr.extendArray(domMemberMap.Element,
[
    "accessKey",
    "disabled",
    "form",
    "name",
    "type",
    "value",

    "autofocus",
    "formAction",
    "formEnctype",
    "formMethod",
    "formNoValidate",
    "formTarget",

    "validity",
    "validationMessage",
    "willValidate",
    "checkValidity",
    "setCustomValidity",

    "click"
]);

domMemberMap.HTMLInputElement = Arr.extendArray(domMemberMap.Element,
[
    "type",
    "value",
    "checked",
    "accept",
    "accessKey",
    "alt",
    "autocomplete",
    "autofocus",
    "controllers",
    "defaultChecked",
    "defaultValue",
    "disabled",
    "form",
    "formAction",
    "formEnctype",
    "formMethod",
    "formNoValidate",
    "formTarget",
    "maxLength",
    "name",
    "readOnly",
    "selectionEnd",
    "selectionStart",
    "size",
    "src",
    "textLength",
    "useMap",

    "files",
    "indeterminate",
    "multiple",
    "list",
    "mozGetFileNameArray",
    "mozSetFileNameArray",

    "pattern",
    "placeholder",
    "required",

    "height",
    "width",
    "inputmode",
    "max",
    "min",
    "step",
    "selectionDirection",
    "validity",
    "validationMessage",
    "willValidate",
    "checkValidity",
    "setCustomValidity",
    "valueAsDate",
    "valueAsNumber",
    "mozIsTextField",
    "stepUp",
    "stepDown",

    "click",
    "select",
    "setSelectionRange"
]);

domMemberMap.HTMLFormElement = Arr.extendArray(domMemberMap.Element,
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

    "checkValidity",
    "noValidate",
    "autocomplete",

    "reset",
    "submit"
]);

domMemberMap.HTMLBodyElement = Arr.extendArray(domMemberMap.Element,
[
    "aLink",
    "background",
    "bgColor",
    "link",
    "text",
    "vLink"
]);

domMemberMap.HTMLHtmlElement = Arr.extendArray(domMemberMap.Element,
[
    "version"
]);

domMemberMap.Text = Arr.extendArray(domMemberMap.Node,
[
    "data",
    "length",

    "appendData",
    "deleteData",
    "insertData",
    "replaceData",
    "splitText",
    "wholeText",
    "substringData"
]);

domMemberMap.Attr = Arr.extendArray(domMemberMap.Node,
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

domMemberMap.Array = Object.getOwnPropertyNames(Array.prototype).filter(function(name)
{
    return name !== "length";
});

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

Dom.domConstantMap =
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
    "KEYFRAMES_RULE": 1,
    "KEYFRAME_RULE": 1,
    "MOZ_KEYFRAMES_RULE": 1,
    "MOZ_KEYFRAME_RULE": 1,
    "NAMESPACE_RULE": 1,
    "SUPPORTS_RULE": 1,

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
    // xxxsz: May be removed as soon as Firefox 30 is the minimum supported version
    // See https://bugzil.la/969247
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

    "UNCACHED": 1,
    "IDLE": 1,
    "CHECKING": 1,
    "DOWNLOADING": 1,
    "UPDATEREADY": 1,
    "OBSOLETE": 1,

    "SVG_ZOOMANDPAN_DISABLE": 1,
    "SVG_ZOOMANDPAN_MAGNIFY": 1,
    "SVG_ZOOMANDPAN_UNKNOWN": 1
};

// ********************************************************************************************* //
// Inline Event Handlers (introduced in Firefox 9)

/**
 * List of event handlers that are settable via on* DOM properties.
 */
Dom.domInlineEventHandlersMap =
{
    "onabort": 1,
    "onafterprint": 1,
    "onafterscriptexecute": 1,
    "onbeforeprint": 1,
    "onbeforescriptexecute": 1,
    "onbeforeunload": 1,
    "onblur": 1,
    "oncanplay": 1,
    "oncanplaythrough": 1,
    "onchange": 1,
    "onclick": 1,
    "oncontextmenu": 1,
    "oncopy": 1,
    "oncut": 1,
    "ondblclick": 1,
    "ondevicemotion": 1,
    "ondeviceorientation": 1,
    "ondrag": 1,
    "ondragend": 1,
    "ondragenter": 1,
    "ondragleave": 1,
    "ondragover": 1,
    "ondragstart": 1,
    "ondrop": 1,
    "ondurationchange": 1,
    "onemptied": 1,
    "onended": 1,
    "onerror": 1,
    "onfocus": 1,
    "onhashchange": 1,
    "oninput": 1,
    "oninvalid": 1,
    "onkeydown": 1,
    "onkeypress": 1,
    "onkeyup": 1,
    "onload": 1,
    "onloadeddata": 1,
    "onloadedmetadata": 1,
    "onloadstart": 1,
    "onmessage": 1,
    "onmousedown": 1,
    "onmousemove": 1,
    "onmouseout": 1,
    "onmouseover": 1,
    "onmouseup": 1,
    "onoffline": 1,
    "ononline": 1,
    "onpagehide": 1,
    "onpageshow": 1,
    "onpaste": 1,
    "onpause": 1,
    "onplay": 1,
    "onplaying": 1,
    "onpopstate": 1,
    "onprogress": 1,
    "onratechange": 1,
    "onreadystatechange": 1,
    "onreset": 1,
    "onresize": 1,
    "onscroll": 1,
    "onseeked": 1,
    "onseeking": 1,
    "onselect": 1,
    "onshow": 1,
    "onstalled": 1,
    "onsubmit": 1,
    "onsuspend": 1,
    "ontimeupdate": 1,
    "onunload": 1,
    "onvolumechange": 1,
    "onwaiting": 1,
    "onmozfullscreenchange": 1,
    "ondevicelight": 1,
    "ondeviceproximity": 1,
    "onmouseenter": 1,
    "onmouseleave": 1,
    "onmozfullscreenerror": 1,
    "onmozpointerlockchange": 1,
    "onmozpointerlockerror": 1,
    "onuserproximity": 1,
    "ongotpointercapture": 1,
    "onlostpointercapture": 1,
    "onpointercancel": 1,
    "onpointerdown": 1,
    "onpointerenter": 1,
    "onpointerleave": 1,
    "onpointermove": 1,
    "onpointerout": 1,
    "onpointerover": 1,
    "onpointerup": 1,
    "onwheel": 1
};

// ********************************************************************************************* //
// Registration

return Dom;

// ********************************************************************************************* //
});
