/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

// Firebug cache componenet
const CACHE_CLASS_ID = Components.ID("{24017451-0F63-44bd-BE06-F58ACE0F0930}");
const CACHE_CLASS_NAME = "Firebug Cache Service";
const CACHE_CONTRACT_ID = "@joehewitt.com/firebug-cache;1";

// Cache tee listener (uses the same class-id and contract-id as the original
// tee listener component).
const TEE_CLASS_ID = Components.ID("{831f8f13-7aa8-485f-b02e-77c881cc5773}");
const TEE_CLASS_NAME = "Firebug Tee Stream Listener";
const TEE_CONTRACT_ID = "@mozilla.org/network/stream-listener-tee;1";

const Cc = Components.classes;
const Ci = Components.interfaces;

const NS_ERROR_NOT_IMPLEMENTED = Components.results.NS_ERROR_NOT_IMPLEMENTED;
const NS_ERROR_NO_INTERFACE = Components.results.NS_ERROR_NO_INTERFACE;
const NS_ERROR_NO_AGGREGATION = Components.results.NS_ERROR_NO_AGGREGATION;

const BinaryInputStream = Cc["@mozilla.org/binaryinputstream;1"];
const StorageStream = Cc["@mozilla.org/storagestream;1"];
const MemoryService = Cc["@mozilla.org/xpcom/memory-service;1"];
const BinaryOutputStream = Cc["@mozilla.org/binaryoutputstream;1"];

const compReg = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);

const reSplitLines = /\r\n|\r|\n/;

// Global cache object. Each entry represents one cached URI. See CacheEntry 
// object for more details
var gCache = [];

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

/**
 * List of cached content types.
 */
const contentTypes =
{
    "text/plain": 1,
    "text/html": 1,
    "text/html": 1,
    "text/xml": 1,
    "text/css": 1,
    "application/x-javascript": 1,
};

// ************************************************************************************************
// Helpers

function extend(l, r)
{
    var newOb = {};
    for (var n in l)
        newOb[n] = l[n];
    for (var n in r)
        newOb[n] = r[n];
    return newOb;
}

var BaseFactory =
{
    /*nsISupports*/
    QueryInterface: function(iid) 
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsISupportsWeakReference) ||
            iid.equals(Ci.nsIFactory))
            return this;

        Trace.dumpProperties("BaseFactory: error unimplemented interface " + 
            Components.interfacesByID[iid].name + "\n", iid);

        throw NS_ERROR_NO_INTERFACE;
    }
};

function CCSV(cName, ifaceName) {
    return Cc[cName].getService(Ci[ifaceName]);
}

// ************************************************************************************************
// Support for tracing

// xxxHonza - It would be useful to implement FBTrace as a component, so 
// it's accessible even from here.

var Trace = (function()
{
    return {
        sysout: function(message)
        {
            //dump(message);
        },

        dumpProperties: function(message, obj)
        {
            //dump(message + obj + "\n");
        }
    }
}());

// ************************************************************************************************
// Cache service

/**
 * Firebug cache component implements nsIFireBugCache interface. See nsIFireBugCache.idl
 * for more details.
 */
function FirebugCache()
{
}

FirebugCache.prototype = 
{
	/* nsIFireBugCache */
    init: function()
    {
        // Save original tee listener for use in the future
        var savedTee = CCSV(TEE_CONTRACT_ID, "nsIStreamListenerTee");

        var teeListener = new TeeListener(savedTee);
        this.teeFactory = new TeeListenerFactory(teeListener);

        // Register new tee stream listener.
        compReg.registerFactory(TEE_CLASS_ID, TEE_CLASS_NAME, TEE_CONTRACT_ID, this.teeFactory);

        Trace.sysout("FirebugCache initialized (TeeListener replaced).\n");
    },
        
    getSource: function(url)
    {
        var cacheEntry = gCache[url];
        if (!cacheEntry)
            return null;

        return cacheEntry.source;
    },

    /* nsISupports */
    QueryInterface: function(iid) 
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIClassInfo) ||
            iid.equals(Ci.nsIFireBugCache))
        {
            return this;
        }

        Trace.dumpProperties("FirebugCache: error unimplemented interface " + 
            Components.interfacesByID[iid].name + "\n", iid);

        throw NS_ERROR_NO_INTERFACE;
    }
}

// ************************************************************************************************
// Cache service factory

var gFirebugCache = null;
var FirebugCacheFactory = extend(BaseFactory, 
{
    createInstance: function (outer, iid)
    {
        if (outer != null)
            throw NS_ERROR_NO_AGGREGATION;

		if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIFireBugCache))
		{
		    if (!gFirebugCache)
    		    gFirebugCache = new FirebugCache();

            return gFirebugCache.QueryInterface(iid);
        }
        
        throw NS_ERROR_NO_INTERFACE;
    }
});

// ************************************************************************************************
// TeeListener

function TeeListener(listener)
{
    /* nsIStreamListenerTee */ 
    this.init = function(list, sink)
    {
        Trace.sysout("TeeListener: init \n");

        listener.init(list, sink);
    }

    this.onStartRequest = function(request, context)
    {
        Trace.dumpProperties("TeeListener: Request started " + 
            request.name + "\n", request);

        listener.onStartRequest(request, context);
    }

    this.onDataAvailable = function(request, context, inputStream, offset, count)
    {
        try
        {
            request = request.QueryInterface(Ci.nsIHttpChannel);
	        Trace.dumpProperties("TeeListener: onDataAvailable intercepted: count=" + 
	            count + " offset=" + offset + ", " + request.name + ", " + 
                request.contentType + "\n", request);

            // Cache only specified text based content-types.
            if (contentTypes[request.contentType])
            {
                var cacheEntry = getCacheEntry(request);
                var newStream = cacheEntry.onDataAvailable(request, context, inputStream, offset, count);
                if (newStream)
                    inputStream = newStream;
            }
        }
        catch (err)
        {
            Trace.dumpProperties("TeeListener: exception in onDataAvailable", err);
        }

        listener.onDataAvailable(request, context, inputStream, offset, count);
    }
	
    this.onStopRequest = function(request, context, statusCode)
    {
        var cacheEntry = getCacheEntry(request);

        if (statusCode != Ci.nsIRequest.NS_BINDING_ABORTED)
            cacheEntry.onDone(request);
        else
            removeCacheEntry(request);

        listener.onStopRequest(request, context, statusCode);
    }

    this.QueryInterface = function(iid)
    {
        if ( iid.equals(Ci.nsIStreamListener) ||
            iid.equals(Ci.nsIStreamListenerTee) ||
            iid.equals(Ci.nsIRequestObserver) ||
            iid.equals(Ci.nsISupportsWeakReference) || 
            iid.equals(Ci.nsISupports))
        {
            return this;
        }

        // nsISecurityCheckedComponent isn't implemented.    
        //Trace.dumpProperties("TeeListener: error unimplemented interface " + 
        //    Components.interfacesByID[iid].name + "\n", iid);

        throw Components.results.NS_NOINTERFACE;
    }	
}

// ************************************************************************************************
// TeeListener factory

function TeeListenerFactory(tee)
{
    this.tee = tee;
}

TeeListenerFactory.prototype = extend(BaseFactory,
{
    createInstance: function (outer, iid)
    {
        if (outer != null)
            throw NS_ERROR_NO_AGGREGATION;

    	Trace.sysout("TeeListenerFactory: createInstance.\n");

		if (iid.equals(Ci.nsIStreamListener) ||
            iid.equals(Ci.nsIRequestObserver) ||
            iid.equals(Ci.nsIStreamListenerTee) ||
		    iid.equals(Ci.nsISupports))
		{
            return this.tee.QueryInterface(iid);
        }
        
        throw NS_ERROR_NO_INTERFACE;
    }
});

// ************************************************************************************************
// Helper cache entry objects/functions

/**
 * Cache entry contains body for one specific URL.
 */
function CacheEntry(request)
{
    // xxxHonza nsIFireBugCacheEntry
    //this.id = safeGetName(request);
    //this.contentType = request.contentType;
    //this.contentLength = request.contentLength;
    //this.method = request.method;
    //this.time = (new Date()).getTime();
    this.source = "";
    this.done = false;

    this.data = [];
}

CacheEntry.prototype =
{
    onDataAvailable: function(request, context, inputStream, offset, count)
    {
        // This is the most important part of the cache implementation.
        // This is where incoming response bodies are intercepted and 
        // stored into gCache.
        var binaryInputStream = BinaryInputStream.createInstance(Ci.nsIBinaryInputStream);
        var storageStream = StorageStream.createInstance(Ci.nsIStorageStream);
        var memoryService = MemoryService.createInstance(Ci.nsIMemory);
        var binaryOutputStream = BinaryOutputStream.createInstance(Ci.nsIBinaryOutputStream);
        
        binaryInputStream.setInputStream(inputStream);
        storageStream.init(8192, count, memoryService);
        binaryOutputStream.setOutputStream(storageStream.getOutputStream(0));

        var data = binaryInputStream.readBytes(count);
        this.data.push(data);

        binaryOutputStream.writeBytes(data, count);
        return storageStream.newInputStream(0);
    },

    onDone: function()
    {
        this.done = true;
        this.source = this.data.join("");
        this.data = [];
    }
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function getCacheEntry(request)
{
    var name = safeGetName(request);

    var cacheEntry = gCache[name];
    if (!cacheEntry)
        gCache[name] = cacheEntry = new CacheEntry(request);

    return cacheEntry;
}

function removeCacheEntry(request)
{
    var name = safeGetName(request);
    delete gCache[name];
}

function safeGetName(request)
{
    try 
    {
        return request.name;
    }
    catch (exc) { }
    return null;
}

// ************************************************************************************************
// Module implementation

var FirebugCacheModule =
{
    registerSelf: function (compMgr, fileSpec, location, type)
    {
        compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);
        compMgr.registerFactoryLocation(CACHE_CLASS_ID, CACHE_CLASS_NAME, 
            CACHE_CONTRACT_ID, fileSpec, location, type);
        
        Trace.sysout("FirebugCacheModule - factory registered.\n");
    },

    unregisterSelf: function(compMgr, fileSpec, location)
    {
        compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);
        compMgr.unregisterFactoryLocation(CACHE_CLASS_ID, location);
    },

    getClassObject: function (compMgr, cid, iid)
    {
        if (!iid.equals(Ci.nsIFactory))
            throw NS_ERROR_NOT_IMPLEMENTED;

        if (cid.equals(CACHE_CLASS_ID))
            return FirebugCacheFactory;
        else if (cid.equals(TEE_CLASS_ID))
            return TeeListenerFactory;

        Trace.sysout("FirebugCacheModule - unimplemented class object " + cid + "\n");

        throw NS_ERROR_NO_INTERFACE;
    },

    canUnload: function(compMgr)
    {
        return true;
    }
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function NSGetModule(compMgr, fileSpec)
{
    return FirebugCacheModule;
}

// ************************************************************************************************
