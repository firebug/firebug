/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var EXPORTED_SYMBOLS = ["httpRequestObserver"];

var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
var categoryManager = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);

// ************************************************************************************************
// HTTP Request Observer implementation

var FBTrace = null;

/**
 * @service This service is intended as the only HTTP observer registered by Firebug.
 * All FB extensions and Firebug itself should register a listener within this
 * service in order to listen for http-on-modify-request, http-on-examine-response and
 * http-on-examine-cached-response events.
 *
 * See also: <a href="http://developer.mozilla.org/en/Setting_HTTP_request_headers">
 * Setting_HTTP_request_headers</a>
 */


/* nsIFireBugClient */
var FirebugClient =
{
    disableXULWindow: function()
    {
        httpRequestObserver.unregisterObservers();
    },

    enableXULWindow: function()
    {
        httpRequestObserver.registerObservers();
    }
}

httpRequestObserver =
/** lends HttpRequestObserver */
{
	preInitialize: function()
	{
    	this.observers = [];
    	this.isObserving = false;

        // Get firebug-trace service for logging (the service should be already
        // registered at this moment).
        FBTrace = Cc["@joehewitt.com/firebug-trace-service;1"]
           .getService(Ci.nsISupports).wrappedJSObject.getTracer("extensions.firebug");

        // Get firebug-service to listen for suspendFirebug and resumeFirebug events.
        // TODO is this really the way we want to do suspendFirebug?
        Components.utils.import("resource://firebug/firebug-service.js");

        this.initialize(fbs);
	},

    initialize: function(fbs)
    {
		this.firebugService = fbs;

		this.firebugService.registerClient(FirebugClient);

        observerService.addObserver(this, "quit-application", false);

        this.registerObservers();

        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.sysout("httpObserver.initialize OK");
    },

    shutdown: function()
    {
        this.firebugService.unregisterClient(FirebugClient);

        observerService.removeObserver(this, "quit-application");

        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.sysout("httpObserver.shutdown OK");
    },

    registerObservers: function()
    {
        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.sysout("httpObserver.registerObservers; wasObserving: " +
                this.isObserving);

        if (this.isObserving)
            return;

        observerService.addObserver(this, "http-on-modify-request", false);
        observerService.addObserver(this, "http-on-examine-response", false);
        observerService.addObserver(this, "http-on-examine-cached-response", false);

        this.isObserving = true;
    },

    unregisterObservers: function()
    {
        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.sysout("httpObserver.unregisterObservers; wasObserving: " +
                this.isObserving);

        if (!this.isObserving)
            return;

        observerService.removeObserver(this, "http-on-modify-request");
        observerService.removeObserver(this, "http-on-examine-response");
        observerService.removeObserver(this, "http-on-examine-cached-response");

        this.isObserving = false;
    },

    /* nsIObserve */
    observe: function(subject, topic, data)
    {
        if (topic == "quit-application") {
            this.shutdown();
            return;
        }

        try
        {
            if (FBTrace.DBG_HTTPOBSERVER)
            {
                FBTrace.sysout("httpObserver.observe " + (topic ? topic.toUpperCase() : topic) +
                    ", " + ((subject instanceof Ci.nsIRequest) ? safeGetName(subject) : ""));
            }

            // Notify all registered observers.
            if (topic == "http-on-modify-request" ||
                topic == "http-on-examine-response" ||
                topic == "http-on-examine-cached-response")
            {
                this.notifyObservers(subject, topic, data);
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("httpObserver.observe EXCEPTION", err);
        }
    },

    /* nsIObserverService */
    addObserver: function(observer, topic, weak)
    {
        if (topic != "firebug-http-event")
            throw Cr.NS_ERROR_INVALID_ARG;

        this.observers.push(observer);
    },

    removeObserver: function(observer, topic)
    {
        if (topic != "firebug-http-event")
            throw Cr.NS_ERROR_INVALID_ARG;

        for (var i=0; i<this.observers.length; i++) {
            if (this.observers[i] == observer) {
                this.observers.splice(i, 1);
                return;
            }
        }

        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.sysout("httpObserver.removeObserver FAILED (no such observer)");
    },

    notifyObservers: function(subject, topic, data)
    {
        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.sysout("httpObserver.notifyObservers (" + this.observers.length + ") " + topic);

        for (var i=0; i<this.observers.length; i++)
            this.observers[i].observe(subject, topic, data);
    },

    enumerateObservers: function(topic)
    {
        return null;
    },

}

function safeGetName(request)
{
    try
    {
        return request.name;
    }
    catch (exc)
    {
        return null;
    }
}


httpRequestObserver.preInitialize();