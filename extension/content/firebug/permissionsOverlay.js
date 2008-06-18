/* See license.txt for terms of usage */

var firebugPermissionsOverlay = {};

(function() { with (XPCOMUtils) {

// ************************************************************************************************
// Constants

const localeService = CCSV("@mozilla.org/intl/nslocaleservice;1", "nsILocaleService");
const bundleService = CCSV("@mozilla.org/intl/stringbundle;1", "nsIStringBundleService");
const appLocale = localeService.getApplicationLocale();
const stringBundle = bundleService.createBundle("chrome://firebug/locale/firebug.properties", appLocale);

// ************************************************************************************************
// Implementation

this.onLoad = function()
{
    // Change buttons labels
    document.getElementById("btnBlock").label = this.getString("panel.Disable");
    document.getElementById("btnAllow").label = this.getString("panel.Enable");
};

this.getCapabilityString = function(aCapability)
{
    if (FBTrace.DBG_PANELS)
        FBTrace.sysout("permissions.getCapabilityString(" + aCapability + ")");

    // This method is called within scope of the original gPermissionManager.
    var self = firebugPermissionsOverlay;

    var stringKey = null;
    switch (aCapability) 
    {
        case nsIPermissionManager.ALLOW_ACTION:
          stringKey = "panel.Enabled";
          break;

        case nsIPermissionManager.DENY_ACTION:
          stringKey = "panel.Disabled";
          break;

        default:
            return self._getCapabilityString.call(gPermissionManager, aCapability);
    }

    return self.getString(stringKey);
};

this.getString = function(stringName)
{
    return stringBundle.GetStringFromName(stringName);
};

// ************************************************************************************************

}}).apply(firebugPermissionsOverlay);

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

/**
 * Provide custom string for permission status. 
 * (Allow|Block) -> (Enabled|Disabled)
 */
firebugPermissionsOverlay._getCapabilityString = gPermissionManager._getCapabilityString;
gPermissionManager._getCapabilityString = firebugPermissionsOverlay.getCapabilityString;

/**
 * Register event handler in order to control overlay's life cycle.
 */
window.addEventListener("load", function() {
    firebugPermissionsOverlay.onLoad();
}, false);

