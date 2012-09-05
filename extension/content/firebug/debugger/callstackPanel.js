/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/reps",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/debugger/stackFrame",
    "firebug/lib/css",
    "firebug/lib/array",
    "firebug/lib/dom",
    "firebug/chrome/menu",
    "firebug/debugger/stackFrameRep",
    "firebug/debugger/stackTrace",
],
function(Obj, Firebug, FirebugReps, Events, Wrapper, StackFrame, Css, Arr, Dom, Menu,
    StackFrameRep, StackTrace) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Callstack Panel

/**
 * @Panel This panel is responsible for displaying a call-stack (list of function calls)
 * at specified point of Javascript execution. It's used as a side panel for the Script
 * panel.
 *
 * Panel location is an instance of StackTrace object.
 * Panel selection is an instance of StackFrame object.
 */
function CallstackPanel() {}
CallstackPanel.prototype = Obj.extend(Firebug.Panel,
/** @lends CallstackPanel */
{
    dispatchName: "JSD2.CallstackPanel",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Members

    name: "jsd2callstack",
    parentPanel: "jsd2script",
    order: 1,
    enableA11y: true,
    deriveA11yFrom: "console",
    remotable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(context, doc)
    {
        Firebug.Panel.initialize.apply(this, arguments);

        Firebug.proxy.addListener(this);
    },

    destroy: function(state)
    {
        Firebug.proxy.removeListener(this);

        Firebug.Panel.destroy.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    onConnect: function(proxy)
    {
        FBTrace.sysout("CallstackPanel.onConnect;");

        this.tool = this.context.getTool("debugger");
        this.tool.attach(this.context, proxy.connection, this);
    },

    onDisconnect: function(proxy)
    {
        FBTrace.sysout("CallstackPanel.onDisconnect;");

        // Detach from the current tool.
        this.tool.detach(this.context, proxy.connection, this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onStartDebugging: function(context, frame)
    {
        // if we get a show() call then create and set new location
        delete this.location;

        // then we should reshow
        if (this.visible)
            this.show();

        if (FBTrace.DBG_STACK)
            FBTrace.sysout("callstackPanel.onStartDebugging; " + this.visible);
    },

    onStopDebugging: function(context)
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("callstackPanel.onStopDebugging;");

        // clear the view
        this.showStackTrace(null);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    show: function(state)
    {
        if (!this.location)
        {
            this.location = this.tool.getCurrentTrace(this.context);
            this.updateLocation(this.location);
        }

        if (FBTrace.DBG_STACK)
        {
            FBTrace.sysout("callstack.show; state: " + state + ", location: " +
                this.location, state);
        }

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

        if (FBTrace.DBG_STACK)
            FBTrace.sysout("callstack.hide state: "+state, state);
    },

    supportsObject: function(object, type)
    {
        return (object instanceof StackTrace) || (object instanceof StackFrame);
    },

    // this.selection is a StackFrame in our this.location
    updateSelection: function(object)
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("callstack.updateSelection; " + object, object);

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

            if (FBTrace.DBG_STACK)
            {
                FBTrace.sysout("Callstack updateSelection index:" + trace.currentFrameIndex +
                    " StackFrame " + object, object);
            }
        }
    },

    // this.location is a StackTrace
    updateLocation: function(object)
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("callstack.updateLocation; " + object, object);

        // All paths lead to showStackTrace
        if (object instanceof StackTrace)
            this.showStackTrace(object);
        else if (object instanceof StackFrame)
            this.showStackFrame(object);
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

        if (trace && trace.frames.length != 0)
        {
            var rep = Firebug.getRep(trace, this.context);

            if (FBTrace.DBG_STACK)
            {
                FBTrace.sysout("callstack showStackFrame with " + trace.frames.length +
                    " frames using " + rep + " into " + this.panelNode,
                    {trace: trace, rep:rep, node:this.panelNode});
            }

            rep.tag.replace({object:trace}, this.panelNode);

            if (trace.currentFrameIndex)
                this.select(trace[trace.currentFrameIndex]);

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
        // an option handled by chrome.js
        var items = [
            Menu.optionMenu("OmitObjectPathStack", "omitObjectPathStack",
                "callstack.option.tip.Omit_Object_Path_Stack"),
        ];

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tool Listener

    onStackCreated: function(stackTrace)
    {
        FBTrace.sysout("CallstackPanel.onStackCreated;", stackTrace);

        this.showStackTrace(stackTrace);
    },

    onStackCleared: function()
    {
        
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(CallstackPanel);

return CallstackPanel;

// ********************************************************************************************* //
});
