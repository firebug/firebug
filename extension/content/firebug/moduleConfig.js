/* See license.txt for terms of usage */

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
    baseConfig.arch = baseConfig.arch ||  "firebug_rjs/bti/inProcess";
    baseConfig.baseUrl = baseConfig.baseUrl || "resource://";
    baseConfig.paths = baseConfig.paths || {"arch": baseConfig.arch, "firebug": "firebug_rjs"};

    var config =
    {
        context: "Firebug",
        baseUrl: baseConfig.baseUrl,
        paths: baseConfig.paths,
        modules: [
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
        ]
    };

    return config;
}

// ********************************************************************************************* //
