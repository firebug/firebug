/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ************************************************************************************************
// Callstack Panel

/**
 * @Panel This panel is responsible for displaying a call-stack (list of function calls)
 * at specified point of Javascript execution. It's used as a side panel fro the Script
 * panel.
 */
Firebug.CallstackPanel = function() {}
Firebug.CallstackPanel.prototype = extend(Firebug.Panel,
/** @lends Firebug.CallstackPanel */
{
    name: "callstack",
    parentPanel: "script",
    order: 1,
    enableA11y: true,
    deriveA11yFrom: "console",

    initialize: function(context, doc)
    {
        Firebug.Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        Firebug.Panel.destroy.apply(this, arguments);
    },

    show: function(state)
    {
        this.rebuild();  // hack: should not have to call

        if (FBTrace.DBG_STACK)
            FBTrace.sysout("callstack.show state: "+state, state);

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
                state.selectedCallStackFrameIndex = i;
        }
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("callstack.hide state: "+state, state);
    },

    supportsObject: function(object, type)
    {
        return (object instanceof StackTrace) || (object instanceof Ci.jsdIStackFrame) ||
            (object instanceof StackFrame);
    },

    // this.selection is a StackFrame in our this.location
    updateSelection: function(object)
    {
        // The selection object should be StackFrame
        if (object instanceof StackFrame)
        {
            var trace = this.location;
            trace.currentFrameIndex = object.frameIndex;
            if (trace.currentFrameIndex != undefined)
                this.selectFrame(trace.currentFrameIndex);

            if (FBTrace.DBG_STACK)
                FBTrace.sysout("Callstack updateSelection index:"+trace.currentFrameIndex+
                    " StackFrame "+object, object);
        }
        else if(object instanceof Ci.jsdIStackFrame)
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
        // All paths lead to showStackTrace
        if (object instanceof StackTrace)
            this.showStackTrace(object);
        else if (object instanceof Ci.jsdIStackFrame)
            this.navigate(getCorrectedStackTrace(object, this.context));
        else if (object instanceof StackFrame)
            this.showStackFrame(object);
    },

    rebuild: function()
    {
        var trace = getCorrectedStackTrace(this.context.stoppedFrame, this.context);
        this.navigate(trace);
    },

    showStackFrame: function(frame)
    {
        var trace = new StackTrace();
        while(frame)
        {
            trace.frames.push(frame);
            frame = frame.getCallingFrame();
        }
        this.navigate(trace);
    },

    showStackTrace: function(trace)
    {
        clearNode(this.panelNode);

        FBL.setClass(this.panelNode, "objectBox-stackTrace");

        var rep = Firebug.getRep(trace, this.context);

        if (FBTrace.DBG_STACK)
            FBTrace.sysout("callstack showStackFrame with "+trace.frames.length+" frames using "
                +rep+" into "+this.panelNode, {trace: trace, rep:rep, node:this.panelNode});

        rep.tag.replace({object:trace}, this.panelNode);

        if (trace.currentFrameIndex)
            this.select(trace[trace.currentFrameIndex]);

        dispatch(this.fbListeners, "onStackCreated", [this]);
    },

    selectFrame: function(frameIndex)
    {
        var frameElts = this.panelNode.getElementsByClassName("objectBox-stackFrame");
        this.selectItem(frameElts[frameIndex]);
    },

    selectItem: function(item)
    {
        if (this.selectedItem)
            this.selectedItem.removeAttribute("selected");

        this.selectedItem = item;

        if (item)
            item.setAttribute("selected", "true");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Menus

    getOptionsMenuItems: function()
    {
        var items = [
            optionMenu("OmitObjectPathStack", "omitObjectPathStack"),  // an option handled by chrome.js
        ];
        return items;
    },

    getContextMenuItems: function(nada, target)
    {
        FBTrace.sysout("panel.getContextMenuItems", cloneArray(arguments));
        var items = [
            {label: "Expand All", command: bindFixed(this.onExpandAll, this, target)},
            {label: "Collapse All", command: bindFixed(this.onCollapseAll, this, target)}
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Referents xxxHonza, xxxJJB: what is this?

    showReferents: function()
    {
        // Find obj.functionName for the currently executing function
        // The general case is (expr_for_this).(expr_for_fn)().
        // expr navigates us using names from the scope chain
        delete this.parent;

        var frame = this.context.currentFrame;
        var fnName = getFunctionName(frame.script, this.context, frame, true);

        var referents = this.getReferents(frame, fnName);

    },
});

// ************************************************************************************************

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

    /*
     * A string of identifiers separated by dots such that container[string] gives obj
     */
    getObjectPathExpression: function()
    {
        this.objectPathExpr = FBL.cloneArray(this.names).reverse().join('.');
        return this.objectPathExpr;
    },

    getObjectPathObjects: function()
    {
        this.objChain = FBL.cloneArray(this.values);
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

// ************************************************************************************************

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
                FBTrace.sysout("Firebug.Debugger.showReferents evaled "+js+" and got "+result.value, result);
            try
            {
                var fn = result.value.getWrappedValue();
                var thisObject = unwrapIValueObject(frame.thisValue, Firebug.viewChrome);
                var referents = findObjectPropertyPath("this", thisObject, fn, []);

                if (FBTrace.DBG_STACK)
                    FBTrace.sysout("Firebug.Debugger.showReferents found from thisObject "+referents.length, {thisObject: thisObject, fn: fn, referents: referents});

                var containingScope = unwrapIValueObject(result.value.jsParent, Firebug.viewwChrome);

                if (FBTrace.DBG_STACK)
                    FBTrace.sysout("Firebug.Debugger.showReferents containingScope from "+result.value.jsParent.jsClassName, containingScope);

                var scopeReferents = findObjectPropertyPath(result.value.jsParent.jsClassName, containingScope, fn, []);
                // Do we need to look in the entire scope chain? I think yes

                if (FBTrace.DBG_STACK)
                    FBTrace.sysout("Firebug.Debugger.showReferents found scope referents "+scopeReferents.length, {containingScope: containingScope, fn: fn, referents: scopeReferents});

                referents = referents.concat(scopeReferents);
                FBTrace.sysout("Firebug.Debugger.showReferents found total referents "+referents.length, {fn: fn, referents: referents});
                for (var i = 0; i < referents.length; i++)
                {
                    if (FBTrace.DBG_STACK)
                        FBTrace.sysout("Firebug.Debugger.showReferents found referent "+referents[i].getObjectPathExpression(), {fn: fn, referent: referents[i], path:referents[i].getObjectPathObjects() });
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
                FBTrace.sysout("Firebug.Debugger.showReferents evaled "+js+" but result.value not instanceof Ci.jsdIValue "+result.value, result);
        }
        return referents;
    }
    else
    {
        if (FBTrace.DBG_STACK || FBTrace.DBG_ERRORS)
            FBTrace.sysout("Firebug.Debugger.showReferents eval failed with "+ok+" result "+result.value, result);
    }
}

// ************************************************************************************************
// Registration

Firebug.registerPanel(Firebug.CallstackPanel);

// ************************************************************************************************
return Firebug.CallstackPanel;
}});
