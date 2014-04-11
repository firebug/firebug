/* See license.txt for terms of usage */
/*global define:1, Components:1, Window:1*/

define([
    "firebug/lib/trace",
    "firebug/lib/css",
    "firebug/lib/array",
    "firebug/lib/wrapper",
],
function(FBTrace, Css, Arr, Wrapper) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

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

/**
 * @Deprecated Use native Firefox function node.getElementsByClassName(classes)[0]
 */
Dom.getElementByClass = function(node, className)  // className, className, ...
{
    return Dom.getElementsByClass.apply(this,arguments).item(0);
};

/**
 * @Deprecated Use native Firefox function node.getElementsByClassName(classes)
 */
Dom.getElementsByClass = function(node, className)  // className, className, ...
{
    var args = Arr.cloneArray(arguments); args.splice(0, 1);
    return node.getElementsByClassName(args.join(" "));
};

Dom.getElementsByAttribute = function(node, attrName, attrValue)
{
    function escape(string)
    {
        if (typeof string !== "string")
            return string;

        // xxxsz: Firefox 31 added support for CSS.escape() (See https://bugzil.la/955860)
        // So the check and the code afterwards can be removed as soon as Firefox 31 is the
        // minimum supported version
        if (typeof CSS !== "undefined" && CSS.escape)
            return CSS.escape(string);

        return string.replace(/[\\'"]/g, (x) => "\\" + x);
    }

    if (!node || typeof node !== "object" ||
        !(node instanceof Element || node instanceof Document || node instanceof DocumentFragment))
    {
        throw new Error("'node' is invalid");
    }

    var selector = attrValue !== undefined ?
        "[" + attrName + "='" + escape(attrValue) + "']" : "[" + attrName + "]";
    return node.querySelectorAll(selector);
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

/**
 * @Deprecated Use native Firefox node.nextElementSibling
 */
Dom.getNextElement = function(node)
{
    while (node && node.nodeType != Node.ELEMENT_NODE)
        node = node.nextSibling;

    return node;
};

/**
 * @Deprecated Use native Firefox node.previousElementSibling
 */
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
};

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
    element = Wrapper.wrapObject(element);

    if (domMappedData.has(element))
        return domMappedData.get(element);

    var elementData = {};
    domMappedData.set(element, elementData);
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

// deprecated
Dom.getDOMMembers = function()
{
    return {};
};

Dom.DOMMemberTester = function(object)
{
    if (!object || !(typeof object === "object" || typeof object === "function"))
    {
        this.isDOMMember = this.isDOMConstant = () => false;
        return;
    }

    var global = Cu.getGlobalForObject(object);
    var wrappedObject = Wrapper.wrapObject(object);
    var isArray = Array.isArray(object);

    // We define "native" objects as ones that admit Xrays, with two exceptions:
    // arrays and plain objects (which will become Xrays in bug 987163 and bug 987111,
    // respectively).
    var isNative = (!isArray && Cu.isXrayWrapper(wrappedObject) &&
        Object.prototype.toString.call(wrappedObject) !== "[object Object]");

    var isWindow = (isNative && wrappedObject instanceof Window);
    var objProto = null;
    try
    {
        objProto = Wrapper.unwrapObject(global.Object).prototype;
    }
    catch (exc) {}

    this.isDOMMember = function(propName)
    {
        try
        {
            // For arrays, we just check property names against what we have
            // in chrome scope. "length" is treated the same as indices.
            if (isArray)
                return (propName !== "length" && propName in []);

            // Special case for window objects, which have built-in properties that are
            // not on the xray. (TODO: Re-test after bug 789261 lands.)
            if (isWindow && WindowProps.hasOwnProperty(propName))
                return true;

            if (isNative)
                return (propName in wrappedObject || propName in {});

            // Last chance, check for things from Object.prototype.
            // Verify that the property value matches what's on Object.prototype, to
            // avoid hiding e.g. custom toString methods.
            return (objProto && propName in {} && object[propName] === objProto[propName]);
        }
        catch (exc)
        {
            // Let's be safe and claim that it's a user property.
            return false;
        }
    };

    this.isDOMConstant = function(name)
    {
        return (isNative && name.toUpperCase() === name && name.toLowerCase() !== name);
    };
};

Dom.isDOMMember = function(object, name)
{
    return new Dom.DOMMemberTester(object).isDOMMember(name);
};

Dom.isDOMConstant = function(object, name)
{
    return new Dom.DOMMemberTester(object).isDOMConstant(name);
};

Dom.isInlineEventHandler = function(name)
{
    return Dom.domInlineEventHandlersMap.hasOwnProperty(name);
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

var WindowProps =
{
    "Infinity": 1,
    "InstallTrigger": 1,
    "NaN": 1,
    "SpeechSynthesis": 1,
    "decodeURI": 1,
    "decodeURIComponent": 1,
    "dumpProfile": 1,
    "encodeURI": 1,
    "encodeURIComponent": 1,
    "escape": 1,
    "external": 1,
    "isFinite": 1,
    "isNaN": 1,
    "netscape": 1,
    "parseFloat": 1,
    "parseInt": 1,
    "pauseProfilers": 1,
    "resumeProfilers": 1,
    "sidebar": 1,
    "startProfiling": 1,
    "stopProfiling": 1,
    "toSource": 1,
    "undefined": 1,
    "unescape": 1,
    "uneval": 1,
};

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
