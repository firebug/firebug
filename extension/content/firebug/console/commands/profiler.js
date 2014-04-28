/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/url",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/options",
    "firebug/lib/string",
    "firebug/chrome/reps",
    "firebug/chrome/module",
    "firebug/chrome/rep",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/script/sourceFile",
    "firebug/console/profilerEngine",
    "firebug/console/console",
    "firebug/remoting/debuggerClient",
],
function(Firebug, FBTrace, Obj, Domplate, Locale, Url, Events, Css, Dom, Options, Str,
    FirebugReps, Module, Rep, StackFrame, SourceFile, ProfilerEngine, Console,
    DebuggerClient) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, TAG, DIV, SPAN, TD, TR, TH, TABLE, THEAD, TBODY, P, UL, LI, A} = Domplate;

var Trace = FBTrace.to("DBG_PROFILER");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Profiler

/**
 * @module The module implements profiling feature. Its implementation is based on
 * {@link ProfilerEngine} that uses JSD2 Debugger API too hook function calls.
 * The Script panel must be enabled in order to use the Profiler.
 *
 * xxxHonza: some logic related to profiling is in ConsolePanel and ConsoleExposed modules.
 * It should be moved here, so the entire profiler implementation is embedded in one module.
 */
var Profiler = Obj.extend(Module,
/** @lends Profiler */
{
    dispatchName: "profiler",

    profilerEnabled: false,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        Firebug.connection.addListener(this);
        DebuggerClient.addListener(this);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);

        Firebug.connection.removeListener(this);
        DebuggerClient.removeListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    showContext: function(browser, context)
    {
        this.setEnabled(context);
    },

    showPanel: function(browser, panel)
    {
        Trace.sysout("Profiler.showPanel; panel: " + (panel ? panel.name : "null"));

        // The panel is null if disabled. But, if the Console panel is disabled we don't
        // have to update the button.
        if (!panel)
            return;

        this.setEnabled(panel.context);
    },

    setEnabled: function(context)
    {
        if (context)
        {
            // The profiler is available only if:
            // 1) The Console panel is enabled
            // 2) The Script panel is enabled
            // 3) The thread actor is attached
            var console = context.isPanelEnabled("console");
            var script = context.isPanelEnabled("script");
            var enabled = console && script && context.activeThread;

            this.profilerEnabled = console && script && context.activeThread;
        }
        else
        {
            // If there is no current context, just disable the profiler.
            this.profilerEnabled = false;
        }

        if (!this.profilerEnabled && this.isProfiling())
            this.stopProfiling(context);

        // Attributes must be modified on the <command> element. All toolbar buttons
        // and menuitems are hooked up to the command.
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleProfiling", "disabled",
            this.profilerEnabled ? "false" : "true");

        // Update the button's tooltip.
        var tooltipText = Locale.$STR("ProfileButton.Tooltip");

        // If the Script panel needs to be enabled modify the tooltip to inform the user.
        if (!this.profilerEnabled)
            tooltipText = Locale.$STRF("script.Script_panel_must_be_enabled", [tooltipText]);

        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleProfiling",
            "tooltiptext", tooltipText);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onConsoleCleared: function(context)
    {
        if (this.isProfiling())
            this.stopProfiling(context, true);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerClient Events

    onThreadAttached: function(context, reload)
    {
        Trace.sysout("profiler.onThreadAttached; reload: " + reload);

        this.setEnabled(context);
    },

    onThreadDetached: function(context)
    {
        Trace.sysout("profiler.onThreadDetached;");

        if (this.isProfiling())
            this.stopProfiling(context, true);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    toggleProfiling: function(context)
    {
        if (context.profiling)
            this.stopProfiling(context);
        else
            this.startProfiling(context);
    },

    startProfiling: function(context, title)
    {
        if (context.profiling)
            return;

        context.profiling = new ProfilerEngine(context);
        context.profiling.startProfiling();

        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleProfiling", "checked", "true");

        var originalTitle = title;
        var isCustomMessage = !!title;
        if (!isCustomMessage)
            title = Locale.$STR("ProfilerStarted");

        context.profileRow = this.logProfileRow(context, title);
        context.profileRow.customMessage = isCustomMessage;
        context.profileRow.originalTitle = originalTitle;

        Events.dispatch(this.fbListeners, "startProfiling", [context, originalTitle]);
        Console.addListener(this);
    },

    stopProfiling: function(context, cancelReport)
    {
        if (!context.profiling)
            return;

        var totalTime = context.profiling.stopProfiling();

        // If totalTime != -1 then it contains total time of the profiling session
        // (from start to end of the first executed stack frame).
        if (totalTime == -1)
            return;

        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleProfiling", "checked", "false");

        if (cancelReport)
            delete context.profileRow;
        else
            this.logProfileReport(context, cancelReport);

        Console.removeListener(this);

        // stopProfiling event fired within logProfileReport
        delete context.profiling;
    },

    isProfiling: function()
    {
        // xxxHonza: the return value should be: context.profiling != null
        return (Firebug.chrome.getGlobalAttribute("cmd_firebug_toggleProfiling", "checked") === "true");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    logProfileRow: function(context, title)
    {
        var objects =
        {
            title: title
        };

        var row = Console.openGroup(objects, context, "profile",
            Profiler.ProfileCaption, true, null, true);

        Css.setClass(row, "profilerRunning");

        Console.closeGroup(context, true);

        return row;
    },

    logProfileReport: function(context, cancelReport)
    {
        var calls = [];
        var totalCalls = 0;
        var totalTime = 0;

        context.profiling.enumerateScripts({enumerateScript: function(script)
        {
            if (!script.callCount)
                return;

            var fileName = Url.getFileName(script.url);
            if (Options.get("filterSystemURLs") && Url.isSystemURL(fileName))
                return;

            var sourceLink = SourceFile.getSourceLinkForScript(script, context);
            if (sourceLink && context.getSourceFile(sourceLink.href))
            {
                var call = new ProfileCall(script, context, script.funcName,
                    script.callCount, script.totalExecutionTime,
                    script.totalOwnExecutionTime, script.minExecutionTime,
                    script.maxExecutionTime, sourceLink);

                calls.push(call);

                totalCalls += script.callCount;
                totalTime += script.totalOwnExecutionTime;
            }
        }});

        for (var i = 0; i < calls.length; i++)
            calls[i].percent = Math.round((calls[i].totalOwnTime/totalTime) * 100 * 100) / 100;

        calls.sort(function(a, b)
        {
            return a.totalOwnTime < b.totalOwnTime ? 1 : -1;
        });

        totalTime = Math.round(totalTime * 1000) / 1000;

        var groupRow = context.profileRow && context.profileRow.ownerDocument
            ? context.profileRow
            : this.logProfileRow(context, "");

        delete context.profileRow;

        Css.removeClass(groupRow, "profilerRunning");

        if (totalCalls > 0)
        {
            var captionBox = groupRow.getElementsByClassName("profileCaption").item(0);
            if (!groupRow.customMessage)
                captionBox.textContent = Locale.$STR("Profile");

            var timeBox = groupRow.getElementsByClassName("profileTime").item(0);
            timeBox.textContent = Locale.$STRP("plural.Profile_Time2", [totalTime, totalCalls], 1);

            var groupBody = groupRow.getElementsByClassName("logGroupBody")[0];
            var sizer = Profiler.ProfileTable.tag.replace({}, groupBody);
            var table = sizer.firstChild;
            var tHeader = table.lastChild;  // no rows inserted.

            var tag = Profiler.ProfileCall.tag;
            var insert = tag.insertRows;

            for (var i = 0; i < calls.length; i++)
            {
                calls[i].index = i;
                context.throttle(insert, tag, [{object: calls[i]}, tHeader]);
            }

            context.throttle(groupRow.scrollIntoView, groupRow, []);
        }
        else
        {
            var captionBox = groupRow.getElementsByClassName("profileCaption").item(0);
            captionBox.textContent = Locale.$STR("NothingToProfile");
        }

        Events.dispatch(this.fbListeners, "stopProfiling", [context,
            groupRow.originalTitle, calls, cancelReport]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    commandLineProfileStart: function(context, title)
    {
        if (!this.profilerEnabled)
        {
            var msg = Locale.$STR("ProfilerRequiresTheScriptPanel");
            Console.logFormatted([msg], context, "warn");
            return;
        }

        Profiler.startProfiling(context, title);
    },

    commandLineProfileEnd: function(context)
    {
        if (this.profilerEnabled)
            this.stopProfiling(context);
    }
});

// ********************************************************************************************* //
// Domplate Templates

Profiler.ProfileTable = domplate(
{
    tag:
        DIV({"class": "profileSizer", "tabindex": "-1" },
            TABLE({"class": "profileTable", cellspacing: 0, cellpadding: 0, width: "100%",
                "role": "grid"},
                THEAD({"class": "profileThead", "role": "presentation"},
                    TR({"class": "headerRow focusRow profileRow subFocusRow", onclick: "$onClick",
                        "role": "row"},
                        TH({"class": "headerCell alphaValue a11yFocus", "role": "columnheader"},
                            DIV({"class": "headerCellBox"},
                                Locale.$STR("Function")
                            )
                        ),
                        TH({"class": "headerCell a11yFocus", "role": "columnheader"},
                            DIV({"class": "headerCellBox", title: Locale.$STR("CallsHeaderTooltip")},
                                Locale.$STR("Calls")
                            )
                        ),
                        TH({"class": "headerCell headerSorted a11yFocus", "role": "columnheader",
                            "aria-sort": "descending"},
                            DIV({"class": "headerCellBox", title: Locale.$STR("PercentTooltip")},
                                Locale.$STR("Percent")
                            )
                        ),
                        TH({"class": "headerCell a11yFocus", "role": "columnheader"},
                            DIV({"class": "headerCellBox", title: Locale.$STR("OwnTimeHeaderTooltip")},
                                Locale.$STR("OwnTime")
                            )
                        ),
                        TH({"class": "headerCell a11yFocus", "role": "columnheader"},
                            DIV({"class": "headerCellBox", title: Locale.$STR("TimeHeaderTooltip")},
                                Locale.$STR("Time")
                            )
                        ),
                        TH({"class": "headerCell a11yFocus", "role": "columnheader"},
                            DIV({"class": "headerCellBox", title: Locale.$STR("AvgHeaderTooltip")},
                                Locale.$STR("Avg")
                            )
                        ),
                        TH({"class": "headerCell a11yFocus", "role": "columnheader"},
                            DIV({"class": "headerCellBox", title: Locale.$STR("MinHeaderTooltip")},
                                Locale.$STR("Min")
                            )
                        ),
                        TH({"class": "headerCell a11yFocus", "role": "columnheader"},
                            DIV({"class": "headerCellBox", title: Locale.$STR("MaxHeaderTooltip")},
                                Locale.$STR("Max")
                            )
                        ),
                        TH({"class": "headerCell alphaValue a11yFocus", "role": "columnheader"},
                            DIV({"class": "headerCellBox"},
                                Locale.$STR("File")
                            )
                        )
                    )
                ),
                TBODY({"class": "profileTbody", "role": "presentation"})
            )
        ),

    onClick: function(event)
    {
        var table = Dom.getAncestorByClass(event.target, "profileTable");
        var header = Dom.getAncestorByClass(event.target, "headerCell");
        if (!header)
            return;

        var numerical = !Css.hasClass(header, "alphaValue");

        var colIndex = 0;
        for (header = header.previousSibling; header; header = header.previousSibling)
            colIndex++;

        this.sort(table, colIndex, numerical);
    },

    sort: function(table, colIndex, numerical)
    {
        var sortAscending = function()
        {
            Css.removeClass(header, "sortedDescending");
            Css.setClass(header, "sortedAscending");
            header.setAttribute("aria-sort", "ascending");

            header.sorted = -1;

            for (var i = 0; i < values.length; i++)
                tbody.appendChild(values[i].row);
        };

        var sortDescending = function()
        {
          Css.removeClass(header, "sortedAscending");
          Css.setClass(header, "sortedDescending");
          header.setAttribute("aria-sort", "descending");

          header.sorted = 1;

          for (var i = values.length-1; i >= 0; i--)
              tbody.appendChild(values[i].row);
        };

        var tbody = Dom.getChildByClass(table, "profileTbody");
        var thead = Dom.getChildByClass(table, "profileThead");

        var values = [];
        for (var row = tbody.childNodes[0]; row; row = row.nextSibling)
        {
            var cell = row.childNodes[colIndex];
            var value = numerical ? parseFloat(cell.textContent) : cell.textContent;
            values.push({row: row, value: value});
        }

        values.sort(function(a, b) { return a.value < b.value ? -1 : 1; });

        var headerRow = thead.firstChild;
        var headerSorted = Dom.getChildByClass(headerRow, "headerSorted");
        Css.removeClass(headerSorted, "headerSorted");
        if (headerSorted)
            headerSorted.removeAttribute('aria-sort');

        var header = headerRow.childNodes[colIndex];
        Css.setClass(header, "headerSorted");

        if (numerical)
        {
            if (!header.sorted || header.sorted == -1)
                sortDescending();
            else
                sortAscending();
        }
        else
        {
            if (!header.sorted || header.sorted == -1)
                sortAscending();
            else
                sortDescending();
        }
    }
});

// ********************************************************************************************* //

Profiler.ProfileCaption = domplate(Rep,
{
    tag:
        SPAN({"class": "profileTitle", "role": "status"},
            SPAN({"class": "profileCaption"}, "$object.title"),
            " ",
            SPAN({"class": "profileTime"}, "")
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    groupable: false
});

// ********************************************************************************************* //

Profiler.ProfileCall = domplate(Rep,
{
    className: "profile",
    inspectable: false,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    tag:
        TR({"class": "focusRow profileRow subFocusRow", "role": "row"},
            TD({"class": "profileCell", "role": "presentation"},
                Rep.tags.OBJECTLINK("$object|getCallName")
            ),
            TD({"class": "a11yFocus profileCell", "role": "gridcell"}, "$object.callCount"),
            TD({"class": "a11yFocus profileCell", "role": "gridcell"}, "$object.percent%"),
            TD({"class": "a11yFocus profileCell", "role": "gridcell"}, "$object.totalOwnTime|roundTime\\ms"),
            TD({"class": "a11yFocus profileCell", "role": "gridcell"}, "$object.totalTime|roundTime\\ms"),
            TD({"class": "a11yFocus profileCell", "role": "gridcell"}, "$object|avgTime|roundTime\\ms"),
            TD({"class": "a11yFocus profileCell", "role": "gridcell"}, "$object.minTime|roundTime\\ms"),
            TD({"class": "a11yFocus profileCell", "role": "gridcell"}, "$object.maxTime|roundTime\\ms"),
            TD({"class": "linkCell profileCell", "role": "presentation"},
                TAG(FirebugReps.SourceLink.tag, {object: "$object|getSourceLink"})
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getCallName: function(call)
    {
        return Str.cropString(call.funcName, 60);
    },

    avgTime: function(call)
    {
        return call.totalTime / call.callCount;
    },

    getSourceLink: function(call)
    {
        return call.sourceLink;
    },

    roundTime: function(ms)
    {
        return Math.round(ms * 1000) / 1000;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    supportsObject: function(object, type)
    {
        return object instanceof ProfileCall;
    },

    inspectObject: function(call, context)
    {
        var sourceLink = this.getSourceLink(call);
        Firebug.chrome.select(sourceLink);
    },

    getTooltip: function(call)
    {
        return FirebugReps.Func.getTooltipForScript(call.script);
    },

    getContextMenuItems: function(call, target, context)
    {
        return FirebugReps.Func.getScriptContextMenuItems(context, call.script, call.funcName);
    }
});

// ********************************************************************************************* //

function ProfileCall(script, context, funcName, callCount, totalTime, totalOwnTime, minTime,
    maxTime, sourceLink)
{
    this.script = script;
    this.context = context;
    this.funcName = funcName;
    this.callCount = callCount;
    this.totalTime = totalTime;
    this.totalOwnTime = totalOwnTime;
    this.minTime = minTime;
    this.maxTime = maxTime;
    this.sourceLink = sourceLink;
}

// ********************************************************************************************* //
// CommandLine Support

function profile(context, args)
{
    var title = args[0];
    Profiler.commandLineProfileStart(context, title);
    return Console.getDefaultReturnValue();
};

function profileEnd(context)
{
    Profiler.commandLineProfileEnd(context);
    return Console.getDefaultReturnValue();
};

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Profiler);
Firebug.registerRep(Profiler.ProfileCall);

Firebug.registerCommand("profile", {
    handler: profile.bind(this),
    helpUrl: "https://getfirebug.com/wiki/index.php/profile",
    description: Locale.$STR("console.cmd.help.profile")
});

Firebug.registerCommand("profileEnd", {
    handler: profileEnd.bind(this),
    helpUrl: "https://getfirebug.com/wiki/index.php/profileEnd",
    description: Locale.$STR("console.cmd.help.profileEnd")
});

// Expose for XUL
Firebug.Profiler = Profiler;

return Profiler;

// ********************************************************************************************* //
});
