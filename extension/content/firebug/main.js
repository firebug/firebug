/* See license.txt for terms of usage */

(function() {
// ********************************************************************************************* //

// Inside scripts/main.js
function getModuleLoaderConfig(baseConfig)
{
    baseConfig = baseConfig || {};

    // Set configuration defaults.
    baseConfig.baseLoaderUrl = baseConfig.baseLoaderUrl || "resource://moduleLoader/";
    baseConfig.prefDomain = baseConfig.prefDomain || "extensions.firebug";
    baseConfig.arch = baseConfig.arch ||  "firebug_rjs/inProcess";
    baseConfig.baseUrl = baseConfig.baseUrl || "resource://";
    baseConfig.paths = baseConfig.paths || {"arch": baseConfig.arch, "firebug": "firebug_rjs"};

    // to give each XUL window its own loader (for now)
    var uid = Math.random();

    var config =
    {
        context: "Firebug " + uid, // TODO XUL window id on FF4.0+
        baseUrl: baseConfig.baseUrl,
        paths: baseConfig.paths,
        onDebug: function()
        {
            try
            {
                if (!this.FBTrace)
                {
                    // traceConsoleService is a global of |window| frome trace.js.
                    // on the first call we use it to get a ref to the Cu.import module object
                    this.FBTrace = traceConsoleService.getTracer(baseConfig.prefDomain);
                }

                if (this.FBTrace.DBG_MODULES)
                    this.FBTrace.sysout.apply(this.FBTrace,arguments);
            }
            catch(exc)
            {
                var msg = "";
                for (var i = 0; i < arguments.length; i++)
                    msg += arguments[i]+", ";

                Components.utils.reportError("Loader; onDebug:"+msg);  // put something out for sure
                window.dump("Loader; onDebug:"+msg+"\n");
            }
        },
        onError: function(exc)
        {
            var msg = exc.toString() +" "+(exc.fileName || exc.sourceName) + "@" + exc.lineNumber;

            Components.utils.reportError("Loader; Error: "+msg);  // put something out for sure
            window.dump("Loader; onError:"+msg+"\n");
            if (!this.FBTrace)
            {
                // traceConsoleService is a global of |window| frome trace.js.
                // on the first call we use it to get a ref to the Cu.import module object
                this.FBTrace = traceConsoleService.getTracer(baseConfig.prefDomain);
            }

            if (this.FBTrace.DBG_ERRORS || this.FBTrace.DBG_MODULES)
                this.FBTrace.sysout("Loader; Error: "+msg, exc);

            if (exc instanceof Error)
                throw arguments[0];
            else
                throw new Error(msg);
        },
        onCollectDeps: function(fullName, deps)
        {
            var arr = [];
            for (var p in deps)
                arr.push(p);
            depTree[fullName] = arr;
        }
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

require.analyzeFailure = function(context, managers, specified, loaded)
{
    for (var i = 0; i < managers.length; i++)
    {
        var manager = managers[i];
        context.config.onDebug("require.js ERROR failed to complete "+manager.fullName+
            " isDone:"+manager.isDone+" #defined: "+manager.depCount+" #required: "+
            manager.depMax);

        var theNulls = [];
        var theUndefineds = [];
        var theUnstrucks = manager.strikeList;
        var depsTotal = 0;

        for (var depName in manager.deps)
        {
            if (typeof (manager.deps[depName]) === "undefined")
                theUndefineds.push(depName);
            if (manager.deps[depName] === null)
                theNulls.push(depName);

            var strikeIndex = manager.strikeList.indexOf(depName);
            manager.strikeList.splice(strikeIndex, 1);
        }

        context.config.onDebug("require.js: "+theNulls.length+" null dependencies "+
            theNulls.join(',')+" << check module ids.", theNulls);
        context.config.onDebug("require.js: "+theUndefineds.length+" undefined dependencies: "+
            theUndefineds.join(',')+" << check module return values.", theUndefineds);
        context.config.onDebug("require.js: "+theUnstrucks.length+" unstruck dependencies "+
            theUnstrucks.join(',')+" << check duplicate requires", theUnstrucks);

        for (var j = 0; j < manager.depArray.length; j++)
        {
            var id = manager.depArray[j];
            var module = manager.deps[id];
            context.config.onDebug("require.js: "+j+" specified: "+specified[id]+" loaded: "+
                loaded[id]+" "+id+" "+module);
        }
    }
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
require.onError = config.onError;

if (FBTrace.DBG_INITIALIZE || FBTrace.DBG_MODULES)
{
    if (FBTrace.DBG_MODULES)
        config.debug = true;

    FBTrace.sysout("main.js; Loading Firebug modules...", config);
    var startLoading = new Date().getTime();
}

require(config,
[
    "firebug/chrome",
    "firebug/lib",
    "firebug/firebug",
    "arch/tools",
    "arch/javascripttool",
    "firebug/debugger",
    "firebug/traceModule",
    "firebug/scriptPanel",
    "firebug/memoryProfiler",
    "firebug/commandLine",
    "firebug/navigationHistory",
    "firebug/htmlPanel",
    "firebug/cssPanel",
    "firebug/consoleInjector",
    "firebug/inspector",
    "firebug/layout",
    "firebug/net/netPanel",
    "firebug/knownIssues",
    "firebug/tabCache",
    "firebug/activation",
    "firebug/panelActivation",
    "firebug/sourceFile",
    "firebug/navigationHistory",
    "firebug/a11y",
    "firebug/shortcuts",
    "firebug/start-button/startButtonOverlay",
    "firebug/external/externalEditors",
    "firebug/callstack",
    "firebug/net/spy",
    "firebug/tableRep",
    "firebug/commandLinePopup",
    "firebug/commandLineExposed",
    "firebug/consoleExposed",
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
