/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

define([ "ToolsInterface"], function initializeJavaScriptTool(ToolsInterface)
{

// ************************************************************************************************
// Attach the BrowserToolsInterface to our JavaScript Tool

ToolsInterface.JavaScript = {};

ToolsInterface.JavaScript.breakOnNext = function(context, enable)
{
    if (enable)
        Firebug.Debugger.suspend(context);
    else
        Firebug.Debugger.unSuspend(context);
}

ToolsInterface.JavaScript.setBreakpoint = function(context, url, lineNumber)
{
    // TODO we should be sending urls over not compilation units
    var compilationUnit = context.getCompilationUnit(url);
    Firebug.Debugger.setBreakpoint(compilationUnit, lineNumber);
};

ToolsInterface.JavaScript.clearBreakpoint = function(context, url, lineNumber)
{
    // This is more correct, but bypasses Debugger
    Firebug.Debugger.fbs.clearBreakpoint(url, lineNumber);
};

ToolsInterface.JavaScript.enableBreakpoint = function(context, url, lineNumber)
{
    Firebug.Debugger.fbs.enableBreakpoint(url, lineNumber);
};

ToolsInterface.JavaScript.disableBreakpoint = function(context, url, lineNumber)
{
    Firebug.Debugger.fbs.disableBreakpoint(url, lineNumber);
};

ToolsInterface.JavaScript.isBreakpointDisabled = function(context, url, lineNumber)
{
    Firebug.Debugger.fbs.isBreakpointDisabled(url, lineNumber);
};

// These functions should be on stack instead

ToolsInterface.JavaScript.resumeJavaScript = function(context)
{
    Firebug.Debugger.resume(context);
};

ToolsInterface.JavaScript.stepOver = function(context)
{
    Firebug.Debugger.stepOver(context);
};

ToolsInterface.JavaScript.stepInto = function(context)
{
    Firebug.Debugger.stepInto(context);
};

ToolsInterface.JavaScript.stepOut = function(context)
{
    Firebug.Debugger.stepOut(context);
};

ToolsInterface.JavaScript.runUntil = function(compilationUnit, lineNumber)
{
    Firebug.Debugger.runUntil(compilationUnit.getBrowserContext(), compilationUnit, lineNumber, Firebug.Debugger);
};

// Events

ToolsInterface.browser.addListener(ToolsInterface.JavaScript);  // This is how we get events



ToolsInterface.JavaScript.onStartDebugging = function(context, frame)
{
    Firebug.selectContext(context);
    var panel = Firebug.chrome.selectPanel("script");
    panel.onStartDebugging(frame);
}

ToolsInterface.JavaScript.onStopDebugging = function(context)
{
    var panel = context.getPanel("script", true);
    if (panel && panel === Firebug.chrome.getSelectedPanel())  // then we are looking at the script panel
        panel.showNoStackFrame(); // unhighlight and remove toolbar-status line

    if (panel)
    {
        panel.onStopDebugging();
    }
}



return exports = {};

});