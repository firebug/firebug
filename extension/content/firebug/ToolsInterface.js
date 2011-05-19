/* See license.txt for terms of usage */

define([
        // must not depend on Firebug
        ], function factoryToolsInterface()
{

var ToolsInterface = {

    // ------------------------------------------------------------------------------
    // Classes

    // connection to remote application
    Browser: function () { return ToolsInterface.mustOverride(); },

    // http://www.whatwg.org/specs/web-apps/current-work/multipage/browsers.html#groupings-of-browsing-contexts
    WebApp: function () { return ToolsInterface.mustOverride(); }, // WhatWG: unit of related browsing contexts.

    WebAppContext: function () { return ToolsInterface.mustOverride(); }, // Firebug metadata for a WebApp

    CompilationUnit: function () { return ToolsInterface.mustOverride(); },

    JavaScript: function () { return ToolsInterface.mustOverride(); },

    // ------------------------------------------------------------------------------
    // Singleton property that must be redefined by arch
    get browser()
    {
        return ToolsInterface.mustOverride();
    },

    // ------------------------------------------------------------------------------
    mustOverride: function()
    {
        FBTrace.sysout("ToolsInterface: missing override for a ToolsInterface function.");
        throw new Error("ToolsInterface: missing override for a ToolsInterface function.");
    },
};

ToolsInterface.Browser.prototype =
{
    /*
     * The WebApp on the selected tab of the selected window of this Browser
     * @return WebApp ( never null )
     */
    getCurrentSelectedWebApp: function() { return ToolsInterface.mustOverride(); },
    /*
     * get local metadata for the remote WebApp if it exists
     * @return ToolInterface.WebAppContext or null if the webApp is not being debugged
     */
    getContextByWebApp: function(webApp) { return ToolsInterface.mustOverride(); },
    /*
     * get local metadata for the remote WebApp or create one
     * @param webApp, ToolsInterface.WebApp representing top level window
     * @return ToolInterface.WebAppContext
     */
    getOrCreateContextByWebApp: function(webApp) { return ToolsInterface.mustOverride(); },
    /*
     * Stop debugging a WebApp and cause the destruction of a ToolsInterface.WebAppContext
     * @param webAppContext metadata for the page that we are not going to debug any more
     * @param userCommands true if the user of this UI said to close (vs algorithm)
     */
    closeContext: function(webAppContext, userCommands) { return ToolsInterface.mustOverride(); },
};

ToolsInterface.WebApp.prototype =
{
    /*
     * The Window of the top-level browsing context, aka 'top'
     * http://www.whatwg.org/specs/web-apps/current-work/multipage/browsers.html#top-level-browsing-context
     */
    getTopMostWindow: function() { return ToolsInterface.mustOverride(); },
};

ToolsInterface.toolTypes =
{
    types: [],
    register: function(toolType)
    {
        this.types.push(toolType);
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("ToolsInterface.toolTypes.register "+toolType, toolType);
    },
    unregister: function(toolType)
    {
        var index = this.types.indexOf(toolType);
        this.typs.splice(index, 1);
    },
    eachToolType: function(fnOfToolType)
    {
        for (var i = 0; i < this.types.length; i++)
        {
            fnOfToolType(this.types[i]);
        }
    }
}

ToolsInterface.initialize = function()
{
    ToolsInterface.toolTypes.eachToolType(function (toolType)
    {
        toolType.initialize()
    });
}

return ToolsInterface;

});