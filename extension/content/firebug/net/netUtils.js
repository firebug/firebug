/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/locale",
    "firebug/lib/url",
    "firebug/net/httpLib",
    "firebug/lib/string",
    "firebug/lib/xml",
],
function(Firebug, Locale, Url, Http, Str, Xml) {

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
    "application/x-shockwave-flash": "flash",
    "video/x-flv": "flash",
    "audio/mpeg3": "media",
    "audio/x-mpeg-3": "media",
    "video/mpeg": "media",
    "video/x-mpeg": "media",
    "video/webm": "media",
    "audio/ogg": "media",
    "application/ogg": "media",
    "application/x-ogg": "media",
    "application/x-midi": "media",
    "audio/midi": "media",
    "audio/x-mid": "media",
    "audio/x-midi": "media",
    "music/crescendo": "media",
    "audio/wav": "media",
    "audio/x-wav": "media"
};

const fileCategories =
{
    "undefined": 1,
    "html": 1,
    "css": 1,
    "js": 1,
    "xhr": 1,
    "image": 1,
    "flash": 1,
    "media": 1,
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
    "flash": 1,
    "media": 1
};

const binaryCategoryMap =
{
    "image": 1,
    "flash" : 1
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

    isURLEncodedRequest: function(file, context)
    {
        var text = NetUtils.getPostText(file, context);
        if (text && text.toLowerCase().indexOf("content-type: application/x-www-form-urlencoded") == 0)
            return true;

        // The header value doesn't have to be always exactly "application/x-www-form-urlencoded",
        // there can be even charset specified. So, use indexOf rather than just "==".
        var headerValue = NetUtils.findHeader(file.requestHeaders, "content-type");
        if (headerValue && headerValue.indexOf("application/x-www-form-urlencoded") == 0)
            return true;

        return false;
    },

    isMultiPartRequest: function(file, context)
    {
        var text = NetUtils.getPostText(file, context);
        if (text && text.toLowerCase().indexOf("content-type: multipart/form-data") == 0)
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

    getHttpHeaders: function(request, file)
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

        return (file.category = mimeCategoryMap[mimeType]);
    },

    getPageTitle: function(context)
    {
        var title = context.getTitle();
        return (title) ? title : context.getName();
    },

    getBlockingEndTime: function(file)
    {
        //var blockingEnd = (file.sendingTime > file.startTime) ? file.sendingTime : file.waitingForTime;
        if (file.resolveStarted)
            return file.resolvingTime;

        if (file.connectStarted)
            return file.connectingTime;

        if (file.sendStarted)
            return file.sendingTime;

        return file.waitingForTime;
    }
};

// ********************************************************************************************* //
// Registration

return NetUtils;

// ********************************************************************************************* //
});
