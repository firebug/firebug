/* See license.txt for terms of usage */

define([
],
function() {

// ********************************************************************************************* //
// Menu Utils

var CookieUtils = 
{
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

        var c = { 
            name        : cookie.name,
            value       : unescape(value),
            isDomain    : cookie.isDomain,
            host        : cookie.host,
            path        : cookie.path,
            isSecure    : cookie.isSecure,
            expires     : cookie.expires,
            isHttpOnly  : cookie.isHttpOnly,
            rawValue    : rawValue
        };

        return c;
    }
};

// ********************************************************************************************* //

return CookieUtils;

// ********************************************************************************************* //
});

