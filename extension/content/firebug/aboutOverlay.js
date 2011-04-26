/* See license.txt for terms of usage */

(function() {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
var ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

Components.utils["import"]("resource://firebug/firebug-trace-service.js");
var FBTrace = traceConsoleService.getTracer("extensions.firebug");

// ************************************************************************************************
// Overlay

var uri = ios.newURI("chrome://firebug/skin/about.css", null, null);

var FirebugAboutOverlay =
{
    onLoad: function()
    {
        try
        {
            var extension = window.arguments[0];
            if (extension == "urn:mozilla:item:firebug@software.joehewitt.com" ||
                extension.id && extension.id == "firebug@software.joehewitt.com")
            {
                sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
            }

            if (FBTrace.DBG_WINDOWS)
                FBTrace.sysout("FirebugAboutOverlay.onLoad; ", extension);
        }
        catch (e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("FirebugAboutOverlay.onLoad; EXCEPTION " + e, e);
        }
    },

    onUnload: function()
    {
        if (sss.sheetRegistered(uri, sss.USER_SHEET))
            sss.unregisterSheet(uri, sss.USER_SHEET);

        window.removeEventListener("load", FirebugAboutOverlay.onLoad, false);
        window.removeEventListener("unload", FirebugAboutOverlay.onUnload, false);
    }
};

// ************************************************************************************************
// Registration

window.addEventListener("load", FirebugAboutOverlay.onLoad, false);
window.addEventListener("unload", FirebugAboutOverlay.onUnload, false);

// ************************************************************************************************
})();
