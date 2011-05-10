/* See license.txt for terms of usage */

define([
    "firebug/lib/xpcom",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/options",
    "firebug/lib/deprecated",
    "firebug/lib/wrapper",
    "firebug/lib/url",
    "firebug/sourceLink",
    "firebug/lib/stackFrame",
],
function(XPCOM, Locale, Events, Options, Deprecated, Wrapper, URL, SourceLink, StackFrame) {

// ********************************************************************************************* //

var FBL = top.FBL || {};  // legacy.js adds top.FBL, FIXME, remove after iframe version

try {

// ********************************************************************************************* //
// xxxHonza: removed from 1.8.next

// Inject old fbXPCOMUtils into FBL (for backward compatibility)
// Real AMD module should depend on "lib/xpcom"
// xxxHonza: FBL.CCIN, FBL.CCSV and FBL.QI should be marked as deprecated and
for (var p in XPCOM)
    FBL[p] = XPCOM[p];

// Backward compatibility with extensions
// xxxHonza: mark as obsolete
for (var p in Locale)
    FBL[p] = Locale[p];

// Backward compatibility with extensions
// xxxHonza: mark as obsolete
for (var p in Events)
    FBL[p] = Events[p];

// Backward compatibility with extensions
// xxxHonza: mark as obsolete
for (var p in Wrapper)
    FBL[p] = Wrapper[p];

// Backward compatibility with extensions
// xxxHonza: mark as obsolete
for (var p in URL)
    FBL[p] = URL[p];

for (var p in StackFrame)
    FBL[p] = StackFrame[p];

FBL.deprecated = Deprecated.deprecated;
FBL.SourceLink = SourceLink.SourceLink;

// ********************************************************************************************* //

(function() {  // fill 'this' with functions, then apply(FBL)

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Modules

Components.utils["import"]("resource://gre/modules/PluralForm.jsm");

try
{
    Components.utils["import"]("resource://firebug/firebug-service.js");

    this.fbs = fbs; // left over from component.
}
catch (err)
{
    if (FBTrace.DBG_ERRORS)
        FBTrace.sysout("lib; FAILED to get firebug-service", err);
}

// ************************************************************************************************
// Shortcuts

this.jsd = Cc["@mozilla.org/js/jsd/debugger-service;1"].getService(Ci.jsdIDebuggerService);

this.domUtils = Cc["@mozilla.org/inspector/dom-utils;1"].getService(Ci.inIDOMUtils);

const finder = this.finder = Cc["@mozilla.org/embedcomp/rangefind;1"].createInstance(Ci.nsIFind);
const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
const versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const reNotWhitespace = /[^\s]/;
const reSplitFile = /:\/{1,3}(.*?)\/([^\/]*?)\/?($|\?.*)/;
const reURL = /(([^:]+:)\/{1,2}[^\/]*)(.*?)$/;  // This RE and the previous one should changed to be consistent
const reChromeCase = /chrome:\/\/([^/]*)\/(.*?)$/;

// Globals
this.reDataURL = /data:text\/javascript;fileName=([^;]*);baseLineNumber=(\d*?),((?:.*?%0A)|(?:.*))/g;
this.reJavascript = /\s*javascript:\s*(.*)/;
this.reChrome = /chrome:\/\/([^\/]*)\//;
this.reCSS = /\.css$/;
this.reFile = /file:\/\/([^\/]*)\//;
this.reUpperCase = /[A-Z]/;

const reSplitLines = /\r\n|\r|\n/;
const reWord = /([A-Za-z_$][A-Za-z_$0-9]*)(\.([A-Za-z_$][A-Za-z_$0-9]*))*/;

const overrideDefaultsWithPersistedValuesTimeout = 500;

const NS_SEEK_SET = Ci.nsISeekableStream.NS_SEEK_SET;

// ************************************************************************************************
// Namespaces

// ************************************************************************************************
// Basics

this.bind = function()  // fn, thisObject, args => thisObject.fn(arguments, args);
{
   var args = cloneArray(arguments), fn = args.shift(), object = args.shift();
   return function bind() { return fn.apply(object, arrayInsert(cloneArray(args), 0, arguments)); }
};

this.bindFixed = function() // fn, thisObject, args => thisObject.fn(args);
{
    var args = cloneArray(arguments), fn = args.shift(), object = args.shift();
    return function() { return fn.apply(object, args); }
};

this.extend = function(l, r)
{
    if (!l || !r)
        throw new Error("FBL.extend on undefined object");

    var newOb = {};
    for (var n in l)
        newOb[n] = l[n];
    for (var n in r)
        newOb[n] = r[n];
    return newOb;
};

this.descend = function(prototypeParent, childProperties)
{
    function protoSetter() {};
    protoSetter.prototype = prototypeParent;
    var newOb = new protoSetter();
    for (var n in childProperties)
        newOb[n] = childProperties[n];
    return newOb;
};

// ************************************************************************************************
// Arrays

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
                if (FBTrace.DBG_ERRORS)
                    FBTrace.dumpPropreties("lib.values FAILED ", exc);
            }

        }
    }
    catch (exc)
    {
        // Sometimes we get exceptions trying to iterate properties
        if (FBTrace.DBG_ERRORS)
            FBTrace.dumpPropreties("lib.values FAILED ", exc);
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

// ************************************************************************************************

this.safeToString = function(ob)
{
    try
    {
        if (!ob)
        {
            if (ob == undefined)
                return 'undefined';
            if (ob == null)
                return 'null';
            if (ob == false)
                return 'false';
            return "";
        }
        if (ob && (typeof (ob['toString']) == "function") )
            return ob.toString();
        if (ob && typeof (ob['toSource']) == 'function')
            return ob.toSource();
       /* https://bugzilla.mozilla.org/show_bug.cgi?id=522590 */
        var str = "[";
        for (var p in ob)
            str += p+',';
        return str + ']';

    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("safeToString FAILS "+exc, exc);
    }
    return "[unsupported: no toString() function in type "+typeof(ob)+"]";
};

// ************************************************************************************************

this.hasProperties = function(ob)
{
    try
    {
        var obString = FBL.safeToString(ob);
        if (obString === '[object StorageList]' || obString === '[xpconnect wrapped native prototype]')
            return true;

        for (var name in ob)
        {
            // Try to access the property before declaring existing properties.
            // It's because some properties can't be read see:
            // issue 3843, https://bugzilla.mozilla.org/show_bug.cgi?id=455013
            var value = ob[name];
            return true;
        }
    } catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.hasProperties("+FBL.safeToString(ob)+") ERROR "+exc, exc);
        if (ob.wrappedJSObject)  // workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=648560
            return true;
    }
    return false;
};

this.getPrototype = function(ob)
{
    try
    {
        return ob.prototype;
    } catch (exc) {}
    return null;
};

// ************************************************************************************************

this.convertToUnicode = function(text, charset)
{
    if (!text)
        return "";

    try
    {
        var conv = Cc["@mozilla.org/intl/scriptableunicodeconverter"].getService(
            Ci.nsIScriptableUnicodeConverter);
        conv.charset = charset ? charset : "UTF-8";
        return conv.ConvertToUnicode(text);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.convertToUnicode: fails: for charset "+charset+" conv.charset:"+
                conv.charset+" exc: "+exc, exc);

        // the exception is worthless, make up a new one
        throw new Error("Firebug failed to convert to unicode using charset: "+conv.charset+
            " in @mozilla.org/intl/scriptableunicodeconverter");
    }
};

this.convertFromUnicode = function(text, charset)
{
    if (!text)
        return "";

    try
    {
        var conv = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(
            Ci.nsIScriptableUnicodeConverter);
        conv.charset = charset ? charset : "UTF-8";
        return conv.ConvertFromUnicode(text);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.convertFromUnicode: fails: for charset "+charset+" conv.charset:"+
                conv.charset+" exc: "+exc, exc);
    }
};

this.getPlatformName = function()
{
    return Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime).OS;
};

this.beep = function()
{
    var sounder = Cc["@mozilla.org/sound;1"].getService(Ci.nsISound);
    sounder.beep();
};

this.getUniqueId = function()
{
    return this.getRandomInt(0,65536);
}

this.getRandomInt = function(min, max)
{
    return Math.floor(Math.random() * (max - min + 1) + min);
}

// ************************************************************************************************

this.createStyleSheet = function(doc, url)
{
    var style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
    style.setAttribute("charset","utf-8");
    style.setAttribute("type", "text/css");

    var cssText = url ? this.getResource(url) : null;
    if (cssText)
    {
        var index = url.lastIndexOf("/");
        var absURL = url.substr(0, index+1);

        // Replace all relative URLs with absolute (using the passed url).
        // Note that stylesheets can come from various extensions and the source can
        // be even used in a browser env where relative URLs make more sense.
        var expr = /url\(([\'"]?)(?![\'"]?(?:[a-z]+:|\/))/gi;
        cssText = cssText.replace(expr, "url($1" + absURL);

        style.innerHTML = cssText;
    }

    Firebug.setIgnored(style);
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

this.appendStylesheet = function(doc, uri)
{
    // Make sure the stylesheet is not appended twice.
    var styleSheet = this.$(uri, doc);
    if (styleSheet)
        return styleSheet;

    var styleSheet = this.createStyleSheet(doc, uri);
    styleSheet.setAttribute("id", uri);
    this.addStyleSheet(doc, styleSheet);

    return styleSheet;
},

this.addScript = function(doc, id, src)
{
    var element = doc.createElementNS("http://www.w3.org/1999/xhtml", "html:script");
    element.setAttribute("type", "text/javascript");
    element.setAttribute("id", id);
    if (!FBTrace.DBG_CONSOLE)
        Firebug.setIgnored(element);

    element.innerHTML = src;
    if (doc.documentElement)
    {
        doc.documentElement.appendChild(element);
    }
    else
    {
        // See issue 1079, the svg test case gives this error
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.addScript doc has no documentElement (" +
                doc.readyState + ") " + doc.location, doc);
        return;
    }
    return element;
}

// ************************************************************************************************

this.isAncestorIgnored = function(node)
{
    for (var parent = node; parent; parent = parent.parentNode)
    {
        if (Firebug.shouldIgnore(parent))
            return true;
    }

    return false;
}

// ************************************************************************************************
// Visibility

this.isVisible = function(elt)
{
    if (FBL.isElementXUL(elt))
    {
        //FBTrace.sysout("isVisible elt.offsetWidth: "+elt.offsetWidth+" offsetHeight:"+ elt.offsetHeight+" localName:"+ elt.localName+" nameSpace:"+elt.nameSpaceURI+"\n");
        return (!elt.hidden && !elt.collapsed);
    }

    try
    {
        return elt.offsetWidth > 0 ||
            elt.offsetHeight > 0 ||
            elt.localName in invisibleTags ||
            isElementSVG(elt) ||
            isElementMathML(elt);
    }
    catch (err)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.isVisible; EXCEPTION " + err, err);
    }

    return false;
};

this.collapse = function(elt, collapsed)
{
    elt.setAttribute("collapsed", collapsed ? "true" : "false");
};

this.isCollapsed = function(elt)
{
    return (elt.getAttribute("collapsed") == "true") ? true : false;
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
    this.clearDomplate(node);
    node.innerHTML = "";
};

this.eraseNode = function(node)
{
    this.clearDomplate(node);
    while (node.lastChild)
        node.removeChild(node.lastChild);
};

this.ToggleBranch = function()
{
    this.normal = {};
    this.meta = {};
}

this.metaNames =
[
 'prototype',
 'constructor',
 '__proto__',
 'toString',
 'toSource',
 'hasOwnProperty',
 'getPrototypeOf',
 '__defineGetter__',
 '__defineSetter__',
 '__lookupGetter__',
 '__lookupSetter__',
 '__noSuchMethod__',
 'propertyIsEnumerable',
 'isPrototypeOf',
 'watch',
 'unwatch',
 'valueOf',
 'toLocaleString'
];

this.ToggleBranch.prototype =
{
    // Another implementation could simply prefix all keys with "#".
    getMeta: function(name)
    {
        if (FBL.metaNames.indexOf(name) !== -1)
            return "meta_"+name;
    },

    get: function(name)  // return the toggle branch at name
    {
        var metaName = this.getMeta(name);
        if (metaName)
            var value = this.meta[metaName];
        else if (this.normal.hasOwnProperty(name))
            var value = this.normal[name];
        else
            var value = null;

        if (FBTrace.DBG_DOMPLATE)
            if (value && !(value instanceof FBL.ToggleBranch)) FBTrace.sysout("ERROR ToggleBranch.get("+name+") not set to a ToggleBranch!");

        return value;
    },

    set: function(name, value)  // value will be another toggle branch
    {
        if (FBTrace.DBG_DOMPLATE)
            if (value && !(value instanceof FBL.ToggleBranch)) FBTrace.sysout("ERROR ToggleBranch.set("+name+","+value+") not set to a ToggleBranch!");

        var metaName = this.getMeta(name);
        if (metaName)
            return this.meta[metaName] = value;
        else
            return this.normal[name] = value;
    },

    remove: function(name)  // remove the toggle branch at name
    {
        var metaName = this.getMeta(name);
        if (metaName)
            delete this.meta[metaName];
        else
            delete this.normal[name];
    },

    toString: function()
    {
        return "[ToggleBranch]";
    },
};

this.clearDomplate = function(node)
{
    if (!Firebug.clearDomplate)
        return;

    var walker = node.ownerDocument.createTreeWalker(node,
        Ci.nsIDOMNodeFilter.SHOW_ALL, null, true);

    while (node)
    {
        if (node.repObject)
            node.repObject = null;

        if (node.stackTrace)
            node.stackTrace = null;

        if (node.checked)
            node.checked = null;

        if (node.domObject)
            node.domObject = null;

        if (node.toggles)
            node.toggles = null;

        if (node.domPanel)
            node.domPanel = null;

        node = walker.nextNode();
    }
}

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

var classNameReCache={};

this.hasClass = function(node, name)
{
    if (!node || node.nodeType != 1 || !node.className || name == '')
        return false;

    if (name.indexOf(" ") != -1)
    {
        var classes = name.split(" "), len = classes.length, found=false;
        for (var i = 0; i < len; i++)
        {
            var cls = classes[i].trim();
            if (cls != "")
            {
                if (this.hasClass(node, cls) == false)
                    return false;
                found = true;
            }
        }
        return found;
    }

    var re;
    if (name.indexOf("-") == -1)
        re = classNameReCache[name] = classNameReCache[name] || new RegExp('(^|\\s)' + name + '(\\s|$)', "g");
    else // XXXsroussey don't cache these, they are often setting values. Should be using setUserData/getUserData???
        re = new RegExp('(^|\\s)' + name + '(\\s|$)', "g")
    return node.className.search(re) != -1;
};

this.setClass = function(node, name)
{
    if (!node || node.nodeType != 1 || name == '')
        return;

    if (name.indexOf(" ") != -1)
    {
        var classes = name.split(" "), len = classes.length;
        for (var i = 0; i < len; i++)
        {
            var cls = classes[i].trim();
            if (cls != "")
            {
                this.setClass(node, cls);
            }
        }
        return;
    }
    if (!this.hasClass(node, name))
        node.className = node.className.trim() + " " + name;
};

this.getClassValue = function(node, name)
{
    var re = new RegExp(name+"-([^ ]+)");
    var m = re.exec(node.className);
    return m ? m[1] : "";
};

this.removeClass = function(node, name)
{
    if (!node || node.nodeType != 1 || node.className == '' || name == '')
        return;

    if (name.indexOf(" ") != -1)
    {
        var classes = name.split(" "), len = classes.length;
        for (var i = 0; i < len; i++)
        {
            var cls = classes[i].trim();
            if (cls != "")
            {
                if (this.hasClass(node, cls) == false)
                    this.removeClass(node, cls);
            }
        }
        return;
    }

    var re;
    if (name.indexOf("-") == -1)
        re = classNameReCache[name] = classNameReCache[name] || new RegExp('(^|\\s)' + name + '(\\s|$)', "g");
    else // XXXsroussey don't cache these, they are often setting values. Should be using setUserData/getUserData???
        re = new RegExp('(^|\\s)' + name + '(\\s|$)', "g")

    node.className = node.className.replace(re, " ");

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
    if (FBTrace.DBG_HTML || FBTrace.DBG_SOURCEFILES)
    {
        FBTrace.sysout("FBL.setClassTimed elt.__setClassTimeout: "+elt.__setClassTimeout+
                " this.isVisible(elt): "+this.isVisible(elt)+
                " elt.__invisibleAtSetPoint: "+elt.__invisibleAtSetPoint);
    }

    if (!timeout)
        timeout = 1300;

    if (elt.__setClassTimeout)  // then we are already waiting to remove the class mark
        context.clearTimeout(elt.__setClassTimeout);  // reset the timer
    else                        // then we are not waiting to remove the mark
        this.setClass(elt, name);

    if (!this.isVisible(elt))
    {
        if (elt.__invisibleAtSetPoint)
            elt.__invisibleAtSetPoint--;
        else
            elt.__invisibleAtSetPoint = 5;
    }
    else
    {
        delete elt.__invisibleAtSetPoint;
    }

    elt.__setClassTimeout = context.setTimeout(function()
    {
        delete elt.__setClassTimeout;

        if (elt.__invisibleAtSetPoint)  // then user can't see it, try again later
            FBL.setClassTimed(elt, name, context, timeout);
        else
        {
            delete elt.__invisibleAtSetPoint;  // may be zero
            FBL.removeClass(elt, name);
        }
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

this.getAncestorByTagName = function(node, tagName)
{
    for (var parent = node; parent; parent = parent.parentNode)
    {
        if (parent.localName && parent.tagName.toLowerCase() == "input")
            return parent;
    }

    return null;
};

/* @Deprecated  Use native Firefox: node.getElementsByClassName(names).item(0) */
this.getElementByClass = function(node, className)  // className, className, ...
{
    return FBL.getElementsByClass.apply(this,arguments).item(0);
};

/* @Deprecated  Use native Firefox: node.getElementsByClassName(names) */
this.getElementsByClass = function(node, className)  // className, className, ...
{
    var args = cloneArray(arguments); args.splice(0, 1);
    var className = args.join(" ");
    return node.getElementsByClassName(className);
};

this.getElementsByAttribute = function(node, attrName, attrValue)
{
    function iteratorHelper(node, attrName, attrValue, result)
    {
        for (var child = node.firstChild; child; child = child.nextSibling)
        {
            if (child.getAttribute(attrName) == attrValue)
                result.push(child);

            iteratorHelper(child, attrName, attrValue, result);
        }
    }

    var result = [];
    iteratorHelper(node, attrName, attrValue, result);
    return result;
}

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

    return doc.documentElement;  // For non-HTML docs
};

// xxxHonza: move to a11y.js?
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

// xxxHonza: move to a11y.js?
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

// insideOutBox.js only
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
        return this.findNext(node.parentNode, criteria, true, maxRoot);
};

// insideOutBox.js
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

this.XW_instanceof = function(obj, type) // Cross Window instanceof; type is local to this window
{
    if (obj instanceof type)
        return true;  // within-window test

    if (!type)
        return false;
    if (!obj)
        return (type == "undefined");

    // compare strings: obj constructor.name to type.name.
    // This is not perfect, we should compare type.prototype to object.__proto__, but mostly code does not change the constructor object.
    do
    {
        if (obj.constructor && obj.constructor.name == type.name)  // then the function that constructed us is the argument
            return true;
    }
    while(obj = obj.__proto__);  // walk the prototype chain.
    return false;
    // https://developer.mozilla.org/en/Core_JavaScript_1.5_Guide/Property_Inheritance_Revisited/Determining_Instance_Relationships
}

// ************************************************************************************************
// DOM Modification

this.setOuterHTML = function(element, html)
{
    var doc = element.ownerDocument;
    var range = doc.createRange();
    range.selectNode(element || doc.documentElement);
    try
    {
        var fragment = range.createContextualFragment(html);
        var first = fragment.firstChild;
        var last = fragment.lastChild;
        element.parentNode.replaceChild(fragment, element);
        return [first, last];
    } catch (e)
    {
        return [element,element]
    }
};

this.appendInnerHTML = function(element, html, referenceElement)
{
    var doc = element.ownerDocument;
    var range = doc.createRange();  // a helper object
    range.selectNodeContents(element); // the environment to interpret the html

    var fragment = range.createContextualFragment(html);  // parse
    var firstChild = fragment.firstChild;
    element.insertBefore(fragment, referenceElement);
    return firstChild;
};

this.insertTextIntoElement = function(element, text)
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

    // Use nodeName (instead of localName) so namespace prefix is included (if any).
    for (; element && element.nodeType == 1; element = element.parentNode)
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

        var tagName = element.nodeName.toLowerCase();
        var pathIndex = (index ? "[" + (index+1) + "]" : "");
        paths.splice(0, 0, tagName + pathIndex);
    }

    return paths.length ? "/" + paths.join("/") : null;
};

this.getElementCSSPath = function(element)
{
    var paths = [];

    for (; element && element.nodeType == 1; element = element.parentNode)
    {
        var selector = this.getElementCSSSelector(element);
        paths.splice(0, 0, selector);
    }

    return paths.length ? paths.join(" ") : null;
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
        rule = this.trim(rule);
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
    var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
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

this.getLTRBWH = function(elt)
{
    var bcrect,
        dims = {"left": 0, "top": 0, "right": 0, "bottom": 0, "width": 0, "height": 0};

    if (elt)
    {
        bcrect = elt.getBoundingClientRect();
        dims.left = bcrect.left;
        dims.top = bcrect.top;
        dims.right = bcrect.right;
        dims.bottom = bcrect.bottom;

        if(bcrect.width)
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
    var onBottom = (element.scrollTop + element.offsetHeight) == element.scrollHeight;
    if (FBTrace.DBG_CONSOLE)
        FBTrace.sysout("FBL.isScrolledToBottom offsetHeight: " + element.offsetHeight +
            ", scrollTop: " + element.scrollTop + ", scrollHeight: " + element.scrollHeight +
            ", onBottom: " + onBottom);
    return onBottom;
};

this.scrollToBottom = function(element)
{
    element.scrollTop = element.scrollHeight;

    if (FBTrace.DBG_CONSOLE)
    {
        FBTrace.sysout("scrollToBottom reset scrollTop "+element.scrollTop+" = "+element.scrollHeight);
        if (element.scrollHeight == element.offsetHeight)
            FBTrace.sysout("scrollToBottom attempt to scroll non-scrollable element "+element, element);
    }

    return (element.scrollTop == element.scrollHeight);
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
    if (FBTrace.DBG_SOURCEFILES)
        FBTrace.sysout("lib.scrollIntoCenterView ","Element:"+element.innerHTML);
};

// ************************************************************************************************
// CSS

var cssKeywordMap = {};
var cssPropNames = {};
var cssColorNames = null;
var imageRules = null;

this.getCSSKeywordsByProperty = function(nodeType,propName)
{
    if (!cssKeywordMap[nodeType])
    {
        cssKeywordMap[nodeType] = {};

        for (var name in this.cssInfo[nodeType])
        {
            var list = [];

            var types = this.cssInfo[nodeType][name];
            for (var i = 0; i < types.length; ++i)
            {
                var keywords = this.cssKeywords[types[i]];
                if (keywords)
                    list.push.apply(list, keywords);
            }

            cssKeywordMap[nodeType][name] = list;
        }
    }

    return propName in cssKeywordMap[nodeType] ? cssKeywordMap[nodeType][propName] : [];
};

this.getCSSPropertyNames = function(nodeType)
{
    if (!cssPropNames[nodeType])
    {
        cssPropNames[nodeType] = [];

        for (var name in this.cssInfo[nodeType])
            cssPropNames[nodeType].push(name);
    }

    return cssPropNames[nodeType];
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

this.isImageRule = function(nodeType,rule)
{
    if (!imageRules)
    {
        imageRules = [];

        for (var i in this.cssInfo[nodeType])
        {
            var r = i.toLowerCase();
            var suffix = "image";
            if (r.match(suffix + "$") == suffix || r == "background")
                imageRules.push(r);
        }
    }

    return imageRules.indexOf(rule.toLowerCase()) != -1;
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
        "padding-left": "paddingLeft", "padding-bottom": "paddingBottom",
        "z-index": "zIndex",
    };

    var styles = {};
    for (var styleName in styleNames)
        styles[styleNames[styleName]] = parseInt(style.getPropertyCSSValue(styleName).cssText) || 0;
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
    if (!element || !element.localName)
        return "null";

    var label = getLocalName(element);
    if (element.id)
        label += "#" + element.id;

    if (element.classList && element.classList.length > 0)
        label += "." + element.classList.item(0);

    return label;
};

this.getURLForStyleSheet = function(styleSheet)
{
    // http://www.w3.org/TR/DOM-Level-2-Style/stylesheets.html#StyleSheets-StyleSheet.
    // For inline style sheets, the value of this attribute is null.
    return (styleSheet.href ? styleSheet.href : styleSheet.ownerNode.ownerDocument.URL);
};

this.getDocumentForStyleSheet = function(styleSheet)
{
    while (styleSheet.parentStyleSheet && !styleSheet.ownerNode)
    {
        styleSheet = styleSheet.parentStyleSheet;
    }
    if (styleSheet.ownerNode)
      return styleSheet.ownerNode.ownerDocument;
};

/**
 * Retrieves the instance number for a given style sheet. The instance number
 * is sheet's index within the set of all other sheets whose URL is the same.
 */
this.getInstanceForStyleSheet = function(styleSheet, ownerDocument)
{
    // ownerDocument is an optional hint for performance
    if (FBTrace.DBG_CSS)
        FBTrace.sysout("getInstanceForStyleSheet href:" + styleSheet.href + " mediaText:" + styleSheet.media.mediaText + " path to ownerNode" + (styleSheet.ownerNode && FBL.getElementXPath(styleSheet.ownerNode)), ownerDocument);

    ownerDocument = ownerDocument || FBL.getDocumentForStyleSheet(styleSheet);
    if(!ownerDocument)
        return;

    var ret = 0,
        styleSheets = ownerDocument.styleSheets,
        href = styleSheet.href;
    for (var i = 0; i < styleSheets.length; i++)
    {
        var curSheet = styleSheets[i];
        if (FBTrace.DBG_CSS) FBTrace.sysout("getInstanceForStyleSheet: compare href " + i + " " + curSheet.href + " " + curSheet.media.mediaText + " " + (curSheet.ownerNode && FBL.getElementXPath(curSheet.ownerNode)));
        if (curSheet == styleSheet)
            break;
        if (curSheet.href == href)
            ret++;
    }
    return ret;
};

// ************************************************************************************************
// HTML and XML Serialization

var getElementType = this.getElementType = function(node)
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
}

var getElementSimpleType = this.getElementSimpleType = function(node)
{
    if (isElementSVG(node))
        return 'svg';
    else if (isElementMathML(node))
        return 'mathml';
    else
        return 'html';
}

var isElementHTML = this.isElementHTML = function(node)
{
    return node.nodeName == node.nodeName.toUpperCase() && node.namespaceURI == 'http://www.w3.org/1999/xhtml';
}

var isElementXHTML = this.isElementXHTML = function(node)
{
    return node.nodeName != node.nodeName.toUpperCase() && node.namespaceURI == 'http://www.w3.org/1999/xhtml';
}

var isElementMathML = this.isElementMathML = function(node)
{
    return node.namespaceURI == 'http://www.w3.org/1998/Math/MathML';
}

var isElementSVG = this.isElementSVG = function(node)
{
    return node.namespaceURI == 'http://www.w3.org/2000/svg';
}

var isElementXUL = this.isElementXUL = function(node)
{
    return node instanceof XULElement;
}

var getNodeName = this.getNodeName = function(node)
{
    var name = node.nodeName;
    return isElementHTML(node) ? name.toLowerCase() : name;
}

var getLocalName = this.getLocalName = function(node)
{
    var name = node.localName;
    return isElementHTML(node) ? name.toLowerCase() : name;
}

this.isSelfClosing = function(element)
{
    if (isElementSVG(element) || isElementMathML(element))
        return true;
    var tag = element.localName.toLowerCase();
    return (this.selfClosingTags.hasOwnProperty(tag));
};

this.getElementHTML = function(element)
{
    var self=this;
    function toHTML(elt)
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
                if (attr.localName.indexOf("firebug-") == 0)
                    continue;

                // MathML
                if (attr.localName.indexOf("-moz-math") == 0)
                {
                    // just hide for now
                    continue;
                }

                html.push(' ', attr.nodeName, '="', escapeForElementAttribute(attr.nodeValue),'"');
            }

            if (elt.firstChild)
            {
                html.push('>');

                var pureText=true;
                for (var child = element.firstChild; child; child = child.nextSibling)
                    pureText=pureText && (child.nodeType == Node.TEXT_NODE);

                if (pureText)
                    html.push(escapeForHtmlEditor(elt.textContent));
                else {
                    for (var child = elt.firstChild; child; child = child.nextSibling)
                        toHTML(child);
                }

                html.push('</', nodeName, '>');
            }
            else if (isElementSVG(elt) || isElementMathML(elt))
            {
                html.push('/>');
            }
            else if (self.isSelfClosing(elt))
            {
                html.push((isElementXHTML(elt))?'/>':'>');
            }
            else
            {
                html.push('></', nodeName, '>');
            }
        }
        else if (elt.nodeType == Node.TEXT_NODE)
            html.push(escapeForTextNode(elt.textContent));
        else if (elt.nodeType == Node.CDATA_SECTION_NODE)
            html.push('<![CDATA[', elt.nodeValue, ']]>');
        else if (elt.nodeType == Node.COMMENT_NODE)
            html.push('<!--', elt.nodeValue, '-->');
    }

    var html = [];
    toHTML(element);
    return html.join("");
};

this.getElementXML = function(element)
{
    function toXML(elt)
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
                if (attr.localName.indexOf("firebug-") == 0)
                    continue;

                // MathML
                if (attr.localName.indexOf("-moz-math") == 0)
                {
                    // just hide for now
                    continue;
                }

                xml.push(' ', attr.nodeName, '="', escapeForElementAttribute(attr.nodeValue),'"');
            }

            if (elt.firstChild)
            {
                xml.push('>');

                for (var child = elt.firstChild; child; child = child.nextSibling)
                    toXML(child);

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
    toXML(element);
    return xml.join("");
};

// ************************************************************************************************
// Whitespace and Entity conversions

/**
 * Returns true if given document is based on a XML and so displaying pretty printed XML elements.
 */
this.isXMLPrettyPrint = function(context, win)
{
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

        var bindings = this.domUtils.getBindingURLs(doc.documentElement);
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
            FBTrace.sysout("css.isXMLPrettyPrint; EXCEPTION "+e, e);
    }
};

// ************************************************************************************************
// Whitespace and Entity conversions

var entityConversionLists = this.entityConversionLists = {
    normal : {
        whitespace : {
            '\t' : '\u200c\u2192',
            '\n' : '\u200c\u00b6',
            '\r' : '\u200c\u00ac',
            ' '  : '\u200c\u00b7'
        }
    },
    reverse : {
        whitespace : {
            '&Tab;' : '\t',
            '&NewLine;' : '\n',
            '\u200c\u2192' : '\t',
            '\u200c\u00b6' : '\n',
            '\u200c\u00ac' : '\r',
            '\u200c\u00b7' : ' '
        }
    }
};

var normal = entityConversionLists.normal,
    reverse = entityConversionLists.reverse;

function addEntityMapToList(ccode, entity)
{
    var lists = Array.slice(arguments, 2),
        len = lists.length,
        ch = String.fromCharCode(ccode);
    for (var i = 0; i < len; i++)
    {
        var list = lists[i];
        normal[list]=normal[list] || {};
        normal[list][ch] = '&' + entity + ';';
        reverse[list]=reverse[list] || {};
        reverse[list]['&' + entity + ';'] = ch;
    }
}

var e = addEntityMapToList,
    white = 'whitespace',
    text = 'text',
    attr = 'attributes',
    css = 'css',
    editor = 'editor';

e(0x0000, '#0', text, attr, css, editor);
e(0x0022, 'quot', attr, css);
e(0x0026, 'amp', attr, text, css);
e(0x0027, 'apos', css);
e(0x003c, 'lt', attr, text, css);
e(0x003e, 'gt', attr, text, css);
e(0xa9, 'copy', text, editor);
e(0xae, 'reg', text, editor);
e(0x2122, 'trade', text, editor);

// See http://en.wikipedia.org/wiki/Dash
e(0x2012, '#8210', attr, text, editor); // figure dash
e(0x2013, 'ndash', attr, text, editor); // en dash
e(0x2014, 'mdash', attr, text, editor); // em dash
e(0x2015, '#8213', attr, text, editor); // horizontal bar

e(0x00a0, 'nbsp', attr, text, white, editor);
e(0x2002, 'ensp', attr, text, white, editor);
e(0x2003, 'emsp', attr, text, white, editor);
e(0x2009, 'thinsp', attr, text, white, editor);
e(0x200c, 'zwnj', attr, text, white, editor);
e(0x200d, 'zwj', attr, text, white, editor);
e(0x200e, 'lrm', attr, text, white, editor);
e(0x200f, 'rlm', attr, text, white, editor);
e(0x200b, '#8203', attr, text, white, editor); // zero-width space (ZWSP)

//************************************************************************************************
// Entity escaping

var entityConversionRegexes = {
        normal : {},
        reverse : {}
    };

var escapeEntitiesRegEx = {
    normal : function(list)
    {
        var chars = [];
        for ( var ch in list)
        {
            chars.push(ch);
        }
        return new RegExp('([' + chars.join('') + '])', 'gm');
    },
    reverse : function(list)
    {
        var chars = [];
        for ( var ch in list)
        {
            chars.push(ch);
        }
        return new RegExp('(' + chars.join('|') + ')', 'gm');
    }
};

function getEscapeRegexp(direction, lists)
{
    var name = '', re;
    var groups = [].concat(lists);
    for (i = 0; i < groups.length; i++)
    {
        name += groups[i].group;
    }
    re = entityConversionRegexes[direction][name];
    if (!re)
    {
        var list = {};
        if (groups.length > 1)
        {
            for ( var i = 0; i < groups.length; i++)
            {
                var aList = entityConversionLists[direction][groups[i].group];
                for ( var item in aList)
                    list[item] = aList[item];
            }
        } else if (groups.length==1)
        {
            list = entityConversionLists[direction][groups[0].group]; // faster for special case
        } else {
            list = {}; // perhaps should print out an error here?
        }
        re = entityConversionRegexes[direction][name] = escapeEntitiesRegEx[direction](list);
    }
    return re;
}

function createSimpleEscape(name, direction)
{
    return function(value)
    {
        var list = entityConversionLists[direction][name];
        return String(value).replace(
                getEscapeRegexp(direction, {
                    group : name,
                    list : list
                }),
                function(ch)
                {
                    return list[ch];
                }
               );
    }
}

function escapeGroupsForEntities(str, lists)
{
    lists = [].concat(lists);
    var re = getEscapeRegexp('normal', lists),
        split = String(str).split(re),
        len = split.length,
        results = [],
        cur, r, i, ri = 0, l, list, last = '';
    if (!len)
        return [ {
            str : String(str),
            group : '',
            name : ''
        } ];
    for (i = 0; i < len; i++)
    {
        cur = split[i];
        if (cur == '')
            continue;
        for (l = 0; l < lists.length; l++)
        {
            list = lists[l];
            r = entityConversionLists.normal[list.group][cur];
            // if (cur == ' ' && list.group == 'whitespace' && last == ' ') // only show for runs of more than one space
            //     r = ' ';
            if (r)
            {
                results[ri] = {
                    'str' : r,
                    'class' : list['class'],
                    'extra' : list.extra[cur] ? list['class']
                            + list.extra[cur] : ''
                };
                break;
            }
        }
        // last=cur;
        if (!r)
            results[ri] = {
                'str' : cur,
                'class' : '',
                'extra' : ''
            };
        ri++;
    }
    return results;
}

this.escapeGroupsForEntities = escapeGroupsForEntities;

function unescapeEntities(str, lists)
{
    var re = getEscapeRegexp('reverse', lists),
        split = String(str).split(re),
        len = split.length,
        results = [],
        cur, r, i, ri = 0, l, list;
    if (!len)
        return str;
    lists = [].concat(lists);
    for (i = 0; i < len; i++)
    {
        cur = split[i];
        if (cur == '')
            continue;
        for (l = 0; l < lists.length; l++)
        {
            list = lists[l];
            r = entityConversionLists.reverse[list.group][cur];
            if (r)
            {
                results[ri] = r;
                break;
            }
        }
        if (!r)
            results[ri] = cur;
        ri++;
    }
    return results.join('') || '';
}


// ************************************************************************************************
// String escaping

var escapeForTextNode = this.escapeForTextNode = createSimpleEscape('text', 'normal');
var escapeForHtmlEditor = this.escapeForHtmlEditor = createSimpleEscape('editor', 'normal');
var escapeForElementAttribute = this.escapeForElementAttribute = createSimpleEscape('attributes', 'normal');
var escapeForCss = this.escapeForCss = createSimpleEscape('css', 'normal');

// deprecated compatibility functions
this.deprecateEscapeHTML = createSimpleEscape('text', 'normal');
this.deprecatedUnescapeHTML = createSimpleEscape('text', 'reverse');

this.escapeHTML = Deprecated.deprecated("use appropriate escapeFor... function",
    this.deprecateEscapeHTML);
this.unescapeHTML = Deprecated.deprecated("use appropriate unescapeFor... function",
    this.deprecatedUnescapeHTML);

var escapeForSourceLine = this.escapeForSourceLine = createSimpleEscape('text', 'normal');

var unescapeWhitespace = createSimpleEscape('whitespace', 'reverse');

this.unescapeForTextNode = function(str)
{
    if (Options.get("showTextNodesWithWhitespace"))
        str = unescapeWhitespace(str);

    if (!Options.get("showTextNodesWithEntities"))
        str = escapeForElementAttribute(str);

    return str;
}

this.unescapeForURL = createSimpleEscape('text', 'reverse');

this.escapeNewLines = function(value)
{
    return value.replace(/\r/gm, "\\r").replace(/\n/gm, "\\n");
};

this.stripNewLines = function(value)
{
    return typeof(value) == "string" ? value.replace(/[\r\n]/gm, " ") : value;
};

this.escapeJS = function(value)
{
    return value.replace(/\r/gm, "\\r").replace(/\n/gm, "\\n").replace('"', '\\"', "g");
};

this.cropString = function(text, limit, alterText)
{
    if (!alterText)
        alterText = "...";

    // Make sure it's a string.
    text = text + "";

    // Use default limit if necessary.
    if (!limit)
        limit = Options.get("stringCropLength");

    // Crop the string only if a limit is actualy specified.
    if (limit <= 0)
        return text;

    var halfLimit = (limit / 2);
    halfLimit -= 2; // adjustment for alterText's increase in size

    if (text.length > limit)
        return text.substr(0, halfLimit) + alterText + text.substr(text.length-halfLimit);

    return text;
};

this.lineBreak = function()
{
    if (navigator.appVersion.indexOf("Win") != -1)
    {
      return '\r\n';
    }

    if (navigator.appVersion.indexOf("Mac") != -1)
    {
      return '\r';
    }

    return '\n';
};

this.cropMultipleLines = function(text, limit)
{
    return this.escapeNewLines(this.cropString(text, limit));
};

this.isWhitespace = function(text)
{
    return !reNotWhitespace.exec(text);
};

this.splitLines = function(text)
{
    const reSplitLines2 = /.*(:?\r\n|\n|\r)?/mg;
    var lines;
    if (text.match)
    {
        lines = text.match(reSplitLines2);
    }
    else
    {
        var str = text+"";
        lines = str.match(reSplitLines2);
    }
    lines.pop();
    return lines;
};

this.trim = function(text)
{
    return text.replace(/^\s*|\s*$/g,"");
}

this.trimLeft = function(text)
{
    return text.replace(/^\s+/,"");
}

this.trimRight = function(text)
{
    return text.replace(/\s+$/,"");
}

this.wrapText = function(text, noEscapeHTML)
{
    var reNonAlphaNumeric = /[^A-Za-z_$0-9'"-]/;

    var html = [];
    var wrapWidth = Options.get("textWrapWidth");

    // Split long text into lines and put every line into a <code> element (only in case
    // if noEscapeHTML is false). This is useful for automatic scrolling when searching
    // within response body (in order to scroll we need an element).
    // Don't use <pre> elements since this adds additional new line endings when copying
    // selected source code using Firefox->Edit->Copy (Ctrl+C) (issue 2093).
    var lines = this.splitLines(text);
    for (var i = 0; i < lines.length; ++i)
    {
        var line = lines[i];

        if (wrapWidth > 0)
        {
            while (line.length > wrapWidth)
            {
                var m = reNonAlphaNumeric.exec(line.substr(wrapWidth, 100));
                var wrapIndex = wrapWidth + (m ? m.index : 0);
                var subLine = line.substr(0, wrapIndex);
                line = line.substr(wrapIndex);

                if (!noEscapeHTML) html.push("<code class=\"wrappedText focusRow\" role=\"listitem\">");
                html.push(noEscapeHTML ? subLine : escapeForTextNode(subLine));
                if (!noEscapeHTML) html.push("</code>");
            }
        }

        if (!noEscapeHTML) html.push("<code class=\"wrappedText focusRow\" role=\"listitem\">");
        html.push(noEscapeHTML ? line : escapeForTextNode(line));
        if (!noEscapeHTML) html.push("</code>");
    }

    return html;
}

this.insertWrappedText = function(text, textBox, noEscapeHTML)
{
    var html = this.wrapText(text, noEscapeHTML);
    textBox.innerHTML = "<pre role=\"list\">" + html.join("") + "</pre>";
}

// ************************************************************************************************
// Indent

const reIndent = /^(\s+)/;

function getIndent(line)
{
    var m = reIndent.exec(line);
    return m ? m[0].length : 0;
}

this.cleanIndentation = function(text)
{
    var lines = this.splitLines(text);

    var minIndent = -1;
    for (var i = 0; i < lines.length; ++i)
    {
        var line = lines[i];
        var indent = getIndent(line);
        if (minIndent == -1 && line && !this.isWhitespace(line))
            minIndent = indent;
        if (indent >= minIndent)
            lines[i] = line.substr(minIndent);
    }
    return lines.join("");
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
    var label = item.nol10n ? item.label : Locale.$STR(item.label);

    element.setAttribute("label", label);

    if (item.id)
        element.setAttribute("id", item.id);

    if (item.type)
        element.setAttribute("type", item.type);

    // Avoid closing the popup menu if a preference has been changed.
    // This allows to quickly change more options.
    if (item.type == "checkbox")
        element.setAttribute("closemenu", "none");

    if (item.checked)
        element.setAttribute("checked", "true");

    if (item.disabled)
        element.setAttribute("disabled", "true");

    if (item.image)
    {
        element.setAttribute("class", "menuitem-iconic");
        element.setAttribute("image", item.image);
    }

    if (item.command)
        element.addEventListener("command", item.command, false);

    if (item.commandID)
        element.setAttribute("command", item.commandID);

    if (item.option)
        element.setAttribute("option", item.option);

    if (item.tooltiptext)
    {
        var tooltiptext = item.nol10n ? item.tooltiptext : Locale.$STR(item.tooltiptext);
        element.setAttribute("tooltiptext", tooltiptext);
    }

    if (item.className)
        FBL.setClass(element, item.className);

    if (item.acceltext)
        element.setAttribute("acceltext", item.acceltext);

    return element;
}

this.createMenuHeader = function(popup, item)
{
    var header = popup.ownerDocument.createElement("label");
    header.setAttribute("class", "menuHeader");

    var label = item.nol10n ? item.label : Locale.$STR(item.label);

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

/**
 * Create an option menu item definition. This method is usually used in methods like:
 * {@link Firebug.Panel.getOptionsMenuItems} or {@link Firebug.Panel.getContextMenuItems}.
 *
 * @param {String} label Name of the string from *.properties file.
 * @param {String} option Name of the associated option.
 * @param {String, Optional} tooltiptext Optional name of the string from *.properties file
 *      that should be used as a tooltip for the menu.
 */
this.optionMenu = function(label, option, tooltiptext)
{
    return {
        label: label,
        type: "checkbox",
        checked: Firebug[option],
        option: option,
        tooltiptext: tooltiptext,
        command: function() {
            return Options.set(option, !Firebug[option]);
        }
    };
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
            Events.attachAllListeners(object, context.onMonitorEvent, context);
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
                Events.detachAllListeners(object, context.onMonitorEvent, context);
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

    if (!fn || typeof(fn) !== 'function')
        return found;

    var wrapped = this.jsd.wrapValue(fn);
    found = wrapped.script;
    if (!found)
        found = wrapped.jsParent.script;

    if (!found && FBTrace.DBG_ERRORS)
        FBTrace.sysout("findScriptForFunctionInContext ",{fn: fn, wrapValue: this.jsd.wrapValue(fn), found: found});
    if (FBTrace.DBG_FUNCTION_NAMES)
        FBTrace.sysout("findScriptForFunctionInContext found "+(found?found.tag:"none")+"\n");

    return found;
}

this.findSourceForFunction = function(fn, context)
{
    var script = this.findScriptForFunctionInContext(context, fn);
    return (script)? this.getSourceLinkForScript(script, context) : null;
};

this.getSourceLinkForScript = function(script, context)
{
    var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, script);
    if (sourceFile)
    {
        var scriptAnalyzer = sourceFile.getScriptAnalyzer(script);
        if (scriptAnalyzer)
            return scriptAnalyzer.getSourceLinkForScript(script);
        else
        {
            // no-op for detrace
            if (FBTrace.DBG_ERRORS) FBTrace.sysout("getSourceLineForScript FAILS no scriptAnalyser for sourceFile "+sourceFile);
        }
    }
};

// ************************************************************************************************
// Source Files

this.getSourceFileByHref = function(url, context)
{
    return context.sourceFileMap[url];
};

this.sourceURLsAsArray = function(context)
{
    var urls = [];
    var sourceFileMap = context.sourceFileMap;
    for (var url in sourceFileMap)
        urls.push(url);

    if (FBTrace.DBG_SOURCEFILES)
        FBTrace.sysout("sourceURLsAsArray urls="+urls.length+" in context "+context.getName()+"\n");

    return urls;
};

// deprecated, use mapAsArray
this.sourceFilesAsArray = function(sourceFileMap)
{
    var sourceFiles = [];
    for (var url in sourceFileMap)
        sourceFiles.push(sourceFileMap[url]);

    if (FBTrace.DBG_SOURCEFILES)
        FBTrace.sysout("sourceFilesAsArray sourcefiles="+sourceFiles.length, sourceFiles);

    return sourceFiles;
};

this.mapAsArray = function(map)
{
    var entries = [];
    for (var url in map)
        entries.push(map[url]);

    return entries;
};

// ************************************************************************************************
// CSS

this.getAllStyleSheets = function(context)
{
    var styleSheets = [];

    function addSheet(sheet)
    {
        var sheetLocation =  FBL.getURLForStyleSheet(sheet);

        if (!Options.get("showUserAgentCSS") && URL.isSystemURL(sheetLocation))
            return;

        if (sheet.ownerNode && Firebug.shouldIgnore(sheet.ownerNode))
            return;

        styleSheets.push(sheet);
        try
        {
            for (var i = 0; i < sheet.cssRules.length; ++i)
            {
                var rule = sheet.cssRules[i];
                if (rule instanceof CSSImportRule)
                    addSheet(rule.styleSheet);
            }
        }
        catch(e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("getAllStyleSheets sheet.cssRules FAILS for "+(sheet?sheet.href:"null sheet")+e, e);
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
    if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
    {
        var r = FBL.totalRules;
        var s = FBL.totalSheets;
        var t = new Date();
    }

    if (!context.styleSheetMap)
        FBL.createStyleSheetMap(context);  // fill cache

    if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
        FBTrace.sysout((FBL.totalRules-r)+" rules in "+ (FBL.totalSheets-s)+" sheets required "+(new Date().getTime() - t.getTime())+" ms", context.styleSheetMap);

    // hasOwnProperty is called to prevent possible conflicts with prototype extensions and strict mode warnings
    return context.styleSheetMap.hasOwnProperty(url) ? context.styleSheetMap[url] : undefined;
};

this.createStyleSheetMap = function(context)
{
    context.styleSheetMap = {};

    function addSheet(sheet)
    {
        var sheetURL = FBL.getURLForStyleSheet(sheet);
        context.styleSheetMap[sheetURL] = sheet;

        if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
        {
            FBL.totalSheets++;
            FBTrace.sysout("addSheet "+FBL.totalSheets+" "+sheetURL);
        }

        // recurse for imported sheets

        for (var i = 0; i < sheet.cssRules.length; ++i)
        {
            if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
                FBL.totalRules++;

            var rule = sheet.cssRules[i];
            if (rule instanceof CSSStyleRule)
            {
                if (rule.type == CSSRule.STYLE_RULE)  // once we get here no more imports
                    return;
            }
            else if (rule instanceof CSSImportRule)
            {
                addSheet(rule.styleSheet);
            }
        }
    }

    this.iterateWindows(context.window, function(subwin)
    {
        var rootSheets = subwin.document.styleSheets;
        if (!rootSheets)
            return; // XUL?

        for (var i = 0; i < rootSheets.length; ++i)
        {
            addSheet(rootSheets[i]);
        }
    });

    if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
        FBTrace.sysout("createStyleSheetMap for "+context.getName(), context.styleSheetMap);

    return context.styleSheetMap;
};

this.safeGetCSSRules = function(styleSheet)
{
    try
    {
        return styleSheet.cssRules;
    }
    catch (e)
    {
    }

    return null;
}

// ************************************************************************************************
// Firefox browsing

this.openNewTab = function(url, postText)
{
    if (!url)
        return;

    var postData = null;
    if (postText)
    {
        var stringStream = this.getInputStreamFromString(postText);
        postData = Cc["@mozilla.org/network/mime-input-stream;1"].createInstance(Ci.nsIMIMEInputStream);
        postData.addHeader("Content-Type", "application/x-www-form-urlencoded");
        postData.addContentLength = true;
        postData.setData(stringStream);
    }

    return gBrowser.selectedTab = gBrowser.addTab(url, null, null, postData);
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

this.iterateBrowserTabs = function(browserWindow, callback)
{
    var tabBrowser = browserWindow.getBrowser();
    var numTabs = tabBrowser.browsers.length;
    for(var index=0; index<numTabs; index++)
    {
        var currentBrowser = tabBrowser.getBrowserAtIndex(index);
        if (callback(tabBrowser.mTabs[index], currentBrowser))
            return true;
    }

    return false;
}

/**
 * Returns <browser> element for specified content window.
 * @param {Object} win - Content window
 */
this.getBrowserForWindow = function(win)
{
    var tabBrowser = document.getElementById("content");
    if (tabBrowser && win.document)
        return tabBrowser.getBrowserForDocument(win.document);
};

// ************************************************************************************************

this.getWindowId = function(win)
{
    var util = win.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindowUtils);
    var innerWindowID = "(none)";
    try
    {
        var outerWindowID = util.outerWindowID;
        innerWindowID = util.currentInnerWindowID;
    }
    catch(exc)
    {
        // no - op
    }
    return {outer: outerWindowID, inner: innerWindowID, toString: function(){return this.outer+"."+this.inner;}};
};

this.safeGetWindowLocation = function(window)
{
    try
    {
        if (window)
        {
            if (window.closed)
                return "(window.closed)";
            if ("location" in window)
                return window.location+"";
            else
                return "(no window.location)";
        }
        else
            return "(no context.window)";
    }
    catch(exc)
    {
        if (FBTrace.DBG_WINDOWS || FBTrace.DBG_ERRORS)
            FBTrace.sysout("TabContext.getWindowLocation failed "+exc, exc);
            FBTrace.sysout("TabContext.getWindowLocation failed window:", window);
        return "(getWindowLocation: "+exc+")";
    }
};

this.safeGetRequestName = function(request)
{
    try
    {
        return request.name;
    }
    catch (exc)
    {
    }

    return null;
}

this.safeGetContentType = function(request)
{
    try
    {
        return new String(request.contentType).toLowerCase();
    }
    catch (err)
    {
    }

    return null;
}

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

this.jsKeywords =
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
    return name in FBL.jsKeywords;
};

// ************************************************************************************************
// URLs

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

this.parseURLEncodedText = function(text, noLimit)
{
    const maxValueLength = 25000;

    var params = [];

    // In case the text is empty just return the empty parameters
    if(text == '')
        return params;

    // Unescape '+' characters that are used to encode a space.
    // See section 2.2.in RFC 3986: http://www.ietf.org/rfc/rfc3986.txt
    text = text.replace(/\+/g, " ");

    // Unescape '&amp;' character
    text = this.unescapeForURL(text);

    function decodeText(text)
    {
        try
        {
            return decodeURIComponent(text);
        }
        catch (e)
        {
            return decodeURIComponent(unescape(text));
        }
    }

    var args = text.split("&");
    for (var i = 0; i < args.length; ++i)
    {
        try
        {
            var index = args[i].indexOf("=");
            if (index != -1)
            {
                var paramName = args[i].substring(0, index);
                var paramValue = args[i].substring(index + 1);

                if (paramValue.length > maxValueLength && !noLimit)
                    paramValue = Locale.$STR("LargeData");

                params.push({name: decodeText(paramName), value: decodeText(paramValue)});
            }
            else
            {
                var paramName = args[i];
                params.push({name: decodeText(paramName), value: ""});
            }
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("parseURLEncodedText EXCEPTION ", e);
                FBTrace.sysout("parseURLEncodedText EXCEPTION URI", args[i]);
            }
        }
    }

    params.sort(function(a, b) { return a.name <= b.name ? -1 : 1; });

    return params;
};

this.reEncodeURL = function(file, text, noLimit)
{
    var lines = text.split("\n");
    var params = this.parseURLEncodedText(lines[lines.length-1], noLimit);

    var args = [];
    for (var i = 0; i < params.length; ++i)
        args.push(encodeURIComponent(params[i].name)+"="+encodeURIComponent(params[i].value));

    var url = file.href;
    url += (url.indexOf("?") == -1 ? "?" : "&") + args.join("&");

    return url;
};

this.getResource = function(aURL)
{
    try
    {
        var channel=ioService.newChannel(aURL,null,null);
        var input=channel.open();
        return FBL.readFromStream(input);
    }
    catch (e)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.getResource FAILS for \'"+aURL+"\'", e);
    }
};

// ************************************************************************************************
// JSON

this.parseJSONString = function(jsonString, originURL)
{
    if (FBTrace.DBG_JSONVIEWER)
        FBTrace.sysout("jsonviewer.parseJSON; " + jsonString);

    // See if this is a Prototype style *-secure request.
    var regex = new RegExp(/\s*\/\*-secure-([\s\S]*)\*\/\s*$/);
    var matches = regex.exec(jsonString);

    if (matches)
    {
        jsonString = matches[1];

        if (jsonString[0] == "\\" && jsonString[1] == "n")
            jsonString = jsonString.substr(2);

        if (jsonString[jsonString.length-2] == "\\" && jsonString[jsonString.length-1] == "n")
            jsonString = jsonString.substr(0, jsonString.length-2);
    }

    if (jsonString.indexOf("&&&START&&&"))
    {
        regex = new RegExp(/&&&START&&& (.+) &&&END&&&/);
        matches = regex.exec(jsonString);
        if (matches)
            jsonString = matches[1];
    }

    try
    {
        var s = Components.utils.Sandbox(originURL);

        // throw on the extra parentheses
        return Components.utils.evalInSandbox("(" + jsonString + ")", s);
    }
    catch(e)
    {
        if (FBTrace.DBG_JSONVIEWER)
            FBTrace.sysout("jsonviewer.parseJSON FAILS on "+originURL+" for \""+jsonString+
                "\" with EXCEPTION "+e, e);
    }

    // Let's try to parse it as JSONP.
    var reJSONP = /^\s*([A-Za-z0-9_.]+\s*(?:\[.*\]|))\s*\(.*\)/;
    var m = reJSONP.exec(jsonString);
    if (!m || !m[1])
        return null;

    if (FBTrace.DBG_JSONVIEWER)
        FBTrace.sysout("jsonviewer.parseJSONP; " + jsonString);

    var callbackName = m[1];

    if (FBTrace.DBG_JSONVIEWER)
        FBTrace.sysout("jsonviewer.parseJSONP; Look like we have a JSONP callback: " + callbackName);

    // Replace the original callback (it can be e.g. foo.bar[1]) with simple function name.
    jsonString = jsonString.replace(callbackName, "callback");

    try
    {
        var s = Components.utils.Sandbox(originURL);
        s["callback"] = function(object) { return object; };
        return Components.utils.evalInSandbox(jsonString, s);
    }
    catch(ex)
    {
        if (FBTrace.DBG_JSONVIEWER)
            FBTrace.sysout("jsonviewer.parseJSON EXCEPTION", e);
    }

    return null;
};

this.parseJSONPString = function(jsonString, originURL)
{
}

// ************************************************************************************************
// Network

this.readFromStream = function(stream, charset, noClose)
{
    var sis = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
    sis.setInputStream(stream);

    var segments = [];
    for (var count = stream.available(); count; count = stream.available())
        segments.push(sis.readBytes(count));

    if (!noClose)
        sis.close();

    var text = segments.join("");

    try
    {
        return this.convertToUnicode(text, charset);
    }
    catch (err)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("LIB.readFromStream EXCEPTION charset: " + charset, err);
    }

    return text;
};

this.readPostTextFromPage = function(url, context)
{
    if (url == context.browser.contentWindow.location.href)
    {
        try
        {
            var webNav = context.browser.webNavigation;
            var descriptor = (webNav instanceof Ci.nsIWebPageDescriptor) ?
                webNav.currentDescriptor : null;

            if (!(descriptor instanceof Ci.nsISHEntry))
                return;

            if (entry && entry.postData)
            {
                if (!(entry.postData instanceof Ci.nsISeekableStream))
                    return;

                var postStream = entry.postData;
                postStream.seek(NS_SEEK_SET, 0);

                var charset = context.window.document.characterSet;
                return this.readFromStream(postStream, charset, true);
            }
         }
         catch (exc)
         {
             if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("lib.readPostText FAILS, url:"+url, exc);
         }
     }
};

this.readPostTextFromRequest = function(request, context)
{
    try
    {
        var is = (request instanceof Ci.nsIUploadChannel) ? request.uploadStream : null;
        if (is)
        {
            if (!(is instanceof Ci.nsISeekableStream))
                return;

            var ss = is;
            var prevOffset;
            if (ss)
            {
                prevOffset = ss.tell();
                ss.seek(NS_SEEK_SET, 0);
            }

            // Read data from the stream..
            var charset = (context && context.window) ? context.window.document.characterSet : null;
            var text = this.readFromStream(is, charset, true);

            // Seek locks the file so, seek to the beginning only if necko hasn't read it yet,
            // since necko doesn't seek to 0 before reading (at lest not till 459384 is fixed).
            if (ss && prevOffset == 0)
                ss.seek(NS_SEEK_SET, 0);

            return text;
        }
    }
    catch(exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.readPostTextFromRequest FAILS ", exc);
    }

    return null;
};

this.getInputStreamFromString = function(dataString)
{
    var stringStream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);

    if ("data" in stringStream) // Gecko 1.9 or newer
        stringStream.data = dataString;
    else // 1.8 or older
        stringStream.setData(dataString, dataString.length);

    return stringStream;
};

this.getWindowForRequest = function(request)
{
    var loadContext = this.getRequestLoadContext(request);
    try
    {
        if (loadContext)
            return loadContext.associatedWindow;
    }
    catch (ex)
    {
    }

    return null;
};

this.getRequestLoadContext = function(request)
{
    try
    {
        if (request && request.notificationCallbacks)
        {
            FBL.suspendShowStackTrace();
            return request.notificationCallbacks.getInterface(Ci.nsILoadContext);
        }
    }
    catch (exc)
    {
    }
    finally
    {
        FBL.resumeShowStackTrace();
    }

    try
    {
        if (request && request.loadGroup && request.loadGroup.notificationCallbacks)
        {
            FBL.suspendShowStackTrace();
            return request.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext);
        }
    }
    catch (exc)
    {
    }
    finally
    {
        FBL.resumeShowStackTrace();
    }

    return null;
};

this.getRequestWebProgress = Deprecated.deprecated("Use getRequestLoadContext function",
    this.getRequestLoadContext);


// ************************************************************************************************
// Stack Trace

var saveShowStackTrace = {};

/*
 * use in the try{} around a call to getInterface to prevent fbs from generating stack traces
 */
this.suspendShowStackTrace = function()
{
    saveShowStackTrace = Options.get("showStackTrace");
    Options.set("showStackTrace", false);
};

/*
 * use in the finally{} to undo the suspendShowStackTrace
 */
this.resumeShowStackTrace = function()
{
    Options.set("saveShowStackTrace", saveShowStackTrace);
};

// ************************************************************************************************

this.BaseProgressListener =
{
    QueryInterface : function(iid)
    {
        if (iid.equals(Ci.nsIWebProgressListener) ||
            iid.equals(Ci.nsISupportsWeakReference) ||
            iid.equals(Ci.nsISupports))
        {
            return this;
        }

        throw Components.results.NS_NOINTERFACE;
    },

    stateIsRequest: false,
    onLocationChange: function() {},
    onStateChange : function() {},
    onProgressChange : function() {},
    onStatusChange : function() {},
    onSecurityChange : function() {},
    onLinkIconAvailable : function() {}
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
    try
    {
        var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
        file.initWithPath(exePath);
        if (this.getPlatformName() == "Darwin" && file.isDirectory())
        {
            args = this.extendArray(["-a", exePath], args);
            file.initWithPath("/usr/bin/open");
        }
        if (!file.exists())
            return false;
        var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
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
    var fileHandler = ioService.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler);
    try {
        var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
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
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("getIconURLForFile ERROR "+exc+" for "+path, exc);
    }
    return null;
}

this.makeURI = function(urlString)
{
    try
    {
        if (urlString)
            return ioService.newURI(urlString, null, null);
    }
    catch(exc)
    {
        //var explain = {message: "Firebug.lib.makeURI FAILS", url: urlString, exception: exc};
        // todo convert explain to json and then to data url
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("makeURI FAILS for \""+urlString+"\" ", exc);
        return false;
    }
}

// ************************************************************************************************
// Persistence (cross page refresh)

this.persistObjects = function(panel, panelState)
{
    // Persist the location and selection so we can restore them in case of a reload
    if (panel.location)
        panelState.persistedLocation = this.persistObject(panel.location, panel.context); // fn(context)->location

    if (panel.selection)
        panelState.persistedSelection = this.persistObject(panel.selection, panel.context);

    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("lib.persistObjects "+panel.name+" panel.location:"+panel.location+
            " panel.selection:"+panel.selection+" panelState:", panelState);
};

this.persistObject = function(object, context)
{
    var rep = Firebug.getRep(object, context);
    return rep ? rep.persistObject(object, context) : null;
};

this.restoreLocation =  function(panel, panelState)
{
    var restored = false;

    if (!panel.location && panelState && panelState.persistedLocation)
    {
        var location = panelState.persistedLocation(panel.context);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("lib.restoreObjects "+panel.name+" persistedLocation: "+location+
                " panelState:", panelState);

        if (location)
        {
            panel.navigate(location);
            restored = true;
        }
    }

    if (!panel.location)
        panel.navigate(null);

    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("lib.restoreLocation panel.location: "+panel.location+" restored: "+
            restored+" panelState:", panelState);

    return restored;
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
            if (panel.selection == panel.getDefaultSelection() && panelState.persistedSelection)
            {
                var selection = panelState.persistedSelection(panel.context);
                if (selection)
                    panel.select(selection);
            }

            if (FBTrace.DBG_INITIALIZE)
                FBTrace.sysout("lib.overrideDefaultsWithPersistedValues "+panel.name+
                    " panel.location: "+panel.location+" panel.selection: "+panel.selection+
                    " panelState:", panelState);
        }

        // If we couldn't restore the selection, wait a bit and try again
        panel.context.setTimeout(overrideDefaultWithPersistedSelection,
            overrideDefaultsWithPersistedValuesTimeout);
    }

    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("lib.restore "+panel.name+" needRetry "+needRetry+" panel.selection: "+
            panel.selection+" panelState:", panelState);
};

this.restoreObjects = function(panel, panelState)
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
// Error Message

this.ErrorMessage = function(message, href, lineNo, source, category, context, trace, msgId)
{
    this.message = message;
    this.href = href;
    this.lineNo = lineNo;
    this.source = source;
    this.category = category;
    this.context = context;
    this.trace = trace;
    this.msgId = msgId;
};

this.ErrorMessage.prototype =
{
    getSourceLine: function()
    {
        return this.context.sourceCache.getLine(this.href, this.lineNo);
    },

    resetSource: function()
    {
        if (this.href && this.lineNo)
            this.source = this.getSourceLine();
    },

    correctWithStackTrace: function(trace)
    {
        var frame = trace.frames[0];
        if (frame)
        {
            this.href = frame.href;
            this.lineNo = frame.line;
            this.trace = trace;
        }
    },

    correctSourcePoint: function(sourceName, lineNumber)
    {
        this.href = sourceName;
        this.lineNo = lineNumber;
    },
};

// ************************************************************************************************

/**
 * @class Searches for text in a given node.
 *
 * @constructor
 * @param {Node} rootNode Node to search
 * @param {Function} rowFinder results filter. On find this method will be called
 *      with the node containing the matched text as the first parameter. This may
 *      be undefined to return the node as is.
 */
this.TextSearch = function(rootNode, rowFinder)
{
    var doc = rootNode.ownerDocument;
    var count, searchRange, startPt;

    /**
     * Find the first result in the node.
     *
     * @param {String} text Text to search for
     * @param {boolean} reverse true to perform a reverse search
     * @param {boolean} caseSensitive true to perform a case sensitive search
     */
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

    /**
     * Find the next search result
     *
     * @param {boolean} wrapAround true to wrap the search if the end of range is reached
     * @param {boolean} sameNode true to return multiple results from the same text node
     * @param {boolean} reverse true to search in reverse
     * @param {boolean} caseSensitive true to perform a case sensitive search
     */
    this.findNext = function(wrapAround, sameNode, reverse, caseSensitive)
    {
        startPt = undefined;

        if (sameNode && this.range)
        {
            startPt = this.range.cloneRange();
            if (reverse)
            {
                startPt.setEnd(startPt.startContainer, startPt.startOffset);
            }
            else
            {
                startPt.setStart(startPt.startContainer, startPt.startOffset+1);
            }
        }

        if (!startPt)
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
                    FBTrace.sysout("lib.TextSearch.findNext setStartAfter fails for nodeType:"+(this.currentNode?this.currentNode.nodeType:rootNode.nodeType),e);
                try {
                    FBTrace.sysout("setStart try\n");
                    startPt.setStart(curNode);
                    FBTrace.sysout("setStart success\n");
                } catch (exc) {
                    return;
                }
            }
        }

        var match = startPt && this.find(this.text, reverse, caseSensitive);
        if (!match && wrapAround)
        {
            this.reset();
            return this.find(this.text, reverse, caseSensitive);
        }

        return match;
    };

    /**
     * Resets the instance state to the initial state.
     */
    this.reset = function()
    {
        searchRange = doc.createRange();
        searchRange.selectNode(rootNode);

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

// ********************************************************************************************* //

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

this.SourceText = function(lines, owner)
{
    this.lines = lines;
    this.owner = owner;
};

this.SourceText.getLineAsHTML = function(lineNo)
{
    return escapeForSourceLine(this.lines[lineNo-1]);
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

    return null;
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
    "mozIndexedDB", //FF4.0

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
    "applicationCache",      // FF3
    "GetWeakReference", // Gecko
    "XPCSafeJSObjectWrapper", // Gecko
    "postMessage",
    "localStorage",  // FF3.5
    "showModalDialog", // FF 3.0, MS IE4

    "InstallTrigger",

    "getInterface",
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
    "readyState",

    "preferredStyleSheetSet",
    "lastStyleSheetSet",
    "styleSheetSets",
    "selectedStyleSheetSet",
    "enableStyleSheetsForSet",

    "elementFromPoint",
    "hasFocus",
    "activeElement",

    /* These are also in domMemberMap.Element, but it reflects the real interface definition */
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

    "onLoad",//FF4.0
    "hidden",//FF4.0
    "setCapture",//FF4.0
    "releaseCapture"//FF4.0
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

this.isDOMConstant = function(object, name)
{
    if (name == undefined)
    {
        return isDOMConstantDep({},object);
    }

    // The constant map has also its own prototype, but it isn't considered to be a constant.
    if (name == "__proto__")
        return false;

    if (!(object instanceof Window ||
        object instanceof Node ||
        object instanceof Location ||
        object instanceof Event ||
        object instanceof EventCopy))
        return false;

    return domConstantMap.hasOwnProperty(name);
}
var isDOMConstantDep = Deprecated.deprecated("isDOMConstant(name) signature changed (object,name)",
    this.isDOMConstant);

var domConstantMap = this.domConstantMap =
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

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

this.cssInfo = {};
this.cssInfo.html =
{
    "background": ["bgRepeat", "bgAttachment", "bgPosition", "color", "systemColor", "mozBackgroundImage", "none"],
    "background-attachment": ["bgAttachment"],
    "background-color": ["color", "systemColor"],
    "background-image": ["none", "mozBackgroundImage"],
    "background-position": ["bgPosition"],
    "background-repeat": ["bgRepeat"],
    "background-size": ["bgSize"],
    "background-clip": ["boxModels"], //FF4.0
    "background-origin": ["boxModels"], //FF4.0

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
    "border-radius": [], //FF4.0
    "border-top-left-radius": [], //FF4.0
    "border-top-right-radius": [], //FF4.0
    "border-bottom-right-radius": [], //FF4.0
    "border-bottom-left-radius": [], //FF4.0

    "box-shadow": [], //FF4.0

    "bottom": ["auto"],
    "caption-side": ["captionSide"],
    "clear": ["clear", "none"],
    "clip": ["auto"],
    "color": ["color", "systemColor"],
    "content": ["content", "none"],
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
    "ime-mode": ["imeMode", "auto"],
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
    "min-width": ["width", "none"],
    "max-width": ["width", "none"],

    "opacity": [],

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
    "resize": ["resize"],//FF4.0
    "right": ["auto"],
    "table-layout": ["tableLayout", "auto"],
    "text-align": ["textAlign"],
    "text-decoration": ["textDecoration", "none"],
    "text-indent": [],
    "text-rendering": ["textRendering", "auto"],
    "text-shadow": [],
    "text-transform": ["textTransform", "none"],
    "top": ["auto"],
    "unicode-bidi": [],
    "vertical-align": ["verticalAlign"],
    "visibility": ["visibility"],
    "white-space": ["whiteSpace"],
    "width": ["width", "auto"],
    "word-spacing": [],
    "word-wrap": ["wordWrap"],
    "z-index": [],

    "-moz-appearance": ["mozAppearance"],
    "-moz-border-image": ["mozBorderImage", "thickness", "none"],
    "-moz-border-radius": [],
    "-moz-border-radius-bottomleft": [],
    "-moz-border-radius-bottomright": [],
    "-moz-border-radius-topleft": [],
    "-moz-border-radius-topright": [],
    "-moz-border-top-colors": ["color", "systemColor"],
    "-moz-border-right-colors": ["color", "systemColor"],
    "-moz-border-bottom-colors": ["color", "systemColor"],
    "-moz-border-left-colors": ["color", "systemColor"],
    "-moz-border-start": ["borderStyle", "borderCollapse", "color", "systemColor", "none"],
    "-moz-border-end": ["borderStyle", "borderCollapse", "color", "systemColor", "none"],
    "-moz-border-start-color": ["color", "systemColor"],
    "-moz-border-end-color": ["color", "systemColor"],
    "-moz-border-start-style": ["borderStyle"],
    "-moz-border-end-style": ["borderStyle"],
    "-moz-border-start-width": ["thickness"],
    "-moz-border-end-width": ["thickness"],
    "-moz-box-align": ["mozBoxAlign"],
    "-moz-box-direction": ["mozBoxDirection"],
    "-moz-box-flex": [],
    "-moz-box-ordinal-group": [],
    "-moz-box-orient": ["mozBoxOrient"],
    "-moz-box-pack": ["mozBoxPack"],
    "-moz-box-shadow": ["mozBoxShadow", "none"],
    "-moz-box-sizing": ["mozBoxSizing"],
    "-moz-user-focus": ["userFocus", "none"],
    "-moz-user-input": ["userInput"],
    "-moz-user-modify": [],
    "-moz-user-select": ["userSelect", "none"],
    //"-moz-background-clip": [], //Removed/renamed in FF4.0
    "-moz-background-inline-policy": [],
    //"-moz-background-origin": [], //Removed/renamed in FF4.0
    "-moz-binding": [],
    "-moz-column-count": [],
    "-moz-column-gap": [],
    "-moz-column-rule": ["thickness", "borderStyle", "color", "systemColor"],
    "-moz-column-rule-width": ["thickness"],
    "-moz-column-rule-style": ["borderStyle"],
    "-moz-column-rule-color": ["color",  "systemColor"],
    "-moz-column-width": [],
    "-moz-image-region": [],
    "-moz-transform": ["mozTransformFunction", "none"],
    "-moz-transform-origin": ["bgPosition"],
    "-moz-font-feature-settings": ["normal"], //FF4.0
    "-moz-tab-size": [], //FF4.0,
    "-moz-transition": [], //FF4.0 TODO
    "-moz-transition-property": [], //FF4.0 TODO
    "-moz-transition-duration": [], //FF4.0 TODO
    "-moz-transition-timing-function": [], //FF4.0 TODO
    "-moz-transition-delay": [] //FF4.0 TODO

};

this.cssInfo.svg = {
    "alignment-baseline": ["svgAlignmentBaseline"],
    "baseline-shift": ["baselineShift"],
    "clip": ["auto"],
    "clip-path": ["none"],
    "clip-rule": ["clipRule"],
    "color": ["color"],
    "color-interpolation": ["colorInterpolation"],
    "color-interpolation-filters": ["colorInterpolation"],
    "color-profile": ["colorProfile"],
    "color-rendering": ["colorRendering"],
    "cursor": ["cursor"],
    "direction": ["direction"],
    "display": ["display"],
    "dominant-baseline": ["dominantBaseline"],
    "enable-background": ["accumulate"],
    "fill": ["clipRule"],
    "fill-opacity": [],
    "fill-rule": ["clipRule"],
    "filter": ["none"],
    "flood-color": ["currentColor"],
    "flood-opacity": [],
    "font": ["fontStyle","fontVariant","fontWeight"],
    "font-family": ["fontFamily"],
    "font-size": ["fontSize"],
    "font-size-adjust": [],
    "font-stretch": ["fontStretch"],
    "font-style": ["fontStyle"],
    "font-variant": ["fontVariant"],
    "font-weight": ["fontWeight"],
    "glyph-orientation-horizontal": [],
    "glyph-orientation-vertical": ["auto"],
    "image-rendering": ["imageRendering"],
    "kerning": ["auto"],
    "letter-spacing": ["normal"],
    "lighting-color": ["currentColor"],
    "marker": ["none"],
    "marker-end": ["none"],
    "mask": ["none"],
    "opacity": [],
    "overflow": ["auto","svgOverflow"],
    "pointer-events": ["pointerEvents","none"],
    "shape-rendering": ["auto","shapeRendering"],
    "stop-color": ["currentColor"],
    "stop-opacity": [],
    "stroke": [],
    "stroke-dasharray": ["none"],
    "stroke-dashoffset": [],
    "stroke-linecap": ["strokeLinecap"],
    "stroke-linejoin": ["strokeLinejoin"],
    "stroke-miterlimit": [],
    "stroke-opacity": [],
    "stroke-width": [],
    "text-anchor": ["mozBoxPack"],
    "text-decoration": ["none","textDecoration"],
    "text-rendering": ["none","textRendering"],
    "unicode-bidi": ["unicodeBidi"],
    "visibility": ["visibility"],
    "word-spacing": ["normal"],
    "writing-mode": ["writingMode"]
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
    "opacity": 1,
    "quotes": 1,
    "text-align": 1,
    "text-decoration": 1,
    "text-indent": 1,
    "text-shadow": 1,
    "text-transform": 1,
    "white-space": 1,
    "word-spacing": 1,
    "word-wrap": 1
};

this.cssKeywords =
{
    "mozAppearance":
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
        "window",
        "-moz-mac-unified-toolbar", //FF3.5
        "-moz-win-borderless-glass", //FF4.0
        "-moz-win-browsertabbar-toolbox", //FF3.0
        "-moz-win-communications-toolbox", //FF3.0
        "-moz-win-glass", //FF3.5
        "-moz-win-media-toolbox" //FF
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
        "-moz-nativehyperlinktext",
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
        "DarkGrey",
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
        "DarkSlateGrey",
        "DarkTurquoise",
        "DarkViolet",
        "DeepPink",
        "DeepSkyBlue",
        "DimGray",
        "DimGrey",
        "DodgerBlue",
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
        "Grey",
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
        "LightGray",
        "LightGreen",
        "LightGrey",
        "LightPink",
        "LightSalmon",
        "LightSeaGreen",
        "LightSkyBlue",
        "LightSlateGray",
        "LightSlateGrey",
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
        "SlateGrey",
        "Snow",
        "SpringGreen",
        "SteelBlue",
        "Tan",
        "Teal",
        "Thistle",
        "Tomato",
        "Turquoise",
        "Violet",
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

    "normal":
    [
        "normal"
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

    "boxModels": //FF4.0
    [
        "padding-box",
        "border-box",
        "content-box"
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

    "bgSize": // FF4.0
    [
        "auto",
        "cover",
        "contain"
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
        "inline-block",
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

    "visibility":
    [
        "visible",
        "hidden",
        "collapse",
        "inherit"
    ],

    "whiteSpace":
    [
        "normal",
        "pre",
        "nowrap",
        "pre-wrap",
        "pre-line",
        "inherit"
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
    ],

    "mozBoxShadow":
    [
        "inset"
    ],

    "mozBorderImage":
    [
        "stretch",
        "round",
        "repeat"
    ],

    "mozBackgroundImage":
    [
        "-moz-linear-gradient", // FF4.0
        "-moz-radial-gradient", // FF4.0
        "-moz-element", // FF4.0
        "-moz-image-rect" // FF4.0
    ],

    "mozTransformFunction":
    [
        "matrix",
        "rotate",
        "scale",
        "scaleX",
        "scaleY",
        "skew",
        "skewX",
        "skewY",
        "translate",
        "translateX",
        "translateY"
    ],

    "width":
    [
        "-moz-max-content",
        "-moz-min-content",
        "-moz-fit-content",
        "-moz-available"
    ],

    "imeMode":
    [
        "normal",
        "active",
        "inactive",
        "disabled"
    ],

    "textRendering":
    [
        "optimizeSpeed",
        "optimizeLegibility",
        "geometricPrecision"
    ],

    "wordWrap":
    [
        "normal",
        "break-word",
        "inherit"
    ],

    // start SVG specific

    "alignmentBaseline":
    [
        "auto",
        "baseline",
        "before-edge",
        "text-before-edge",
        "middle",
        "central",
        "after-edge",
        "text-after-edge",
        "ideographic",
        "alphabetic",
        "hanging",
        "mathematical"
    ],

    "baselineShift":
    [
        "baseline",
        "sub",
        "super"
    ],

    "colorInterpolation":
    [
        "auto",
        "sRGB",
        "linearRGB"
    ],

    "clipRule":
    [
        "nonzero",
        "evenodd"
    ],

    "colorProfile":
    [
        "auto",
        "sRGB"
    ],

    "colorRendering":
    [
        "auto",
        "optimizeSpeed",
        "optimizeQuality"
    ],

    "dominantBaseline":
    [
        "auto",
        "use-script",
        "no-change",
        "reset-size",
        "ideographic",
        "alphabetic",
        "hanging",
        "mathematical",
        "central",
        "middle",
        "text-after-edge",
        "text-before-edge"
    ],

    "accumulate":
    [
        "accumulate"
    ],

    "fontStretch":
    [
        "normal",
        "wider",
        "narrower",
        "ultra-condensed",
        "extra-condensed",
        "condensed",
        "semi-condensed",
        "semi-expanded",
        "expanded",
        "extra-expanded",
        "ultra-expanded"
    ],

    "imageRendering":
    [
        "auto",
        "optimizeSpeed",
        "optimizeQuality"
    ],

    "svgOverflow":
    [
        "visible",
        "hidden",
        "scroll"
    ],

    "pointerEvents":
    [
        "visiblePainted",
        "visibleFill",
        "visibleStroke",
        "visible",
        "painted",
        "fill",
        "stroke",
        "all"
    ],

    "shapeRendering":
    [
        "optimizeSpeed",
        "crispEdges",
        "geometricPrecision"
    ],

    "strokeLinecap":
    [
        "butt",
        "round",
        "square"
    ],

    "strokeLinejoin":
    [
        "miter",
        "round",
        "bevel"
    ],

    "writingMode":
    [
        "lr-tb",
        "rl-tb",
        "tb-rl",
        "lr",
        "rl",
        "tb"
    ],

    "resize":
    [
        "none",
        "both",
        "horizontal",
        "vertical",
        "inherit"
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

this.selfClosingTags =
{ // End tags for void elements are forbidden http://wiki.whatwg.org/wiki/HTML_vs._XHTML
    "meta": 1,
    "link": 1,
    "area": 1,
    "base": 1,
    "col": 1,
    "input": 1,
    "img": 1,
    "br": 1,
    "hr": 1,
    "param":1,
    "embed":1
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

// ************************************************************************************************
// Debug Logging

function ERROR(exc)
{
    if (typeof(FBTrace) !== undefined)
    {
        if (exc.stack) exc.stack = exc.stack.split('\n');
        FBTrace.sysout("lib.ERROR: "+exc, exc);
    }

        ddd("FIREBUG WARNING: " + exc);
}

this.ERROR = ERROR;

function ddd(text)
{
    var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci["nsIConsoleService"]);
    if (consoleService)
        consoleService.logStringMessage(text + "");
}

// ************************************************************************************************
// Math Utils

this.formatNumber = function(number)
{
    number += "";
    var x = number.split(".");
    var x1 = x[0];
    var x2 = x.length > 1 ? "." + x[1] : "";
    var rgx = /(\d+)(\d{3})/;
    while (rgx.test(x1))
        x1 = x1.replace(rgx, "$1" + "," + "$2");
    return x1 + x2;
}

// ************************************************************************************************
// File Size Utils

this.formatSize = function(bytes)
{
    var negative = (bytes < 0);
    bytes = Math.abs(bytes);

    // xxxHonza, XXXjjb: Why Firebug.sizePrecision is not set in Chromebug?
    var sizePrecision = Options.get("sizePrecision");
    if (typeof(sizePrecision) == "undefined")
    {
        Options.set("sizePrecision", 2);
        sizePrecision = 2;
    }

    // Get size precision (number of decimal places from the preferences)
    // and make sure it's within limits.
    sizePrecision = (sizePrecision > 2) ? 2 : sizePrecision;
    sizePrecision = (sizePrecision < -1) ? -1 : sizePrecision;

    var result;

    if (sizePrecision == -1)
        result = bytes + " B";

    var a = Math.pow(10, sizePrecision);

    if (bytes == -1 || bytes == undefined)
        return "?";
    else if (bytes == 0)
        return "0";
    else if (bytes < 1024)
        result = bytes + " B";
    else if (bytes < (1024*1024))
        result = Math.round((bytes/1024)*a)/a + " KB";
    else
        result = Math.round((bytes/(1024*1024))*a)/a + " MB";

    return negative ? "-" + result : result;
}

// ************************************************************************************************
// Time Utils

this.formatTime = function(elapsed)
{
    if (elapsed == -1)
        return "";
    else if (elapsed == 0)
        return "0";
    else if (elapsed < 1000)
        return elapsed + "ms";
    else if (elapsed < 60000)
        return (Math.round(elapsed/10) / 100) + "s";
    else
    {
        var min = Math.floor(elapsed/60000);
        var sec = (elapsed % 60000);
        return min + "m " + (Math.round((elapsed/1000)%60)) + "s";
    }
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

/**
 * @class Implements a RegExp-like object that will search for the literal value
 * of a given string, rather than the regular expression. This allows for
 * iterative literal searches without having to escape user input strings
 * to prevent invalid regular expressions from being used.
 *
 * @constructor
 * @param {String} literal Text to search for
 * @param {Boolean} reverse Truthy to preform a reverse search, falsy to perform a forward seach
 * @param {Boolean} caseSensitive Truthy to perform a case sensitive search, falsy to perform a case insensitive search.
 */
this.LiteralRegExp = function(literal, reverse, caseSensitive)
{
    var searchToken = (!caseSensitive) ? literal.toLowerCase() : literal;

    this.__defineGetter__("global", function() { return true; });
    this.__defineGetter__("multiline", function() { return true; });
    this.__defineGetter__("reverse", function() { return reverse; });
    this.__defineGetter__("ignoreCase", function() { return !caseSensitive; });
    this.lastIndex = 0;

    this.exec = function(text)
    {
        if (!text)
            return null;

        var searchText = (!caseSensitive) ? text.toLowerCase() : text,
            startIndex = (reverse ? text.length-1 : 0) + this.lastIndex,
            index;

        if (0 <= startIndex && startIndex < text.length)
            index = searchText[reverse ? "lastIndexOf" : "indexOf"](searchToken, startIndex);
        else
            index = -1;

        if (index >= 0)
        {
            var ret = [ text.substr(index, searchToken.length) ];
            ret.index = index;
            ret.input = text;
            this.lastIndex = index + (reverse ? -1*text.length : searchToken.length);
            return ret;
        }
        else
            this.lastIndex = 0;

        return null;
    };
    this.test = function(text)
    {
        if (!text)
            return false;

        var searchText = (!caseSensitive) ? text.toLowerCase() : text;
        return searchText.indexOf(searchToken) >= 0;
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
            try
            {
                if (Options.get("searchUseRegularExpression"))
                    re[key] = new RegExp(expression(regex, reverse), flag(flags, caseSensitive));
                else
                    re[key] = new FBL.LiteralRegExp(regex, reverse, caseSensitive);
            }
            catch (ex)
            {
                // The user likely entered an invalid regular expression or is in the
                // process of entering a valid one. Treat this as a plain text search
                re[key] = new FBL.LiteralRegExp(regex, reverse, caseSensitive);
            }
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

        var curRe = re[key];
        curRe.lastIndex = 0;
        var ret = curRe.exec(searchText);
        if (ret) {
            ret.input = text;
            ret.index = ret.index + indexOffset;
            ret.reverse = reverse;
            ret.caseSensitive = caseSensitive;
        }
        return ret;
    };
};

// ************************************************************************************************
// URLs

/**
 * Converts resource: to file: URL.
 * @param {String} resourceURL
 */
this.resourceToFile = function(resourceURL)
{
    var resHandler = ioService.getProtocolHandler("resource")
        .QueryInterface(Ci.nsIResProtocolHandler);

    var justURL = resourceURL.split("resource://")[1];
    var splitted = justURL.split("/");
    var sub = splitted.shift();

    var path = resHandler.getSubstitution(sub).spec;
    return path + splitted.join("/");
}

// ************************************************************************************************
// Firebug Version Comparator

/**
 * Compare expected Firebug version with the current Firebug installed.
 * @param {Object} expectedVersion Expected version of Firebug.
 * @returns
 * -1 the current version is smaller
 *  0 the current version is the same
 *  1 the current version is bigger
 *
 * @example:
 * if (compareFirebugVersion("1.6") >= 0)
 * {
 *     // The current version is Firebug 1.6+
 * }
 */
this.checkFirebugVersion = function(expectedVersion)
{
    if (!expectedVersion)
        return 1;

    var version = Firebug.getVersion();

    // Adapt to Firefox version scheme.
    expectedVersion = expectedVersion.replace('X', '', "g");
    version = version.replace('X', '', "g");

    // Use Firefox comparator service.
    return versionChecker.compare(version, expectedVersion);
}

// ************************************************************************************************
}).apply(FBL);
}
catch(e)
{
    dump("FBL Fails "+e+"\n");

    for (var p in e)
        dump("FBL exception["+p+"]="+e[p]+"\n");

    dump("If the service @joehewitt.com/firebug;1 fails, try deleting compreg.dat, xpti.dat\n");
    dump("Another cause can be mangled install.rdf.\n");
}

// ********************************************************************************************* //
// Registration

return FBL;

// ********************************************************************************************* //
});
