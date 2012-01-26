/* See license.txt for terms of usage */

define([
    "firebug/chrome/firefox",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/system",
    "firebug/lib/events",
    "firebug/chrome/window",
    "firebug/firebug",
    "firebug/chrome/chrome",
],
function (Firefox, Dom, Css, System, Events, Win, Firebug, Chrome) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

// ********************************************************************************************* //
// First Run Page

/**
 * This object is responsible for displaying a first-run Firebug welcome page.
 * http://getfirebug.com/firstrun#Firebug
 */
Firebug.FirstRunPage =
{
    registerSessionObserver: function()
    {
        // If the version in preferences is smaller than the current version
        // display the welcome page.
        if (System.checkFirebugVersion(Firebug.currentVersion) > 0)
        {
            // Wait for session restore and display the welcome page.
            observerService.addObserver(this, "sessionstore-windows-restored" , false);
        }
    },

    observe: function(subjet, topic, data)
    {
        if (topic != "sessionstore-windows-restored")
            return;

        setTimeout(function()
        {
            // Open the page in the top most window so, the user can see it immediately.
            if (wm.getMostRecentWindow("navigator:browser") != Firebug.chrome.window.top)
                return;

            // Avoid opening of the page in a second browser window.
            if (System.checkFirebugVersion(Firebug.currentVersion) > 0)
            {
                // Don't forget to update the preference so, the page is not displayed again
                var version = Firebug.getVersion();
                Firebug.Options.set("currentVersion", version);

                // xxxHonza: put the URL in firebugURLs as soon as it's in chrome.js
                if (Firebug.Options.get("showFirstRunPage"))
                    Win.openNewTab("http://getfirebug.com/firstrun#Firebug " + version);
            }
        }, 500);
    }
}

// ********************************************************************************************* //

// Register session observer for the top (browser) window to show the first run page
// after Firefox windows are restored.
Firebug.FirstRunPage.registerSessionObserver(top);

return Firebug.FirstRunPage;

// ********************************************************************************************* //
});