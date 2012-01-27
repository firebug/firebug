/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

// List of firebug modules that must be loaded at startup and unloaded on shutdown.
// !important every new module loaded with Cu.import must be added here
var FIREBUG_MODULES = [
    "resource://firebug/debuggerHalter.js",
    "resource://firebug/fbtrace.js",
    "resource://firebug/firebug-http-observer.js",
    "resource://firebug/firebug-service.js",
    "resource://firebug/firebug-trace-service.js",
    "resource://firebug/loader.js",
    "resource://firebug/locale.js",
    "resource://firebug/moduleLoader.js",
    "resource://firebug/observer-service.js",
    "resource://firebug/require-debug.js",
    "resource://firebug/require.js",
    "resource://firebug/storageService.js"
];

Cu.import("resource://gre/modules/Services.jsm");

// ********************************************************************************************* //
// Bootstrap API

function install(params, reason)
{
}

function uninstall(params, reason)
{
}

function startup(params, reason)
{
    // Register the resource:// mappings
    var res = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    var resourceURI = Services.io.newURI(__SCRIPT_URI_SPEC__ + "/../modules/", null, null);
    res.setSubstitution("firebug", resourceURI);
    res.setSubstitution("moduleloader", resourceURI);

    // Add our chrome registration. not needed for 10+
    Components.manager.addBootstrappedManifestLocation(params.installPath);

    // Load the overlay manager
    Cu.import("resource://firebug/loader.js");

    // register default values
    FirebugLoader.registerDefaultPrefs();

    //register extensions
    FirebugLoader.startup();

    // Load Firebug into all existing browser windows.
    var enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements())
        FirebugLoader.loadIntoWindow(enumerator.getNext());

    // Listen for new windows, Firebug must be loaded into them too.
    Services.wm.addListener(WindowListener);
}

function shutdown(params, reason)
{
    // Don't need to clean anything up if the application is shutting down
    if (reason == APP_SHUTDOWN)
        return;

    // Remove "new window" listener.
    Services.wm.removeListener(WindowListener);

    // remove from all windows
    try
    {
        FirebugLoader.shutdown()
    }
    catch(e)
    {
        Cu.reportError(e)
    }

    // Shutdown Firebug's JSD debugger service.
    var fbs = Cu.import("resource://firebug/firebug-service.js", {}).fbs
    fbs.disableDebugger();
    fbs.shutdown();

    // remove default preferences
    FirebugLoader.clearDefaultPrefs();

    // Unload all Firebug modules added with Cu.import
    FIREBUG_MODULES.forEach(Cu.unload, Cu);

    // Remove our chrome registration. not needed for 10+
    Components.manager.removeBootstrappedManifestLocation(params.installPath);

    // Clear our resource registration
    var res = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    res.setSubstitution("firebug", null);
    res.setSubstitution("moduleloader", null);
}

// ********************************************************************************************* //
// Window Listener

var WindowListener =
{
    onOpenWindow: function(win)
    {
        win = win.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindow).window;

        // Wait for the window to finish loading
        win.addEventListener("load", function onLoad()
        {
            win.removeEventListener("load", onLoad, false);
            var href = win.location.href;
            if (href == "chrome://browser/content/browser.xul"
                || href == "chrome://navigator/content/navigator.xul")
            {
                FirebugLoader.loadIntoWindow(win)
            }
        }, false);
    },

    onCloseWindow: function(win) {},
    onWindowTitleChange: function(win, aTitle) {}
}

// ********************************************************************************************* //
