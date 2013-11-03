/* See license.txt for terms of usage */

define([
    "firebug/chrome/panel",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/trace/debug",
],
function(Panel, Obj, Firebug, Debug) {

// ********************************************************************************************* //
// This is a panel implemented as its own browser with its own URL

Firebug.PluginPanel = function() {};

Firebug.PluginPanel.prototype = Obj.extend(Panel,
{
    createBrowser: function()
    {
        var doc = Firebug.chrome.window.document;
        this.browser = doc.createElement("browser");
        this.browser.addEventListener("DOMContentLoaded", this.browserReady, false);
        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("plugin.createBrowser DOMContentLoaded addEventListener\n");
        this.browser.className = "pluginBrowser";
        this.browser.setAttribute("src", this.url);  // see tabContext.createPanelType
    },

    destroyBrowser: function()
    {
        if (this.browser)
        {
            this.browser.parentNode.removeChild(this.browser);
            delete this.browser;
            if (FBTrace.DBG_INITIALIZE)
                FBTrace.sysout("plugin.destroyBrowser \n");
        }
    },

    browserReady: function()
    {
        this.browser.removeEventListener("DOMContentLoaded", this.browserReady, false);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("plugin.browserReady DOMContentLoaded addEventListener");

        this.innerPanel = this.browser.contentWindow.FirebugPanel; // XXXjjb ?
        if (this.visible)
        {
            if (this.innerPanel)
                innerCall(this.innerPanel, "initialize", [this.context.window]);
            this.updateSelection(this.selection);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    initialize: function()
    {
        this.browserReady = Obj.bindFixed(this.browserReady, this);
        Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        this.destroyBrowser();
        Panel.destroy.apply(this, arguments);
    },

    show: function(state)
    {
        if (!this.browser)
            this.createBrowser();
    },

    hide: function()
    {
    },

    supportsObject: function(object, type)
    {
        if (this.innerPanel)
            return innerCall(this.innerPanel, "supportsObject", [object, type]);
        else
            return 0;
    },

    updateSelection: function(object)
    {
        if (!this.innerPanel)
            return;

        innerCall(this.innerPanel, "select", [object]);
    },

    getObjectPath: function(object)
    {
    },

    getDefaultSelection: function()
    {
    },

    updateOption: function(name, value)
    {
    },

    getOptionsMenuItems: function()
    {
    },

    getContextMenuItems: function(object, target)
    {
    },

    getEditor: function(target, value)
    {
    }
});

// ********************************************************************************************* //

function innerCall(innerPanel, name, args)
{
    try
    {
        innerPanel[name].apply(innerPanel, args);
    }
    catch (exc)
    {
        Debug.ERROR(exc);
    }
}

// ********************************************************************************************* //
// Registration

return Firebug.PluginPanel;

// ********************************************************************************************* //
});
