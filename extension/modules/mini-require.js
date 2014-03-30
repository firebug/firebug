/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module Loader Implementation

var EXPORTED_SYMBOLS = ["require", "define"];

var require, define;

(function() {

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://firebug/fbtrace.js");

// xxxHonza: why FBTrace is undefined?
if (typeof(FBTrace) == "undefined")
    FBTrace = {sysout: function() {}}

// ********************************************************************************************* //
// Module Loader implementation

var Loader =
{
    config: {},
    modules: {},
    currentModule: [],
    payloads: {},

    require: function(config, modules, callback)
    {
        if (typeof config == "string" && !modules && !callback)
            return this.modules[config].exports;

        this.config = config ? config : this.config;
        this.currentModule = [];

        var main = this.modules["main"] = {
            scope: {}
        };

        this.currentModule.push(main);
        this.lookup(modules, callback);
    },

    define: function(moduleId, deps, payload)
    {
        if (!payload && FBTrace.DBG_ERRORS)
            FBTrace.sysout("loader.define; No payload? " + moduleId, moduleId);

        if (payload)
            payload.deps = deps;

        this.payloads[moduleId] = payload;
    },

    lookup: function(moduleId, deps, callback)
    {
        // Module name doesn't have to be specified.
        if (arguments.length == 2)
        {
            callback = deps;
            deps = moduleId;
            moduleId = undefined;
        }

        var self = this;
        var args = deps.map(function(dep)
        {
            var result = self.loadModule(dep);
            if (!result)
            {
                FBTrace.sysout("mini-require; ERROR Could be a cycle dependency or undefined " +
                    "return value from a module: " + dep, self.getDeps());
            }
            return result;
        });

        try
        {
            var module = this.currentModule[this.currentModule.length - 1];
            module.deps = deps;
            module.args = args;
            module.exports = callback.apply(module.scope, args);
        }
        catch (err)
        {
            Cu.reportError(err);

            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("mini-require; EXCEPTION lookup " + err, err);
        }
    },

    loadModule: function(moduleId)
    {
        var module = this.modules[moduleId];
        if (module)
            return module.exports;

        module = this.modules[moduleId] = {};
        module.scope = {
            define: this.lookup.bind(this)
        };

        this.currentModule.push(module);

        // If the module is already registered, load all deps and execute.
        // Otherwise we need to load the script from URL.
        var payload = this.payloads[moduleId];
        if (payload)
        {
            this.lookup(moduleId, payload.deps, payload);
        }
        else
        {
            var moduleUrl = this.getModuleUrl(moduleId) + ".js";
            require.load(module.scope, moduleId, moduleUrl);
        }

        this.currentModule.pop();

        // Exports (the module return value in case of AMD) is set in define function.
        return module.exports;
    },

    load: function(context, fullName, url)
    {
        try
        {
            Services.scriptloader.loadSubScript(url, context);

            if (FBTrace.DBG_MODULES)
                FBTrace.sysout("mini-require; Module loaded " + fullName, url);
        }
        catch (err)
        {
            Cu.reportError(fullName + " -> " + url);
            Cu.reportError(err);
        }
    },

    getModuleUrl: function(moduleId)
    {
        var baseUrl = this.config.baseUrl;
        if (baseUrl.substr(-1) != "/")
            baseUrl += "/";

        // If there are no aliases just use baseUrl.
        if (!this.config.paths)
            return baseUrl + moduleId;

        // Get module id path parts (excluding the module name).
        var parts = moduleId.split("/");
        var moduleName = parts.pop();

        var self = this;
        var paths = this.config.paths;
        var resolved = parts.map(function(part)
        {
            // Use alias from config.paths if it's available.
            return paths.hasOwnProperty(part) ? paths[part] : part;
        });

        var moduleUrl = resolved.join("/");
        if (moduleUrl.substr(-1) != "/")
            moduleUrl += "/";

        moduleUrl += moduleName;

        var reProtocol = /^[^:]+(?=:\/\/)/;
        if (moduleUrl.match(reProtocol))
            return moduleUrl;

        // If there is no protocol, use baseUrl.
        return baseUrl + moduleUrl;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debugging Dependencies

    getDeps: function()
    {
        var result = {};
        for (var p in this.modules)
            this.calculateDeps(p, result);
        return result;
    },

    calculateDeps: function(moduleId, result)
    {
        var deps = result[moduleId];
        if (deps)
            return deps;

        deps = result[moduleId] = {};

        var module = this.modules[moduleId];
        if (!module.deps)
            return deps;

        for (var i=0; i<module.deps.length; i++)
        {
            var id = module.deps[i];
            deps[id] = this.calculateDeps(id, result);
        }

        return deps;
    },

    getDepDesc: function()
    {
        var desc = "";
        var deps = this.getDeps();
        for (var p in deps)
            desc += p + "\n";
        return desc;
    }
};

// ********************************************************************************************* //
// Public API

require = Loader.require.bind(Loader);
define = Loader.define.bind(Loader);
require.load = Loader.load.bind(Loader);
require.Loader = Loader;

// ********************************************************************************************* //
})();
