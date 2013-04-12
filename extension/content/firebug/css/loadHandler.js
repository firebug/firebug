/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// CSS Module

/**
 * @object LoadHandler is a helpe objects that automates registerind and unregistering
 * 'load' listener and executes passed callback. This object is used by CSS panels that
 * need to populat theirs content after document (window) is fully loaded.
 */
function LoadHandler()
{
    this.inProgress = false;
}

LoadHandler.prototype =
/** @lends Firebug.TabWatcher */
{
    handle: function(context, handler)
    {
        var win = context.window;
        var doc = win.document;

        // Execute the handler now if the document is loaded, otherwise wait for "load" event.
        if (doc.readyState == "complete")
            return handler();

        if (this.inProgress)
            return;

        var self = this;
        var onLoadHandler = function()
        {
            context.removeEventListener(win, "load", onLoadHandler, true);
            self.inProgress = false;
            handler();
        };

        context.addEventListener(win, "load", onLoadHandler, true);
        this.inProgress = true;
    }
}

// ********************************************************************************************* //
// Registration

return LoadHandler;

// ********************************************************************************************* //
});
