/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/chrome/panel",
    "firebug/chrome/reps",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/debugger/stack/stackFrame",
    "firebug/lib/css",
    "firebug/lib/array",
    "firebug/lib/dom",
    "firebug/chrome/menu",
    "firebug/debugger/stack/stackFrameRep",
    "firebug/debugger/stack/stackTrace",
    "firebug/lib/options",
],
function(Obj, Firebug, FBTrace, Panel, FirebugReps, Events, Wrapper, StackFrame, Css, Arr, Dom,
    Menu, StackFrameRep, StackTrace, Options) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var Trace = FBTrace.to("DBG_STACK");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Callstack Panel

/**
 * @Panel This panel is responsible for displaying a call-stack (list of function calls)
 * at specified point of Javascript execution. It's used as a side panel for the Script
 * panel.
 *
 * Panel location is an instance of StackTrace object.
 * Panel selection is an instance of StackFrame object.
 *
 * The content of this panel is synchronized with ThreadClient's stack frame cache using
 * 'framesadded' and 'framescleared' events. These events are re-sent from {@link DebuggerTool},
 * which is registered ThreadClient's listener.
 */
function CallstackPanel() {}
CallstackPanel.prototype = Obj.extend(Panel,
/** @lends CallstackPanel */
{
    dispatchName: "CallstackPanel",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Members

    name: "callstack",
    parentPanel: "script",
    order: 1,
    enableA11y: true,
    deriveA11yFrom: "console",
    remotable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(context, doc)
    {
        Panel.initialize.apply(this, arguments);

        // Listen for frames added/cleared events to sync content of this panel.
        this.tool = this.context.getTool("debugger");
        this.tool.addListener(this);
    },

    destroy: function(state)
    {
        Panel.destroy.apply(this, arguments);

        // Unregister all listeners.
        this.tool.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tool Listener

    framesadded: function(stackTrace)
    {
        Trace.sysout("callstackPanel.framesadded;", stackTrace);

        // if we get a show() call then create and set new location
        delete this.location;

        // then we should reshow
        if (this.visible)
            this.show();
    },

    framescleared: function()
    {
        Trace.sysout("callstackPanel.framescleared;");

        delete this.location;

        //xxxHonza: would it be more logical to call this.show() here?
        this.showStackTrace(null);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Framework Events

    show: function(state)
    {
        if (!this.location)
        {
            this.location = this.tool.getCurrentTrace(this.context);
            this.updateLocation(this.location);
        }

        Trace.sysout("callstackPanel.show; state: " + state + ", location: " +
            this.location, state);

        if (state)
        {
            if (state.callstackToggles)
            {
                var frameElts = this.panelNode.getElementsByClassName("objectBox-stackFrame");
                for (var i = 0; i < frameElts.length; i++)
                {
                    if (state.callstackToggles[i])
                        StackFrameRep.expandArguments(frameElts[i]);
                }
            }

            if (state.selectedCallStackFrameIndex)
            {
                this.selectFrame(state.selectedCallStackFrameIndex)
            }
        }
    },

    hide: function(state)
    {
        var frameElts = this.panelNode.getElementsByClassName("objectBox-stackFrame");
        state.callstackToggles = [];

        for (var i = 0; i < frameElts.length; i++)
        {
            var item = frameElts[i];
            if (item.classList.contains("opened"))
                state.callstackToggles[i] = true;

            if (item.getAttribute("selected") == "true")
                state.selectedCallStackFrameIndex = i + 1;  // traces are 1 base
        }

        Trace.sysout("callstackPanel.hide state: "+state, state);
    },

    supportsObject: function(object, type)
    {
        return (object instanceof StackTrace) || (object instanceof StackFrame);
    },

    // this.selection is a StackFrame in our this.location
    updateSelection: function(object)
    {
        Trace.sysout("callstackPanel.updateSelection; " + object, object);

        if (!this.location)
        {
            this.location = this.tool.getCurrentTrace(this.context);
            this.updateLocation(this.location);
        }

        // The selection object should be StackFrame
        if (object instanceof StackFrame)
        {
            var trace = this.location;
            var frameIndex = object.getFrameIndex();
            if (frameIndex)
            {
                trace.currentFrameIndex = frameIndex;
                this.selectFrame(frameIndex);
            }

            Trace.sysout("callstackPanel.updateSelection; stackFrame: " + object, object);
        }
    },

    // this.location is a StackTrace
    updateLocation: function(object)
    {
        Trace.sysout("callstackPanel.updateLocation; " + object, object);

        // All paths lead to showStackTrace
        if (object instanceof StackTrace)
            this.showStackTrace(object);
        else if (object instanceof StackFrame)
            this.showStackFrame(object);
        else
            this.showStackTrace(null);
    },

    showStackFrame: function(frame)
    {
        var trace = StackFrame.buildStackTrace(frame);
        this.navigate(trace);
    },

    showStackTrace: function(trace)
    {
        Dom.clearNode(this.panelNode);

        Css.setClass(this.panelNode, "objectBox-stackTrace");

        // Update visibility of stack frame arguments.
        var name = "showStackFrameArguments";
        this.updateOption(name, Options.get(name));

        if (trace && trace.frames.length != 0)
        {
            var rep = Firebug.getRep(trace, this.context);

            Trace.sysout("callstackPanel.showStackFrame with " + trace.frames.length +
                " frames using " + rep + " into " + this.panelNode,
                {trace: trace, rep:rep, node:this.panelNode});

            rep.tag.replace({object:trace}, this.panelNode);

            if (trace.currentFrameIndex)
                this.select(trace.frames[trace.currentFrameIndex-1]);

            Events.dispatch(this.fbListeners, "onStackCreated", [this]);
        }
        else
        {
            FirebugReps.Warning.tag.replace({object: "callstack.Execution_not_stopped"},
                this.panelNode);
        }
    },

    selectFrame: function(frameIndex)
    {
        var frameElts = this.panelNode.getElementsByClassName("objectBox-stackFrame");
        this.selectItem(frameElts[frameIndex - 1]);
    },

    selectItem: function(item)
    {
        if (this.selectedItem)
            this.selectedItem.removeAttribute("selected");

        this.selectedItem = item;

        if (item)
            item.setAttribute("selected", "true");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Menus

    getOptionsMenuItems: function()
    {
        var items = [];

        // An option handled by 'firebug/chrome/statusPath' module.
        items.push(Menu.optionMenu("OmitObjectPathStack",
            "omitObjectPathStack",
            "callstack.option.tip.Omit_Object_Path_Stack"));

        // Show/hide stack frame arguments.
        items.push(Menu.optionMenu("callstack.option.Show_Arguments",
            "showStackFrameArguments",
            "callstack.option.tip.Show_Arguments"));

        return items;
    },

    getContextMenuItems: function(nada, target)
    {
        var items = [{
            label: "callstack.Expand_All",
            tooltiptext: "callstack.tip.Expand_All",
            command: Obj.bindFixed(this.onExpandAll, this, target)
        },{
            label: "callstack.Collapse_All",
            tooltiptext: "callstack.tip.Collapse_All",
            command: Obj.bindFixed(this.onCollapseAll, this, target)
        }];

        return items;
    },

    onExpandAll: function()
    {
        var elements = this.panelNode.querySelectorAll(".objectBox-stackFrame");
        for (var i=0; i<elements.length; i++)
            StackFrameRep.expandArguments(elements[i]);
    },

    onCollapseAll: function()
    {
        var elements = this.panelNode.querySelectorAll(".objectBox-stackFrame");
        for (var i=0; i<elements.length; i++)
            StackFrameRep.collapseArguments(elements[i]);
    },

    updateOption: function(name, value)
    {
        if (name == "showStackFrameArguments")
        {
            if (value)
                Css.removeClass(this.panelNode, "hideArguments");
            else
                Css.setClass(this.panelNode, "hideArguments");
        }
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(CallstackPanel);

return CallstackPanel;

// ********************************************************************************************* //
});
