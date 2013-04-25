/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/events",
    "firebug/lib/locale",
],
function(Obj, Firebug, FBTrace, Events, Locale) {

// ********************************************************************************************* //
// EventMonitor Module

var EventMonitor = Obj.extend(Firebug.Module,
{
    dispatchName: "eventMonitor",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    destroyContext: function(context, persistedState)
    {
        // Clean up all existing monitors.
        var monitoredEvents = context.monitoredEvents;
        if (monitoredEvents)
        {
            for (var i=0; i<monitoredEvents.length; ++i)
            {
                var m = monitoredEvents[i];

                if (!m.type)
                    Events.detachAllListeners(m.object, context.onMonitorEvent, context);
                else
                    Events.removeEventListener(m.object, m.type, context.onMonitorEvent, false);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Event Monitor

    toggleMonitorEvents: function(object, types, monitor, context)
    {
        if (monitor)
            this.monitorEvents(object, types, context);
        else
            this.unmonitorEvents(object, types, context);
    },

    monitorEvents: function(object, types, context)
    {
        if (object && object.addEventListener)
        {
            if (!context.onMonitorEvent)
            {
                var self = this;
                context.onMonitorEvent = function(event) {
                    self.onMonitorEvent(event, context);
                };
            }

            if (!context.monitoredEvents)
                context.monitoredEvents = new Map();

            var monitoredEvents = context.monitoredEvents;
            var eventTypes = getMonitoredEventTypes(types);

            if (FBTrace.DBG_EVENTS)
                FBTrace.sysout("EventMonitor.monitorEvents", eventTypes);

            if (!context.monitoredEvents.has(object))
                context.monitoredEvents.set(object, new Set());

            var monitoredEventTypes = monitoredEvents.get(object);
            for (var i = 0, len = eventTypes.length; i < len; ++i)
            {
                if (!this.areEventsMonitored(object, eventTypes[i], context))
                {
                    Events.addEventListener(object, eventTypes[i], context.onMonitorEvent, false);
                    monitoredEventTypes.add(eventTypes[i]);
                }
            }
        }
    },

    unmonitorEvents: function(object, types, context)
    {
        var monitoredEvents = context.monitoredEvents;

        if (!monitoredEvents)
            return;

        var eventTypes = getMonitoredEventTypes(types);

        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("EventMonitor.unmonitorEvents", eventTypes);

        if (object)
        {
            if (monitoredEvents.has(object))
            {
                var monitoredObjectEvents = monitoredEvents.get(object);
                for (var i = 0, len = eventTypes.length; i < len; ++i)
                {
                     if (monitoredObjectEvents.has(eventTypes[i]))
                     {
                        Events.removeEventListener(object, eventTypes[i], context.onMonitorEvent, false);
                        monitoredObjectEvents.delete(eventTypes[i]);
                     }
                }
            }
        }
    },

    areEventsMonitored: function(object, types, context, allMonitored)
    {
        var monitoredEvents = context.monitoredEvents;
        if (!monitoredEvents)
        {
            if (FBTrace.DBG_EVENTS)
                FBTrace.sysout("EventMonitor.areEventsMonitored - No events monitored", object);

            return false;
        }

        var eventTypes = getMonitoredEventTypes(types);
        var monitoredObjectEvents = monitoredEvents.get(object);
        if (!monitoredObjectEvents)
            return;

        if (typeof allMonitored == "undefined")
            allMonitored = true;

        for (var i = 0, len = eventTypes.length; i < len; ++i)
        {
            var monitored = monitoredObjectEvents.has(eventTypes[i]);

            if (!monitored)
            {
                if (FBTrace.DBG_EVENTS)
                {
                    FBTrace.sysout("EventMonitor.areEventsMonitored - Events not monitored for '" +
                        eventTypes[i] + "'");
                }

                if (allMonitored)
                    return false;
            }
            else
            {
                if (FBTrace.DBG_EVENTS)
                {
                    FBTrace.sysout("EventMonitor.areEventsMonitored - Events monitored for '" +
                        eventTypes[i] + "'");
                }

                if (!allMonitored)
                    return true;
            }
        }

        return allMonitored;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Logging

    onMonitorEvent: function(event, context)
    {
        var obj = new EventMonitor.EventLog(event);
        Firebug.Console.log(obj, context);
    }
});

// ********************************************************************************************* //

EventMonitor.EventLog = function(event)
{
    this.event = event;
};

// ********************************************************************************************* //
// Helpers

function getMonitoredEventTypes(types)
{
    var eventTypes = [];
    if (!types)
    {
        eventTypes = Events.getEventTypes();
    }
    else
    {
        if (typeof types == "string")
        {
            eventTypes = Events.isEventFamily(types) ? Events.getEventTypes(types) : [types];
        }
        else
        {
            for (var i = 0; i < types.length; ++i)
            {
                if (Events.isEventFamily(types[i]))
                {
                    var familyEventTypes = Events.getEventTypes(types[i]);
                    for (var j = 0; j < familyEventTypes.length; ++j)
                        eventTypes.push(familyEventTypes[j]);
                }
                else
                {
                    eventTypes.push(types[i]);
                }
            }
        }
    }

    return eventTypes;
}

// ********************************************************************************************* //
// CommandLine Support

function monitorEvents(context, args)
{
    var object = args[0];
    var types = args[1];

    EventMonitor.monitorEvents(object, types, context);
    return Firebug.Console.getDefaultReturnValue(context.window);
}

function unmonitorEvents(context, args)
{
    var object = args[0];
    var types = args[1];

    EventMonitor.unmonitorEvents(object, types, context);
    return Firebug.Console.getDefaultReturnValue(context.window);
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(EventMonitor);

Firebug.registerCommand("monitorEvents", {
    handler: monitorEvents.bind(this),
    helpUrl: "http://getfirebug.com/wiki/index.php/monitorEvents",
    description: Locale.$STR("console.cmd.help.monitorEvents")
});

Firebug.registerCommand("unmonitorEvents", {
    handler: unmonitorEvents.bind(this),
    helpUrl: "http://getfirebug.com/wiki/index.php/unmonitorEvents",
    description: Locale.$STR("console.cmd.help.unmonitorEvents")
});

return EventMonitor;

// ********************************************************************************************* //
});
