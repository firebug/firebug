/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/firebug",
    "firebug/debugger/debuggerHalter",
    "firebug/debugger/debuggerLib",
    "firebug/debugger/clients/clientCache",
    "firebug/remoting/debuggerClientModule",
    "firebug/debugger/debuggerTool",
],
function(FBTrace, Obj, Locale, Firebug, DebuggerHalter, DebuggerLib, ClientCache,
    DebuggerClientModule, DebuggerTool) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var Trace = FBTrace.to("DBG_DEBUGGER");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //

Firebug.Debugger = Obj.extend(Firebug.ActivableModule,
{
    dispatchName: "Debugger",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Firebug.ActivableModule.initialize.apply(this, arguments);

        Firebug.registerTracePrefix("debuggerTool.", "DBG_DEBUGGERTOOL", false);

        // Listen to the debugger-client, which represents the connection to the server.
        // The debugger-client object represents the source of all RDP events.
        DebuggerClientModule.addListener(this);

        // Hook XUL stepping buttons.
        var chrome = Firebug.chrome;
        chrome.setGlobalAttribute("cmd_firebug_rerun", "oncommand",
            "Firebug.Debugger.rerun(Firebug.currentContext)");
        chrome.setGlobalAttribute("cmd_firebug_resumeExecution", "oncommand",
            "Firebug.Debugger.resume(Firebug.currentContext)");
        chrome.setGlobalAttribute("cmd_firebug_stepOver", "oncommand",
            "Firebug.Debugger.stepOver(Firebug.currentContext)");
        chrome.setGlobalAttribute("cmd_firebug_stepInto", "oncommand",
            "Firebug.Debugger.stepInto(Firebug.currentContext)");
        chrome.setGlobalAttribute("cmd_firebug_stepOut", "oncommand",
            "Firebug.Debugger.stepOut(Firebug.currentContext)");
    },

    shutdown: function()
    {
        Firebug.unregisterTracePrefix("debuggerTool.");

        DebuggerClientModule.removeListener(this);

        Firebug.ActivableModule.shutdown.apply(this, arguments);
    },

    initContext: function(context, persistedState)
    {
        Trace.sysout("debuggerTool.initContext; context ID: " + context.getId());

        // If page reload happens the thread client remains the same so,
        // preserve also all existing breakpoint clients.
        // See also {@DebuggerClientModule.initConext}
        if (persistedState)
        {
            context.breakpointClients = persistedState.breakpointClients;
        }
    },

    showContext: function(browser, context)
    {
        // xxxHonza: see TabWatcher.unwatchContext
        if (!context)
            return;

        Trace.sysout("debugger.showContext; context ID: " + context.getId());
    },

    destroyContext: function(context, persistedState, browser)
    {
        var tool = context.getTool("debugger");
        tool.detach();

        persistedState.breakpointClients = context.breakpointClients;

        Trace.sysout("debugger.destroyContext; context ID: " + context.getId());
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    onThreadAttached: function(context, reload)
    {
        Trace.sysout("debuggerTool.onThreadAttached; reload: " + reload + ", context ID: " +
            context.getId(), context);

        // Create grip cache
        context.clientCache = new ClientCache(DebuggerClientModule.client, context);

        // Attach debugger tool
        var tool = context.getTool("debugger");
        tool.attach();
    },

    onThreadDetached: function(context)
    {
        Trace.sysout("debuggerTool.onThreadDetached; context ID: " + context.getId());

        var tool = context.getTool("debugger");
        tool.detach();
    },

    onTabNavigated: function(context, url, state)
    {
        Trace.sysout("debuggerTool.onTabNavigated;", arguments);

        var tool = context.getTool("debugger");
        tool.onTabNavigated(url, state);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends ActivableModule

    onObserverChange: function(observer)
    {
        if (this.hasObservers())
            this.activateDebugger();
        else
            this.deactivateDebugger();
    },

    activateDebugger: function()
    {
        Trace.sysout("Debugger.activateDebugger;");
    },

    deactivateDebugger: function()
    {
        Trace.sysout("Debugger.deactivateDebugger;");
    },

    onSuspendFirebug: function()
    {
        if (!Firebug.Debugger.isAlwaysEnabled())
            return;

        Trace.sysout("Debugger.onSuspendFirebug;");

        return false;
    },

    onResumeFirebug: function()
    {
        if (!Firebug.Debugger.isAlwaysEnabled())
            return;

        Trace.sysout("Debugger.onResumeFirebug;");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints

    setBreakpoint: function(sourceFile, lineNo)
    {
    },

    clearBreakpoint: function(sourceFile, lineNo)
    {
    },

    setErrorBreakpoint: function(compilationUnit, line)
    {
    },

    clearErrorBreakpoint: function(compilationUnit, line)
    {
    },

    clearAllBreakpoints: function(context)
    {
    },

    enableAllBreakpoints: function(context)
    {
    },

    disableAllBreakpoints: function(context)
    {
    },

    getBreakpointCount: function(context)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tracing (see issue 6220)

    traceAll: function(context)
    {
    },

    untraceAll: function(context)
    {
    },

    traceCalls: function(context, fn)
    {
    },

    untraceCalls: function(context, fn)
    {
    },

    traceScriptCalls: function(context, script)
    {
    },

    untraceScriptCalls: function(context, script)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debugging

    rerun: function(context)
    {
        context.getTool("debugger").rerun();
    },

    resume: function(context)
    {
        context.getTool("debugger").resume();
    },

    abort: function(context)
    {
    },

    stepOver: function(context)
    {
        context.getTool("debugger").stepOver();
    },

    stepInto: function(context)
    {
        context.getTool("debugger").stepInto();
    },

    stepOut: function(context)
    {
        context.getTool("debugger").stepOut();
    },

    suspend: function(context)
    {
    },

    unSuspend: function(context)
    {
    },

    runUntil: function(context, compilationUnit, lineNo)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    freeze: function(context)
    {
    },

    suppressEventHandling: function(context)
    {
    },

    thaw: function(context)
    {
    },

    unsuppressEventHandling: function(context)
    {
    },

    toggleFreezeWindow: function(context)
    {
    },

    doToggleFreezeWindow: function(context)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    halt: function(fnOfFrame)
    {
    },

    breakAsIfDebugger: function(frame)
    {
        // Used by FBTest
    },

    breakNow: function(context)
    {
        DebuggerHalter.breakNow(context);
    },

    stop: function(context, frame, type, rv)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Evaluation

    // xxxHonza: this entire methods should share API with the CommandLine if possible.
    evaluate: function(js, context, scope)
    {
        Trace.sysout("debugger.evaluate; " + js, scope);

        var currentFrame = context.currentFrame;
        if (!currentFrame)
            return;

        var threadActor = DebuggerLib.getThreadActor(context);
        var frameActor = currentFrame.getActor();
        var frame = threadActor._requestFrame(frameActor);

        try
        {
            var result;

            var dGlobal = DebuggerLib.getDebuggeeGlobal(context);
            scope = dGlobal.makeDebuggeeValue(scope);

            if (scope)
                result = frame.evalWithBindings(js, scope);
            else
                result = frame.eval(js);

            Trace.sysout("debugger.evaluate; RESULT:", result);

            if (result.hasOwnProperty("return"))
            {
                result = result["return"];
                if (typeof(result) == "object")
                    return DebuggerLib.unwrapDebuggeeValue(result["return"]);
                else
                    return result;
            }
        }
        catch (e)
        {
            TraceError.sysout("debugger.evaluate; EXCEPTION " + e, e);
        }
    },

    evaluateInCallingFrame: function(js, fileName, lineNo)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getCurrentStackTrace: function(context)
    {
    },

    hasValidStack: function(context)
    {
        return context.stopped;
    },

    getCurrentFrameKeys: function(context)
    {
    },

    getFrameKeys: function(frame, names)
    {
    },

    getContextByFrame: function(frame)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Private to Debugger

    beginInternalOperation: function() // stop debugger operations like breakOnErrors
    {
    },

    endInternalOperation: function(state)  // pass back the object given by beginInternalOperation
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Menu in toolbar.

    onScriptFilterMenuTooltipShowing: function(tooltip, context)
    {
        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("onScriptFilterMenuTooltipShowing not implemented");
    },

    onScriptFilterMenuCommand: function(event, context)
    {
        var menu = event.target;
        Firebug.Options.set("scriptsFilter", menu.value);
        Firebug.Debugger.filterMenuUpdate();
    },

    menuFullLabel:
    {
        "static": Locale.$STR("ScriptsFilterStatic"),
        evals: Locale.$STR("ScriptsFilterEval"),
        events: Locale.$STR("ScriptsFilterEvent"),
        all: Locale.$STR("ScriptsFilterAll"),
    },

    menuShortLabel:
    {
        "static": Locale.$STR("ScriptsFilterStaticShort"),
        evals: Locale.$STR("ScriptsFilterEvalShort"),
        events: Locale.$STR("ScriptsFilterEventShort"),
        all: Locale.$STR("ScriptsFilterAllShort"),
    },

    onScriptFilterMenuPopupShowing: function(menu, context)
    {
        if (this.menuTooltip)
            this.menuTooltip.fbEnabled = false;

        var items = menu.getElementsByTagName("menuitem");
        var value = this.filterButton.value;

        for (var i=0; i<items.length; i++)
        {
            var option = items[i].value;
            if (!option)
                continue;

            if (option == value)
                items[i].setAttribute("checked", "true");

            items[i].label = Firebug.Debugger.menuFullLabel[option];
        }

        return true;
    },

    onScriptFilterMenuPopupHiding: function(tooltip, context)
    {
        if (this.menuTooltip)
            this.menuTooltip.fbEnabled = true;

        return true;
    },

    filterMenuUpdate: function()
    {
        var value = Firebug.Options.get("scriptsFilter");
        this.filterButton.value = value;
        this.filterButton.label = this.menuShortLabel[value];
        this.filterButton.removeAttribute("disabled");
        this.filterButton.setAttribute("value", value);

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("debugger.filterMenuUpdate value: "+value+" label:"+
                this.filterButton.label+'\n');
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerActivableModule(Firebug.Debugger);

return Firebug.Debugger;

// ********************************************************************************************* //
});
