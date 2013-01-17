/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/firebug",
],
function(FBTrace, Obj, Locale, Firebug) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var Trace = FBTrace.to("DBG_DEBUGGER");

// ********************************************************************************************* //

Firebug.Debugger = Obj.extend(Firebug.ActivableModule,
{
    dispatchName: "Debugger",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Firebug.ActivableModule.initialize.apply(this, arguments);
    },

    shutdown: function()
    {
        Firebug.ActivableModule.shutdown.apply(this, arguments);
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

    setBreakpoint: function(sourceFile, lineNo)  // TODO: arg should be url
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
    // Debugging and monitoring

    traceAll: function(context)
    {
    },

    untraceAll: function(context)
    {
    },

    monitorFunction: function(fn, mode)
    {
    },

    unmonitorFunction: function(fn, mode)
    {
    },

    monitorScript: function(fn, script, mode)
    {
    },

    unmonitorScript: function(fn, script, mode)
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
    },

    resume: function(context)
    {
    },

    abort: function(context)
    {
    },

    stepOver: function(context)
    {
    },

    stepInto: function(context)
    {
    },

    stepOut: function(context)
    {
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
    },

    stop: function(context, frame, type, rv)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Evaluation

    evaluate: function(js, context, scope)
    {
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
