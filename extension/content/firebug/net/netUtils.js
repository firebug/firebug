/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/chrome/firefox",
    "firebug/lib/xpcom",
    "firebug/lib/http",
    "firebug/lib/string",
    "firebug/lib/xml"
],
function(Firebug, Locale, Events, Url, Firefox, Xpcom, Http, Str, Xml) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

const mimeExtensionMap =
{
    "txt": "text/plain",
    "html": "text/html",
    "htm": "text/html",
    "xhtml": "text/html",
    "xml": "text/xml",
    "css": "text/css",
    "js": "application/x-javascript",
    "jss": "application/x-javascript",
    "jpg": "image/jpg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "png": "image/png",
    "bmp": "image/bmp",
    "swf": "application/x-shockwave-flash",
    "xap": "application/x-silverlight-app",
    "flv": "video/x-flv",
    "webm": "video/webm"
};

const mimeCategoryMap =
{
    "text/plain": "txt",
    "application/octet-stream": "bin",
    "text/html": "html",
    "text/xml": "html",
    "application/rss+xml": "html",
    "application/atom+xml": "html",
    "application/xhtml+xml": "html",
    "application/mathml+xml": "html",
    "application/rdf+xml": "html",
    "text/css": "css",
    "application/x-javascript": "js",
    "text/javascript": "js",
    "application/javascript" : "js",
    "text/ecmascript": "js",
    "application/ecmascript" : "js", // RFC4329
    "image/jpeg": "image",
    "image/jpg": "image",
    "image/gif": "image",
    "image/png": "image",
    "image/bmp": "image",
    "application/x-shockwave-flash": "plugin",
    "application/x-silverlight-app": "plugin",
    "video/x-flv": "media",
    "audio/mpeg3": "media",
    "audio/x-mpeg-3": "media",
    "video/mpeg": "media",
    "video/x-mpeg": "media",
    "video/webm": "media",
    "video/mp4": "media",
    "video/ogg": "media",
    "audio/ogg": "media",
    "application/ogg": "media",
    "application/x-ogg": "media",
    "application/x-midi": "media",
    "audio/midi": "media",
    "audio/x-mid": "media",
    "audio/x-midi": "media",
    "music/crescendo": "media",
    "audio/wav": "media",
    "audio/x-wav": "media",
    "application/x-woff": "font",
    "application/x-font-woff": "font",
    "application/x-ttf": "font",
    "application/x-font-ttf": "font",
    "font/ttf": "font",
    "font/woff": "font",
    "application/x-otf": "font",
    "application/x-font-otf": "font"
};

const fileCategories =
{
    "undefined": 1,
    "html": 1,
    "css": 1,
    "js": 1,
    "xhr": 1,
    "image": 1,
    "plugin": 1,
    "media": 1,
    "font": 1,
    "txt": 1,
    "bin": 1
};

const textFileCategories =
{
    "txt": 1,
    "html": 1,
    "xhr": 1,
    "css": 1,
    "js": 1
};

const binaryFileCategories =
{
    "bin": 1,
    "plugin": 1,
    "media": 1
};

const binaryCategoryMap =
{
    "image": 1,
    "plugin" : 1,
    "font": 1
};

// ********************************************************************************************* //

var NetUtils =
{
    isXHR: Http.isXHR, // deprecated

    mimeExtensionMap: mimeExtensionMap,
    mimeCategoryMap: mimeCategoryMap,
    fileCategories: fileCategories,
    textFileCategories: textFileCategories,
    binaryFileCategories: binaryFileCategories,
    binaryCategoryMap: binaryCategoryMap,

    now: function()
    {
        return (new Date()).getTime();
    },

    getFrameLevel: function(win)
    {
        var level = 0;
        for (; win && (win != win.parent) && (win.parent instanceof window.Window); win = win.parent)
            ++level;
        return level;
    },

    findHeader: function(headers, name)
    {
        if (!headers)
            return null;

        name = name.toLowerCase();
        for (var i = 0; i < headers.length; ++i)
        {
            var headerName = headers[i].name.toLowerCase();
            if (headerName == name)
                return headers[i].value;
        }
    },

    formatPostText: function(text)
    {
        if (text instanceof window.XMLDocument)
            return Xml.getElementXML(text.documentElement);
        else
            return text;
    },

    getPostText: function(file, context, noLimit)
    {
        if (!file.postText)
        {
            file.postText = Http.readPostTextFromRequest(file.request, context);

            if (!file.postText && context)
                file.postText = Http.readPostTextFromPage(file.href, context);
        }

        if (!file.postText)
            return file.postText;

        var limit = Firebug.netDisplayedPostBodyLimit;
        if (file.postText.length > limit && !noLimit)
        {
            return Str.cropString(file.postText, limit,
                "\n\n... " + Locale.$STR("net.postDataSizeLimitMessage") + " ...\n\n");
        }

        return file.postText;
    },

    getResponseText: function(file, context)
    {
        // The response can be also empty string so, check agains "undefined".
        return (typeof(file.responseText) != "undefined") ?
            file.responseText :
            context.sourceCache.loadText(file.href, file.method, file);
    },

    matchesContentType: function(headerValue, contentType)
    {
        var contentTypes = (typeof contentType == "string" ? [contentType] : contentType);
        for (var i = 0; i < contentTypes.length; ++i)
        {
            // The header value doesn't have to match the content type exactly;
            // there can be a charset specified. So, test for a prefix instead.
            if (Str.hasPrefix(headerValue, contentTypes[i]))
                return true;
        }
        return false;
    },

    isURLEncodedRequest: function(file, context)
    {
        var text = NetUtils.getPostText(file, context);
        if (text && Str.hasPrefix(text.toLowerCase(), "content-type: application/x-www-form-urlencoded"))
            return true;

        var headerValue = NetUtils.findHeader(file.requestHeaders, "content-type");
        return (headerValue &&
                NetUtils.matchesContentType(headerValue, "application/x-www-form-urlencoded"));
    },

    isMultiPartRequest: function(file, context)
    {
        var text = NetUtils.getPostText(file, context);
        if (text && Str.hasPrefix(text.toLowerCase(), "content-type: multipart/form-data"))
            return true;
        return false;
    },

    getMimeType: function(mimeType, uri)
    {
        if (!mimeType || !(mimeCategoryMap.hasOwnProperty(mimeType)))
        {
            var ext = Url.getFileExtension(uri);
            if (!ext)
                return mimeType;
            else
            {
                var extMimeType = mimeExtensionMap[ext.toLowerCase()];
                return extMimeType ? extMimeType : mimeType;
            }
        }
        else
            return mimeType;
    },

    getDateFromSeconds: function(s)
    {
        var d = new Date();
        d.setTime(s*1000);
        return d;
    },

    getHttpHeaders: function(request, file, context)
    {
        if (!(request instanceof Ci.nsIHttpChannel))
            return;

        // xxxHonza: is there any problem to do this in requestedFile method?
        file.method = request.requestMethod;
        file.urlParams = Url.parseURLParams(file.href);

        try
        {
            file.status = request.responseStatus;
        }
        catch (e) { }

        try
        {
            file.mimeType = NetUtils.getMimeType(request.contentType, request.name);
        }
        catch (e) { }

        try
        {
            if (!file.requestHeaders)
            {
                var requestHeaders = [];
                request.visitRequestHeaders({
                    visitHeader: function(name, value)
                    {
                        requestHeaders.push({name: name, value: value});
                    }
                });
                file.requestHeaders = requestHeaders;
            }
        }
        catch (e) { }

        try
        {
            if (!file.responseHeaders)
            {
                var responseHeaders = [];
                request.visitResponseHeaders({
                    visitHeader: function(name, value)
                    {
                        responseHeaders.push({name: name, value: value});
                    }
                });
                file.responseHeaders = responseHeaders;

                if (context)
                {
                    // Response haeaders are available now, dispatch an event to listeners
                    Events.dispatch(Firebug.NetMonitor.fbListeners, "onResponseHeaders",
                        [context, file]);
                }
            }
        }
        catch (e) { }
    },

    getFileCategory: function(file)
    {
        if (file.category)
        {
            if (FBTrace.DBG_NET)
                FBTrace.sysout("net.getFileCategory; current: " + file.category + " for: " +
                    file.href, file);
            return file.category;
        }

        if (file.isXHR)
        {
            if (FBTrace.DBG_NET)
                FBTrace.sysout("net.getFileCategory; XHR for: " + file.href, file);
            return file.category = "xhr";
        }

        if (!file.mimeType)
        {
            var ext = Url.getFileExtension(file.href);
            if (ext)
                file.mimeType = mimeExtensionMap[ext.toLowerCase()];
        }

        /*if (FBTrace.DBG_NET)
            FBTrace.sysout("net.getFileCategory; " + mimeCategoryMap[file.mimeType] +
                ", mimeType: " + file.mimeType + " for: " + file.href, file);*/

        if (!file.mimeType)
            return "";

        // Solve cases when charset is also specified, eg "text/html; charset=UTF-8".
        var mimeType = file.mimeType;
        if (mimeType)
            mimeType = mimeType.split(";")[0];

        file.category = mimeCategoryMap[mimeType];

        // Work around application/octet-stream for js files (see issue 6530).
        // Files with js extensions are JavaScript files and should respect the
        // Net panel filter.
        var extension = Url.getFileExtension(file.href);
        if (extension == "js")
            file.category = "js";

        return file.category;
    },

    getPageTitle: function(context)
    {
        var title = context.getTitle();
        return (title) ? title : context.getName();
    },

    getBlockingEndTime: function(file)
    {
        //var blockingEnd = (file.sendingTime > file.startTime) ? file.sendingTime : file.waitingForTime;

        if (file.resolveStarted && file.connectStarted)
            return file.resolvingTime;

        if (file.connectStarted)
            return file.connectingTime;

        if (file.sendStarted)
            return file.sendingTime;

        return file.waitingForTime;
    },

    getTimeLabelFromMs: function(ms)
    {
        var time = new Date();
        time.setTime(ms);
        return this.getTimeLabel(time);
    },

    getTimeLabel: function(date)
    {
        var m = date.getMinutes() + "";
        var s = date.getSeconds() + "";
        var ms = date.getMilliseconds() + "";
        return "[" + ((m.length > 1) ? m : "0" + m) + ":" +
            ((s.length > 1) ? s : "0" + s) + "." +
            ((ms.length > 2) ? ms : ((ms.length > 1) ? "0" + ms : "00" + ms)) + "]";
    },

    openResponseInTab: function(file)
    {
        try
        {
            var response = NetUtils.getResponseText(file, this.context);
            var inputStream = Http.getInputStreamFromString(response);
            var stream = Xpcom.CCIN("@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream");
            stream.setInputStream(inputStream);
            var encodedResponse = btoa(stream.readBytes(stream.available()));
            var dataURI = "data:" + file.request.contentType + ";base64," + encodedResponse;
        
            var tabBrowser = Firefox.getTabBrowser();
            tabBrowser.selectedTab = tabBrowser.addTab(dataURI);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("net.openResponseInTab EXCEPTION", err);
        }
    },

    traceRequestTiming: function(msg, file)
    {
        var blockingEnd = this.getBlockingEndTime(file);

        //Helper log for debugging timing problems.
        var timeLog = {};
        timeLog.startTime = this.getTimeLabelFromMs(file.startTime);
        timeLog.resolvingTime = this.getTimeLabelFromMs(file.resolvingTime);
        timeLog.connectingTime = this.getTimeLabelFromMs(file.connectingTime);
        timeLog.connectedTime = this.getTimeLabelFromMs(file.connectedTime);
        timeLog.blockingEnd = this.getTimeLabelFromMs(blockingEnd);
        timeLog.sendingTime = this.getTimeLabelFromMs(file.sendingTime);
        timeLog.waitingForTime = this.getTimeLabelFromMs(file.waitingForTime);
        timeLog.respondedTime = this.getTimeLabelFromMs(file.respondedTime);
        timeLog.endTime = this.getTimeLabelFromMs(file.endTime);

        if (file.request instanceof Ci.nsITimedChannel)
        {
            timeLog.startTime += " - " + this.getTimeLabelFromMs(file.request.channelCreationTime/1000);
            timeLog.startTime += this.getTimeLabelFromMs(file.request.asyncOpenTime/1000);
            timeLog.resolvingTime += " - " + this.getTimeLabelFromMs(file.request.domainLookupStartTime/1000);
            timeLog.resolvingTime += this.getTimeLabelFromMs(file.request.domainLookupEndTime/1000);
            timeLog.connectingTime += " - " + this.getTimeLabelFromMs(file.request.connectStartTime/1000);
            timeLog.connectedTime += " - " + this.getTimeLabelFromMs(file.request.connectEndTime/1000);
            timeLog.sendingTime += " - " + this.getTimeLabelFromMs(file.request.requestStartTime/1000);
            timeLog.respondedTime += " - " + this.getTimeLabelFromMs(file.request.responseStartTime/1000);
            timeLog.endTime += " - " + this.getTimeLabelFromMs(file.request.responseEndTime/1000);
            timeLog.cacheReadStartTime = this.getTimeLabelFromMs(file.request.cacheReadStartTime/1000);
            timeLog.cacheReadEndTime = this.getTimeLabelFromMs(file.request.cacheReadEndTime/1000);
            timeLog.timingEnabled = file.request.timingEnabled;
        }

        FBTrace.sysout(msg + " " + file.href, timeLog);
    }
};

// ********************************************************************************************* //
// Registration

return NetUtils;

// ********************************************************************************************* //
});
