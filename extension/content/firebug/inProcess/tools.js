/* See license.txt for terms of usage */

define([
    "firebug/ToolsInterface",
    "firebug/firebug",
    "firebug/lib/options",
    "arch/browser",
    "arch/compilationunit",
    "firebug/tabWatcher",
],
function(ToolsInterface, Firebug, Options, Browser, CompilationUnit, TabWatcher) {

// ********************************************************************************************* //

Browser.onDebug = function()
{
    FBTrace.sysout.apply(FBTrace, arguments);
}

// All of this code needs to be called on initialize() not define()

// Classes
ToolsInterface.Browser = Browser;
ToolsInterface.CompilationUnit = CompilationUnit;



//Create a connection object
var browser = new Browser();
Object.defineProperty(ToolsInterface, 'browser', {value: new Browser(), writable: false, enumerable: true});


FBTrace.sysout("tools.js has ToolsInterface "+ToolsInterface, ToolsInterface);

// ********************************************************************************************* //

ToolsInterface.JavaScript.initialize();

//********************************************************************************************* //

return ToolsInterface;

// ********************************************************************************************* //
});
