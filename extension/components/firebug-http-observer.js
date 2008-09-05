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

/**
 * This service is intended as the only HTTP observer registered by Firebug.
 * All FB extensions and Firebug itself should register a listener within this
 * servise in order to listen for http-on-modify-request and http-on-examine-response.
 * See also: http://developer.mozilla.org/en/Setting_HTTP_request_headers
 */
function HttpRequestObserver()
{
    this.wrappedJSObject = this;
    this.listeners = [];
}

HttpRequestObserver.prototype = 
{
    initialize: function()
    {
        observerService.addObserver(this, "quit-application", false);
        observerService.addObserver(this, "http-on-modify-request", false);
        observerService.addObserver(this, "http-on-examine-response", false);

        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.dump("httpObserver.initialize OK");
    },

    shutdown: function()
    {
        observerService.removeObserver(this, "quit-application");
        observerService.removeObserver(this, "http-on-modify-request");
        observerService.removeObserver(this, "http-on-examine-response");

        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.dump("httpObserver.shutdown OK");
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
            subject.QueryInterface(Ci.nsIHttpChannel);
            if (topic == "http-on-modify-request")
                this.fireOnModifyRequest(subject);
            else if (topic == "http-on-examine-response")
                this.fireOnExamineResponse(subject);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.dumpException("httpObserver.observe EXCEPTION", err);
        }
    },

    fireOnModifyRequest: function(request)
    {
        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.dumpProperties("httpObserver.onModifyRequest: (" + 
                + this.listeners.length + ") " + request.name, request);

        for (var i=0; i<this.listeners.length; i++)
            this.listeners[i].onModifyRequest(request);
    },

    fireOnExamineResponse: function(request)
    {
        if (FBTrace.DBG_HTTPOBSERVER)
            FBTrace.dumpProperties("httpObserver.onExamineResponse: (" + 
                + this.listeners.length + ") " + request.name, request);

        for (var i=0; i<this.listeners.length; i++)
            this.listeners[i].onExamineResponse(request);
    },

    addListener: function(listener)
    {   
        this.listeners.push(listener);
    },	
	
    removeListener: function(listener)
    {
        for (var i=0; this.listeners.length; i++) {
            if (this.listeners[i] == listener) {
                this.listeners.splice(i, 1);
                break;
            }
        }
    },

	/* nsISupports */
	QueryInterface: function(iid) 
	{
        if (iid.equals(Ci.nsISupports) || 
			iid.equals(Ci.nsIObserver)) {
 		    return this;
 		}
		
		throw Cr.NS_ERROR_NO_INTERFACE;
	}
}

// xxxHonza: the FBTrace isn't available her yet. This is a place holder.
var FBTrace =
{
    DBG_HTTPOBSERVER: false,
    dump: function(message) { },
    dumpProperties: function(message, object) { },
    dumpException: function(message, exception) { }
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
