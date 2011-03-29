define(["arch/browser", "arch/compilationunit"], function(Browser, CompilationUnit) {

Browser.onDebug = function()
{
    FBTrace.sysout.apply(FBTrace, arguments);
}

var ToolsInterface = {};

// Classes
ToolsInterface.Browser = Browser;
ToolsInterface.CompilationUnit = CompilationUnit;

// Create a connection object
ToolsInterface.browser = new Browser();

ToolsInterface.browser.addListener(Firebug)

// FIXME eventually we want the dependency system to pass around the ToolsInterface
Firebug.ToolsInterface = ToolsInterface;
FBTrace.sysout(" tools.js has ToolsInterface "+ToolsInterface, ToolsInterface);
return ToolsInterface;

});