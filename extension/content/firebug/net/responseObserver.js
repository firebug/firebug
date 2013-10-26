/* See license.txt for terms of usage */

define([
    "firebug/lib/xpcom",
    "firebug/lib/trace",
    "firebug/lib/http"
],
function(Xpcom, FBTrace, Http) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

const PrefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
var redirectionLimit = PrefService.getIntPref("network.http.redirection-limit");

// ********************************************************************************************* //
// ChannelListener implementation

/**
 * This object implements nsIStreamListener interface and is intended to monitor all network
 * channels (nsIHttpChannel). A new instance of this object is created and registered an HTTP
 * channel. See Firebug.TabCacheModel.onExamineResponse method.
 */
function ChannelListener(win, request, listener)
/** @lends ChannelListener */
{
    this.window = win;
    this.request = request;
    this.proxyListener = listener;

    this.endOfLine = false;
    this.ignore = false;

    // The original channel listener (see nsITraceableChannel for more).
    this.listener = null;

    // The response will be written into the outputStream of this pipe.
    // Both ends of the pipe must be blocking.
    this.sink = Xpcom.CCIN("@mozilla.org/pipe;1", "nsIPipe");
    this.sink.init(false, false, 0x20000, 0x4000, null);

    // Remember the input stream, so it isn't released by GC.
    // See issue 2788 for more details.
    this.inputStream = this.sink.inputStream;

    this.downloadCounter = 0;

    // Add tee listener into the chain of request stream listeners so, the chain
    // doesn't include a JS code. This way all exceptions are propertly distributed
    // (#515051).
    var tee = Xpcom.CCIN("@mozilla.org/network/stream-listener-tee;1", "nsIStreamListenerTee");
    tee = tee.QueryInterface(Ci.nsIStreamListenerTee);

    var originalListener = request.setNewListener(tee);
    tee.init(originalListener, this.sink.outputStream, this);
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
                    FBTrace.sysout("ChannelListener.setAsyncListener; " +
                        "Don't set, the stream is closed.");
                return;
            }

            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("ChannelListener.setAsyncListener; EXCEPTION " +
                    Http.safeGetRequestName(request), err);
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
                FBTrace.sysout("ChannelListener.setAsyncListener; EXCEPTION " +
                    Http.safeGetRequestName(request), err);
        }
    },

    onCollectData: function(request, context, inputStream, offset, count)
    {
        if (FBTrace.DBG_CACHE && this.ignore)
            FBTrace.sysout("ChannelListener.onCollectData; IGNORE stopping further onCollectData");

        try
        {
            if (this.sink)
            {
                var bis = Xpcom.CCIN("@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream");
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

                var binaryInputStream =
                    Xpcom.CCIN("@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream");
                var storageStream =
                    Xpcom.CCIN("@mozilla.org/storagestream;1", "nsIStorageStream");
                var binaryOutputStream =
                    Xpcom.CCIN("@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream");

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

            // If the method returns false, the rest of the response is ignored (not cached).
            // This is used to limit size of a cached response.
            if (!this.proxyListener.onCollectData(request, data, offset))
            {
                this.ignore = true;
            }

            // Let other listeners use the stream.
            if (storageStream)
                return storageStream.newInputStream(0);
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("ChannelListener.onCollectData EXCEPTION\n", err);
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

            var newStream = this.proxyListener.onDataAvailable(request, requestContext,
                inputStream, offset, count);

            if (newStream)
                inputStream = newStream;

            newStream = this.onCollectData(request, null, inputStream, offset, count);
            if (newStream)
                inputStream = newStream;
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("ChannelListener.onDataAvailable onCollectData FAILS " +
                    "(" + offset + ", " + count + ") EXCEPTION: " +
                    Http.safeGetRequestName(request), err);
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
                    FBTrace.sysout("ChannelListener.onDataAvailable canceling request at " +
                        "(" + offset + ", " + count + ") EXCEPTION: " +
                        Http.safeGetRequestName(request), exc);

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
                FBTrace.sysout("ChannelListener.onStartRequest; " +
                    this.request.contentType + ", " + Http.safeGetRequestName(this.request));

            // Don't register listener twice (redirects, see also bug529536).
            // xxxHonza: I don't know any way how to find out that a listener
            // has been already registered for the channel. So, use the redirection limit
            // to see that the channel has been redirected and so, listener is there.
            if (request.redirectionLimit < redirectionLimit)
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("ChannelListener.onStartRequest; redirected request " +
                        request.redirectionLimit + " (max=" + redirectionLimit + ")");
                return;
            }

            // Due to #489317, the check whether this response should be cached
            // must be done here (the content type is not valid before calling
            // onStartRequest). Let's ignore the response if it should not be cached.
            this.ignore = !this.proxyListener.shouldCacheRequest(request);

            // Notify proxy listener.
            this.proxyListener.onStartRequest(request, requestContext);

            // Listen for incoming data.
            if (FBTrace.DBG_CACHE && !this.sink)
                FBTrace.sysout("ChannelListener.onStartRequest NO SINK stopping setAsyncListener");

            if (FBTrace.DBG_CACHE && this.ignore && this.sink)
                FBTrace.sysout("ChannelListener.onStartRequest IGNORE(shouldCacheRequest) " +
                    "stopping setAsyncListener");

            // Even if the response is marked as ignored we need to read the sink
            // to avoid mem leaks.
            if (this.sink)
                this.setAsyncListener(request, this.sink.inputStream, this);
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("ChannelListener.onStartRequest EXCEPTION\n", err);
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
                    FBTrace.sysout("ChannelListener.onStartRequest canceling request " +
                    "EXCEPTION: " + Http.safeGetRequestName(request), exc);

                request.cancel(exc.result);
            }
        }
    },

    onStopRequest: function(request, requestContext, statusCode)
    {
        try
        {
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("ChannelListener.onStopRequest; " +
                    request.contentType + ", " + Http.safeGetRequestName(request));

            this.proxyListener.onStopRequest(request, requestContext, statusCode);
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("ChannelListener.onStopRequest EXCEPTION\n", err);
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
                FBTrace.sysout("ChannelListener.onInputStreamReady " +
                    Http.safeGetRequestName(this.request));

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
                        FBTrace.sysout("ChannelListener.onInputStreamReady EXCEPTION calling onDataAvailable: " +
                            Http.safeGetRequestName(this.request), err);
                }

                // Listen for further incoming data.
                if (FBTrace.DBG_CACHE && this.ignore)
                    FBTrace.sysout("ChannelListener.onInputStreamReady IGNORE stopping setAsyncListener");

                this.setAsyncListener(this.request, stream, this);
            }
            else
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("ChannelListener.onInputStreamReady NOT a nsIAsyncInputStream",stream);
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("ChannelListener.onInputStreamReady EXCEPTION " +
                    Http.safeGetRequestName(this.request), err);
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
    }
};

// ********************************************************************************************* //

var HttpResponseObserver =
{
    register: function(win, request, listener)
    {
        if (request instanceof Ci.nsITraceableChannel)
            return new ChannelListener(win, request, listener);

        return null;
    }
};

return HttpResponseObserver;

// ********************************************************************************************* //
});
