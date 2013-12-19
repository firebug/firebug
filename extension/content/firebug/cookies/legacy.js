/* See license.txt for terms of usage */

define([
    "firebug/chrome/module",
    "firebug/lib/object",
    "firebug/lib/xpcom",
    "firebug/lib/locale",
    "firebug/chrome/window",
],
function(Module, Obj, Xpcom, Locale, Win) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;

Components.utils.import("resource://gre/modules/AddonManager.jsm");

var prompts = Xpcom.CCSV("@mozilla.org/embedcomp/prompt-service;1", "nsIPromptService");
var app = Xpcom.CCSV("@mozilla.org/toolkit/app-startup;1", "nsIAppStartup");

// ********************************************************************************************* //
// Module

var CookieLegacy = Obj.extend(Module,
{
    initialize: function(prefDomain, prefNames)
    {
        Module.initialize.apply(this, arguments);

        setTimeout(Obj.bind(this.onAlert, this), 1000);
    },

    onAlert: function()
    {
        // Detect whether Firecookie is installed. This extension has been integrated
        // with Firebug and so, should not be installed together with Firebug 1.10+
        if (!Firebug.FireCookieModel)
            return;

        // See https://developer.mozilla.org/en/nsIPromptService#confirmEx%28%29
        // for configuration details.
        var check = {value: false};
        var flags = prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING +
            prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_CANCEL +
            prompts.BUTTON_POS_2 * prompts.BUTTON_TITLE_IS_STRING +
            prompts.BUTTON_POS_0_DEFAULT;

        var index = prompts.confirmEx(null, Locale.$STR("Firebug"),
            Locale.$STR("cookies.legacy.firecookie_detected"), flags,
            Locale.$STR("cookies.legacy.uninstall_and_restart"),
            "",
            Locale.$STR("cookies.legacy.uninstall"), null, check);

        // Bail out if the user presses Cancel.
        if (index == 2)
            return;

        // Let's uninstall, restart will follow if button #0 has been clicked.
        this.uninstallAddon(index == 0);
    },

    uninstallAddon: function(restart)
    {
        AddonManager.getAddonByID("firecookie@janodvarko.cz", function(addon)
        {
            // Uninstall is synchronous.
            addon.uninstall();

            if (restart)
                app.quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
        });
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(CookieLegacy);

return CookieLegacy;

// ********************************************************************************************* //
});

