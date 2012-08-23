/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

// List of firebug modules that must be loaded at startup and unloaded on shutdown.
// !important every new module loaded with Cu.import must be added here
var FIREBUG_MODULES = [
    "resource://firebug/debuggerHalter.js",
    "resource://firebug/fbtrace.js",
    "resource://firebug/firebug-http-observer.js",
    "resource://firebug/firebug-service.js",
    "resource://firebug/firebug-trace-service.js",
    "resource://firebug/gcli.js",
    "resource://firebug/loader.js",
    "resource://firebug/locale.js",
    "resource://firebug/mini-require.js",
    "resource://firebug/observer-service.js",
    "resource://firebug/prefLoader.js",
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

    Cu.import("resource://firebug/prefLoader.js");

    // Register default preferences
    PrefLoader.loadDefaultPrefs(params.installPath, "firebug.js");
    PrefLoader.loadDefaultPrefs(params.installPath, "cookies.js");
    PrefLoader.loadDefaultPrefs(params.installPath, "tracingConsole.js");

    // Load the overlay manager
    Cu.import("resource://firebug/loader.js");

    //register extensions
    FirebugLoader.startup();

    // Load server side in case we are in the server mode.
    if (loadServer())
        return;

    // Load Firebug into all existing browser windows.
    var enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements())
        FirebugLoader.loadIntoWindow(enumerator.getNext());

    // Listen for new windows, Firebug must be loaded into them too.
    Services.ww.registerNotification(windowWatcher);

    // GCLI commands
    Cu.import("resource://firebug/gcli.js");
    FirebugGCLICommands.startup();
}

function shutdown(params, reason)
{
    // Don't need to clean anything up if the application is shutting down
    if (reason == APP_SHUTDOWN)
        return;

    // Shutdown the server (in case we are in server mode).
    unloadServer();

    // Remove "new window" listener.
    Services.ww.unregisterNotification(windowWatcher);

    // remove from all windows
    try
    {
        FirebugLoader.shutdown();
    }
    catch(e)
    {
        Cu.reportError(e);
    }

    // Unregister all GCLI commands
    FirebugGCLICommands.shutdown();

    // xxxHonza: I think this shouldn't be here (perhaps in firebug-service.js)
    // Shutdown Firebug's JSD debugger service.
    var fbs = Cu.import("resource://firebug/firebug-service.js", {}).fbs;
    fbs.disableDebugger();
    fbs.shutdown();

    // remove default preferences
    PrefLoader.clearDefaultPrefs();

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

var windowWatcher = function windowWatcher(win, topic)
{
    if (topic != "domwindowopened")
        return;

    win.addEventListener("load", function onLoad()
    {
        win.removeEventListener("load", onLoad, false);
        if (win.document.documentElement.getAttribute("windowtype") == "navigator:browser")
            FirebugLoader.loadIntoWindow(win);
    }, false);
}

// ********************************************************************************************* //
// Server

var serverScope = {};

function loadServer()
{
    // If Firebug is running in server mode, load the server module
    // and skip the UI overlays.
    var prefDomain = "extensions.firebug";
    var serverMode = PrefLoader.getPref(prefDomain, "serverMode");

    try
    {
        if (serverMode)
        {
            Services.scriptloader.loadSubScript(
                "chrome://firebug/content/server/main.js",
                serverScope);
        }
    }
    catch (e)
    {
        Cu.reportError(e);
    }

    return serverMode;
}

function unloadServer()
{
    if (serverScope.FirebugServer)
        serverScope.FirebugServer.shutdown();
}

// ********************************************************************************************* //
