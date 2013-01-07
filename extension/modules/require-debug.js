/* See license.txt for terms of usage */

// ********************************************************************************************* //
// johnjbarton@johnjbarton.com May 2011 IBM Corp.
// Extend require.js to add debugging information
// Include this file immediately after require.js
// ********************************************************************************************* //

/*
 * Override this function to write output from the debug support for require.
 * @param see Firebug console.log
 */
require.log = function()
{
    try
    {
        FBTrace.sysout.apply(FBTrace, arguments);
    }
    catch(exc)
    {
        if (window.console)
            console.log.apply(console, arguments);
        else
            alert.apply(null, arguments);
    }
};

/*
 * Called by require for each completed module
 * @param fullName module name
 * @param deps array of module names that fullName depends upon
 */
require.onDebugDAG = function(fullName, deps, url)
{
    if (!require.depsNamesByName)
    {
        require.depsNamesByName = {};
        require.urlByFullName = {};
    }


    var arr = [];
    for (var p in deps)
        arr.push(p);
    require.depsNamesByName[fullName] = arr;
    require.urlByFullName[fullName] = url;
};

require.originalExecCb = require.execCb;
require.execCbOFF = function (name)
{
    var ret = require.originalExecCb.apply(require, arguments);
    var value = null;
    try
    {
        if (ret)
        {
            var basename = "requirejs("+name+")";
            for (var prop in ret)
            {
                try
                {
                    if (ret.hasOwnProperty(prop))
                    {
                        value = ret[prop];
                        if (value !== null &&
                            (typeof value == "function"/* || typeof value == "object"*/))
                        {
                                var funcName = name + "_" + prop;
                                funcName = funcName.replace("/", "_", "g");
                                funcName = funcName.replace("-", "_", "g");
                                var namedFunction = eval("(function(){ return function " + funcName +
                                    "(){return true;} })()");
                                value.displayName = namedFunction;
                                //value.displayName = basename+"/"+prop;
                        }
                    }
                }
                catch (e)
                {
                    require.log("Could not displayName module "+name+" prop "+prop+": "+
                        e.toString(), [ret, prop, value]);
                }
            }
            ret.displayName = basename;
        }
    }
    catch(e)
    {
        require.log("Could not displayName module "+name+": "+e.toString());
    }

    return ret;
};

/* Calls require.log to record dependency analysis.
 * Call this function from your main require.js callback function
 * @param none
 *
 */
require.analyzeDependencyTree = function()
{
    require.log("Firebug module list: ", require.depsNamesByName);

    // For each deps item create an object referencing dependencies
    function linkArrayItems(id, depNamesByName, path)
    {
        var deps = depNamesByName[id];
        var result = {};
        for (var i = 0; i < deps.length; i++)
        {
            var depID = deps[i];
            if (path.indexOf(":"+depID+":") == -1) // Then depId is not already an dependent
                result[depID] = linkArrayItems(depID, depNamesByName, path+":"+depID+":");
            else
                require.log("Circular dependency: "+path+":"+depID+":");
        }
        return result;
    }

    var linkedDependencies = {};
    var dependents = {}; // reversed list, dependents by name
    var depNamesByName = require.depsNamesByName;

    for (var name in depNamesByName)
    {
        var depArray = depNamesByName[name];

        if (name === "undefined")
        {
            linkedDependencies["__main__"] = linkArrayItems(name, depNamesByName, "");
            name = "__main__";
        }

        for (var i = 0; i < depArray.length; i++)
        {
            var dependent = depArray[i];
            if (!dependents[dependent])
                dependents[dependent] = [];
            dependents[dependent].push(name);
        }
    }
    var minimal = [];
    var mainDeps = depNamesByName["undefined"];
    for (var i = 0; i < mainDeps.length; i++)
    {
        var dependencyOfMain = mainDeps[i];
        var dependentsOfDependencyOfMain = dependents[dependencyOfMain];
        if (dependentsOfDependencyOfMain.length === 1)
            minimal.push(dependencyOfMain);
    }

    require.log("Firebug module dependency tree: ", linkedDependencies);
    require.log("Firebug dependents: ", dependents);
    require.log("Firebug minimal modules list: ", minimal);
    require.log("Firebug URLs: ", require.urlByFullName);
};

/*
 * Calls require.log for warning and debug of require.js.
 * Called by require.js diagnostic branch
 */
require.onDebug = function()
{
    try
    {
        require.log.apply(null,arguments);
    }
    catch(exc)
    {
        var msg = "";
        for (var i = 0; i < arguments.length; i++)
            msg += arguments[i]+", ";
        window.alert("Loader; onDebug:"+msg+"\n");
    }
};

/*
 * Calls require.log for errors, then throws exception
 * Called by require.js
 */
require.onError = function(exc)
{
    require.onDebug.apply(require, arguments);
    throw exc;
};