/* See license.txt for terms of usage */

var FirebugLoadManager = function(config) {

// ********************************************************************************************* //
// Firebug Load Manager

try
{
    var baseLoaderUrl = config.baseLoaderUrl ? config.baseLoaderUrl : "resource://firebug/";
    var moduleLoader = baseLoaderUrl + "moduleLoader.js";

    // Get ModuleLoader implementation (it's Mozilla JS code module)
    Components.utils["import"](moduleLoader);
    ModuleLoader.init(config);

    if (FBTrace.DBG_MODULES)
        FBTrace.sysout("Loaded ModuleLoader");
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

function preLoadInitialization()
{
    // FIXME, create options.js as dependent of loader.
    // Firebug.architecture = this.getPref(this.prefDomain, "architecture");
}

function getModuleLoaderScope(config)
{
    Firebug.loadConfiguration = config;  // we need to get the values to options.js somehow.

    var firebugScope = // pump the objects from this scope down into module loader
    {
        window : window,
        Firebug: Firebug,
        FBL: FBL,
        FirebugReps: FirebugReps,
        FBTrace: FBTrace,
        domplate: domplate,
        Domplate: Domplate, // xxxHonza: Domplate should be the only global namespace for entire domplate engine.
        setTimeout: function(fn, delay) { return window.setTimeout(fn, delay); }, // bind window via closure
        clearTimeout: function(timeout) { return window.clearTimeout(timeout); }, // bind window via closure
        setInterval: function(fn, delay) { return window.setInterval(fn, delay); }, // bind window via closure
        clearInterval: function(timeout) { return window.clearInterval(timeout); }, // bind window via closure
    };
    return firebugScope;
}

function getModuleLoaderConfig(baseConfig)
{
    var uid = Math.random();  // to give each XUL window its own loader (for now)
    var config = {
        context:"Firebug "+uid, // TODO XUL window id on FF4.0+
        baseUrl: baseConfig.baseUrl,
        paths: baseConfig.paths,
        onDebug: function() {
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

function createLoader(config)
{
    preLoadInitialization();
    var firebugScope = getModuleLoaderScope(config);// pump the objects from this scope down into module loader
    var require_js_config = getModuleLoaderConfig(config);
    var loader = new ModuleLoader(firebugScope, require_js_config);
    return loader;
}

/**
 * config.arch: architecture to load, 'inProcess', 'remoteClient', 'remoteServer'
 * config.prefDomain: base for preferences systems, eg 'extension.firebug'
 * config.baseUrl: base for load path
 */
function loadCore(config, coreInitialize)
{
    setConfigurationDefaults(config);

    var loader = createLoader(config);

    if (Firebug.alwaysOpenTraceConsole)
    {
        loader.define(['traceModule.js'],function(traceModule)
        {
            FBTrace.sysout("traceModule scope includes FBL: "+FBL+" Firebug "+Firebug);
        });  // synchronous
    }

    var coreModules = [];

    if (config.coreModules)
    {
        coreModules = config.coreModules;
    }
    else if (config.arch === 'inProcess')
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

    loader.define(coreModules, coreInitialize);
}

function setConfigurationDefaults(config)
{
    config.arch = config.arch || 'inProcess';
    config.prefDomain = config.prefDomain || 'extensions.firebug';
    config.baseUrl = config.baseUrl || 'resource://firebug_rjs/';
    config.paths = {"arch": config.arch};
}

// ********************************************************************************************* //

return {loadCore: loadCore, arch: "inProcess"};

// ********************************************************************************************* //
}(window.FirebugConfig || {});
