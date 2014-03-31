/* See license.txt for terms of usage */

// ********************************************************************************************* //

/**
 * This overlay is intended to append a new menu-item into the Firebug's icon menu.
 * This menu is used to open the Test Console (test runner window).
 */
var FBTestFirebugOverlay = {};
top.FBTestFirebugOverlay = FBTestFirebugOverlay;

(function() {

// ********************************************************************************************* //

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var cmdLineHandler = Cc["@mozilla.org/commandlinehandler/general-startup;1?type=FBTest"].
    getService(Ci.nsICommandLineHandler);

var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

// Make sure PrefLoader variable doesn't leak into the global scope.
var prefLoaderScope = {};
Cu.import("resource://firebug/prefLoader.js", prefLoaderScope);
var PrefLoader = prefLoaderScope.PrefLoader;
var getPref = PrefLoader.getPref;

Cu.import("resource://firebug/fbtrace.js");

var Locale = Cu.import("resource://firebug/locale.js").Locale;
Locale.registerStringBundle("chrome://fbtest/locale/fbtest.properties");

// ********************************************************************************************* //

this.onLoad = function()
{
    if (FBTrace.DBG_FBTEST)
        FBTrace.sysout("FBTest.overlayFirebug.onLoad; scope: " + window.location);

    window.removeEventListener("load", FBTestFirebugOverlay.onLoad, false);

    // Customization of Firebug's menu.
    var handler = FBTestFirebugOverlay.onFirebugMenuShowing.bind(FBTestFirebugOverlay);
    document.addEventListener("firebugMenuShowing", handler, false);

    if (FBTrace.DBG_FBTEST)
        FBTrace.sysout("FBTest.overlayFirebug.initialize; scope: " + window.location);

    // abandon ship if we are loaded by chromebug
    var winURL = window.location.toString();
    if (winURL == "chrome://chromebug/content/chromebug.xul")
        return;

    try
    {
        // Open console if the command line says so or if the pref says so.
        var cmd = cmdLineHandler.wrappedJSObject;
        if (cmd.runFBTests)
            FBTestFirebugOverlay.open(cmd.testListURI, cmd.quitAfterRun);
        else if (getPref("alwaysOpenTestConsole"))
            FBTestFirebugOverlay.open();
    }
    catch (e)
    {
        // xxxHonza: Firebug not initialized yet? (note that modules are loaded asynchronously)
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("fbtest.overlayFirebug.initialize; EXCEPTION " + e, e);
    }
};

this.onFirebugMenuShowing = function(event)
{
    if (!Firebug.BrowserOverlayLib)
        return;

    var parent = event.detail;
    var doc = parent.ownerDocument;

    // Extend Firebug menu
    with (Firebug.BrowserOverlayLib)
    {
        // Open Test Console
        $menupopupOverlay(doc, parent, [
            $menuseparator(doc, {
                insertbefore: "menu_firebug_aboutSeparator",
            }),
            $menuitem(doc, {
                id: "menu_openTestConsole",
                label: "fbtest.Open_Test_Console",
                command: "cmd_openTestConsole",
                insertbefore: "menu_firebug_aboutSeparator",
                key: "key_openTestConsole"
            })
        ]);

        // Always Open Test Console (option)
        var optionsPopup = parent.querySelector("#FirebugMenu_OptionsPopup");
        $menupopupOverlay(doc, optionsPopup, [
            $menuitem(doc, {
                id: "FirebugMenu_Options_alwaysOpenTestConsole",
                type: "checkbox",
                label: "fbtest.Always_Open_Test_Console",
                oncommand: "FBTestFirebugOverlay.onToggleOption(this)",
                insertbefore: "menu_firebug_optionsSeparator",
                option: "alwaysOpenTestConsole"
            })
        ]);
    }
};

this.onToggleOption = function(target)
{
    var self = this;
    window.Firebug.browserOverlay.startFirebug(function()
    {
        Firebug.chrome.onToggleOption(target);

        // Open automatically if set to "always open", close otherwise.
        if (Firebug.getPref(Firebug.prefDomain, "alwaysOpenTestConsole"))
            this.open();
        else
            this.close();
    });
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

this.open = function(testListURI, quitAfterRun)
{
    var consoleWindow = null;
    this.iterateBrowserWindows("FBTestConsole", function(win) {
        consoleWindow = win;
        return true;
    });

    // Load Firebug
    var self = this;
    window.Firebug.browserOverlay.startFirebug(function()
    {
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
            testListURI: testListURI,
            quitAfterRun: quitAfterRun
        };

        // Try to connect an existing test-console window first.
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
    });
};

this.iterateBrowserWindows = function(windowType, callback)
{
    var windowList = wm.getZOrderDOMWindowEnumerator(windowType, true);
    if (!windowList.hasMoreElements())
        windowList = wm.getEnumerator(windowType);

    while (windowList.hasMoreElements())
    {
        if (callback(windowList.getNext()))
            return true;
    }

    return false;
};


this.onSelectionChanged = function()
{
    try
    {
        // FBL is not defined in browser.xul
        if (typeof(FBL) == "undefined")
            return;

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

// ********************************************************************************************* //

// Register load listener for command line arguments handling.
window.addEventListener("load", FBTestFirebugOverlay.onLoad, false);

// ********************************************************************************************* //

}).apply(FBTestFirebugOverlay);

// ********************************************************************************************* //
