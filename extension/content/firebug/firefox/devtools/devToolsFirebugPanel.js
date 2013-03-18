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

Cu.import("resource:///modules/devtools/EventEmitter.jsm");

// ********************************************************************************************* //
// DevToolsOverlay Implementation

function DevToolsFirebugPanel(frame, target)
{
    if (FBTrace.DBG_DEVTOOLS)
        FBTrace.sysout("devToolsFirebugPanel.constructor;", arguments);

    EventEmitter.decorate(this);

    this.frame = frame;
    this.target = target;

    this.target.on("navigate", this.navigate);
    this.target.on("will-navigate", this.beforeNavigate);
    //this.target.on("close", this.close);
    this.target.on("hidden", this.hidden);
    this.target.on("visible",  this.visible);
}

DevToolsFirebugPanel.prototype =
{
    open: function(win)
    {
        if (FBTrace.DBG_DEVTOOLS)
            FBTrace.sysout("devToolsFirebugPanel.open;", arguments);

        this.win = win;
        this.doc = win.document;

        var deferred = Promise.defer();

        // Asynchronously load all Firebug modules whenever DevTools UI is opened and the
        // Firebug panel selected.
        var self = this;
        this.win.Firebug.browserOverlay.startFirebug(function(Firebug)
        {
            // Embed entire Firebug UI (firebugFrame.xul) into Devtools Toolbox UI.
            self.importFirebug();

            // Make sure context is created.
            Firebug.toggleBar();

            // Loading done, notify the toolbox.
            deferred.resolve(self);
        });

        return deferred.promise;
    },

    destroy: function()
    {
        if (FBTrace.DBG_DEVTOOLS)
            FBTrace.sysout("DevToolsFirebugPanel.destroy");

        // Undetach Firebug from DevTools toolbox so, it isn't destroyed with it.
        this.exportFirebug();
    },

    beforeNavigate: function()
    {
        if (FBTrace.DBG_DEVTOOLS)
            FBTrace.sysout("DevToolsFirebugPanel.beforeNavigate");
    },

    navigate: function()
    {
       if (FBTrace.DBG_DEVTOOLS)
            FBTrace.sysout("DevToolsFirebugPanel.navigate");
    },

    hidden: function()
    {
        if (FBTrace.DBG_DEVTOOLS)
            FBTrace.sysout("DevToolsFirebugPanel.hidden");
    },

    visible: function()
    {
        if (FBTrace.DBG_DEVTOOLS)
            FBTrace.sysout("DevToolsFirebugPanel.visible");
    },

    // xxxHonza: import/exportFirebug is also in firebug.xul, could we reuse?
    importFirebug: function()
    {
        var Firebug = this.win.Firebug, fbc = Firebug.chrome;

        Firebug.minimizeBar();

        fbc.originalBrowser = this.win.top.document.getElementById("fbMainContainer");
        fbc.inDetachedScope = true;

        var newBrowser = this.frame.document.getElementById("fbMainContainer");
        fbc.swapBrowsers(
            fbc.originalBrowser,
            newBrowser
        );
    },

    exportFirebug: function()
    {
        var Firebug = this.win.Firebug, fbc = Firebug.chrome;

        fbc.inDetachedScope = false;

        var oldBrowser = this.frame.document.getElementById("fbMainContainer");
        fbc.swapBrowsers(
            oldBrowser,
            fbc.originalBrowser
        );

        Firebug.setPlacement("minimized");
    }
};

// ********************************************************************************************* //
// Registration

return DevToolsFirebugPanel;

// ********************************************************************************************* //
}});
