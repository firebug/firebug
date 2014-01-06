/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/lib/persist",
    "firebug/chrome/rep",
    "firebug/debugger/breakpoints/breakpointGroup",
    "firebug/dom/domBreakpoint",
],
function(Firebug, FBTrace, Obj, Domplate, Locale, Events, Wrapper, Dom, Css, Str, Arr,
    Persist, Rep, BreakpointGroup, DOMBreakpoint) {

// ********************************************************************************************* //
// Constants

var {domplate, TAG, DIV, SPAN, TR, P, A, INPUT} = Domplate;

var Cc = Components.classes;
var Ci = Components.interfaces;

var Trace = FBTrace.to("DBG_DOM");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Breakpoint Group

function DOMBreakpointGroup()
{
    this.breakpoints = [];
}

/**
 * @object
 */
DOMBreakpointGroup.prototype = Obj.extend(new BreakpointGroup(),
/** @lends DOMBreakpointGroup */
{
    name: "domBreakpoints",
    title: Locale.$STR("dom.label.DOM Breakpoints"),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    addBreakpoint: function(object, propName, context)
    {
        Trace.sysout("dom.addBreakpoint; " + propName, object);

        var bp = new DOMBreakpoint(object, propName, context);
        if (bp.watchProperty());
            this.breakpoints.push(bp);
    },

    removeBreakpoint: function(object, propName)
    {
        var bp = this.findBreakpoint(object, propName);
        if (bp)
        {
            bp.unwatchProperty();
            Arr.remove(this.breakpoints, bp);
        }
    },

    matchBreakpoint: function(bp, args)
    {
        var object = args[0];
        var propName = args[1];

        // Make sure to unwrap objects for comparison (see issue 6934).
        var obj1 = Wrapper.unwrapObject(bp.object);
        var obj2 = Wrapper.unwrapObject(object);

        return obj1 == obj2 && bp.propName == propName;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Persistence

    load: function(context)
    {
        var panelState = Persist.getPersistedState(context, "dom");
        if (panelState.breakpoints)
            this.breakpoints = panelState.breakpoints;

        this.enumerateBreakpoints(function(bp)
        {
            try
            {
                var contentView = Wrapper.getContentView(context.window);
                bp.object = contentView[bp.objectPath];
                bp.context = context;
                bp.watchProperty();

                Trace.sysout("dom.DOMBreakpointGroup.load; " + bp.objectPath, bp);
            }
            catch (err)
            {
                TraceError.sysout("dom.DOMBreakpointGroup.load; ERROR " + bp.objectPath, err);
            }
        });
    },

    store: function(context)
    {
        this.enumerateBreakpoints(function(bp)
        {
            bp.object = null;
        });

        var panelState = Persist.getPersistedState(context, "dom");
        panelState.breakpoints = this.breakpoints;
    },
});

// ********************************************************************************************* //

var BreakpointRep = domplate(Rep,
{
    inspectable: false,

    tag:
        DIV({"class": "breakpointRow focusRow", $disabled: "$bp|isDisabled", _repObject: "$bp",
            role: "option", "aria-checked": "$bp.checked"},
            DIV({"class": "breakpointBlockHead"},
                INPUT({"class": "breakpointCheckbox", type: "checkbox",
                    _checked: "$bp.checked", tabindex: "-1", onclick: "$onEnable"}),
                SPAN({"class": "breakpointName"}, "$bp.propName"),
                SPAN({"class": "closeButton", onclick: "$onRemove"})
            ),
            DIV({"class": "breakpointCode"},
                TAG("$bp.object|getObjectTag", {object: "$bp.object"})
            )
        ),

    getObjectTag: function(object)
    {
        // I am uncertain about the Firebug.currentContext but I think we are
        // only here in panel code.
        var rep = Firebug.getRep(object, Firebug.currentContext);
        return rep.shortTag ? rep.shortTag : rep.tag;
    },

    isDisabled: function(bp)
    {
        return !bp.checked;
    },

    onRemove: function(event)
    {
        Events.cancelEvent(event);

        if (!Css.hasClass(event.target, "closeButton"))
            return;

        var bpPanel = Firebug.getElementPanel(event.target);
        var context = bpPanel.context;

        // Remove from list of breakpoints.
        var row = Dom.getAncestorByClass(event.target, "breakpointRow");
        var bp = row.repObject;
        context.dom.breakpoints.removeBreakpoint(bp.object, bp.propName);

        bpPanel.refresh();

        var domPanel = context.getPanel("dom", true);
        if (domPanel)
        {
            var domRow = findRow(domPanel.panelNode, bp.object, bp.propName);
            if (domRow)
            {
                domRow.removeAttribute("breakpoint");
                domRow.removeAttribute("disabledBreakpoint");
            }
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

        var domPanel = context.getPanel("dom", true);
        if (domPanel)
        {
            var row = findRow(domPanel.panelNode, bp.object, bp.propName);
            if (row)
                row.setAttribute("disabledBreakpoint", bp.checked ? "false" : "true");
        }
    },

    supportsObject: function(object, type)
    {
        return object instanceof DOMBreakpoint;
    }
});

// ********************************************************************************************* //
// Helpers

function findRow(parentNode, object, propName)
{
    var rows = parentNode.getElementsByClassName("memberRow");
    for (var i=0; i<rows.length; i++)
    {
        var row = rows[i];
        if (object == row.domObject.object && propName == row.domObject.name)
            return row;
    }

    return row;
}

// ********************************************************************************************* //
// Registration

Firebug.registerRep(BreakpointRep);

return DOMBreakpointGroup;

// ********************************************************************************************* //
});
