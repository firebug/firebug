/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/events",
],
function(FBTrace, Events) {

// ********************************************************************************************* //
// Constants

var EventMonitor = {};

// ********************************************************************************************* //
// Event Monitoring

EventMonitor.toggleMonitorEvents = function(object, type, state, context)
{
    if (state)
        EventMonitor.unmonitorEvents(object, type, context);
    else
        EventMonitor.monitorEvents(object, type, context);
};

EventMonitor.monitorEvents = function(object, type, context)
{
    if (!EventMonitor.areEventsMonitored(object, type, context) && object && object.addEventListener)
    {
        if (!context.onMonitorEvent)
            context.onMonitorEvent = function(event) { Firebug.Console.log(event, context); };

        if (!context.eventsMonitored)
            context.eventsMonitored = [];

        context.eventsMonitored.push({object: object, type: type});

        if (!type)
            Events.attachAllListeners(object, context.onMonitorEvent, context);
        else
            Events.addEventListener(object, type, context.onMonitorEvent, false);
    }
};

EventMonitor.unmonitorEvents = function(object, type, context)
{
    var eventsMonitored = context.eventsMonitored;

    for (var i = 0; i < eventsMonitored.length; ++i)
    {
        if (eventsMonitored[i].object == object && eventsMonitored[i].type == type)
        {
            eventsMonitored.splice(i, 1);

            if (!type)
                Events.detachAllListeners(object, context.onMonitorEvent, context);
            else
                Events.removeEventListener(object, type, context.onMonitorEvent, false);
            break;
        }
    }
};

EventMonitor.areEventsMonitored = function(object, type, context)
{
    var eventsMonitored = context.eventsMonitored;
    if (eventsMonitored)
    {
        for (var i = 0; i < eventsMonitored.length; ++i)
        {
            if (eventsMonitored[i].object == object && eventsMonitored[i].type == type)
                return true;
        }
    }

    return false;
};

// ********************************************************************************************* //

return EventMonitor;

// ********************************************************************************************* //
});
