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
    "firebug/persist",
    "firebug/lib/array",
    "firebug/firefox/system",
    "firebug/lib/json",
    "firebug/firefox/menu",
    "firebug/toggleBranch",
    "firebug/lib/debug",
    "firebug/lib/keywords",
],
function(XPCOM, Locale, Events, Options, Deprecated, Wrapper, URL, SourceLink, StackFrame,
    CSS, DOM, HTTP, WIN, Search, XPATH, STR, XML, Persist, ARR, System, JSONLib, Menu,
    ToggleBranch, Debug, Keywords) {

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

for (var p in Persist)
    FBL[p] = Persist[p];

for (var p in ARR)
    FBL[p] = ARR[p];

for (var p in System)
    FBL[p] = System[p];

for (var p in JSONLib)
    FBL[p] = JSONLib[p];

for (var p in Menu)
    FBL[p] = Menu[p];

for (var p in Debug)
    FBL[p] = Debug[p];

for (var p in Keywords)
    FBL[p] = Keywords[p];

//xxxHonza: also iterate over all props.
FBL.deprecated = Deprecated.deprecated;
FBL.SourceLink = SourceLink.SourceLink;
FBL.ToggleBranch = Menu.ToggleBranch;

(function() {  // fill 'this' with functions, then apply(FBL)

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Modules

try
{
    Components.utils["import"]("resource://gre/modules/PluralForm.jsm");
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
   var args = ARR.cloneArray(arguments), fn = args.shift(), object = args.shift();
   return function bind() { return fn.apply(object, ARR.arrayInsert(ARR.cloneArray(args), 0, arguments)); }
};

this.bindFixed = function() // fn, thisObject, args => thisObject.fn(args);
{
    var args = ARR.cloneArray(arguments), fn = args.shift(), object = args.shift();
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


this.getUniqueId = function()
{
    return this.getRandomInt(0,65536);
}

this.getRandomInt = function(min, max)
{
    return Math.floor(Math.random() * (max - min + 1) + min);
}

// Cross Window instanceof; type is local to this window
this.XW_instanceof = function(obj, type)
{
    if (obj instanceof type)
        return true;  // within-window test

    if (!type)
        return false;

    if (!obj)
        return (type == "undefined");

    // compare strings: obj constructor.name to type.name.
    // This is not perfect, we should compare type.prototype to object.__proto__,
    // but mostly code does not change the constructor object.
    do
    {
        // then the function that constructed us is the argument
        if (obj.constructor && obj.constructor.name == type.name)
            return true;
    }
    while(obj = obj.__proto__);  // walk the prototype chain.

    return false;

    // https://developer.mozilla.org/en/Core_JavaScript_1.5_Guide/Property_Inheritance_Revisited
    // /Determining_Instance_Relationships
}

this.$ = function(id, doc)
{
    if (doc)
        return doc.getElementById(id);
    else
        return document.getElementById(id);
};

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
