/* See license.txt for terms of usage */

define([
    "firebug/chrome/eventSource",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/xpcom",
    "firebug/lib/url",
    "firebug/lib/http",
    "firebug/lib/options",
    "firebug/lib/string"
],
function(EventSource, Obj, Firebug, Xpcom, Url, Http, Options, Str) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIIOService = Ci.nsIIOService;
const nsIRequest = Ci.nsIRequest;
const nsICachingChannel = Ci.nsICachingChannel;
const nsIScriptableInputStream = Ci.nsIScriptableInputStream;
const nsIUploadChannel = Ci.nsIUploadChannel;
const nsIHttpChannel = Ci.nsIHttpChannel;

const IOService = Cc["@mozilla.org/network/io-service;1"];
const ioService = IOService.getService(nsIIOService);
const ScriptableInputStream = Cc["@mozilla.org/scriptableinputstream;1"];
const chromeReg = Xpcom.CCSV("@mozilla.org/chrome/chrome-registry;1", "nsIToolkitChromeRegistry");

const LOAD_FROM_CACHE = nsIRequest.LOAD_FROM_CACHE;
const LOAD_BYPASS_LOCAL_CACHE_IF_BUSY = nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE_IF_BUSY;

const NS_BINDING_ABORTED = 0x804b0002;

// ********************************************************************************************* //

Firebug.SourceCache = function(context)
{
    this.context = context;
    this.cache = {};
};

Firebug.SourceCache.prototype = Obj.extend(new EventSource(),
{
    isCached: function(url)
    {
        return (this.cache[url] ? true : false);
    },

    loadText: function(url, method, file)
    {
        var lines = this.load(url, method, file);
        return lines ? lines.join("") : null;
    },

    load: function(url, method, file)
    {
        if (FBTrace.DBG_CACHE)
        {
            FBTrace.sysout("sourceCache.load: " + url);

            if (!this.cache.hasOwnProperty(url) && this.cache[url])
                FBTrace.sysout("sourceCache.load; ERROR - hasOwnProperty returns false, " +
                    "but the URL is cached: " + url, this.cache[url]);
        }

        // xxxHonza: sometimes hasOwnProperty return false even if the URL is obviously there.
        //if (this.cache.hasOwnProperty(url))
        var response = this.cache[this.removeAnchor(url)];
        if (response)
            return response;

        if (FBTrace.DBG_CACHE)
        {
            var urls = [];
            for (var prop in this.cache)
                urls.push(prop);

            FBTrace.sysout("sourceCache.load: Not in the Firebug internal cache", urls);
        }

        var d = Url.splitDataURL(url);  //TODO the RE should not have baseLine
        if (d)
        {
            var src = d.encodedContent;
            var data = decodeURIComponent(src);
            var lines = Str.splitLines(data);
            this.cache[url] = lines;

            return lines;
        }

        var j = Url.reJavascript.exec(url);
        if (j)
        {
            var src = url.substring(Url.reJavascript.lastIndex);
            var lines = Str.splitLines(src);
            this.cache[url] = lines;

            return lines;
        }

        var c = Url.reChrome.test(url);
        if (c)
        {
            if (Options.get("filterSystemURLs"))
                return ["Filtered chrome url "+url];  // ignore chrome

            // If the chrome.manifest has  xpcnativewrappers=no, platform munges the url
            var reWrapperMunge = /(\S*)\s*->\s*(\S*)/;
            var m = reWrapperMunge.exec(url);
            if (m)
            {
                url = m[2];

                if (FBTrace.DBG_CACHE)
                {
                    FBTrace.sysout("sourceCache found munged xpcnativewrapper url " +
                        "and set it to " + url + " m " + m + " m[0]:" + m[0] + " [1]" +
                        m[1], m);
                }
            }

            var chromeURI = Url.makeURI(url);
            if (!chromeURI)
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("sourceCache.load failed to convert chrome to local: " + url);

                return ["sourceCache failed to make URI from " + url];
            }

            var localURI = chromeReg.convertChromeURL(chromeURI);
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("sourceCache.load converting chrome to local: " + url,
                    " -> "+localURI.spec);

            return this.loadFromLocal(localURI.spec);
        }

        c = Url.reFile.test(url);
        if (c)
        {
            return this.loadFromLocal(url);
        }

        if (Str.hasPrefix(url, 'resource://'))
        {
            var fileURL = Url.resourceToFile(url);
            return this.loadFromLocal(url);
        }

        // Unfortunately, the URL isn't available, so let's try to use FF cache.
        // Note that an additional network request to the server could be made
        // in this method (a double-load).
        return this.loadFromCache(url, method, file);
    },

    store: function(url, text)
    {
        var tempURL = this.removeAnchor(url);

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("sourceCache for " + this.context.getName() + " store url=" +
                url + ((tempURL != url) ? " -> " + tempURL : ""), text);

        var lines = Str.splitLines(text);
        return this.storeSplitLines(tempURL, lines);
    },

    removeAnchor: function(url)
    {
        if (FBTrace.DBG_ERRORS && !url)
            FBTrace.sysout("sourceCache.removeAnchor; ERROR url must not be null");

        var index = url ? url.indexOf("#") : -1;
        if (index < 0)
            return url;

        return url.substr(0, index);
    },

    loadFromLocal: function(url)
    {
        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("tabCache.loadFromLocal url: " + url);

        // if we get this far then we have either a file: or chrome: url converted to file:
        var src = Http.getResource(url);
        if (src)
        {
            var lines = Str.splitLines(src);

            // Don't cache locale files to get latest version (issue 1328)
            // Local files can be currently fetched any time.
            //this.cache[url] = lines;

            return lines;
        }
    },

    loadFromCache: function(url, method, file)
    {
        if (FBTrace.DBG_CACHE) FBTrace.sysout("sourceCache.loadFromCache url:"+url);

        var doc = this.context.window.document;
        if (doc)
            var charset = doc.characterSet;
        else
            var charset = "UTF-8";

        var channel;
        try
        {
            channel = ioService.newChannel(url, null, null);
            channel.loadFlags |= LOAD_FROM_CACHE | LOAD_BYPASS_LOCAL_CACHE_IF_BUSY;

            if (method && (channel instanceof nsIHttpChannel))
            {
                var httpChannel = Xpcom.QI(channel, nsIHttpChannel);
                httpChannel.requestMethod = method;
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("sourceCache for url:" + url + " window=" +
                    this.context.window.location.href + " FAILS:", exc);
            return;
        }

        if (url == this.context.browser.contentWindow.location.href)
        {
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("sourceCache.load content window href");

            if (channel instanceof nsIUploadChannel)
            {
                var postData = getPostStream(this.context);
                if (postData)
                {
                    var uploadChannel = Xpcom.QI(channel, nsIUploadChannel);
                    uploadChannel.setUploadStream(postData, "", -1);

                    if (FBTrace.DBG_CACHE)
                        FBTrace.sysout("sourceCache.load uploadChannel set");
                }
            }

            if (channel instanceof nsICachingChannel)
            {
                var cacheChannel = Xpcom.QI(channel, nsICachingChannel);
                cacheChannel.cacheKey = getCacheKey(this.context);
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("sourceCache.load cacheChannel key" + cacheChannel.cacheKey);
            }
        }
        else if ((method == "POST" || method == "PUT" || method == "PATCH") && file)
        {
            if (channel instanceof nsIUploadChannel)
            {
                // In case of PUT and POST, don't forget to use the original body.
                var postData = getPostText(file, this.context);
                if (postData)
                {
                    var postDataStream = Http.getInputStreamFromString(postData);
                    var uploadChannel = Xpcom.QI(channel, nsIUploadChannel);
                    uploadChannel.setUploadStream(postDataStream,
                        "application/x-www-form-urlencoded", -1);

                    if (FBTrace.DBG_CACHE)
                        FBTrace.sysout("sourceCache.load uploadChannel set");
                }
            }
        }

        var stream;
        try
        {
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("sourceCache.load url:" + url + " with charset" + charset);

            stream = channel.open();
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
            {
                var isCache = (channel instanceof nsICachingChannel) ?
                    "nsICachingChannel" : "NOT caching channel";
                var isUp = (channel instanceof nsIUploadChannel) ?
                    "nsIUploadChannel" : "NOT nsIUploadChannel";

                FBTrace.sysout(url + " vs " + this.context.browser.contentWindow.location.href +
                    " and " + isCache + " " + isUp);
                FBTrace.sysout("sourceCache.load fails channel.open for url=" + url +
                    " cause:", exc);
                FBTrace.sysout("sourceCache.load fails channel=", channel);
            }

            return ["sourceCache.load FAILS for url=" + url, exc.toString()];
        }

        try
        {
            var data = Http.readFromStream(stream, charset);
            var lines = Str.splitLines(data);
            this.cache[url] = lines;
            return lines;
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("sourceCache.load FAILS, url="+url, exc);
            return ["sourceCache.load FAILS for url="+url, exc.toString()];
        }
        finally
        {
            stream.close();
        }
    },

    storeSplitLines: function(url, lines)
    {
        if (FBTrace.DBG_CACHE)
        {
            FBTrace.sysout("sourceCache for window=" + this.context.getName() +
                " store url=" + url);
        }

        return this.cache[url] = lines;
    },

    invalidate: function(url)
    {
        url = this.removeAnchor(url);

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("sourceCache.invalidate; " + url);

        delete this.cache[url];
    },

    getLine: function(url, lineNo)
    {
        var lines;

        try
        {
            lines = this.load(url);
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("sourceCache.getLine; EXCEPTION " + e, e);
        }

        if (!lines)
            return "(no source for " + url + ")";

        if (lineNo <= lines.length)
        {
            return lines[lineNo-1];
        }
        else
        {
            return (lines.length == 1) ?
                lines[0] : "(" + lineNo + " out of range " + lines.length + ")";
        }
    }
});

// xxxHonza getPostText and Http.readPostTextFromRequest are copied from
// net.js. These functions should be removed when this cache is
// refactored due to the double-load problem.
function getPostText(file, context)
{
    if (!file.postText)
        file.postText = Http.readPostTextFromPage(file.href, context);

    if (!file.postText)
        file.postText = Http.readPostTextFromRequest(file.request, context);

    return file.postText;
}

// ********************************************************************************************* //

function getPostStream(context)
{
    try
    {
        var webNav = context.browser.webNavigation;
        var descriptor = Xpcom.QI(webNav, Ci.nsIWebPageDescriptor).currentDescriptor;
        var entry = Xpcom.QI(descriptor, Ci.nsISHEntry);

        if (entry.postData)
        {
            // Seek to the beginning, or it will probably start reading at the end
            var postStream = Xpcom.QI(entry.postData, Ci.nsISeekableStream);
            postStream.seek(0, 0);
            return postStream;
        }
     }
     catch (exc)
     {
     }
}

function getCacheKey(context)
{
    try
    {
        var webNav = context.browser.webNavigation;
        var descriptor = Xpcom.QI(webNav, Ci.nsIWebPageDescriptor).currentDescriptor;
        var entry = Xpcom.QI(descriptor, Ci.nsISHEntry);
        return entry.cacheKey;
     }
     catch (exc)
     {
     }
}

// ********************************************************************************************* //
// Registration

return Firebug.SourceCache;

// ********************************************************************************************* //
});
