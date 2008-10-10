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
 * This service is intended as the only HTTP observer registered by Firebug.
 * All FB extensions and Firebug itself should register a listener within this
 * servise in order to listen for http-on-modify-request and http-on-examine-response.
 * See also: http://developer.mozilla.org/en/Setting_HTTP_request_headers
 */
function HttpRequestObserver()
{
    // Get firebug-trace service for logging (the service should be already
    // registered at this moment).
	var obj = Cc["@joehewitt.com/firebug-trace-service;1"]
	              .getService(Ci.nsISupports).wrappedJSObject;
	
	
    FBTrace = Cc["@joehewitt.com/firebug-trace-service;1"]
       .getService(Ci.nsISupports).wrappedJSObject.getTracer("extensions.firebug");
    this.wrappedJSObject = this;
    this.listeners = [];
    this.observers = [];
}

HttpRequestObserver.prototype = 
{
    initialize: function()
    {
        observerService.addObserver(this, "quit-application", false);
        observerService.addObserver(this, "http-on-modify-request", false);
        observerService.addObserver(this, "http-on-examine-response", false);

        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.sysout("httpObserver.initialize OK");
    },

    shutdown: function()
    {
        observerService.removeObserver(this, "quit-application");
        observerService.removeObserver(this, "http-on-modify-request");
        observerService.removeObserver(this, "http-on-examine-response");

        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.sysout("httpObserver.shutdown OK");
    },

    /* nsIObserve */
    observe: function(subject, topic, data)
    {
        if (topic == "app-startup") {
            this.initialize();
            return;
        }
        else if (topic == "quit-application") {
            this.shutdown();
            return;
        }

        try 
        {
            // Support for listeners that needs the window.
            // xxxHonza: this can be eventually removed, but the window is quite useful 
            // for listeners
            if (subject instanceof Ci.nsIHttpChannel)
            {
                var win = getWindowForRequest(subject);
                if (topic == "http-on-modify-request")
                    this.fireOnModifyRequest(subject, win);
                else if (topic == "http-on-examine-response")
                    this.fireOnExamineResponse(subject, win);
            }

            // Support for nsIObserver(s). 
            // xxxHonza: It's safer to pass the object through a defined interface 
            // (the JS object remains the same).
            if (topic == "http-on-modify-request" || topic == "http-on-examine-response")
                this.notifyObservers(subject, topic, data);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("httpObserver.observe EXCEPTION", err);
        }
    },

    fireOnModifyRequest: function(request, win)
    {
        win = win ? win.wrappedJSObject : null;

        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.dumpProperties("httpObserver.onRequest: (" + 
                + this.listeners.length + ") " + request.name, request);

        for (var i=0; i<this.listeners.length; i++)
            this.listeners[i].onModifyRequest(request, win);
    },

    fireOnExamineResponse: function(request, win)
    {
        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.dumpProperties("httpObserver.onResponse: (" + 
                + this.listeners.length + ") " + request.name, request);

        win = win ? win.wrappedJSObject : null;
        for (var i=0; i<this.listeners.length; i++)
            this.listeners[i].onExamineResponse(request, win);
    },

    addListener: function(listener)
    {   
        this.listeners.push(listener);
    },	
	
    removeListener: function(listener)
    {
        for (var i=0; i<this.listeners.length; i++) {
            if (this.listeners[i] == listener) {
                this.listeners.splice(i, 1);
                break;
            }
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
                break;
            }
        }
    },

    notifyObservers: function(subject, topic, data)
    {
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

// ************************************************************************************************
// Helper functions

function getWindowForRequest(request) 
{
    var webProgress = getRequestWebProgress(request);
    return webProgress ? safeGetWindow(webProgress) : null;
}

function getRequestWebProgress(request) 
{
    try
    {
        if (request.notificationCallbacks)
            return request.notificationCallbacks.getInterface(Ci.nsIWebProgress);
    } catch (exc) {}

    try
    {
        if (request.loadGroup && request.loadGroup.groupObserver)
            return request.loadGroup.groupObserver.QueryInterface(Ci.nsIWebProgress);
    } catch (exc) {}

    return null;
}

function safeGetWindow(webProgress) 
{
    try {
        return webProgress.DOMWindow;
    }
    catch (ex) {
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

        categoryManager.addCategoryEntry("app-startup", CLASS_NAME, 
            "service," + CONTRACT_ID, true, true);
    },

    unregisterSelf: function(compMgr, fileSpec, location)
    {
        compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);
        compMgr.unregisterFactoryLocation(CLASS_ID, location);

        categoryManager.deleteCategoryEntry("app-startup", CLASS_NAME, true);
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
