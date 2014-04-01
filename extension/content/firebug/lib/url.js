/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/string",
    "firebug/lib/options",
],
function (FBTrace, Str, Options) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

// ********************************************************************************************* //
// Implementation

var Url = {};

// ************************************************************************************************
// Regular expressions

Url.reCSS = /\.css$/;
Url.reJavascript = /\s*javascript:\s*(.*)/;
Url.reFile = /file:\/\/([^\/]*)\//;
Url.reChrome = /chrome:\/\/([^\/]*)\//;
Url.reDataURL = /data:text\/javascript;fileName=([^;]*);baseLineNumber=(\d*?),((?:.*?%0A)|(?:.*))/g;

// ************************************************************************************************
// URLs

Url.getFileName = function(url)
{
    var split = Url.splitURLBase(url);
    return split.name;
};

Url.getProtocol = function(url)
{
    var split = Url.splitURLBase(url);
    return split.protocol;
};

Url.splitURLBase = function(url)
{
    if (Url.isDataURL(url))
        return Url.splitDataURL(url);
    return Url.splitURLTrue(url);
};

Url.splitDataURL = function(url)
{
    if (!Str.hasPrefix(url, "data:"))
        return false; //  the first 5 chars must be 'data:'

    var point = url.indexOf(",", 5);
    if (point < 5)
        return false; // syntax error

    var props = { protocol: "data", encodedContent: url.substr(point+1) };

    var metadataBuffer = url.substring(5, point);
    var metadata = metadataBuffer.split(";");
    for (var i = 0; i < metadata.length; i++)
    {
        var nv = metadata[i].split("=");
        if (nv.length == 2)
            props[nv[0]] = nv[1];
    }

    // Additional Firebug-specific properties
    if (props.hasOwnProperty("fileName"))
    {
         var caller_URL = decodeURIComponent(props["fileName"]);
         var caller_split = Url.splitURLTrue(caller_URL);

         props["fileName"] = caller_URL;

        if (props.hasOwnProperty("baseLineNumber"))  // this means it's probably an eval()
        {
            props["path"] = caller_split.path;
            props["line"] = props["baseLineNumber"];
            var hint = decodeURIComponent(props["encodedContent"]).substr(0,200).replace(/\s*$/, "");
            props["name"] =  "eval->"+hint;
        }
        else
        {
            props["name"] = caller_split.name;
            props["path"] = caller_split.path;
        }
    }
    else
    {
        if (!props.hasOwnProperty("path"))
            props["path"] = "data:";
        if (!props.hasOwnProperty("name"))
            props["name"] =  decodeURIComponent(props["encodedContent"]).substr(0,200).replace(/\s*$/, "");
    }

    return props;
};

const reSplitFile = /(.*?):\/{2,3}([^\/]*)(.*?)([^\/]*?)($|\?.*)/;
Url.splitURLTrue = function(url)
{
    var m = reSplitFile.exec(url);
    if (!m)
        return {name: url, path: url};
    else if (m[4] == "" && m[5] == "")
        return {protocol: m[1], domain: m[2], path: m[3], name: m[3] != "/" ? m[3] : m[2]};
    else
        return {protocol: m[1], domain: m[2], path: m[2]+m[3], name: m[4]+m[5]};
};

Url.getFileExtension = function(url)
{
    if (!url)
        return null;

    // Remove query string from the URL if any.
    var queryString = url.indexOf("?");
    if (queryString != -1)
        url = url.substr(0, queryString);

    // Now get the file extension.
    var lastDot = url.lastIndexOf(".");
    return url.substr(lastDot+1);
};

Url.isSystemURL = function(url)
{
    if (!url) return true;
    if (url.length == 0) return true;
    if (url[0] == "h") return false;
    if (url.substr(0, 9) == "resource:")
        return true;
    else if (url.substr(0, 16) == "chrome://firebug")
        return true;
    else if (url.substr(0, 6) == "about:")
        return true;
    else
        return false;
};

Url.isSystemPage = function(win)
{
    try
    {
        var doc = win.document;
        if (!doc)
            return false;

        // Detect pages for pretty printed XML
        if ((doc.styleSheets.length && doc.styleSheets[0].href
                == "chrome://global/content/xml/XMLPrettyPrint.css")
            || (doc.styleSheets.length > 1 && doc.styleSheets[1].href
                == "chrome://browser/skin/feeds/subscribe.css"))
            return true;

        return Url.isSystemURL(win.location.href);
    }
    catch (exc)
    {
        // Sometimes documents just aren't ready to be manipulated here, but don't let that
        // gum up the works
        FBTrace.sysout("Url.isSystemPage; EXCEPTION document not ready?: " + exc);
        return false;
    }
};

Url.isSystemStyleSheet = function(sheet)
{
    var href = sheet && sheet.href;
    return href && Url.isSystemURL(href);
};

Url.getURIHost = function(uri)
{
    try
    {
        if (uri)
            return uri.host;
        else
            return "";
    }
    catch (exc)
    {
        return "";
    }
};

Url.isLocalURL = function(url)
{
    if (url.substr(0, 5) == "file:")
        return true;
    else if (url.substr(0, 8) == "wyciwyg:")
        return true;
    else
        return false;
};

Url.isDataURL = function(url)
{
    return (url && url.substr(0,5) == "data:");
};

Url.getLocalPath = function(url)
{
    if (this.isLocalURL(url))
    {
        var fileHandler = ioService.getProtocolHandler("file")
            .QueryInterface(Ci.nsIFileProtocolHandler);
        var file = fileHandler.getFileFromURLSpec(url);
        return file.path;
    }
};

/**
 * Mozilla URI from non-web URL
 * @param URL
 * @returns undefined or nsIURI
 */
Url.getLocalSystemURI = function(url)
{
    try
    {
        var uri = ioService.newURI(url, null, null);
        if (uri.schemeIs("resource"))
        {
            var ph = ioService.getProtocolHandler("resource")
                .QueryInterface(Ci.nsIResProtocolHandler);
            var abspath = ph.getSubstitution(uri.host);
            uri = ioService.newURI(uri.path.substr(1), null, abspath);
        }
        while (uri.schemeIs("chrome"))
        {
            var chromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"]
                .getService(Ci.nsIChromeRegistry);
            uri = chromeRegistry.convertChromeURL(uri);
        }
        return uri;
    }
    catch(exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("getLocalSystemURI failed for "+url);
    }
};

/*
 * Mozilla native path for local URL
 */
Url.getLocalOrSystemPath = function(url, allowDirectories)
{
    var uri = Url.getLocalSystemURI(url);
    if (uri instanceof Ci.nsIFileURL)
    {
        var file = uri.file;
        if (allowDirectories)
            return file && file.path;
        else
            return file && !file.isDirectory() && file.path;
    }
};

Url.getLocalOrSystemFile = function(url)
{
    var uri = Url.getLocalSystemURI(url);
    if (uri instanceof Ci.nsIFileURL)
        return uri.file;
};

Url.getURLFromLocalFile = function(file)
{
    var fileHandler = ioService.getProtocolHandler("file")
        .QueryInterface(Ci.nsIFileProtocolHandler);
    var URL = fileHandler.getURLSpecFromFile(file);
    return URL;
};

Url.getDataURLForContent = function(content, url)
{
    // data:text/javascript;fileName=x%2Cy.js;baseLineNumber=10,<the-url-encoded-data>
    var uri = "data:text/html;";
    uri += "fileName="+encodeURIComponent(url)+ ",";
    uri += encodeURIComponent(content);
    return uri;
};

Url.getDomain = function(url)
{
    var m = /[^:]+:\/{1,3}([^\/]+)/.exec(url);
    return m ? m[1] : "";
};

Url.getURLPath = function(url)
{
    var m = /[^:]+:\/{1,3}[^\/]+(\/.*?)$/.exec(url);
    return m ? m[1] : "";
};

Url.getPrettyDomain = function(url)
{
    var m = /[^:]+:\/{1,3}(www\.)?([^\/]+)/.exec(url);
    return m ? m[2] : "";
};

/**
 * Returns the base URL for a given window
 * @param {Object} win DOM window
 * @returns {String} Base URL
 */
Url.getBaseURL = function(win)
{
    if (!win)
        return;

    var base = win.document.getElementsByTagName("base").item(0);
    return base ? base.href : win.location.href;
};

/**
 * Returns true if the URL is absolute otherwise false, see the following
 * examples:
 *
 * 1) http://example.com -> true
 * 2) //myserver/index.html -> true
 * 3) index.html -> false
 * 4) /index.html -> false
 *
 * @param {String} URL
 * @returns {Boolean} True if the URL is absolute.
 */
Url.isAbsoluteUrl = function(url)
{
    return (/^(?:[a-z]+:)?\/\//i.test(url))
}

Url.absoluteURL = function(url, baseURL)
{
    // Replace "/./" with "/" using regular expressions (don't use string since /./
    // can be treated as regular expressoin too, see 3551).
    return Url.absoluteURLWithDots(url, baseURL).replace(/\/\.\//, "/", "g");
};

Url.absoluteURLWithDots = function(url, baseURL)
{
    // Should implement http://www.apps.ietf.org/rfc/rfc3986.html#sec-5
    // or use the newURI approach described in issue 3110.
    // See tests/content/lib/absoluteURLs.js

    if (url.length === 0)
        return baseURL;

    var R_query_index = url.indexOf("?");
    var R_head = url;
    if (R_query_index !== -1)
        R_head = url.substr(0, R_query_index);

    if (url.indexOf(":") !== -1)
        return url;

    var reURL = /(([^:]+:)\/{1,2}[^\/]*)(.*?)$/;
    var m_url = reURL.exec(R_head);
    if (m_url)
        return url;

    var B_query_index = baseURL.indexOf("?");
    var B_head = baseURL;
    if (B_query_index !== -1)
        B_head = baseURL.substr(0, B_query_index);

    if (url[0] === "?")   // cases where R.path is empty.
        return B_head + url;
    if  (url[0] === "#")
        return baseURL.split("#")[0]+url;

    var m = reURL.exec(B_head);
    if (!m)
        return "";

    var head = m[1];
    var tail = m[3];
    if (url.substr(0, 2) == "//")
    {
        return m[2] + url;
    }
    else if (url[0] == "/")
    {
        return head + url;
    }
    else if (tail[tail.length-1] == "/")
    {
        return B_head + url;
    }
    else
    {
        var parts = tail.split("/");
        return head + parts.slice(0, parts.length-1).join("/") + "/" + url;
    }
};

/**
 * xxxHonza: This gets called a lot, any performance improvement welcome.
 */
Url.normalizeURL = function(url)
{
    if (!url)
        return "";

    // Guard against monsters.
    if (url.length > 255)
        return url;

    // Normalize path traversals (a/b/../c -> a/c).
    while (url.contains("/../") && url[0] != "/")
        url = url.replace(/[^\/]+\/\.\.\//g, "");

    // Issue 1496, avoid #
    url = url.replace(/#.*/, "");

    // For script tags inserted dynamically sometimes the script.fileName is bogus
    if (url.contains("->"))
        url = url.replace(/[^\s]*\s->\s/, "");

    if (url.startsWith("chrome:"))
    {
        var m = /^chrome:\/\/([^\/]*)\/(.*?)$/.exec(url);
        if (m)
        {
            url = "chrome://" + m[1].toLowerCase() + "/" + m[2];
        }
    }
    return url;
};

Url.denormalizeURL = function(url)
{
    return url.replace(/file:\/\/\//g, "file:/");
};

// ********************************************************************************************* //

Url.parseURLParams = function(url)
{
    var q = url ? url.indexOf("?") : -1;
    if (q == -1)
        return [];

    var search = url.substr(q+1);
    var h = search.lastIndexOf("#");
    if (h != -1)
        search = search.substr(0, h);

    if (!search)
        return [];

    return Url.parseURLEncodedText(search);
};

Url.parseURLEncodedText = function(text, noLimit)
{
    const maxValueLength = 25000;

    var params = [];

    // In case the text is empty just return the empty parameters
    if (text == "")
        return params;

    // Unescape '+' characters that are used to encode a space.
    // See section 2.2.in RFC 3986: http://www.ietf.org/rfc/rfc3986.txt
    text = text.replace(/\+/g, " ");

    // Unescape '&amp;' character
    text = Str.unescapeForURL(text);

    function decodeText(text)
    {
        try
        {
            return decodeURIComponent(text);
        }
        catch (e)
        {
            return decodeURIComponent(unescape(text));
        }
    }

    var args = text.split("&");
    for (var i = 0; i < args.length; ++i)
    {
        try
        {
            var index = args[i].indexOf("=");
            if (index != -1)
            {
                var paramName = args[i].substring(0, index);
                var paramValue = args[i].substring(index + 1);

                if (paramValue.length > maxValueLength && !noLimit)
                    paramValue = Locale.$STR("LargeData");

                params.push({name: decodeText(paramName), value: decodeText(paramValue)});
            }
            else
            {
                var paramName = args[i];
                params.push({name: decodeText(paramName), value: ""});
            }
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("parseURLEncodedText EXCEPTION ", e);
                FBTrace.sysout("parseURLEncodedText EXCEPTION URI", args[i]);
            }
        }
    }

    if (Options.get("netSortPostParameters"))
        params.sort((a, b) => { return a.name <= b.name ? -1 : 1; });

    return params;
};

Url.reEncodeURL = function(file, text, noLimit)
{
    var lines = text.split("\n");
    var params = Url.parseURLEncodedText(lines[lines.length-1], noLimit);

    var args = [];
    for (var i = 0; i < params.length; ++i)
        args.push(encodeURIComponent(params[i].name)+"="+encodeURIComponent(params[i].value));

    var url = file.href;
    url += (url.indexOf("?") == -1 ? "?" : "&") + args.join("&");

    return url;
};

/**
 * Extracts the URL from a CSS URL definition.
 * Example: url(../path/to/file) => ../path/to/file
 * @param {String} url CSS URL definition
 * @returns {String} Extracted URL
 */
Url.extractFromCSS = function(url)
{
    return url.replace(/^url\(["']?(.*?)["']?\)$/, "$1");
};

Url.makeURI = function(urlString)
{
    try
    {
        if (urlString)
            return ioService.newURI(urlString, null, null);
    }
    catch (exc)
    {
        //var explain = {message: "Firebug.lib.makeURI FAILS", url: urlString, exception: exc};
        // todo convert explain to json and then to data url
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("makeURI FAILS for \""+urlString+"\" ", exc);

        return false;
    }
};

/**
 * Converts resource: to file: Url.
 * @param {String} resourceURL
 */
Url.resourceToFile = function(resourceURL)
{
    var resHandler = ioService.getProtocolHandler("resource")
        .QueryInterface(Ci.nsIResProtocolHandler);

    var justURL = resourceURL.split("resource://")[1];
    var split = justURL.split("/");
    var sub = split.shift();

    var path = resHandler.getSubstitution(sub).spec;
    return path + split.join("/");
};

// ********************************************************************************************* //
// Registration

return Url;

// ********************************************************************************************* //
});
