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
// LoadHandler Implementation

/**
 * @object LoadHandler is a helper objects that automates registering and unregistering
 * 'load' listener and executes passed callback. This object is used by CSS panels that
 * need to populate theirs content after document (window) is fully loaded.
 *
 * xxxHonza: instead of waiting for window 'load' event (and so wait till all images are
 * loaded), we should wait for 'load' event fired by the stylesheet itself (see issue 4893).
 */
function LoadHandler()
{
    this.inProgress = false;
}

LoadHandler.prototype =
/** @lends LoadHandler */
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
