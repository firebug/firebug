/* See license.txt for terms of usage */

(function() {

// ********************************************************************************************* //

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var prefDomain = "extensions.firebug";

// xxxHonza: I am getting the following exception sometimes:
// Console Firebug.getModuleLoaderConfig is not a function"
// This could be be the reason why users can't open Firebug even if clicking on the start button.
// Looks like 'moduleConfig.js' is not loaded yet? (reported as Issue 6731)
if (typeof(Firebug.getModuleLoaderConfig) != "function")
{
    FBTrace.sysout("main; ERROR Firebug.getModuleLoaderConfig is not a function!");
    Cu.reportError("main; ERROR Firebug.getModuleLoaderConfig is not a function!");
    return;
}

var config = Firebug.getModuleLoaderConfig();

if (FBTrace.DBG_INITIALIZE || FBTrace.DBG_MODULES)
{
    if (FBTrace.DBG_MODULES)
        config.debug = true;

    FBTrace.sysout("main.js; Loading Firebug modules...", config);
    var startLoading = new Date().getTime();
}

// ********************************************************************************************* //

try
{
    // xxxHonza: temporary hack for Crossfire to provide custom set of modules.
    var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
    var value = prefService.getCharPref("extensions.firebug.defaultModuleList");
    if (value)
    {
        var modules = value.split(",");
        if (modules.length)
            config.modules = modules;
    }
}
catch (err)
{
}

// ********************************************************************************************* //

// Backward compatibility (some modules changed location)
// https://getfirebug.com/wiki/index.php/Extension_Migration
// http://code.google.com/p/fbug/issues/detail?id=5199
var paths = {};
paths["firebug/css/cssComputedElementPanel"] = "firebug/css/computedPanel";
paths["firebug/css/cssElementPanel"] = "firebug/css/stylePanel";
paths["firebug/firefox/annotations"] = "firebug/chrome/annotations";
paths["firebug/firefox/privacy"] = "firebug/chrome/privacy";
paths["firebug/firefox/system"] = "firebug/lib/system";
paths["firebug/firefox/tabWatcher"] = "firebug/chrome/tabWatcher";
paths["firebug/firefox/xpcom"] = "firebug/lib/xpcom";
paths["firebug/firefox/window"] = "firebug/chrome/window";
paths["firebug/firefox/firefox"] = "firebug/chrome/firefox";
paths["firebug/net/httpLib"] = "firebug/lib/http";

var originalLoad = require.load;
require.load = function(context, fullName, url)
{
    if (paths[fullName])
    {
        var newUrl = paths[fullName].replace("firebug/", "firebug/content/");
        url = "chrome://" + newUrl + ".js";
    }

    return originalLoad.apply(require, [context, fullName, url]);
};

// ********************************************************************************************* //

// For now extensions should use 'Firebug.require' to load it's modules, so
// initialize the field. It should be done now since overlays can be applied
// before the core Firebug modules are (asynchronously) loaded.
Firebug.require = require;

// Load core Firebug modules.
var modules = [
    "firebug/chrome/chrome",
    "firebug/lib/lib",
    "firebug/firebug",
    "firebug/bti/inProcess/browser"
].concat(config.modules);

// ********************************************************************************************* //

require(config, modules, function(ChromeFactory, FBL, Firebug, Browser)
{
    try
    {
        // Wait till all modules (including those coming from Firebug extensions)
        // are loaded and thus all panels, firebug-modules, bundles, etc. are properly
        // registered and Firebug can start to send initialization events.
        if (typeof(requirejs) != "undefined")
        {
            var prevResourcesReady = requirejs.resourcesReady;
            requirejs.resourcesReady = function(isReady)
            {
                if (isReady && requirejs.resourcesDone)
                    onModulesLoaded(ChromeFactory, FBL, Firebug, Browser);

                if (prevResourcesReady)
                    prevResourcesReady(isReady);
            };
        }
        else
        {
            onModulesLoaded(ChromeFactory, FBL, Firebug, Browser);
        }
    }
    catch(exc)
    {
        if (FBTrace)
            FBTrace.sysout("Firebug main initialization ERROR " + exc, exc);

        window.dump("Firebug main initialization ERROR " + exc);

        if (Components)
            Components.utils.reportError(exc);
    }
});

// ********************************************************************************************* //

function onModulesLoaded(ChromeFactory, FBL, Firebug, Browser)
{
    // Extensions are using the same loader, so make sure to not
    // initialize Firebug twice.
    if (Firebug.isInitialized)
        return;

    if (FBTrace.DBG_INITIALIZE || FBTrace.DBG_MODULES)
    {
        var delta = (new Date().getTime()) - startLoading;
        FBTrace.sysout("main.js; Firebug modules loaded using RequireJS in " + delta + " ms");
    }

    // Extensions also shouldn't use the global require since it should be removed
    // in the future (if possible). Global 'require' could collide with other
    // extensions.
    Firebug.connection = new Browser();  // prepare for addListener calls

    // xxxHonza: BTI refactoring suggestions:
    // 1) The connection is an object that ensures sending and receiving packets
    // 2) The current Firebug.connection should be renamed to Firebug.proxy
    // 3) The BTI Browser should be renamed to BrowserProxy
    // 4) The connection should be within the proxy: Firebug.proxy.connection
    Firebug.proxy = Firebug.connection;

    Browser.onDebug = function()
    {
        FBTrace.sysout.apply(FBTrace, arguments);
    };

    Firebug.Options.initialize(prefDomain);

    function connect()
    {
        Firebug.connection.connect();  // start firing events
    }

    if (FBTrace.DBG_INITIALIZE || FBTrace.DBG_MODULES)
        FBTrace.sysout("main.js; All RequireJS modules loaded");

    if (window.FBL.legacyPatch)
    {
        if (FBTrace.DBG_MODULES)
            FBTrace.sysout("firebug main.js; legacyPatch");

        window.FBL.legacyPatch(FBL, Firebug);
    }

    if (!window.panelBarWaiter && FBTrace.DBG_ERRORS)
        FBTrace.sysout("main; ERROR window.panelBarWaiter is not available " +
            ", Firebug already initialized: " + Firebug.isInitialized);

    if (window.panelBarWaiter)
        window.panelBarWaiter.waitForPanelBar(ChromeFactory, null, connect);
}

// ********************************************************************************************* //
})();

// ********************************************************************************************* //
