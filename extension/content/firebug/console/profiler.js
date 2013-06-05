/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/trace",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/wrapper",
    "firebug/lib/url",
    "firebug/debugger/stack/stackFrame",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/console/profilerEngine",
],
function(Obj, FBTrace, Firebug, Domplate, FirebugReps, Locale, Wrapper, Url, StackFrame, Events,
    Css, Dom, Str, ProfilerEngine) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var Trace = FBTrace.to("DBG_PROFILER");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Profiler

var Profiler = Obj.extend(Firebug.Module,
{
    dispatchName: "profiler",

    showContext: function(browser, context)
    {
        this.setEnabled();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Activation

    onPanelEnable: function(panelName)
    {
        Trace.sysout("Profiler.onPanelEnable panelName: " + panelName);

        if (panelName == "console")
            this.setEnabled();
    },

    onPanelDisable: function(panelName)
    {
        Trace.sysout("Profiler.onPanelDisable panelName: " + panelName);

        if (panelName == "console")
            this.setEnabled();
    },

    setEnabled: function()
    {
        // xxxHonza: using global context is a hack
        if (!Firebug.currentContext)
            return false;

        // TODO this should be a panel listener operation.

        // The profiler is available only if the Console is enabled
        var consolePanel = Firebug.currentContext.getPanel("console", true);
        var disabled = (consolePanel && !consolePanel.isEnabled());

        // Attributes must be modified on the <command> element. All toolbar buttons
        // and menuitems are hooked up to the command.
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleProfiling", "disabled",
            disabled ? "true" : "false");

        // Update button's tooltip.
        var tooltipText = disabled ? Locale.$STR("ProfileButton.Disabled.Tooltip2")
            : Locale.$STR("ProfileButton.Enabled.Tooltip");

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

    toggleProfiling: function(context)
    {
        if (context.profiling)
            this.stopProfiling(context);
        else
            this.startProfiling(context);
    },

    startProfiling: function(context, title)
    {
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
        Firebug.Console.addListener(this);
    },

    stopProfiling: function(context, cancelReport)
    {
        if (!context.profiling)
            return;

        var totalTime = context.profiling.stopProfiling();
        if (totalTime == -1)
            return;

        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleProfiling", "checked", "false");

        if (cancelReport)
            delete context.profileRow;
        else
            this.logProfileReport(context, cancelReport, totalTime);

        Firebug.Console.removeListener(this);

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
        var now = new Date().toISOString();
        var objects =
        {
            getId: function() { return title + now; },
            title: title
        };
        var row = Firebug.Console.openGroup(objects, context, "profile",
            Profiler.ProfileCaption, true, null, true);
        Css.setClass(row, "profilerRunning");

        Firebug.Console.closeGroup(context, true);

        return row;
    },

    logProfileReport: function(context, cancelReport, totalTime)
    {
        var calls = [];
        var totalCalls = 0;

        var sourceFileMap = context.sourceFileMap;
        if (FBTrace.DBG_PROFILER)
        {
            for (var url in sourceFileMap)
                FBTrace.sysout("logProfileReport: " + sourceFileMap[url]);
        }

        context.profiling.enumerateScripts({enumerateScript: function(script)
        {
            if (script.callCount)
            {
                if (!Firebug.filterSystemURLs || !Url.isSystemURL(script.fileName))
                {
                    var sourceLink = Firebug.SourceFile.toSourceLink(script, context);
                    if (sourceLink && sourceLink.href in sourceFileMap)
                    {
                        var call = new ProfileCall(script, context, script.funcName,
                            script.callCount, script.totalExecutionTime,
                            script.totalOwnExecutionTime, script.minExecutionTime,
                            script.maxExecutionTime, sourceLink);

                        calls.push(call);

                        totalCalls += script.callCount;
                    }
                }
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
            var sizer = Profiler.ProfileTable.tag.replace({}, groupBody);
            var table = sizer.firstChild;
            var tHeader = table.lastChild;  // no rows inserted.

            var tag = Profiler.ProfileCall.tag;
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
    }
});

// ********************************************************************************************* //
// Domplate Templates

with (Domplate) {
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

Profiler.ProfileCaption = domplate(Firebug.Rep,
{
    tag:
        SPAN({"class": "profileTitle", "role": "status"},
            SPAN({"class": "profileCaption"}, "$object.title"),
            " ",
            SPAN({"class": "profileTime"}, "")
        )
});

// ********************************************************************************************* //

Profiler.ProfileCall = domplate(Firebug.Rep,
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

} // END Domplate

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
    Profiler.startProfiling(context, title);
    return Firebug.Console.getDefaultReturnValue();
};

function profileEnd(context)
{
    Profiler.stopProfiling(context);
    return Firebug.Console.getDefaultReturnValue();
};

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Profiler);
Firebug.registerRep(Profiler.ProfileCall);

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

// Expose for XUL
Firebug.Profiler = Profiler;

return Profiler;

// ********************************************************************************************* //
});
