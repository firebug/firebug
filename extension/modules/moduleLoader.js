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

var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);


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
    this.config = ModuleLoader.copyProperties({}, requirejsConfig);
    this.global = global;
    this.securityOrigin;

    this.registry = {};
    this.totalEvals = 0;
    this.totalEntries = 0;
    this.loading = [];  // stack of current dependency branch
    this.loaded = {}; // modules by URL

    ModuleLoader.instanceCount += 1;
    this.instanceCount = ModuleLoader.instanceCount;

    var self = this;
    this.loadDepsThenCallback  = function() { // during the ctor call, bind a ref to the loader
        return self.prefixWithConfig.apply(self, arguments);  // use the bound ref to call apply with proper |this|
    }
    this.define = this.loadDepsThenCallback;


    ModuleLoader.currentModuleLoader = this;

    if (!ModuleLoader.loaders) {
        ModuleLoader.loaders = [];
    }
    ModuleLoader.loaders.push(this);
}

ModuleLoader.debug = true;

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
 * @return reference to lhs, overridden by properties of rhs
 * @param lhs left hand side object, properties may be overwritten by rhs
 * @param rhs (optional) right hand side object, properties copied over lhs
 */
ModuleLoader.copyProperties = function(lhs, rhs) {
    for (var p in rhs) {
        try {
            lhs[p] = rhs[p];
        } catch (exc) {
            // On the Mozila platform we get "Operation is not supported"
        }
    }
    return lhs;
}

ModuleLoader.systemPrincipal = Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal);
ModuleLoader.nsIIOService = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService);

ModuleLoader.isRelativeURL = function(url)
{
    var R_query_index = url.indexOf('?');
    var R_head = url;
    if (R_query_index !== -1)
        R_head = url.substr(0, R_query_index);

    return (R_head.indexOf(':') === -1);
}


ModuleLoader.bootStrap = function(requirejsPath) {
    var primordialLoader = new ModuleLoader(null, {context: "_Primordial"});
    try {
        if (ModuleLoader.debug) consoleService.logStringMessage("ModuleLoader bootstrap from "+requirejsPath);
        ModuleLoader.bootstrapUnit = primordialLoader.loadModule(requirejsPath);
    } catch (exc) {
        consoleService.logStringMessage("ModuleLoader bootstrap ERROR "+exc);
    }

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
    require: function(moduleId) {
        if ( typeof(moduleId === 'string') )
            return coreRequire(moduleId);
        ModuleLoader.onError("The 'require' function accepts a module identifier");
    },
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
            var msg = exc.toString() +" "+(exc.fileName || exc.sourceName) + "@" + exc.lineNumber;
            return ModuleLoader.onError(msg, {exception: exc, compilationUnit: unit, moduleLoader: this});
        }
    },

    loadModule: function(mrl, context, callback) {
        try {
            var url = mrl;

            if ( ModuleLoader.isRelativeURL(mrl) )
                url = (this.baseURL || "") + mrl;

            // we can't use baseURI because resource:// is not a valid URI
            var mozURI = ModuleLoader.nsIIOService.newURI(url, null, null);
            var url = mozURI.spec;

            if (!this.baseURL) {  // then we did not have one configured before, use the first one we see
                this.baseURL = url.split('/').slice(0,-1).join('/');
            }
        } catch (exc) {
            return ModuleLoader.onError(new Error("ModuleLoader could not convert "+mrl+" to absolute URL using baseURL "+(this.baseURL ? this.baseURL.spec:" undefined")), {exception: exc, moduleLoader: this});
        }
        if (ModuleLoader.debug) ModuleLoader.onDebug("ModuleLoader loadModule reading "+url+" from baseURL: "+this.baseURL+" and mrl: "+mrl+" ");

        var unit = {
            source: this.mozReadTextFromFile(url, mrl, context),
            url: url,
            mrl: mrl, // relative
        }

        this.compileUnitInSandbox(unit, callback);
        this.attachModule(url, unit);  // even if we don't have any valid exports, so we can try to finish dependencies

        return unit;
    },

    compileUnitInSandbox: function(unit, callback)
    {
        var thatGlobal = unit.sandbox = this.getSandbox(unit);

        // **** For security analysis we need to recognize that these added properties are visible to evaled code. ****

        // Any properties of this.global that are functions compiled in chrome scope become exposed to evaled code.
        if (this.global) {
            ModuleLoader.copyProperties(thatGlobal, this.global);
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
    },

    loadModuleLoading: function(thatGlobal) {
       // if (this.principal == "system") { // voodoo learned from securable-modules.js, .equals() does not work
            thatGlobal.require = coreRequire;  // reuse the require compile objects
            thatGlobal.define = define;
       // }
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

            if (args[0].onError) {
                if (ModuleLoader.debug) ModuleLoader.onDebug("ModuleLoader overriding onError ");

                this.saveOnError = coreRequire.onError;
                coreRequire.onError = args[0].onError;
            }

            var rc = coreRequire.apply(null, args);

            if (this.saveOnError) {
                coreRequire.onError = this.saveOnError;
                delete this.saveOnError;
            }

            return rc;
        } else {
            if (ModuleLoader.debug) {
                ModuleLoader.onDebug("ModuleLoader.loadDepsThenCallback(deps, callback), missing argument 'deps'", this);
            }
        }
    },

    remapConfig: function(cfg) {
        if (cfg.debug)
            ModuleLoader.debug = !!cfg.debug;
        if (cfg.onDebug)
            ModuleLoader.onDebug = cfg.onDebug;

        if (cfg.onError)
            ModuleLoader.onError = cfg.onError;

        if (ModuleLoader.debug){
            ModuleLoader.onDebug("ModuleLoader.remapConfig name: "+(cfg.context||"(none)")+" baseUrl:"+(cfg.baseUrl||"(none given)"));
        }

        if (!cfg.context) {
            // The require.js config object uses 'context' property name to mean 'contextName'.
            cfg.context = this.getModuleLoaderName();
        } // else caller better know what they are doing...

        if (cfg.baseUrl) { // then assume the incoming value
            var endsWithSlash = cfg.baseUrl.charAt(cfg.baseUrl.length - 1);
            this.baseURL = cfg.baseUrl + (endsWithSlash ? '' : '/');
        }
        else if (this.baseURL) {  // then tell require.js about it
            cfg.baseUrl = this.baseURL;
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

    toString: function() {
        return "Moduleloader "+this.getModuleLoaderName()+": "+this.totalEntries+" entries";
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

    mozReadTextFromFile: function(pathToFile, mrl, context) {
        try {
            var channel = ModuleLoader.nsIIOService.newChannel(pathToFile, null, null);
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
            if (err.name === "NS_ERROR_FILE_NOT_FOUND") {
                var info = {err:err, pathToFile: pathToFile, moduleLoader: this};
                var namedHow = "";
                if (context && context.namedHow) {
                    info.nameHow = context.namedHow;
                    namedHow = context.namedHow.how;
                }
                try {
                    if (this.baseURL)
                        var basePath = ModuleLoader.getLocalOrSystemPath(this.baseURL, true);
                } catch(exc) {
                    var basePath = exc;
                }


                return ModuleLoader.onError(new Error("ERROR ModuleLoader file not found "+pathToFile+" from "+mrl+" how: "+namedHow+" basePath: "+basePath), info);
            }
            return ModuleLoader.onError(new Error("mozReadTextFromFile; EXCEPTION "+err), {err:err, pathToFile: pathToFile, moduleLoader: this});
        }
    },

}


ModuleLoader.onError = function (err, object) {
    Cu.reportError("ModuleLoader pre-bootstrap ERROR "+err);
    try
    {
        if (object) {
            Cu.reportError("ModuleLoader pre-bootstrap object "+object);
            for (var p in object) {
                Cu.reportError("ModuleLoader pre-bootstrap object["+p+"]="+object[p]);
            }
        }
    }
    finally
    {
        throw err;  // if we get an error, die
    }

}

ModuleLoader.onDebug = function (err, object) {
    consoleService.logStringMessage("ModuleLoader pre-bootstrap message "+err);
    if (object) {
        consoleService.logStringMessage("ModuleLoader pre-bootstrap object "+object);
        for (var p in object) {
            try {
                consoleService.logStringMessage("ModuleLoader pre-bootstrap object["+p+"]="+object[p]);
            } catch (exc) {
                // bah bogus errors
            }
        }
    }
}

ModuleLoader.getLocalSystemURI = function(url)
{
    try
    {
        var uri = ModuleLoader.nsIIOService.newURI(url, null, null);
        if (uri.schemeIs("resource"))
        {
            var ph = ModuleLoader.nsIIOService.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
            var abspath = ph.getSubstitution(uri.host);
            uri = ModuleLoader.nsIIOService.newURI(uri.path.substr(1), null, abspath);
        }
        if (uri.schemeIs("chrome"))
        {
            var chromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry);
            uri = chromeRegistry.convertChromeURL(uri);
        }
        return uri;
    }
    catch(exc)
    {
        ModuleLoader.onError("getLocalSystemURI failed for "+url+", "+exc);
    }
}

/*
 * Mozilla native path for local URL
 */
ModuleLoader.getLocalOrSystemPath = function(url, allowDirectories)
{
    var uri = ModuleLoader.getLocalSystemURI(url);
    if (uri instanceof Ci.nsIFileURL)
    {
        var file = uri.file;
        if (allowDirectories)
            return file && file.path;
        else
            return file && !file.isDirectory() && file.path;
    }
}


// *** load require.js and override its methods as needed. ****
ModuleLoader.requireJSFileName = "resource://moduleloader/require.js";

try
{
    coreRequire = ModuleLoader.bootStrap(ModuleLoader.requireJSFileName).require;

    if (coreRequire) {
        define = coreRequire.def; // see require.js
    } else {
        ModuleLoader.onError("ModuleLoader ERROR bootStrap has no require property from "+ModuleLoader.requireJSFileName);
    }
}
catch (e)
{
    dump("ModuleLoader; EXCEPTION" + e + "\n");
}

function loadCompilationUnit(moduleLoader, context, url, moduleName) {
    try {
        moduleLoader.loading.push(url);
        if (ModuleLoader.debug) ModuleLoader.onDebug("ModuleLoader depth "+moduleLoader.loading.length+" loading "+url);
        var unit = moduleLoader.loadModule(url, context);
        context.completeLoad(moduleName);             // round up all the dependencies
        if (ModuleLoader.debug) ModuleLoader.onDebug("ModuleLoader depth "+moduleLoader.loading.length+" loaded "+url+" completed "+moduleName);
        moduleLoader.loading.pop();
        return unit;
    } catch (exc) {
        var errorURL = exc.filename || exc.sourceName || exc.fileName;
        var errorLineNumber = exc.lineNumber;

        ModuleLoader.onError("ModuleLoader.loadCompilationUnit got exception "+exc+" on "+errorURL+"@"+errorLineNumber+", loading "+url+" stack: "+moduleLoader.loading.join('<-'), exc);
        if (moduleLoader.config.edit) {
            return moduleLoader.config.edit(exc, errorURL, errorLineNumber);
        }
        throw exc;
    }
}

// Override to connect require.js to our loader
coreRequire.load = function (context, moduleName, url) {

    this.s.isDone = false; // signal for require.ready()

    context.loaded[moduleName] = false; //in process of loading.
    context.scriptCount += 1;

    var moduleLoader = ModuleLoader.get(context.contextName); // set in config for each subsystem

    if (moduleLoader) {
        if (moduleLoader.loaded[url])
        {
            if (context.config.onDebug)
                context.config.onDebug("ModuleLoader already loaded "+url);
            return;
        }

        var unit = loadCompilationUnit(moduleLoader, context, url, moduleName);
        unit.exports = context.defined[moduleName];   // remember what we exported.
        context.urlFetched[url] = true;  // I don't think this is needed.
        moduleLoader.loaded[url] = unit;
    } else {
        return ModuleLoader.onError( new Error("require.attach called with unknown moduleLoaderName "+context.contextName+" for url "+url), ModuleLoader );
    }
};

coreRequire.analyzeFailure = function(context, managers, specified, loaded) {
    for (var i = 0; i < managers.length; i++) {
        var manager = managers[i];
        context.config.onDebug("require.js ERROR failed to complete "+manager.fullName+" isDone:"+manager.isDone+" #defined: "+manager.depCount+" #required: "+manager.depMax);
        var theNulls = [];
        var theUndefineds = [];
        var theUnstrucks = manager.strikeList;
        var depsTotal = 0;
        for( var depName in manager.deps) {
            if (typeof (manager.deps[depName]) === "undefined") theUndefineds.push(depName);
            if (manager.deps[depName] === null) theNulls.push(depName);
            var strikeIndex = manager.strikeList.indexOf(depName);
            manager.strikeList.splice(strikeIndex, 1);
        }
        context.config.onDebug("require.js: "+theNulls.length+" null dependencies "+theNulls.join(',')+" << check module ids.", theNulls);
        context.config.onDebug("require.js: "+theUndefineds.length+" undefined dependencies: "+theUndefineds.join(',')+" << check module return values.", theUndefineds);
        context.config.onDebug("require.js: "+theUnstrucks.length+" unstruck dependencies "+theUnstrucks.join(',')+" << check duplicate requires", theUnstrucks);

        for (var j = 0; j < manager.depArray.length; j++) {
            var id = manager.depArray[j];
            var module = manager.deps[id];
            context.config.onDebug("require.js: "+j+" specified: "+specified[id]+" loaded: "+loaded[id]+" "+id+" "+module);
        }
    }
}
