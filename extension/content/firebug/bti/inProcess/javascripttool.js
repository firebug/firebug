/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module

define([
    "firebug/chrome/module",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/tool",
    "firebug/debugger/debugger",  // TODO firefox/jsdebugger
    "arch/compilationunit"
],
function initializeJavaScriptTool(Module, Obj, Firebug, Tool, JSDebugger, CompilationUnit) {

// ********************************************************************************************* //
// Implement JavaScript tool for Firefox inProcess

var JavaScriptTool = Obj.extend(Module,
{
    dispatchName: "JavaScriptTool",
});

/**
 * A Turn is an call stack for an active being-handled event, similar to a thread.
 * Currently it only makes sense, when we have stopped the server.
 * Currently only one or zero Turn objects can exist ("single-threaded").
 */
JavaScriptTool.Turn =
{
};

JavaScriptTool.breakOnNext = function(context, enable)
{
    if (enable)
        JSDebugger.suspend(context);
    else
        JSDebugger.unSuspend(context);
};

JavaScriptTool.setBreakpoint = function(context, url, lineNumber)
{
    // TODO we should be sending URLs over, not compilation units
    var compilationUnit = context.getCompilationUnit(url);
    JSDebugger.setBreakpoint(compilationUnit, lineNumber);
};

JavaScriptTool.clearBreakpoint = function(context, url, lineNumber)
{
    // This is more correct, but bypasses Debugger
    JSDebugger.fbs.clearBreakpoint(url, lineNumber);
};

JavaScriptTool.enableBreakpoint = function(context, url, lineNumber)
{
    JSDebugger.fbs.enableBreakpoint(url, lineNumber);
};

JavaScriptTool.disableBreakpoint = function(context, url, lineNumber)
{
    JSDebugger.fbs.disableBreakpoint(url, lineNumber);
};

JavaScriptTool.isBreakpointDisabled = function(context, url, lineNumber)
{
    return JSDebugger.fbs.isBreakpointDisabled(url, lineNumber);
};

JavaScriptTool.getBreakpointCondition = function(context, url, lineNumber)
{
    return JSDebugger.fbs.getBreakpointCondition(url, lineNumber);
};

// ********************************************************************************************* //
// These functions should be on the stack instead.

JavaScriptTool.rerun = function(context)
{
    JSDebugger.rerun(context);
};

JavaScriptTool.resumeJavaScript = function(context)
{
  JSDebugger.resume(context);
};

JavaScriptTool.stepOver = function(context)
{
    JSDebugger.stepOver(context);
};

JavaScriptTool.stepInto = function(context)
{
    JSDebugger.stepInto(context);
};

JavaScriptTool.stepOut = function(context)
{
    JSDebugger.stepOut(context);
};

JavaScriptTool.runUntil = function(compilationUnit, lineNumber)
{
    JSDebugger.runUntil(compilationUnit.getBrowserContext(), compilationUnit,
        lineNumber, JSDebugger);
};

/**
 * Browser connection
 */
JavaScriptTool.onConnect = function(connection)
{
    if (!Firebug.connection.getTool("script"))
    {
        // this is the script tool
        JavaScriptTool.asTool = new Tool("script"),
        connection.registerTool(JavaScriptTool.asTool);
    }
    else
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("JavaScriptTool onConnect ERROR script tool already registered");
    }
};

JavaScriptTool.onDisconnect = function(connection)
{
    if (JavaScriptTool.asTool)
        connection.unregisterTool(JavaScriptTool.asTool);
};

/**
 * Command the backend to enable JS
 */
JavaScriptTool.setActivation = function(enable)
{
    if (FBTrace.DBG_CONSOLE || FBTrace.DBG_ACTIVATION)
        FBTrace.sysout("ScriptPanel.onActivationChanged; " + enable);

    if (enable)
        JSDebugger.addObserver(this);
    else
        JSDebugger.removeObserver(this);
};

/**
 * A previously enabled tool becomes active and sends us an event.
 */
JavaScriptTool.onActivateTool = function(toolname, active)
{
    if (FBTrace.DBG_ACTIVATION)
    {
        FBTrace.sysout("JavaScriptTool.onActivateTool "+toolname+" = "+active+" asTool "+
            JavaScriptTool.asTool);
    }

    if (toolname === "script")
    {
        Firebug.ScriptPanel.prototype.onJavaScriptDebugging(active);
        Firebug.connection.eachContext(function refresh(context)
        {
            context.invalidatePanels('script');
        });

        if (JavaScriptTool.asTool)
            JavaScriptTool.asTool.setActive(active);

        Firebug.connection.dispatch("onDebuggerEnabled", [active]);
    }
},

/**
 * @param context context of the newest frame, where the breakpoint hit
 * @param frame newest StackFrame (crossbrowser) eg where the break point hit
 */
JavaScriptTool.onStartDebugging = function(context, frame)
{
    Firebug.selectContext(context);
    var panel = Firebug.chrome.selectPanel("script");
    if (!panel)
    {
        // Bail out if there is no UI
        JavaScriptTool.resumeJavaScript(context);
        return;
    }

    if (FBTrace.DBG_STACK)
        FBTrace.sysout("javascripttool currentFrame ", frame);

    JavaScriptTool.Turn.currentFrame = frame;
    panel.onStartDebugging(frame);
};

JavaScriptTool.onStopDebugging = function(context)
{
    var panel = context.getPanel("script", true);
    // Then we are looking at the Script panel.
    if (panel && panel === Firebug.chrome.getSelectedPanel())
    {
        // unhighlight and remove toolbar-status line
        panel.showNoStackFrame();
    }

    if (panel)
        panel.onStopDebugging();

    delete JavaScriptTool.Turn.currentFrame;
};

JavaScriptTool.onCompilationUnit = function(context, url, kind)
{
     var compilationUnit = new CompilationUnit(url, context);

     compilationUnit.kind = kind;

     context.compilationUnits[url] = compilationUnit;

     if (FBTrace.DBG_COMPILATION_UNITS)
     {
         FBTrace.sysout("JavaScriptTool.onCompilationUnit "+url+" added to "+context.getName(),
             compilationUnit);
     }
};

JavaScriptTool.initialize = function()
{
    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("JavaScriptTool initialize");

    // This is how we get events.
    Firebug.connection.addListener(JavaScriptTool);
};

JavaScriptTool.shutdown = function()
{
    // This is how we get events.
    Firebug.connection.removeListener(JavaScriptTool);
};

// ********************************************************************************************* //
// Registration

Firebug.registerModule(JavaScriptTool);

return JavaScriptTool;

// ********************************************************************************************* //
});
