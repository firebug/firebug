/* See license.txt for terms of usage */
try {


(function() {
// ********************************************************************************************* //

// Inside scripts/main.js
function getModuleLoaderConfig(baseConfig)
{
    baseConfig = baseConfig || {};

    // Set configuration defaults.
    baseConfig.baseLoaderUrl = baseConfig.baseLoaderUrl || "resource://moduleLoader/";
    baseConfig.prefDomain = baseConfig.prefDomain || "extensions.firebug";
    baseConfig.arch = baseConfig.arch ||  "firebug_rjs/bti/inProcess";
    baseConfig.baseUrl = baseConfig.baseUrl || "resource://";
    baseConfig.paths = baseConfig.paths || {"arch": baseConfig.arch, "firebug": "firebug_rjs"};

    // to give each XUL window its own loader (for now)
    var uid = Math.random();

    var config =
    {
        context: "Firebug " + uid, // TODO XUL window id on FF4.0+
        baseUrl: baseConfig.baseUrl,
        paths: baseConfig.paths,
    };

    return config;
}

// ********************************************************************************************* //




// ********************************************************************************************* //
// Modules

var config = getModuleLoaderConfig();

if (FBTrace.DBG_INITIALIZE || FBTrace.DBG_MODULES)
{
    if (FBTrace.DBG_MODULES)
        config.debug = true;

    FBTrace.sysout("main.js; Loading Firebug modules...", config);
    var startLoading = new Date().getTime();
}

require(config,
[
    "firebug/chrome/chrome",
    "firebug/lib/lib",
    "firebug/firebug",
    "firebug/trace/traceModule",
    "firebug/chrome/navigationHistory",
    "firebug/chrome/knownIssues",
    "firebug/js/sourceFile",
    "firebug/chrome/shortcuts",
    "firebug/firefox/start-button/startButtonOverlay",
    "firebug/editor/external/externalEditors",
    "firebug/firefox/firebugMenu",
    "firebug/chrome/panelActivation",
    "firebug/console/memoryProfiler",
    "firebug/chrome/tableRep",
    "firebug/html/htmlPanel",
    "firebug/console/commandLinePopup",
    "firebug/accessible/a11y",
    "firebug/js/scriptPanel",
    "firebug/js/callstack",
    "firebug/console/consoleInjector",
    "firebug/net/spy",
    "firebug/js/tabCache",
    "firebug/chrome/activation",
    "arch/tools",
    ],
function(ChromeFactory, FBL, Firebug)
{
    try
    {
        if (FBTrace.DBG_INITIALIZE || FBTrace.DBG_MODULES)
        {
            var delta = (new Date().getTime()) - startLoading;
            FBTrace.sysout("main.js; Firebug modules loaded using RequireJS in "+delta+" ms");
        }

        // Expose the default module loader config to extensions. Firebug extension
        // should load the files also using a loader and so, they also need a config.
        Firebug.getModuleLoaderConfig = getModuleLoaderConfig;

        // Extensions also shouldn't use the global require sinc it should be removed
        // in the future (if possible). Global 'require' could collied with oteher
        // extensions.
        Firebug.require = require;

        Firebug.Options.initialize("extensions.firebug");
        window.panelBarWaiter.waitForPanelBar(ChromeFactory);

        if (window.legacyPatch)
        {
            FBTrace.sysout("firebug main.js; legacyPatch");
            window.legacyPatch(FBL, Firebug);
        }

        if (FBTrace.DBG_MODULES)
            require.analyzeDependencyTree();
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