/* See license.txt for terms of usage */

define([
    "firebug/lib",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/xpcom",
    "firebug/lib/url",
    "firebug/http/httpLib",
    "firebug/lib/string",
],
function(FBL, OBJECT, Firebug, XPCOM, URL, HTTP, STR) {

// ************************************************************************************************
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
const chromeReg = XPCOM.CCSV("@mozilla.org/chrome/chrome-registry;1", "nsIToolkitChromeRegistry");

const LOAD_FROM_CACHE = nsIRequest.LOAD_FROM_CACHE;
const LOAD_BYPASS_LOCAL_CACHE_IF_BUSY = nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE_IF_BUSY;

const NS_BINDING_ABORTED = 0x804b0002;

// ************************************************************************************************

Firebug.SourceCache = function(context)
{
    this.context = context;
    this.cache = {};
};

Firebug.SourceCache.prototype = OBJECT.extend(new Firebug.Listener(),
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

        var d = URL.splitDataURL(url);  //TODO the RE should not have baseLine
        if (d)
        {
            var src = d.encodedContent;
            var data = decodeURIComponent(src);
            var lines = STR.splitLines(data)
            this.cache[url] = lines;

            return lines;
        }

        var j = FBL.reJavascript.exec(url);
        if (j)
        {
            var src = url.substring(FBL.reJavascript.lastIndex);
            var lines = STR.splitLines(src);
            this.cache[url] = lines;

            return lines;
        }

        var c = FBL.reChrome.test(url);
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
                    FBTrace.sysout("sourceCache found munged xpcnativewrapper url and set it to "+url+" m "+m+" m[0]:"+m[0]+" [1]"+m[1], m);
            }

            var chromeURI = URL.makeURI(url);
            if (!chromeURI)
            {
                if (FBTrace.DBG_CACHE)
                    FBTrace.sysout("sourceCache.load failed to convert chrome to local: "+url);
                return ["sourceCache failed to make URI from "+url];
            }

            var localURI = chromeReg.convertChromeURL(chromeURI);
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("sourceCache.load converting chrome to local: "+url, " -> "+localURI.spec);
            return this.loadFromLocal(localURI.spec);
        }

        c = FBL.reFile.test(url);
        if (c)
        {
            return this.loadFromLocal(url);
        }

        if (url.indexOf('resource://') === 0)
        {
            var fileURL = URL.resourceToFile(url);
            return this.loadFromLocal(url);
        }

        // Unfortunately, the URL isn't available so, let's try to use FF cache.
        // Notice that additional network request to the server can be made in
        // this method (double-load).
        return this.loadFromCache(url, method, file);
    },

    store: function(url, text)
    {
        var tempURL = this.removeAnchor(url);

        if (FBTrace.DBG_CACHE)
            FBTrace.sysout("sourceCache for " + this.context.getName() + " store url=" +
                url + ((tempURL != url) ? " -> " + tempURL : ""), text);

        var lines = STR.splitLines(text);
        return this.storeSplitLines(tempURL, lines);
    },

    removeAnchor: function(url)
    {
        var index = url.indexOf("#");
        if (index < 0)
            return url;

        return url.substr(0, index);
    },

    loadFromLocal: function(url)
    {
        // if we get this far then we have either a file: or chrome: url converted to file:
        var src = HTTP.getResource(url);
        if (src)
        {
            var lines = STR.splitLines(src);
            this.cache[url] = lines;

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
                var httpChannel = XPCOM.QI(channel, nsIHttpChannel);
                httpChannel.requestMethod = method;
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_CACHE)
                FBTrace.sysout("sourceCache for url:"+url+" window="+this.context.window.location.href+" FAILS:", exc);
            return;
        }

        if (url == this.context.browser.contentWindow.location.href)
        {
            if (FBTrace.DBG_CACHE) FBTrace.sysout("sourceCache.load content window href\n");
            if (channel instanceof nsIUploadChannel)
            {
                var postData = getPostStream(this.context);
                if (postData)
                {
                    var uploadChannel = XPCOM.QI(channel, nsIUploadChannel);
                    uploadChannel.setUploadStream(postData, "", -1);
                    if (FBTrace.DBG_CACHE) FBTrace.sysout("sourceCache.load uploadChannel set\n");
                }
            }

            if (channel instanceof nsICachingChannel)
            {
                var cacheChannel = XPCOM.QI(channel, nsICachingChannel);
                cacheChannel.cacheKey = getCacheKey(this.context);
                if (FBTrace.DBG_CACHE) FBTrace.sysout("sourceCache.load cacheChannel key"+cacheChannel.cacheKey+"\n");
            }
        }
        else if ((method == "PUT" || method == "POST") && file)
        {
            if (channel instanceof nsIUploadChannel)
            {
                // In case of PUT and POST, don't forget to use the original body.
                var postData = getPostText(file, this.context);
                if (postData)
                {
                    var postDataStream = HTTP.getInputStreamFromString(postData);
                    var uploadChannel = XPCOM.QI(channel, nsIUploadChannel);
                    uploadChannel.setUploadStream(postDataStream, "application/x-www-form-urlencoded", -1);
                    if (FBTrace.DBG_CACHE) FBTrace.sysout("sourceCache.load uploadChannel set\n");
                }
            }
        }

        var stream;
        try
        {
            if (FBTrace.DBG_CACHE) FBTrace.sysout("sourceCache.load url:"+url+" with charset"+charset+"\n");
            stream = channel.open();
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
            {
                var isCache = (channel instanceof nsICachingChannel)?"nsICachingChannel":"NOT caching channel";
                var isUp = (channel instanceof nsIUploadChannel)?"nsIUploadChannel":"NOT nsIUploadChannel";
                FBTrace.sysout(url+" vs "+this.context.browser.contentWindow.location.href+" and "+isCache+" "+isUp+"\n");
                FBTrace.sysout("sourceCache.load fails channel.open for url="+url+ " cause:", exc);
                FBTrace.sysout("sourceCache.load fails channel=", channel);
            }
            return ["sourceCache.load FAILS for url="+url, exc.toString()];
        }

        try
        {
            var data = HTTP.readFromStream(stream, charset);
            var lines = STR.splitLines(data);
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
            FBTrace.sysout("sourceCache for window="+this.context.getName()+" store url="+url+"\n");
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
        var lines = this.load(url);
        if (lines)
        {
            if (lineNo <= lines.length)
                return lines[lineNo-1];
            else
                return (lines.length == 1) ? lines[0] : "("+lineNo+" out of range "+lines.length+")";
        }
        else
            return "(no source for "+url+")";
    }
});

// xxxHonza getPostText and HTTP.readPostTextFromRequest are copied from
// net.js. These functions should be removed when this cache is
// refactored due to the double-load problem.
function getPostText(file, context)
{
    if (!file.postText)
        file.postText = HTTP.readPostTextFromPage(file.href, context);

    if (!file.postText)
        file.postText = HTTP.readPostTextFromRequest(file.request, context);

    return file.postText;
}

// ************************************************************************************************

function getPostStream(context)
{
    try
    {
        var webNav = context.browser.webNavigation;
        var descriptor = XPCOM.QI(webNav, Ci.nsIWebPageDescriptor).currentDescriptor;
        var entry = XPCOM.QI(descriptor, Ci.nsISHEntry);

        if (entry.postData)
        {
            // Seek to the beginning, or it will probably start reading at the end
            var postStream = XPCOM.QI(entry.postData, Ci.nsISeekableStream);
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
        var descriptor = XPCOM.QI(webNav, Ci.nsIWebPageDescriptor).currentDescriptor;
        var entry = XPCOM.QI(descriptor, Ci.nsISHEntry);
        return entry.cacheKey;
     }
     catch (exc)
     {
     }
}

// ************************************************************************************************
// Registration

return Firebug.SourceCache;

// ************************************************************************************************
});
