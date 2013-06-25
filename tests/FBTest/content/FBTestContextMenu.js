/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Tooltip Controller

/**
 * The object is responsible for registering 'popupshowing' listeners and safe clean up.
 * The clean up is important since it must happen even if the test doesn't finish.
 */
var ContextMenuController =
{
    listeners: [],

    getContextMenu: function(target)
    {
        // (Support chrome://firebug/ for backwards compatibility.)
        return FW.FBL.hasPrefix(target.ownerDocument.documentURI, "chrome://firebug/") ||
               FW.FBL.hasPrefix(target.ownerDocument.documentURI, "resource://firebugui/") ?
            FW.FBL.$("fbContextMenu") :
            FW.Firebug.chrome.window.top.window.document.getElementById("contentAreaContextMenu");
    },

    addListener: function(target, eventName, listener)
    {
        var contextMenu = this.getContextMenu(target);
        contextMenu.addEventListener(eventName, listener, false);

        this.listeners.push({
            eventName: eventName,
            contextMenu: contextMenu,
            listener: listener,
        });
    },

    removeListener: function(target, eventName, listener)
    {
        var contextMenu = this.getContextMenu(target);
        contextMenu.removeEventListener(eventName, listener, false);

        for (var i=0; i<this.listeners.length; i++)
        {
            var l = this.listeners[i];
            if (l.listener == listener)
            {
                this.listeners.splice(i, 1);
                break;
            }
        }
    },

    cleanUp: function()
    {
        for (var i=0; i<this.listeners.length; i++)
        {
            var l = this.listeners[i];
            l.contextMenu.removeEventListener(l.eventName, l.listener, false);
        }

        this.listeners = [];
    }
};

// ********************************************************************************************* //
// Clean up

window.addEventListener("unload", function testWindowUnload()
{
    ContextMenuController.cleanUp();
}, true);

// ********************************************************************************************* //
