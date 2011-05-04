/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

define(["arch/tools"], function initializeJavaScriptTool(ToolsInterface)
{

// ************************************************************************************************
// Attach the BrowserToolsInterface to our JavaScript Tool

ToolsInterface.JavaScript = {};

/*
 * A Turn is an callstack for an active being-handled event, similar to a Thread.
 * Currently it only makes sense when we have stopped the server.
 * Currently only one or zero Turn objects can exist ("single-threaded").
 */
ToolsInterface.JavaScript.Turn =
{
}

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
    return Firebug.Debugger.fbs.isBreakpointDisabled(url, lineNumber);
};

ToolsInterface.JavaScript.getBreakpointCondition = function(context, url, lineNumber)
{
    return Firebug.Debugger.fbs.getBreakpointCondition(url, lineNumber);
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

// ********************************************************************************************* //
// Events

ToolsInterface.browser.addListener(ToolsInterface.JavaScript);  // This is how we get events

/*
 * A previously enabled tool becomes active and sends us an event.
 */
ToolsInterface.JavaScript.onActivateTool = function(toolname, active)
{
    if (FBTrace.DBG_ACTIVATION)
        FBTrace.sysout("ToolsInterface.JavaScript.onActivateTool "+toolname+" = "+active);

    if (toolname === 'script')
    {
        Firebug.ScriptPanel.prototype.onJavaScriptDebugging(active);
        ToolsInterface.browser.eachContext(function refresh(context)
        {
            context.invalidatePanels('script');
        });
    }

    // This work should be done somewhere more generic that .JavaScript, maybe ToolManager
    // listening to browser.
    var tool = ToolsInterface.browser.getTool(toolname);
    if (tool)
        tool.setActive(active);
},

/*
 * @param context context of the newest frame, where the breakpoint hit
 * @param frame newest StackFrame (crossbrowser) eg where the break point hit
 */
ToolsInterface.JavaScript.onStartDebugging = function(context, frame)
{
    Firebug.selectContext(context);
    var panel = Firebug.chrome.selectPanel("script");
    if (!panel)
    {
        // Bail out if there is no UI
        ToolsInterface.JavaScript.resumeJavaScript(context);
        return;
    }

    if (FBTrace.DBG_STACK)
        FBTrace.sysout("javascripttool currentFrame ", frame);
    ToolsInterface.JavaScript.Turn.currentFrame = frame;
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
    delete ToolsInterface.JavaScript.Turn.currentFrame;
}

ToolsInterface.JavaScript.onCompilationUnit = function(context, url, kind)
{
     var compilationUnit = new ToolsInterface.CompilationUnit(url, context);

     compilationUnit.kind = kind;

     context.compilationUnits[url] = compilationUnit;

     if (FBTrace.DBG_COMPILATION_UNITS)
         FBTrace.sysout("ToolsInterface.JavaScript.onCompilationUnit "+url+" added to "+context.getName(), compilationUnit);
}

return exports = {};

});