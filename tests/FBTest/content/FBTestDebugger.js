/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Debugger Controller

/**
 * The object is responsible for registering DebuggerTool listeners and safe clean up.
 */
var DebuggerController =
{
    listeners: [],

    addListener: function(listener)
    {
        FW.Firebug.DebuggerClientModule.addListener(listener);
        this.listeners.push(listener);
    },

    removeListener: function(listener)
    {
        FW.Firebug.DebuggerClientModule.removeListener(listener);
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
    DebuggerController.cleanUp();
}, true);
