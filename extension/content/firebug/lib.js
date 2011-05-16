/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
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
function(OBJECT, XPCOM, Locale, Events, Options, Deprecated, Wrapper, URL, SourceLink,
    StackFrame, CSS, DOM, HTTP, WIN, Search, XPATH, STR, XML, Persist, ARR, System, JSONLib,
    Menu, ToggleBranch, Debug, Keywords) {

// ********************************************************************************************* //

var FBL = window.FBL || {};  // legacy.js adds top.FBL, FIXME, remove after iframe version


// ********************************************************************************************* //
// xxxHonza: all deprecated API should be removed from 1.9+
// All properties and methods of FBL namespace are deprecated.

// Backward compatibility with extensions
// deprecated
for (var p in OBJECT)
    FBL[p] = OBJECT[p];

for (var p in XPCOM)
    FBL[p] = XPCOM[p];

for (var p in Locale)
    FBL[p] = Locale[p];

for (var p in Events)
    FBL[p] = Events[p];

for (var p in Wrapper)
    FBL[p] = Wrapper[p];

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

for (var p in ToggleBranch)
    FBL[p] = ToggleBranch[p];

for (var p in Debug)
    FBL[p] = Debug[p];

for (var p in Keywords)
    FBL[p] = Keywords[p];

//xxxHonza: also iterate over all props.
FBL.deprecated = Deprecated.deprecated;
FBL.SourceLink = SourceLink.SourceLink;
FBL.ToggleBranch = Menu.ToggleBranch;

//FBL.ErrorCopy = FirebugReps.ErrorCopy;
//FBL.ErrorMessageObj = FirebugReps.ErrorMessageObj;
//FBL.EventCopy = DOM.EventCopy;
//FBL.PropertyObj = FirebugReps.PropertyObj;

//FBL.NetFileLink = Firebug.NetMonitor.NetFileLink;

// deprecated
FBL.$ = function(id, doc)
{
    if (doc)
        return doc.getElementById(id);
    else
        return document.getElementById(id);
};

// deprecated
FBL.jsd = Components.classes["@mozilla.org/js/jsd/debugger-service;1"].
    getService(Components.interfaces.jsdIDebuggerService);

// ********************************************************************************************* //
// Constants

Components.utils["import"]("resource://gre/modules/PluralForm.jsm");
Components.utils["import"]("resource://firebug/firebug-service.js");

// deprecated
FBL.fbs = fbs; // left over from component.

// deprecated
FBL.reUpperCase = /[A-Z]/;

// ********************************************************************************************* //
// Registration

return FBL;

// ********************************************************************************************* //
});
