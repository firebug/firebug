define("ToolsInterface", ["inProcess/browser.js", "inProcess/compilationunit.js"], function(Browser, CompilationUnit) {

var ToolsInterface = new Browser();

ToolsInterface.CompilationUnit = CompilationUnit;

return ToolsInterface;


});