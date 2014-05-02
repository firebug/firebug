/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/chrome/firefox",
    "firebug/lib/wrapper",
    "firebug/lib/xpcom",
    "firebug/lib/http",
    "firebug/lib/options",
    "firebug/lib/string",
    "firebug/lib/xml",
    "firebug/lib/system"
],
function(Firebug, Locale, Events, Url, Firefox, Wrapper, Xpcom, Http, Options, Str, Xml, System) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "Curl", "resource:///modules/devtools/Curl.jsm");

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

const mimeExtensionMap =
{
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
    "woff": "application/font-woff",
    "ttf": "application/x-font-ttf",
    "otf": "application/x-font-otf",
    "swf": "application/x-shockwave-flash",
    "xap": "application/x-silverlight-app",
    "flv": "video/x-flv",
    "webm": "video/webm"
};

const mimeCategoryMap =
{
    // xxxHonza: note that there is no filter for 'txt' category,
    // shell we use e.g. 'media' instead?
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
    "application/font-woff": "font",
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

const requestProps =
{
    "allowPipelining": 1,
    "allowSpdy": 1,
    "canceled": 1,
    "channelIsForDownload": 1,
    "contentCharset": 1,
    "contentLength": 1,
    "contentType": 1,
    "forceAllowThirdPartyCookie": 1,
    "loadAsBlocking": 1,
    "loadUnblocked": 1,
    "localAddress": 1,
    "localPort": 1,
    "name": 1,
    "redirectionLimit": 1,
    "remoteAddress": 1,
    "remotePort": 1,
    "requestMethod": 1,
    "requestSucceeded": 1,
    "responseStatus": 1,
    "responseStatusText": 1,
    "status": 1
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

        var limit = Options.get("netDisplayedPostBodyLimit");
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
        // Get rid of optional charset, e.g. "text/html; charset=UTF-8".
        // We need pure mime type so, we can use it as a key for look up.
        if (mimeType)
            mimeType = mimeType.split(";")[0];

        // If the mime-type exists and is known just return it...
        if (mimeType && mimeCategoryMap.hasOwnProperty(mimeType))
            return mimeType;

        // ... otherwise we need guess it according to the file extension.
        var ext = Url.getFileExtension(uri);
        if (!ext)
            return mimeType;

        var extMimeType = mimeExtensionMap[ext.toLowerCase()];
        return extMimeType ? extMimeType : mimeType;
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

    /**
     * Returns a category for specific request (file). The logic is as follows:
     * 1) Use file-extension to guess the mime type. This is prefered since
     *    mime-types in HTTP requests are often wrong.
     *    This part is based on mimeExtensionMap map.
     * 2) If the file extension is missing or unknown, try to get the mime-type
     *    from the HTTP request object.
     * 3) If there is still no mime-type, return empty category name.
     * 4) Use the mime-type and look up the right category.
     *    This part is based on mimeCategoryMap map.
     */
    getFileCategory: function(file)
    {
        if (file.category)
            return file.category;

        // All XHRs have its own category.
        if (file.isXHR)
            return file.category = "xhr";

        // Guess mime-type according to the file extension. Using file extension
        // is prefered way since mime-types in HTTP requests are often wrong.
        var mimeType = this.getMimeType(null, file.href);

        // If no luck with file extension, let's try to get the mime-type from
        // the request object.
        if (!mimeType)
            mimeType = this.getMimeType(file.mimeType, file.href);

        // No mime-type, no category.
        if (!mimeType)
            return "";

        // Finally, get the category according to the mime type.
        return file.category = mimeCategoryMap[mimeType];
    },

    getCategory: function(mimeType)
    {
        return mimeCategoryMap[mimeType];
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
        var m = String(date.getMinutes());
        var s = String(date.getSeconds());
        var ms = String(date.getMilliseconds());
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
    },

    /**
     * Returns a content-accessible 'real object' that is used by 'Inspect in DOM Panel'
     * or 'Use in Command Line' features. Firebug is primarily a tool for web developers
     * and thus shouldn't expose internal chrome objects.
     */
    getRealObject: function(file, context)
    {
        var global = context.getCurrentGlobal();
        var clone = {};

        function cloneHeaders(headers)
        {
            var newHeaders = [];
            for (var i=0; headers && i<headers.length; i++)
            {
                var header = {name: headers[i].name, value: headers[i].value};
                header = Wrapper.cloneIntoContentScope(global, header);
                newHeaders.push(header);
            }
            return newHeaders;
        }

        // Iterate over all properties of the request object (nsIHttpChannel)
        // and pick only those that are specified in 'requestProps' list.
        var request = file.request;
        for (var p in request)
        {
            if (!(p in requestProps))
                continue;

            try
            {
                clone[p] = request[p];
            }
            catch (err)
            {
                // xxxHonza: too much unnecessary output
                //if (FBTrace.DBG_ERRORS)
                //    FBTrace.sysout("net.getRealObject EXCEPTION " + err, err);
            }
        }

        // Additional props from |file|
        clone.responseBody = file.responseText;
        clone.postBody = file.postBody;
        clone.requestHeaders = cloneHeaders(file.requestHeaders);
        clone.responseHeaders = cloneHeaders(file.responseHeaders);

        return Wrapper.cloneIntoContentScope(global, clone);
    },

    getHttpVersion: function(responseHeadersText)
    {
        let match = responseHeadersText.match(/^HTTP\/\d+\.\d+/i);
        if (!match)
            return null;
        return match[0];
    },

    createCurlData: function(file)
    {
        return {
            url: file.href,
            method: file.method,
            headers: file.requestHeaders,
            httpVersion: this.getHttpVersion(file.responseHeadersText),
            postDataText: this.getPostText(file, this.context, true)
        };
    },

    generateCurlCommand: function(file, addCompressedArgument)
    {
        var command = null;

        // Use the devtools' shared Curl.jsm available in version >= 31 to generate the command.
        // TODO: Remove if statement when the minimum platform version is >= 31. See issue 7397
        if (System.isPlatformVersionAtLeast("31")) {
            command = Curl.generateCommand(this.createCurlData(file));
            if (addCompressedArgument)
                command += " --compressed";

          console.log("use jsm");

            return command;
        }

        // TODO: Remove this section when minimum version is >= 31. See issue 7397
        command = ["curl"];
        var ignoredHeaders = {};
        var inferredMethod = "GET";

        // The cURL command is expected to run on the same platform that Firefox runs
        // (it may be different from the inspected page platform).
        var escapeString = (System.getPlatformName() == "WINNT" ?
            this.escapeStringWin : this.escapeStringWin);

        // Create data
        var data = [];
        var postText = NetUtils.getPostText(file, this.context, true);
        var isURLEncodedRequest = NetUtils.isURLEncodedRequest(file, this.context);
        var isMultipartRequest = NetUtils.isMultiPartRequest(file, this.context);

        if (postText && isURLEncodedRequest || file.method == "PUT")
        {
            var lines = postText.split("\n");
            var params = lines[lines.length - 1];

            data.push("--data");
            data.push(escapeString(params));

            // Ignore content length as cURL will resolve this
            ignoredHeaders["Content-Length"] = true;

            inferredMethod = "POST";
        }
        else if (postText && isMultipartRequest)
        {
            data.push("--data-binary");
            data.push(escapeString(this.removeBinaryDataFromMultipartPostText(postText)));

            ignoredHeaders["Content-Length"] = true;
            inferredMethod = "POST";
        }

        // Add URL
        command.push(escapeString(file.href));

        // Fix method if request is not a GET or POST request
        if (file.method != inferredMethod)
        {
            command.push("-X");
            command.push(file.method);
        }

        // Add request headers
        // fixme: for multipart request, content-type should be omitted
        var requestHeaders = file.requestHeaders;
        var postRequestHeaders = Http.getHeadersFromPostText(file.request, postText);
        var headers = requestHeaders.concat(postRequestHeaders);
        for (var i=0; i<headers.length; i++)
        {
            var header = headers[i];

            if (header.name in ignoredHeaders)
                continue;

            command.push("-H");
            command.push(escapeString(header.name + ": " + header.value));
        }

        // Add data
        command = command.concat(data);

        // Add --compressed
        if (addCompressedArgument)
            command.push("--compressed");

        return command.join(" ");
    },

    /**
     * Removes binary data from the multipart payload text.
     * TODO: Remove when minimum platform version >= 31. See issue 7397
     */
    removeBinaryDataFromMultipartPostText: function (postText)
    {
        var textWithoutBinaryData = "";

        var boundaryRe = /^--.+/gm;

        var boundaryString = boundaryRe.exec(postText)[0];

        var parts = postText.split(boundaryRe);

        var part;
        var contentDispositionLine;

        for (var i = 0; i<parts.length; i++)
        {
            part = parts[i];

            // The second line in a part holds the content disposition form-data
            contentDispositionLine = part.split("\r\n")[1];

            if (/^Content-Disposition: form-data/im.test(contentDispositionLine))
            {
                // filename= tells us that the form data is file input type
                if (/filename=/im.test(contentDispositionLine))
                {
                    // For file input parts
                    // Remove binary data. Only the Content-Disposition and Content-Type lines
                    // should remain.
                    textWithoutBinaryData += boundaryString
                        + part.match(/[\r\n]+Content-Disposition.+$[\r\n]+Content-Type.+$[\r\n]+/im).toString();
                }
                else
                {
                    textWithoutBinaryData += boundaryString + part;
                }
            }
        }

        textWithoutBinaryData += boundaryString + "--\r\n";

        return textWithoutBinaryData;
    },

    /**
     * Escape util function for POSIX oriented operating systems.
     * Credit: Google DevTools
     *
     * TODO: Can be removed when minimum platform version >= 31. See issue 7397
     */
    escapeStringPosix: function(str)
    {
        function escapeCharacter(x)
        {
            let code = x.charCodeAt(0);
            if (code<256)
            {
                // Add leading zero when needed to not care about the next character.
                return code<16 ? "\\x0" + code.toString(16) : "\\x" + code.toString(16);
            }
            code = code.toString(16);
            return "\\u" + ("0000" + code).substr(code.length, 4);
        }

        if (/[^\x20-\x7E]|\'/.test(str))
        {
            // Use ANSI-C quoting syntax.
            return "$\'" + str.replace(/\\/g, "\\\\")
                .replace(/\'/g, "\\\'")
                .replace(/\n/g, "\\n")
                .replace(/\r/g, "\\r")
                .replace(/[^\x20-\x7E]/g, escapeCharacter) + "'";
        }
        else
        {
            // Use single quote syntax.
            return "'" + str + "'";
        }
    },

    /**
     * Escape util function for Windows systems.
     * Credit: Google DevTools
     *
     * TODO: Can be removed when minimum platform version >= 31. See issue 7397
     */
    escapeStringWin: function(str)
    {
        /* Replace quote by double quote (but not by \") because it is
         recognized by both cmd.exe and MS Crt arguments parser.

         Replace % by "%" because it could be expanded to an environment
         variable value. So %% becomes "%""%". Even if an env variable ""
         (2 doublequotes) is declared, the cmd.exe will not
         substitute it with its value.

         Replace each backslash with double backslash to make sure
         MS Crt arguments parser won't collapse them.

         Replace new line outside of quotes since cmd.exe doesn't let
         to do it inside.
         */
        return "\"" + str.replace(/"/g, "\"\"")
            .replace(/%/g, "\"%\"")
            .replace(/\\/g, "\\\\")
            .replace(/[\r\n]+/g, "\"^$&\"") + "\"";
    }
};

// ********************************************************************************************* //
// Registration

return NetUtils;

// ********************************************************************************************* //
});
