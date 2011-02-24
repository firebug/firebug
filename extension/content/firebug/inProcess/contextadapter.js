/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

define([ "firebugModules/tabContext.js"], function initializeContextAdapter()
{

// ************************************************************************************************
// Attach the BrowserToolsInterface to our TabContext

Firebug.TabContext.prototype.resumeJavaScript = function()
{
    Firebug.Debugger.resume(this);
};

Firebug.TabContext.prototype.stepOver = function()
{
    Firebug.Debugger.stepOver(this);
};

Firebug.TabContext.prototype.stepInto = function()
{
    Firebug.Debugger.stepInto(this);
};

Firebug.TabContext.prototype.stepOut = function()
{
    Firebug.Debugger.stepOut(this);
};

Firebug.TabContext.prototype.runUntil = function(compilationUnit, lineNo)
{
    Firebug.Debugger.runUntil(this, compilationUnit, lineNo, Firebug.Debugger);
};

Firebug.TabContext.prototype.breakOnNextJavaScriptStatement = function(enable)
{
    if (enable)
        Firebug.Debugger.suspend(this);
    else
        Firebug.Debugger.unSuspend(this);
}

Firebug.TabContext.prototype.setBreakpoint = function(url, lineNumber)
{
    // TODO we should be sending urls over not compilation units
    var compilationUnit = this.getCompilationUnit(url);
    Firebug.Debugger.setBreakpoint(compilationUnit, lineNo);
};

Firebug.TabContext.prototype.clearBreakpoint = function(url, lineNumber)
{
    // This is more correct, but still the context is not used.
    Firebug.Debugger.fbs.clearBreakpoint(url, lineNo);
};

Firebug.TabContext.prototype.enableBreakpoint = function(url, lineNumber)
{
    Firebug.Debugger.fbs.enableBreakpoint(url, lineNo);
};

Firebug.TabContext.prototype.disableBreakpoint = function(url, lineNumber)
{
    Firebug.Debugger.fbs.disableBreakpoint(url, lineNo);
};

Firebug.TabContext.prototype.isBreakpointDisabled = function(url, lineNumber)
{
    Firebug.Debugger.fbs.isBreakpointDisabled(url, lineNumber);
};



return exports = {};

});