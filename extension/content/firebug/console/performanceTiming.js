/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/chrome/module",
    "firebug/chrome/rep",
    "firebug/lib/trace",
    "firebug/lib/domplate",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/dom",
    "firebug/lib/events",
    "firebug/lib/string",
    "firebug/lib/wrapper",
    "firebug/lib/css",
],
function(Firebug, Module, Rep, FBTrace, Domplate, Obj, Locale, Dom, Events, Str, Wrapper, Css) {

"use strict";

// ********************************************************************************************* //
// Documentation

// See http://www.w3.org/TR/navigation-timing/

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// List of timing properties in performance.timing structure.
var timingProps = [
    "connectEnd",
    "connectStart",
    "domComplete",
    "domContentLoadedEventEnd",
    "domContentLoadedEventStart",
    "domInteractive",
    "domLoading",
    "domainLookupEnd",
    "domainLookupStart",
    "fetchStart",
    "loadEventEnd",
    "loadEventStart",
    "navigationStart",
    "redirectCount",
    "redirectEnd",
    "redirectStart",
    "requestStart",
    "responseEnd",
    "responseStart",
    "unloadEventEnd",
    "unloadEventStart",
];

var {domplate, TABLE, THEAD, TH, TBODY, TR, TD, DIV, SPAN, FOR} = Domplate;

// ********************************************************************************************* //
// Module

var PerformanceTimingModule = Obj.extend(Module,
{
    initialize: function(prefDomain, prefNames)
    {
        Module.initialize.apply(this, arguments);
        Firebug.Console.addListener(ConsoleListener);
    },

    shutdown: function()
    {
        Module.shutdown.apply(this, arguments);
        Firebug.Console.removeListener(ConsoleListener);
    },
});

// ********************************************************************************************* //
// Domplate

/**
 * This template is used to render the timing waterfall graph.
 */
var PerformanceTimingRep = domplate(Rep,
/** @lends PerformanceTimingRep */
{
    className: "perfTiming",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    tag:
        TABLE({"class": "perfTimingTable", cellspacing: 0, cellpadding: 0, width: "100%",
            "role": "grid", _repObject: "$object"},
            TBODY({"class": "perfTimingTbody", "role": "presentation"},
                FOR("bar", "$object.bars",
                    TR(
                        TD(
                            DIV({"class": "perfTimingBox"},
                                DIV({"class": "perfTimingBar $bar.className",
                                    style: "left: $bar.left%; width: $bar.width%"},
                                    SPAN({"class": "perfTimingBarLabel"}, "$bar.label")
                                ),
                                DIV({"class": "perfTimingEvent domLoading",
                                    style: "left: $bar.domLoading%;"}
                                ),
                                DIV({"class": "perfTimingEvent domInteractive",
                                    style: "left: $bar.domInteractive%;"}
                                ),
                                DIV({"class": "perfTimingEvent domContentLoaded",
                                    style: "left: $bar.domContentLoaded%;"}
                                ),
                                DIV({"class": "perfTimingEvent onLoad",
                                    style: "left: $bar.onLoad%;"}
                                ),
                                DIV({"class": "perfTimingEvent cursor"})
                            )
                        )
                    )
                )
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getRealObject: function(object)
    {
        return Wrapper.unwrapObject(object.timing);
    },

    supportsObject: function(object, type)
    {
        return (object instanceof PerfTimingObj);
    },

    getContextMenuItems: function(object, target, context)
    {
        return [];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    showInfoTip: function(infoTip, target, x, y)
    {
        var table = Dom.getAncestorByClass(target, "perfTimingTable");
        if (!table)
            return false;

        var timingObj = table.repObject;
        return PerfInfoTip.render(timingObj.timing, infoTip);
    }
});

// ********************************************************************************************* //
// InfoTip

/**
 * Hovering mouse over the waterfall graph shows an infotip. This template is responsible
 * for rendering its content.
 */
var PerfInfoTip = domplate(Rep,
/** @lends PerfInfoTip */
{
    tableTag:
        TABLE({"class": "timeInfoTip", "id": "fbPerfTimingInfoTip"},
            TBODY()
        ),

    timingsTag:
        FOR("bar", "$bars",
            TR({"class": "timeInfoTipRow", $collapsed: "$bar|hideBar"},
                TD({"class": "timeInfoTipBar $bar|getClassName"}),
                TD({"class": "timeInfoTipCell startTime"},
                    "$bar.start|formatStartTime"
                ),
                TD({"class": "timeInfoTipCell elapsedTime"},
                    "$bar.elapsed|formatTime"
                ),
                TD("$bar|getLabel")
            )
        ),

    separatorTag:
        TR(
            TD({"class": "timeInfoTipSeparator", "colspan": 4, "height": "10px"},
                SPAN("$label")
            )
        ),

    eventsTag:
        FOR("event", "$events",
            TR({"class": "timeInfoTipEventRow"},
                TD({"class": "timeInfoTipBar", align: "center"},
                    DIV({"class": "$event|getClassName timeInfoTipEventBar"})
                ),
                TD("$event.start|formatStartTime"),
                TD({"class": "timeInfotTipEventName", "colspan": 2},
                    "$event|getTimeStampLabel"
                )
            )
        ),

    hideBar: function(obj)
    {
        return !obj.elapsed && obj.className == "redirect";
    },

    getClassName: function(obj)
    {
        return obj.className;
    },

    formatTime: function(time)
    {
        return Str.formatTime(time);
    },

    formatStartTime: function(time)
    {
        var label = Str.formatTime(time);
        if (!time)
            return label;

        return (time > 0 ? "+" : "") + label;
    },

    getLabel: function(obj)
    {
        return Locale.$STR("perftiming." + obj.label);
    },

    getTimeStampLabel: function(obj)
    {
        return obj.name;
    },

    render: function(timing, parentNode)
    {
        var infoTip = PerfInfoTip.tableTag.replace({}, parentNode);

        // Insert top description.
        this.separatorTag.insertRows({label: Locale.$STR("perftiming.bars.label")},
            infoTip.firstChild);

        // Insert request timing info.
        var bars = calculateBars(timing);
        this.timingsTag.insertRows({bars: bars}, infoTip.firstChild);

        var t = timing;

        var events = [];
        events.push({
            name: "DOM Loading",
            className: "domLoading",
            start: t.domLoading - t.navigationStart
        });

        events.push({
            name: "DOM Interactive",
            className: "domInteractive",
            start: t.domInteractive - t.navigationStart,
        });

        events.push({
            name: "DOMContentLoaded",
            className: "domContentLoaded",
            start: t.domContentLoadedEventStart - t.navigationStart,
        });

        events.push({
            name: "load",
            className: "onLoad",
            start: t.loadEventStart - t.navigationStart,
        });

        // Insert separator.
        this.separatorTag.insertRows({label: Locale.$STR("requestinfo.timings.label")},
            infoTip.firstChild);

        this.eventsTag.insertRows({events: events}, infoTip.firstChild);

        return true;
    }
});

// ********************************************************************************************* //
// Rep Object

function PerfTimingObj(bars, timing)
{
    this.bars = bars;
    this.timing = timing;
}

// ********************************************************************************************* //

/**
 * Console listener is responsible for rendering the Performance visualization every time
 * the user logs 'performance.timing' on the command line.
 */
var ConsoleListener =
/** @lends ConsoleListener */
{
    tag:
        DIV({_repObject: "$object"},
            DIV({"class": "documentCookieBody"})
        ),

    log: function(context, object, className, sourceLink)
    {
        if (!context || !object)
            return;

        var type = Object.prototype.toString.call(object);
        if (type === "[object PerformanceTiming]")
            performanceTiming(context, object);
    },

    logFormatted: function(context, objects, className, sourceLink)
    {
    }
};

// ********************************************************************************************* //
// Console Logging

/**
 * This function is responsible for inserting the waterfall graph into the Console panel.
 */
function performanceTiming(context, timing)
{
    var t = timing;
    var elapsed = t.loadEventEnd - t.navigationStart;

    var objects = [];
    var rep = PerformanceTimingRep;
    var bars = calculateBars(t);

    var result = [];
    for (var i=0; i<bars.length; i++)
    {
        var bar = bars[i];

        // Filter our empty bars.
        if (!bar.elapsed)
            continue;

        bar.left = calculatePos(bar.start, elapsed);
        bar.width = calculatePos(bar.elapsed, elapsed);
        bar.label = bar.label + " " + Str.formatTime(bar.elapsed);

        result.push(bar);
    }

    // Events
    var domLoading = calculatePos(t.domLoading - t.navigationStart, elapsed);
    var domInteractive = calculatePos(t.domInteractive - t.navigationStart, elapsed);
    var domContentLoaded = calculatePos(t.domContentLoadedEventStart - t.navigationStart, elapsed);
    var onLoad = calculatePos(t.loadEventStart - t.navigationStart, elapsed);

    for (var i=0; i<result.length; i++)
    {
        var bar = result[i];
        bar.domLoading = domLoading;
        bar.domInteractive = domInteractive;
        bar.domContentLoaded = domContentLoaded;
        bar.onLoad = onLoad;
    }

    var input = new PerfTimingObj(result, t);
    Firebug.Console.log(input, context, "perfTiming", rep, true);

    // Create a log group first (collapsed by default). All the timing details will be rendered
    // inside the group (within 'logGroupBody' element).
    var row = Firebug.Console.openCollapsedGroup("perfTimingDetails", context, "perfTimingDetails",
        DetailsCaption, true, null, true);
    Firebug.Console.closeGroup(context, true);

    // Get 'logGroupBody' element and render the timing details.
    var logGroupBody = row.getElementsByClassName("logGroupBody")[0];
    var table = DetailsTable.tag.replace({object: t}, logGroupBody);
    var tBody = table.lastChild;

    // Iterate only known properties (these are also localized).
    var timings = [];
    for (var i=0; i<timingProps.length; i++)
    {
        var name = timingProps[i];
        var value = t[name];
        var startTime = value ? (value - t.navigationStart) : 0;
        var timing = {
            name: name,
            timeLabel: startTime ? "+" + Str.formatTime(startTime) : 0,
            desc: Locale.$STR("perftiming." + name),
            time: startTime,
        };
        timings.push(timing);
    }

    timings.sort(function(a, b) {
        return a.time > b.time ? 1 : -1;
    });

    DetailsEntry.tag.insertRows({timings: timings}, tBody);

    return Firebug.Console.getDefaultReturnValue();
}

// ********************************************************************************************* //
// Detailed Log

/**
 * A caption for detailed performance timing info.
 */
var DetailsCaption = domplate(
/** @lends DetailsCaption */
{
    tag:
        SPAN({"class": "timingTitle"},
            SPAN({"class": "timingCaption"},
                Locale.$STR("perftiming.details_title")
            ),
            SPAN({"class": "timingCaptionDesc"},
                Locale.$STR("perftiming.details_title_desc")
            )
        )
});

// ********************************************************************************************* //

/**
 * This template represents a table with detailed timing info.
 */
var DetailsTable = domplate(
/** @lends DetailsTable */
{
    tag:
        TABLE({"class": "timingTable", cellspacing: 0, cellpadding: 0, width: "100%",
            "role": "grid", _repObject: "$object"},
            THEAD({"class": "timingThead", "role": "presentation"},
                TR({"class": "headerRow focusRow timingRow subFocusRow", "role": "row"},
                    TH({"class": "headerCell a11yFocus", "role": "columnheader", width: "10%"},
                        DIV({"class": "headerCellBox"},
                            Locale.$STR("Name")
                        )
                    ),
                    TH({"class": "headerCell a11yFocus", "role": "columnheader", width: "10%"},
                        DIV({"class": "headerCellBox"},
                            Locale.$STR("Time")
                        )
                    ),
                    TH({"class": "headerCell a11yFocus", "role": "columnheader", width: "70%"},
                        DIV({"class": "headerCellBox"},
                            Locale.$STR("Description")
                        )
                    )
                )
            ),
            TBODY({"class": "perfTimingTbody", "role": "presentation"}
            )
        ),
});

// ********************************************************************************************* //

/**
 * A row within detailed performance timing info.
 */
var DetailsEntry = domplate(
/** @lends DetailsEntry */
{
    tag:
        FOR("timing", "$timings",
            TR({"class": "focusRow timingRow subFocusRow", "role": "row", _repObject: "$timing",
                onmousemove: "$onMouseMove", onmouseout: "$onMouseOut"},
                TD({"class": "a11yFocus timingCell timingName", "role": "gridcell"},
                    "$timing.name"
                ),
                TD({"class": "a11yFocus timingCell timingTime", "role": "gridcell"},
                    "$timing.timeLabel"
                ),
                TD({"class": "a11yFocus timingCell timingDesc", "role": "gridcell"},
                    "$timing.desc"
                )
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onMouseMove: function(event)
    {
        var row = Dom.getAncestorByClass(event.target, "timingRow");
        if (!row)
            return;

        var log = Dom.getAncestorByClass(row, "logRow-perfTimingDetails");
        var graph = log.previousSibling;
        if (!Css.hasClass(graph, "logRow-perfTiming"))
            return;

        var table = Dom.getAncestorByClass(row, "timingTable");
        var timing = table.repObject;

        var elapsed = timing.loadEventEnd - timing.navigationStart;
        var startTime = row.repObject.time;

        var tBody = graph.getElementsByClassName("perfTimingTbody")[0];
        var rows = tBody.getElementsByTagName("tr");
        for (var i=0; i<rows.length; i++)
        {
            var row = rows[i];
            var cursor = row.getElementsByClassName("cursor")[0];

            Dom.hide(cursor, false);
            cursor.style.left = calculatePos(startTime, elapsed) + "%";
        }
    },

    onMouseOut: function(event)
    {
        var row = Dom.getAncestorByClass(event.target, "timingRow");
        if (!row)
            return;

        var log = Dom.getAncestorByClass(row, "logRow-perfTimingDetails");
        var graph = log.previousSibling;
        if (!Css.hasClass(graph, "logRow-perfTiming"))
            return;

        var tBody = graph.getElementsByClassName("perfTimingTbody")[0];
        var rows = tBody.getElementsByTagName("tr");
        for (var i=0; i<rows.length; i++)
        {
            var row = rows[i];
            var cursor = row.getElementsByClassName("cursor")[0];
            Dom.hide(cursor, true);
        }
    }
});

// ********************************************************************************************* //
// Helpers

function calculatePos(time, elapsed)
{
    return Math.round((time / elapsed) * 100);
}

function calculateBars(timing)
{
    var result = [];
    var t = timing;

    // Page Load bar
    result.push({
        className: "pageLoad",
        start: 0,
        elapsed: t.loadEventEnd - t.navigationStart,
        label: Locale.$STR("Page Load"),
    });

    // Redirect
    result.push({
        className: "redirect",
        start: t.redirectStart ? t.redirectStart - t.navigationStart : 0,
        elapsed: t.redirectStart ? t.redirectEnd - t.redirectStart : 0,
        label: Locale.$STR("Redirect"),
    });

    // DNS
    var dns = t.domainLookupEnd - t.domainLookupStart;
    result.push({
        className: "dns",
        start: t.domainLookupStart - t.navigationStart,
        elapsed: t.domainLookupEnd - t.domainLookupStart,
        label: Locale.$STR("DNS"),
    });

    // Connect bar
    result.push({
        className: "connecting",
        start: t.connectStart - t.navigationStart,
        elapsed: t.connectEnd - t.connectStart,
        label: Locale.$STR("Connecting"),
    });

    // Waiting bar
    result.push({
        className: "waiting",
        start: t.requestStart - t.navigationStart,
        elapsed: t.responseStart - t.requestStart,
        label: Locale.$STR("Waiting"),
    });

    // Response bar
    result.push({
        className: "response",
        start: t.responseStart - t.navigationStart,
        elapsed: t.responseEnd - t.responseStart,
        label: Locale.$STR("Receiving"),
    });

    // Processing bar
    result.push({
        className: "processing",
        start: t.responseEnd - t.navigationStart,
        elapsed: t.loadEventStart - t.responseEnd,
        label: Locale.$STR("DOM Processing"),
    });

    // DOMContentLoaded
    result.push({
        className: "DOMContentLoaded",
        start: t.domContentLoadedEventStart - t.navigationStart,
        elapsed: t.domContentLoadedEventEnd - t.domContentLoadedEventStart,
        label: Locale.$STR("DOMContentLoaded"),
    });

    // onLoad
    result.push({
        className: "onLoad",
        start: t.loadEventStart - t.navigationStart,
        elapsed: t.loadEventEnd - t.loadEventStart,
        label: Locale.$STR("onLoad"),
    });

    return result;
}

// ********************************************************************************************* //
// Registration

Firebug.registerRep(PerformanceTimingRep);
Firebug.registerModule(PerformanceTimingModule);

return PerformanceTimingModule;

// ********************************************************************************************* //
});
