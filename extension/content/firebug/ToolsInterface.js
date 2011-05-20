/* See license.txt for terms of usage */

define([
        // must not depend on Firebug
        ], function factoryToolsInterface()
{
/*
 * ToolsInterface declares browser-independent classes and methods.
 * Users of the interface define functions that call methods.
 *    Users depend on ToolsInterface
 * Implementors of the interface define browser-dependent methods
 *    Implementors depend on ToolsInterface
 * main.js depend upon users and particular implementors
 */
var ToolsInterface =
{
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

Firebug.connection.prototype =
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

ToolsInterface.CompilationUnit.prototype =
{
    /*
     * Returns the Kind of Compilation Unit
     * @return one of a few constant strings we should declare.
     *
     * <p>
     * 	This function does not require communication with the browser.
     * </p>
     */
    getKind: function() { return ToolsInterface.mustOverride(); },


    isExecutableLine: function(lineNo) { return ToolsInterface.mustOverride(); },
    /**
     * Returns the URL of this compilation unit.
     * <p>
     * This function does not require communication with
     * the browser.
     * </p>
     *
     * @function
     * @returns compilation unit identifier as a {@link String}
     */
    getURL: function() { return ToolsInterface.mustOverride(); },
    /**
     * Returns the breakpoints that have been created in this compilation unit and
     * have not been cleared.
     * <p>
     * This function does not require communication with
     * the browser.
     * </p>
     * @function
     * @returns an array of {@link Breakpoint}'s
     */
    getBreakpoints: function(){ return ToolsInterface.mustOverride(); },

    eachBreakpoint: function( fnOfLineProps ) { return ToolsInterface.mustOverride(); },
    /**
     * Requests the source of this compilation unit asynchronously. Source will be
     * retrieved from the browser and reported back to the listener function when available.
     * The handler may be called before or after this function returns.
     * <p>
     * TODO: what if the compilation unit no longer exists in the browser
     * </p>
     * @function
     * @param firstLineNumber requested line number starting point; < 1 means from lowest line number
     * @param lastLineNumber request last line number; < 1 means up to maximum line
     * @param listener a listener (function) that accepts (compilationUnit, firstLineNumber, lastLineNumber, array of source code lines)
     */
    getSourceLines: function(firstLine, lastLine, listener) { return ToolsInterface.mustOverride(); },
    /*
     * Request the current estimated number of source lines in the entire compilationUnit
     */
    getNumberOfLines: function() { return ToolsInterface.mustOverride(); },
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

ToolsInterface.dispatch = function(toolTypeMethodName)
{
    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("ToolsInterface.dispatch "+toolTypeMethodName+" to "+ToolsInterface.toolTypes.types.length);

    ToolsInterface.toolTypes.eachToolType(function (toolType)
    {
        toolType[toolTypeMethodName].apply(toolType,[]);
    });
}

ToolsInterface.initialize = function(){ToolsInterface.dispatch('initialize');}
ToolsInterface.destroy    = function(){ToolsInterface.dispatch('destroy');}

return ToolsInterface;

});