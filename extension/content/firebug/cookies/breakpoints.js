/* See license.txt for terms of usage */

define([
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/cookies/cookieUtils",
],
function(Locale, Str, CookieUtils) {

// ********************************************************************************************* //

var Breakpoints =
{
    breakOnCookie: function(context, cookie, action)
    {
        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.breakOnCookie; " + action);

        var halt = false;
        var conditionIsFalse = false;

        // If there is an enabled breakpoint with condition:
        // 1) break if the condition is evaluated to true.
        var bp = context.cookies.breakpoints.findBreakpoint(CookieUtils.makeCookieObject(cookie));
        if (bp && bp.checked)
        {
            halt = true;
            if (bp.condition)
            {
                halt = bp.evaluateCondition(context, cookie);
                conditionIsFalse = !halt;
            }
        }

        // 2) If break on next flag is set and there is no condition evaluated to false,
        // break with "break on next" breaking cause (this new breaking cause can override
        // an existing one that is set when evaluating a breakpoint condition).
        if (context.breakOnCookie && !conditionIsFalse)
        {
            context.breakingCause = {
                title: Locale.$STR("firecookie.Break On Cookie"),
                message: Str.cropString(unescape(cookie.name + "; " + cookie.value), 200)
            };
            halt = true;
        }

        // Ignore if there is no reason to break.
        if (!halt)
            return;

        // Even if the execution was stopped at breakpoint reset the global
        // breakOnCookie flag.
        context.breakOnCookie = false;

        this.breakNow(context);

        // Clear breakpoint associated with removed cookie.
        if (action == "deleted")
        {
            breakpoints.removeBreakpoint(bp);
            context.invalidatePanels("breakpoints");
        }
    },

    breakNow: function(context)
    {
        if (Firebug.Breakpoint && Firebug.Breakpoint.updatePanelTab)
        {
            var panel = context.getPanel(panelName, true);
            Firebug.Breakpoint.updatePanelTab(panel, false);

            // Don't utilize Firebug.Breakpoint.breakNow since the code doesn't
            // exclude firecookie files from the stack (chrome://firecookie/)
            // Firebug.Debugger.breakNowURLPrefix must be changed to: "chrome://",
            //Firebug.Breakpoint.breakNow(context.getPanel(panelName, true));
            //return;
        }

        Firebug.Debugger.halt(function(frame)
        {
            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.breakNow; debugger halted");

            for (; frame && frame.isValid; frame = frame.callingFrame)
            {
                var fileName = frame.script.fileName;
                if (fileName &&
                    fileName.indexOf("chrome://firebug/") != 0 &&
                    fileName.indexOf("chrome://firecookie/") != 0 &&
                    fileName.indexOf("/components/firebug-") == -1 &&
                    fileName.indexOf("/modules/firebug-") == -1)
                    break;
            }

            if (frame)
            {
                Firebug.Debugger.breakContext = context;
                Firebug.Debugger.onBreak(frame, 3);
            }
            else
            {
                if (FBTrace.DBG_COOKIES)
                    FBTrace.sysout("cookies.breakNow; NO FRAME");
            }
        });
    },

    getContextMenuItems: function(cookie, target, context)
    {
        // Firebug 1.5 is needed for breakpoint support.
        if (!Firebug.Breakpoint)
            return;

        var items = [];
        items.push("-");

        var cookieName = Str.cropString(cookie.cookie.name, 40);
        var bp = context.cookies.breakpoints.findBreakpoint(cookie.cookie);

        items.push({
            nol10n: true,
            tooltiptext: Locale.$STRF("firecookie.menu.tooltip.Break On Cookie", [cookieName]),
            label: Locale.$STRF("firecookie.menu.Break On Cookie", [cookieName]),
            type: "checkbox",
            checked: bp != null,
            command: Obj.bindFixed(this.onBreakOnCookie, this, context, cookie),
        });

        if (bp)
        {
            items.push(
                {label: "firecookie.menu.Edit Breakpoint Condition",
                    command: Obj.bindFixed(this.editBreakpointCondition, this, context, cookie) }
            );
        }

        return items;
    },

    onBreakOnCookie: function(context, cookie)
    {
        // Support for breakpoints needs Firebug 1.5
        if (!Firebug.Breakpoint)
        {
            if (FBTrace.DBG_COOKIES || FBTrace.DBG_ERRORS)
                FBTrace.sysout("cookies.breakOnCookie; You need Firebug 1.5 to create a breakpoint");
            return;
        }

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.breakOnCookie; ", context);

        var breakpoints = context.cookies.breakpoints;

        // Remove an existing or create a new breakpoint.
        var row = cookie.row;
        cookie = cookie.cookie;
        var bp = breakpoints.findBreakpoint(cookie);
        if (bp)
        {
            breakpoints.removeBreakpoint(cookie);
            row.removeAttribute("breakpoint");
            row.removeAttribute("disabledBreakpoint");
        }
        else
        {
            breakpoints.addBreakpoint(cookie);
            row.setAttribute("breakpoint", "true");
        }
    },

    updateBreakpoint: function(context, cookie)
    {
        // Make sure a breakpoint is displayed.
        var bp = context.cookies.breakpoints.findBreakpoint(cookie.cookie)
        if (!bp)
            return;

        var row = cookie.row;
        row.setAttribute("breakpoint", "true");
        row.setAttribute("disabledBreakpoint", bp.checked ? "false" : "true");
    },

    onContextMenu: function(context, event)
    {
        if (!Css.hasClass(event.target, "sourceLine"))
            return;

        var row = Dom.getAncestorByClass(event.target, "cookieRow");
        if (!row)
            return;

        var cookie = row.repObject;
        var bp = context.cookies.breakpoints.findBreakpoint(cookie.cookie);
        if (!bp)
            return;

        this.editBreakpointCondition(context, cookie);
        Events.cancelEvent(event);
    },

    editBreakpointCondition: function(context, cookie)
    {
        var bp = context.cookies.breakpoints.findBreakpoint(cookie.cookie);
        if (!bp)
            return;

        var condition = bp ? bp.condition : "";

        var panel = context.getPanel(panelName);
        panel.selectedSourceBox = cookie.row;
        Firebug.Editor.startEditing(cookie.row, condition);
    },
}

// ********************************************************************************************* //

return Breakpoints;

// ********************************************************************************************* //
});
