define("ToolsInterface", ["firebugModules/inProcess/browser.js", "firebugModules/inProcess/compilationunit.js"], function(Browser, CompilationUnit) {

Browser.onDebug = function()
{
    FBTrace.sysout.apply(FBTrace, arguments);
}

var ToolsInterface = {}

// Classes
ToolsInterface.Browser = Browser;
ToolsInterface.CompilationUnit = CompilationUnit;

// Create a connection object
ToolsInterface.browser = new Browser();


// FIXME eventually we want the dependency system to pass around the ToolsInterface
Firebug.ToolsInterface = ToolsInterface;

return ToolsInterface;

});