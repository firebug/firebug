/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

var EXPORTED_SYMBOLS = ["PrefLoader"];

var PrefLoader = {};
PrefLoader.prefDomain = "extensions.firebug.";

// ********************************************************************************************* //
// Implementation

/**
 * Load file with default preferences
 *
 * @param {Object} path Extension installation path
 * @param {Object} fileName Preference file name
 */
function loadDefaultPrefs(path, fileName)
{
    try
    {
        var uri;
        var baseURI = Services.io.newFileURI(path);

        // Compute preference file name path.
        if (path.isDirectory())
            uri = Services.io.newURI("defaults/preferences/" + fileName, null, baseURI).spec;
        else
            uri = "jar:" + baseURI.spec + "!/defaults/preferences/" + fileName;

        // Load preference file and use 'pref' function to define all prefs.
        Services.scriptloader.loadSubScript(uri, {pref: pref});
    }
    catch (err)
    {
        Cu.reportError(err);
    }
}

// ********************************************************************************************* //

/**
 * Clear preferences that are not modified by the user. This is requirement
 * (or recommendation?) from AMO reviewers.
 *
 * @param {Object} domain
 */
function clearDefaultPrefs(domain)
{
    domain = domain || PrefLoader.prefDomain;
    var pb = Services.prefs.getDefaultBranch(domain);

    var names = pb.getChildList("");
    for (var i=0; i<names.length; i++)
    {
        var name = names[i];
        if (!pb.prefHasUserValue(name))
            pb.deleteBranch(name);
    }
}

// ********************************************************************************************* //

/**
 * Implement function that is used to define preferences in preference files. These
 * are usually stored within 'defaults/preferences' directory.
 *
 * @param {Object} name Preference name
 * @param {Object} value Preference value
 */
function pref(name, value)
{
    try
    {
        var branch = Services.prefs.getDefaultBranch("");

        switch (typeof value)
        {
            case "boolean":
                branch.setBoolPref(name, value);
                break;

            case "number":
                branch.setIntPref(name, value);
                break;

            case "string":
                var str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
                str.data = value;
                branch.setComplexValue(name, Ci.nsISupportsString, str);
                break;
        }
    }
    catch (e)
    {
        Cu.reportError("prefLoader.pref; Firebug can't set default pref value for: " + name);
    }
}

// ********************************************************************************************* //
// Duplicates firebug/lib/options

var prefTypeMap = (function()
{
    var map = {}, br = Ci.nsIPrefBranch;
    map["string"] = map[br.PREF_STRING] = "CharPref";
    map["boolean"] = map[br.PREF_BOOL] = "BoolPref";
    map["number"] = map[br.PREF_INT] = "IntPref";
    return map;
})();

function getPref(prefDomain, name)
{
    var prefName = (name == undefined) ?
        PrefLoader.prefDomain + prefDomain : prefDomain + "." + name;
    var prefs = Services.prefs;
    var type = prefTypeMap[prefs.getPrefType(prefName)];
    return type ? prefs["get" + type](prefName) : null;
}

function setPref(name, value)
{
    var prefName = PrefLoader.prefDomain + name;
    var prefs = Services.prefs;

    var type = prefTypeMap[typeof value];
    if (type)
        value = prefs["set" + type](prefName, value);

    return value;
}

function forceSave()
{
    Services.prefs.savePrefFile(null);
}

// ********************************************************************************************* //
// Registration

PrefLoader.loadDefaultPrefs = loadDefaultPrefs;
PrefLoader.clearDefaultPrefs = clearDefaultPrefs;
PrefLoader.getPref = getPref;
PrefLoader.setPref = setPref;
PrefLoader.forceSave = forceSave;

// ********************************************************************************************* //
