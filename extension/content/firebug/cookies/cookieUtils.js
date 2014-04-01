/* See license.txt for terms of usage */

define([
    "firebug/cookies/cookie",
    "firebug/lib/wrapper",
    "firebug/lib/string"
],
function(Cookie, Wrapper, Str) {

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;

// ********************************************************************************************* //
// CookieUtils Implementation

var CookieUtils =
{
    isDeletedCookie: function(cookie)
    {
        if (cookie.maxAge)
            return cookie.maxAge <= 0;

        if (cookie.expires)
        {
            var expiresDate = new Date(cookie.expires * 1000);

            return expiresDate.getTime() <= Date.now();
        }

        return false;
    },

    isSessionCookie: function(cookie)
    {
        // maxAge is string value, "0" will not register as session.
        return (!cookie.expires && !cookie.maxAge)
    },

    getCookieId: function(cookie)
    {
        return cookie.host + cookie.path + cookie.name;
    },

    makeStrippedHost: function(aHost)
    {
        if (!aHost)
            return aHost;

        var formattedHost = aHost.charAt(0) == "." ? aHost.substring(1, aHost.length) : aHost;
        return formattedHost.substring(0, 4) == "www." ? formattedHost.substring(4, formattedHost.length) : formattedHost;
    },

    makeCookieObject: function(cookie)
    {
        // Remember the raw value.
        var rawValue = cookie.value;

        // Unescape '+' characters that are used to encode a space.
        // This isn't done by unescape method.
        var value = cookie.value;
        if (value)
            value = value.replace(/\+/g, " ");

        value = unescape(value);

        try
        {
            value = Str.convertToUnicode(value);
        }
        catch (exc) { }

        return {
            name        : cookie.name,
            value       : value,
            isDomain    : cookie.isDomain,
            host        : cookie.host,
            path        : cookie.path,
            isSecure    : cookie.isSecure,
            expires     : cookie.expires,
            maxAge      : cookie.maxAge,
            isHttpOnly  : cookie.isHttpOnly,
            rawValue    : rawValue,
            rawCookie   : cookie,
        };
    },

    parseFromString: function(string)
    {
        var cookie = new Object();
        var pairs = string.split("; ");

        for (var i=0; i<pairs.length; i++)
        {
            var option = pairs[i].split("=");
            if (i == 0)
            {
                cookie.name = option[0];
                cookie.value = option[1];
            }
            else
            {
                var name = option[0].toLowerCase();
                name = (name == "domain") ? "host" : name;
                switch(name)
                {
                    case "httponly":
                        cookie.isHttpOnly = true;
                        break;

                    case "secure":
                        cookie.isSecure = true;
                        break;

                    case "max-age":
                        //Remove dash from variable name
                        cookie.maxAge = option[1];
                        break;

                    case "expires":
                        var value = option[1];
                        value = value.replace(/-/g, " ");
                        cookie[name] = Date.parse(value) / 1000;

                        // Log error if the date isn't correctly parsed.
                        if (FBTrace.DBG_COOKIES)
                        {
                            var tempDate = new Date(cookie[name] * 1000);
                            if (value != tempDate.toGMTString())
                            {
                                FBTrace.sysout("cookies.parseFromString: ERROR, " +
                                    "from: " + value +
                                    ", to: " + tempDate.toGMTString() +
                                    ", cookie: " + string);
                            }
                        }
                        break;

                    default:
                        cookie[name] = option[1];
                }
            }
        }

        return cookie;
    },

    parseSentCookiesFromString: function(header)
    {
        var cookies = [];

        if (!header)
            return cookies;

        var pairs = header.split("; ");
        for (var i=0; i<pairs.length; i++)
        {
            var pair = pairs[i];
            var index = pair.indexOf("=");
            if (index > 0) {
                var name = pair.substring(0, index);
                var value = pair.substr(index+1);
                if (name.length && value.length)
                    cookies.push(new Cookie(this.makeCookieObject({name: name, value: value})));
            }
        }

        return cookies;
    },

    getRealObject: function(cookie, context)
    {
        cookie = this.makeCookieObject(cookie);
        delete cookie.rawCookie;

        var global = context.getCurrentGlobal();
        return Wrapper.cloneIntoContentScope(global, cookie);
    }
};

// ********************************************************************************************* //

return CookieUtils;

// ********************************************************************************************* //
});

