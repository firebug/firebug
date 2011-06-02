/* See license.txt for terms of usage */

// Extend require.js to add debugging information
// Include this file immediately after require.js
// ********************************************************************************************* //
require.onDebugDAG = function(fullName, deps)
{
    if (!require.depsNamesByName)
        require.depsNamesByName = {};

    var arr = [];
    for (var p in deps)
        arr.push(p);
    require.depsNamesByName[fullName] = arr;
}

require.analyzeDependencyTree = function()
{
    FBTrace.sysout("Firebug module list: ", require.depsNamesByName);

    // For each deps item create an object referencing dependencies
    function linkArrayItems(id, depNamesByName, path)
    {
        var deps = depNamesByName[id];
        var result = {};
        for (var i = 0; i < deps.length; i++)
        {
            var depID = deps[i];
            if (path.indexOf(":" + depID + ":") == -1) // Then depId is not already an dependent
                result[depID] = linkArrayItems(depID, depNamesByName, path + ":" + depID + ":");
            else
                FBTrace.sysout("Circular dependency: " + path + ":" + depID + ":");
        }
        return result;
    }


    var linkedDependencies = {};
    var dependents = {}; // reversed list, dependents by name
    var depNamesByName = require.depsNamesByName;
    for (var name in depNamesByName)
    {
        var depArray = depNamesByName[name];

        if (name === "undefined") {
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

    FBTrace.sysout("Firebug module dependency tree: ", linkedDependencies);
    FBTrace.sysout("Firebug dependents: ", dependents);
    FBTrace.sysout("Firebug minimal modules list: ", minimal);
}

require.onDebug = function()
{
    try
    {
        FBTrace.sysout.apply(FBTrace,arguments);
    }
    catch(exc)
    {
        var msg = "";
        for (var i = 0; i < arguments.length; i++)
            msg += arguments[i]+", ";

        Components.utils.reportError("Loader; onDebug:"+msg);  // put something out for sure
        window.dump("Loader; onDebug:"+msg+"\n");
    }
}

require.onError = function(exc)
{
    require.onDebug.apply(require, arguments);
    throw exc;
}