/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

try 
{
const CLASS_ID = Components.ID("{5AAEB534-FA57-488d-9A73-20C258FC7BDB}");
const CLASS_NAME = "Firebug Channel Listener";
const CONTRACT_ID = "@joehewitt.com/firebug-channel-listener;1";

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch2);

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
    "application/vnd.mozilla.xul+xml": 1,
    "application/javascript": 1,
    "application/x-javascript": 1,
    "application/x-httpd-php": 1,
    "application/rdf+xml": 1,
    "application/ecmascript": 1,
    "application/http-index-format": 1,
    "application/json": 1,
    "application/x-js": 1,
};

var FBTrace = null;

// ************************************************************************************************

function initialize()
{
    try
    {
        // Read additional text mime-types from preferences.
        var mimeTypes = prefs.getCharPref("extensions.firebug.cache.mimeTypes");
        if (mimeTypes) 
        {
            var list = mimeTypes.split(" ");
            for (var i=0; i<list.length; i++)
                contentTypes[list[i]] = 1;
        }
    }
    catch (err)
    {
        dump("tabCache.ChannelListener.initialize; EXCEPTION", err);
    }
}

// Initialize list of mime types.
initialize();

// ************************************************************************************************
// ChannelListener implementation

/**
 * This object implements nsIStreamListener interface and is intended to monitor all network
 * channels (nsIHttpChannel). For every channel a new instance of this object is created and
 * registered. See Firebug.TabCacheModel.onExamineResponse method.
 */
function ChannelListener()
{
    this.wrappedJSObject = this;

    this.window = null;
    this.listener = null;
    this.endOfLine = false;
    this.ignore = false;

    FBTrace = Cc["@joehewitt.com/firebug-trace-service;1"].getService(Ci.nsISupports)
        .wrappedJSObject.getTracer("extensions.firebug");
}

ChannelListener.prototype =
{
    onCollectData: function(request, inputStream, offset, count)
    {
        try
        {
            // At this moment, initContext should be alredy called so, the context is
            // ready and associated with the window.
            var context = this.getContext(this.window);
            if (!context)
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.ChannelListener.onCollectData NO CONTEXT for: " + this.window.location.href);
                return inputStream;
            }

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

            // Store received data into the cache as they come.
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
            if (!this.ignore)
            {
                request.QueryInterface(Ci.nsIHttpChannel);

                // Cache only text responses for now.
                var contentType = request.contentType;
                if (contentType)
                    contentType = contentType.split(";")[0];

                if (contentTypes[contentType])
                {
                    var newStream = this.onCollectData(request, inputStream, offset, count);
                    if (newStream)
                        inputStream = newStream;
                }
                else
                {
                    if (FBTrace.DBG_CACHE)
                        FBTrace.sysout("tabCache.ChannelListener.onDataAvailable Content-Type not cached: " +
                            request.contentType + ", " + safeGetName(request));
                }
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener.onDataAvailable " +
                    "(" + offset + ", " + count + ") EXCEPTION: " +
                    safeGetName(request), err);
        }

        try
        {
            if (this.listener)
                this.listener.onDataAvailable(request, requestContext, inputStream, offset, count);
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener; originalListener.onDataAvailable " +
                    "(" + offset + ", " + count + ") EXCEPTION: " +
                    safeGetName(request), err);
        }
    },

    onStartRequest: function(request, requestContext)
    {
        try
        {
            var context = this.getContext(this.window);
            if (context)
            {
                context.sourceCache.startRequest(request);
            }
            else
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.ChannelListener.onStartRequest; NO CONTEXT for: " +
                        this.window.location.href);
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener.onStartRequest EXCEPTION\n", err);
        }

        try
        {
            if (this.listener)
                this.listener.onStartRequest(request, requestContext);
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener; originalListener.onStartRequest EXCEPTION\n", err);
        }
    },

    onStopRequest: function(request, requestContext, statusCode)
    {
        try
        {
            var context = this.getContext(this.window);
            if (context)
            {
                context.sourceCache.stopRequest(request);
            }
            else
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("tabCache.ChannelListener.onStopRequest NO CONTEXT for: " + 
                        (this.window.location ? this.window.location.href : "<closed-window?>"));
            }
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener.onStopRequest EXCEPTION\n", err);
        }

        try
        {
            if (this.listener)
                this.listener.onStopRequest(request, requestContext, statusCode);
        }
        catch (err)
        {
            if (FBTrace.DBG_CACHE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabCache.ChannelListener; originalListener.onStopRequest EXCEPTION\n", err);
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
    },

    getContext: function(win)
    {
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

// ************************************************************************************************


} catch (e) {
    dump("EXCPETION " + e + "/n");
}

