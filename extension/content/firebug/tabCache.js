/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const httpObserver = Cc["@joehewitt.com/firebug-http-observer;1"].getService(Ci.nsIObserverService);

// List of text content types. These content-types are cached.
var contentTypes =
{
    "text/plain": 1,
    "text/html": 1,
    "text/xml": 1,
    "text/xsl": 1,
    "text/xul": 1,
    "text/css": 1,
    "text/sgml": 1,
    "text/rtf": 1,
    "text/richtext": 1,
    "text/x-setext": 1,
    "text/rtf": 1,
    "text/richtext": 1,
    "text/javascript": 1,
    "text/tab-separated-values": 1,
    "text/rdf": 1,
    "text/xif": 1,
    "text/ecmascript": 1,
    "text/vnd.curl": 1,
    "text/x-json": 1,
    "view-source": 1,
    "view-fragment": 1,
    "application/xml": 1,
    "application/xhtml+xml": 1,
    "application/vnd.mozilla.xul+xml": 1,
    "application/javascript": 1,
    "application/x-javascript": 1,
    "application/x-httpd-php": 1,
    "application/rdf+xml": 1,
    "application/ecmascript": 1,
    "application/http-index-format": 1,
    "application/json": 1,
};

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

        // Read additional text mime-types from preferences.
        var mimeTypes = Firebug.getPref(Firebug.prefDomain, "cache.mimeTypes");
        if (mimeTypes) {
            var list = mimeTypes.split(" ");
            for (var i=0; i<list.length; i++)
                contentTypes[list[i]] = 1;

            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.initializeUI, custom mime-types added", list);
        }

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
            else if (topic == "http-on-cached-response")
                this.onCachedResponse(subject, win, tabId);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.observe EXCEPTION", err);
        }
    },

    onModifyRequest: function(request, win, tabId)
    {
    },

    onExamineResponse: function(request, win, tabId)
    {
        try 
        {
            // Register traceable channel listener in order to intercept all incoming data for 
            // this context/tab. nsITraceableChannel interface is introduced in Firefox 3.0.4
            request.QueryInterface(Ci.nsITraceableChannel);
            var newListener = new TracingListener(win);
            newListener.listener = request.setNewListener(newListener);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.dumpProperties("tabCache: Register Traceable Listener EXCEPTION", err);
        }
    },

    onCachedResponse: function(request, win, tabId)
    {
        // Make sure cached responses are observed with nsITraceableChannel too.
        this.onExamineResponse(request, win, tabId);
    }
});

// ************************************************************************************************

/**
 * This cache object is intended to cache all responses made by a specific tab.
 * The implementation is based on nsITraceableChannel interface introduced in 
 * Firefox 3.0.4. This interface allows to intercept all incoming HTTP data.
 *
 * This object replaces the SourceCache, which still exist only for backward 
 * compatibility.
 *
 * The object is derived from SourceCache so, the same interface and most of the
 * implementation is used.
 */
Firebug.TabCache = function(win)
{
    if (FBTrace.DBG_CACHE)
        FBTrace.dumpProperties("tabCache.TabCache Created for: " + win.location.href);

    Firebug.SourceCache.call(this, win, null);
};

Firebug.TabCache.prototype = extend(Firebug.SourceCache.prototype,
{
    listeners: [],
    requests: [],       // requests in progress.

    storePartialResponse: function(request, responseText)
    {
        var url = safeGetName(request);

        if (!this.requests[url])
        {
            this.invalidate(url);
            this.requests[url] = request;
        }

        // Convert
        responseText = FBL.convertToUnicode(responseText);

        // Store partial content into the cache.
        this.store(url, responseText);
    },

    stopRequest: function(request)
    {
        var url = safeGetName(request);
        delete this.requests[url];

        // Notify listeners.
        dispatch(this.listeners, "onStoreResponse", [this.window, request, this.cache[url]]);
    },

    storeSplitLines: function(url, lines)  
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.storeSplitLines: " + url, lines);

        var currLines = this.cache[url];
        if (!currLines)
            currLines = this.cache[url] = [];

        // Join the last line with the new first one so, the source code 
        // lines are properly formatted.
        if (currLines.length)
            currLines[currLines.length-1] += lines.shift();

        // Append new lines (if any) into the array for specified url.
        if (lines.length)
            this.cache[url] = currLines.concat(lines);

    	return this.cache[url];
    },

    loadFromCache: function(url, method, file)
    {
        // The ancestor implementation (SourceCache) uses ioService.newChannel, which 
        // can result in additional request to the server (in case the response can't 
        // be loaded from the Firefox cache) - known as double-load problem.
        // This new implementation (TabCache) uses nsITraceableListener so, all responses
        // should be already cached.

        if (FBTrace.DBG_CACHE)
            FBTrace.dumpProperties("tabCache.loadFromCache: FAILED " + 
                this.window.location.href, this.cache);
    },

    // Listeners
    addListener: function(listener)
    {
        this.listeners.push(listener);
    },

    removeListener: function(listener)
    {
        remove(this.listeners, listener);
    }
});

// ************************************************************************************************
// TracingListener implementation

/**
 * This object implements nsIStreamListener interface and is intended to monitor all network 
 * channels (nsIHttpChannel). For every channel a new instance of this object is created and 
 * registered. See Firebug.TabCacheModel.onExamineResponse method.
 */
function TracingListener(win)
{
    this.window = win;
    this.listener = null;
    this.endOfLine = false;
}

TracingListener.prototype = 
{
    onCollectData: function(request, inputStream, offset, count)
    {
        try
        {
            var binaryInputStream = CCIN("@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream");
            var storageStream = CCIN("@mozilla.org/storagestream;1", "nsIStorageStream");
            var binaryOutputStream = CCIN("@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream");
            
            binaryInputStream.setInputStream(inputStream);
            storageStream.init(8192, count, null);
            binaryOutputStream.setOutputStream(storageStream.getOutputStream(0));

            var data = binaryInputStream.readBytes(count);
            binaryOutputStream.writeBytes(data, count);

            // Avoid creating additional empty line if response comes in more pieces 
            // and the split is made just between "\r" and "\n" (Win line-end).
            // So, if the response starts with "\n" while the previous part ended with "\r",
            // remove the first character.
            if (this.endOfLine && data.length && data[0] == "\n")
                data = data.substring(1);

            if (data.length)
                this.endOfLine = data[data.length-1] == "\r";

            // At this moment, initContext is alredy called so, the context is
            // ready and associated with the window.
            var context = TabWatcher.getContextByWindow(this.window);
            if (context) 
            {
                // Store received data into the cache as they come.
                context.sourceCache.storePartialResponse(request, data);
            }
            else 
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.dumpProperties("tabCache.onCollectData NO CONTEXT for: " + this.window.location.href);
            }

            // Let other listeners use the stream.
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
        // Cache only text responses for now.
        if (contentTypes[request.contentType])
        {
            var newStream = this.onCollectData(request, inputStream, offset, count);
            if (newStream)
                inputStream = newStream;
        }
        else
        {
            if (FBTrace.DBG_CACHE)
                FBTrace.dumpProperties("tabCache.onDataAvailable Content-Type not cached: " +
                    request.contentType + ", " + safeGetName(request));
        }

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
            var context = TabWatcher.getContextByWindow(this.window);
            if (context) 
            {
                context.sourceCache.stopRequest(request);
            }
            else 
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.dumpProperties("tabCache.onStopRequest NO CONTEXT for: " + this.window.location.href);
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
