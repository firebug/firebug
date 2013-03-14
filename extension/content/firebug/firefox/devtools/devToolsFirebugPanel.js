/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/options",
    "firebug/lib/locale",
    "firebug/lib/promise",
    "firebug/firefox/browserOverlayLib",
],
function(FBTrace, Options, Locale, Promise, BrowserOverlayLib) {
with (BrowserOverlayLib) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// ********************************************************************************************* //
// DevToolsOverlay Implementation

function DevToolsFirebugPanel(frame, target)
{
    this.frame = frame;
    this.target = target;

    this.target.on("navigate", this.navigate);
    this.target.on("will-navigate", this.beforeNavigate);
    this.target.on("close", this.destroy);
}

DevToolsFirebugPanel.prototype =
{
    open: function(win)
    {
        this.win = win;
        this.doc = win.document;

        var deferred = Promise.defer();

        this.startFirebug(function(Firebug)
        {
            Firebug.toggleBar();
            deferred.resolve();
        });

        return deferred.promise;
    },

    destroy: function()
    {
        FBTrace.sysout("DevToolsFirebugPanel.destroy");
    },

    beforeNavigate: function()
    {
        FBTrace.sysout("DevToolsFirebugPanel.beforeNavigate");
    },

    navigate: function()
    {
        FBTrace.sysout("DevToolsFirebugPanel.navigate");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Load Rest of Firebug

    /**
     * This method is called by the Fremework to load entire Firebug. It's executed when
     * the user requires Firebug for the first time.
     *
     * @param {Object} callback Executed when Firebug is fully loaded
     */
    startFirebug: function(callback)
    {
        if (this.win.Firebug.waitingForFirstLoad)
            return;

        if (this.win.Firebug.isInitialized)
            return callback && callback(this.win.Firebug);

        if (FBTrace.DBG_INITIALIZE)
            FBTrace.sysout("overlay; Load Firebug...", (callback ? callback.toString() : ""));

        this.win.Firebug.waitingForFirstLoad = true;

        // List of Firebug scripts that must be loaded into the global scope (browser.xul)
        // FBTrace is no longer loaded into the global space.
        var scriptSources = [
            "chrome://firebug/content/legacy.js",
            "chrome://firebug/content/moduleConfig.js"
        ];

        // Create script elements.
        var self = this;
        scriptSources.forEach(function(url)
        {
            $script(self.doc, url);
        });

        var container = this.frame.window.document.getElementById("fbMainContainer");
        container.setAttribute("src", "chrome://firebug/content/firefox/firebugFrame.xul");

        // When Firebug is fully loaded and initialized it fires a "FirebugLoaded"
        // event to the browser document (browser.xul scope). Wait for that to happen.
        this.doc.addEventListener("FirebugLoaded", function onLoad()
        {
            self.doc.removeEventListener("FirebugLoaded", onLoad, false);
            self.win.Firebug.waitingForFirstLoad = false;

            // xxxHonza: TODO find a better place for notifying extensions
            FirebugLoader.dispatchToScopes("firebugFrameLoad", [self.win.Firebug]);
            callback && callback(self.win.Firebug);
        }, false);
    },
};

// ********************************************************************************************* //
// Registration

return DevToolsFirebugPanel;

// ********************************************************************************************* //
}});
