/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const DEFAULT_LOCALE = "en-US";

var EXPORTED_SYMBOLS = [];

// ********************************************************************************************* //
// Services

Cu.import("resource://firebug/fbtrace.js");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://firebug/prefLoader.js");
Cu.import("resource://gre/modules/PluralForm.jsm");

// ********************************************************************************************* //
// Firebug UI Localization

var stringBundleService = Services.strings;
var categoryManager = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);

// This module
var Locale = {};

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
    // The empty string localizes to the empty string.
    if (!name)
        return "";

    var strKey = name.replace(" ", "_", "g");

    if (!PrefLoader.getPref("useDefaultLocale"))
    {
        try
        {
            if (bundle)
                return validate(bundle.getString(strKey));
            else
                return validate(Locale.getStringBundle().GetStringFromName(strKey));
        }
        catch (err)
        {
            if (FBTrace.DBG_LOCALE)
                FBTrace.sysout("Locale.$STR FAILS, missing localized string for '" + name + "'", err);
        }
    }

    try
    {
        // The en-US string should be always available.
        var defaultBundle = Locale.getDefaultStringBundle();
        if (defaultBundle)
            return validate(defaultBundle.GetStringFromName(strKey));
    }
    catch (err)
    {
        if (FBTrace.DBG_LOCALE || FBTrace.DBG_ERRORS)
            FBTrace.sysout("Locale.$STR FAILS, missing default string for '" + name + "'", err);
    }

    // Don't panic now and use only the label after last dot.
    var index = name.lastIndexOf(".");
    if (index > 0 && name.charAt(index-1) != "\\")
        name = name.substr(index + 1);
    name = name.replace("_", " ", "g");

    return name;
};

Locale.$STRF = function(name, args, bundle)
{
    var strKey = name.replace(" ", "_", "g");

    if (!PrefLoader.getPref("useDefaultLocale"))
    {
        try
        {
            if (bundle)
                return validate(bundle.getFormattedString(strKey, args));
            else
                return validate(Locale.getStringBundle().formatStringFromName(strKey, args, args.length));
        }
        catch (err)
        {
            if (FBTrace.DBG_LOCALE)
                FBTrace.sysout("Locale.$STRF FAILS, missing localized string for '" + name + "'", err);
        }
    }

    try
    {
        // The en-US string should be always available.
        var defaultBundle = Locale.getDefaultStringBundle();
        if (defaultBundle)
            return validate(defaultBundle.formatStringFromName(strKey, args, args.length));
    }
    catch (err)
    {
        if (FBTrace.DBG_LOCALE || FBTrace.DBG_ERRORS)
            FBTrace.sysout("Locale.$STRF FAILS, missing default string for '" + name + "'", err);
    }

    // Don't panic now and use only the label after last dot.
    var index = name.lastIndexOf(".");
    if (index > 0)
        name = name.substr(index + 1);

    return name;
};

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
        return validate(getPluralForm(args[index], translatedString));

    // translatedString contains no ";", either rule 0 or getString fails
    return validate(translatedString);
};

/*
 * Use the current value of the attribute as a key to look up the localized value.
 */
Locale.internationalize = function(element, attr, args)
{
    if (element)
    {
        var xulString = element.getAttribute(attr);
        if (xulString)
        {
            var localized = args ? Locale.$STRF(xulString, args) : Locale.$STR(xulString);
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

Locale.internationalizeElements = function(doc, elements, attributes)
{
    for (var i=0; i<elements.length; i++)
    {
        var element = elements[i];

        if (typeof(elements) == "string")
            element = doc.getElementById(elements[i]);

        if (!element)
            continue;

        // Remove fbInternational class, so that the label is not translated again later.
        element.classList.remove("fbInternational");

        for (var j=0; j<attributes.length; j++)
        {
            if (element.hasAttribute(attributes[j]))
                Locale.internationalize(element, attributes[j]);
        }
    }
};

Locale.registerStringBundle = function(bundleURI)
{
    // Notice that this category entry must not be persistent in Fx 4.0
    categoryManager.addCategoryEntry("strings_firebug", bundleURI, "", false, true);
    this.stringBundle = null;

    bundleURI = getDefaultStringBundleURI(bundleURI);
    categoryManager.addCategoryEntry("default_strings_firebug", bundleURI, "", false, true);
    this.defaultStringBundle = null;
};

Locale.getStringBundle = function()
{
    if (!this.stringBundle)
        this.stringBundle = stringBundleService.createExtensibleBundle("strings_firebug");
    return this.stringBundle;
};

Locale.getDefaultStringBundle = function()
{
    if (!this.defaultStringBundle)
        this.defaultStringBundle = stringBundleService.createExtensibleBundle("default_strings_firebug");
    return this.defaultStringBundle;
};

Locale.getPluralRule = function()
{
    try
    {
        return this.getStringBundle().GetStringFromName("pluralRule");
    }
    catch (err)
    {
    }
};

Locale.getFormattedKey = function(win, modifiers, key, keyConstant)
{
    platformKeys = {};
    platformKeys.shift = Locale.$STR("VK_SHIFT");
    platformKeys.meta = Locale.$STR("VK_META");
    platformKeys.alt = Locale.$STR("VK_ALT");
    platformKeys.ctrl = Locale.$STR("VK_CONTROL");
    platformKeys.sep = Locale.$STR("MODIFIER_SEPARATOR");

    switch (Services.prefs.getIntPref("ui.key.accelKey"))
    {
        case win.KeyEvent.DOM_VK_CONTROL:
            platformKeys.accel = platformKeys.ctrl;
            break;
        case win.KeyEvent.DOM_VK_ALT:
            platformKeys.accel = platformKeys.alt;
            break;
        case win.KeyEvent.DOM_VK_META:
            platformKeys.accel = platformKeys.meta;
            break;

        default:
            platformKeys.accel = (win.navigator.platform.search("Mac") != -1 ? platformKeys.meta :
                platformKeys.ctrl);
    }

    if ((modifiers == "shift,alt,control,accel" && keyConstant == "VK_SCROLL_LOCK") ||
        (key == "" || (!key && keyConstant == "")))
    {
        return "";
    }

    var val = "";
    if (modifiers)
    {
        val = modifiers.replace(/^[\s,]+|[\s,]+$/g, "").split(/[\s,]+/g).join(platformKeys.sep).
            replace("alt", platformKeys.alt).replace("shift", platformKeys.shift).
            replace("control", platformKeys.ctrl).replace("meta", platformKeys.meta).
            replace("accel", platformKeys.accel) +
            platformKeys.sep;
    }

    if (key)
        return val += key;

    if (keyConstant)
    {
        var localizedKey = Locale.$STR(keyConstant);

        // Create human friendly alternative ourself, if there is no translation
        // for the key constant
        if (localizedKey.lastIndexOf("VK ", 0) === 0)
            localizedKey = capitalize(localizedKey.replace("VK ", ""), true);

        val += localizedKey;
    }
    return val;
}

// ********************************************************************************************* //
// Helpers

// Replace forbidden characters(see bug 6630)
function validate(str)
{
    return String(str).replace(/"/g, '\'');
}

// This module needs to be independent of any other modules, so this is mainly a copy of
// Str.capitalize().
function capitalize(string)
{
    function capitalizeFirstLetter(string)
    {
        var rest = string.slice(1).toLowerCase();
        return string.charAt(0).toUpperCase() + rest;
    }

    return string.split(" ").map(capitalizeFirstLetter).join(" ");
}

function getDefaultStringBundleURI(bundleURI)
{
    var chromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].
        getService(Ci.nsIChromeRegistry);

    var uri = Services.io.newURI(bundleURI, "UTF-8", null);
    var fileURI = chromeRegistry.convertChromeURL(uri).spec;
    var parts = fileURI.split("/");
    parts[parts.length - 2] = DEFAULT_LOCALE;

    return parts.join("/");
}

// ********************************************************************************************* //
