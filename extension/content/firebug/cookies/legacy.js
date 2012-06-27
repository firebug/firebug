/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/xpcom",
    "firebug/lib/locale",
    "firebug/chrome/window",
],
function(Obj, Xpcom, Locale, Win) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

Components.utils.import("resource://gre/modules/AddonManager.jsm");

var prompts = Xpcom.CCSV("@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");
var app = Xpcom.CCSV("@mozilla.org/toolkit/app-startup;1", "nsIAppStartup");

// ********************************************************************************************* //
// Module

var CookieLegacy = Obj.extend(Firebug.Module,
{
    initialize: function(prefDomain, prefNames)
    {
        Firebug.Module.initialize.apply(this, arguments);

        setTimeout(Obj.bind(this.onAlert, this), 1000);
    },

    onAlert: function()
    {
        // Detect whether Firecookie is installed. This extension has been integrated
        // with Firebug and so, should not be installed together with Firebug 1.10+
        if (Firebug.FireCookieModel)
        {
            if (prompts.confirm(null, Locale.$STR("Firebug"),
                Locale.$STR("cookies.legacy.firecookie_detected")))
            {
                this.uninstallAddon();
            }
        }
    },

    uninstallAddon: function()
    {
        AddonManager.getAddonByID("firecookie@janodvarko.cz", function(addon)
        {
            addon.uninstall();

            if (prompts.confirm(null, Locale.$STR("Firebug"),
                Locale.$STR("cookies.legacy.restart_firefox")))
            {
                app.quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
            }
        });
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(CookieLegacy);

return CookieLegacy;

// ********************************************************************************************* //
});

