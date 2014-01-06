/* See license.txt for terms of usage */
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/array",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/locale",
    "firebug/lib/object",
    "firebug/lib/persist",
    "firebug/lib/xpath",
    "firebug/chrome/module",
    "firebug/chrome/rep",
    "firebug/debugger/breakpoints/breakpointGroup",
    "firebug/html/htmlReps",
],
function(Firebug, FBTrace, Arr, Css, Dom, Domplate, Events, Locale, Obj, Persist, Xpath,
    Module, Rep, BreakpointGroup, HTMLReps) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, TAG, DIV, SPAN, INPUT} = Domplate;

var BP_BREAKONATTRCHANGE = 1;
var BP_BREAKONCHILDCHANGE = 2;
var BP_BREAKONREMOVE = 3;
var BP_BREAKONTEXT = 4;

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_HTMLMODULE");

// ********************************************************************************************* //
// HTMLModule

/**
 * @module
 */
var HTMLModule = Obj.extend(Module,
/** @lends HTMLModule */
{
    dispatchName: "htmlModule",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(prefDomain, prefNames)
    {
        Module.initialize.apply(this, arguments);
        Firebug.connection.addListener(this.DebuggerListener);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);
        Firebug.connection.removeListener(this.DebuggerListener);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    initContext: function(context, persistedState)
    {
        Module.initContext.apply(this, arguments);
        context.mutationBreakpoints = new MutationBreakpointGroup(context);
    },

    loadedContext: function(context, persistedState)
    {
        context.mutationBreakpoints.load(context);
    },

    destroyContext: function(context, persistedState)
    {
        Module.destroyContext.apply(this, arguments);

        context.mutationBreakpoints.store(context);
    },

    deleteNode: function(node, context)
    {
        Events.dispatch(this.fbListeners, "onBeginFirebugChange", [node, context]);
        node.parentNode.removeChild(node);
        Events.dispatch(this.fbListeners, "onEndFirebugChange", [node, context]);
    },

    deleteAttribute: function(node, attr, context)
    {
        Events.dispatch(this.fbListeners, "onBeginFirebugChange", [node, context]);
        node.removeAttribute(attr);
        Events.dispatch(this.fbListeners, "onEndFirebugChange", [node, context]);
    }
});

// ********************************************************************************************* //
// Mutation Breakpoints

/**
 * @class Represents {@link Firebug.Debugger} listener. This listener is reponsible for
 * providing a list of mutation-breakpoints into the Breakpoints side-panel.
 */
HTMLModule.DebuggerListener =
{
    getBreakpoints: function(context, groups)
    {
        if (!context.mutationBreakpoints.isEmpty())
            groups.push(context.mutationBreakpoints);
    }
};

HTMLModule.MutationBreakpoints =
{
    breakOnNext: function(context, breaking)
    {
        context.breakOnNextMutate = breaking;
    },

    breakOnNextMutate: function(event, context, type)
    {
        if (!context.breakOnNextMutate)
            return false;

        // Ignore changes in ignored branches
        if (isAncestorIgnored(event.target))
            return false;

        context.breakOnNextMutate = false;

        this.breakWithCause(event, context, type);
    },

    breakWithCause: function(event, context, type)
    {
        var changeLabel = HTMLModule.BreakpointRep.getChangeLabel({type: type});

        context.breakingCause = {
            title: Locale.$STR("html.Break On Mutate"),
            message: changeLabel,
            type: event.type,
            target: event.target,
            relatedNode: event.relatedNode, // http://www.w3.org/TR/DOM-Level-2-Events/events.html
            prevValue: event.prevValue,
            newValue: event.newValue,
            attrName: event.attrName,
            attrChange: event.attrChange,
        };

        Trace.sysout("htmlModule.breakWithCause;", context.breakingCause);

        Firebug.Breakpoint.breakNow(context.getPanel("html", true));

        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Mutation event handlers.

    onMutateAttr: function(event, context)
    {
        if (this.breakOnNextMutate(event, context, BP_BREAKONATTRCHANGE))
            return;

        var breakpoints = context.mutationBreakpoints;
        var self = this;
        breakpoints.enumerateBreakpoints(function(bp)
        {
            if (bp.checked && bp.node == event.target && bp.type == BP_BREAKONATTRCHANGE)
            {
                self.breakWithCause(event, context, BP_BREAKONATTRCHANGE);
                return true;
            }
        });
    },

    onMutateText: function(event, context)
    {
        if (this.breakOnNextMutate(event, context, BP_BREAKONTEXT))
            return;
    },

    onMutateNode: function(event, context)
    {
        var node = event.target;
        var removal = event.type == "DOMNodeRemoved";

        if (this.breakOnNextMutate(event, context, removal ?
            BP_BREAKONREMOVE : BP_BREAKONCHILDCHANGE))
        {
            return;
        }

        var breakpoints = context.mutationBreakpoints;
        var breaked = false;

        var self = this;
        if (removal)
        {
            breaked = breakpoints.enumerateBreakpoints(function(bp)
            {
                if (bp.checked && bp.node == node && bp.type == BP_BREAKONREMOVE)
                {
                    self.breakWithCause(event, context, BP_BREAKONREMOVE);
                    return true;
                }
            });
        }

        if (!breaked)
        {
            // Collect all parents of the mutated node.
            var parents = [];
            for (var parent = node.parentNode; parent; parent = parent.parentNode)
                parents.push(parent);

            // Iterate over all parents and see if some of them has a breakpoint.
            breakpoints.enumerateBreakpoints(function(bp)
            {
                for (var i=0; i<parents.length; i++)
                {
                    if (bp.checked && bp.node == parents[i] && bp.type == BP_BREAKONCHILDCHANGE)
                    {
                        self.breakWithCause(event, context, BP_BREAKONCHILDCHANGE);
                        return true;
                    }
                }
            });
        }

        if (removal)
        {
            // Remove all breakpoints associated with removed node.
            var invalidate = false;
            breakpoints.enumerateBreakpoints(function(bp)
            {
                if (bp.node == node)
                {
                    breakpoints.removeBreakpoint(bp);
                    invalidate = true;
                }
            });

            if (invalidate)
                context.invalidatePanels("breakpoints");
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context menu items

    getContextMenuItems: function(context, node, target, items)
    {
        if (!(node && node.nodeType == Node.ELEMENT_NODE))
            return;

        var breakpoints = context.mutationBreakpoints;

        var attrBox = Dom.getAncestorByClass(target, "nodeAttr");
        if (Dom.getAncestorByClass(target, "nodeAttr"))
        {
        }

        if (!(Css.nonEditableTags.hasOwnProperty(node.localName)))
        {
            items.push(
                "-",
                {
                    label: "html.label.Break_On_Attribute_Change",
                    tooltiptext: "html.tip.Break_On_Attribute_Change",
                    type: "checkbox",
                    checked: breakpoints.findBreakpoint(node, BP_BREAKONATTRCHANGE),
                    command: Obj.bindFixed(this.onModifyBreakpoint, this, context, node,
                        BP_BREAKONATTRCHANGE)
                },
                {
                    label: "html.label.Break_On_Child_Addition_or_Removal",
                    tooltiptext: "html.tip.Break_On_Child_Addition_or_Removal",
                    type: "checkbox",
                    checked: breakpoints.findBreakpoint(node, BP_BREAKONCHILDCHANGE),
                    command: Obj.bindFixed(this.onModifyBreakpoint, this, context, node,
                        BP_BREAKONCHILDCHANGE)
                },
                {
                    label: "html.label.Break_On_Element_Removal",
                    tooltiptext: "html.tip.Break_On_Element_Removal",
                    type: "checkbox",
                    checked: breakpoints.findBreakpoint(node, BP_BREAKONREMOVE),
                    command: Obj.bindFixed(this.onModifyBreakpoint, this, context, node,
                        BP_BREAKONREMOVE)
                }
            );
        }
    },

    onModifyBreakpoint: function(context, node, type)
    {
        var xpath = Xpath.getElementXPath(node);
        Trace.sysout("html.onModifyBreakpoint " + xpath);

        var breakpoints = context.mutationBreakpoints;
        var bp = breakpoints.findBreakpoint(node, type);

        // Remove an existing or create new breakpoint.
        if (bp)
            breakpoints.removeBreakpoint(bp);
        else
            breakpoints.addBreakpoint(node, type);

        Events.dispatch(HTMLModule.fbListeners, "onModifyBreakpoint",
            [context, xpath, type]);
    }
};

HTMLModule.Breakpoint = function(node, type)
{
    this.node = node;
    this.xpath = Xpath.getElementXPath(node);
    this.checked = true;
    this.type = type;
};

HTMLModule.BreakpointRep = domplate(Rep,
{
    inspectable: false,

    tag:
        DIV({"class": "breakpointRow focusRow", $disabled: "$bp|isDisabled", _repObject: "$bp",
            role: "option", "aria-checked": "$bp.checked"},
            DIV({"class": "breakpointBlockHead"},
                INPUT({"class": "breakpointCheckbox", type: "checkbox",
                    _checked: "$bp.checked", tabindex: "-1", onclick: "$onEnable"}),
                TAG("$bp.node|getNodeTag", {object: "$bp.node"}),
                DIV({"class": "breakpointMutationType"}, "$bp|getChangeLabel"),
                SPAN({"class": "closeButton", onclick: "$onRemove"})
            ),
            DIV({"class": "breakpointCode"},
                TAG("$bp.node|getSourceLine", {object: "$bp.node"})
            )
        ),

    getNodeTag: function(node)
    {
        var rep = Firebug.getRep(node, Firebug.currentContext);
        return rep.shortTag ? rep.shortTag : rep.tag;
    },

    getSourceLine: function(node)
    {
        return HTMLReps.getNodeTag(node, false);
    },

    getChangeLabel: function(bp)
    {
        switch (bp.type)
        {
        case BP_BREAKONATTRCHANGE:
            return Locale.$STR("html.label.Break On Attribute Change");
        case BP_BREAKONCHILDCHANGE:
            return Locale.$STR("html.label.Break On Child Addition or Removal");
        case BP_BREAKONREMOVE:
            return Locale.$STR("html.label.Break On Element Removal");
        case BP_BREAKONTEXT:
            return Locale.$STR("html.label.Break On Text Change");
        }

        return "";
    },

    isDisabled: function(bp)
    {
        return !bp.checked;
    },

    onRemove: function(event)
    {
        Events.cancelEvent(event);

        var bpPanel = Firebug.getElementPanel(event.target);
        var context = bpPanel.context;

        if (Css.hasClass(event.target, "closeButton"))
        {
            // Remove from list of breakpoints.
            var row = Dom.getAncestorByClass(event.target, "breakpointRow");
            context.mutationBreakpoints.removeBreakpoint(row.repObject);

            bpPanel.refresh();
        }
    },

    onEnable: function(event)
    {
        var checkBox = event.target;
        var bpRow = Dom.getAncestorByClass(checkBox, "breakpointRow");

        if (checkBox.checked)
        {
            Css.removeClass(bpRow, "disabled");
            bpRow.setAttribute("aria-checked", "true");
        }
        else
        {
            Css.setClass(bpRow, "disabled");
            bpRow.setAttribute("aria-checked", "false");
        }

        var bp = bpRow.repObject;
        bp.checked = checkBox.checked;

        var bpPanel = Firebug.getElementPanel(event.target);
        var context = bpPanel.context;

        context.mutationBreakpoints.updateListeners();
    },

    supportsObject: function(object, type)
    {
        return object instanceof HTMLModule.Breakpoint;
    }
});

// ********************************************************************************************* //

function MutationBreakpointGroup(context)
{
    this.breakpoints = [];
    this.context = context;
}

MutationBreakpointGroup.prototype = Obj.extend(new BreakpointGroup(),
{
    name: "mutationBreakpoints",
    title: Locale.$STR("html.label.HTML Breakpoints"),

    addBreakpoint: function(node, type)
    {
        this.breakpoints.push(new HTMLModule.Breakpoint(node, type));
        this.updateListeners();
    },

    matchBreakpoint: function(bp, args)
    {
        var node = args[0];
        var type = args[1];
        return (bp.node == node) && (!bp.type || bp.type == type);
    },

    removeBreakpoint: function(bp)
    {
        Arr.remove(this.breakpoints, bp);
        this.updateListeners();
    },

    hasEnabledBreakpoints: function()
    {
        return this.breakpoints.some(function(bp)
        {
            return bp.checked;
        });
    },

    updateListeners: function()
    {
        var htmlPanel = this.context.getPanel("html");
        htmlPanel.updateMutationBreakpointListeners();
    },

    // Persistence
    load: function(context)
    {
        var panelState = Persist.getPersistedState(context, "html");
        if (panelState.breakpoints)
            this.breakpoints = panelState.breakpoints;

        this.enumerateBreakpoints(function(bp)
        {
            var elts = Xpath.getElementsByXPath(context.window.document, bp.xpath);
            bp.node = elts && elts.length ? elts[0] : null;
        });

        this.updateListeners();
    },

    store: function(context)
    {
        this.enumerateBreakpoints(function(bp)
        {
            bp.node = null;
        });

        var panelState = Persist.getPersistedState(context, "html");
        panelState.breakpoints = this.breakpoints;
    },
});

function isAncestorIgnored(node)
{
    for (var parent = node; parent; parent = parent.parentNode)
    {
        if (Firebug.shouldIgnore(parent))
            return true;
    }

    return false;
}

// ********************************************************************************************* //
// Registration

// Backwards compatibility
HTMLModule.SourceText = HTMLReps.SourceText;
Firebug.HTMLModule = HTMLModule;

Firebug.registerModule(HTMLModule);
Firebug.registerRep(HTMLModule.BreakpointRep);

return HTMLModule;

// ********************************************************************************************* //
});
