/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const CLASS_ID = Components.ID("{5AAEB534-FA57-488d-9A73-20C258FC7BDB}");
const CLASS_NAME = "Firebug Channel Listener";
const CONTRACT_ID = "@joehewitt.com/firebug-channel-listener;1";

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var FBTrace = null;

// ************************************************************************************************
// ChannelListener implementation

/**
 * This object implements nsIStreamListener interface and is intended to monitor all network
 * channels (nsIHttpChannel). A new instance of this object is created and registered an HTTP 
 * channel. See Firebug.TabCacheModel.onExamineResponse method.
 */
function ChannelListener()
{
    this.wrappedJSObject = this;

    this.window = null;
    this.endOfLine = false;
    this.ignore = false;

    // The original channel listener (see nsITraceableChannel for more).
    this.listener = null;

    // The proxy listener is used to send events to possible listeners (e.g. net panel)
    // and properly pass the request object through nsIStreamListner to chrome-window space.
    this.proxyListener = null;

    FBTrace = Cc["@joehewitt.com/firebug-trace-service;1"].getService(Ci.nsISupports)
        .wrappedJSObject.getTracer("extensions.firebug");
}

ChannelListener.prototype =
{
    onCollectData: function(request, context, inputStream, offset, count)
    {
        if (this.ignore)
            return;

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

            // Store received data into the cache as they come. If the method returns
            // false, the rest of the response is ignored (not cached). This is used
            // to limit size of a cached response.
            if (!context.sourceCache.storePartialResponse(request, data, this.window))
                this.ignore = true;

            // Let other listeners use the stream.
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
            var context = this.getContext(this.window);
            if (context)
            {
                var newStream = this.onCollectData(request, context, inputStream, offset, count);
                if (newStream)
                    inputStream = newStream;
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener.onDataAvailable " +
                    "(" + offset + ", " + count + ") EXCEPTION: " +
                    safeGetName(request), err);
        }

        if (this.listener)
            this.listener.onDataAvailable(request, requestContext, inputStream, offset, count);
    },

    onStartRequest: function(request, requestContext)
    {
        try
        {
            request = request.QueryInterface(Ci.nsIChannel);

            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.ChannelListener.onStartRequest; " +
                    request.contentType + ", " + safeGetName(request));

            // Pass to the proxy only if the associated context exists (the window is not unloaded)
            var context = this.getContext(this.window);
            if (context)
            {
                // Due to #489317, the check whether this response should be cached
                // or not is done in onStartRequets. Let's ignore the response if it
                // should not be cached.
                this.ignore = !this.proxyListener.onStartRequest(request, requestContext);
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener.onStartRequest EXCEPTION\n", err);
        }

        // Possible exception from the following onStartRequest call is used by Firefox to 
        // cancel the request so, don't eat it (#1712).
        if (this.listener)
            this.listener.onStartRequest(request, requestContext);
    },

    onStopRequest: function(request, requestContext, statusCode)
    {
        try
        {
            var context = this.getContext(this.window);
            if (context)
                this.proxyListener.onStopRequest(request, requestContext, statusCode);
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener.onStopRequest EXCEPTION\n", err);
        }

        if (this.listener)
            this.listener.onStopRequest(request, requestContext, statusCode);
    },

    /* nsITraceableChannel */
    setNewListener: function(listener)
    {
        this.proxyListener = listener;
        return null;
    },

    /* nsISupports */
    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsIStreamListener) ||
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
        // access to TabWatcher and its getContextByWindow method.
        return null;
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

function CCIN(cName, ifaceName)
{
    return Cc[cName].createInstance(Ci[ifaceName]);
}

// ************************************************************************************************
// Service factory

var ListenerFactory = 
{
    createInstance: function (outer, iid)
    {
        if (outer != null)
            throw Cr.NS_ERROR_NO_AGGREGATION;

        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIStreamListener))
        {
            var listener = new ChannelListener();

            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("tabCache.ListenerFactory.createInstance; ");

            return listener.QueryInterface(iid);
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

var ListenerModule =
{
    registerSelf: function(compMgr, fileSpec, location, type)
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

    getClassObject: function(compMgr, cid, iid)
    {
        if (!iid.equals(Ci.nsIFactory))
            throw Cr.NS_ERROR_NOT_IMPLEMENTED;

        if (cid.equals(CLASS_ID))
            return ListenerFactory;

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
    return ListenerModule;
}
