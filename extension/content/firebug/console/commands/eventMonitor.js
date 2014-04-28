/* See license.txt for terms of usage */

define([
    "firebug/chrome/module",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/events",
    "firebug/lib/locale",
    "firebug/lib/domplate",
    "firebug/chrome/rep",
    "firebug/chrome/reps",
    "firebug/chrome/menu",
],
function(Module, Obj, Firebug, FBTrace, Events, Locale, Domplate, Rep, FirebugReps, Menu) {

"use strict";

// ********************************************************************************************* //
// EventMonitor Module

var EventMonitor = Obj.extend(Module,
{
    dispatchName: "eventMonitor",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Module

    initialize: function()
    {
        Module.initialize.apply(this, arguments);
        Firebug.registerUIListener(this);
    },

    shutdown: function()
    {
        Firebug.unregisterUIListener(this);
        Module.shutdown.apply(this, arguments);
    },

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
                        Events.removeEventListener(object, eventTypes[i],
                            context.onMonitorEvent, false);
                        monitoredObjectEvents["delete"](eventTypes[i]);
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
            return false;

        if (typeof allMonitored == "undefined")
            allMonitored = true;

        for (var i=0, len=eventTypes.length; i<len; ++i)
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
        var obj = new EventLog(event);
        Firebug.Console.log(obj, context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI Listener

    onContextMenu: function(items, object, target, context, panel, popup)
    {
        if (!panel || panel.name != "html")
            return items;

        var before = popup.querySelector("#fbScrollIntoView");
        if (!before)
            return items;

        var elt = object;

        function onToggleAll(event)
        {
            Events.cancelEvent(event);

            var checked = event.target.getAttribute("checked") == "true";
            var menupopup = event.target.parentNode;

            // Iterate over all event families (menu items) and check/uncheck them.
            var child = menupopup.firstChild;
            while (child)
            {
                if (child.tagName != "separator" && child.id != "fbLogAllEvents")
                    child.setAttribute("checked", checked ? "true" : "false");

                child = child.nextSibling;
            }

            this.toggleMonitorEvents(elt, null, checked, context);
        }

        var logEventItems = [];

        // The first item allows to select all event type (families) at once. Just like if
        // the user clicks directly the parent item (it's split-menu).
        logEventItems.push({
            label: "html.logAllEvents",
            tooltiptext: "html.logAllEvents.tip",
            id: "fbLogAllEvents",
            type: "checkbox",
            checked: this.areEventsMonitored(elt, null, context, true),
            command: onToggleAll.bind(this),
        });

        logEventItems.push("-");

        // Create sub-menu-items for "Log Event"
        var eventFamilies = Events.getEventFamilies();
        for (var i=0, count=eventFamilies.length; i<count; ++i)
        {
            var family = eventFamilies[i];

            // Compose a tooltip for the menu item.
            var tooltipText = "Monitor " + eventFamilies[i] + " events:";
            var types = Events.getEventTypes(family);
            tooltipText += "\n" + types.join(", ");

            // xxxHonza: there could be a helper for getting the CSS selector
            var Element = FirebugReps.Element;
            var selector = Element.getSelectorTag(elt) +
                Element.getSelectorId(elt) +
                Element.getSelectorClasses(elt);

            // xxxHonza: localization?
            tooltipText += "\n\nCommand Line Example:\n" +
                "monitorEvents($('" + selector + "'), '" + family + "')";

            logEventItems.push({
                nol10n: true,
                label: Locale.$STR(family),
                tooltiptext: tooltipText,
                id: "monitor" + family + "Events",
                type: "checkbox",
                checked: this.areEventsMonitored(elt, family, context),
                command: Obj.bind(this.onToggleMonitorEvents, this, elt, family, context)
            });
        }

        // Helper for monitoring all event families at once.
        function onCommand(event)
        {
            Events.cancelEvent(event);

            var checked = this.areEventsMonitored(elt, null, context, false);
            this.toggleMonitorEvents(elt, null, !checked, context);
        }

        var item = {
            label: "ShowEventsInConsole",
            tooltiptext: "html.tip.Show_Events_In_Console",
            id: "fbShowEventsInConsole",
            items: logEventItems
        };

        var logEventsItem = Menu.createMenuItem(popup, item, before);
        var separator = Menu.createMenuItem(popup, "-", before);

        return items;
    },

    onToggleMonitorEvents: function(event, elt, type, context)
    {
        var checked = event.target.getAttribute("checked") == "true";
        this.toggleMonitorEvents(elt, type, checked, context);

        Events.cancelEvent(event);

        // The 'Log All Events' helper item.
        var doc = event.target.ownerDocument;
        var logAllEvents = doc.getElementById("fbLogAllEvents");
        logAllEvents.setAttribute("checked", this.areEventsMonitored(elt, null, context, true));
    },
});

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
// Rep Object

var EventLog = function(event)
{
    this.event = event;
};

// ********************************************************************************************* //
// Rep Template

var {domplate, TAG, SPAN} = Domplate;

var EventLogRep = domplate(FirebugReps.Event,
{
    className: "eventLog",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    tag:
        TAG("$copyEventTag", {object: "$object|copyEvent"}),

    copyEventTag:
        SPAN(
            Rep.tags.OBJECTLINK("$object|summarizeEvent"),
            SPAN("&nbsp;"),
            SPAN("&#187;"),
            SPAN("&nbsp;"),
            TAG("$object|getTargetTag", {object: "$object|getTarget"})
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    copyEvent: function(log)
    {
        return log.event;
    },

    getTarget: function(event)
    {
        return event.target;
    },

    getTargetTag: function(event)
    {
        var rep = Firebug.getRep(event.target);
        return rep.shortTag ? rep.shortTag : rep.tag;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    supportsObject: function(object, type)
    {
        return object instanceof EventLog;
    },
});

// ********************************************************************************************* //
// CommandLine Support

function monitorEvents(context, args)
{
    var object = args[0];
    var types = args[1];

    EventMonitor.monitorEvents(object, types, context);
    return Firebug.Console.getDefaultReturnValue();
}

function unmonitorEvents(context, args)
{
    var object = args[0];
    var types = args[1];

    EventMonitor.unmonitorEvents(object, types, context);
    return Firebug.Console.getDefaultReturnValue();
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(EventMonitor);
Firebug.registerRep(EventLogRep);

Firebug.registerCommand("monitorEvents", {
    handler: monitorEvents.bind(this),
    helpUrl: "https://getfirebug.com/wiki/index.php/monitorEvents",
    description: Locale.$STR("console.cmd.help.monitorEvents")
});

Firebug.registerCommand("unmonitorEvents", {
    handler: unmonitorEvents.bind(this),
    helpUrl: "https://getfirebug.com/wiki/index.php/unmonitorEvents",
    description: Locale.$STR("console.cmd.help.unmonitorEvents")
});

return EventMonitor;

// ********************************************************************************************* //
});
