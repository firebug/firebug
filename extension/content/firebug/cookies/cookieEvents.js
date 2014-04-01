/* See license.txt for terms of usage */

define([
    "firebug/cookies/cookieUtils"
],
function(CookieUtils) {

// ********************************************************************************************* //
// Cookie Event objects

/**
 * This object represents a "cookie-changed" event (repObject).
 * There are three types of cookie modify events:
 * "changed", "added" and "deleted".
 * Appropriate type is specified by action parameter.
 */
function CookieChangedEvent(context, cookie, action)
{
    this.context = context;
    this.cookie = cookie;
    this.action = action;
    this.rawHost = CookieUtils.makeStrippedHost(cookie.host);
    this.getId = function()
    {
        return this.action + this.rawHost + this.cookie.name + ":" + this.cookie.value;
    };
}

/**
 * This object represents "cleared" event, which is raised when the user
 * deletes all cookies (e.g. in the system cookies dialog).
 */
function CookieClearedEvent()
{
}

/**
 * This object represents "cookie-rejected" event, which is fired if cookies
 * from specific domain are rejected.
 */
function CookieRejectedEvent(context, uri)
{
    this.context = context;
    this.uri = uri;
}

// ********************************************************************************************* //
// Registration

return {
    CookieChangedEvent: CookieChangedEvent,
    CookieClearedEvent: CookieClearedEvent,
    CookieRejectedEvent: CookieRejectedEvent
};

// ********************************************************************************************* //
});

