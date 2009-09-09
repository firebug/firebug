/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const CLASS_ID = Components.ID("{2D92593E-14D0-48ce-B260-A9881BBF9C8B}");
const CLASS_NAME = "Firebug HTTP Observer Service";
const CONTRACT_ID = "@joehewitt.com/firebug-http-observer;1";

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

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
function HttpRequestObserver()
{
    this.observers = [];
    this.isObserving = false;

    // Get firebug-trace service for logging (the service should be already
    // registered at this moment).
    FBTrace = Cc["@joehewitt.com/firebug-trace-service;1"]
       .getService(Ci.nsISupports).wrappedJSObject.getTracer("extensions.firebug");

    // Get firebug-service to listen for suspendFirebug and resumeFirebug events.
    fbs = Cc["@joehewitt.com/firebug;1"].getService(Ci.nsISupports).wrappedJSObject;

    this.initialize();
}

/* nsIFireBugClient */
var FirebugClient =
{
    disable: function()
    {
        if (gHttpObserverSingleton)
            gHttpObserverSingleton.unregisterObservers();
    },

    enable: function()
    {
        if (gHttpObserverSingleton)
            gHttpObserverSingleton.registerObservers();
    }
}

HttpRequestObserver.prototype =
{
    initialize: function()
    {
        fbs.registerClient(FirebugClient);

        observerService.addObserver(this, "quit-application", false);

        this.registerObservers();

        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.sysout("httpObserver.initialize OK");
    },

    shutdown: function()
    {
        fbs.unregisterClient(FirebugClient);

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

    /* nsISupports */
    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIObserverService) ||
            iid.equals(Ci.nsIObserver)) {
            return this;
        }

        throw Cr.NS_ERROR_NO_INTERFACE;
    }
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

// ************************************************************************************************
// Service factory

var gHttpObserverSingleton = null;
var HttpRequestObserverFactory =
{
    createInstance: function (outer, iid)
    {
        if (outer != null)
            throw Cr.NS_ERROR_NO_AGGREGATION;

        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIObserverService) ||
            iid.equals(Ci.nsIObserver))
        {
            if (!gHttpObserverSingleton)
                gHttpObserverSingleton = new HttpRequestObserver();
            return gHttpObserverSingleton.QueryInterface(iid);
        }

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsISupportsWeakReference) ||
            iid.equals(Ci.nsIFactory))
            return this;

        throw Cr.NS_ERROR_NO_INTERFACE;
    }
};

// ************************************************************************************************
// Module implementation

var HttpRequestObserverModule =
{
    registerSelf: function (compMgr, fileSpec, location, type)
    {
        compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);
        compMgr.registerFactoryLocation(CLASS_ID, CLASS_NAME,
            CONTRACT_ID, fileSpec, location, type);
    },

    unregisterSelf: function(compMgr, fileSpec, location)
    {
        compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);
        compMgr.unregisterFactoryLocation(CLASS_ID, location);
    },

    getClassObject: function (compMgr, cid, iid)
    {
        if (!iid.equals(Ci.nsIFactory))
            throw Cr.NS_ERROR_NOT_IMPLEMENTED;

        if (cid.equals(CLASS_ID))
            return HttpRequestObserverFactory;

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

    canUnload: function(compMgr)
    {
        return true;
    }
};

// ************************************************************************************************

function NSGetModule(compMgr, fileSpec)
{
    return HttpRequestObserverModule;
}
