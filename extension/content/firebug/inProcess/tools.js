/* See license.txt for terms of usage */

define([
    "firebug/ToolsInterface",
    "firebug/firebug",
    "firebug/lib/options",
    "arch/browser",
    "arch/compilationunit"
],
function(ToolsInterface, Firebug, Options, Browser, CompilationUnit) {

// ********************************************************************************************* //

Browser.onDebug = function()
{
    FBTrace.sysout.apply(FBTrace, arguments);
}

// Classes
ToolsInterface.Browser = Browser;
ToolsInterface.CompilationUnit = CompilationUnit;

// Create a connection object
var browser = new Browser();
Object.defineProperty(ToolsInterface, 'browser', {value: new Browser(), writable: false, enumerable: true});
ToolsInterface.browser.addListener(Firebug);

// Listen for preference changes. This way options module is not dependent on tools
// xxxHonza: can this be in Browser interface?
Options.addListener(
{
    updateOption: function(name, value)
    {
        ToolsInterface.browser.dispatch("updateOption", [name, value]);
    }
});

FBTrace.sysout("tools.js has ToolsInterface "+ToolsInterface, ToolsInterface);

// ********************************************************************************************* //

return ToolsInterface;

// ********************************************************************************************* //
});
