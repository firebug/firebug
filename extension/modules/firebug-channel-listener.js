/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

var EXPORTED_SYMBOLS = ["ChannelListener"];

var FBTrace = {DBG_FAKE: "fake"};

const PrefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch2);
var redirectionLimit = PrefService.getIntPref("network.http.redirection-limit");

// ************************************************************************************************
// ChannelListener implementation

/**
 * This object implements nsIStreamListener interface and is intended to monitor all network
 * channels (nsIHttpChannel). A new instance of this object is created and registered an HTTP
 * channel. See Firebug.TabCacheModel.onExamineResponse method.
 */

function ChannelListener()
{
    this.window = null;
    this.request = null;

    this.endOfLine = false;
    this.ignore = false;

    // The original channel listener (see nsITraceableChannel for more).
    this.listener = null;

    // The proxy listener is used to send events to possible listeners (e.g. net panel)
    // and properly pass the request object through nsIStreamListner to chrome-window space.
    this.proxyListener = null;

    // The response will be written into the outputStream of this pipe.
    // Both ends of the pipe must be blocking. Initialized in TabCacheModel.registerStreamListener.
    this.sink = null;

    if (FBTrace.DBG_FAKE)  // cause the detrace to remove this statement and check for cached tracer
    {
        Cu["import"]("resource://firebug/firebug-trace-service.js");
        FBTrace = traceConsoleService.getTracer("extensions.firebug");
    }

    this.downloadCounter = 0;
}

ChannelListener.prototype =
{

    setAsyncListener: function(request, stream, listener)
    {
        try
        {
            // xxxHonza: is there any other way how to find out the stream is closed?
            // Throws NS_BASE_STREAM_CLOSED if the stream is closed normally or at end-of-file.
            var available = stream.available();
        }
        catch (err)
        {
            if (err.name == "NS_BASE_STREAM_CLOSED")
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.ChannelListener.setAsyncListener; " +
                        "Don't set, the stream is closed.");
                return;
            }

            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener.setAsyncListener; EXCEPTION " +
                    safeGetName(request), err);
            return;
        }

        try
        {
            // Asynchronously wait for the stream to be readable or closed.
            stream.asyncWait(listener, 0, 0, null);
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener.setAsyncListener; EXCEPTION " +
                    safeGetName(request), err);
        }
    },

    onCollectData: function(request, context, inputStream, offset, count)
    {
        if (FBTrace.DBG_CACHE && this.ignore)
            FBTrace.sysout("tabCache.ChannelListener.onCollectData; IGNORE stopping further onCollectData");

        try
        {
            if (this.sink)
            {
                var bis = CCIN("@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream");
                bis.setInputStream(inputStream);
                var data = bis.readBytes(count);

                // Data from the pipe has been consumed (to avoid mem leaks) so, we can end now.
                if (this.ignore)
                    return;
            }
            else
            {
                // In this case, we don't need to read the data.
                if (this.ignore)
                    return;

                var binaryInputStream = CCIN("@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream");
                var storageStream = CCIN("@mozilla.org/storagestream;1", "nsIStorageStream");
                var binaryOutputStream = CCIN("@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream");

                binaryInputStream.setInputStream(inputStream);
                storageStream.init(8192, count, null);
                binaryOutputStream.setOutputStream(storageStream.getOutputStream(0));

                var data = binaryInputStream.readBytes(count);
                binaryOutputStream.writeBytes(data, count);
            }

            // Avoid creating additional empty line if response comes in more pieces
            // and the split is made just between "\r" and "\n" (Win line-end).
            // So, if the response starts with "\n" while the previous part ended with "\r",
            // remove the first character.
            if (this.endOfLine && data.length && data[0] == "\n")
                data = data.substring(1);

            if (data.length)
                this.endOfLine = data[data.length-1] == "\r";

            // Store received data into the cache as they come. If the method returns
            // false, the rest of the response is ignored (not cached). This is used
            // to limit size of a cached response.
            if (!context.sourceCache.storePartialResponse(request, data, this.window, offset))
            {
                this.ignore = true;
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.ChannelListener.onCollectData IGNORE SET " +
                        "because of storePartialResponse");
            }

            // Let other listeners use the stream.
            if (storageStream)
                return storageStream.newInputStream(0);
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener.onCollectData EXCEPTION\n", err);
        }

        return null;
    },

    /* nsIStreamListener */
    onDataAvailable: function(request, requestContext, inputStream, offset, count)
    {
        try
        {
            // Force a garbage collection cycle, see:
            // https://bugzilla.mozilla.org/show_bug.cgi?id=638075
            this.downloadCounter += count;
            if (this.downloadCounter > (1024*1024*2))
            {
                this.downloadCounter = 0;
                Cu.forceGC();
            }

            // Use wrappedJSObject to bypass IDL definition that doesn't return any value.
            var newStream = this.proxyListener.wrappedJSObject.onDataAvailable(request, requestContext,
                inputStream, offset, count);

            if (newStream)
                inputStream = newStream;

            var context = this.getContext(this.window);
            if (context)
            {
                newStream = this.onCollectData(request, context, inputStream, offset, count);
                if (newStream)
                    inputStream = newStream;
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener.onDataAvailable onCollectData FAILS " +
                    "(" + offset + ", " + count + ") EXCEPTION: " +
                    safeGetName(request), err);
        }

        if (this.listener)
        {
            try  // https://bugzilla.mozilla.org/show_bug.cgi?id=492534
            {
                this.listener.onDataAvailable(request, requestContext, inputStream, offset, count);
            }
            catch(exc)
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.ChannelListener.onDataAvailable cancelling request at " +
                    "(" + offset + ", " + count + ") EXCEPTION: " +
                    safeGetName(request), exc);

                request.cancel(exc.result);
            }
        }
    },

    onStartRequest: function(request, requestContext)
    {
        try
        {
            this.request = request.QueryInterface(Ci.nsIHttpChannel);

            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.ChannelListener.onStartRequest; " +
                    this.request.contentType + ", " + safeGetName(this.request));

            // Don't register listener twice (redirects, see also bug529536).
            // xxxHonza: I don't know any way how to find out that a listener
            // has been already registered for the channel. So, use the redirection limit
            // to see that the channel has been redirected and so, listener is there.
            if (request.redirectionLimit < redirectionLimit)
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.ChannelListener.onStartRequest; redirected request " +
                        request.redirectionLimit + " (max=" + redirectionLimit + ")");
                return;
            }

            // Pass to the proxy only if the associated context exists (the window is not unloaded)
            var context = this.getContext(this.window);
            if (context)
            {
                // Due to #489317, the check whether this response should be cached
                // must be done here (the content type is not valid before calling
                // onStartRequest). Let's ignore the response if it should not be cached.
                this.ignore = !this.shouldCacheRequest(request);

                // Notify proxy listener.
                this.proxyListener.onStartRequest(request, requestContext);

                // Listen for incoming data.
                if (FBTrace.DBG_CACHE && !this.sink)
                    FBTrace.sysout("tabCache.ChannelListener.onStartRequest NO SINK stopping setAsyncListener");
                if (FBTrace.DBG_CACHE && this.ignore && this.sink)
                    FBTrace.sysout("tabCache.ChannelListener.onStartRequest IGNORE(shouldCacheRequest) stopping setAsyncListener");

                // Even if the response is marked as ignored we need to read the sink
                // to avoid mem leaks.
                if (this.sink)
                    this.setAsyncListener(request, this.sink.inputStream, this);
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener.onStartRequest EXCEPTION\n", err);
        }

        if (this.listener)
        {
            try  // https://bugzilla.mozilla.org/show_bug.cgi?id=492534
            {
                this.listener.onStartRequest(request, requestContext);
            }
            catch(exc)
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.ChannelListener.onStartRequest cancelling request " +
                    "EXCEPTION: " + safeGetName(request), exc);

                request.cancel(exc.result);
            }
        }
    },

    onStopRequest: function(request, requestContext, statusCode)
    {
        try
        {
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.ChannelListener.onStopRequest; " +
                    request.contentType + ", " + safeGetName(request));

            var context = this.getContext(this.window);
            if (context)
                this.proxyListener.onStopRequest(request, requestContext, statusCode);
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener.onStopRequest EXCEPTION\n", err);
        }

        // The request body has been downloaded. Remove the listener (the last parameter
        // is null) since it's not needed now.
        if (this.sink)
            this.setAsyncListener(request, this.sink.inputStream, null);

        if (this.listener)
            this.listener.onStopRequest(request, requestContext, statusCode);
    },

    /* nsITraceableChannel */
    setNewListener: function(listener)
    {
        this.proxyListener = listener;
        return null;
    },

    /* nsIInputStreamCallback */
    onInputStreamReady : function(stream)
    {
        try
        {
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.ChannelListener.onInputStreamReady " +
                    safeGetName(this.request));

            if (stream instanceof Ci.nsIAsyncInputStream)
            {
                try
                {
                    var offset = stream.tell();
                    var available = stream.available();
                    this.onDataAvailable(this.request, null, stream, offset, available);
                }
                catch (err)
                {
                    // stream.available throws an exception if the stream is closed,
                    // which is ok, since this callback can be called even in this
                    // situations.
                    if (FBTrace.DBG_CACHE)
                        FBTrace.sysout("tabCache.ChannelListener.onInputStreamReady EXCEPTION calling onDataAvailable:  " +
                            safeGetName(this.request), err);
                }

                // Listen for further incoming data.
                if (FBTrace.DBG_CACHE && this.ignore)
                    FBTrace.sysout("tabCache.ChannelListener.onInputStreamReady IGNORE stopping setAsyncListener");

                this.setAsyncListener(this.request, stream, this);
            }
            else
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.ChannelListener.onInputStreamReady NOT a nsIAsyncInputStream",stream);
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener.onInputStreamReady EXCEPTION " +
                    safeGetName(this.request), err);
        }
    },

    /* nsISupports */
    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsIStreamListener) ||
            iid.equals(Ci.nsIInputStreamCallback) ||
            iid.equals(Ci.nsISupportsWeakReference) ||
            iid.equals(Ci.nsITraceableChannel) ||
            iid.equals(Ci.nsISupports))
        {
            return this;
        }

        throw Components.results.NS_NOINTERFACE;
    },

    getContext: function(win)
    {
        // This must be overridden in tabCache. This scope doesn't have an
        // access to Firebug.TabWatcher and its getContextByWindow method.
        return null;
    }
}

// ************************************************************************************************

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

function CCIN(cName, ifaceName)
{
    return Cc[cName].createInstance(Ci[ifaceName]);
}

