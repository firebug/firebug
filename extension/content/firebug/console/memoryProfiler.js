/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/wrapper",
    "firebug/debugger/stack/stackFrame",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/string",
],
function(Obj, Firebug, Domplate, FirebugReps, Locale, Wrapper, StackFrame, Dom, Css, Str) {

// ********************************************************************************************* //

var Cc = Components.classes;
var Ci = Components.interfaces;

var RETURN_CONTINUE = Ci.jsdIExecutionHook.RETURN_CONTINUE;

var memoryReporterManager = null;

try
{
    memoryReporterManager = Cc["@mozilla.org/memory-reporter-manager;1"].
        getService(Ci.nsIMemoryReporterManager);
}
catch (err)
{
    if (FBTrace.DBG_MEMORY_PROFILER)
        FBTrace.sysout("memoryProfiler; Looks like '@mozilla.org/memory-reporter-manager;1'" +
            "is no available", err);
}

// List of memory reports displayed in the result. Append new path in the list in order
// to create a new column in the result report-table.
var MEMORY_PATHS =
{
    "explicit/js": true,
    "explicit/js/gc-heap": true,
    "explicit/js/tjit-data": true,
    "explicit/js/mjit-code": true,
    "explicit/images/content/used/raw": true,
};

// ********************************************************************************************* //

Firebug.MemoryProfiler = Obj.extend(Firebug.Module,
{
    dispatchName: "memoryProfiler",

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

    onConsoleCleared: function(context)
    {
        if (this.isProfiling())
            this.stop(context, true);
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

    start: function(context, title)
    {
        if (!memoryReporterManager)
        {
            // xxxHonza: locale if memory profiler will be part of 1.8
            Firebug.Console.log("Memory profiler component is not available on your platform.");
            return;
        }

        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleMemoryProfiling", "checked", "true");

        this.profiling = true;
        FBS.addHandler(this);

        // Initialize structures for collected memory data.
        context.memoryProfileStack = []; // Holds memory reports for called fucntions.
        context.memoryProfileResult = {}; // Holds differences between function-call and function-return.
        context.memoryProfileTime = (new Date()).getTime();

        // Memory leak detection
        this.mark(context);

        var isCustomMessage = !!title;
        if (!isCustomMessage)
            title = Locale.$STR("firebug.Memory Profiler Started");

        context.memoryProfileRow = this.logProfileRow(context, title);
        context.memoryProfileRow.customMessage = isCustomMessage;

        // For summary numbers (difference between profiling-start and profiling-end)
        context.memoryProfileStack.push(this.getMemoryReport());

        Firebug.Console.addListener(this);
    },

    stop: function(context, cancelReport)
    {
        FBS.removeHandler(this);
        this.profiling = false;

        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleMemoryProfiling", "checked", "false");

        // Calculate total diff
        var oldReport = context.memoryProfileStack.pop();
        var newReport = this.getMemoryReport();

        context.memoryProfileSummary = this.diffMemoryReport(oldReport, newReport);
        context.memoryProfileTime = (new Date()).getTime() - context.memoryProfileTime;

        this.logProfileReport(context, context.memoryProfileResult);

        delete context.memoryProfileRow;
        delete context.memoryProfileStack;
        delete context.memoryProfileResult;

        // Memory leak detection
        var deltaObjects = this.sweep(context);
        this.cleanUp(context);

        if (!cancelReport)
        {
            var title = Locale.$STR("firebug.Objects Added While Profiling");
            Firebug.Console.openCollapsedGroup(title, context, "profile",
                Firebug.MemoryProfiler.ProfileCaption, true, null, true);
    
            Firebug.Console.log(deltaObjects, context, "memoryDelta", Firebug.DOMPanel.DirTable);
            Firebug.Console.closeGroup(context, true);
        }

        Firebug.Console.removeListener(this);

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

        frame = StackFrame.getStackFrame(frame, context);

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

        if (!memoryReporterManager)
            return report;

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
    // Memory leak detection

    mark: function(context)
    {
        // Iterate all objects of the content window.
        var iter = new ObjectIterator();
        var contentView = Wrapper.getContentView(context.window);
        iter.iterate(contentView, "window", function(obj, path)
        {
            // We have been here, bail out.
            if (obj.hasOwnProperty("__fbugMemMark"))
                return false;

            if (FirebugReps.Arr.isArray(obj, context.window))
                obj.__fbugMemMark = obj.length;
            else
                obj.__fbugMemMark = true;

            //if (FBTrace.DBG_MEMORY_PROFILER)
            //    FBTrace.sysout("mark "+path+": "+obj.__fbugMemMark+" view: "+
            //       Wrapper.getContentView(obj));

            // Continue with children
            return true;
        });
    },

    sweep: function(context)
    {
        var iter = new ObjectIterator();
        iter.deltaObjects = {};

        var contentView = Wrapper.getContentView(context.window);
        iter.iterate(contentView, "window", function(obj, path)
        {
            //if (FBTrace.DBG_MEMORY_PROFILER)
            //    FBTrace.sysout("sweep "+path+" "+obj.hasOwnProperty("__fbugMemSweep")+" view: "+
            //        Wrapper.getContentView(obj), obj);

            if (obj.hasOwnProperty("__fbugMemSweep"))
                return false;

            obj.__fbugMemSweep = true;

            if (!obj.hasOwnProperty("__fbugMemMark")) // then we did not see this object 'before'
            {
                this.deltaObjects[path] = obj;
            }
            else // we did see it
            {
                // but it was an array with a different size
                if (FirebugReps.Arr.isArray(obj, context.window) &&
                    (obj.__fbugMemMark !== obj.length))
                {
                    this.deltaObjects[path] = obj;
                }
            }

            // Iterate children
            return true;
        });

        return iter.deltaObjects;
    },

    cleanUp: function(context)
    {
        var iter = new ObjectIterator();
        var contentView = Wrapper.getContentView(context.window);
        iter.iterate(contentView, "window", function(obj, path)
        {
            if (!obj.hasOwnProperty("__fbugMemSweep"))
                return false;

            // Clean up
            delete obj.__fbugMemSweep;
            delete obj.__fbugMemMark;

            return true;
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI

    logProfileRow: function(context, title)
    {
        var row = Firebug.Console.openGroup(title, context, "profile",
            Firebug.MemoryProfiler.ProfileCaption, true, null, true);
        Css.setClass(row, "profilerRunning");

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

        Css.removeClass(groupRow, "profilerRunning");

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
            var sourceLink = Firebug.SourceFile.toSourceLink(script, context);

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
                captionBox.textContent = Locale.$STR("firebug.Memory Profiler Results");

            var timeBox = groupRow.getElementsByClassName("profileTime").item(0);
            timeBox.textContent = "(" + Str.formatTime(context.memoryProfileTime) + ")";

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
            captionBox.textContent = Locale.$STR("NothingToProfile");
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
// Object Iterator

/**
 * Recursively iterates all children objects.
 */
function ObjectIterator()
{
}

ObjectIterator.prototype =
/** @lends ObjectIterator */
{
    /**
     * Recursive iteration over all children of given object
     * @param {Object} obj The object to iterate
     * @param {String} path helper path for logging.
     * @param {Function} callback Callback function executed for each object.
     */
    iterate: function(obj, path, callback)
    {
        if (!callback.apply(this, [obj, path]))
            return;

        var names = Object.keys(obj);
        for (var i=0; i<names.length; i++)
        {
            var name = names[i];

            // Ignore memory-profiler helper fields
            if (name === "__fbugMemSweep" || name === "__fbugMemMark")
                continue;

            // Ignore built-in objects
            if (Dom.isDOMMember(obj, name) || Dom.isDOMConstant(obj, name))
                continue;

            try
            {
                var child = obj[name];

                // xxxHonza, xxxJJB: this should be removed once the problem is clear.
                if (name === "HTMLBodyElement")
                    FBTrace.sysout("memoryProfiler; HTMLBodyElement " + name + " instanceof: " +
                        (prop instanceof window.HTMLBodyElement) + " toString: " + child);

                // Recursion
                if (typeof(child) === "object")  // TODO function
                    this.iterate(child, path + "." + name, callback);
            }
            catch (exc)
            {
                if (FBTrace.DBG_MEMORY_PROFILER)
                    FBTrace.sysout("memoryProfiler; iteration fails on " + path + "." + name, exc);
            }
        }

        //xxxHonza, xxxJBB: iterate also prototype as soon as we understand the consequences.
        /*
         var proto = Object.getPrototypeOf(obj);
        if (proto && typeof(proto) === 'object')
            this.sweepRecursive(deltaObjects, proto, path+'.__proto__');
        */
    },
};

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
                                Locale.$STR("Function")
                            )
                        ),
                        TH({"class": "headerCell a11yFocus", "role": "columnheader"},
                            DIV({"class": "headerCellBox", title: Locale.$STR("CallsHeaderTooltip")},
                                Locale.$STR("Calls")
                            )
                        ),
                        FOR("column", "$object|getColumns",
                            TH({"class": "headerCell a11yFocus", "role": "columnheader",
                                "aria-sort": "descending"},
                                DIV({"class": "headerCellBox"},
                                    Locale.$STR("$column|getColumnLabel")
                                )
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

    getColumns: function(object)
    {
        var cols = [];
        for (var p in object)
            cols.push(p);
        return cols;
    },

    getColumnLabel: function(column)
    {
        return column;
    },

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
        };

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
            var sortValue = cell.sortValue ? cell.sortValue : cell.textContent;
            var value = numerical ? parseFloat(sortValue) : sortValue;
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

// FirebugReps.OBJECTLINK is not yet initialized at this moment.
var OBJECTLINK =
    A({
        "class": "objectLink objectLink-$className a11yFocus",
        _repObject: "$object"
    });

Firebug.MemoryProfiler.ProfileCall = domplate(Firebug.Rep,
{
    tag:
        TR({"class": "focusRow profileRow subFocusRow", "role": "row"},
            TD({"class": "profileCell", "role": "presentation"},
                OBJECTLINK("$object|getCallName")
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
                 TAG("$object|getSourceLinkTag", {object: "$object|getSourceLink"})
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getSourceLinkTag: function(object)
    {
        return FirebugReps.SourceLink.tag;
    },

    getCallName: function(call)
    {
        return Str.cropString(StackFrame.getFunctionName(call.script, call.context), 60);
    },

    getColumns: function(call)
    {
        var cols = [];
        for (var p in MEMORY_PATHS)
            cols.push(call.report[p] || 0);
        return cols;
    },

    getColumnLabel: function(call)
    {
        return Str.formatSize(call);
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

Firebug.MemoryProfiler.ProfileSummary = domplate(Firebug.Rep,
{
    tag:
        TR({"class": "focusRow profileSummaryRow subFocusRow", "role": "row"},
            TD({"class": "profileCell", "role": "presentation", colspan: 2},
                Locale.$STR("firebug.Entire Session")
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
        return Firebug.MemoryProfiler.ProfileCall.getColumns(call);
    },

    getColumnLabel: function(call)
    {
        return Firebug.MemoryProfiler.ProfileCall.getColumnLabel(call);
    }
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
// Registration

Firebug.registerModule(Firebug.MemoryProfiler);
Firebug.registerRep(Firebug.MemoryProfiler.ProfileCall);

return Firebug.MemoryProfiler;

// ********************************************************************************************* //
});
