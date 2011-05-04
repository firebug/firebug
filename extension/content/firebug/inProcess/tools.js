/* See license.txt for terms of usage */

define(["arch/browser", "arch/compilationunit", "firebug/lib/options"], function(Browser, CompilationUnit) {

// ********************************************************************************************* //

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
ToolsInterface.browser.addListener(Firebug);

// Listen for preference changes. This way options module is not dependent on tools
// xxxHonza: can this be in Browser interface?
Firebug.Options.addListener(
{
    updateOption: function(name, value)
    {
        ToolsInterface.browser.dispatch("updateOption", [name, value]);
    }
});

// FIXME eventually we want the dependency system to pass around the ToolsInterface
Firebug.ToolsInterface = ToolsInterface;

FBTrace.sysout("tools.js has ToolsInterface "+ToolsInterface, ToolsInterface);

// ********************************************************************************************* //

return ToolsInterface;

// ********************************************************************************************* //
});
