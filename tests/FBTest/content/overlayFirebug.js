/* See license.txt for terms of usage */

// ************************************************************************************************
// Test Console Overlay Implementation

/**
 * This overlay is intended to append a new menu-item into the Firebug's icon menu.
 * This menu is used to open the Test Console (test runner window).
 */
var FBTestFirebugOverlay = {};

(function() {

var Cc = Components.classes;
var Ci = Components.interfaces;

var cmdLineHandler = Cc["@mozilla.org/commandlinehandler/general-startup;1?type=FBTest"].getService(Ci.nsICommandLineHandler);

this.initialize = function()
{
    if (FBTrace.DBG_FBTEST)
        FBTrace.sysout("FBTest.overlayFirebug.initialize; scope: " + window.location);

    window.removeEventListener("FirebugLoaded", FBTestFirebugOverlay.initialize, false);

    // abandon ship if we are loaded by chromebug
    var winURL = window.location.toString();
    if (winURL == "chrome://chromebug/content/chromebug.xul")
        return;

    try
    {
        // Open console if the command line says so or if the pref says so.
        var cmd = cmdLineHandler.wrappedJSObject;
        if (cmd.runFBTests)
            FBTestFirebugOverlay.open(cmd.testListURI);
        else if (Firebug.getPref(Firebug.prefDomain, "alwaysOpenTestConsole"))
            FBTestFirebugOverlay.open();
    }
    catch (e)
    {
        // xxxHonza: Firebug not initialized yet? (note that modules are loaded asynchronously)
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("fbtest.overlayFirebug.initialize; EXCEPTION " + e, e);
    }
};

this.onToggleOption = function(target)
{
    Firebug.chrome.onToggleOption(target);

    // Open automatically if set to "always open", close otherwise.
    if (Firebug.getPref(Firebug.prefDomain, "alwaysOpenTestConsole"))
        this.open();
    else
        this.close();
};

this.close = function()
{
    var consoleWindow = null;
    FBL.iterateBrowserWindows("FBTestConsole", function(win) {
        consoleWindow = win;
        return true;
    });

    if (consoleWindow)
        consoleWindow.close();
};

this.open = function(testListURI)
{
    var consoleWindow = null;
    FBL.iterateBrowserWindows("FBTestConsole", function(win) {
        consoleWindow = win;
        return true;
    });

    // Get the right firebug window. It can be browser.xul or fbMainFrame <iframe>
    var firebugWindow;
    if (typeof(window.require) !== "undefined")
    {
        firebugWindow = window;
    }
    else
    {
        var fbMainFrame = window.document.getElementById("fbMainContainer");
        firebugWindow = fbMainFrame.contentWindow;
    }

    if (!firebugWindow)
    {
        FBTrace.sysout("FBTest.open; Failed to get Firebug window!");
        return;
    }

    var args = {
        firebugWindow: firebugWindow,
        testListURI: testListURI
    };

    // Try to connect an existing trace-console window first.
    if (consoleWindow)
    {
        if ("initWithParams" in consoleWindow)
            consoleWindow.initWithParams(args);
        consoleWindow.focus();
        return;
    }

    consoleWindow = window.openDialog(
        "chrome://fbtest/content/testConsole.xul",
        "FBTestConsole",
        "chrome,resizable,scrollbars=auto,minimizable,dialog=no",
        args);

    if (FBTrace.DBG_FBTEST)
        FBTrace.sysout("fbtest.TestConsoleOverlay.open on FirebugWindow: " +
            window.location);
};

this.onSelectionChanged = function()
{
    try
    {
        if (!FBL.iterateBrowserWindows)
            return;

        FBL.iterateBrowserWindows("FBTestConsole", function(win)
        {
            if (win.FBTestApp)
                win.FBTestApp.SelectionController.selectionChanged();
            return true;
        });
    }
    catch (err)
    {
        if (FBTrace.DBG_FBTEST || FBTrace.DBG_ERRORS)
            FBTrace.sysout("fbtest.FBTestFirebugOverlay; onSelectionChanged", err);
    }
};

// Register load listener for command line arguments handling.
window.addEventListener("FirebugLoaded", FBTestFirebugOverlay.initialize, false);

}).apply(FBTestFirebugOverlay);

// ************************************************************************************************
