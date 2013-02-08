/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
],
function(FBTrace, Obj) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

// ********************************************************************************************* //

function BrowserLoadWatcher(browser, url, callback)
{
    this.browser = browser;
    this.callback = callback;

    // Wait for "DOMContentLoaded" event.
    this.domContentLoadedListener = Obj.bind(this.onDOMContentLoaded, this);
    this.browser.addEventListener("DOMContentLoaded", this.domContentLoadedListener, true);
    this.browser.setAttribute("src", url);
}

BrowserLoadWatcher.prototype =
{
    onDOMContentLoaded: function(event)
    {
        var target = event.target;

        // Remove "DOMContentLoaded" listener
        this.browser.removeEventListener("DOMContentLoaded", this.domContentLoadedListener, true);
        this.domContentLoadedListener = null;

        // If fbTestFrame element exists it's a swarm page.
        var fbTestFrame = target.getElementById("FBTest");

        if (FBTrace.DBG_FBTEST)
        {
            FBTrace.sysout("fbtest.watcher.onDOMContentLoaded; (frame=" +
                (fbTestFrame ? "yes" : "no") + "): " + target.location, target);
        }

        if (fbTestFrame)
        {
            this.frameLoadedListener = Obj.bind(this.onFrameLoaded, this);
            fbTestFrame.contentDocument.addEventListener("load", this.frameLoadedListener, true);
        }
        else
        {
            this.windowLoadedListener = Obj.bind(this.onWindowLoaded, this);
            this.browser.addEventListener("load", this.windowLoadedListener, true);
        }
    },

    onFrameLoaded: function(event)
    {
        var target = event.target;

        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("fbtest.watcher.onFrameLoaded " + target.getAttribute("id"), target);

        if (target.getAttribute("id") === "FBTest")
        {
            this.callback(target.contentDocument);

            browser.removeEventListener("load", this.frameLoadedListener, true);
            this.frameLoadedListener = null;
        }
    },

    onWindowLoaded: function(event)
    {
        var target = event.target;

        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("fbtest.watcher.onWindowLoaded; " + target.location, target);

        this.callback(target);

        this.browser.removeEventListener("load", this.windowLoadedListener, true);
        this.windowLoadedListener = null;
    }
};

// ********************************************************************************************* //

return BrowserLoadWatcher;

// ********************************************************************************************* //
});
