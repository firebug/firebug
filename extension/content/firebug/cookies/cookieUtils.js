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
        var pairs = string.split(/;\s*/);

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
                        cookie.maxAge = option[1];
                        break;

                    case "expires":
                        cookie[name] = parseDate(option[1]);
                        break;

                    default:
                        cookie[name] = option[1];
                }
            }
        }

        // If the expiration date and the max. age are not set for the cookie,
        // it is a session cookie and therefore needs to be marked as such
        // by setting the expiration date to 0
        // (see issue 7658)
        if (!cookie.hasOwnProperty("expires") && !cookie.hasOwnProperty("maxAge"))
            cookie.expires = 0;

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
// Helper functions

function parseDate(dateString)
{
    // Date.parse() doesn't support the 2-digit year format and dashes,
    // so reformat it appropriatly
    // (see issue 7658)
    dateString = dateString.replace(/(\d\d)(\s|-)([a-z]+|\d\d)\2(\d{2,4})/i, (...match) =>
    {
        return match[1] + " " + match[3] + " " +
            (match[4].length === 2 ? "20" + match[4] : match[4]);
    });

    var date = Date.parse(dateString) / 1000;

    // Log error if the date isn't correctly parsed.
    if (FBTrace.DBG_COOKIES)
    {
        var tempDate = new Date(date * 1000);
        if (dateString != tempDate.toGMTString())
        {
            FBTrace.sysout("CookieUtils.parseDate: ERROR, " +
                "from: " + dateString +
                ", to: " + tempDate.toGMTString());
        }
    }

    return date;
}

// ********************************************************************************************* //

return CookieUtils;

// ********************************************************************************************* //
});

