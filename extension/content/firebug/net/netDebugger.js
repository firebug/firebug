/* See license.txt for terms of usage */

define([
    "firebug/chrome/rep",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/array",
    "firebug/net/netUtils",
    "firebug/debugger/breakpoints/breakpointGroup",
],
function(Rep, Obj, Firebug, Domplate, Locale, Events, Url, Css, Dom, Arr, NetUtils,
    BreakpointGroup) {

// ********************************************************************************************* //
// Constants

var {domplate, DIV, SPAN, TR, P, A, INPUT} = Domplate;

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var panelName = "net";

// ********************************************************************************************* //
// Breakpoints

function NetBreakpointGroup()
{
    this.breakpoints = [];
}

NetBreakpointGroup.prototype = Obj.extend(new BreakpointGroup(),
{
    name: "netBreakpoints",
    title: Locale.$STR("net.label.XHR Breakpoints"),

    addBreakpoint: function(href)
    {
        this.breakpoints.push(new Breakpoint(href));
    },

    removeBreakpoint: function(href)
    {
        var bp = this.findBreakpoint(href);
        Arr.remove(this.breakpoints, bp);
    },

    matchBreakpoint: function(bp, args)
    {
        var href = args[0];
        return bp.href == href;
    }
});

// ********************************************************************************************* //

function Breakpoint(href)
{
    this.href = href;
    this.checked = true;
    this.condition = "";
    this.onEvaluateFails = Obj.bind(this.onEvaluateFails, this);
    this.onEvaluateSucceeds =  Obj.bind(this.onEvaluateSucceeds, this);
}

Breakpoint.prototype =
{
    evaluateCondition: function(context, file)
    {
        try
        {
            var scope = {};

            var params = file.urlParams;
            for (var i=0; params && i<params.length; i++)
            {
                var param = params[i];
                scope[param.name] = param.value;
            }

            scope["$postBody"] = NetUtils.getPostText(file, context);

            // The properties of scope are all strings; we pass them in then
            // unpack them using 'with'. The function is called immediately.
            var expr = "(function (){var scope = " + JSON.stringify(scope) +
                "; with (scope) { return  " + this.condition + ";}})();";

            // The callbacks will set this if the condition is true or if the eval faults.
            delete context.breakingCause;

            Firebug.CommandLine.evaluate(expr, context, null, context.window,
                this.onEvaluateSucceeds, this.onEvaluateFails );

            if (FBTrace.DBG_NET)
            {
                FBTrace.sysout("net.evaluateCondition", {expr: expr, scope: scope,
                    json: JSON.stringify(scope)});
            }

            return !!context.breakingCause;
        }
        catch (err)
        {
            if (FBTrace.DBG_NET)
                FBTrace.sysout("net.evaluateCondition; EXCEPTION "+err, err);
        }

        return false;
    },

    onEvaluateSucceeds: function(result, context)
    {
        // Don't break if the result is false.
        if (!result)
            return;

        context.breakingCause = {
            title: Locale.$STR("net.Break On XHR"),
            message: this.condition
        };
    },

    onEvaluateFails: function(result, context)
    {
        // Break if there is an error when evaluating the condition (to display the error).
        context.breakingCause = {
            title: Locale.$STR("net.Break On XHR"),
            message: "Breakpoint condition evaluation fails ",
            prevValue: this.condition,
            newValue:result
        };
    }
};

// ********************************************************************************************* //
// Breakpoint UI

var BreakpointRep = domplate(Rep,
{
    inspectable: false,

    tag:
        DIV({"class": "breakpointRow focusRow", $disabled: "$bp|isDisabled", _repObject: "$bp",
            role: "option", "aria-checked": "$bp.checked"},
            DIV({"class": "breakpointBlockHead"},
                INPUT({"class": "breakpointCheckbox", type: "checkbox",
                    _checked: "$bp.checked", tabindex: "-1", onclick: "$onEnable"}),
                SPAN({"class": "breakpointName", title: "$bp|getTitle"}, "$bp|getName"),
                SPAN({"class": "closeButton", onclick: "$onRemove"})
            ),
            DIV({"class": "breakpointCondition"},
                SPAN("$bp.condition")
            )
        ),

    getTitle: function(bp)
    {
        return bp.href;
    },

    getName: function(bp)
    {
        return Url.getFileName(bp.href);
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
        context.netProgress.breakpoints.removeBreakpoint(bp.href);

        bpPanel.refresh();

        var panel = context.getPanel(panelName, true);
        if (!panel)
            return;

        panel.enumerateRequests(function(file)
        {
            if (file.getFileURL() == bp.href)
            {
                file.row.removeAttribute("breakpoint");
                file.row.removeAttribute("disabledBreakpoint");
            }
        });
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

        var panel = context.getPanel(panelName, true);
        if (!panel)
            return;

        panel.enumerateRequests(function(file)
        {
            if (file.getFileURL() == bp.href)
                file.row.setAttribute("disabledBreakpoint", bp.checked ? "false" : "true");
        });
    },

    supportsObject: function(object, type)
    {
        return object instanceof Breakpoint;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerRep(BreakpointRep);

return {
    NetBreakpointGroup: NetBreakpointGroup
};

// ********************************************************************************************* //
});
