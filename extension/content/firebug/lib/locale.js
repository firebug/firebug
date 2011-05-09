/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/options",
],
function(FBTrace, Options) {

// ********************************************************************************************* //
// Globals

var Ci = Components.interfaces;
var Cc = Components.classes;

// Import of PluralForm object.
Components.utils["import"]("resource://gre/modules/PluralForm.jsm");

var stringBundleService = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
var categoryManager = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);

// This module
var Locale = {};

// ********************************************************************************************* //
// Localization

/*
 * $STR - intended for localization of a static string.
 * $STRF - intended for localization of a string with dynamically inserted values.
 * $STRP - intended for localization of a string with dynamically plural forms.
 *
 * Notes:
 * 1) Name with _ in place of spaces is the key in the firebug.properties file.
 * 2) If the specified key isn't localized for particular language, both methods use
 *    the part after the last dot (in the specified name) as the return value.
 *
 * Examples:
 * $STR("Label"); - search for key "Label" within the firebug.properties file
 *                 and returns its value. If the key doesn't exist returns "Label".
 *
 * $STR("Button Label"); - search for key "Button_Label" withing the firebug.properties
 *                        file. If the key doesn't exist returns "Button Label".
 *
 * $STR("net.Response Header"); - search for key "net.Response_Header". If the key doesn't
 *                               exist returns "Response Header".
 *
 * firebug.properties:
 * net.timing.Request_Time=Request Time: %S [%S]
 *
 * var param1 = 10;
 * var param2 = "ms";
 * $STRF("net.timing.Request Time", param1, param2);  -> "Request Time: 10 [ms]"
 *
 * - search for key "net.timing.Request_Time" within the firebug.properties file. Parameters
 *   are inserted at specified places (%S) in the same order as they are passed. If the
 *   key doesn't exist the method returns "Request Time".
 */
Locale.$STR = function(name, bundle)
{
    var strKey = name.replace(' ', '_', "g");

    if (!Options.get("useDefaultLocale"))
    {
        try
        {
            if (typeof bundle == "string")
                bundle = document.getElementById(bundle);

            if (bundle)
                return bundle.getString(strKey);
            else
                return Locale.getStringBundle().GetStringFromName(strKey);
        }
        catch (err)
        {
            if (FBTrace.DBG_LOCALE)
                FBTrace.sysout("lib.getString FAILS '" + name + "'", err);
        }
    }

    try
    {
        // The en-US string should be always available.
        var bundle = Locale.getDefaultStringBundle();
        if (bundle)
            return bundle.GetStringFromName(strKey);
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
}

Locale.$STRF = function(name, args, bundle)
{
    var strKey = name.replace(' ', '_', "g");

    if (!Options.get("useDefaultLocale"))
    {
        try
        {
            // xxxHonza: Workaround for #485511
            if (!bundle)
                bundle = "strings_firebug";

            if (typeof bundle == "string")
                bundle = document.getElementById(bundle);

            if (bundle)
                return bundle.getFormattedString(strKey, args);
            else
                return Locale.getStringBundle().formatStringFromName(strKey, args, args.length);
        }
        catch (err)
        {
            if (FBTrace.DBG_LOCALE)
                FBTrace.sysout("lib.getString FAILS '" + name + "'", err);
        }
    }

    try
    {
        // The en-US string should be always available.
        var bundle = Locale.getDefaultStringBundle();
        if (bundle)
            return bundle.formatStringFromName(strKey, args, args.length);
    }
    catch (err)
    {
        if (FBTrace.DBG_LOCALE)
            FBTrace.sysout("lib.getString (default) FAILS '" + name + "'", err);
    }

    // Don't panic now and use only the label after last dot.
    var index = name.lastIndexOf(".");
    if (index > 0)
        name = name.substr(index + 1);

    return name;
}

Locale.$STRP = function(name, args, index, bundle)
{
    // xxxHonza:
    // pluralRule from chrome://global/locale/intl.properties for Chinese is 1,
    // which is wrong, it should be 0.

    var getPluralForm = PluralForm.get;
    var getNumForms = PluralForm.numForms;

    // Get custom plural rule; otherwise the rule from chrome://global/locale/intl.properties
    // (depends on the current locale) is used.
    var pluralRule = Locale.getPluralRule();
    if (!isNaN(parseInt(pluralRule, 10)))
        [getPluralForm, getNumForms] = PluralForm.makeGetter(pluralRule);

    // Index of the argument with plural form (there must be only one arg that needs plural form).
    if (!index)
        index = 0;

    // Get proper plural form from the string (depends on the current Firefox locale).
    var translatedString = Locale.$STRF(name, args, bundle);
    if (translatedString.search(";") > 0)
        return getPluralForm(args[index], translatedString);

    // translatedString contains no ";", either rule 0 or getString fails
    return translatedString;
}

/*
 * Use the current value of the attribute as a key to look up the localized value.
 */
Locale.internationalize = function(element, attr, args)
{
    if (typeof element == "string")
        element = document.getElementById(element);

    if (element)
    {
        var xulString = element.getAttribute(attr);
        if (xulString)
        {
            var localized = args ? Locale.$STRF(xulString, args) : Locale.$STR(xulString);

            // Set localized value of the attribute.
            element.setAttribute(attr, localized);
        }
    }
    else
    {
        if (FBTrace.DBG_LOCALE)
            FBTrace.sysout("Failed to internationalize element with attr "+attr+' args:'+args);
    }
}

Locale.internationalizeElements = function(doc, elements, attributes)
{
    for (var i=0; i<elements.length; i++)
    {
        var element = doc.getElementById(elements[i]);
        if (!element)
            continue;

        for (var j=0; j<attributes.length; j++)
        {
            if (element.hasAttribute(attributes[j]))
                Locale.internationalize(element, attributes[j]);
        }
    }
}

Locale.registerStringBundle = function(bundleURI)
{
    // Notice that this category entry must not be persistent in Fx 4.0
    categoryManager.addCategoryEntry("strings_firebug", bundleURI, "", false, true);
    this.stringBundle = null;
}

Locale.getStringBundle = function()
{
    if (!this.stringBundle)
        this.stringBundle = stringBundleService.createExtensibleBundle("strings_firebug");
    return this.stringBundle;
}

Locale.getDefaultStringBundle = function()
{
    if (!this.defaultStringBundle)
    {
        var bundle = document.getElementById("strings_firebug");
        if (!bundle)
            return null;

        var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
        var chromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].
            getService(Ci.nsIChromeRegistry);

        var uri = ioService.newURI(bundle.src, "UTF-8", null);
        var fileURI = chromeRegistry.convertChromeURL(uri).spec;
        var parts = fileURI.split("/");
        parts[parts.length - 2] = "en-US";
        this.defaultStringBundle = stringBundleService.createBundle(parts.join("/"));
    }
    return this.defaultStringBundle;
}

Locale.getPluralRule = function()
{
    try
    {
        return this.getStringBundle().GetStringFromName("pluralRule");
    }
    catch (err)
    {
    }
}

// ********************************************************************************************* //

return Locale;

// ********************************************************************************************* //
});
