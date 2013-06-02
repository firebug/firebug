/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);

// ********************************************************************************************* //
// Preferences

FBTestApp.Preferences =
{
    values : [],

    save: function()
    {
        this.values = [];

        var preferences = prefs.getChildList(Firebug.prefDomain, {});
        for (var i=0; i<preferences.length; i++)
        {
            var prefName = preferences[i].substr(Firebug.prefDomain.length + 1);
            if (prefName.indexOf("DBG_") == -1 &&
                prefName.indexOf("filterSystemURLs") == -1)
            {
                var value = Firebug.getPref(Firebug.prefDomain, prefName);
                if (typeof(value) != 'undefined')
                    this.values[prefName] = value;
            }
        }
    },

    restore: function()
    {
        if (!this.values)
            return;

        for (var prefName in this.values)
        {
            Firebug.setPref(Firebug.prefDomain, prefName, this.values[prefName],
                typeof(this.values[prefName]));
        }

        this.values = [];
    }
};

// ********************************************************************************************* //
// Registration

return FBTestApp.Preferences;

// ********************************************************************************************* //
});
