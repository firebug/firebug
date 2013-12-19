/* See license.txt for terms of usage */

define([
    "firebug/chrome/activableModule",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/xpcom",
    "firebug/net/requestObserver",
    "firebug/net/responseObserver",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/lib/http",
    "firebug/lib/string",
    "firebug/chrome/window",
    "firebug/net/jsonViewer",
    "firebug/trace/traceModule",
    "firebug/trace/traceListener",
    "firebug/net/sourceCache",
    "firebug/lib/options",
],
function(ActivableModule, Obj, Firebug, Xpcom, HttpRequestObserver, HttpResponseObserver, Locale,
    Events, Url, Http, Str, Win, JSONViewerModel, TraceModule, TraceListener, SourceCache, Options) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

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
    "text/x-setext": 1,
    "text/richtext": 1,
    "text/javascript": 1,
    "text/jscript": 1,
    "text/tab-separated-values": 1,
    "text/rdf": 1,
    "text/xif": 1,
    "text/ecmascript": 1,
    "text/vnd.curl": 1,
    "text/x-json": 1,
    "text/x-js": 1,
    "text/js": 1,
    "text/vbscript": 1,
    "view-source": 1,
    "view-fragment": 1,
    "application/xml": 1,
    "application/xhtml+xml": 1,
    "application/atom+xml": 1,
    "application/rss+xml": 1,
    "application/mathml+xml": 1,
    "application/rdf+xml": 1,
    "application/vnd.mozilla.maybe.feed": 1,
    "application/vnd.mozilla.xul+xml": 1,
    "application/javascript": 1,
    "application/x-javascript": 1,
    "application/x-httpd-php": 1,
    "application/rdf+xml": 1,
    "application/ecmascript": 1,
    "application/http-index-format": 1,
    "application/json": 1,
    "application/x-js": 1,
    "multipart/mixed" : 1,
    "multipart/x-mixed-replace" : 1,
    "image/svg+xml" : 1
};

// ********************************************************************************************* //
// Model implementation

/**
 * Implementation of cache model. The only purpose of this object is to register an HTTP
 * observer, so that HTTP communication can be intercepted and all incoming data stored
 * within a cache.
 */
Firebug.TabCacheModel = Obj.extend(ActivableModule,
{
    dispatchName: "tabCache",
    contentTypes: contentTypes,
    fbListeners: [],

    initialize: function()
    {
        ActivableModule.initialize.apply(this, arguments);

        this.traceListener = new TraceListener("tabCache.", "DBG_CACHE", false);
        TraceModule.addListener(this.traceListener);
    },

    initializeUI: function(owner)
    {
        ActivableModule.initializeUI.apply(this, arguments);

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.initializeUI;");

        // Read additional text MIME types from preferences.
        var mimeTypes = Options.get("cache.mimeTypes");
        if (mimeTypes)
        {
            var list = mimeTypes.split(" ");
            for (var i=0; i<list.length; i++)
                contentTypes[list[i]] = 1;
        }

        // Merge with JSON types
        var jsonTypes = JSONViewerModel.contentTypes;
        for (var p in jsonTypes)
            contentTypes[p] = 1;
    },

    onObserverChange: function(observer)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.onObserverChange; hasObservers: " + this.hasObservers());

        // If Firebug is in action, we need to test to see if we need to addObserver
        if (!Firebug.getSuspended())
            this.onResumeFirebug();
    },

    onResumeFirebug: function()
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.onResumeFirebug; hasObsevers: " + this.hasObservers());

        if (this.hasObservers() && !this.observing)
        {
            HttpRequestObserver.addObserver(this, "firebug-http-event", false);
            this.observing = true;
        }
    },

    onSuspendFirebug: function()
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.onSuspendFirebug; hasObsevers: " + this.hasObservers());

        if (this.observing)
        {
            HttpRequestObserver.removeObserver(this, "firebug-http-event");
            this.observing = false;
        }
    },

    shutdown: function()
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.shutdown; Cache model destroyed.");

        TraceModule.removeListener(this.traceListener);

        if (this.observing)
            HttpRequestObserver.removeObserver(this, "firebug-http-event");
    },

    initContext: function(context)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.initContext for: " + context.getName());
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // nsIObserver

    observe: function(subject, topic, data)
    {
        try
        {
            if (!(subject instanceof Ci.nsIHttpChannel))
                return;

            // XXXjjb this same code is in net.js, better to have it only once
            var win = Http.getWindowForRequest(subject);
            if (!win)
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.observe; " + topic + ", NO WINDOW");
                return;
            }

            if (topic == "http-on-modify-request")
                this.onModifyRequest(subject, win);
            else if (topic == "http-on-examine-response")
                this.onExamineResponse(subject, win);
            else if (topic == "http-on-examine-cached-response")
                this.onCachedResponse(subject, win);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.observe EXCEPTION", err);
        }
    },

    onModifyRequest: function(request, win)
    {
    },

    onExamineResponse: function(request, win)
    {
        this.registerStreamListener(request, win);
    },

    onCachedResponse: function(request, win)
    {
        this.registerStreamListener(request, win);
    },

    registerStreamListener: function(request, win, forceRegister)
    {
        if (Firebug.getSuspended() && !forceRegister)
        {
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.registerStreamListener; DO NOT TRACK, " +
                    "Firebug suspended for: " + Http.safeGetRequestName(request));
            return;
        }

        if (!this.hasObservers())
            return;

        try
        {
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.registerStreamListener; " +
                    Http.safeGetRequestName(request));

            HttpResponseObserver.register(win, request, new ChannelListenerProxy(win));
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.Register Traceable Listener EXCEPTION", err);
        }
    },

    shouldCacheRequest: function(request)
    {
        if (!(request instanceof Ci.nsIHttpChannel))
            return;

        // Allow to customize caching rules.
        if (Events.dispatch2(this.fbListeners, "shouldCacheRequest", [request]))
            return true;

        // Cache only text responses for now.
        var contentType = request.contentType;
        if (contentType)
            contentType = contentType.split(";")[0];

        contentType = Str.trim(contentType);
        if (contentTypes[contentType])
            return true;

        // Hack to work around application/octet-stream for js files (see issue 2063).
        // Let's cache all files with js extensions.
        var extension = Url.getFileExtension(Http.safeGetRequestName(request));
        if (extension == "js")
            return true;

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.shouldCacheRequest; Request not cached: " +
                request.contentType + ", " + Http.safeGetRequestName(request));

        return false;
    },
});

// ********************************************************************************************* //
// Tab Cache

/**
 * This cache object is intended to cache all responses made by a specific tab.
 * The implementation is based on nsITraceableChannel interface introduced in
 * Firefox 3.0.4. This interface allows to intercept all incoming HTTP data.
 *
 * This object replaces the SourceCache, which still exist only for backward
 * compatibility.
 *
 * The object is derived from SourceCache, so the same interface and most of the
 * implementation is used.
 */
Firebug.TabCache = function(context)
{
    if (FBTrace.DBG_CACHE)
        FBTrace.sysout("tabCache.TabCache Created for: " + context.getName());

    SourceCache.call(this, context);

    // Set of HTTP responses (URLs) that has been limited in the cache.
    // Used by the UI to notify the user.
    this.limitedResponses = {};
};

Firebug.TabCache.prototype = Obj.extend(SourceCache.prototype,
{
    // Responses in progress
    responses: [],

    storePartialResponse: function(request, responseText, win, offset)
    {
        if (!offset)
            offset = 0;

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.storePartialResponse " + Http.safeGetRequestName(request),
                request.contentCharset);

        var url = Http.safeGetRequestName(request);
        var response = this.getResponse(request);

        // Skip any response data that we have received before (f ex when
        // response packets are repeated due to quirks in how authentication
        // requests are projected to the channel listener)
        var newRawSize = offset + responseText.length;
        var addRawBytes = newRawSize - response.rawSize;

        if (responseText.length > addRawBytes)
            responseText = responseText.substr(responseText.length - addRawBytes);

        try
        {
            responseText = Str.convertToUnicode(responseText, win.document.characterSet);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.storePartialResponse EXCEPTION " +
                    Http.safeGetRequestName(request), err);

            // Even responses that are not converted are stored into the cache.
            // return false;
        }

        // Size of each response is limited.
        var limitNotReached = true;
        var responseSizeLimit = Options.get("cache.responseLimit");
        if (response.size + responseText.length >= responseSizeLimit)
        {
            limitNotReached = false;
            responseText = responseText.substr(0, responseSizeLimit - response.size);

            this.limitedResponses[url] = true;

            if (FBTrace.DBG_CACHE)
            {
                FBTrace.sysout("tabCache.storePartialResponse; Maximum response limit " +
                    "reached for: " + url);
            }
        }

        response.size += responseText.length;
        response.rawSize = newRawSize;

        // Store partial content into the cache.
        this.store(url, responseText);

        // Return false if furhter parts of this response should be ignored.
        return limitNotReached;
    },

    isLimited: function(url)
    {
        return this.limitedResponses[url];
    },

    getResponse: function(request)
    {
        var url = Http.safeGetRequestName(request);
        var response = this.responses[url];
        if (!response)
        {
            this.invalidate(url);
            this.responses[url] = response = {
                request: request,
                size: 0,
                rawSize: 0
            };
        }

        return response;
    },

    storeSplitLines: function(url, lines)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.storeSplitLines: " + url, lines);

        var currLines = this.cache[url];
        if (!currLines)
            currLines = this.cache[url] = [];

        // Join the last line with the new first one to make the source code
        // lines properly formatted...
        if (currLines.length && lines.length)
        {
            // ... but only if the last line isn't already completed.
            var lastLine = currLines[currLines.length-1];
            if (lastLine && lastLine.search(/\r|\n/) == -1)
                currLines[currLines.length-1] += lines.shift();
        }

        // Append new lines (if any) into the array for specified url.
        if (lines.length)
            this.cache[url] = currLines.concat(lines);

        return this.cache[url];
    },

    loadFromCache: function(url, method, file)
    {
        // The ancestor implementation (SourceCache) uses ioService.newChannel, which
        // can result in additional request to the server (in case the response can't
        // be loaded from the Firefox cache) - known as the double-load problem.
        // This new implementation (TabCache) uses nsITraceableChannel, so all responses
        // should be already cached.

        // xxxHonza: TODO entire implementation of this method should be removed in Firebug 1.5
        // xxxHonza: let's try to get the response from the cache till #449198 is fixed.
        var stream;
        var responseText;
        try
        {
            if (!url)
                return responseText;

            if (url === "<unknown>")
                return [Locale.$STR("message.sourceNotAvailableFor") + ": " + url];

            var channel = ioService.newChannel(url, null, null);

            // These flag combination doesn't repost the request.
            channel.loadFlags = Ci.nsIRequest.LOAD_FROM_CACHE |
                Ci.nsICachingChannel.LOAD_ONLY_FROM_CACHE |
                Ci.nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE_IF_BUSY;

            var charset = "UTF-8";

            if (!this.context.window)
            {
                if (FBTrace.DBG_ERRORS)
                {
                    FBTrace.sysout("tabCache.loadFromCache; ERROR this.context.window " +
                        "is undefined");
                }
            }

            var doc = this.context.window ? this.context.window.document : null;
            if (doc)
                charset = doc.characterSet;

            stream = channel.open();

            // The response doesn't have to be in the browser cache.
            if (!stream.available())
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.loadFromCache; Failed to load source for: " + url);

                stream.close();
                return [Locale.$STR("message.sourceNotAvailableFor") + ": " + url];
            }

            // Don't load responses that shouldn't be cached.
            if (!Firebug.TabCacheModel.shouldCacheRequest(channel))
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.loadFromCache; The resource from this URL is not text: " + url);

                stream.close();
                return [Locale.$STR("message.The resource from this URL is not text") + ": " + url];
            }

            responseText = Http.readFromStream(stream, charset);

            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.loadFromCache (response coming from FF Cache) " +
                    url, responseText);

            responseText = this.store(url, responseText);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.loadFromCache EXCEPTION on url \'" + url +"\'", err);
        }
        finally
        {
            if (stream)
                stream.close();
        }

        return responseText;
    },

    // nsIStreamListener - callbacks from channel stream listener component.
    onStartRequest: function(request, requestContext)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.channel.startRequest: " + Http.safeGetRequestName(request));

        // Make sure the response-entry (used to count total response size) is properly
        // initialized (cleared) now. If no data is received, the response entry remains empty.
        var response = this.getResponse(request);

        Events.dispatch(Firebug.TabCacheModel.fbListeners, "onStartRequest", [this.context, request]);
        Events.dispatch(this.fbListeners, "onStartRequest", [this.context, request]);
    },

    onDataAvailable: function(request, requestContext, inputStream, offset, count)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.channel.onDataAvailable: " + Http.safeGetRequestName(request));

        // If the stream is read a new one must be provided (the stream doesn't implement
        // nsISeekableStream).
        var stream = {
            value: inputStream
        };

        Events.dispatch(Firebug.TabCacheModel.fbListeners, "onDataAvailable",
            [this.context, request, requestContext, stream, offset, count]);
        Events.dispatch(this.fbListeners, "onDataAvailable", [this.context,
            request, requestContext, stream, offset, count]);

        return stream.value;
    },

    onStopRequest: function(request, requestContext, statusCode)
    {
        // The response has been received; remove the request from the list of
        // current responses.
        var url = Http.safeGetRequestName(request);
        delete this.responses[url];

        var lines = this.cache[this.removeAnchor(url)];
        var responseText = lines ? lines.join("") : "";

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.channel.stopRequest: " + Http.safeGetRequestName(request),
                responseText);

        Events.dispatch(Firebug.TabCacheModel.fbListeners, "onStopRequest",
            [this.context, request, responseText]);
        Events.dispatch(this.fbListeners, "onStopRequest", [this.context, request, responseText]);
    }
});

// ********************************************************************************************* //
// Proxy Listener

function ChannelListenerProxy(win)
{
    this.window = win;
}

ChannelListenerProxy.prototype =
{
    onStartRequest: function(request, requestContext)
    {
        var context = this.getContext();
        if (context)
            context.sourceCache.onStartRequest(request, requestContext);
    },

    onDataAvailable: function(request, requestContext, inputStream, offset, count)
    {
        var context = this.getContext();
        if (!context)
            return null;

        return context.sourceCache.onDataAvailable(request, requestContext,
            inputStream, offset, count);
    },

    onStopRequest: function(request, requestContext, statusCode)
    {
        var context = this.getContext();
        if (context)
            context.sourceCache.onStopRequest(request, requestContext, statusCode);
    },

    onCollectData: function(request, data, offset)
    {
        var context = this.getContext();
        if (!context)
        {
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.channel.onCollectData: NO CONTEXT " +
                    Http.safeGetRequestName(request), data);

            return false;
        }

        // Store received data into the cache as they come. If the method returns
        // false, the rest of the response is ignored (not cached). This is used
        // to limit size of a cached response.
        return context.sourceCache.storePartialResponse(request, data, this.window, offset);
    },

    getContext: function()
    {
        try
        {
            return Firebug.connection.getContextByWindow(this.window);
        }
        catch (e)
        {
        }
        return null;
    },

    shouldCacheRequest: function(request)
    {
        try
        {
            return Firebug.TabCacheModel.shouldCacheRequest(request);
        }
        catch (err)
        {
        }
        return false;
    }
};

// ********************************************************************************************* //
// Registration

Firebug.registerActivableModule(Firebug.TabCacheModel);

return Firebug.TabCacheModel;

// ********************************************************************************************* //
});
