/* See license.txt for terms of usage */

define([
        ],
function webAppFactory()
{
    var WebApp = function(win) {
        this.topMostWindow = win;
    }

    WebApp.prototype =
    {
        getTopMostWindow: function()
        {
            return this.topMostWindow;
        }
    }

    return WebApp;
});