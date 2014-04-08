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
 * The method is asynchronous since it involves attaching to the backend that happens
 * over RDP.
 *
 * @param {Boolean} forceOpen Set to true if Firebug should stay opened.
 * @param {Object} target The target window for keyboard event
 * @param {Function} callback Executed when Firebug is connected to the backend
 * (attached to the current browser tab)
 */
this.pressToggleFirebug = function(forceOpen, target, callback)
{
    var open = this.isFirebugOpen();
    var attached = this.isFirebugAttached();

    FBTest.sysout("pressToggleFirebug; forceOpen: " + forceOpen + ", is open: " + open +
        ", is attached: " + attached);

    // Don't close if it's open and should stay open.
    if (forceOpen && open)
    {
        if (attached)
        {
            callback();
            return;
        }
    }
    else
    {
        // Toggle visibility
        FBTest.sendKey("F12", target);
    }

    FBTest.waitForTabAttach(callback);
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
 * Returns true if Firebug UI is currently opened; false otherwise. This method doesn't
 * check if Firebug is connected to the backend. Use 'isFirebugAttached' instead if
 * it's what you need. Firebug connects to the back end immediately after opening for
 * the first time, but it happens asynchronously.
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

this.setBrowserWindowSize = function(width, height)
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
this.detachFirebug = function(callback)
{
    if (FW.Firebug.isDetached())
    {
        callback(null);
        return;
    }

    this.openFirebug(function() {
        callback(FW.Firebug.detachBar(FW.Firebug.currentContext));
    });
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
// Backend

/**
 * Returns true if Firebug is attached to the backend tab actor. This process starts
 * immediately after Firebug UI is opened and {@link TabContext} instance created for
 * the current page. The attach process is asynchronous (happens over RDP).
 */
this.isFirebugAttached = function()
{
    var browser = FBTest.getCurrentTabBrowser();
    return FW.Firebug.DebuggerClient.isTabAttached(browser);
}

this.waitForTabAttach = function(callback)
{
    if (!callback)
    {
        FBTest.sysout("waitForTabAttach; ERROR no callback!");
        return;
    }

    // xxxHonza: I have seen this once.
    if (typeof callback != "function")
    {
        FBTest.sysout("waitForTabAttach; ERROR callback is not a function!");
        return;
    }

    // If Firebug is already attached to a tab execute the callback directly and bail out.
    if (FBTest.isFirebugAttached())
    {
        callback();
        return;
    }

    var browser = FBTestFirebug.getCurrentTabBrowser();

    var listener =
    {
        onTabAttached: function()
        {
            //xxxHonza: what if an existing tab is attached and not the test one?
            FBTest.sysout("waitForTabAttach; On tab attached");

            DebuggerController.removeListener(browser, listener);

            callback();
        }
    };

    DebuggerController.addListener(browser, listener);
}

// ********************************************************************************************* //
}).apply(FBTest);
