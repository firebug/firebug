/* See license.txt for terms of usage */

define([
    "firebug/lib",
    "firebug/firebug",
    "firebug/domplate",
    "firebug/reps",
    "firebug/lib/locale",
    "firebug/lib/wrapper",
    "arch/tools",
    "firebug/lib/url",
    "firebug/lib/stackFrame",
],
function(FBL, Firebug, Domplate, FirebugReps, Locale, Wrapper, ToolsInterface, URL,
    StackFrame) {

// ************************************************************************************************
// Profiler

Firebug.Profiler = FBL.extend(Firebug.Module,
{
    dispatchName: "profiler",

    showContext: function(browser, context)
    {
        this.setEnabled(context);
    },

    onPanelEnable: function(panelName)
    {
        if (FBTrace.DBG_PROFILER)
            FBTrace.sysout("Profiler.onPanelEnable panelName: "+panelName+"\n");

        if (panelName == "console" || panelName == "script")
            this.setEnabled();
    },

    onPanelDisable: function(panelName)
    {
        if (FBTrace.DBG_PROFILER)
            FBTrace.sysout("Profiler.onPanelDisable panelName: "+panelName+"\n");

        if (panelName == "console" || panelName == "script")
            this.setEnabled();
    },

    setEnabled: function()
    {
        if (!Firebug.currentContext)
            return false;
        // TODO this should be a panel listener operation.

        // The profiler is available only if the Script panel and Console are enabled
        var scriptPanel = Firebug.currentContext.getPanel("script", true);
        var consolePanel = Firebug.currentContext.getPanel("console", true);
        var disabled = (scriptPanel && !scriptPanel.isEnabled()) || (consolePanel && !consolePanel.isEnabled());

        if (!disabled)
        {
            // The profiler is available only if the Debugger and Console are activated
            var debuggerTool = ToolsInterface.browser.getTool("script");
            var consoleTool = ToolsInterface.browser.getTool("console");
            disabled = (debuggerTool && !debuggerTool.getActive()) || (consoleTool && !consoleTool.getActive());
        }

        // Attributes must be modified on the <command> element. All toolbar buttons
        // and menuitems are hooked up to the command.
        Firebug.chrome.setGlobalAttribute("cmd_toggleProfiling", "disabled",
            disabled ? "true" : "false");

        // Update button's tooltip.
        var tooltipText = disabled ? Locale.$STR("ProfileButton.Disabled.Tooltip")
            : Locale.$STR("ProfileButton.Enabled.Tooltip");
        Firebug.chrome.setGlobalAttribute("cmd_toggleProfiling", "tooltiptext", tooltipText);
    },

    toggleProfiling: function(context)
    {
        if (FBL.fbs.profiling)
            this.stopProfiling(context);
        else
            this.startProfiling(context);
    },

    startProfiling: function(context, title)
    {
        FBL.fbs.startProfiling();

        Firebug.chrome.setGlobalAttribute("cmd_toggleProfiling", "checked", "true");

        var isCustomMessage = !!title;
        if (!isCustomMessage)
            title = Locale.$STR("ProfilerStarted");

        context.profileRow = this.logProfileRow(context, title);
        context.profileRow.customMessage = isCustomMessage ;
    },

    isProfiling: function()
    {
        return (Firebug.chrome.getGlobalAttribute("cmd_toggleProfiling", "checked") === "true")
    },

    stopProfiling: function(context, cancelReport)
    {
        var totalTime = FBL.fbs.stopProfiling();
        if (totalTime == -1)
            return;

        Firebug.chrome.setGlobalAttribute("cmd_toggleProfiling", "checked", "false");

        if (cancelReport)
            delete context.profileRow;
        else
            this.logProfileReport(context)
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    logProfileRow: function(context, title)
    {
        var row = Firebug.Console.openGroup(title, context, "profile",
            Firebug.Profiler.ProfileCaption, true, null, true);
        FBL.setClass(row, "profilerRunning");

        Firebug.Console.closeGroup(context, true);

        return row;
    },

    logProfileReport: function(context)
    {
        var calls = [];
        var totalCalls = 0;
        var totalTime = 0;

        var sourceFileMap = context.sourceFileMap;
        if (FBTrace.DBG_PROFILER)
        {
            for (url in sourceFileMap)
                FBTrace.sysout("logProfileReport: "+sourceFileMap[url]+"\n");
        }

        FBL.jsd.enumerateScripts({enumerateScript: function(script)
        {
            if (script.callCount)
            {
                if (!Firebug.filterSystemURLs || !URL.isSystemURL(script.fileName))
                {
                    var sourceLink = FBL.getSourceLinkForScript(script, context);
                    if (sourceLink && sourceLink.href in sourceFileMap)
                    {
                        var call = new ProfileCall(script, context, script.callCount, script.totalExecutionTime,
                                script.totalOwnExecutionTime, script.minExecutionTime, script.maxExecutionTime, sourceLink);
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

        FBL.removeClass(groupRow, "profilerRunning");

        if (totalCalls > 0)
        {
            var captionBox = groupRow.getElementsByClassName("profileCaption").item(0);
            if (!groupRow.customMessage)
                captionBox.textContent = Locale.$STR("Profile");
            var timeBox = groupRow.getElementsByClassName("profileTime").item(0);
            timeBox.textContent = Locale.$STRP("plural.Profile_Time2", [totalTime, totalCalls], 1);

            var groupBody = groupRow.lastChild;
            var sizer = Firebug.Profiler.ProfileTable.tag.replace({}, groupBody);
            var table = sizer.firstChild;
            var tHeader = table.lastChild;  // no rows inserted.

            var tag = Firebug.Profiler.ProfileCall.tag;
            var insert = tag.insertRows;

            for (var i = 0; i < calls.length; ++i) {
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
    }
});

// ************************************************************************************************

with (Domplate) {
Firebug.Profiler.ProfileTable = domplate(
{
    tag:
        DIV({"class": "profileSizer", "tabindex": "-1" },
            TABLE({"class": "profileTable", cellspacing: 0, cellpadding: 0, width: "100%", "role": "grid"},
                THEAD({"class": "profileThead", "role": "presentation"},
                    TR({"class": "headerRow focusRow profileRow subFocusRow", onclick: "$onClick", "role": "row"},
                        TH({"class": "headerCell alphaValue a11yFocus", "role": "columnheader"},
                            DIV({"class": "headerCellBox"},
                                Locale.$STR("Function")
                            )
                        ),
                        TH({"class": "headerCell a11yFocus" , "role": "columnheader"},
                            DIV({"class": "headerCellBox", title: Locale.$STR("CallsHeaderTooltip")},
                                Locale.$STR("Calls")
                            )
                        ),
                        TH({"class": "headerCell headerSorted a11yFocus", "role": "columnheader", "aria-sort": "descending"},
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
        var table = FBL.getAncestorByClass(event.target, "profileTable");
        var header = FBL.getAncestorByClass(event.target, "headerCell");
        if (!header)
            return;

        var numerical = !FBL.hasClass(header, "alphaValue");

        var colIndex = 0;
        for (header = header.previousSibling; header; header = header.previousSibling)
            ++colIndex;

        this.sort(table, colIndex, numerical);
    },

    sort: function(table, colIndex, numerical)
    {
        sortAscending = function()
        {
            FBL.removeClass(header, "sortedDescending");
            FBL.setClass(header, "sortedAscending");
            header.setAttribute("aria-sort", "ascending");

            header.sorted = -1;

            for (var i = 0; i < values.length; ++i)
                tbody.appendChild(values[i].row);
        },

        sortDescending = function()
        {
          FBL.removeClass(header, "sortedAscending");
          FBL.setClass(header, "sortedDescending");
          header.setAttribute("aria-sort", "descending")

          header.sorted = 1;

          for (var i = values.length-1; i >= 0; --i)
              tbody.appendChild(values[i].row);
        }

        var tbody = FBL.getChildByClass(table, "profileTbody");
        var thead = FBL.getChildByClass(table, "profileThead");

        var values = [];
        for (var row = tbody.childNodes[0]; row; row = row.nextSibling)
        {
            var cell = row.childNodes[colIndex];
            var value = numerical ? parseFloat(cell.textContent) : cell.textContent;
            values.push({row: row, value: value});
        }

        values.sort(function(a, b) { return a.value < b.value ? -1 : 1; });

        var headerRow = thead.firstChild;
        var headerSorted = FBL.getChildByClass(headerRow, "headerSorted");
        FBL.removeClass(headerSorted, "headerSorted");
        if (headerSorted)
            headerSorted.removeAttribute('aria-sort');

        var header = headerRow.childNodes[colIndex];
        FBL.setClass(header, "headerSorted");

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

// ************************************************************************************************

Firebug.Profiler.ProfileCaption = domplate(Firebug.Rep,
{
    tag:
        SPAN({"class": "profileTitle", "role": "status"},
            SPAN({"class": "profileCaption"}, "$object"),
            " ",
            SPAN({"class": "profileTime"}, "")
        )
});

// ************************************************************************************************

Firebug.Profiler.ProfileCall = domplate(Firebug.Rep,
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getCallName: function(call)
    {
        return FBL.cropString(StackFrame.getFunctionName(call.script, call.context), 60);
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

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

// ************************************************************************************************

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

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.Profiler);
Firebug.registerRep(Firebug.Profiler.ProfileCall);

return Firebug.Profiler;

// ************************************************************************************************
});
