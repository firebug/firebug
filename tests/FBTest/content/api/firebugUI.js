/* See license.txt for terms of usage */

/**
 * This file defines Events APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// Firebug UI API

/**
 * Open/close Firebug UI. If forceOpen is true, Firebug is only opened if closed.
 * @param {Boolean} forceOpen Set to true if Firebug should stay opened.
 */
this.pressToggleFirebug = function(forceOpen, target, callback)
{
    var isOpen = this.isFirebugOpen();

    FBTest.sysout("pressToggleFirebug; forceOpen: " + forceOpen + ", is open: " + isOpen);

    // Don't close if it's open and should stay open.
    if (forceOpen && isOpen)
    {
        FBTest.sysout("pressToggleFirebug; bail out");
        callback();
        return;
    }

    FBTest.waitForTabAttach(callback);

    FBTest.sendKey("F12", target);

    this.isFirebugOpen();
};

/**
 * Open Firebug UI. If it's already opened, it stays opened.
 */
this.openFirebug = function(callback)
{
    this.pressToggleFirebug(true, undefined, callback);
};

/**
 * Closes Firebug UI. if the UI is closed, it stays closed.
 */
this.closeFirebug = function()
{
    if (this.isFirebugOpen())
        this.pressToggleFirebug();
};

this.shutdownFirebug = function()
{
    // TODO: deactivate Firebug
};

/**
 * Returns true if Firebug is currently opened; false otherwise.
 */
this.isFirebugOpen = function()
{
    var isOpen = FW.Firebug.chrome.isOpen();
    FBTest.sysout("isFirebugOpen; isOpen: " + isOpen);
    return isOpen;
};

this.getFirebugPlacement = function()
{
    return FW.Firebug.getPlacement();
};

this.isFirebugActive = function()
{
    var suspension = FW.Firebug.getSuspended();
    return (suspension == "suspended") ? false : true;
};

this.setBrowerWindowSize = function(width, height)
{
    var tabbrowser = FBTestFirebug.getBrowser();
    var currTab = tabbrowser.selectedTab;
    currTab.ownerDocument.defaultView.resizeTo(width, height);
}

this.setFirebugBarHeight = function(height)
{
    var mainFrame = FW.Firebug.Firefox.getElementById("fbMainFrame");
    mainFrame.setAttribute("height", height);
};

this.setSidePanelWidth = function(width)
{
    var sidePanelDeck = FW.Firebug.chrome.$("fbSidePanelDeck");
    sidePanelDeck.setAttribute("width", width);
};

// ********************************************************************************************* //

this.isDetached = function()
{
    return FW.Firebug.isDetached();
};

this.isMinimized = function()
{
    return FW.Firebug.isMinimized();
};

this.isInBrowser = function()
{
    return FW.Firebug.isInBrowser();
};

/**
 * Detach Firebug into a new separate window.
 */
this.detachFirebug = function()
{
    if (FW.Firebug.isDetached())
        return null;

    this.openFirebug();
    return FW.Firebug.detachBar(FW.Firebug.currentContext);
};

/**
 * Close detached Firebug window.
 */
this.closeDetachedFirebug = function()
{
    if (!FW.Firebug.isDetached())
        return false;

    // Better would be to look according to the window type, but it's not set in firebug.xul
    var result = FW.FBL.iterateBrowserWindows("", function(win)
    {
        if (win.location.href == "chrome://firebug/content/firebug.xul")
        {
            win.close();
            return true;
        }
    });

    return result;
};

/**
 * Closes Firebug on all tabs
 */
this.closeFirebugOnAllTabs = function()
{
    FBTest.progress("closeFirebugOnAllTabs");

    var tabbrowser = FBTestFirebug.getBrowser();
    for (var i = 0; i < tabbrowser.mTabs.length; i++)
    {
        var tab = tabbrowser.mTabs[i];
        FBTest.sysout("closeFirebugOnAllTabs on tab "+tab);
        tabbrowser.selectedTab = tab;
        this.closeFirebug();
    }
};

// ********************************************************************************************* //
// Toolbar API

this.clickToolbarButton = function(chrome, buttonID)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var doc = chrome.window.document;
    var button = doc.getElementById(buttonID);
    FBTest.sysout("Click toolbar button " + buttonID, button);

    // Do not use FBTest.click, toolbar buttons need to use sendMouseEvent.
    // Do not use synthesizeMouse, if the button isn't visible coordinates are wrong
    // and the click event is not fired.
    //this.synthesizeMouse(button);
    button.doCommand();
};

// ********************************************************************************************* //
// xxxHonza: TODO this section needs to be revisited

this.listenerCleanups = [];
this.cleanUpListeners = function()
{
    var c = FBTestFirebug.listenerCleanups;
    FBTest.sysout("ccccccccccccccccccccccccc cleaning listeners ccccccccccccccccccccccccccccccc");
    while(c.length)
        c.shift().call();
};

this.UntilHandler = function(eventTarget, eventName, isMyEvent, onEvent, capturing)
{
    var removed = false;
    function fn (event)
    {
        if (isMyEvent(event))
        {
            eventTarget.removeEventListener(eventName, fn, capturing);
            removed = true;
            FBTest.sysout("UntilHandler activated for event "+eventName);
            onEvent(event);
        }
        else
        {
            FBTest.sysout("UntilHandler skipping event "+eventName, event);
        }
    }
    eventTarget.addEventListener(eventName, fn, capturing);

    FBTestFirebug.listenerCleanups.push( function cleanUpListener()
    {
        if (!removed)
            eventTarget.removeEventListener(eventName, fn, capturing);
    });
};

this.OneShotHandler = function(eventTarget, eventName, onEvent, capturing)
{
    function isTrue(event) {return true;}
    FBTestFirebug.UntilHandler(eventTarget, eventName, isTrue, onEvent, capturing);
};

// ********************************************************************************************* //

this.waitForTabAttach = function(callback)
{
    if (!callback)
    {
        FBTest.sysout("waitForTabAttach; ERROR no callback!");
        return;
    }

    // The tab might be already attached (e.g. if the page is just reloaded).
    // Execute the callback directly in such case.
    var browser = FBTestFirebug.getCurrentTabBrowser();
    var attached = FW.Firebug.DebuggerClient.isTabAttached(browser);
    if (attached)
    {
        callback();
    }

    var listener =
    {
        onTabAttached: function()
        {
            FBTest.sysout("waitForTabAttach; On tab attached");

            DebuggerController.removeListener(browser, listener);

            callback();
        }
    };

    DebuggerController.addListener(browser, listener);
}

// ********************************************************************************************* //
}).apply(FBTest);
