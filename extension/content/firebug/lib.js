/* See license.txt for terms of usage */

var FBL = XPCOMUtils;

try { /*@explore*/

(function() {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
this.fbs = Cc["@joehewitt.com/firebug;1"].getService().wrappedJSObject;
this.jsd = this.CCSV("@mozilla.org/js/jsd/debugger-service;1", "jsdIDebuggerService");
const finder = this.finder = this.CCIN("@mozilla.org/embedcomp/rangefind;1", "nsIFind");
const wm = this.CCSV("@mozilla.org/appshell/window-mediator;1", "nsIWindowMediator");

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
this.reFile = /file:\/\/([^\/]*)\//;
this.reUpperCase = /[A-Z]/;

const reSplitLines = /\r\n|\r|\n/;
const reFunctionArgNames = /function ([^(]*)\(([^)]*)\)/;
const reGuessFunction = /['"]?([0-9A-Za-z_]+)['"]?\s*[:=]\s*(function|eval|new Function)/;
const reWord = /([A-Za-z_$][A-Za-z_$0-9]*)(\.([A-Za-z_$][A-Za-z_$0-9]*))*/;

const overrideDefaultsWithPersistedValuesTimeout = 500;

const NS_SEEK_SET = Ci.nsISeekableStream.NS_SEEK_SET;

const SHOW_ALL = Ci.nsIDOMNodeFilter.SHOW_ALL;

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

this.bind = function()  // fn, thisObject, args => thisObject.fn(args, arguments);
{
   var args = cloneArray(arguments), fn = args.shift(), object = args.shift();
   return function() { return fn.apply(object, arrayInsert(cloneArray(args), 0, arguments)); }
};

this.bindFixed = function() // fn, thisObject, args => thisObject.fn(args);
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
        return "[an object with no toString() function]";
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
    	if (FBTrace.DBG_ERRORS)
    		FBTrace.sysout("lib.convertToUnicode: fails: for charset "+charset+": "+exc, exc);
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
    var style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
    style.setAttribute("charset","utf-8");
    style.firebugIgnore = true;
    style.setAttribute("type", "text/css");
    style.innerHTML = this.getResource(url);
    return style;
}

this.addStyleSheet = function(doc, style)
{
    var heads = doc.getElementsByTagName("head");
    if (heads.length)
        heads[0].appendChild(style);
    else
        doc.documentElement.appendChild(style);
};

this.addScript = function(doc, id, src)
{
    var element = doc.createElementNS("http://www.w3.org/1999/xhtml", "script");
    element.setAttribute("type", "text/javascript");
    element.setAttribute("id", id);
    if (!FBTrace.DBG_CONSOLE)
    	element.firebugIgnore = true;

    element.innerHTML = src;
    if (doc.documentElement)
        doc.documentElement.appendChild(element);
    else
    {
        // See issue 1079, the svg test case gives this error
        if (FBTrace.DBG_ERRORS)
            FBTrace.dumpProperties("lib.addScript doc has no documentElement:", doc);
    }
    return element;
}

// ************************************************************************************************
// Localization

/*
 * $STR - intended for localization of a static string.
 * $STRF - intended for localization of a string with dynamically inserted values.
 * 
 * Notes:
 * 1) Name with _ in place of spaces is the key in the firebug.properties file.
 * 2) If the specified key isn't localized for particular language, both methods use
 *    the part after the last dot (in the specified name) as the return value.
 *
 * Examples:
 * $STR("Label"); - search for key "Label" within the firebug.properties file 
 *                 and returns its value. If the key doesn't exist returns "Label".
 * 
 * $STR("Button Label"); - search for key "Button_Label" withing the firebug.properties
 *                        file. If the key doesn't exist returns "Button Label".
 *
 * $STR("net.Response Header"); - search for key "net.Response_Header". If the key doesn't 
 *                               exist returns "Response Header".
 *
 * firebug.properties:
 * net.timing.Request_Time=Request Time: %S [%S]
 * 
 * var param1 = 10;
 * var param2 = "ms";
 * $STRF("net.timing.Request Time", param1, param2);  -> "Request Time: 10 [ms]"
 *                                          
 * - search for key "net.timing.Request_Time" within the firebug.properties file. Parameters 
 *   are inserted at specified places (%S) in the same order as they are passed. If the 
 *   key doesn't exist the method returns "Request Time".
 */
function $STR(name, bundleId) 
{
    if (!bundleId)
        bundleId = "strings_firebug";
        
    try
    {
        return document.getElementById(bundleId).getString(name.replace(' ', '_', "g"));
    }
    catch (err)
    {
        if (FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("lib.getString: " + name + "\n");
            FBTrace.dumpProperties("lib.getString FAILS ", err);
        }
    }

    // Use only the label after last dot.
    var index = name.lastIndexOf(".");
    if (index > 0)
        name = name.substr(index + 1);

    return name;
}

function $STRF(name, args, bundleId)
{
    if (!bundleId)
        bundleId = "strings_firebug";

    try
    {
        return document.getElementById(bundleId).getFormattedString(name.replace(' ', '_', "g"), args);
    }
    catch (err)
    {
        if (FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("lib.getString: " + name + "\n");
            FBTrace.dumpProperties("lib.getString FAILS ", err);
        }
    }

    // Use only the label after last dot.
    var index = name.lastIndexOf(".");
    if (index > 0)
        name = name.substr(index + 1);

    return name;
}

this.$STR = $STR;
this.$STRF = $STRF;

/*
 * Use the current value of the attribute as a key to look up the localized value.
 */
this.internationalize = function(element, attr, args)
{
    if (typeof element == "string")
        element = document.getElementById(element);

    if (element)
    {
        var xulString = element.getAttribute(attr);
        var localized = args ? $STRF(xulString, args) : $STR(xulString);

        // Set localized value of the attribute.
        element.setAttribute(attr, localized);
    }
    else
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("Failed to internationalize element with attr "+attr+' args:'+args);
    }
}

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

    if (win == top || !win.frames) return; // XXXjjb hack for chromeBug

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

this.hasClass = function(node, name) // className, className, ...
{
    if (!node || node.nodeType != 1)
        return false;
    else
    {
        for (var i=1; i<arguments.length; ++i)
        {
            var name = arguments[i];
            var re = new RegExp("(^|\\s)"+name+"($|\\s)");
            if (!re.exec(node.getAttribute("class")))
                return false;
        }

        return true;
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

this.getChildByClass = function(node) // ,classname, classname, classname...
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

this.getElementByClass = function(node, className)  // className, className, ...
{
    var args = cloneArray(arguments); args.splice(0, 1);
    for (var child = node.firstChild; child; child = child.nextSibling)
    {
        var args1 = cloneArray(args); args1.unshift(child);
        if (FBL.hasClass.apply(null, args1))
            return child;
        else
        {
            var found = FBL.getElementByClass.apply(null, args1);
            if (found)
                return found;
        }
    }

    return null;
};

this.getElementsByClass = function(node, className)  // className, className, ...
{
    function iteratorHelper(node, classNames, result)
    {
        for (var child = node.firstChild; child; child = child.nextSibling)
        {
            var args1 = cloneArray(classNames); args1.unshift(child);
            if (FBL.hasClass.apply(null, args1))
                result.push(child);

            iteratorHelper(child, classNames, result);
        }
    }

    var result = [];
    var args = cloneArray(arguments); args.shift();
    iteratorHelper(node, args, result);
    return result;
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
    range.selectNode(element || doc.documentElement);

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
        rule = this.trimLeft(rule);
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
            if (p.nodeType == 1) // element node
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
        else  // no offsetParent
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

this.linesIntoCenterView = function(element, scrollBox)  // {before: int, after: int}
{
    if (!scrollBox)
        scrollBox = this.getOverflowParent(element);

    if (!scrollBox)
        return;

    var offset = this.getClientOffset(element);

    var topSpace = offset.y - scrollBox.scrollTop;
    var bottomSpace = (scrollBox.scrollTop + scrollBox.clientHeight)
            - (offset.y + element.offsetHeight);

    if (topSpace < 0 || bottomSpace < 0)
    {
        var split = (scrollBox.clientHeight/2);
        var centerY = offset.y - split;
        scrollBox.scrollTop = centerY;
        topSpace = split;
        bottomSpace = split -  element.offsetHeight;
    }

    return {before: Math.round((topSpace/element.offsetHeight) + 0.5),
            after: Math.round((bottomSpace/element.offsetHeight) + 0.5) }
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
    if (FBTrace.DBG_INSPECT)
    	FBTrace.sysout("readBoxStyles ", styles);
    return styles;
};

this.getBoxFromStyles = function(style, element)
{
    var args = this.readBoxStyles(style);
    args.width = element.offsetWidth
        - (args.paddingLeft+args.paddingRight+args.borderLeft+args.borderRight);
    args.height = element.offsetHeight
        - (args.paddingTop+args.paddingBottom+args.borderTop+args.borderBottom);
    return args;
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
	//http://www.w3.org/TR/DOM-Level-2-Style/stylesheets.html#StyleSheets-StyleSheet. For inline style sheets, the value of this attribute is null.
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
        var str = text+"";
        var theSplit = str.split(reSplitLines);
        return theSplit;
    }
};

this.trimLeft = function(text)
{
    return text.replace(/^\s*|\s*$/g,"");
}

this.wrapText = function(text, noEscapeHTML)
{
    var reNonAlphaNumeric = /[^A-Za-z_$0-9'"-]/;

    var html = [];
    var wrapWidth = Firebug.textWrapWidth;

    var lines = this.splitLines(text);
    for (var i = 0; i < lines.length; ++i)
    {
        var line = lines[i];
        while (line.length > wrapWidth)
        {
            var m = reNonAlphaNumeric.exec(line.substr(wrapWidth, 100));
            var wrapIndex = wrapWidth+ (m ? m.index : 0);
            var subLine = line.substr(0, wrapIndex);
            line = line.substr(wrapIndex);
            html.push(noEscapeHTML ? subLine : escapeHTML(subLine));
        }
        html.push(noEscapeHTML ? line : escapeHTML(line));
    }

    return html.join("\n");
}

this.insertWrappedText = function(text, textBox, noEscapeHTML)
{
    textBox.innerHTML = "<pre>" + this.wrapText(text, noEscapeHTML) + "</pre>";
}

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
        command: this.bindFixed(Firebug.setPref, Firebug, Firebug.servicePrefDomain, option, !Firebug[option]) };
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

    for (; frame && frame.isValid; frame = frame.callingFrame)
    {
        if (!(Firebug.filterSystemURLs && this.isSystemURL(FBL.normalizeURL(frame.script.fileName))))
        {
            var stackFrame = this.getStackFrame(frame, context);
            if (stackFrame)
                trace.frames.push(stackFrame);
        }
        else
        {                                                                                                           /*@explore*/
            if (FBTrace.DBG_STACK)                                                                                     /*@explore*/
                FBTrace.sysout("lib.getStackTrace isSystemURL frame.script.fileName "+frame.script.fileName+"\n");     /*@explore*/
        }                                                                                                           /*@explore*/
    }

    if (trace.frames.length > 100)
    {
        var originalLength = trace.frames.length;
        trace.frames.splice(50, originalLength - 100);
        var excuse = "(eliding "+(originalLength - 100)+" frames)";
        trace.frames[50] = new this.StackFrame(context, excuse, null, excuse, 0, []);
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
            if (!fncSpec.name)
                fncSpec.name = frame.script.functionName;

            if (FBTrace.DBG_STACK) FBTrace.sysout("lib.getStackFrame for sourceFile", sourceFile);
            return new this.StackFrame(context, fncSpec.name, frame.script, url, lineNo, fncSpec.args, frame.pc);
        }
        else
        {
            if (FBTrace.DBG_STACK) 
            	FBTrace.sysout("lib.getStackFrame NO sourceFile tag@file:"+frame.script.tag+"@"+frame.script.fileName, frame.script.functionSource);

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
                var httpObserverFile = "firebug@software.joehewitt.com/components/firebug-http-observer.js";
                if (frame.filename && frame.filename.indexOf("chrome://firebug/") != 0 &&
                    frame.filename.indexOf(httpObserverFile) == -1)
                    break;
            }
            break;
        }
    }
    return this.getFrameSourceLink(frame);
}

this.getFrameSourceLink = function(frame)
{
    if (frame && frame.filename && frame.filename.indexOf("XPCSafeJSObjectWrapper") == -1)
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

this.findScripts = function(context, url, line)
{
    var sourceFile = context.sourceFileMap[url];
    if (sourceFile)
        var scripts = sourceFile.scriptsIfLineCouldBeExecutable(line);
    else
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("lib.findScript, no sourceFile in context for url=", url);
    }
    return scripts;
};

this.findScriptForFunctionInContext = function(context, fn)
{
    var found = null;

    if (!fn.toString)
        return found;

    var fns = fn.toString();
    this.forEachFunction(context, function findMatchingScript(script, aFunction)
    {
        if (!aFunction.toString)
            return;
        try {
            var tfs = aFunction.toString();
        } catch (etfs) {
            FBTrace.dumpProperties("unwrapped.toString fails for unwrapped: "+etfs, aFunction);
        }

        if (tfs == fns)
            found = script;
    });
    
    if (FBTrace.DBG_FUNCTION_NAMES)
        FBTrace.sysout("findScriptForFunctionInContext found "+(found?found.tag:"none")+"\n");

    return found;
}

this.forEachFunction = function(context, cb)
{
    for (var url in context.sourceFileMap)
    {
        var sourceFile = context.sourceFileMap[url];
        if (FBTrace.DBG_FUNCTION_NAMES)
            FBTrace.sysout("lib.forEachFunction Looking in "+sourceFile+"\n");
        var rc = sourceFile.forEachScript(function seekFn(script)
        {
            if (!script.isValid)
                return;
            try
            {
                var testFunctionObject = script.functionObject;
                if (!testFunctionObject.isValid)
                    return false;
                var theFunction = testFunctionObject.getWrappedValue();

                var rc = cb(script, theFunction);
                if (rc)
                    return rc;
            }
            catch(exc)
            {
                if (FBTrace.DBG_ERRORS)
                {
                    if (exc.name == "NS_ERROR_NOT_AVAILABLE")
                        FBTrace.sysout("lib.forEachFunction no functionObject for "+script.tag+"_"+script.fileName+"\n");
                    else
                       FBTrace.dumpProperties("lib.forEachFunction FAILS ",exc);
                }
            }
        });
        if (rc)
            return rc;
    }
    return false;
}

this.findScriptForFunction = function(fn)
{
    var found = {tag: "not set"};

    this.jsd.enumerateScripts({enumerateScript: function findScriptMatchingFn(script)
    {
        try {
            if (script.isValid)
            {

                var iValueFunctionObject = script.functionObject;
                //FBTrace.dumpIValue("lib.findScriptForFunction iValueFunctionObject", iValueFunctionObject);
                var testFunctionObject = script.functionObject.getWrappedValue();
                if (testFunctionObject instanceof Function)
                    FBTrace.sysout("lib.findScriptForFunction testFunctionObject "+testFunctionObject+" vs "+fn+"\n");
                if (testFunctionObject == fn)
                {
                    found = script;
                    return;
                }
            }
        } catch (exc) {
            if (FBTrace.DBG_ERRORS)
            {
                if (exc.name == "NS_ERROR_NOT_AVAILABLE")
                    FBTrace.sysout("lib.findScriptForFunction no functionObject for "+script.tag+"_"+script.fileName+"\n");
                else
                    FBTrace.dumpProperties("lib.findScriptForFunction FAILS ",exc);
            }
        }
    }});

    FBTrace.dumpProperties("findScriptForFunction found ", found.tag);
    return found;
};

this.findSourceForFunction = function(fn, context)
{
    var script = this.findScriptForFunctionInContext(context, fn);
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
            if (FBTrace.DBG_STACK) FBTrace.sysout("getFunctionName analyzer.sourceFile:", analyzer.sourceFile);     /*@explore*/
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
        if (FBTrace.DBG_FUNCTION_NAMES) FBTrace.sysout("getFunctionNameFromLines for line@URL="+lineNo+"@"+url+"\n");           /*@explore*/
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

this.getSourceFileByHref = function(url, context)
{
    return context.sourceFileMap[url];
};

this.getAllStyleSheets = function(context)
{
	var styleSheets = [];
	 
    function addSheet(sheet)
    {
        var sheetLocation =  FBL.getURLForStyleSheet(sheet);

        if (FBL.isSystemURL(sheetLocation) && Firebug.filterSystemURLs)
            return;

        styleSheets.push(sheet);

        for (var i = 0; i < sheet.cssRules.length; ++i)
        {
            var rule = sheet.cssRules[i];
            if (rule instanceof CSSImportRule)
                addSheet(rule.styleSheet);
        }
    }

    this.iterateWindows(context.window, function(subwin)
    {
    	var rootSheets = subwin.document.styleSheets;
    	for (var i = 0; i < rootSheets.length; ++i)
    		addSheet(rootSheets[i]);
    });

    return styleSheets;
};

this.getStyleSheetByHref = function(url, context)
{
    function addSheet(sheet)
    {
        if (FBL.getURLForStyleSheet(sheet) == url)
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

    var sheetIfFound = null;
    this.iterateWindows(context.window, function(subwin)
    {
    	var rootSheets = context.window.document.styleSheets;
    	for (var i = 0; i < rootSheets.length; ++i)
    	{
    		sheetIfFound = addSheet(rootSheets[i]);
    		if (sheetIfFound)
    			return sheetIfFound;
    	}
    });
    
    return sheetIfFound;
};

this.sourceURLsAsArray = function(context)
{
    var urls = [];
    var sourceFileMap = context.sourceFileMap;
    for (var url in sourceFileMap)
        urls.push(url);
    
    if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("sourceURLsAsArray urls="+urls.length+" in context "+context.window.location+"\n");

    return urls;
};

this.sourceFilesAsArray = function(sourceFileMap)
{
    var sourceFiles = [];
    for (var url in sourceFileMap)
        sourceFiles.push(sourceFileMap[url]);
    if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("sourceFilesAsArray sourcefiles="+sourceFiles.length+"\n"); 
    return sourceFiles;
};

this.updateScriptFiles = function(context, eraseSourceFileMap)  // scan windows for 'script' tags
{
    var oldMap = eraseSourceFileMap ? null : context.sourceFileMap;

    if (FBTrace.DBG_SOURCEFILES)
    {
        FBTrace.sysout("updateScriptFiles oldMap "+oldMap+"\n");
        this.sourceFilesAsArray(context.sourceFileMap);  // just for length trace
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
    if (FBTrace.DBG_SOURCEFILES)
    {
        FBTrace.dumpProperties("updateScriptFiles sourcefiles:", this.sourceFilesAsArray(context.sourceFileMap));
    }
};

// ************************************************************************************************
// Firefox browsing

this.openNewTab = function(url)
{
    if (url)
        gBrowser.selectedTab = gBrowser.addTab(url);
};

this.openWindow = function(windowType, url, features, params)
{
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

// Iterate over all opened firefox windows of the given type. If the callback returns true
// the iteration is stopped.
this.iterateBrowserWindows = function(windowType, callback)
{
    var windowList = wm.getZOrderDOMWindowEnumerator(windowType, true);
    if (!windowList.hasMoreElements())
        windowList = wm.getEnumerator(windowType);

    while (windowList.hasMoreElements()) {
        if (callback(windowList.getNext()))
            return true;
    }

    return false;
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
    try {
        if (FBTrace.DBG_DISPATCH) 
        	FBTrace.sysout("FBL.dispatch "+name+" to "+listeners.length+" listeners\n");              /*@explore*/

        for (var i = 0; i < listeners.length; ++i)
        {
            var listener = listeners[i];
            if ( listener[name] )
                listener[name].apply(listener, args);
            else
            {
            	if (FBTrace.DBG_DISPATCH)
            		FBTrace.sysout("FBL.dispatch, listener "+i+" has no method "+name, listener);
            }
        }
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
        {
            FBTrace.dumpProperties(" Exception in lib.dispatch "+ name, exc);
            //FBTrace.dumpProperties(" Exception in lib.dispatch listener", listener);
        }
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
	if (this.isDataURL(url))
		return this.splitDataURL(url);
	return this.splitURLTrue(url);
};

this.splitDataURL = function(url)
{
	var mark = url.indexOf(':', 3);
	if (mark != 4)
		return false;	//  the first 5 chars must be 'data:'
	
	var point = url.indexOf(',', mark+1);
	if (point < mark)
		return false; // syntax error
	
	var props = { encodedContent: url.substr(point+1) };
	
	var metadataBuffer = url.substr(mark+1, point);
	var metadata = metadataBuffer.split(';');
	for (var i = 0; i < metadata.length; i++)
	{
		var nv = metadata[i].split('=');
		if (nv.length == 2)
			props[nv[0]] = nv[1];
	}
	
	// Additional Firebug-specific properties
	if (props.hasOwnProperty('fileName')) 
	{
		 var caller_URL = decodeURIComponent(props['fileName']);
	     var caller_split = this.splitURLTrue(caller_URL);

        if (props.hasOwnProperty('baseLineNumber'))  // this means it's probably an eval()
        {
        	props['path'] = caller_split.path;
        	props['line'] = props['baseLineNumber'];
        	var hint = decodeURIComponent(props['encodedContent'].substr(0,200)).replace(/\s*$/, "");
            props['name'] =  'eval->'+hint;
        }
        else
        {
        	props['name'] = caller_split.name;
        	props['path'] = caller_split.path;
        }
    }
	else
	{
		if (!props.hasOwnProperty('path'))
			props['path'] = "data:";
		if (!props.hasOwnProperty('name'))
			props['name'] =  decodeURIComponent(props['encodedContent'].substr(0,200)).replace(/\s*$/, "");
	}
    
	return props;
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
    if (!url) return true;
    if (url.length == 0) return true;
    if (url[0] == 'h') return false;
    if (url.substr(0, 9) == "resource:")
        return true;
    else if (url.substr(0, 17) == "chrome://firebug/")
        return true;
    else if (url  == "XPCSafeJSObjectWrapper.cpp")
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
        if (uri)
            return uri.host;
        else
            return "";
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
    else if (url.substr(0, 8) == "wyciwyg:")
        return true;
    else
        return false;
};

this.isDataURL = function(url)
{
	return (url && url.substr(0,5) == "data:");
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

this.getDataURLForContent = function(content, url)
{
    // data:text/javascript;fileName=x%2Cy.js;baseLineNumber=10,<the-url-encoded-data>
    var uri = "data:text/html;";
    uri += "fileName="+encodeURIComponent(url)+ ","
    uri += encodeURIComponent(content);
    return uri;
},

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
    var m = /[^:]+:\/{1,3}(www\.)?([^\/]+)/.exec(url);
    return m ? m[2] : "";
};

this.absoluteURL = function(url, baseURL)
{
    return this.absoluteURLWithDots(url, baseURL).replace("/./", "/", "g");
};

this.absoluteURLWithDots = function(url, baseURL)
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
    if (!url)
        return "";
    // Replace one or more characters that are not forward-slash followed by /.., by space.
    if (url.length < 255) // guard against monsters.
        url = url.replace(/[^/]+\/\.\.\//, "", "g");
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

    // Unescape '+' characters that are used to encode a space.
    // See section 2.2.in RFC 3986: http://www.ietf.org/rfc/rfc3986.txt
    text = text.replace(/\+/g, " ");

    var args = text.split("&");
    for (var i = 0; i < args.length; ++i)
    {
        try {
            var parts = args[i].split("=");
            if (parts.length == 2)
            {
                if (parts[1].length > maxValueLength)
                    parts[1] = this.$STR("LargeData");

                params.push({name: decodeURIComponent(parts[0]), value: decodeURIComponent(parts[1])});
            }
            else
                params.push({name: decodeURIComponent(parts[0]), value: ""});
        } catch (e) {
            FBTrace.sysout("parseURLEncodedText EXCEPTION ", e);
            FBTrace.sysout("parseURLEncodedText EXCEPTION URI", args[i]);
        }
    }

    params.sort(function(a, b) { return a.name <= b.name ? -1 : 1; });

    return params;
};

this.reEncodeURL= function(file, text)
{
    var lines = text.split("\n");
    var params = this.parseURLEncodedText(lines[lines.length-1]);

    var args = [];
    for (var i = 0; i < params.length; ++i)
        args.push(encodeURIComponent(params[i].name)+"="+encodeURIComponent(params[i].value));

    var url = file.href;
    url += (url.indexOf("?") == -1 ? "?" : "&") + args.join("&");
    
    return url;
};

this.getResource = function(aURL)
{
    var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

    try 
    {
    	var channel=ioService.newChannel(aURL,null,null);
    	var input=channel.open();
        return FBL.readFromStream(input);
    }
    catch (e)
    {
    	if (FBTrace.DBG_ERRORS)
    		FBTrace.sysout("lib.getResource FAILS for "+aURL, e);
    }
};

// ************************************************************************************************
// Network

this.readFromStream = function(stream, charset)
{
    var sis = this.CCSV("@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream");
    sis.setInputStream(stream);

    var segments = [];
    for (var count = stream.available(); count; count = stream.available())
        segments.push(sis.readBytes(count));

    sis.close();

    var text = segments.join("");
    return this.convertToUnicode(text, charset);
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

this.readPostTextFromRequest = function(request, context)
{
    try
    {
        var is = this.QI(request, Ci.nsIUploadChannel).uploadStream;
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
            FBTrace.dumpProperties("lib.readPostTextFromRequest FAILS ", exc);                                             /*@explore*/
    }

    return null;
};

this.getInputStreamFromString = function(dataString)
{
    var stringStream = this.CCIN("@mozilla.org/io/string-input-stream;1", "nsIStringInputStream");

    if ("data" in stringStream) // Gecko 1.9 or newer
        stringStream.data = dataString;
    else // 1.8 or older
        stringStream.setData(dataString, dataString.length);

    return stringStream;
};

this.getWindowForRequest = function(request) 
{
    var webProgress = this.getRequestWebProgress(request);
    try {
        if (webProgress)
            return webProgress.DOMWindow;
    }
    catch (ex) {
    }

    return null;
};

this.getRequestWebProgress = function(request) 
{
    try
    {
        if (request.notificationCallbacks)
            return request.notificationCallbacks.getInterface(Ci.nsIWebProgress);
    } catch (exc) {}

    try
    {
        if (request.loadGroup && request.loadGroup.groupObserver)
            return request.loadGroup.groupObserver.QueryInterface(Ci.nsIWebProgress);
    } catch (exc) {}

    return null;
};

// ************************************************************************************************
// Network Tracing

this.getStateDescription = function(flag)
{
    var state = [];
    var nsIWebProgressListener = Ci.nsIWebProgressListener;
    if (flag & nsIWebProgressListener.STATE_START) state.push("STATE_START");
    else if (flag & nsIWebProgressListener.STATE_REDIRECTING) state.push("STATE_REDIRECTING");
    else if (flag & nsIWebProgressListener.STATE_TRANSFERRING) state.push("STATE_TRANSFERRING");
    else if (flag & nsIWebProgressListener.STATE_NEGOTIATING) state.push("STATE_NEGOTIATING");
    else if (flag & nsIWebProgressListener.STATE_STOP) state.push("STATE_STOP");

    if (flag & nsIWebProgressListener.STATE_IS_REQUEST) state.push("STATE_IS_REQUEST");
    if (flag & nsIWebProgressListener.STATE_IS_DOCUMENT) state.push("STATE_IS_DOCUMENT");
    if (flag & nsIWebProgressListener.STATE_IS_NETWORK) state.push("STATE_IS_NETWORK");
    if (flag & nsIWebProgressListener.STATE_IS_WINDOW) state.push("STATE_IS_WINDOW");
    if (flag & nsIWebProgressListener.STATE_RESTORING) state.push("STATE_RESTORING");
    if (flag & nsIWebProgressListener.STATE_IS_INSECURE) state.push("STATE_IS_INSECURE");
    if (flag & nsIWebProgressListener.STATE_IS_BROKEN) state.push("STATE_IS_BROKEN");
    if (flag & nsIWebProgressListener.STATE_IS_SECURE) state.push("STATE_IS_SECURE");
    if (flag & nsIWebProgressListener.STATE_SECURE_HIGH) state.push("STATE_SECURE_HIGH");
    if (flag & nsIWebProgressListener.STATE_SECURE_MED) state.push("STATE_SECURE_MED");
    if (flag & nsIWebProgressListener.STATE_SECURE_LOW) state.push("STATE_SECURE_LOW");

    return state.join(", ");
};

this.getStatusDescription = function(status)
{
    var nsISocketTransport = Ci.nsISocketTransport;
    var nsITransport = Ci.nsITransport;

    if (status == nsISocketTransport.STATUS_RESOLVING) return "STATUS_RESOLVING";
    if (status == nsISocketTransport.STATUS_CONNECTING_TO) return "STATUS_CONNECTING_TO";
    if (status == nsISocketTransport.STATUS_CONNECTED_TO) return "STATUS_CONNECTED_TO";
    if (status == nsISocketTransport.STATUS_SENDING_TO) return "STATUS_SENDING_TO";
    if (status == nsISocketTransport.STATUS_WAITING_FOR) return "STATUS_WAITING_FOR";
    if (status == nsISocketTransport.STATUS_RECEIVING_FROM) return "STATUS_RECEIVING_FROM";
    if (status == nsITransport.STATUS_READING) return "STATUS_READING";
    if (status == nsITransport.STATUS_WRITING) return "STATUS_WRITING";
};

this.getLoadFlagsDescription = function(loadFlags)
{
    var flags = [];
    var nsIChannel = Ci.nsIChannel;
    var nsICachingChannel = Ci.nsICachingChannel;

    if (loadFlags & nsIChannel.LOAD_DOCUMENT_URI) flags.push("LOAD_DOCUMENT_URI");
    if (loadFlags & nsIChannel.LOAD_RETARGETED_DOCUMENT_URI) flags.push("LOAD_RETARGETED_DOCUMENT_URI");
    if (loadFlags & nsIChannel.LOAD_REPLACE) flags.push("LOAD_REPLACE");
    if (loadFlags & nsIChannel.LOAD_INITIAL_DOCUMENT_URI) flags.push("LOAD_INITIAL_DOCUMENT_URI");
    if (loadFlags & nsIChannel.LOAD_TARGETED) flags.push("LOAD_TARGETED");
    if (loadFlags & nsIChannel.LOAD_CALL_CONTENT_SNIFFERS) flags.push("LOAD_CALL_CONTENT_SNIFFERS");
    if (loadFlags & nsICachingChannel.LOAD_NO_NETWORK_IO) flags.push("LOAD_NO_NETWORK_IO");
    if (loadFlags & nsICachingChannel.LOAD_CHECK_OFFLINE_CACHE) flags.push("LOAD_CHECK_OFFLINE_CACHE");
    if (loadFlags & nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE) flags.push("LOAD_BYPASS_LOCAL_CACHE");
    if (loadFlags & nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE_IF_BUSY) flags.push("LOAD_BYPASS_LOCAL_CACHE_IF_BUSY");
    if (loadFlags & nsICachingChannel.LOAD_ONLY_FROM_CACHE) flags.push("LOAD_ONLY_FROM_CACHE");
    if (loadFlags & nsICachingChannel.LOAD_ONLY_IF_MODIFIED) flags.push("LOAD_ONLY_IF_MODIFIED");

    return flags.join(", ");
};

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

this.getSourceLineRange = function(sourceBox, min, max)
{
    var html = [];

    for (var i = min; i <= max; ++i)
    {
        // Make sure all line numbers are the same width (with a fixed-width font)
        var lineNo = i + "";
        var maxLineNoChars = sourceBox.maxLineNoChars;
        while (lineNo.length < maxLineNoChars)
            lineNo = " " + lineNo;

        var line =  sourceBox.getLineAsHTML(i-1);

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
        panelState.persistedLocation = this.persistObject(panel.location, panel.context); // fn(context)->location

    if (panel.selection)
        panelState.persistedSelection = this.persistObject(panel.selection, panel.context);
    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("lib.persistObjects panel.location:"+panel.location+" panel.selection:"+panel.selection+" panelState:", panelState);
     
};

this.persistObject = function(object, context)
{
    var rep = Firebug.getRep(object);
    return rep ? rep.persistObject(object, context) : null;
};

this.restoreLocation =  function(panel, panelState)
{
	var needRetry = false;
	
	if (!panel.location && panelState && panelState.persistedLocation)
	{
	    var location = panelState.persistedLocation(panel.context);
	    if (location)
	        panel.navigate(location);
	    else
	     	needRetry = true;
	}

	if (!panel.location)
	    panel.navigate(null);

	if (needRetry)
    {
    	function overrideDefaultWithPersistedLocation()
    	{
    		var defaultLocation = panel.getDefaultLocation(panel.context);
    		if (panelState.persistedLocation)
    		{
    			if ( (!panel.location) || (panel.location == defaultLocation))
    			{
    				var location = panelState.persistedLocation(panel.context);
    				if (location)
    					panel.navigate(location);
    			}
    		}
    		else
    		{
    			if (!defaultLocation)  // no persisted and no default locations, erase 
    			{
    					panel.navigate();
    			}
    		}

    		if (FBTrace.DBG_INITIALIZE)
    			FBTrace.dumpProperties("lib.overrideDefaultWithPersistedLocation panel.location: "+panel.location+" panel.selection: "+panel.selection+" panelState:", panelState);
    	}
    	
    	panel.context.setTimeout(overrideDefaultWithPersistedLocation, overrideDefaultsWithPersistedValuesTimeout);
    }
	
	if (FBTrace.DBG_INITIALIZE)
        FBTrace.dumpProperties("lib.restoreObjects panel.location: "+panel.location+" panelState:", panelState);
};

this.restoreSelection = function(panel, panelState)
{
	var needRetry = false;
	
	if (!panel.selection && panelState && panelState.persistedSelection)
    {
        var selection = panelState.persistedSelection(panel.context);
        if (selection)
            panel.select(selection);
        else
        	needRetry = true;
    }

    if (!panel.selection)  // Couldn't restore the selection, so select the default object
        panel.select(null);
    
    if (needRetry)
    {
    	function overrideDefaultWithPersistedSelection()
    	{
    		if (panel.selection == panel.getDefaultSelection(panel.context) && panelState.persistedSelection)
    		{
    			var selection = panelState.persistedSelection(panel.context);
    			if (selection)
    				panel.select(selection);
    		}
    		
    		if (FBTrace.DBG_INITIALIZE)
    			FBTrace.dumpProperties("lib.overrideDefaultsWithPersistedValues panel.location: "+panel.location+" panel.selection: "+panel.selection+" panelState:", panelState);
    	}
    	
    	// If we couldn't restore the selection, wait a bit and try again
        panel.context.setTimeout(overrideDefaultWithPersistedSelection, overrideDefaultsWithPersistedValuesTimeout);
    }
    
    if (FBTrace.DBG_INITIALIZE)
        FBTrace.dumpProperties("lib.restore panel.selection: "+panel.selection+" panelState:", panelState);
};

this.restoreObjects = function(panel, panelState, letMeRetryLater)
{
    this.restoreLocation(panel, panelState);
    this.restoreSelection(panel, panelState);
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
    var count, searchRange, startPt;

    this.find = function(text, reverse, caseSensitive)
    {
        this.text = text;

        finder.findBackwards = !!reverse;
        finder.caseSensitive = !!caseSensitive;

        var range = this.range = finder.Find(
                text, searchRange,
                startPt || searchRange,
                searchRange);
        var match = range ?  range.startContainer : null;
        return this.currentNode = (rowFinder && match ? rowFinder(match) : match);
    };

    this.findNext = function(wrapAround, sameNode, reverse, caseSensitive)
    {
        var curNode = this.currentNode ? this.currentNode : rootNode;
        startPt = doc.createRange();
        try
        {
            if (reverse)
            {
                startPt.setStartBefore(curNode);
            }
            else
            {
                startPt.setStartAfter(curNode);
            }
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.dumpProperties("lib.TextSearch.findNext setStartAfter fails for nodeType:"+(this.currentNode?this.currentNode.nodeType:rootNode.nodeType),e);
            try {
                FBTrace.sysout("setStart try\n");
                startPt.setStart(curNode);
                FBTrace.sysout("setStart success\n");
            } catch (exc) {
                return;
            }
        }

        var match = this.find(this.text, reverse, caseSensitive);
        if (!match && wrapAround)
        {
            this.reset();
            return this.find(this.text, reverse, caseSensitive);
        }

        return match;
    };

    this.reset = function()
    {
        count = rootNode.childNodes.length;
        searchRange = doc.createRange();
        searchRange.setStart(rootNode, 0);
        searchRange.setEnd(rootNode, count);
        
        startPt = searchRange;
    };

    this.reset();
};

// ************************************************************************************************
this.SourceBoxTextSearch = function(sourceBox)
{
    this.find = function(text, reverse, caseSensitive)
    {
        this.text = text;
        
        this.re = new FBL.ReversibleRegExp(text);
        
        return this.findNext(false, reverse, caseSensitive);
    };

    this.findNext = function(wrapAround, reverse, caseSensitive)
    {
        var lines = sourceBox.lines;
        var match = null;
        for (var iter = new FBL.ReversibleIterator(lines.length, this.mark, reverse); iter.next();)
        {
            match = this.re.exec(lines[iter.index], false, caseSensitive);
            if (match)
            {
                this.mark = iter.index;
                return iter.index;
            }
        }

        if (!match && wrapAround)
        {
            this.reset();
            return this.findNext(false, reverse, caseSensitive);
        }

        return match;
    };

    this.reset = function()
    {
        delete this.mark;
    };

    this.reset();
};
//************************************************************************************************

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
        	var numberInvalid = 0;
            for (var i = 0; i < this.innerScripts.length; i++)
            {
                var script = this.innerScripts[i];
                if (script.isValid)  
                	str += script.tag+" ";
                else
                	numberInvalid++;
            }
        }
        str += ")"+(numberInvalid ? "("+numberInvalid+" invalid)" : "");
        return str;
    },

    forEachScript: function(callback)
    {
        if (this.outerScript)
            callback(this.outerScript);
        if (this.innerScripts)
        {
            for (var i = 0; i < this.innerScripts.length; i++)
            {
                var script = this.innerScripts[i];
                var rc = callback(script);
                if (rc)
                    return rc;
            }
        }
    },

    getSourceLength: function()
    {
            return this.sourceLength;
    },

    getLine: function(context, lineNo)
    {
        return context.sourceCache.getLine(this.href, lineNo);
    },

    addToLineTable: function(script)
    {
        if (!script || !script.isValid)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("addToLineTable got invalid script "+(script?script.tag:"null")+"\n");
            return;
        }

        // For outer scripts, a better algorithm would loop over PC, use pcToLine to mark the lines.
        // This assumes there are fewer PCs in an outer script than lines, probably true for large systems.
        // And now addToLineTable is only used for outerScripts (eval and top-level).
        // But since we can't know the range of PC values we cannot use that approach.

        if (!this.outerScriptLineMap)
            this.outerScriptLineMap = [];

        var lineCount = script.lineExtent + 1;
        var offset = this.getBaseLineOffset();
        if (FBTrace.DBG_LINETABLE)
        {                                                                                     /*@explore*/
            FBTrace.sysout("lib.SourceFile.addToLineTable script.tag:"+script.tag+" lineExtent="+lineCount+" baseLineNumber="+script.baseLineNumber+" offset="+offset+" for "+this.compilation_unit_type+"\n");  /*@explore*/
            var startTime = new Date().getTime();
        }
        if (lineCount > 100)
            lineCount = 100; // isLineExecutable requires about 1ms per line, so it can only be called for toy programs

        for (var i = 0; i <= lineCount; i++)
        {
            var scriptLineNo = i + script.baseLineNumber;  // the max is (i + script.baseLineNumber + script.lineExtent)
            var mapLineNo = scriptLineNo - offset;
            try
            {
                if (script.isLineExecutable(scriptLineNo, this.pcmap_type))
                    this.outerScriptLineMap.push(mapLineNo);
            }
            catch (e)
            {
                // I guess not...
            }
                                                                                                                       /*@explore*/
            if (FBTrace.DBG_LINETABLE)                                                                                 /*@explore*/
            {                                                                                                          /*@explore*/
                var pcFromLine = script.lineToPc(scriptLineNo, this.pcmap_type);                                            /*@explore*/
                var lineFromPC = script.pcToLine(pcFromLine, this.pcmap_type);                                              /*@explore*/
                                                                                                                       /*@explore*/
                if (this.outerScriptLineMap.indexOf(mapLineNo) != -1)                                                                  /*@explore*/
                    FBTrace.sysout("lib.SourceFile.addToLineTable ["+mapLineNo+"]="+script.tag+" for scriptLineNo="+scriptLineNo+" vs "+lineFromPC+"=lineFromPC; lineToPc="+pcFromLine+" with map="+(this.pcmap_type==PCMAP_PRETTYPRINT?"PP":"SOURCE")+"\n"); /*@explore*/
                else                                                                                                   /*@explore*/
                    FBTrace.sysout("lib.SourceFile.addToLineTable not executable scriptLineNo="+scriptLineNo+" vs "+lineFromPC+"=lineFromPC; lineToPc="+pcFromLine+"\n");     /*@explore*/
            }                                                                                                          /*@explore*/
        }
        if (FBTrace.DBG_LINETABLE)
        {
            var endTime = new Date().getTime();
            var delta = endTime - startTime ;
            if (delta > 0) FBTrace.sysout("SourceFile.addToLineTable processed "+lineCount+" lines in "+delta+" millisecs "+Math.round(lineCount/delta)+" lines per millisecond\n");
            FBTrace.sysout("SourceFile.addToLineTable: "+this.toString()+"\n");                 /*@explore*/
        }
    },

    addToLineTableByPCLoop: function(script)
    {
        // This code is not called; it crashes FF3pre https://bugzilla.mozilla.org/show_bug.cgi?id=430205
        if (!this.outerScriptLineMap)
            this.outerScriptLineMap = {};

        var lineCount = script.lineExtent;
        var offset = this.getBaseLineOffset();
                                                                                           /*@explore*/
        if (FBTrace.DBG_LINETABLE)
        {/*@explore*/
            FBTrace.sysout("lib.SourceFile.addToLineTableByPCLoop script.tag:"+script.tag+" lineCount="+lineCount+" offset="+offset+" for "+this.compilation_unit_type+"\n");  /*@explore*/
            var startTime = new Date().getTime();/*@explore*/
        }/*@explore*/

        for (var i = 0; i <= 10*lineCount; i++)
        {
            var lineFromPC = script.pcToLine(i, this.pcmap_type);
            //FBTrace.sysout("lib.SourceFile.addToLineTableByPCLoop pc="+i+" line: "+lineFromPC+"\n");                                                                                         /*@explore*/
            this.outerScriptLineMap[lineFromPC] = script;
            if (lineFromPC >= lineCount) break;
        }

        if (FBTrace.DBG_LINETABLE)/*@explore*/
        {/*@explore*/
            FBTrace.sysout("SourceFile.addToLineTableByPCLoop: "+this.toString()+"\n");                 /*@explore*/
            var endTime = new Date().getTime();/*@explore*/
            var delta = endTime - startTime ;/*@explore*/
            if (delta > 0) FBTrace.sysout("SourceFileaddToLineTableByPCLoop processed "+lineCount+" lines in "+delta+" millisecs "+Math.round(lineCount/delta)+" lines per millisecond\n");/*@explore*/
        }        /*@explore*/
    },

    getScriptsAtLineNumber: function(lineNo, mustBeExecutableLine)
    {
        var offset = this.getBaseLineOffset();

        if (!this.innerScripts)
            return; // eg URLOnly

        if (FBTrace.DBG_LINETABLE)
            FBTrace.sysout("getScriptsAtLineNumber "+this.innerScripts.length+" innerScripts, offset "+offset+" for sourcefile: "+this.toString()+"\n");
        var targetLineNo = lineNo + offset;  // lineNo is user-viewed number, targetLineNo is jsd number

        var scripts = [];
        for (var j = 0; j < this.innerScripts.length; j++)
        {
            var script = this.innerScripts[j];
            if (mustBeExecutableLine && !script.isValid) continue;
            this.addScriptAtLineNumber(scripts, script, targetLineNo, mustBeExecutableLine, offset);
        }
        if (this.outerScript && !(mustBeExecutableLine && !this.outerScript.isValid) )
            this.addScriptAtLineNumber(scripts, this.outerScript, targetLineNo, mustBeExecutableLine, offset);

        if (FBTrace.DBG_LINETABLE && scripts.length < 1)
        {
            FBTrace.sysout("lib.getScriptsAtLineNumber no targetScript at "+lineNo," for sourceFile:"+this.toString());
            return false;
        }

        return (scripts.length > 0) ? scripts : false;
    },

    addScriptAtLineNumber: function(scripts, script, targetLineNo, mustBeExecutableLine, offset)
    {
        // script.isValid will be true.
        if (FBTrace.DBG_LINETABLE)
            FBTrace.sysout("addScriptAtLineNumber trying "+script.tag+", is "+script.baseLineNumber+" <= "+targetLineNo +" <= "+ (script.baseLineNumber + script.lineExtent)+"? using offset = "+offset+"\n");

        if (targetLineNo >= script.baseLineNumber)
        {
            if ( (script.baseLineNumber + script.lineExtent) >= targetLineNo)
            {
                if (mustBeExecutableLine)
                {
                    try
                    {
                        if (!script.isLineExecutable(targetLineNo, this.pcmap_type) )
                        {
                            if (FBTrace.DBG_LINETABLE)
                                FBTrace.sysout("getScriptsAtLineNumber tried "+script.tag+", not executable at targetLineNo:"+targetLineNo+" pcmap:"+this.pcmap_type+"\n");
                            return;
                        }
                    }
                    catch (e)
                    {
                        // Component returned failure code: 0x80040111 (NS_ERROR_NOT_AVAILABLE) [jsdIScript.isLineExecutable]
                        return;
                    }
                }
                scripts.push(script);
                if (FBTrace.DBG_LINETABLE)
                {
                    var checkExecutable = "";
                    if (mustBeExecutableLine)
                        var checkExecutable = " isLineExecutable: "+script.isLineExecutable(targetLineNo, this.pcmap_type)+"@pc:"+script.lineToPc(targetLineNo, this.pcmap_type);
                    FBTrace.sysout("getScriptsAtLineNumber found "+script.tag+", isValid: "+script.isValid+" targetLineNo:"+targetLineNo+checkExecutable+"\n");
                }
            }
        }
    },

    scriptsIfLineCouldBeExecutable: function(lineNo)  // script may not be valid
    {
        var scripts = this.getScriptsAtLineNumber(lineNo, true);
        if (FBTrace.DBG_LINETABLE && !scripts) FBTrace.dumpProperties("lib.scriptsIfLineCouldBeExecutable this.outerScriptLineMap", this.outerScriptLineMap);
        if (!scripts && this.outerScriptLineMap && (this.outerScriptLineMap.indexOf(lineNo) != -1) )
            return [this.outerScript];
        return scripts;
    },

    hasScript: function(script)
    {
        if (this.outerScript && (this.outerScript.tag == script.tag) )
            return true;
        // XXXjjb Don't use indexOf or similar tests that rely on ===, since we are really working with
        // wrappers around jsdIScript, not script themselves.  I guess.

        if (!this.innerScripts || !this.innerScripts.length)
        	return false;
        
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
    },

    isEval: function()
    {
        return (this.compilation_unit_type == "eval-level") || (this.compilation_unit_type == "newFunction");
    },

    isEvent: function()
    {
        return (this.compilation_unit_type == "event");
    },

    loadScriptLines: function(context)  // array of lines
    {
        if (this.source)
            return this.source;
        else
            return context.sourceCache.load(this.href);
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
        if (frame)
        {
            var name = frame.name;
            var fnc = script.functionObject.getWrappedValue();
            var args = FBL.getFunctionArgValues(fnc, frame);
        }
        else
        {
            var name = script.functionName;
            var args = [];
        }

        if (name ==  "anonymous")
        {
            name = FBL.guessFunctionName(this.sourceFile.href, this.getBaseLineNumberByScript(script), context);
        }

        return {name: name, args: args};
    },

    // link to source for this script.
    getSourceLinkForScript: function (script)
    {
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
/*    if (outerScript.isValid)
    {
        try
        {
            sourceFile.addToLineTable(outerScript, outerScript.baseLineNumber);
        }
        catch (exc)
        {
            // XXXjjb I think this is happening when we go out of the script range in isLineExecutable.
            if (FBTrace.DBG_ERRORS)
                FBTrace.dumpProperties("addScriptsToSourceFile addLineTable FAILS", exc);
        }
    }
*/

    // Attach the innerScripts for use later
    if (!sourceFile.innerScripts)
        sourceFile.innerScripts = [];

    while (innerScripts.hasMoreElements())
    {
    	var script = innerScripts.getNext();
    	if (!script || !script.tag)
    	{
    	    if (FBTrace.DBG_SOURCEFILES)
    	        FBTrace.sysout("FBL.addScriptsToSourceFile innerScripts.getNext FAILS "+sourceFile, script);
    	    continue;    	    
        }
    	if (FBTrace.DBG_SOURCEFILES && !script.isValid)
    		FBTrace.sysout("FBL.addScriptsToSourceFile script "+script.tag+".isValid:"+script.isValid);
        sourceFile.innerScripts.push(script);
    }
    if (FBTrace.DBG_SOURCEFILES)                                                                                   /*@explore*/
        FBTrace.sysout("FBL.addScriptsToSourceFile "+sourceFile.innerScripts.length+" scripts, sourcefile="+sourceFile.toString(), sourceFile);
}

//------------
this.EvalLevelSourceFile = function(url, script, eval_expr, source, mapType, innerScriptEnumerator) // ctor
{
    this.href = url;
    this.outerScript = script;
    this.containingURL = script.fileName;
    this.evalExpression = eval_expr;
    this.sourceLength = source.length;
    this.source = source;
    this.pcmap_type = mapType;
    FBL.addScriptsToSourceFile(this, script, innerScriptEnumerator);
};

this.EvalLevelSourceFile.prototype = new this.SourceFile("eval-level"); // shared prototype

this.EvalLevelSourceFile.prototype.getLine = function(context, lineNo)
{
    return this.source[lineNo - 1];
},

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
        return FBL.splitURLBase(this.href); 

    if (!this.summary)
    {
        if (this.evalExpression)
            this.summary = FBL.summarizeSourceLineArray(this.evalExpression.substr(0, 240), 120);
        if (!this.summary)
            this.summary = "";
        if (this.summary.length < 120)
            this.summary = "eval("+this.summary + "...)=" + FBL.summarizeSourceLineArray(this.source, 120 - this.summary.length);
    }
    var containingFileDescription = FBL.splitURLBase(this.containingURL);
    if (FBTrace.DBG_SOURCEFILES) /*@explore*/
        FBTrace.sysout("EvalLevelSourceFile this.evalExpression.substr(0, 240):"+(this.evalExpression?this.evalExpression.substr(0, 240):"null")+" summary", this.summary); /*@explore*/
    return {path: containingFileDescription.path, name: containingFileDescription.name+"/eval: "+this.summary };
}
//------------
this.EventSourceFile = function(url, script, title, source, innerScriptEnumerator)
{
    this.href = url;
    this.outerScript = script;
    this.containingURL = script.fileName;
    this.title = title;
    this.sourceLines = source; // points to the sourceCache lines
    this.sourceLength = source.length;
    this.pcmap_type = PCMAP_PRETTYPRINT;

    FBL.addScriptsToSourceFile(this, script, innerScriptEnumerator);
};

this.EventSourceFile.prototype = new this.SourceFile("event"); // prototypical inheritance


this.EventSourceFile.prototype.getLine = function(context, lineNo)
{
    return this.sourceLines[lineNo - 1];
},


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

this.summarizeSourceLineArray = function(sourceLines, size)
{
    var buf  = "";
    for (var i = 0; i < sourceLines.length; i++)
    {
        var aLine = sourceLines[i].substr(0,240);  // avoid huge lines
        buf += aLine.replace(/\s/, " ", "g");
        if (buf.length > size || aLine.length > 240)
            break;
    }
    return buf.substr(0, size);
};

this.EventSourceFile.prototype.getObjectDescription = function()
{
    if (!this.summary)
    {
        this.summary = FBL.summarizeSourceLineArray(this.sourceLines, 120);
    }
    
    var containingFileDescription = FBL.splitURLBase(this.containingURL);
    
    return {path: containingFileDescription.path, name: containingFileDescription.name+"/event: "+this.summary };
}

//-----------
this.FunctionConstructorSourceFile = function(url, script, ctor_expr, sourceLength, innerScriptEnumerator)
{
    this.href = url;
    this.outerScript = script;
    this.evalExpression = eval_expr;
    this.sourceLength = sourceLength;
    this.pcmap_type = PCMAP_SOURCETEXT;

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
// A source included more than one time
this.ReusedSourceFile = function(sourceFile, outerScript, innerScriptEnumerator)
{
// need to override most functions.
}

//-------
this.EnumeratedSourceFile = function(url) // we don't have the outer script and we delay source load.
{
    this.href = new String(url);  // may not be outerScript file name, eg this could be an enumerated eval
    this.innerScripts = [];
    this.pcmap_type = PCMAP_SOURCETEXT;
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
    if (!context.sourceFileMap)
        return null;

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
    var sourceFile = FBL.getSourceFileByScript(context, script);
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
        var scripts = sourceFile.getScriptsAtLineNumber(line);
        if (scripts)
        {
            var script = scripts[0]; // TODO try others?
            var analyzer = sourceFile.getScriptAnalyzer(script);
            line = analyzer.getBaseLineNumberByScript(script);
        }
    }
     return guessFunctionName(url, line-1, context);
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

this.SourceText = function(lines, owner)
{
    this.lines = lines;
    this.owner = owner;
};

this.SourceText.getLineAsHTML = function(lineNo)
{
    return escapeHTML(this.lines[lineNo-1]);
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

this.traceToString = function(trace)                                                                                   /*@explore*/
{                                                                                                                      /*@explore*/
    var str = "<top>";                                                                                                 /*@explore*/
    for(var i = 0; i < trace.frames.length; i++)                                                                       /*@explore*/
        str += "\n" + trace.frames[i];                                                                                 /*@explore*/
    str += "\n<bottom>";                                                                                               /*@explore*/
    return str;                                                                                                        /*@explore*/
}                                                                                                                      /*@explore*/
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

this.StackFrame = function(context, fn, script, href, lineNo, args, pc)
{
    this.context = context;
    this.fn = fn;
    this.script = script;
    this.href = href;
    this.lineNo = lineNo;
    this.args = args;
    this.flags = (script?script.flags:null);
    this.pc = pc;
};

this.StackFrame.prototype =
{
    toString: function()
    {
        // XXXjjb analyze args and fn?
        if (this.script)
            return "("+this.flags+")"+this.href+":"+this.script.baseLineNumber+"-"
                  +(this.script.baseLineNumber+this.script.lineExtent)+"@"+this.lineNo;
        else
            return this.href;
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
    "GeckoActiveXObject",
    "applicationCache"      // FF3
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
    if (FBTrace) {                                               
        FBTrace.dumpProperties("lib.ERROR: "+exc, exc);   
    }
    else                                                       
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

this.ReversibleIterator = function(length, start, reverse)
{
    this.length = length;
    this.index = start;
    this.reversed = !!reverse;
    
    this.next = function() {
        if (this.index === undefined || this.index === null) {
            this.index = this.reversed ? length : -1;
        }
        this.index += this.reversed ? -1 : 1;
        
        return 0 <= this.index && this.index < length;
    };
    this.reverse = function() {
        this.reversed = !this.reversed;
    };
};

this.ReversibleRegExp = function(regex, flags)
{
    var re = {};
    
    function expression(text, reverse) {
        return text + (reverse ? "(?![\\s\\S]*" + text + ")" : "");
    }
    function flag(flags, caseSensitive) {
        return (flags || "") + (caseSensitive ? "" : "i");
    }
    
    this.exec = function(text, reverse, caseSensitive, lastMatch)
    {
        // Ensure we have a regex
        var key = (reverse ? "r" : "n") + (caseSensitive ? "n" : "i");
        if (!re[key])
        {
            re[key] = new RegExp(expression(regex, reverse), flag(flags, caseSensitive));
        }
        
        // Modify as needed to all for iterative searches
        var indexOffset = 0;
        var searchText = text;
        if (lastMatch) {
            if (reverse) {
                searchText = text.substr(0, lastMatch.index);
            } else {
                indexOffset = lastMatch.index+lastMatch[0].length;
                searchText = text.substr(indexOffset);
            }
        }
        
        var ret = re[key].exec(searchText);
        if (ret) {
            ret.input = text;
            ret.index = ret.index + indexOffset;
            ret.reverse = reverse;
            ret.caseSensitive = caseSensitive;
        }
        return ret;
    };
};

/**
 * Implements an ordered traveral of the document, including attributes and
 * iframe contents within the results.
 * 
 * Note that the order for attributes is not defined. This will follow the
 * same order as the Element.attributes accessor.
 */
this.DOMWalker = function(doc, root)
{
    var walker;
    var currentNode, attrIndex;
    var pastStart, pastEnd;
    
    function createWalker(docElement) {
        var walk = doc.createTreeWalker(docElement, SHOW_ALL, null, true);
        walker.unshift(walk);
    }
    function getLastAncestor() {
        while (walker[0].lastChild()) {}
        return walker[0].currentNode;
    }
    
    this.previousNode = function() {
        if (pastStart) {
            return undefined;
        }
        
        if (attrIndex) {
            attrIndex--;
        } else {
            var prevNode;
            if (currentNode == walker[0].root) {
                if (walker.length > 1) {
                    walker.shift();
                    prevNode = walker[0].currentNode;
                } else {
                    prevNode = undefined;
                }
            } else {
                if (!currentNode) {
                    prevNode = getLastAncestor();
                } else {
                    prevNode = walker[0].previousNode();
                }
                if (!prevNode) {    // Really shouldn't occur, but to be safe
                    prevNode = walker[0].root;
                }
                while ((prevNode.nodeName || "").toUpperCase() == "IFRAME") {
                    createWalker(prevNode.contentDocument.documentElement);
                    prevNode = getLastAncestor();
                }
            }
            currentNode = prevNode;
            attrIndex = ((prevNode || {}).attributes || []).length;
        }
        
        if (!currentNode) {
            pastStart = true;
        } else {
            pastEnd = false;
        }
        
        return this.currentNode();
    };
    this.nextNode = function() {
        if (pastEnd) {
            return undefined;
        }
        
        if (!currentNode) {
            // We are working with a new tree walker
            currentNode = walker[0].root;
            attrIndex = 0;
        } else {
            // First check attributes
            var attrs = currentNode.attributes || [];
            if (attrIndex < attrs.length) {
                attrIndex++;
            } else if ((currentNode.nodeName || "").toUpperCase() == "IFRAME") {
                // Attributes have completed, check for iframe contents
                createWalker(currentNode.contentDocument.documentElement);
                currentNode = walker[0].root;
                attrIndex = 0;
            } else {
                // Next node
                var nextNode = walker[0].nextNode();
                while (!nextNode && walker.length > 1) {
                    walker.shift();
                    nextNode = walker[0].nextNode();
                }
                currentNode = nextNode;
                attrIndex = 0;
            }
        }
        
        if (!currentNode) {
            pastEnd = true;
        } else {
            pastStart = false;
        }
        
        return this.currentNode();
    };
    
    this.currentNode = function() {
        if (!attrIndex) {
            return currentNode;
        } else {
            return currentNode.attributes[attrIndex-1];
        }
    };
    
    this.reset = function() {
        pastStart = false;
        pastEnd = false;
        walker = [];
        currentNode = undefined;
        attrIndex = 0;
        
        createWalker(root);
    };
    
    this.reset();
};

}).apply(FBL);
} catch(e) {																			/*@explore*/
    dump("FBL Fails "+e+"\n");																/*@explore*/
    dump("If the service @joehewitt.com/firebug;1 fails, try deleting compreg.dat, xpti.dat\n");/*@explore*/
    dump("Another cause can be mangled install.rdf.\n");/*@explore*/
}   																		/*@explore*/
