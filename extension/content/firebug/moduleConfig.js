/* See license.txt for terms of usage */

/**
 * This is the place where the global Firebug object is created. This object represents
 * the entire application and all consequently created namespaces and variables should be
 * injected into it.
 *
 * In the future, there should *not* be any other globals except of the Firebug object.
 */
var Firebug = Firebug || {};

// ********************************************************************************************* //

/**
 * Returns default configuration object for Firebug module loader (RequireJS). Custom
 * value can be passed through the argument.
 *
 * @param {Object} baseConfig Custom configuration values.
 */
Firebug.getModuleLoaderConfig = function(baseConfig)
{
    baseConfig = baseConfig || {};

    // Set configuration defaults.
    baseConfig.baseLoaderUrl = baseConfig.baseLoaderUrl || "resource://moduleLoader/";
    baseConfig.prefDomain = baseConfig.prefDomain || "extensions.firebug";
    baseConfig.arch = baseConfig.arch || "chrome://firebug/content/bti/inProcess";
    baseConfig.baseUrl = baseConfig.baseUrl || "resource://";
    baseConfig.paths = baseConfig.paths || {"arch": baseConfig.arch,
        "firebug": "chrome://firebug/content"};
    baseConfig.xhtml = true;  // createElementNS used

    var keys = Object.keys(baseConfig);
    var config = {};
    keys.forEach(function copy(key)
    {
        config[key] = baseConfig[key];
    });

    // This is the basic list of necessary modules. All the other modules will be
    // automatically loaded as dependencies.
    config.modules = [
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
    ];

    return config;
}

// ********************************************************************************************* //
// Firebug Extension Registration

Firebug.extensions = {};

/**
 * Registers a Firebug extension. The framework automatically loads 'main' extension
 * module (AMD).
 *
 * @param {String} extName        Unique name of the extension. This name is used to
 *      build chrome paths for extension resource: chrome://<ext-id>/content/main.js
 * @param {Object} extConfig    Configuration file
 */
Firebug.registerExtension = function(extName, extConfig)
{
    extConfig = extConfig || {};

    var tempConfig = this.getExtensionConfig(extName);
    if (tempConfig)
    {
        FBTrace.sysout("firebug.registerExtension; ERROR An extenstion with the same ID " +
            "already exists! - " + extName, tempConfig);
        return;
    }

    if (FBTrace.DBG_INITIALIZE)
        FBTrace.sysout("Extension registered: " + extName);

    this.extensions[extName] = extConfig;

    var config = Firebug.getModuleLoaderConfig();
    config.paths[extName] = extName + "/content";

    // Load main.js module (the entry point of the extension) and support for tracing.
    // All other extension modules should be loaded within "main" module.
    Firebug.require(config, [
        extName + "/main",
        "firebug/lib/trace"
    ],
    function(Extension, FBTrace)
    {
        try
        {
            extConfig.app = Extension;

            // Extension intialization procedure should be within this method (in main.js).
            if (Extension.initialize)
                Extension.initialize();

            if (FBTrace.DBG_INITIALIZE)
                FBTrace.sysout("firebug.main; Extension '" + extName + " - modules loaded!");
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_INITIALIZE)
                FBTrace.sysout("firebug.main; Extension: " + extName + " EXCEPTION " + err, err);
        }
    });
}

/**
 * Unregisters and shutdowns specifidc extension. Registered extensions are unregistered
 * automatically when Firebug shutdowns. Bootstrapped extensions should use this method
 * to dynamically uninstall an extension.
 *
 * @param {Object} extName    ID of the extensions that should be unregistered.
 */
Firebug.unregisterExtension = function(extName)
{
    var extConfig = this.getExtensionConfig(extName);
    if (!extConfig)
        return;

    if (extConfig.app.shutdown)
        extConfig.app.shutdown();

    delete this.extensions[extName];
}

Firebug.getExtensionConfig = function(extName)
{
    return this.extensions[extName];
}

Firebug.iterateExtensions = function(callback)
{
    for (var ext in this.extensions)
        callback(ext, this.extensions[ext]);
}

/**
 * Unregisters and shutdowns all registered extensions. Calle by the framework when
 * Firebug shutdowns.
 */
Firebug.unregisterExtensions = function()
{
    var extensions = {};
    for (var p in this.extensions)
        extensions[p] = this.extensions[p];

    for (var extName in extensions)
        this.unregisterExtension(extName);

    this.extensions = {};
}

// ********************************************************************************************* //
