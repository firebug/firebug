/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/chrome/rep",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/net/netUtils",
    "firebug/lib/dom",
],
function(Firebug, Rep, Domplate, Locale, Str, NetUtils, Dom) {

// ********************************************************************************************* //
// Constants

var {domplate, FOR, DIV, SPAN, TD, TR, TABLE, TBODY, P, A} = Domplate;

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

// ********************************************************************************************* //
// Implementation

/**
 * @domplate This template is used to render an info tip with detailed timing for network
 * requests. The info tip is used on the Net panel.
 */
var TimeInfoTip = domplate(Rep,
{
    startTimeTag:
        TABLE({"class": "timeInfoTip"},
            TBODY(
                TR(
                    TD("$startTime.time|formatStartTime"),
                    TD({"class": "timeInfoTipStartLabel"},
                        "$startTime|getLabel"
                    )
                )
            )
        ),

    timingsTag:
        TABLE({"class": "timeInfoTip", "id": "fbNetTimeInfoTip", cellpadding: 0, cellspacing: 0},
            TBODY(
                TR(
                    TD({width: "5%"}),
                    TD({width: "5%"}),
                    TD({width: "90%"})
                ),
                FOR("time", "$timings",
                    TR({"class": "timeInfoTipRow", $collapsed: "$time|hideBar"},
                        TD("$time|getLabel"),
                        TD({"class": "timeInfoTipCell startTime"},
                            "$time.start|formatStartTime"
                        ),
                        TD({"class": "timeInfoTipCell bars"},
                            DIV({"class": "timeInfoTipBox"},
                                DIV({"class": "timeInfoTipBar $time|getBarClass",
                                    style: "left: $time.left%; width: $time.width%"},
                                    SPAN({"class": "perfTimingBarLabel"}, "$time.elapsed|formatTime")
                                )
                            )
                        )
                    )
                )
            )
        ),

    descriptionTag:
        DIV({"class": "timeInfoTipDesc"},
            "$label"
        ),

    eventsTag:
        TABLE({"class": "timeInfoTip"},
            TBODY(
                FOR("event", "$events",
                    TR({"class": "timeInfoTipEventRow"},
                        TD({"class": "timeInfoTipBar", align: "center"},
                            DIV({"class": "$event|getTimeStampClass timeInfoTipEventBar"})
                        ),
                        TD("$event.start|formatStartTime"),
                        TD({"class": "timeInfotTipEventName"},
                            "$event|getTimeStampLabel"
                        )
                    )
                )
            )
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Template Getters

    hideBar: function(obj)
    {
        return !obj.elapsed && obj.bar == "Blocking";
    },

    getBarClass: function(obj)
    {
        return "net" + obj.bar + "Bar";
    },

    getTimeStampClass: function(obj)
    {
        return obj.classes;
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
        return Locale.$STR("requestinfo." + obj.bar);
    },

    getTimeStampLabel: function(obj)
    {
        return obj.name;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Render

    render: function(context, file, parentNode)
    {
        Dom.clearNode(parentNode);

        var elapsed = file.loaded ? file.endTime - file.startTime :
            file.phase.phaseEndTime - file.startTime;
        var blockingEnd = NetUtils.getBlockingEndTime(file);

        //Helper log for debugging timing problems.
        //NetUtils.traceRequestTiming("net.timeInfoTip.render;", file);

        var startTime = 0;

        var timings = [];
        timings.push({bar: "Blocking",
            elapsed: blockingEnd - file.startTime,
            start: startTime});

        timings.push({bar: "Resolving",
            elapsed: file.connectingTime - file.resolvingTime,
            start: startTime += timings[0].elapsed});

        // Connecting time is measured till the sending time in order to include
        // also SSL negotiation.
        // xxxHonza: time between "connected" and "sending" is SSL negotiation?
        timings.push({bar: "Connecting",
            elapsed: file.connectStarted ? file.sendingTime - file.connectingTime : 0,
            start: startTime += timings[1].elapsed});

        // In Fx3.6 the STATUS_SENDING_TO is always fired (nsIHttpActivityDistributor)
        // In Fx3.5 the STATUS_SENDING_TO (nsIWebProgressListener) doesn't have to come
        // This workaround is for 3.5
        var sendElapsed = file.sendStarted ? file.waitingForTime - file.sendingTime : 0;
        var sendStarted = timings[0].elapsed + timings[1].elapsed + timings[2].elapsed;

        timings.push({bar: "Sending",
            elapsed: sendElapsed,
            start: file.sendStarted ? file.sendingTime - file.startTime : sendStarted});

        timings.push({bar: "Waiting",
            elapsed: file.respondedTime - file.waitingForTime,
            start: file.waitingForTime - file.startTime});

        timings.push({bar: "Receiving",
            elapsed: file.endTime - file.respondedTime,
            start: file.respondedTime - file.startTime,
            loaded: file.loaded, fromCache: file.fromCache});

        // Calculate position of waterfall bars.
        for (var i=0; i<timings.length; i++)
        {
            var time = timings[i];
            time.left = calculatePos(time.start, elapsed);
            time.width = calculatePos(time.elapsed, elapsed);
        }

        // Include custom time stamps
        var events = [];
        var timeStamps = file.phase.timeStamps;
        for (var i=0; i<timeStamps.length; i++)
        {
            var timeStamp = timeStamps[i];
            events.push({
                name: timeStamp.label,
                classes: timeStamp.classes,
                start: timeStamp.time - file.startTime
            });
        }

        events.sort(function(a, b) {
            return a.start < b.start ? -1 : 1;
        });

        var phases = context.netProgress.phases;

        if (FBTrace.DBG_ERRORS && phases.length == 0)
            FBTrace.sysout("net.render; ERROR no phases");

        // Insert start request time. It's computed since the beginning (page load start time)
        // i.e. from the first phase start.
        var firstPhaseStartTime = (phases.length > 0) ? phases[0].startTime : file.startTime;

        var startTime = {};
        startTime.time = file.startTime - firstPhaseStartTime;
        startTime.bar = "started.label";
        this.startTimeTag.append({startTime: startTime}, parentNode);

        // Insert separator.
        this.descriptionTag.append(
            {label: Locale.$STR("requestinfo.phases.label")},
            parentNode);

        // Insert request timing info.
        this.timingsTag.append({timings: timings}, parentNode);

        // Insert events timing info.
        if (events.length)
        {
            // Insert separator.
            this.descriptionTag.append(
                {label: Locale.$STR("requestinfo.timings.label")},
                parentNode);

            this.eventsTag.append({events: events}, parentNode);
        }

        return true;
    }
});

// ********************************************************************************************* //
// Helpers

function calculatePos(time, elapsed)
{
    return Math.round((time / elapsed) * 100);
}

// ********************************************************************************************* //
// Registration

return TimeInfoTip;

// ********************************************************************************************* //
});
