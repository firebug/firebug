/*
 * Extends require.js (by James Burke) to support loading modules into Firefox extensions
 *
 * Copyright 2011 John J. Barton for IBM Corp.
 * This code is released under Firebug's BSD license.
 *
 * Key ideas from securable-modules.js by Atul Varma <atul@mozilla.com>,
 * with enhancements by Jan Odvarko and James Burke released under BSD license
 * https://bugzilla.mozilla.org/show_bug.cgi?id=614239 accessed on Jan. 8, 2011
 *
 * API influenced by: http://wiki.ecmascript.org/doku.php?id=strawman:module_loaders accessed on Jan. 8, 2011
 */

// allow this file to be loaded via resource url
// eg Components.utils.import("resource://hellomodule/ModuleLoader.js");
var EXPORTED_SYMBOLS = ["ModuleLoader"];

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;


/*
 * @param global: the global object to use for the execution context associated with the module loader.
 * use null for system modules, then {context:<string>} to config (required)
 * use |window| for window modules, config optional
 * @param requirejsConfig: object matching http://requirejs.org/docs/api.html#config
 * @param securityOrigin: a window, URI, or nsIPrincipal. Overrides global as origin URI for scripts in sandbox
 * Operations on the global object in the evaled code must be carefully studied unless
 * the securityOrigin is more restricting.
 */

function ModuleLoader(global, requirejsConfig, securityOrigin) {
    this.config = ModuleLoader.copyProperties(requirejsConfig);
    this.global = global;
    this.securityOrigin;

    this.registry = {};
    this.totalEvals = 0;
    this.totalEntries = 0;

    ModuleLoader.instanceCount += 1;
    this.instanceCount = ModuleLoader.instanceCount;

    var self = this;
    this.loadDepsThenCallback  = function() { // during the ctor call, bind a ref to the loader
        return self.prefixWithConfig.apply(self, arguments);  // use the bound ref to call apply with proper |this|
    }

    ModuleLoader.currentModuleLoader = this;

    if (!ModuleLoader.loaders) {
        ModuleLoader.loaders = [];
    }
    ModuleLoader.loaders.push(this);
}
/*
 * @return the current module loader for the current execution context.
 * (XXXjjb: dubious value)
 */
ModuleLoader.current = function getCurrentModuleLoader() {
    return ModuleLoader.currentModuleLoader;
}

ModuleLoader.instanceCount = 0;

ModuleLoader.get = function(name) {
    for (var i = 0; i < ModuleLoader.loaders.length; i++) {
        if (ModuleLoader.loaders[i].getModuleLoaderName() === name) {
            return ModuleLoader.loaders[i];
        }
    }
}
/*
 * @return shallow copy of lhs overridden by rhs
 * @param lhs left hand side object, properties copied in to return
 * @param rhs (optional) right hand side object, properties copied over lhs
 */
ModuleLoader.copyProperties = function(lhs, rhs) {
    var obj = {};
    if (rhs) {
        for (var p in rhs) {
            obj[p] = rhs[p];
        }
    }
    if (lhs) {
        for (var p in lhs) {
            obj[p] = lhs[p];
        }
    }
    return obj;
}

ModuleLoader.systemPrincipal = Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal);
ModuleLoader.mozIOService = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService);

ModuleLoader.bootStrap = function(requirejsPath) {
    var primordialLoader = new ModuleLoader(null, {context: "_Primordial"});
    ModuleLoader.bootstrapUnit = primordialLoader.loadModule(requirejsPath);
    // require.js does not export so we need to fix that
    ModuleLoader.bootstrapUnit.exports = {
        require: ModuleLoader.bootstrapUnit.sandbox.require,
        define: ModuleLoader.bootstrapUnit.sandbox.define
    };
    return ModuleLoader.bootstrapUnit.exports;
}

// The ModuleLoader.prototype will close over these globals which will be set when the outer function runs.
var coreRequire;
var define;

ModuleLoader.prototype = {
    /*
     *  @return produces the global object for the execution context associated with moduleLoader.
     */
    globalObject: function () {
        return this.global;
    },
    /*
     * @return registers a frozen object as a top-level module in the module loader's registry. The own-properties of the object are treated as the exports of the module instance.
     */
    attachModule: function(name, module) {
        this.registry[name] = module;  // its a lie, we register compilation units
        this.totalEntries++;
    },
    /*
     * @return the module instance object registered at name, or null if there is no such module in the registry.
     */
    getModule: function(name) {
        var entry = this.registry[name];
        if (entry) return entry.exports;
    },
    /*
     * @param unit compilation unit: {
     * 	source: a string of JavaScript source,
     *  url: identifier,
     *  jsVersion: JavaScript version to compile under
     *  staringLineNumber: offset for source line numbers.
     * @return completion value
     */
    evalScript: function(unit) {
        try {
            unit.jsVersion = unit.jsVersion || "1.8";
            unit.url = unit.url || (this.getModuleLoaderName() + this.totalEvals)
            unit.startingLineNumber = unit.startingLineNumber || 1;
            // beforeCompilationUnit
            var evalResult = Cu.evalInSandbox(unit.source, unit.sandbox,  unit.jsVersion, unit.url, unit.startingLineNumber);
            // afterCompilationUnit
            this.totalEvals += 1;
            return evalResult;
        } catch (exc) {
            return coreRequire.onError(new Error("ModuleLoader.evalScript ERROR "+exc), {exc: exc, unit: unit});
        }
    },

    loadModule: function(mrl, callback) {
        try {
            var mozURI = ModuleLoader.mozIOService.newURI(mrl, null, (this.baseURI ? this.baseURI : null));
            var url = mozURI.spec;

            if (!this.baseURI) {  // then we did not have one configured before, use the first one we see
                var baseURL = url.split('/').slice(0,-1).join('/');
                this.baseURI =  ModuleLoader.mozIOService.newURI(mrl, null, null);
            }

        } catch (exc) {
            return coreRequire.onError(new Error("ModuleLoader could not convert "+mrl+" to absolute URL using baseURI "+this.baseURI), {exception: exc, moduleLoader: this});
        }

        var unit = {
            source: this.mozReadTextFromFile(url),
            url: url,
            mrl: mrl, // relative
        }
        var thatGlobal = unit.sandbox = this.getSandbox(unit);

        // **** For security analysis we need to recognize that these added properties are visible to evaled code. ****

        // Any properties of this.global that are functions compiled in chrome scope become exposed to evaled code.
        if (this.global) {
            thatGlobal = ModuleLoader.copyProperties(thatGlobal, this.global);
        }

        this.loadModuleLoading(thatGlobal);  // only for system sandboxes.

        // *** end of added properties ****

        thatGlobal.exports = {}; // create the container for the module to fill with exported properties
        unit.exports = thatGlobal.exports; // point to the container before the source can muck with it.
        unit.evalResult = this.evalScript(unit);
        for (var p in unit.exports) {
            if (unit.exports.hasOwnProperty(p)) { // then we had at least on export
                if (callback) {
                    callback(unit.exports);  // this call throws we do not register the module?
                }
            }
        }
        this.attachModule(url, unit);  // even if we don't have any valid exports, so we can try to finish dependencies
        return unit;
    },

    loadModuleLoading: function(thatGlobal) {
        if (this.principal.equals(ModuleLoader.systemPrincipal)) {
            thatGlobal.require = coreRequire;  // reuse the require compile objects
            thatGlobal.define = define;
        }
    },

    // **** clients will get require from their ModuleLoader instance

    prefixWithConfig: function (deps, callback) {
        var firstArg = arguments[0];

        if (firstArg) {
            if (coreRequire.isArray(firstArg) || typeof( firstArg ) === "string") {  // then deps is first arg
                var args = [{}];  // start with our our new first arg
                for (var i = 0; i < arguments.length; ++i) {
                       args.push(arguments[i]);
                }
            } else { // then caller wants requirejs config api
                var args = arguments;
            }
            args[0] = this.remapConfig(ModuleLoader.copyProperties(args[0], this.config));
            coreRequire.apply(null, args);
        } else {
            coreRequire.onError("ModuleLoader.loadDepsThenCallback(deps, callback), deps string or array of strings, callback called after strings resolved and loaded", this);
        }
    },

    remapConfig: function(cfg) {
        if (!cfg.context) {
            // The require.js config object uses 'context' property name to mean 'contextName'.
            cfg.context = this.getModuleLoaderName();
        } // else caller better know what they are doing...

        if (cfg.baseUrl) {
            try {
                this.baseURI = ModuleLoader.mozIOService.newURI(cfg.baseUrl, null, null);
            } catch (exc) {
                coreRequire.onError("ModuleLoader ERROR failed to create baseURI from "+cfg.baseUrl, this);
            }
        }
        else if (this.baseURI) {
            cfg.baseUrl = this.baseURI.spec;
        }

        return cfg;
    },

    // ****
    getSandbox: function(unit) {
        unit.principal = this.getPrincipal();
        return unit.sandbox = new Cu.Sandbox(unit.principal);
    },

    getPrincipal: function() {
        if (!this.principal) {
            if (this.securityOrigin) {
                this.principal = this.securityOrigin;
            } else if (this.global && (this.global instanceof Ci.nsIDOMWindow)) {
                this.principal = this.global;
            } else {
                this.principal = ModuleLoader.systemPrincipal;
            }
        }
        return this.principal;
    },

    getModuleLoaderName: function()	{
        if (!this.name)	{
            if (this.config.context) {
                this.name = this.config.context
            } else if (this.global) {
                if (this.global instanceof Ci.nsIDOMWindow) {
                    this.name = this.safeGetWindowLocation(this.global);
                } else {
                    this.name = (this.global + "" + this.instanceCount).replace(/\s/,'_');
                }
            }
            else {
                this.name = "ModuleLoader_"+this.instanceCount;
            }
        }
        return this.name;
    },

    safeGetWindowLocation: function(window)	{
        try {
            if (window) {
                if (window.closed) {
                    return "(window.closed)";
                }
                else if ("location" in window) {
                    return window.location+"";
                }
                else {
                    return "(no window.location)";
                }
            }
            else {
                return "(no context.window)";
            }
        } catch(exc) {
            return "(getWindowLocation: "+exc+")";
        }
    },

    mozReadTextFromFile: function(pathToFile) {
        try {
            var channel = ModuleLoader.mozIOService.newChannel(pathToFile, null, null);
            var inputStream = channel.open();

            var ciStream = Cc["@mozilla.org/intl/converter-input-stream;1"]
                .createInstance(Ci.nsIConverterInputStream);

            var bufLen = 0x8000;
            ciStream.init(inputStream, "UTF-8", bufLen,
                          Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
            var chunk = {};
            var data = "";

            while (ciStream.readString(bufLen, chunk) > 0) {
                data += chunk.value;
            }

            ciStream.close();
            inputStream.close();

            return data;
        } catch (err) {
            return coreRequire.onError(new Error("mozReadTextFromFile; EXCEPTION "+err), {err:err, pathToFile: pathToFile, moduleLoader: this});
        }
    },

}

// *** load require.js and override its methods as needed. ****

ModuleLoader.requireJSFileName = "resource://firebug/require.js";

coreRequire = ModuleLoader.bootStrap(ModuleLoader.requireJSFileName).require;

if (coreRequire) {
    define = coreRequire.def; // see require.js
} else {
    throw new Error("ModuleLoader ERROR failed to read and load "+ModuleLoader.requireJSFileName);
}

// Override to connect require.js to our loader
coreRequire.load = function (context, moduleName, url) {

    this.s.isDone = false; // signal for require.ready()

    context.loaded[moduleName] = false; //in process of loading.
    context.scriptCount += 1;

    var moduleLoader = ModuleLoader.get(context.contextName); // set in config for each subsystem

    if (moduleLoader) {
        var unit = moduleLoader.loadModule(url);
        context.completeLoad(moduleName);             // round up all the dependencies
        unit.exports = context.defined[moduleName];   // remember what we exported.
    } else {
        return coreRequire.onError( new Error("require.attach called with unknown moduleLoaderName "+context.contextName+" for url "+url), ModuleLoader );
    }
};

try
{
    Components.utils.import("resource://firebug/firebug-trace-service.js");
    var FBTrace = traceConsoleService.getTracer("extensions.chromebug");
    coreRequire.chainOnError = coreRequire.onError;
    coreRequire.onError = function (err, object) {
        FBTrace.sysout(err+"",{errorObject: err, moreInfo: object});
        coreRequire.chainOnError(err);
    }
}
catch(exc)
{
    var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
    consoleService.logStringMessage("Install Firebug tracing extension for more informative errors");
}


