/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/xpcom",
    "firebug/lib/url",
    "firebug/lib/http",
    "firebug/lib/string"
],
function(Obj, Firebug, Xpcom, Url, Http, Str) {

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
    this.cacheRaw = {};
};

Firebug.SourceCache.prototype = Obj.extend(new Firebug.Listener(),
{
    isCached: function(url)
    {
        return (this.cache[url] ? true : false);
    },

    /**
     * Returns as text the charset-converted content of the cache for the given URL.
     *
     * @param {string} url
     * @param {string} [method]
     * @param {*} [file]
     * @param {object} [options] List of options:
     *      - {boolean} dontLoadFromCache If set to true, don't load from the Firefox cache if no
     *                                    content has been found.
     *
     * @returns {string} The cache content
     */
    loadText: function(url, method, file, options)
    {
        var lines = this.load(url, method, file, options);
        return lines ? lines.join("") : null;
    },

    /**
     * Returns the charset-converted content of the cache for the given URL.
     * The return value is a split by line text array.
     *
     * @param {string} url
     * @param {string} [method]
     * @param {*} [file]
     *
     * @returns {Array of strings} The cache content
     */
    load: function(url, method, file, options)
    {
        options = options || {};
        if (FBTrace.DBG_CACHE)
        {
            FBTrace.sysout("sourceCache.load: " + url);

            if (!this.cache.hasOwnProperty(url) && this.cache[url])
                FBTrace.sysout("sourceCache.load; ERROR - hasOwnProperty returns false, " +
                    "but the URL is cached: " + url, this.cache[url]);
        }

        var urlNoAnchor = this.removeAnchor(url);

        // xxxHonza: sometimes hasOwnProperty return false even if the URL is obviously there.
        //if (this.cache.hasOwnProperty(url))
        var response = this.cache[urlNoAnchor];
        if (response)
            return response;

        response = this.cacheRaw[urlNoAnchor];
        if (response)
            return this.convertCachedData(urlNoAnchor);

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
            // For fonts, data URLs don't need to be stored as raw.
            // this.cacheRaw[url] = src;

            return lines;
        }

        var j = Url.reJavascript.exec(url);
        if (j)
        {
            var src = url.substring(Url.reJavascript.lastIndex);
            var lines = Str.splitLines(src);
            this.cache[url] = lines;
            // Do not cache as raw (only useful when dealing with fonts).
            // this.cacheRaw[url] = src;

            return lines;
        }

        var c = Url.reChrome.test(url);
        if (c)
        {
            if (Firebug.filterSystemURLs)
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

        if (!options.dontLoadFromCache)
            return this.loadFromCache(url, method, file);
        return [];
    },

    /**
     * Returns the non-charset-converted cache for the given url.
     *
     * @param {string} url The url.
     *
     * @return {string} The cache content.
     */
    loadRaw: function(url)
    {
        url = this.removeAnchor(url);

        // If `this.cacheRaw[url]` doesn't exist, attempt to return the content from the FF cache.
        if (!this.cacheRaw[url])
            return this.loadFromCache(url, null, null, {"getRaw": true});

        return this.cacheRaw[url];
    },

    /**
     * Stores the response of a request in the Firebug cache.
     *
     * @param {string} url The url of the request.
     * @param {string} rawText The raw response text.
     * @param {Boolean} append If set to true, don't invalidate the cache,
     *                         and append the data to it.
     *
     * @return {string} The stored text.
     */
    store: function(url, rawText, append)
    {
        url = this.removeAnchor(url);

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("sourceCache for " + this.context.getName() + " store url=" +
                url, rawText);

        // We need to invalidate the transformed cache data because
        // it does not fit with cacheRaw anymore.
        delete this.cache[url];

        if (!this.cacheRaw[url] || !append)
            this.cacheRaw[url] = "";

        this.cacheRaw[url] += rawText;

        return this.cacheRaw[url];
    },

    /**
     * Removes the anchor of a URL
     *
     * @param {string} url
     *
     * @return {string} The url without anchor.
     */
    removeAnchor: function(url)
    {
        if (FBTrace.DBG_ERRORS && !url)
            FBTrace.sysout("sourceCache.removeAnchor; ERROR url must not be null");

        var index = url ? url.indexOf("#") : -1;
        if (index < 0)
            return url;

        return url.substr(0, index);
    },

    /**
     * Convert into the charset of the document and split by line the raw cached data. 
     * Then stores it in a seperate cache object.
     * Should not be used directly. Prefer using `sourceCache.load`, which will do the conversion
     * lazily for you.
     *
     * @param {string} url The url of the request.
     *
     * @return {Array of strings} The charset-converted and split by line data.
     */
    convertCachedData: function(url)
    {
        url = this.removeAnchor(url);
        var text = this.cacheRaw[url];
        var doc = this.context.window.document;
        var charset = doc ? doc.characterSet : "UTF-8";
        if (FBTrace.DBG_CACHE)
        {
            FBTrace.sysout("sourceCache.convertCachedData; Convert cached data for " + url +
                " to " + charset);
        }
        var convertedText = Str.convertFromUnicode(text, charset);
        return this.cache[url] = Str.splitLines(convertedText);
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

    /**
     * Returns the content of a response of a request from the FF cache.
     *
     * @param {string} url The URL of the request.
     * @param {string} [method] The method ("GET", "POST"...)
     * @param {*} [file] The file.
     * @param {object} [options] List of options:
     *      - {boolean} getRaw If set to true, return the raw (non-charset-converted) content
     *                         of the cache.
     *
     * @return {string} The content of the cache.
     */
    loadFromCache: function(url, method, file, options)
    {
        var getRaw = options && options.getRaw;
        if (FBTrace.DBG_CACHE) FBTrace.sysout("sourceCache.loadFromCache url:"+url);

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
                FBTrace.sysout("sourceCache.load url:" + url);

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
            var data = Http.readFromStream(stream);
            var storedData = this.store(url, data);
            return getRaw ? storedData : this.convertCachedData(url);
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
        delete this.cacheRaw[url];
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
