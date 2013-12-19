/* See license.txt for terms of usage */

define([
    "firebug/chrome/module",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/array",
    "firebug/chrome/window",
],
function(Module, FBTrace, Obj, Arr, Win) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var updateTimeout = 200;

var updaters = [];

// ********************************************************************************************* //
// CSSPanelUpdater Implementation

/**
 * @object The object is responsible for regular update of the {@Firebug.CSSStyleSheetPanel}
 * panel to make sure the default stylesheet is displayed to the user as soon as possible.
 * Note that the only stylesheet can come from an iframe that is dynamically appended/loaded
 * onto the current page. Introduced to fix issue 6550.
 *
 * xxxHonza: this object could replace {@LoadHandler} in the future (see issue 4893).
 *
 * The update is based on the following logic.
 * - Start regular timeout (interval) if top level window or an iframe is watched.
 * - Execute passed callback in timeout handler
 * - Clear the timeout if all watched windows are loaded.
 * - The updater can be explicitly canceled with destroy() method
 *   (in case the update has been successful)
 */
function CSSPanelUpdater(context, callback)
{
    this.context = context;
    this.callback = callback;
    this.winMap = new Map();
    this.timeout = null;
    this.canceled = false;

    updaters.push(this);
}

CSSPanelUpdater.prototype =
/** @lends CSSPanelUpdater */
{
    watchWindow: function(win)
    {
        if (this.canceled)
            return;

        this.winMap.set(win, true);

        if (this.timeout)
            return;

        this.timeout = this.context.setInterval(this.onTimeout.bind(this), updateTimeout);

        if (FBTrace.DBG_CSS)
        {
            FBTrace.sysout("CSSPanelUpdater.watchWindow; " + Win.safeGetWindowLocation(win) +
                ", " + this.timeout);
        }
    },

    unwatchWindow: function(win)
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSPanelUpdater.unwatchWindow; " + Win.safeGetWindowLocation(win));

        if (this.canceled)
            return;

        this.winMap.delete(win);

        if (!this.winMap.size && this.timeout)
        {
            this.context.clearInterval(this.timeout);
            this.timeout = null;
        }
    },

    loadWindow: function(win)
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSPanelUpdater.loadWindow; " + Win.safeGetWindowLocation(win));

        if (this.canceled)
            return;

        this.winMap.delete(win);

        if (!this.winMap.size && this.timeout)
        {
            this.context.clearInterval(this.timeout);
            this.timeout = null;
        }

        this.onTimeout();
    },

    destroy: function()
    {
        if (FBTrace.DBG_CSS)
        {
            FBTrace.sysout("CSSPanelUpdater.destroy; " + this.context.getName() +
                ", " + this.timeout);
        }

        if (this.timeout)
            this.context.clearInterval(this.timeout);

        this.winMap.clear();
        this.timeout = null;
        this.canceled = true;

        Arr.remove(updaters, this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onTimeout: function()
    {
        if (FBTrace.DBG_CSS)
        {
            FBTrace.sysout("CSSPanelUpdater.onTimeout; " + this.context.getName() +
                ", " + this.timeout);
        }

        try
        {
            this.callback();
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("CSSPanelUpdater.onTimeout; EXCEPTION " + err, err);
        }
    }
}

// ********************************************************************************************* //
// CSSPanelUpdaterModule

/**
 * @module Helper Module object for observing {@Firebug.TabWatcher} events.
 */
var CSSPanelUpdaterModule = Obj.extend(Module,
/** @lends CSSPanelUpdater */
{
    dispatchName: "CSSPanelUpdaterModule",

    watchWindow: function(context, win)
    {
        // The updater works only if the CSS panel is selected (optimization and also avoid
        // updating panel's toolbar when the panel is not visible).
        if (!this.isSelected())
            return;

        for (var i=0; i<updaters.length; i++)
        {
            var updater = updaters[i];
            if (updater.context == context)
                updater.watchWindow(win);
        }
    },

    unwatchWindow: function(context, win)
    {
        if (!this.isSelected())
            return;

        for (var i=0; i<updaters.length; i++)
        {
            var updater = updaters[i];
            if (updater.context == context)
                updater.unwatchWindow(win);
        }
    },

    loadWindow: function(context, win)
    {
        if (!this.isSelected())
            return;

        for (var i=0; i<updaters.length; i++)
        {
            var updater = updaters[i];
            if (updater.context == context)
                updater.loadWindow(win);
        }
    },

    isSelected: function()
    {
        var panel = Firebug.chrome.getSelectedPanel();
        return (panel && panel.name == "stylesheet");
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(CSSPanelUpdaterModule);

return CSSPanelUpdater;

// ********************************************************************************************* //
});
