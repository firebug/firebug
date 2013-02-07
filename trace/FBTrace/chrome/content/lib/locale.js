/* See license.txt for terms of usage */

define([], function() {

// ********************************************************************************************* //
// Module

var Locale = {};

Locale.$STR = function(name, bundle)
{
    var strKey = name.replace(" ", "_", "g");

    try
    {
        // The en-US string should be always available.
        var defaultBundle = Locale.getDefaultStringBundle();
        if (defaultBundle)
            return defaultBundle.GetStringFromName(strKey);
    }
    catch (err)
    {
        if (FBTrace.DBG_LOCALE)
            FBTrace.sysout("lib.getString (default) FAILS '" + name + "'", err);
    }

    // Don't panic now and use only the label after last dot.
    var index = name.lastIndexOf(".");
    if (index > 0 && name.charAt(index-1) != "\\")
        name = name.substr(index + 1);
    name = name.replace("_", " ", "g");
    return name;
};

Locale.getDefaultStringBundle = function()
{
    if (!this.defaultStringBundle)
        this.defaultStringBundle = stringBundleService.createExtensibleBundle("strings_fbtrace");
    return this.defaultStringBundle;
};

// ********************************************************************************************* //

return Locale;

// ********************************************************************************************* //
});
