/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const httpObserver = Cc["@joehewitt.com/firebug-http-observer;1"].getService(Ci.nsIObserverService);
const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

// Maximum cached size of a signle response (bytes)
var responseSizeLimit = 1024 * 1024 * 5;

// ************************************************************************************************
// Model implementation

/**
 * Implementation of cache model. The only purpose of this object is to register an HTTP
 * observer so, HTTP communication can be interecepted and all incoming data stored within
 * a cache.
 */
Firebug.TabCacheModel = extend(Firebug.Module,
{
    dispatchName: "tabCache",
    initializeUI: function(owner)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.initializeUI; Cache model initialized.");

        // Read maximum size limit for cached response from preferences.
        responseSizeLimit = Firebug.getPref(Firebug.prefDomain, "cache.responseLimit");

        // Register for HTTP events.
        if (Ci.nsITraceableChannel)
            httpObserver.addObserver(this, "firebug-http-event", false);
    },

    shutdown: function()
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.shutdown; Cache model destroyed.");

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
            else if (topic == "http-on-examine-cached-response")
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
            request.QueryInterface(Ci.nsITraceableChannel);

            // Register traceable channel listener in order to intercept all incoming data for
            // this context/tab. nsITraceableChannel interface is introduced in Firefox 3.0.4
            var newListener = CCIN("@joehewitt.com/firebug-channel-listener;1", "nsIStreamListener");
            newListener.wrappedJSObject.window = win;
            newListener.wrappedJSObject.listener = request.setNewListener(newListener);

            //xxxHonza: this is a workaround for the tracing-listener to get the 
            // right context. Notice that if the window (parent browser) is closed
            // the TabWatcher is undefined. But in such a case no cache is needed anyway.
            newListener.wrappedJSObject.getContext = function(win)
            {
                try {
                    return TabWatcher.getContextByWindow(win);
                } catch (err){}
                return null;
            }
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
Firebug.TabCache = function(win, context)
{
    if (FBTrace.DBG_CACHE)
        FBTrace.dumpProperties("tabCache.TabCache Created for: " + win.location.href);

    Firebug.SourceCache.call(this, win, context);
};

var ListeningCache = extend(Firebug.SourceCache.prototype, new Firebug.Listener());
Firebug.TabCache.prototype = extend(ListeningCache,
{
    responses: [],       // responses in progress.

    storePartialResponse: function(request, responseText, win)
    {
        try
        {
            responseText = FBL.convertToUnicode(responseText, win.document.characterSet);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.storePartialResponse EXCEPTION " +
                    safeGetName(request), err);

            // Even responses that are not converted are stored into the cache.
            // return false;
        }

        var url = safeGetName(request);
        var response = this.getResponse(request);

        // Size of each response is limited.
        var limitNotReached = true;
        if (response.size + responseText.length >= responseSizeLimit)
        {
            limitNotReached = false;
            responseText = responseText.substr(0, responseSizeLimit - response.size);
            FBTrace.sysout("tabCache.storePartialResponse Max size limit reached for: " + url);
        }

        response.size += responseText.length;

        // Store partial content into the cache.
        this.store(url, responseText);

        // Return false if furhter parts of this response should be ignored.
        return limitNotReached;
    },

    getResponse: function(request)
    {
        var url = safeGetName(request);
        var response = this.responses[url];
        if (!response)
        {
            this.invalidate(url);
            this.responses[url] = response = {
                request: request,
                size: 0
            };
        }

        return response;
    },

    startRequest: function(request)
    {
        // Make sure the response-entry (used to count total response size) is properly 
        // initialized (cleared) now. If no data is received, the response entry remains empty.
        var response = this.getResponse(request);

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.startRequest: " + safeGetName(request));
    },

    stopRequest: function(request)
    {
        var url = safeGetName(request);
        delete this.responses[url];

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.stopRequest: " + url);

        // Notify listeners.
        dispatch(this.fbListeners, "onStoreResponse", [this.window, request, this.cache[url]]);
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
        // This new implementation (TabCache) uses nsITraceableChannel so, all responses
        // should be already cached.

        // xxxHonza: let's try to get the response from the cache till #449198 is fixed.
        var stream;
        var responseText;
        try
        {
            var channel = ioService.newChannel(url, null, null);

            // These flag combination doesn't repost the request.
            channel.loadFlags = Ci.nsIRequest.LOAD_FROM_CACHE |
                Ci.nsICachingChannel.LOAD_ONLY_FROM_CACHE |
                Ci.nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE_IF_BUSY;

            var charset = "UTF-8";
            var doc = this.context.window.document;
            if (doc)
                charset = doc.characterSet;

            stream = channel.open();
            responseText = readFromStream(stream, charset);

            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.loadFromCache (response coming from FF Cache) " +
                    url, responseText);

            responseText = this.store(url, responseText);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERROR || FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.loadFromCache EXCEPTION " + url, err);
        }
        finally
        {
            if(stream)
                stream.close();
        }

        return responseText;
    }
});

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
