/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/array",
],
function(FBTrace, Arr) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

var System = {};

// ********************************************************************************************* //

System.getPlatformName = function()
{
    return Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULRuntime).OS;
};

System.beep = function()
{
    var sounder = Cc["@mozilla.org/sound;1"].getService(Ci.nsISound);
    sounder.beep();
};

// ********************************************************************************************* //
// Programs

System.launchProgram = function(exePath, args)
{
    try
    {
        var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
        file.initWithPath(exePath);
        if (System.getPlatformName() == "Darwin" && file.isDirectory())
        {
            args = Arr.extendArray(["-a", exePath], args);
            file.initWithPath("/usr/bin/open");
        }

        if (!file.exists())
            return false;

        var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
        process.init(file);
        process.run(false, args, args.length, {});
        return true;
    }
    catch(exc)
    {
        this.ERROR(exc);
    }
    return false;
};

System.getIconURLForFile = function(path)
{
    var fileHandler = ioService.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler);
    try
    {
        var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
        file.initWithPath(path);
        if ((System.getPlatformName() == "Darwin") && !file.isDirectory() && (path.indexOf(".app/") != -1))
        {
            path = path.substr(0,path.lastIndexOf(".app/")+4);
            file.initWithPath(path);
        }
        return "moz-icon://" + fileHandler.getURLSpecFromFile(file) + "?size=16";
    }
    catch(exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("getIconURLForFile ERROR "+exc+" for "+path, exc);
    }
    return null;
}

System.copyToClipboard = function(string)
{
    var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
    clipboard.copyString(string);
    if (FBTrace.DBG_ERRORS)
        FBTrace.sysout("copyToClipboard "+string, string);

};

// ************************************************************************************************
// Firebug Version Comparator

/**
 * Compare expected Firebug version with the current Firebug installed.
 * @param {Object} expectedVersion Expected version of Firebug.
 * @returns
 * -1 the current version is smaller
 *  0 the current version is the same
 *  1 the current version is bigger
 *
 * @example:
 * if (compareFirebugVersion("1.6") >= 0)
 * {
 *     // The current version is Firebug 1.6+
 * }
 */
System.checkFirebugVersion = function(expectedVersion)
{
    if (!expectedVersion)
        return 1;

    var version = Firebug.getVersion();

    // Adapt to Firefox version scheme.
    expectedVersion = expectedVersion.replace('X', '', "g");
    version = version.replace('X', '', "g");

    // Use Firefox comparator service.
    var versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].
        getService(Ci.nsIVersionComparator);
    return versionChecker.compare(version, expectedVersion);
}

// ********************************************************************************************* //

return System;

// ********************************************************************************************* //
});
