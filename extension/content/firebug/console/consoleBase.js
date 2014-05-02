/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/deprecated",
    "firebug/lib/events",
    "firebug/lib/options",
    "firebug/chrome/panelNotification"
],
function(Firebug, FBTrace, Deprecated, Events, Options, PanelNotification) {

"use strict";

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_CONSOLE");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// ConsoleBase Implementation

/**
 * @object
 */
var ConsoleBase =
/** @lends ConsoleBase */
{
    log: function(object, context, className, rep, noThrottle, sourceLink, callback)
    {
        Events.dispatch(this.fbListeners, "log", [context, object, className, sourceLink]);

        // xxxHonza: find better way how to delegate the function call to the console panel.
        // There should not be explicit usage of 'Firebug.ConsolePanel' (in theory, the panel
        // doesn't have to exist). See also other methods in this module.
        var appendObject = Firebug.ConsolePanel.prototype.appendObject;
        return this.logRow(appendObject, object, context, className, rep, sourceLink,
            noThrottle, false, callback);
    },

    logFormatted: function(objects, context, className, noThrottle, sourceLink, callback)
    {
        Events.dispatch(this.fbListeners, "logFormatted", [context, objects, className,
            sourceLink]);

        var appendFormatted = Firebug.ConsolePanel.prototype.appendFormatted;
        return this.logRow(appendFormatted, objects, context, className, null, sourceLink,
            noThrottle, false, callback);
    },

    openGroup: function(objects, context, className, rep, noThrottle, sourceLink, noPush)
    {
        var appendOpenGroup = Firebug.ConsolePanel.prototype.appendOpenGroup;
        return this.logRow(appendOpenGroup, objects, context, className, rep, sourceLink,
            noThrottle);
    },

    openCollapsedGroup: function(objects, context, className, rep, noThrottle, sourceLink, noPush)
    {
        var appendCollapsedGroup = Firebug.ConsolePanel.prototype.appendCollapsedGroup;
        return this.logRow(appendCollapsedGroup, objects, context, className, rep, sourceLink,
            noThrottle);
    },

    closeGroup: function(context, noThrottle)
    {
        var appendCloseGroup = Firebug.ConsolePanel.prototype.appendCloseGroup;
        return this.logRow(appendCloseGroup, null, context, null, null, null, noThrottle, true);
    },

    logRow: function(appender, objects, context, className, rep, sourceLink, noThrottle,
        noRow, callback)
    {
        if (!context)
            context = Firebug.currentContext;

        if (!context)
        {
            TraceError.sysout("console.logRow; has no context, skipping objects", objects);
            return;
        }

        if (noThrottle || !context)
        {
            var panel = this.getPanel(context);
            if (panel)
            {
                var row = panel.append(appender, objects, className, rep, sourceLink, noRow);
                var container = panel.panelNode;

                var logLimit = Options.get("console.logLimit");
                while (container.childNodes.length > logLimit + 1)
                {
                    container.removeChild(container.firstChild.nextSibling);
                    panel.limit.config.totalCount++;
                    PanelNotification.updateCounter(panel.limit);
                }

                Events.dispatch(this.fbListeners, "onLogRowCreated", [panel, row, context]);

                // Additional custom initialization of the log entry.
                if (callback)
                    callback(row);

                return row;
            }
        }
        else
        {
            if (!context.throttle)
            {
                TraceError.sysout("console.logRow; has not context.throttle!");
                return;
            }

            var args = [appender, objects, context, className, rep, sourceLink, true,
                noRow, callback];

            context.throttle(this.logRow, this, args);
        }
    },

    appendFormatted: function(args, row, context)
    {
        if (!context)
            context = Firebug.currentContext;

        var panel = this.getPanel(context);
        panel.appendFormatted(args, row);
    },

    clear: function(context)
    {
        if (!context)
            context = Firebug.currentContext;

        if (context)
        {
            // There could be some logs waiting in the throttle queue, so
            // clear asynchronously after the queue is flushed.
            context.throttle(this.clearPanel, this, [context]);

            // Also clear now
            this.clearPanel(context);

            // Let listeners react to console clearing
            Events.dispatch(this.fbListeners, "onConsoleCleared", [context]);
        }
    },

    clearPanel: function(context)
    {
        Firebug.Errors.clear(context);

        var panel = this.getPanel(context, true);
        if (panel)
            panel.clear();
    },

    // Override to direct output to your panel
    getPanel: function(context, noCreate)
    {
        if (context)
            return context.getPanel("console", noCreate);
    },
};

// ********************************************************************************************* //
// Registration

Deprecated.property(Firebug, "ConsoleBase", ConsoleBase, "Using Firebug.ConsoleBase is " +
    "deprecated. Load 'firebug/console/consoleBase' module instead");

return ConsoleBase;

// ********************************************************************************************* //
});
