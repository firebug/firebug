/* See license.txt for terms of usage */

define([
],
function webAppFactory() {

// ********************************************************************************************* //

// WebApp: unit of related browsing contexts.
// http://www.whatwg.org/specs/web-apps/current-work/multipage/browsers.html#groupings-of-browsing-contexts
var WebApp = function(win)
{
    this.topMostWindow = win;
};

/**
 * The Window of the top-level browsing context, aka 'top'
 * http://www.whatwg.org/specs/web-apps/current-work/multipage/browsers.html#top-level-browsing-context
 */
WebApp.prototype =
{
    getTopMostWindow: function()
    {
        return this.topMostWindow;
    }
};

// ********************************************************************************************* //
// Registration

return WebApp;

// ********************************************************************************************* //
});