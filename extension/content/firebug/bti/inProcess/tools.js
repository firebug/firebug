/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/options",
    "arch/browser",
    "arch/compilationunit",
    "arch/javascripttool",
    "firebug/tabWatcher",
],
function(Firebug, Options, Browser, CompilationUnit, JavaScriptTool, TabWatcher) {

// ********************************************************************************************* //

Browser.onDebug = function()
{
    FBTrace.sysout.apply(FBTrace, arguments);
}

// All of this code needs to be called on initialize() not define()

// Classes



//Create a connection object
Firebug.connection = new Browser();

// ********************************************************************************************* //

Firebug.connection.connect();

// TODO disconnect

//********************************************************************************************* //

return {};

// ********************************************************************************************* //
});
