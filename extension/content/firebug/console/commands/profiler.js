/* See license.txt for terms of usage */

define([
    "firebug/chrome/module",
    "firebug/chrome/rep",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/wrapper",
    "firebug/lib/url",
    "firebug/js/stackFrame",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/js/fbs",
],
function(Module, Rep, Obj, Firebug, Domplate, FirebugReps, Locale, Wrapper, Url, StackFrame,
    Events, Css, Dom, Str, FBS) {

// ********************************************************************************************* //
// Constants

var {domplate, TAG, DIV, SPAN, TD, TR, TH, TABLE, THEAD, TBODY, P, UL, LI, A} = Domplate;

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Profiler

Firebug.Profiler = Obj.extend(Module,
{
    dispatchName: "profiler",

    profilerEnabled: false,

    initialize: function()
    {
        Firebug.connection.addListener(this);
    },

    shutdown: function()
    {
        Firebug.connection.removeListener(this);
    },

    showContext: function(browser, context)
    {
        this.setEnabled(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Activation

    showPanel: function(browser, panel)
    {
        if (FBTrace.DBG_PROFILER)
            FBTrace.sysout("Profiler.showPanel");
        this.setEnabled();
    },

    setEnabled: function()
    {
        var context = Firebug.currentContext;
        if (!context)
            return;

        // The profiler is available only if the Script panel and Console are enabled
        var enabled = context.isPanelEnabled("script") && context.isPanelEnabled("console");

        if (enabled)
        {
            // The profiler is available only if the Debugger is activated
            var debuggerTool = Firebug.connection.getTool("script");
            enabled = debuggerTool && debuggerTool.getActive();
        }

        this.profilerEnabled = enabled;

        if (!enabled && this.isProfiling())
            this.stopProfiling(context);

        // Attributes must be modified on the <command> element. All toolbar buttons
        // and menuitems are hooked up to the command.
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleProfiling", "disabled",
            enabled ? "false" : "true");

        // Update the button's tooltip.
        var tooltipText = Locale.$STR("ProfileButton.Tooltip");
        if (!enabled)
            tooltipText = Locale.$STRF("script.Script_panel_must_be_enabled", [tooltipText]);
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleProfiling", "tooltiptext", tooltipText);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onConsoleCleared: function(context)
    {
        if (this.isProfiling())
            this.stopProfiling(context, true);
    },

    onDebuggerEnabled: function()
    {
        this.setEnabled();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    toggleProfiling: function(context)
    {
        if (FBS.profiling)
            this.stopProfiling(context);
        else
            this.startProfiling(context);
    },

    startProfiling: function(context, title)
    {
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleProfiling", "checked", "true");

        if (FBS.profiling)
            return;

        FBS.startProfiling();

        var originalTitle = title;
        var isCustomMessage = !!title;
        if (!isCustomMessage)
            title = Locale.$STR("ProfilerStarted");

        context.profileRow = this.logProfileRow(context, title);
        context.profileRow.customMessage = isCustomMessage;
        context.profileRow.originalTitle = originalTitle;

        Events.dispatch(this.fbListeners, "startProfiling", [context, originalTitle]);
        Firebug.Console.addListener(this);
    },

    stopProfiling: function(context, cancelReport)
    {
        var totalTime = FBS.stopProfiling();
        if (totalTime == -1)
            return;

        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleProfiling", "checked", "false");

        if (cancelReport)
            delete context.profileRow;
        else
            this.logProfileReport(context, cancelReport);

        Firebug.Console.removeListener(this);

        // stopProfiling event fired within logProfileReport
    },

    isProfiling: function()
    {
        return (Firebug.chrome.getGlobalAttribute("cmd_firebug_toggleProfiling", "checked") === "true");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    logProfileRow: function(context, title)
    {
        var objects =
        {
            title: title
        };
        var row = Firebug.Console.openGroup(objects, context, "profile",
            Firebug.Profiler.ProfileCaption, true, null, true);
        Css.setClass(row, "profilerRunning");

        Firebug.Console.closeGroup(context, true);

        return row;
    },

    logProfileReport: function(context, cancelReport)
    {
        var calls = [];
        var totalCalls = 0;
        var totalTime = 0;

        var sourceFileMap = context.sourceFileMap;
        if (FBTrace.DBG_PROFILER)
        {
            for (var url in sourceFileMap)
                FBTrace.sysout("logProfileReport: "+sourceFileMap[url]+"\n");
        }

        var jsd = Cc["@mozilla.org/js/jsd/debugger-service;1"].getService(Ci.jsdIDebuggerService);
        jsd.enumerateScripts({enumerateScript: function(script)
        {
            if (script.callCount)
            {
                if (!Firebug.filterSystemURLs || !Url.isSystemURL(script.fileName))
                {
                    var sourceLink = Firebug.SourceFile.getSourceLinkForScript(script, context);
                    if (sourceLink && sourceLink.href in sourceFileMap)
                    {
                        var call = new ProfileCall(script, context, script.callCount,
                            script.totalExecutionTime, script.totalOwnExecutionTime,
                            script.minExecutionTime, script.maxExecutionTime, sourceLink);

                        calls.push(call);

                        totalCalls += script.callCount;
                        totalTime += script.totalOwnExecutionTime;
                    }
                }
                script.clearProfileData();
            }
        }});

        for (var i = 0; i < calls.length; ++i)
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
            var sizer = Firebug.Profiler.ProfileTable.tag.replace({}, groupBody);
            var table = sizer.firstChild;
            var tHeader = table.lastChild;  // no rows inserted.

            var tag = Firebug.Profiler.ProfileCall.tag;
            var insert = tag.insertRows;

            for (var i = 0; i < calls.length; ++i)
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
            Firebug.Console.logFormatted([msg], context, "warn");
            return;
        }
        Firebug.Profiler.startProfiling(context, title);
    },

    commandLineProfileEnd: function(context)
    {
        if (this.profilerEnabled)
            this.stopProfiling(context);
    }
});

// ********************************************************************************************* //

Firebug.Profiler.ProfileTable = domplate(
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
            ++colIndex;

        this.sort(table, colIndex, numerical);
    },

    sort: function(table, colIndex, numerical)
    {
        sortAscending = function()
        {
            Css.removeClass(header, "sortedDescending");
            Css.setClass(header, "sortedAscending");
            header.setAttribute("aria-sort", "ascending");

            header.sorted = -1;

            for (var i = 0; i < values.length; ++i)
                tbody.appendChild(values[i].row);
        },

        sortDescending = function()
        {
          Css.removeClass(header, "sortedAscending");
          Css.setClass(header, "sortedDescending");
          header.setAttribute("aria-sort", "descending");

          header.sorted = 1;

          for (var i = values.length-1; i >= 0; --i)
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
            {
                sortDescending();
            }
            else
            {
                sortAscending();
            }
        }
        else
        {
            if (!header.sorted || header.sorted == -1)
            {
                sortAscending();
            }
            else
            {
                sortDescending();
            }
        }
    }
});

// ********************************************************************************************* //

Firebug.Profiler.ProfileCaption = domplate(Rep,
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

Firebug.Profiler.ProfileCall = domplate(Rep,
{
    tag:
        TR({"class": "focusRow profileRow subFocusRow", "role": "row"},
            TD({"class": "profileCell", "role": "presentation"},
                FirebugReps.OBJECTLINK("$object|getCallName")
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
        return Str.cropString(StackFrame.getFunctionName(call.script, call.context), 60);
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

    className: "profile",

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
        try
        {
            var fn = StackFrame.getFunctionName(call.script, call.context);
            return FirebugReps.Func.getTooltip(fn, call.context);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("profiler.getTooltip FAILS ", exc);
        }
    },

    getContextMenuItems: function(call, target, context)
    {
        var fn = Wrapper.unwrapIValue(call.script.functionObject);
        return FirebugReps.Func.getContextMenuItems(fn, call.script, context);
    }
});

// ********************************************************************************************* //

function ProfileCall(script, context, callCount, totalTime, totalOwnTime, minTime, maxTime, sourceLink)
{
    this.script = script;
    this.context = context;
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
    Firebug.Profiler.commandLineProfileStart(context, title);
    return Firebug.Console.getDefaultReturnValue();
};

function profileEnd(context)
{
    Firebug.Profiler.commandLineProfileEnd(context);
    return Firebug.Console.getDefaultReturnValue();
};

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.Profiler);
Firebug.registerRep(Firebug.Profiler.ProfileCall);

Firebug.registerCommand("profile", {
    handler: profile.bind(this),
    helpUrl: "http://getfirebug.com/wiki/index.php/profile",
    description: Locale.$STR("console.cmd.help.profile")
});

Firebug.registerCommand("profileEnd", {
    handler: profileEnd.bind(this),
    helpUrl: "http://getfirebug.com/wiki/index.php/profileEnd",
    description: Locale.$STR("console.cmd.help.profileEnd")
});

return Firebug.Profiler;

// ********************************************************************************************* //
});
