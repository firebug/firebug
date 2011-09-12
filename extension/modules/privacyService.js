/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

// https://developer.mozilla.org/en/Using_JavaScript_code_modules
var EXPORTED_SYMBOLS = ["PrivacyService"];

Components.utils.import("resource://firebug/firebug-trace-service.js");
var FBTrace = traceConsoleService.getTracer("extensions.firebug");

// ********************************************************************************************* //

/**
 * No data should be written if Firefox is set to privatebrowsing.
 * don't forget to check it before access (issue 2923).
 */
var PrivacyService =
{
    initialize: function()
    {
        if (this.observerService)
            return;

        this.observerService = Components.classes["@mozilla.org/observer-service;1"]
            .getService(Components.interfaces.nsIObserverService);

        this.observerService.addObserver(this, "private-browsing", false);
        this.observerService.addObserver(this, "quit-application", false);

        this.update();
    },

    update: function(data)
    {
        try
        {
            var pbs = Components.classes["@mozilla.org/privatebrowsing;1"]
                .getService(Components.interfaces.nsIPrivateBrowsingService);

            this.privateBrowsingEnabled = pbs.privateBrowsingEnabled;

            // Dispatch to all listeners.
            for (var i=0; i<this.listeners.length; ++i)
            {
                var listener = this.listeners[i];
                if (data == "enter" && "onEnterPrivateBrowsing" in listener)
                    listener.onEnterPrivateBrowsing();
                else if (data == "exit" && "onExitPrivateBrowsing" in listener)
                    listener.onExitPrivateBrowsing();
            }

            if (FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("PrivacyService.update " + PrivacyService.isPrivateBrowsing())
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("PrivacyService.update EXCEPTION " + e, e);
        }
    },

    observe: function (subject, topic, data)
    {
        if (topic == "private-browsing")
        {
            PrivacyService.update(data);
        }
        else if (topic == "quit-application")
        {
            PrivacyService.observerService.removeObserver(this, "quit-application");
            PrivacyService.observerService.removeObserver(this, "private-browsing");
        }
    },

    isPrivateBrowsing: function()
    {
        return this.privateBrowsingEnabled;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Listeners

    listeners: [],

    addListener: function(listener)
    {
        this.listeners.push(listener);
    },

    removeListener: function(listener)
    {
        for (var i=0; i<this.listeners.length; ++i)
            if (this.listeners[i] == listener)
                return this.listeners.splice(i, 1);
    },
};

// ********************************************************************************************* //

PrivacyService.initialize();

// ********************************************************************************************* //
