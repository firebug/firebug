/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const httpObserver = Cc["@joehewitt.com/firebug-http-observer;1"].getService(Ci.nsIObserverService);
const nsIIOService = Ci.nsIIOService;
const IOService = Cc["@mozilla.org/network/io-service;1"];
const ioService = IOService.getService(nsIIOService);
const chromeReg = CCSV("@mozilla.org/chrome/chrome-registry;1", "nsIToolkitChromeRegistry");

// List of text content types.
const contentTypes =
{
    "text/plain": 1,
    "text/html": 1,
    "text/html": 1,
    "text/html": 1,
    "text/xml": 1,
    "text/css": 1,
    "application/x-javascript": 1,
    "application/x-javascript": 1,
    "image/jpeg": 0,
    "image/jpeg": 0,
    "image/gif": 0,
    "image/png": 0,
    "image/bmp": 0,
    "application/x-shockwave-flash": 0
};

// Helper array for prematurely created contexts.
var contexts = new Array();

// ************************************************************************************************
// Model implementation

/**
 * Implementation of cache model. The only purpose of this object is to register an HTTP 
 * observer so, HTTP communication can be interecepted and all incoming data stored within
 * a cache.
 */
Firebug.TabCacheModel = extend(Firebug.Module, 
{
    initializeUI: function(owner)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache. Cache model initialized.");

        // Register for HTTP events.
        if (Ci.nsITraceableChannel)
            httpObserver.addObserver(this, "firebug-http-event", false);
    },

    shutdown: function()
    {
        if (Ci.nsITraceableChannel)
            httpObserver.removeObserver(this, "firebug-http-event");
    },

    initContext: function(context)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.dumpProperties("tabCache.initContext for: " + context.window.location.href);

        // See if a temp context is available.
        var tabId = Firebug.getTabIdForWindow(context.window);

        var tempContext = contexts[tabId];
        if (tempContext)
        {
            context.sourceCache.cache = tempContext.sourceCache.cache;
            delete contexts[tabId];

            if (FBTrace.DBG_CACHE)
                FBTrace.dumpProperties("tabCache.Temporary context used for: " + 
                    context.window.location.href, context.sourceCache.cache);
        }
    },

    /* nsIObserver */
    observe: function(subject, topic, data)
    {
        try 
        {
            if (!(subject instanceof Ci.nsIHttpChannel))
                return;

            var win = getWindowForRequest(subject);
            var tabId = Firebug.getTabIdForWindow(win);
            if (!(tabId && win))
                return;

            if (topic == "http-on-modify-request")
                this.onModifyRequest(subject, win, tabId);
            else if (topic == "http-on-examine-response")
                this.onExamineResponse(subject, win, tabId);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.observe EXCEPTION", err);
        }
    },

    onModifyRequest: function(request, win, tabId)
    {
        // Ignore redirects
        if (request.URI.spec != request.originalURI.spec)
            return;

        if (request.loadFlags & Ci.nsIHttpChannel.LOAD_DOCUMENT_URI)
        {
            if (win == win.parent)
            {
                var context = {sourceCache: new Firebug.TabCache(win)};
                contexts[tabId] = context;

                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.Temporary context created for: " + win.location.href);
            }
        }
    },

    onExamineResponse: function(request, win, tabId)
    {
        var context = contexts[tabId];
        context = context ? context : TabWatcher.getContextByWindow(win);

        try 
        {
            // Register traceable channel listener in order to intercept all incoming data for 
            // this context/tab. nsITraceableChannel interface is introduced in Firefox 3.0.3
            request.QueryInterface(Ci.nsITraceableChannel);
            var newListener = new TracingListener(context);
            newListener.listener = request.setNewListener(newListener);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.dumpProperties("tabCache: Register Traceable Listener EXCEPTION", err);
        }

        if (FBTrace.DBG_CACHE)
            FBTrace.dumpProperties("tabCache:onExamineResponse: Traceable Listener Registered for: " + 
                safeGetName(request), request);
    },
});

// ************************************************************************************************

/**
 * This cache object is intended to cache all responses made by a specific tab.
 * The implementation is based on nsITraceableChannel interface introduced in 
 * Firefox 3.0.3. This interface allows to intercept all incoming HTTP data.
 *
 * This object replaces the SourceCache, which still exist only for backward 
 * compatibility.
 */
Firebug.TabCache = function(win)
{
    if (FBTrace.DBG_CACHE)
        FBTrace.dumpProperties("tabCache.TabCache Created for: " + win.location.href);

    // Map with all responses where: 
    // key => request URL.
    // value => array lines of the response source.
    this.cache = new Array();
};

Firebug.TabCache.prototype =
{
    listeners: [],

	isCached: function(url)
	{
		return this.cache.hasOwnProperty(url);
	},
    
    loadText: function(url)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.TabCache loadText: " + url);

        var lines = this.load(url);
        return lines ? lines.join("\n") : null;
    },

    load: function(url)
    {
        if (this.cache.hasOwnProperty(url))
            return this.cache[url];

        var d = FBL.splitDataURL(url);  
        if (d)
        {
            var src = d.encodedContent;
            var data = decodeURIComponent(src);
            var lines = data.split(/\r\n|\r|\n/);
            this.cache[url] = lines;

            return lines;
        }

        var j = FBL.reJavascript.exec(url);
        if (j)
        {
            var src = url.substring(FBL.reJavascript.lastIndex);
            var lines = src.split(/\r\n|\r|\n/);
            this.cache[url] = lines;

            return lines;
        }

        var c = FBL.reChrome.test(url);
        if (c)
        {
            if (Firebug.filterSystemURLs)
                return;  // ignore chrome

            var chromeURI = ioService.newURI(url, null, null);
            var localURI = chromeReg.convertChromeURL(chromeURI);
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("sourceCache.load converting chrome to local: "+url, " -> "+localURI.spec);
            url = localURI.spec;
        }
        
        // if we get this far then we have either a file: or chrome: url converted to file:
        var src = getResource(url);
        if (src)
        {
        	var lines = src.split(/\r\n|\r|\n/);
            this.cache[url] = lines;

            return lines;
        }  

        return null;
    },

    store: function(url, text)
    {
        if (FBTrace.DBG_CACHE)                                                                                         /*@explore*/
            FBTrace.sysout("tabCache.store for window="+this.context.window.location.href+" store url="+url+"\n");        /*@explore*/
        var lines = splitLines(text);
        return this.storeSplitLines(url, lines);
    },
    
    storeSplitLines: function(url, lines)  
    {
    	if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.store for window="+this.context.window.location.href+" store url="+url+"\n");
    	return this.cache[url] = lines;
    },

    invalidate: function(url)
    {
        delete this.cache[url];
    },

    getLine: function(url, lineNo)
    {
        var lines = this.load(url);
        if (lines)
        {
        	if (lineNo <= lines.length)
        		return lines[lineNo-1];
        	else
        		return (lines.length == 1) ? lines[0] : "( line "+lineNo+" out of range "+lines.length+" for "+url+")";
        }
        else
        	return "(no source for "+url+")";
    },

    // Listeners
    addListener: function(listener)
    {
        this.listeners.push(listener);
    },

    removeListener: function(listener)
    {
        remove(this.listeners, listener);
    },

    fireOnStoreResponse: function(context, request, responseText)
    {
        for (var i=0; i<this.listeners.length; i++)
        {
            var listener = this.listeners[i];
            if (listener.onStoreResponse)
                listener.onStoreResponse(context, request, responseText);
        }
    }
};

// ************************************************************************************************
// TracingListener implementation

/**
 * This object implements nsIStreamListener interface and is intended to monitor all network 
 * channels (nsIHttpChannel). For every channel a new instance of this object is created and 
 * registered. See Firebug.TabCacheModel.onExamineResponse method.
 */
function TracingListener(context)
{
    this.context = context;
    this.listener = null;
    this.receivedData = [];
}

TracingListener.prototype = 
{
    onCollectData: function(inputStream, offset, count)
    {
        try
        {
            var binaryInputStream = CCIN("@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream");
            var storageStream = CCIN("@mozilla.org/storagestream;1", "nsIStorageStream");
            var binaryOutputStream = CCIN("@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream");
            
            binaryInputStream.setInputStream(inputStream);
            storageStream.init(8192, count, null);
            binaryOutputStream.setOutputStream(storageStream.getOutputStream(0));

            // Copy received data as they come.
            var data = binaryInputStream.readBytes(count);
            this.receivedData.push(data);

            binaryOutputStream.writeBytes(data, count);
            return storageStream.newInputStream(0);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.dumpProperties("tabCache.TracingListener.onCollectData EXCEPTION\n", err);
        }

        return null;
    },

    /* nsIStreamListener */
    onDataAvailable: function(request, requestContext, inputStream, offset, count)
    {
        // xxxHonza: all content types should be cached?
        var newStream = this.onCollectData(inputStream, offset, count);
        if (newStream)
            inputStream = newStream;

        try
        {
            if (this.listener)
                this.listener.onDataAvailable(request, requestContext, inputStream, offset, count);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.dumpProperties("tabCache.TracingListener.onDataAvailable" +
                    "(" + request + ", " + requestContext + ", " + 
                    inputStream + ", " + offset + ", " + count + ") EXCEPTION: " + 
                    safeGetName(request), err);
        }
    },

    onStartRequest: function(request, requestContext)
    {
        try
        {
            if (this.listener)
                this.listener.onStartRequest(request, requestContext);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.dumpProperties("tabCache.TracingListener.onStartRequest EXCEPTION\n", err);
        }
    },

    onStopRequest: function(request, requestContext, statusCode)
    {
        try
        {
            if (statusCode != Ci.nsIRequest.NS_BINDING_ABORTED)
            {
                var responseText = this.receivedData.join();

                // Convert text types.
                if (contentTypes[request.contentType])
                    responseText = FBL.convertToUnicode(responseText);

                this.context.sourceCache.store(safeGetName(request), responseText);

                // Notify listeners.
                this.context.sourceCache.fireOnStoreResponse(this.context, request, responseText);
            }

            if (this.listener)
                this.listener.onStopRequest(request, requestContext, statusCode);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.dumpProperties("tabCache.TracingListener.onStopRequest EXCEPTION\n", err);
        }
    },

    /* nsISupports */
    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsIStreamListener) ||
            iid.equals(Ci.nsISupportsWeakReference) ||
            iid.equals(Ci.nsISupports))
        {
            return this;
        }

        throw Components.results.NS_NOINTERFACE;
    }
}

// ************************************************************************************************
// Helpers

function safeGetName(request)
{
    try {
        return request.name;
    }
    catch (exc) { 
    }

    return null;
}

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.TabCacheModel);

// ************************************************************************************************

}});
