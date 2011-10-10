/* See license.txt for terms of usage */

try {
(function() {
// ********************************************************************************************* //

var prefDomain = "extensions.firebug";
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
    var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch2);
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

var modules = [
    "firebug/chrome/chrome",
    "firebug/lib/lib",
    "firebug/firebug",
    "arch/browser"
].concat(config.modules);

// ********************************************************************************************* //

require(config, modules, function(ChromeFactory, FBL, Firebug, Browser)
{
    try
    {
        if (FBTrace.DBG_INITIALIZE || FBTrace.DBG_MODULES)
        {
            var delta = (new Date().getTime()) - startLoading;
            FBTrace.sysout("main.js; Firebug modules loaded using RequireJS in "+delta+" ms");
        }

        // Extensions also shouldn't use the global require since it should be removed
        // in the future (if possible). Global 'require' could collide with other
        // extensions.
        Firebug.require = require;
        Firebug.connection = new Browser();  // prepare for addListener calls

        Browser.onDebug = function()
        {
            FBTrace.sysout.apply(FBTrace, arguments);
        }

        Firebug.Options.initialize(prefDomain);

        function connect()
        {
            Firebug.connection.connect();  // start firing events
        }

        // Wait till all modules (including those coming from Firebug extensions)
        // are loaded and thus all panels, firebug-modules, bundles, etc. are properly
        // registered and Firebug can start to send initialization events.
        var prevResourcesReady = requirejs.resourcesReady;
        requirejs.resourcesReady = function(isReady)
        {
            if (isReady && requirejs.resourcesDone)
            {
                if (FBTrace.DBG_INITIALIZE || FBTrace.DBG_MODULES)
                    FBTrace.sysout("main.js; All RequireJS modules loaded");

                if (window.legacyPatch)
                {
                    if (FBTrace.DBG_MODULES)
                        FBTrace.sysout("firebug main.js; legacyPatch");
                    window.legacyPatch(FBL, Firebug);
                }

                if (FBTrace.DBG_MODULES)
                    require.analyzeDependencyTree();

                window.panelBarWaiter.waitForPanelBar(ChromeFactory, null, connect);
            }

            if (prevResourcesReady)
                prevResourcesReady(isReady);
        }
    }
    catch(exc)
    {
        if (FBTrace)
            FBTrace.sysout("Firebug main initialization ERROR "+exc, exc);

        window.dump("Firebug main initialization ERROR "+exc+"\n");

        if (Components)
            Components.utils.reportError(exc);
    }
});

// ********************************************************************************************* //
})();

} catch (exc) {

    window.dump("Firebug main  ERROR "+exc+"\n");

    if (Components)
        Components.utils.reportError(exc);
}

// ********************************************************************************************* //

