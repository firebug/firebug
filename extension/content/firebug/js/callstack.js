/* See license.txt for terms of usage */

define([
    "firebug/chrome/panel",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/reps",
    "arch/javascripttool",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/js/stackFrame",
    "firebug/lib/css",
    "firebug/lib/array",
    "firebug/lib/dom",
    "firebug/lib/options",
    "firebug/chrome/menu"
],
function(Panel, Obj, Firebug, FirebugReps, JavaScriptTool, Events, Wrapper, StackFrame,
    Css, Arr, Dom, Options, Menu) {

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
 */
Firebug.CallstackPanel = function() {};
Firebug.CallstackPanel.prototype = Obj.extend(Panel,
/** @lends Firebug.CallstackPanel */
{
    name: "callstack",
    parentPanel: "script",
    order: 1,
    enableA11y: true,
    deriveA11yFrom: "console",

    initialize: function(context, doc)
    {
        Panel.initialize.apply(this, arguments);

        Firebug.connection.addListener(this);
    },

    destroy: function(state)
    {
        Firebug.connection.removeListener(this);

        Panel.destroy.apply(this, arguments);
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
            FBTrace.sysout("callstack; onStartDebugging "+this.visible, this);
    },

    onStopDebugging: function(context)
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("callstack; onStopDebugging");

        // clear the view
        this.showStackTrace(null);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    show: function(state)
    {
        if (!this.location)
        {
            this.location = StackFrame.buildStackTrace(JavaScriptTool.Turn.currentFrame);
            this.updateLocation(this.location);
        }
        // then we are lazy

        if (FBTrace.DBG_STACK)
            FBTrace.sysout("callstack.show state: "+state+" this.location: "+this.location,
                {state: state, panel: this,
                  currentFrame: JavaScriptTool.Turn.currentFrame});

        if (state)
        {
            if (state.callstackToggles)
            {
                var frameElts = this.panelNode.getElementsByClassName("objectBox-stackFrame");
                for (var i = 0; i < frameElts.length; i++)
                {
                    if (state.callstackToggles[i])
                        FirebugReps.StackFrame.expandArguments(frameElts[i]);
                }
            }

            if (state.selectedCallStackFrameIndex)
            {
                this.selectFrame(state.selectedCallStackFrameIndex);
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
        return (object instanceof StackFrame.StackTrace) ||
            (object instanceof Ci.jsdIStackFrame) ||
            (object instanceof StackFrame.StackFrame);
    },

    // this.selection is a StackFrame in our this.location
    updateSelection: function(object)
    {
        if (!this.location) // then we are lazy
        {
            this.location = StackFrame.buildStackTrace(JavaScriptTool.Turn.currentFrame);
            this.updateLocation(this.location);
        }

        // The selection object should be StackFrame
        if (object instanceof StackFrame.StackFrame)
        {
            var trace = this.location;
            var frameIndex = object.getFrameIndex();
            if (frameIndex)
            {
                trace.currentFrameIndex = frameIndex;
                this.selectFrame(frameIndex);
            }

            if (FBTrace.DBG_STACK)
                FBTrace.sysout("Callstack updateSelection index:"+trace.currentFrameIndex+
                    " StackFrame "+object, object);
        }
        else if (object instanceof Ci.jsdIStackFrame)
        {
            var trace = this.location;
            if (trace)
            {
                trace.frames.forEach(function selectMatching(frame)
                {
                    if (frame.nativeFrame === object)
                        this.select(frame);
                }, this);
            }
        }
    },

    // this.location is a StackTrace
    updateLocation: function(object)
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("callstack; updateLocation "+object, object);

        // All paths lead to showStackTrace
        if (object instanceof StackFrame.StackTrace)
            this.showStackTrace(object);
        else if (object instanceof Ci.jsdIStackFrame)
            this.navigate(StackFrame.getCorrectedStackTrace(object, this.context));
        else if (object instanceof StackFrame.StackFrame)
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

        // Update visibility of stack frame arguments.
        var name = "showStackFrameArguments";
        this.updateOption(name, Options.get(name));

        if (trace && trace.frames.length != 0)
        {
            var rep = Firebug.getRep(trace, this.context);

            if (FBTrace.DBG_STACK)
                FBTrace.sysout("callstack showStackFrame with "+trace.frames.length+" frames using "
                    +rep+" into "+this.panelNode, {trace: trace, rep:rep, node:this.panelNode});

            rep.tag.replace({object:trace}, this.panelNode);

            if (trace.currentFrameIndex)
                this.select(trace[trace.currentFrameIndex]);

            Events.dispatch(this.fbListeners, "onStackCreated", [this]);
        }
        else
        {
            FirebugReps.Warning.tag.replace({object: "callstack.Execution_not_stopped"}, this.panelNode);
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

        // an option handled by chrome.js
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
        var items = [
            {
                label: "callstack.Expand_All",
                tooltiptext: "callstack.tip.Expand_All",
                command: Obj.bindFixed(this.onExpandAll, this, target)
            },
            {
                label: "callstack.Collapse_All",
                tooltiptext: "callstack.tip.Collapse_All",
                command: Obj.bindFixed(this.onCollapseAll, this, target)
            }
        ];
        return items;
    },

    onExpandAll: function()
    {
        var elements = this.panelNode.querySelectorAll(".objectBox-stackFrame");
        for (var i=0; i<elements.length; i++)
            FirebugReps.StackFrame.expandArguments(elements[i]);
    },

    onCollapseAll: function()
    {
        var elements = this.panelNode.querySelectorAll(".objectBox-stackFrame");
        for (var i=0; i<elements.length; i++)
            FirebugReps.StackFrame.collapseArguments(elements[i]);
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Referents xxxHonza, xxxJJB: what is this? Incomplete feature for finding all
    // references to a function

    showReferents: function()
    {
        // Find obj.functionName for the currently executing function
        // The general case is (expr_for_this).(expr_for_fn)().
        // expr navigates us using names from the scope chain
        delete this.parent;

        var frame = this.context.currentFrame;
        var fnName = StackFrame.getFunctionName(frame.script, this.context, frame, true);

        var referents = this.getReferents(frame, fnName);
    },
});

// ********************************************************************************************* //

function Referent(containerName, container, propertyName, obj)
{
    this._firebug = true;
    // Reverse order, deep is first
    this.values = [container];
    this.names = [propertyName, containerName];
    this.object = obj;
}

Referent.prototype =
{
    getContainer: function()
    {
        return this.container;
    },

    /**
     * A string of identifiers separated by dots such that container[string] gives obj
     */
    getObjectPathExpression: function()
    {
        this.objectPathExpr = Arr.cloneArray(this.names).reverse().join('.');
        return this.objectPathExpr;
    },

    getObjectPathObjects: function()
    {
        this.objChain = Arr.cloneArray(this.values);
        this.objChain.push(this.object);
        this.objChain.reverse();
        return this.objChain;
    },

    prependPath: function(p, segmentObject)
    {
        this.names.push(p);
        this.values.push(segmentObject);
    },
};

// ********************************************************************************************* //

function getReferents(frame, fnName)
{
    if (FBTrace.DBG_STACK)
        FBTrace.sysout('showReferents '+frame, frame);

    // lookup the name of the function using frame.eval() -> function object
    // use 'this' as a lookup scope since function calls can be obj.fn or just fn
    var js = "with (this) {"+fnName +";}";

    var result = {};
    var ok = frame.eval(js, "", 1, result);
    if (ok)
    {
        if (result.value instanceof Ci.jsdIValue)
        {
            if (FBTrace.DBG_STACK)
                FBTrace.sysout("Firebug.Debugger.showReferents evaled "+js+" and got "+
                    result.value, result);

            try
            {
                var fn = result.value.getWrappedValue();
                var thisObject = Wrapper.unwrapIValueObject(frame.thisValue, Firebug.viewChrome);
                var referents = findObjectPropertyPath("this", thisObject, fn, []);

                if (FBTrace.DBG_STACK)
                    FBTrace.sysout("Firebug.Debugger.showReferents found from thisObject "+
                        referents.length, {thisObject: thisObject, fn: fn, referents: referents});

                var containingScope = Wrapper.unwrapIValueObject(result.value.jsParent,
                    Firebug.viewwChrome);

                if (FBTrace.DBG_STACK)
                    FBTrace.sysout("Firebug.Debugger.showReferents containingScope from "+
                        result.value.jsParent.jsClassName, containingScope);

                var scopeReferents = findObjectPropertyPath(result.value.jsParent.jsClassName,
                    containingScope, fn, []);
                // Do we need to look in the entire scope chain? I think yes

                if (FBTrace.DBG_STACK)
                    FBTrace.sysout("Firebug.Debugger.showReferents found scope referents "+
                        scopeReferents.length, {containingScope: containingScope, fn: fn,
                            referents: scopeReferents});

                referents = referents.concat(scopeReferents);
                FBTrace.sysout("Firebug.Debugger.showReferents found total referents "+
                    referents.length, {fn: fn, referents: referents});

                for (var i = 0; i < referents.length; i++)
                {
                    if (FBTrace.DBG_STACK)
                        FBTrace.sysout("Firebug.Debugger.showReferents found referent "+
                            referents[i].getObjectPathExpression(), {fn: fn, referent: referents[i],
                            path:referents[i].getObjectPathObjects() });
                }
            }
            catch(exc)
            {
                if (FBTrace.DBG_STACK || FBTrace.DBG_ERRORS)
                    FBTrace.sysout("Firebug.Debugger.showReferents FAILED: "+exc, exc);
            }
        }
        else
        {
            if (FBTrace.DBG_STACK || FBTrace.DBG_ERRORS)
                FBTrace.sysout("Firebug.Debugger.showReferents evaled "+js+
                    " but result.value not instanceof Ci.jsdIValue "+result.value, result);
        }
        return referents;
    }
    else
    {
        if (FBTrace.DBG_STACK || FBTrace.DBG_ERRORS)
            FBTrace.sysout("Firebug.Debugger.showReferents eval failed with "+ok+" result "+
                result.value, result);
    }
}

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(Firebug.CallstackPanel);

return Firebug.CallstackPanel;

// ********************************************************************************************* //
});
