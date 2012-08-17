/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/menu",
    "firebug/lib/string",
    "firebug/lib/events",
],
function(FBTrace, Obj, Menu, Str, Events) {

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// TabWatcherProxy

function TabWatcherProxy(connection)
{
    this.connection = connection;
}

TabWatcherProxy.prototype =
{
    dispatchName: "TabWatchListener",

    /**
     * Called after a context is created
     * @param {Object} context
     * @param {Object} persistedState
     */
    initContext: function(context, persistedState)
    {
    },

    /**
     * To be called from Firebug.TabWatcher only, see selectContext
     * Firebug.TabWatcher showContext. null context means we don't debug that browser
     */
    showContext: function(browser, context)
    {
    },

    /**
     * the context for this browser has been destroyed and removed
     * @param {Object} browser
     */
    unwatchBrowser: function(browser)
    {
    },

    /**
     * Either a top level or a frame, (interior window) for an exist context is seen
     * by the tabWatcher.
     *
     * @param {Object} context
     * @param {Object} win
     */
    watchWindow: function(context, win)
    {
    },

    unwatchWindow: function(context, win)
    {
    },

    loadedContext: function(context)
    {
    },

    destroyContext: function(context, persistedState, browser)
    {
    },

    onSourceFileCreated: function()
    {
    },

    shouldCreateContext: function()
    {
    },

    shouldNotCreateContext: function()
    {
    },

    shouldShowContext: function()
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getTabs: function(callback)
    {
        if (FBTrace.DBG_TABWATCHER)
            FBTrace.sysout("tabWatcherProxy.getTabList;");

        this.connection.sendPacket("root", "listTabs", true, function(packet)
        {
            var result = [];
            var tabs = packet.tabs;
            for (var i=0; i<tabs.length; ++i)
            {
                var tab = tabs[i];
                result.push({
                    id: tab.actor,
                    label: tab.title ? tab.title : tab.url,
                })
            }

            callback(result);
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onSelectTab: function(tab)
    {
        // TODO: dispatch to the BTI.listener.
    }
};

// ********************************************************************************************* //
// Registration

return TabWatcherProxy;

// ********************************************************************************************* //
});
