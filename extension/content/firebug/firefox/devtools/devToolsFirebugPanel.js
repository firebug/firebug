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

Cu["import"]("resource:///modules/devtools/EventEmitter.jsm");

// ********************************************************************************************* //
// DevToolsOverlay Implementation

function DevToolsFirebugPanel(frame, toolbox)
{
    if (FBTrace.DBG_DEVTOOLS)
        FBTrace.sysout("devToolsFirebugPanel.constructor;", arguments);

    EventEmitter.decorate(this);

    this.frame = frame;
    this.toolbox = toolbox;
    this.target = toolbox.target;

    this.navigate = this.navigate.bind(this);
    this.willNavigate = this.willNavigate.bind(this);
    this.hidden = this.hidden.bind(this);
    this.visible = this.visible.bind(this);

    this.target.on("navigate", this.navigate);
    this.target.on("will-navigate", this.willNavigate);
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
            self.Firebug = Firebug;

            // Embed entire Firebug UI (firebugFrame.xul) into Devtools Toolbox UI.
            self.importFirebug();

            // Make sure context is created.
            Firebug.toggleBar();

            // Also solve the case when Firebug is detached.
            Firebug.showBar(true);

            // Loading done, notify the toolbox.
            deferred.resolve(self);
        });

        return deferred.promise;
    },

    destroy: function()
    {
        if (FBTrace.DBG_DEVTOOLS)
            FBTrace.sysout("DevToolsFirebugPanel.destroy");

        this.target.on("navigate", this.navigate);
        this.target.on("will-navigate", this.willNavigate);
        this.target.on("hidden", this.hidden);
        this.target.on("visible",  this.visible);

        // Undetach Firebug from DevTools toolbox so, it isn't destroyed with it.
        this.exportFirebug();
    },

    willNavigate: function()
    {
        if (FBTrace.DBG_DEVTOOLS)
            FBTrace.sysout("DevToolsFirebugPanel.beforeNavigate");
    },

    navigate: function()
    {
       if (FBTrace.DBG_DEVTOOLS)
            FBTrace.sysout("DevToolsFirebugPanel.navigate");
    },

    hidden: function(type, event)
    {
        if (FBTrace.DBG_DEVTOOLS)
            FBTrace.sysout("DevToolsFirebugPanel.hidden; " + this.target._tab.label, event);

        this.exportFirebug();
    },

    visible: function(type, event)
    {
        var tab = event.target;

        if (FBTrace.DBG_DEVTOOLS)
            FBTrace.sysout("DevToolsFirebugPanel.visible; " + this.target._tab.label, event);

        // xxxHonza: the order of hidden and visible events is wrong. The visible event
        // should be fired after hidden, but it isn't. So, use timeout to make sure
        // Firebug is imported after being exported in hidden handler.
        var self = this;
        this.win.setTimeout(function()
        {
            self.importFirebug();
            self.Firebug.toggleBar(true);
        });
    },

    // xxxHonza: import/exportFirebug is also in firebug.xul, could we reuse?
    importFirebug: function()
    {
        var Firebug = this.win.Firebug;
        var chrome = Firebug.chrome;

        Firebug.minimizeBar();

        var originalBrowser = this.win.top.document.getElementById("fbMainContainer");
        var newBrowser = this.frame.document.getElementById("fbMainContainer");

        chrome.originalBrowser = originalBrowser;
        chrome.inDetachedScope = true;

        chrome.swapBrowsers(
            originalBrowser,
            newBrowser
        );
    },

    exportFirebug: function()
    {
        var Firebug = this.win.Firebug;
        var chrome = Firebug.chrome;

        chrome.inDetachedScope = false;

        var originalBrowser = this.win.top.document.getElementById("fbMainContainer");
        var currentBrowser = this.frame.document.getElementById("fbMainContainer");

        chrome.swapBrowsers(
            currentBrowser,
            originalBrowser
        );

        Firebug.setPlacement("minimized");
    }
};

// ********************************************************************************************* //
// Registration

return DevToolsFirebugPanel;

// ********************************************************************************************* //
}});
