/* See license.txt for terms of usage */

define([
    "firebug/lib/xpcom",
    "firebug/lib/json",
    "firebug/lib/string",
],
function(Xpcom, Json) {

// ********************************************************************************************* //
// Constants

const ioService = Xpcom.CCSV("@mozilla.org/network/io-service;1", "nsIIOService");

// ********************************************************************************************* //
// Cookie object

/**
 * @class Represents a cookie object that is created as a representation of
 * nsICookie component in the browser.
 */
function Cookie(cookie, action)
{
    this.cookie = cookie;
    this.action = action;
    this.rawHost = makeStrippedHost(cookie.host);
}

Cookie.prototype =
/** @lends Cookie */
{
    cookie: null,
    action: null,

    toString: function(noDomain)
    {
        var expires = this.cookie.expires ? new Date(this.cookie.expires * 1000) : null;
        return this.cookie.name + "=" + this.cookie.rawValue +
            (expires ? "; expires=" + expires.toGMTString() : "") +
            (this.cookie.maxAge ? "; Max-Age=" + this.cookie.maxAge : "") +
            ((this.cookie.path) ? "; path=" + this.cookie.path : "; path=/") +
            (noDomain ? "" : ((this.cookie.host) ? "; domain=" + this.cookie.host : "")) +
            ((this.cookie.isSecure) ? "; Secure" : "") +
            ((this.cookie.isHttpOnly) ? "; HttpOnly" : "");
    },

    toJSON: function()
    {
        return JSON.stringify({
            name: this.cookie.name,
            value: this.cookie.rawValue,
            expires: (this.cookie.expires ? this.cookie.expires : 0),
            maxAge: (this.cookie.maxAge ? this.cookie.maxAge : ""),
            path: (this.cookie.path ? this.cookie.path : "/"),
            host: this.cookie.host,
            isHttpOnly: (this.cookie.isHttpOnly),
            isSecure: (this.cookie.isSecure)
        });
    },

    toText: function()
    {
        return this.cookie.host + "\t" +
            new String(this.cookie.isDomain).toUpperCase() + "\t" +
            this.cookie.path + "\t" +
            new String(this.cookie.isSecure).toUpperCase() + "\t" +
            (this.cookie.expires ? this.cookie.expires + "\t" : "") +
            (this.cookie.maxAge ? this.cookie.maxAge + "\t" : "") +
            this.cookie.name + "\t" +
            this.cookie.rawValue + "\r\n";
    },

    getJsonValue: function()
    {
        if (this.json)
            return this.json;

        var jsonString = new String(this.cookie.value);
        if (jsonString.indexOf("{") != 0)
            return null;

        var currentURI = Firebug.chrome.getCurrentURI();
        var jsonObject = Json.parseJSONString(jsonString, currentURI.spec);
        if (typeof (jsonObject) != "object")
            return null;

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.getJsonValue for: " + this.cookie.name, jsonObject);

        return (this.json = jsonObject);
    },

    getXmlValue: function()
    {
        if (this.xml)
            return this.xml;

        try
        {
            var value = this.cookie.value;

            // Simple test if the source is XML (to avoid errors in the Firefox Error console)
            if (value.indexOf("<") != 0)
                return null;

            var parser = Xpcom.CCIN("@mozilla.org/xmlextras/domparser;1", "nsIDOMParser");
            var doc = parser.parseFromString(value, "text/xml");
            var docElem = doc.documentElement;

            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.getXmlValue for: " + this.cookie.name);

            // Error handling
            var nsURI = "http://www.mozilla.org/newlayout/xml/parsererror.xml";
            if (docElem.namespaceURI == nsURI && docElem.nodeName == "parsererror")
                return null;

            return (this.xml = docElem);
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("cookies.getXmlValue ERROR " + this.cookie.name, e);
        }

        return null;
    },

    getURI: function()
    {
        try
        {
            var host = this.cookie.host;
            var path = this.cookie.path;

            var httpProtocol = this.cookie.isSecure ? "https://" : "http://";
            var uri = httpProtocol + host + (path ? path : "");
            return ioService.newURI(uri, null, null);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.getURI FAILS for " + this.cookie.name);
        }

        return null;
    },

    getSize: function()
    {
        return this.cookie.name.length + this.cookie.value.length;
    },

    getRawSize: function()
    {
        return this.cookie.name.length + this.cookie.rawValue.length;
    }
};

// ********************************************************************************************* //
// Helpers

// xxxHonza: duplicated in CookieUtils since cycle dep
function makeStrippedHost(aHost)
{
    if (!aHost)
        return aHost;

    var formattedHost = aHost.charAt(0) == "." ? aHost.substring(1, aHost.length) : aHost;
    return formattedHost.substring(0, 4) == "www." ? formattedHost.substring(4, formattedHost.length) : formattedHost;
}

// ********************************************************************************************* //

return Cookie;

// ********************************************************************************************* //
});
