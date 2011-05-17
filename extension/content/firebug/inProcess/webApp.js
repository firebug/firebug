/* See license.txt for terms of usage */

define([
        "firebug/ToolsInterface"
        ],
function webAppFactory(ToolsInterface)
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

    ToolsInterface.WebApp = WebApp;

    return WebApp;
});