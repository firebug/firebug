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
require.onDebugDAG = function(fullName, deps)
{
    if (!require.depsNamesByName)
        require.depsNamesByName = {};

    var arr = [];
    for (var p in deps)
        arr.push(p);
    require.depsNamesByName[fullName] = arr;
}

require.analyzeDependencyTree = function()
{
    FBTrace.sysout("Firebug module list: ", require.depsNamesByName);

    // For each deps item create an object referencing dependencies
    function linkArrayItems(id, depNamesByName, path)
    {
        var deps = depNamesByName[id];
        var result = {};
        for (var i = 0; i < deps.length; i++)
        {
            var depID = deps[i];
            if (path.indexOf(":" + depID + ":") == -1) // Then depId is not already an dependent
                result[depID] = linkArrayItems(depID, depNamesByName, path + ":" + depID + ":");
            else
                FBTrace.sysout("Circular dependency: " + path + ":" + depID + ":");
        }
        return result;
    }


    var linkedDependencies = {};
    var dependents = {}; // reversed list, dependents by name
    var depNamesByName = require.depsNamesByName;
    for (var name in depNamesByName)
    {
        var depArray = depNamesByName[name];

        if (name === "undefined") {
            linkedDependencies["__main__"] = linkArrayItems(name, depNamesByName, "");
            name = "__main__";
        }
        for (var i = 0; i < depArray.length; i++)
        {
            var dependent = depArray[i];
            if (!dependents[dependent])
                dependents[dependent] = [];
            dependents[dependent].push(name);
        }
    }
    var minimal = [];
    var mainDeps = depNamesByName["undefined"];
    for (var i = 0; i < mainDeps.length; i++)
    {
        var dependencyOfMain = mainDeps[i];
        var dependentsOfDependencyOfMain = dependents[dependencyOfMain];
        if (dependentsOfDependencyOfMain.length === 1)
            minimal.push(dependencyOfMain);
    }

    FBTrace.sysout("Firebug module dependency tree: ", linkedDependencies);
    FBTrace.sysout("Firebug dependents: ", dependents);
    FBTrace.sysout("Firebug minimal modules list: ", minimal);
}

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
    "firebug/lib/lib",
    "firebug/firebug",
    "arch/tools",
    "arch/javascripttool",
    "firebug/js/debugger",
    "firebug/trace/traceModule",
    "firebug/js/scriptPanel",
    "firebug/console/memoryProfiler",
    "firebug/console/commandLine",
    "firebug/chrome/navigationHistory",
    "firebug/html/htmlPanel",
    "firebug/css/cssPanel",
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