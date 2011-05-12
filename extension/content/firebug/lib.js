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
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/http/httpLib",
    "firebug/firefox/window",
    "firebug/lib/search",
    "firebug/lib/xpath",
    "firebug/lib/string",
    "firebug/lib/xml",
],
function(XPCOM, Locale, Events, Options, Deprecated, Wrapper, URL, SourceLink, StackFrame,
    CSS, DOM, HTTP, WIN, Search, XPATH, STR, XML) {

// ********************************************************************************************* //

var FBL = window.FBL || {};  // legacy.js adds top.FBL, FIXME, remove after iframe version

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

for (var p in CSS)
    FBL[p] = CSS[p];

for (var p in DOM)
    FBL[p] = DOM[p];

for (var p in HTTP)
    FBL[p] = HTTP[p];

for (var p in WIN)
    FBL[p] = WIN[p];

for (var p in Search)
    FBL[p] = Search[p];

for (var p in XPATH)
    FBL[p] = XPATH[p];

for (var p in STR)
    FBL[p] = STR[p];

for (var p in XML)
    FBL[p] = XML[p];

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

const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
const versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

// Globals
this.reDataURL = /data:text\/javascript;fileName=([^;]*);baseLineNumber=(\d*?),((?:.*?%0A)|(?:.*))/g;
this.reJavascript = /\s*javascript:\s*(.*)/;
this.reChrome = /chrome:\/\/([^\/]*)\//;
this.reCSS = /\.css$/;
this.reFile = /file:\/\/([^\/]*)\//;
this.reUpperCase = /[A-Z]/;

const overrideDefaultsWithPersistedValuesTimeout = 500;

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

this.hasProperties = function(ob)
{
    try
    {
        var obString = STR.safeToString(ob);
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
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.hasProperties("+STR.safeToString(ob)+") ERROR "+exc, exc);

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
    if (XML.isElementXUL(elt))
    {
        //FBTrace.sysout("isVisible elt.offsetWidth: "+elt.offsetWidth+" offsetHeight:"+ elt.offsetHeight+" localName:"+ elt.localName+" nameSpace:"+elt.nameSpaceURI+"\n");
        return (!elt.hidden && !elt.collapsed);
    }

    try
    {
        return elt.offsetWidth > 0 ||
            elt.offsetHeight > 0 ||
            elt.localName in CSS.invisibleTags ||
            XML.isElementSVG(elt) ||
            XML.isElementMathML(elt);
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
// DOM queries

this.$ = function(id, doc)
{
    if (doc)
        return doc.getElementById(id);
    else
        return document.getElementById(id);
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
        CSS.setClass(element, item.className);

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
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("getSourceLineForScript FAILS no scriptAnalyser for sourceFile "+sourceFile);
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
// JavaScript Parsing

const reWord = /([A-Za-z_$][A-Za-z_$0-9]*)(\.([A-Za-z_$][A-Za-z_$0-9]*))*/;

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

this.getResource = function(aURL)
{
    try
    {
        var channel=ioService.newChannel(aURL,null,null);
        var input=channel.open();
        return HTTP.readFromStream(input);
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
    return STR.escapeForSourceLine(this.lines[lineNo-1]);
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

//************************************************************************************************

this.fatalError = function(summary, exc)
{
    if (typeof(FBTrace) !== undefined)
        FBTrace.sysout.apply(FBTrace, arguments);

    Components.utils.reportError(summary);

    throw exc;
}

//************************************************************************************************
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
