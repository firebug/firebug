/* See license.txt for terms of usage */

/**
 * This file defines Console Panel APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Console Toolbar

/**
 * Simulates click on the Persist button that is available in the Script and Net panels.
 * Having this button pressed causes persistence of the appropriate panel content across reloads.
 * @param {Object} chrome Firebug.chrome object.
 */
this.clickPersistButton = function(chrome)
{
    this.clickToolbarButton(chrome, "fbConsolePersist");
};

this.clearConsole = function(chrome)
{
    this.clickToolbarButton(chrome, "fbConsoleClear");
};

// ********************************************************************************************* //
// Console preview

/**
 *
 */
this.clickConsolePreviewButton = function(chrome)
{
    this.clickToolbarButton(chrome, "fbCommandPopupButton");
};

this.isConsolePreviewVisible = function()
{
    return FW.Firebug.CommandLine.Popup.isVisible();
};

// ********************************************************************************************* //
}).apply(FBTest);
