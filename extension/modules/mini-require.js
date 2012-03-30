/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Module Loader Implementation

var require, define;

(function() {

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

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
        var args = deps.map(function(dep) {
            return self.loadModule(dep);
        });

        try
        {
            var module = this.currentModule[this.currentModule.length - 1];
            module.exports = callback.apply(module.scope, args);
        }
        catch (err)
        {
            Cu.reportError(err);
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
        }

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
            this.load(module.scope, moduleId);
        }

        this.currentModule.pop();

        // Exports (the module return value in case of AMD) is set in define function.
        return module.exports;
    },

    load: function(moduleScope, moduleId)
    {
        //xxxHonza: Remaping moved modules

        var moduleUrl = this.getModuleUrl(moduleId) + ".js";

        try
        {
            Services.scriptloader.loadSubScript(moduleUrl, moduleScope);
        }
        catch (err)
        {
            Cu.reportError(moduleId + " -> " + moduleUrl);
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
        var resolved = parts.map(function(part)
        {
            var alias = self.config.paths[part];
            return alias ? alias : part;
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
    }
}

// ********************************************************************************************* //
// Public API

require = Loader.require.bind(Loader);
define = Loader.define.bind(Loader);

// ********************************************************************************************* //
})();
