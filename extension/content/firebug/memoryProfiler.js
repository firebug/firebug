/* See license.txt for terms of usage */

FBL.ns(function() {

// ********************************************************************************************* //

var Cc = Components.classes;
var Ci = Components.interfaces;

var RETURN_CONTINUE = Ci.jsdIExecutionHook.RETURN_CONTINUE;

var memoryReporterManager = Cc["@mozilla.org/memory-reporter-manager;1"].
    getService(Ci.nsIMemoryReporterManager);

// List of memory reports displayed in the result. Append new path in the list in order
// to create a new columnd in the result report.
var MEMORY_PATHS =
{
    "malloc/allocated": true,
    "js/gc-heap": true,
    "js/string-data": true,
    "js/mjit-code": true,
    "images/content/used/raw": true,
};

// ********************************************************************************************* //

Firebug.MemoryProfiler = FBL.extend(Firebug.Module,
{
    initialize: function()  // called once
    {
        Firebug.Module.initialize.apply(this, arguments);

        if (FBTrace.DBG_MEMORY_PROFILER)
            FBTrace.sysout("memoryProfiler; initialize");
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);
    },

    initContext: function(context)
    {
        Firebug.Module.initContext.apply(this, arguments);

        // xxxHonza: If profiling is on and the user reloads,needs better testing
        // Profilinig should support reloads to profile page load.
        if (this.profiling)
            this.start(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Activation/deactivation

    toggleProfiling: function(context)
    {
        try
        {
            if (this.profiling)
                this.stop(context);
            else
                this.start(context);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("memoryProfiler; toggleProfiling EXCEPTION " + err, err);
        }
    },

    isProfiling: function()
    {
        return this.profiling;
    },

    start: function(context)
    {
        this.profiling = true;
        FBL.fbs.addHandler(this);

        // Initialize structures for collected memory data.
        context.memoryProfileStack = []; // Holds memory reports for called fucntions.
        context.memoryProfileResult = {}; // Holds differences between function-call and function-return.
        context.memoryProfileTime = (new Date()).getTime();

        this.mark(context);

        var title = FBL.$STR("Memory Profiler Started");
        var row = this.logProfileRow(context, title);

        context.memoryProfileRow = row;
        context.memoryProfileRow.customMessage = false;

        // For summary numbers (difference between profiling-start and profiling-end)
        context.memoryProfileStack.push(this.getMemoryReport());
    },

    stop: function(context)
    {
        FBL.fbs.removeHandler(this);
        this.profiling = false;

        // Calculate total diff
        var oldReport = context.memoryProfileStack.pop();
        var newReport = this.getMemoryReport();

        context.memoryProfileSummary = this.diffMemoryReport(oldReport, newReport);
        context.memoryProfileTime = (new Date()).getTime() - context.memoryProfileTime;

        this.logProfileReport(context, context.memoryProfileResult);

        delete context.memoryProfileRow;
        delete context.memoryProfileStack;
        delete context.memoryProfileResult;

        var deltaObjects = this.sweep(context);

        var title = FBL.$STR("Objects Added While Profiling");
        var row = Firebug.Console.openCollapsedGroup(title, context, "profile",
                Firebug.MemoryProfiler.ProfileCaption, true, null, true);

        Firebug.Console.log(deltaObjects, context, "memoryDelta", Firebug.DOMPanel.DirTable);
        Firebug.Console.closeGroup(context, true);

        //Firebug.Console.logFormatted([deltaObjects], context, "memoryDelta");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // JSD Handler

    unhook: function()
    {
    },

    hook: function()
    {
    },

    onFunctionCall: function(frame, depth)
    {
        var context = Firebug.Debugger.getContextByFrame(frame);
        if (!context)
            return RETURN_CONTINUE;

        context.memoryProfileStack.push(this.getMemoryReport());

        return RETURN_CONTINUE;
    },

    onFunctionReturn: function(frame, depth)
    {
        var context = Firebug.Debugger.getContextByFrame(frame);
        if (!context)
            return RETURN_CONTINUE;

        frame = FBL.getStackFrame(frame, context);

        var oldReport = context.memoryProfileStack.pop();
        var newReport = this.getMemoryReport();
        var diff = this.diffMemoryReport(oldReport, newReport);

        // Collect reports.
        var entryId = frameId(frame);
        var entry = context.memoryProfileResult[entryId];

        if (entry)
        {
            entry.callCount++;
            entry.report = this.sumMemoryReport(entry.report, diff);
        }
        else
        {
            context.memoryProfileResult[entryId] = {
                callCount: 1,
                report: diff,
                frame: frame
            };
        }

        return RETURN_CONTINUE;
    },

    /*onInterrupt: function(frame, depth)
    {
    },*/

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Memory

    getMemoryReport: function()
    {
        var report = {};
        var iter = memoryReporterManager.enumerateReporters();
        while (iter.hasMoreElements())
        {
            var reporter = iter.getNext().QueryInterface(Ci.nsIMemoryReporter);
            if (MEMORY_PATHS[reporter.path])
                report[reporter.path] = reporter.memoryUsed;
        }
        return report;
    },

    diffMemoryReport: function(oldReport, newReport)
    {
        var diff = {};
        for (var p in oldReport)
        {
            var oldVal = oldReport[p];
            var newVal = newReport[p];
            diff[p] = newVal - oldVal;
        }
        return diff;
    },

    sumMemoryReport: function(report1, report2)
    {
        var sum = [];
        for (var p in report1)
        {
            var val1 = report1[p];
            var val2 = report2[p];
            sum[p] = val1 + val2;
        }
        return sum;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    mark: function(context)
    {
        var contentView = FBL.getContentView(context.window);
        this.markRecursive(contentView, "window");
    },

    markRecursive: function(obj, path)
    {
        if (obj.hasOwnProperty("__fbugMemMark"))
            return;

        if (FirebugReps.Arr.isArray(obj))
        {
            obj.__fbugMemMark = obj.length;
        }
        else
        {
            obj.__fbugMemMark = true;
        }

        if (FBTrace.DBG_MEMORY_PROFILER)
            FBTrace.sysout("mark "+path+": "+obj.__fbugMemMark+" view: "+FBL.getContentView(obj));

        var names = Object.getOwnPropertyNames(obj);
        for (var i = 0; i < names.length; i++)
        {
            try
            {
                var name = names[i];
                if ( FBL.isDOMMember(obj, name) || FBL.isDOMConstant(obj, name) )
                    continue;
                var prop = obj[name];
                if (name === "HTMLBodyElement")
                    FBTrace.sysout("mark HTMLBodyElement "+name+" instanceof "+(prop instanceof HTMLBodyElement));
                if (typeof(prop) === 'object')  // TODO function
                    this.markRecursive(prop, path+'.'+name);
            }
            catch(exc)
            {
                if (FBTrace.DBG_MEMORY_PROFILER)
                    FBTrace.sysout("markRecursive fails on "+path+'.'+name);
            }
        }

        //var proto = Object.getPrototypeOf(obj);
        //if (proto && typeof(proto) === 'object')
        //    this.markRecursive(proto);
    },

    sweep: function(context)
    {
        var deltaObjects = {};
        var contentView = FBL.getContentView(context.window);
        this.sweepRecursive(deltaObjects, contentView, "window");
        return deltaObjects;
    },

    sweepRecursive: function(deltaObjects, obj, path)
    {
        if (FBTrace.DBG_MEMORY_PROFILER)
            FBTrace.sysout("sweep "+path+" "+obj.hasOwnProperty("__fbugMemSweep")+" view: "+
                FBL.getContentView(obj), obj);

        if (obj.hasOwnProperty("__fbugMemSweep"))
            return;

        obj.__fbugMemSweep = true;


        if (!obj.hasOwnProperty("__fbugMemMark")) // then we did not see this object 'before'
        {
            deltaObjects[path] = obj;
        }
        else // we did see it
        {
            // but it was an array with a different size
            if (FirebugReps.Arr.isArray(obj) && (obj.__fbugMemMark !== obj.length) )
                deltaObjects[path] = obj;
        }

        var names = Object.getOwnPropertyNames(obj);
        for (var i = 0; i < names.length; i++)
        {
            var name = names[i];
            if (name === "__fbugMemSweep" || name === "__fbugMemMark")
                continue;

            if ( FBL.isDOMMember(obj, name) || FBL.isDOMConstant(obj, name) )
                    continue;

            try
            {
                var prop = obj[name];
                if (name === "HTMLBodyElement")
                    FBTrace.sysout("sweep HTMLBodyElement "+name+" instanceof: "+(prop instanceof HTMLBodyElement)+" toString:"+prop);
                if (typeof(prop) === 'object')  // TODO function
                    this.sweepRecursive(deltaObjects, prop, path+'.'+name);
            }
            catch(exc)
            {
                if (FBTrace.DBG_MEMORY_PROFILER)
                    FBTrace.sysout("sweepRecursive fails on "+path+'.'+name);
            }
        }

        //var proto = Object.getPrototypeOf(obj);
        //if (proto && typeof(proto) === 'object')
        //    this.sweepRecursive(deltaObjects, proto, path+'.__proto__');

        return deltaObjects;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI

    logProfileRow: function(context, title)
    {
        var row = Firebug.Console.openGroup(title, context, "profile",
            Firebug.MemoryProfiler.ProfileCaption, true, null, true);
        FBL.setClass(row, "profilerRunning");

        Firebug.Console.closeGroup(context, true);

        return row;
    },

    logProfileReport: function(context, memoryReport, cancel)
    {
        if (FBTrace.DBG_MEMORY_PROFILER)
        {
            FBTrace.sysout("memoryProfiler; logProfileReport", memoryReport);
            FBTrace.sysout("memoryProfiler; logProfileReport SUMMARY", context.memoryProfileSummary);
        }

        // Get an existing console log (with throbber) or create a new one.
        var groupRow = context.memoryProfileRow && context.memoryProfileRow.ownerDocument
            ? context.memoryProfileRow
            : this.logProfileRow(context);
        delete context.memoryProfileRow;

        FBL.removeClass(groupRow, "profilerRunning");

        var calls = [];
        var totalCalls = 0;
        var sourceFileMap = context.sourceFileMap;

        for (var p in memoryReport)
        {
            if (!memoryReport.hasOwnProperty(p))
                continue;

            var entry = memoryReport[p];
            totalCalls++;

            if (!entry.frame)
            {
                if (FBTrace.DBG_MEMORY_PROFILER)
                    FBTrace.sysout("memoryProfiler no entry.frame? for p="+p, entry);
                continue;
            }

            var script = entry.frame.script;
            var sourceLink = FBL.getSourceLinkForScript(script, context);

            if (sourceLink && sourceLink.href in sourceFileMap)
            {
                var call = new MemoryProfileCall(script, context, entry.callCount,
                    entry.report, sourceLink);
                calls.push(call);
            }
        }

        // Summary log
        var call = new MemoryProfileSummary(context, context.memoryProfileSummary);
        calls.push(call);
        totalCalls++;

        if (totalCalls > 0)
        {
            var captionBox = groupRow.getElementsByClassName("profileCaption").item(0);
            if (!groupRow.customMessage)
            {
                captionBox.textContent = FBL.$STR("Memory Profiler Results");
            }

            var timeBox = groupRow.getElementsByClassName("profileTime").item(0);
            timeBox.textContent = "(" + FBL.formatTime(context.memoryProfileTime) + ")";

            var groupBody = groupRow.lastChild;
            var sizer = Firebug.MemoryProfiler.ProfileTable.tag.replace(
                {object: MEMORY_PATHS}, groupBody);

            var table = sizer.firstChild;
            var tHeader = table.lastChild;  // no rows inserted.

            var callTag = Firebug.MemoryProfiler.ProfileCall.tag;
            var sumTag = Firebug.MemoryProfiler.ProfileSummary.tag;

            for (var i = 0; i < calls.length; ++i)
            {
                var call = calls[i];
                call.index = i;
                var tag = (call instanceof MemoryProfileCall) ? callTag : sumTag;
                context.throttle(tag.insertRows, tag, [{object: call}, tHeader]);
            }

            context.throttle(groupRow.scrollIntoView, groupRow, []);
        }
        else
        {
            var captionBox = groupRow.getElementsByClassName("profileCaption").item(0);
            captionBox.textContent = FBL.$STR("NothingToProfile");
        }
    }
});

// ********************************************************************************************* //

function MemoryProfileCall(script, context, callCount, report, sourceLink)
{
    this.script = script;
    this.context = context;
    this.callCount = callCount;
    this.report = report;
    this.sourceLink = sourceLink;
}

function MemoryProfileSummary(context, report)
{
    this.context = context;
    this.report = report;
}

// ********************************************************************************************* //
// Domplate Templates

with (Domplate) {
Firebug.MemoryProfiler.ProfileTable = domplate(
{
    tag:
        DIV({"class": "profileSizer", "tabindex": "-1" },
            TABLE({"class": "profileTable", cellspacing: 0, cellpadding: 0,
                width: "100%", "role": "grid"},
                THEAD({"class": "profileThead", "role": "presentation"},
                    TR({"class": "headerRow focusRow profileRow subFocusRow",
                        onclick: "$onClick", "role": "row"},
                        TH({"class": "headerCell alphaValue a11yFocus", "role": "columnheader"},
                            DIV({"class": "headerCellBox"},
                                FBL.$STR("Function")
                            )
                        ),
                        TH({"class": "headerCell a11yFocus" , "role": "columnheader"},
                            DIV({"class": "headerCellBox", title: FBL.$STR("CallsHeaderTooltip")},
                                FBL.$STR("Calls")
                            )
                        ),
                        FOR("column", "$object|getColumns",
                            TH({"class": "headerCell a11yFocus", "role": "columnheader",
                                "aria-sort": "descending"},
                                DIV({"class": "headerCellBox"},
                                    FBL.$STR("$column|getColumnLabel")
                                )
                            )
                        ),
                        TH({"class": "headerCell alphaValue a11yFocus", "role": "columnheader"},
                            DIV({"class": "headerCellBox"},
                                FBL.$STR("File")
                            )
                        )
                    )
                ),
                TBODY({"class": "profileTbody", "role": "presentation"})
            )
        ),

    getColumns: function(object)
    {
        var cols = [];
        for (var p in object)
            cols.push(p)
        return cols;
    },

    getColumnLabel: function(column)
    {
        return column;
    },

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
            var sortValue = cell.sortValue ? cell.sortValue : cell.textContent;
            var value = numerical ? parseFloat(sortValue) : sortValue;
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

// ********************************************************************************************* //

Firebug.MemoryProfiler.ProfileCaption = domplate(Firebug.Rep,
{
    tag:
        SPAN({"class": "profileTitle", "role": "status"},
            SPAN({"class": "profileCaption"}, "$object"),
            " ",
            SPAN({"class": "profileTime"}, "")
        )
});

// ********************************************************************************************* //

Firebug.MemoryProfiler.ProfileCall = domplate(Firebug.Rep,
{
    tag:
        TR({"class": "focusRow profileRow subFocusRow", "role": "row"},
            TD({"class": "profileCell", "role": "presentation"},
                FirebugReps.OBJECTLINK("$object|getCallName")
            ),
            TD({"class": "a11yFocus profileCell", "role": "gridcell"},
                "$object.callCount"
            ),
            FOR("column", "$object|getColumns",
                TD({"class": "a11yFocus profileCell", "role": "gridcell", _sortValue: "$column"},
                    "$column|getColumnLabel"
                )
            ),
            TD({"class": "linkCell profileCell", "role": "presentation"},
                TAG(FirebugReps.SourceLink.tag, {object: "$object|getSourceLink"})
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getCallName: function(call)
    {
        return FBL.cropString(FBL.getFunctionName(call.script, call.context), 60);
    },

    getColumns: function(call)
    {
        var cols = [];
        for (var p in call.report)
            cols.push(call.report[p]);
        return cols;
    },

    getColumnLabel: function(call)
    {
        return FBL.formatSize(call);
    },

    getSourceLink: function(call)
    {
        return call.sourceLink;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "profile",

    supportsObject: function(object, type)
    {
        return object instanceof MemoryProfileCall;
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
            var fn = FBL.getFunctionName(call.script, call.context);
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
        var fn = FBL.unwrapIValue(call.script.functionObject);
        return FirebugReps.Func.getContextMenuItems(fn, call.script, context);
    }
});

// ********************************************************************************************* //

Firebug.MemoryProfiler.ProfileSummary = domplate(Firebug.Rep,
{
    tag:
        TR({"class": "focusRow profileSummaryRow subFocusRow", "role": "row"},
            TD({"class": "profileCell", "role": "presentation", colspan: 2},
                FBL.$STR("Entire Session")
            ),
            FOR("column", "$object|getColumns",
                TD({"class": "a11yFocus profileCell", "role": "gridcell", _sortValue: "$column"},
                    "$column|getColumnLabel"
                )
            ),
            TD({"class": "linkCell profileCell", "role": "presentation"})
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    className: "profile",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getColumns: function(call)
    {
        return Firebug.MemoryProfiler.ProfileCall.getColumns(call)
    },

    getColumnLabel: function(call)
    {
        return Firebug.MemoryProfiler.ProfileCall.getColumnLabel(call);
    },
});

} // END with Domplate

// ********************************************************************************************* //
// Private Functions

function frameId(frame, depth)
{
    if (frame)
        return frame.script.tag+"@"+frame.line;
    else
        return "noIdForNoframe";
}

// ********************************************************************************************* //

Firebug.registerModule(Firebug.MemoryProfiler);
Firebug.registerRep(Firebug.MemoryProfiler.ProfileCall);

// ********************************************************************************************* //

return Firebug.MemoryProfiler;

// ********************************************************************************************* //
});
