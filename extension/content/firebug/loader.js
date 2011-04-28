/* See license.txt for terms of usage */

(function() {
    const Cc = Components.classes;
    const Ci = Components.interfaces;
// ********************************************************************************************* //
// Firebug Load Manager

/**
 * Firebug Load Manager is based on RequireJS and responsible for loading all Firebug
 * modules. Firebug modules use Asynchronous Module Definition (AMD)
 */
top.FirebugLoadManager =
/** @lends FirebugLoadManager */
{
    loadCore: function(config, callback)
    {
        // Set configuration defaults.
        config.prefDomain = config.prefDomain || "extensions.firebug";
        config.arch = config.arch || getArchitectureType(config.prefDomain) || "firebug_rjs/inProcess";
        config.baseUrl = config.baseUrl || "resource://";
        config.paths = {"arch": config.arch, "common": "firebug_rjs"};

        // Prepare scope objects to pupm them down into module loader and create
        // config for RequireJS.
        var firebugScope = getModuleLoaderScope(config);
        var requireJSConfig = getModuleLoaderConfig(config);

        // Get list of default modules to load
        var modules = this.getModules(config);

        // Finally, load all Firebug modules with all dependencies and call execute
        // the callback as soon as it's done.
        var loader = new ModuleLoader(firebugScope, requireJSConfig);
        loader.define(modules, callback);
    },

    getModules: function(config)
    {
        var modules = [
            "common/traceModule",
            "common/lib/options",
            "common/lib/xpcom",
            "common/dragdrop",
            "common/tabContext",  // should be loaded by being a dep of tabWatcher
            "common/sourceBox",
            "common/script",
            "common/memoryProfiler",
        ];

        // Compute list of further modules that depend on the current architecture type.
        // xxxHonza: this should be somehow configurable from outside
        // XXXjjb: yes this is just wrong
        if (config.modules)
        {
            modules = config.coreModules;
        }
        else if (config.arch === "firebug_rjs/inProcess")
        {
            modules.push("arch/tools");  // must be first
            modules.push("arch/firebugadapter");
            modules.push("common/debugger");
            modules.push("arch/javascripttool");
        }
        else if (config.arch == "remoteClient")
        {
            modules.push("crossfireModules/tools.js");
            modules.push("debugger.js");
        }
        else if (config.arch == "remoteServer")
        {
            modules.push("inProcess/tools.js");  // must be first
            modules.push("debugger.js");
            modules.push("crossfireModules/crossfire-server.js");
        }
        else
        {
            throw new Error("ERROR Firebug.LoadManager.loadCore unknown " +
                "architechture requested: " + config.arch);
        }

        if (!config.coreModules)
            modules = modules.concat(config.coreModules);

        return modules;
    }
}

// ********************************************************************************************* //
// Private Helpers

function getArchitectureType(prefDomain)
{
    try
    {
        // The architecture pref can't be loaded using Optiosn module since this pref
        // is essention for the loader and since yet before we can even load
        // the options module.
        var prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch2);
        return prefs.getCharPref(prefDomain + "." + "arch");
    }
    catch (err)
    {
    }
}

function getModuleLoaderScope(config)
{
    // we need to get the values to options.js somehow.
    Firebug.loadConfiguration = config;

    // Pump the objects from this scope down into module loader. Note that the window
    // object used within timetou and interval methods is bind via closure.
    var firebugScope =
    {
        window : window,
        Firebug: Firebug,
        FBL: FBL,
        FirebugReps: FirebugReps,
        FBTrace: FBTrace,
        Domplate: Domplate,
        setTimeout: function(fn, delay) { return window.setTimeout(fn, delay); },
        clearTimeout: function(timeout) { return window.clearTimeout(timeout); },
        setInterval: function(fn, delay) { return window.setInterval(fn, delay); },
        clearInterval: function(timeout) { return window.clearInterval(timeout); },
    };

    return firebugScope;
}

function getModuleLoaderConfig(baseConfig)
{
    // to give each XUL window its own loader (for now)
    var uid = Math.random();

    var config =
    {
        context: "Firebug " + uid, // TODO XUL window id on FF4.0+
        baseUrl: baseConfig.baseUrl,
        paths: baseConfig.paths,
        onDebug: function()
        {
            if (!this.FBTrace)
            {
                // traceConsoleService is a global of |window| frome trace.js.
                // on the first call we use it to get a ref to the Cu.import module object
                this.FBTrace = traceConsoleService.getTracer(baseConfig.prefDomain);
            }

            if (this.FBTrace.DBG_MODULES)
                this.FBTrace.sysout.apply(this.FBTrace,arguments);
        },
        onError: function()
        {
            Components.utils.reportError(arguments[0]);  // put something out for sure

            if (!this.FBTrace)
            {
                // traceConsoleService is a global of |window| frome trace.js.
                // on the first call we use it to get a ref to the Cu.import module object
                this.FBTrace = traceConsoleService.getTracer(baseConfig.prefDomain);
            }

            if (this.FBTrace.DBG_ERRORS || this.FBTrace.DBG_MODULES)
                this.FBTrace.sysout.apply(this.FBTrace, arguments);

            throw arguments[0];
        },
        waitSeconds: 0,
        debug: true,
        /* edit: function(errorMsg, errorURL, errorLineNumber)
        {
            window.alert(errorMsg+" "+errorURL+"@"+errorLineNumber);
        },
        edit: function(context, url, module)
        {
            FBTrace.sysout("opening window modal on "+url);
            var a = {url: url};
            return window.showModalDialog("chrome://firebug/content/external/editors.xul",{},
                "resizable:yes;scroll:yes;dialogheight:480;dialogwidth:600;center:yes");
        }
        */
    };

    return config;
}

// ********************************************************************************************* //
// Module Loader Initialization

/**
 * Default config file can be specified before this file is loaded into XUL (chrome) scope.
 * You can see an example of custom config here: chrome//fbtrace/content/traceConsole.xul
 *
 * config.arch:         architecture to load, 'inProcess', 'remoteClient', 'remoteServer'
 * config.prefDomain:   base for preferences systems, eg 'extension.firebug'
 * config.baseUrl:      base for load path
 */
try
{
    // Get ModuleLoader implementation. This should be the only on 'Mozilla JS code module'
    // used within Firebug soure base. All the other modules should use
    // Asynchronoud Module Definition (AMD).
    var moduleLoader = "resource://moduleLoader/moduleLoader.js";
    Components.utils["import"](moduleLoader);

    if (FBTrace.DBG_MODULES)
        FBTrace.sysout("loader; Firebug Module Loader initialized.");
}
catch (exc)
{
    var msg = exc.toString() +" "+(exc.fileName || exc.sourceName) + "@" + exc.lineNumber;
    if (FBTrace.DBG_MODULES)
    {
        dump("Import moduleLoader.js FAILS: "+msg+"\n");
        FBTrace.sysout("Import moduleLoader.js ERROR "+msg, exc);
    }
    Components.utils.reportError(msg);
    throw exc;
}

// ********************************************************************************************* //
})();
