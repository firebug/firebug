/* See license.txt for terms of usage */

var DebuggerController = (function() {

// ********************************************************************************************* //
// Constants

var eventId = "FirebugEvent";

// Tracing
var Trace = FBTrace.to("DBG_TESTCASE");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Debugger Controller

/**
 * The object is responsible for registering TabBrowser listener and safe clean up.
 */
var DebuggerController =
/** @lends DebuggerController */
{
    listeners: new Map(),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    addListener: function(browser, listener)
    {
        browser = browser || FBTestFirebug.getCurrentTabBrowser();
        var entry = {
            browser: browser,
            handler: new EventHandler(listener)
        };

        browser.addEventListener(eventId, entry.handler, true);

        this.listeners.set(listener, entry);
    },

    removeListener: function(browser, listener)
    {
        browser = browser || FBTestFirebug.getCurrentTabBrowser();
        var entry = this.listeners.get(listener);
        browser.removeEventListener(eventId, entry.handler, true);

        this.listeners.delete(listener);
    },

    listenOnce: function(browser, eventName, callback)
    {
        var listener = {};
        listener[eventName] = function(...args)
        {
            DebuggerController.removeListener(browser, listener);
            callback(...args);
        };

        return DebuggerController.addListener(browser, listener);
    },

    cleanUp: function()
    {
        // Remove all listeners registered by the current test.
        this.listeners.forEach(function(entry)
        {
            entry.browser.removeEventListener(eventId, entry.handler, true);
        });

        this.listeners.clear();
    }
};

// ********************************************************************************************* //
// Event Handler

function EventHandler(listener)
{
    this.listener = listener;
}

/**
 * Helper handler object forwarding various event types to methods
 * of given listener object.
 */
EventHandler.prototype =
/** @lends EventHandler */
{
    handleEvent: function(event)
    {
        var type = event.detail.type;
        if (typeof(this.listener[type]) != "function")
            return;

        Trace.sysout("EventHandler.handleEvent; " + type + ", " +
            event.target.currentURI.spec, event);

        try
        {
            var args = event.detail.args;
            this.listener[type].apply(this.listener, args);
        }
        catch (err)
        {
            TraceError.sysout("DebuggerController.onEvent; EXCEPTION " + err, err);
        }
    }
}

// ********************************************************************************************* //
// Clean up

window.addEventListener("unload", function()
{
    DebuggerController.cleanUp();
}, true);

// ********************************************************************************************* //
// Registration

return DebuggerController;

// ********************************************************************************************* //
})();
