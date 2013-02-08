/* See license.txt for terms of usage */

define([
    "fbtrace/trace"
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu["import"]("resource://gre/modules/Services.jsm");

var stringBundleService = Services.strings;

var categoryManager = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);

// ********************************************************************************************* //
// Module

var Locale = {};

Locale.$STR = function(name, bundle)
{
    var strKey = name.replace(" ", "_", "g");

    try
    {
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

Locale.registerStringBundle = function(bundleURI)
{
    // Notice that this category entry must not be persistent in Fx 4.0
    categoryManager.addCategoryEntry("strings_fbtrace", bundleURI, "", false, true);
    this.defaultStringBundle = null;
};

Locale.internationalize = function(element, attr)
{
    if (element)
    {
        var xulString = element.getAttribute(attr);
        if (xulString)
        {
            var localized = Locale.$STR(xulString);
            // Set localized value of the attribute only if it exists.
            if (localized)
                element.setAttribute(attr, localized);
        }
    }
    else
    {
        if (FBTrace.DBG_LOCALE)
            FBTrace.sysout("Failed to internationalize element with attr "+attr+" args:"+args);
    }
};

// ********************************************************************************************* //

return Locale;

// ********************************************************************************************* //
});
