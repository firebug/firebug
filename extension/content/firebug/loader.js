/* See license.txt for terms of usage */

(function() {

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
        config.arch = config.arch || "inProcess";
        config.prefDomain = config.prefDomain || "extensions.firebug";
        config.baseUrl = config.baseUrl || "resource://firebug_rjs/";
        config.paths = {"arch": config.arch};

        // xxxHonza: is this necessary? It's already in the config, no?
        // this.arch = config.arch;
        // FIXME, create options.js as dependent of loader.
        // Firebug.architecture = this.getPref(this.prefDomain, "architecture");

        // pump the objects from this scope down into module loader
        var firebugScope = getModuleLoaderScope(config);
        var requireJSConfig = getModuleLoaderConfig(config);

        // Create loader used to load all Firebug modules.
        var loader = new ModuleLoader(firebugScope, requireJSConfig);

        // Synchronously load Firebug.TraceModule first. This module is responsible
        // for dispathing event to all registered listeners for FBTrace customization.
        loader.define(["traceModule.js"], function(traceModule)
        {
            FBTrace.sysout("loader; Firebug.TraceModule loaded");
        });

        // Specify list of core modules that should be loaded.
        var coreModules = [];

        if (config.coreModules)
        {
            coreModules = config.coreModules;
        }
        else if (config.arch === "inProcess")
        {
            coreModules.push("arch/tools");  // must be first
            coreModules.push("arch/options");  // debugger needs Firebug.Options because of FBL.$STR() in property initializes, TODO
            coreModules.push("arch/firebugadapter");
            coreModules.push("debugger");
            coreModules.push("arch/javascripttool");
        }
        else if (config.arch == "remoteClient")
        {
            coreModules.push("crossfireModules/tools.js");
            coreModules.push("inProcess/options.js");  // debugger needs Firebug.Options because of FBL.$STR() in property initializes, TODO
            coreModules.push("debugger.js");

        }
        else if (config.arch == "remoteServer")
        {
            coreModules.push("inProcess/tools.js");  // must be first
            coreModules.push("inProcess/options.js");  // debugger needs Firebug.Options because of FBL.$STR() in property initializes, TODO
            coreModules.push("debugger.js");

            coreModules.push("crossfireModules/crossfire-server.js");
        }
        else
        {
            throw new Error("ERROR Firebug.LoadManager.loadCore unknown architechture requested: "+Firebug.arch);
        }

        if (!config.coreModules)
        {
            var defaultModules = [
                "tabContext.js",  // should be loaded by being a dep of tabWatcher
                "sourceBox.js",
                "script.js",
                "traceModule.js",
                "dragdrop.js",
                "memoryProfiler.js",
                "lib/xpcom.js"
            ];

            coreModules = coreModules.concat(defaultModules);
        }

        // Finally, load all Firebug modules with all dependencies. As soon as the load
        // is done passed callback is executed.
        loader.define(coreModules, callback);
    }
}

// ********************************************************************************************* //
// Private Helpers

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
    var config = window.FirebugConfig || {};
    var baseLoaderUrl = config.baseLoaderUrl ? config.baseLoaderUrl : "resource://firebug/";
    var moduleLoader = baseLoaderUrl + "moduleLoader.js";

    // Get ModuleLoader implementation. This should be the only on 'Mozilla JS code module'
    // used within Firebug soure base. All the other modules should use
    // Asynchronoud Module Definition (AMD).
    Components.utils["import"](moduleLoader);
    ModuleLoader.init(config);

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
