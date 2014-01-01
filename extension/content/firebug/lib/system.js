/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/array",
    "firebug/trace/debug",
    "firebug/lib/xpcom"
],
function(FBTrace, Arr, Debug, Xpcom) {

"use strict";

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
        var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
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
    catch (exc)
    {
        Debug.ERROR(exc);
    }

    return false;
};

System.getIconURLForFile = function(path)
{
    var fileHandler = ioService.getProtocolHandler("file")
        .QueryInterface(Ci.nsIFileProtocolHandler);

    try
    {
        var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        file.initWithPath(path);

        if ((System.getPlatformName() == "Darwin") && !file.isDirectory() &&
            (path.indexOf(".app/") != -1))
        {
            path = path.substr(0,path.lastIndexOf(".app/")+4);
            file.initWithPath(path);
        }

        return "moz-icon://" + fileHandler.getURLSpecFromFile(file) + "?size=16";
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("getIconURLForFile ERROR " + exc + " for " + path, exc);
    }

    return null;
};

System.copyToClipboard = function(string)
{
    var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
    clipboard.copyString(string);

    if (FBTrace.DBG_ERRORS && !string)
        FBTrace.sysout("system.copyToClipboard; " + string, string);
};

System.getStringDataFromClipboard = function()
{
    // https://developer.mozilla.org/en-US/docs/Using_the_Clipboard#Pasting_Clipboard_Contents
    var clip = Cc["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard);
    if (!clip)
        return false;

    var trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
    if (!trans)
        return false;

    if ("init" in trans)
        trans.init(null);

    trans.addDataFlavor("text/unicode");

    clip.getData(trans, clip.kGlobalClipboard);

    var str = {};
    var strLength = {};

    try
    {
        trans.getTransferData("text/unicode", str, strLength);

        if (str)
        {
            str = str.value.QueryInterface(Ci.nsISupportsString);
            return str.data.substring(0, strLength.value / 2);
        }
    }
    catch (ex)
    {
    }

    return false;
};

// ********************************************************************************************* //
// OS Checkers

System.isMac = function(win)
{
    return win.navigator.platform.search("Mac") != -1;
}

System.isWin = function(win)
{
    return win.navigator.platform.search("Win") != -1;
}

// ********************************************************************************************* //
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
 * if (compareFirebugVersion("1.9") >= 0)
 * {
 *     // The current version is Firebug 1.9+
 * }
 */
System.checkFirebugVersion = function(expectedVersion)
{
    if (!expectedVersion)
        return 1;

    var version = Firebug.getVersion();

    // Use Firefox comparator service.
    var versionChecker = Xpcom.CCSV("@mozilla.org/xpcom/version-comparator;1",
        "nsIVersionComparator");
    return versionChecker.compare(version, expectedVersion);
};

// ********************************************************************************************* //
// JS Modules

/**
 * Allows importing a JS module (Firefox platform) and specify alternative locations
 * to keep backward compatibility in case when the module location changes.
 * It helps Firebug to support multiple Firefox versions.
 *
 * @param {Array} locations List of URLs to try when importing the module.
 * @returns Scope of the imported module or an empty scope if module wasn't successfully loaded.
 */
System.importModule = function(locations)
{
    for (var i=0; i<locations.length; i++)
    {
        try
        {
            var moduleUrl = locations[i];
            var scope = {};
            Cu["import"](moduleUrl, scope);
            return scope;
        }
        catch (err)
        {
        }
    }

    // Module wasn't loaded return an empty scope.
    return {};
};

// ********************************************************************************************* //

return System;

// ********************************************************************************************* //
});
