/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/array",
],
function(FBTrace, Arr) {

// ********************************************************************************************* //
// Selection Controller

/**
 * Text selection event is dispatched to all registered listeners. The original update
 * comes from command updated registered in overlayFirebug.xul
 *
 * @namespace
 */
FBTestApp.SelectionController =
{
    listeners: [],

    addListener: function(listener)
    {
        this.listeners.push(listener);
    },

    removeListener: function(listener)
    {
        Arr.remove(this.listeners, listener);
    },

    selectionChanged: function()
    {
        this.listeners.forEach(function(listener)
        {
            try
            {
                listener();
            }
            catch (e)
            {
                FBTrace.sysout("SelectionController.selectionChanged; EXCEPTION " + e, e);
                FBTestApp.FBTest.exception("SelectionController", e);
            }
        });
    }
};

// ********************************************************************************************* //
// Registration

return FBTestApp.SelectionController;

// ********************************************************************************************* //
});
