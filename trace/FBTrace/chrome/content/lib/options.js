/* See license.txt for terms of usage */

define([
    "fbtrace/trace"
],
function (FBTrace) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefService = PrefService.getService(Ci.nsIPrefService);
const prefs = PrefService.getService(Ci.nsIPrefBranch);

// ********************************************************************************************* //

var Options =
{
    prefDomain: "extensions.firebug",

    getPrefDomain: function()
    {
        return this.prefDomain;
    },

    initialize: function(prefDomain)
    {
        this.prefDomain = prefDomain;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    togglePref: function(name)
    {
        this.set(name, !this.get(name));
    },

    get: function(name)
    {
        return Options.getPref(this.prefDomain, name);
    },

    getPref: function(prefDomain, name)
    {
        var prefName = prefDomain + "." + name;

        var type = prefs.getPrefType(prefName);

        var value = null;
        if (type == Ci.nsIPrefBranch.PREF_STRING)
            value = prefs.getCharPref(prefName);
        else if (type == Ci.nsIPrefBranch.PREF_INT)
            value = prefs.getIntPref(prefName);
        else if (type == Ci.nsIPrefBranch.PREF_BOOL)
            value = prefs.getBoolPref(prefName);

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("options.getPref "+prefName+" has type "+
                this.getPreferenceTypeName(type)+" and value "+value);

        return value;
    },

    set: function(name, value)
    {
        Options.setPref(Options.prefDomain, name, value);
    },

    /**
     * Set a preference value.
     *
     * @param prefDomain, e.g. "extensions.firebug"
     * @param name Name of the preference (the part after prfDomain without dot)
     * @param value New value for the preference.
     * @param prefType optional pref type useful when adding a new preference.
     */
    setPref: function(prefDomain, name, value, prefType)
    {
        var prefName = prefDomain + "." + name;

        var type = this.getPreferenceTypeByExample((prefType ? prefType : typeof(value)));
        if (!this.setPreference(prefName, value, type, prefs))
            return;

        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("options.setPref type="+type+" name="+prefName+" value="+value);
    },

    setPreference: function(prefName, value, type, prefBranch)
    {
        if (FBTrace.DBG_OPTIONS)
            FBTrace.sysout("setPreference "+prefName, {prefName: prefName, value: value});

        if (type == Ci.nsIPrefBranch.PREF_STRING)
            prefBranch.setCharPref(prefName, value);
        else if (type == Ci.nsIPrefBranch.PREF_INT)
            prefBranch.setIntPref(prefName, value);
        else if (type == Ci.nsIPrefBranch.PREF_BOOL)
            prefBranch.setBoolPref(prefName, value);
        else if (type == Ci.nsIPrefBranch.PREF_INVALID)
        {
            FBTrace.sysout("options.setPref FAILS: Invalid preference "+prefName+" with type "+
                type+", check that it is listed in defaults/prefs.js");

            return false;
        }

        return true;
    },

    getPreferenceTypeByExample: function(prefType)
    {
        var type = Ci.nsIPrefBranch.PREF_INVALID;
        if (prefType)
        {
            if (prefType === typeof("s"))
                type = Ci.nsIPrefBranch.PREF_STRING;
            else if (prefType === typeof(1))
                type = Ci.nsIPrefBranch.PREF_INT;
            else if (prefType === typeof(true))
                type = Ci.nsIPrefBranch.PREF_BOOL;
        }
        else
        {
            type = prefs.getPrefType(prefName);
        }

        return type;
    },

    getPreferenceTypeName: function(prefType)
    {
        if (prefType == Ci.nsIPrefBranch.PREF_STRING)
            return "string";
        else if (prefType == Ci.nsIPrefBranch.PREF_INT)
            return "int";
        else if (prefType == Ci.nsIPrefBranch.PREF_BOOL)
            return "boolean";
    },
};

// ********************************************************************************************* //
// Registration

return Options;

// ********************************************************************************************* //
});
