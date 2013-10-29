/* See license.txt for terms of usage */

define([
    "firebug/chrome/rep",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/lib/persist",
],
function(Rep, Obj, Firebug, Domplate, Locale, Events, Wrapper, Dom, Css, Str, Arr, Persist) {

// ********************************************************************************************* //
// Constants

var {domplate, TAG, DIV, SPAN, TR, P, A, INPUT} = Domplate;

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Breakpoint Group

function DOMBreakpointGroup()
{
    this.breakpoints = [];
}

DOMBreakpointGroup.prototype = Obj.extend(new Firebug.Breakpoint.BreakpointGroup(),
{
    name: "domBreakpoints",
    title: Locale.$STR("dom.label.DOM Breakpoints"),

    addBreakpoint: function(object, propName, panel, row)
    {
        var path = panel.getPropertyPath(row);
        path.pop();

        // We don't want the last dot.
        if (path.length > 0 && path[path.length-1] == ".")
            path.pop();

        var objectPath = path.join("");
        if (FBTrace.DBG_DOM)
            FBTrace.sysout("dom.addBreakpoint; " + objectPath, path);

        var bp = new Breakpoint(object, propName, objectPath, panel.context);
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
        return bp.object == object && bp.propName == propName;
    },

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

                if (FBTrace.DBG_DOM)
                    FBTrace.sysout("dom.DOMBreakpointGroup.load; " + bp.objectPath, bp);
            }
            catch (err)
            {
                if (FBTrace.DBG_ERROR || FBTrace.DBG_DOM)
                    FBTrace.sysout("dom.DOMBreakpointGroup.load; ERROR " + bp.objectPath, err);
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

function Breakpoint(object, propName, objectPath, context)
{
    this.context = context;
    this.propName = propName;
    this.objectPath = objectPath;
    this.object = object;
    this.checked = true;
}

Breakpoint.prototype =
{
    watchProperty: function()
    {
        if (FBTrace.DBG_DOM)
            FBTrace.sysout("dom.watch; property: " + this.propName);

        if (!this.object)
            return;

        try
        {
            var self = this;
            this.object.watch(this.propName, function handler(prop, oldval, newval)
            {
                // XXXjjb Beware: in playing with this feature I hit too much recursion
                // multiple times with console.log
                // TODO Do something cute in the UI with the error bubble thing
                if (self.checked)
                {
                    self.context.breakingCause = {
                        title: Locale.$STR("dom.Break On Property"),
                        message: Str.cropString(prop, 200),
                        prevValue: oldval,
                        newValue: newval
                    };

                    Firebug.Breakpoint.breakNow(self.context.getPanel("dom"));
                }
                return newval;
            });
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("dom.watch; object FAILS " + exc, exc);
            return false;
        }

        return true;
    },

    unwatchProperty: function()
    {
        if (FBTrace.DBG_DOM)
            FBTrace.sysout("dom.unwatch; property: " + this.propName, this.object);

        if (!this.object)
            return;

        try
        {
            this.object.unwatch(this.propName);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("dom.unwatch; object FAILS " + exc, exc);
        }
    }
};

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
        return object instanceof Breakpoint;
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
