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
],
function(XPCOM, Locale, Events, Options, Deprecated, Wrapper, URL, SourceLink, StackFrame,
    CSS, DOM, HTTP, WIN, Search, XPATH, STR, XML, Persist, ARR, System, JSONLib, Menu,
    ToggleBranch) {

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

//xxxHonza: also iterate over all props.
FBL.deprecated = Deprecated.deprecated;
FBL.SourceLink = SourceLink.SourceLink;
FBL.ToggleBranch = Menu.ToggleBranch;

// ********************************************************************************************* //

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

this.$ = function(id, doc)
{
    if (doc)
        return doc.getElementById(id);
    else
        return document.getElementById(id);
};

// ************************************************************************************************
// JavaScript Parsing

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

//************************************************************************************************
// Debug Logging

this.ERROR = function(exc)
{
    if (typeof(FBTrace) !== undefined)
    {
        if (exc.stack) exc.stack = exc.stack.split('\n');
        FBTrace.sysout("lib.ERROR: "+exc, exc);
    }

    var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci["nsIConsoleService"]);
    if (consoleService)
        consoleService.logStringMessage("FIREBUG WARNING: " + exc);
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
