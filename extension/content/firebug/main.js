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

var depTree = {};
function dumpDependencyTree(tree)
{
    function resolveDeps(id, deps, path)
    {
        var result = {};
        for (var p in deps)
        {
            var depID = deps[p];
            if (path.indexOf(":" + depID + ":") == -1)
                result[depID] = resolveDeps(depID, tree[depID], path + ":" + depID + ":");
            else
                FBTrace.sysout("Circular dependency: " + path + ":" + depID + ":");
        }
        return result;
    }

    var result = {};
    for (var p in tree)
    {
        if (p == "undefined")
            result["main"] = resolveDeps(p, tree[p], "");
    }

    FBTrace.sysout("Firebug module dependency tree: ", result);
    FBTrace.sysout("Firebug module list: ", depTree);
}

// ********************************************************************************************* //

require.onDebug = function()
{
    try
    {
        FBTrace.sysout.apply(FBTrace,arguments);
    }
    catch(exc)
    {
        var msg = "";
        for (var i = 0; i < arguments.length; i++)
            msg += arguments[i]+", ";

        Components.utils.reportError("Loader; onDebug:"+msg);  // put something out for sure
        window.dump("Loader; onDebug:"+msg+"\n");
    }
}

require.onError = function(exc)
{
    require.onDebug.apply(require, arguments);
    throw exc;
}

require.onCollectDeps = function(fullName, deps)
{
    var arr = [];
    for (var p in deps)
        arr.push(p);
    depTree[fullName] = arr;
}

function loadXULCSS(cssURL)
{
    var sss = Components.classes["@mozilla.org/content/style-sheet-service;1"]
    .getService(Components.interfaces.nsIStyleSheetService);
    var ios = Components.classes["@mozilla.org/network/io-service;1"]
    .getService(Components.interfaces.nsIIOService);
    var uri = ios.newURI(cssURL, null, null);
    sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
}
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
    "firebug/lib",
    "firebug/firebug",
    "arch/tools",
    "arch/javascripttool",
    "firebug/js/debugger",
    "firebug/traceModule",
    "firebug/js/scriptPanel",
    "firebug/console/memoryProfiler",
    "firebug/console/commandLine",
    "firebug/chrome/navigationHistory",
    "firebug/html/htmlPanel",
    "firebug/cssPanel",
    "firebug/console/consoleInjector",
    "firebug/net/netPanel",
    "firebug/chrome/knownIssues",
    "firebug/js/tabCache",
    "firebug/chrome/activation",
    "firebug/chrome/panelActivation",
    "firebug/js/sourceFile",
    "firebug/chrome/navigationHistory",
    "firebug/a11y",
    "firebug/chrome/shortcuts",
    "firebug/firefox/start-button/startButtonOverlay",
    "firebug/external/externalEditors",
    "firebug/js/callstack",
    "firebug/net/spy",
    "firebug/chrome/tableRep",
    "firebug/console/commandLinePopup",
    "firebug/console/commandLineExposed",
    "firebug/console/consoleExposed",
    "firebug/firefox/firebugMenu",
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
            dumpDependencyTree(depTree);
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