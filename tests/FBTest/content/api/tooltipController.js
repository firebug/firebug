/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Tooltip Controller

/**
 * The object is responsible for registering 'popupshowing' listeners and safe clean up.
 * The clean up is important since it must happen even if the test doesn't finish.
 */
var TooltipController =
{
    listeners: [],

    addListener: function(listener)
    {
        var tooltip = FW.Firebug.chrome.$("fbTooltip");
        tooltip.addEventListener("popupshowing", listener, false);
        this.listeners.push(listener);
    },

    removeListener: function(listener)
    {
        var tooltip = FW.Firebug.chrome.$("fbTooltip");
        tooltip.removeEventListener("popupshowing", listener, false);
        FW.FBL.remove(this.listeners, listener);
    },

    cleanUp: function()
    {
        // Remove all listeners registered by the current test.
        while (this.listeners.length)
            this.removeListener(this.listeners[0]);
    }
};

// ********************************************************************************************* //
// Clean up

window.addEventListener("unload", function testSelectionUnload()
{
    TooltipController.cleanUp();
}, true);
