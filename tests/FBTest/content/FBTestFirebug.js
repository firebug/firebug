/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Test APIs

/**
 * This file defines all APIs for test driver. The FBTest object is injected
 * into this scope by the Firebug test harness.
 */

// Namespace for Test APIs
/** @namespace @name FBTest */

( /** @scope _FBTestFirebug_ @this FBTest */ function() {

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu["import"]("resource://fbtest/EventUtils.js");

// ********************************************************************************************* //
// Constants

var winWatcher = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);

// Must be synchronized with nsICompositionStringSynthesizer.
const COMPOSITION_ATTR_RAWINPUT              = 0x02;
const COMPOSITION_ATTR_SELECTEDRAWTEXT       = 0x03;
const COMPOSITION_ATTR_CONVERTEDTEXT         = 0x04;
const COMPOSITION_ATTR_SELECTEDCONVERTEDTEXT = 0x05;

// ********************************************************************************************* //
// Core test APIs (direct access to FBTestApp)

/**
 * Verification method, prints result of a test. If the first "pass" parameter is "true"
 * the test passes, otherwise fails.
 *
 * @param {Boolean} pass Result of a test.
 * @param {String} msg A message to be displayed as a test results under the current test
 *      within the test console.
 */
this.ok = function(pass, msg)
{
    if (!pass)
        FBTest.sysout("FBTest **** FAILS **** " + msg);
    else
        FBTest.sysout("FBTest ok " + msg);

    FBTestApp.TestRunner.appendResult(new FBTestApp.TestResult(window, pass, msg));

    if (!pass)
        this.onFailure(msg);
    else
        FBTest.resetTimeout();

    return pass;
};

/**
 * Verification method. Compares expected and actual string (typically from the Firebug UI).
 * If "actual" and "expected" parameters are equal, the test passes, otherwise it fails.
 *
 * @param {String} expected Expected value
 * @param {String} actual Actual value
 * @param {String} msg A message to be displayed as a test result under the current test
 *      within the test console.
 * @param {String} shouldNotMatch Specifies whether expected and actual should not match
 */
this.compare = function(expected, actual, msg, shouldNotMatch)
{
    var result;
    if (expected instanceof RegExp)
    {
        result = actual ? actual.match(expected) : null;
        expected = expected ? expected.toString() : null;
    }
    else
    {
        // xxxHonza: TODO: lib/textSearch doesn't like '==='
        result = (expected == actual);
    }

    if (shouldNotMatch)
        result = !result;

    FBTest.sysout("compare "+(result?"passes":"**** FAILS ****")+" "+msg,
        {expected: expected, actual: actual});

    var shownMsg = msg;
    if (!result)
    {
        shownMsg += " (was: " + actual + ", expected" +
            (shouldNotMatch ? " otherwise" : ": " + expected) +
            (typeof actual === typeof expected ? ")" : " - different types)");
    }

    FBTestApp.TestRunner.appendResult(new FBTestApp.TestResult(window,
        result, shownMsg, expected, actual));

    if (result)
        FBTest.resetTimeout();
    else
        FBTest.onFailure(msg);

    return result;
};

/**
 * Logs an exception under the current test within the test console.
 *
 * @param {String} msg A message to be displayed under the current test within the test console.
 * @param {Exception} err An exception object.
 */
this.exception = function(msg, err)
{
    FBTestApp.TestRunner.appendResult(new FBTestApp.TestException(window, msg, err));
};

/**
 * Prints a message into test resutls (displayed under a test within test console).
 *
 * @param {String} msg A message to be displayed under the current test within the test console.
 */
this.progress = function(msg)
{
    FBTestApp.TestRunner.appendResult(new FBTestApp.TestResult(window, true, "progress: "+msg));
    FBTestApp.TestSummary.setMessage(msg);
    FBTest.sysout("FBTest progress: ------------- "+msg+" -------------");
    FBTest.resetTimeout();
};

/**
 * Finishes current test and prints info message (if any) to the status bar.
 *
 * All test tabs are removed from the browser.
 */
this.testDone = function(message)
{
    FBTest.sysout("FBTestFirebug.testDone; start test done timeout");

    var self = this;
    var test = FBTestApp.TestRunner.currentTest;
    setTimeout(function cleanUpLater()
    {
        self.closeFirebug();
        self.cleanUpTestTabs();

        FBTest.sysout("FBTestFirebug.testDone; after timeout");

        if (message)
            FBTest.progress(message);

        FBTestApp.TestRunner.testDone(false, test);
    });
};

/**
 * Returns URL of a directory with test cases (HTML pages with a manual test implementation)
 */
this.getHTTPURLBase = function()
{
    // xxxHonza: should be set as a global in this scope.
    return FBTestApp.TestConsole.getHTTPURLBase();
};

/**
 * Returns URL of a directory with test driver files.
 */
this.getLocalURLBase = function()
{
    // xxxHonza: should be set as a global in this scope.
    if (/file:/.test(FBTestApp.TestRunner.currentTest.driverBaseURI))
        return FBTestApp.TestRunner.currentTest.driverBaseURI;

    return FBTestApp.TestConsole.chromeToUrl(FBTestApp.TestRunner.currentTest.driverBaseURI, true);
};

/**
 * Basic logging into the Firebug tracing console. All logs made through this function
 * appears only if 'TESTCASE' options is set.
 *
 * @param {String} text A message to log.
 * @param {Object} obj An object to log.
 */
this.sysout = function(text, obj)
{
    if (FBTrace.DBG_TESTCASE)
        FBTrace.sysout(text, obj);
};

/**
 * In some cases the test can take longer time to execute than it's expected (e.g. due to a slow
 * test server connection).
 *
 * Instead of changing the default timeout to another (bigger) - but still fixed value, the test
 * can regularly reset the timeout.
 *
 * This way the runner knows that the test is not frozen and is still doing something.
 */
this.resetTimeout = function()
{
    FBTestApp.TestRunner.setTestTimeout(window);
};

// ********************************************************************************************* //
// APIs used by test harness (direct access to FBTestApp)

/**
 * Called by the test harness framework in case of a failing test. If *Fail Halt* option
 * is set and *Chromebug* extension installed, the debugger will halt the test execution.
 *
 * @param {String} msg A message to be displayed under the current test within the test console.
 */
this.onFailure = function(msg)
{
    FBTestApp.TestConsole.notifyObservers(this, "fbtest", "onFailure");
};

/**
 * This function is automatically called before every test sequence.
 */
this.setToKnownState = function()
{
    FBTest.sysout("FBTestFirebug setToKnownState");

    // xxxHonza: TODO
    // 1) cookies permissions are not reset
    // 2) Net panel filter is not reset (the preference is, but the UI isn't)

    var Firebug = FBTest.FirebugWindow.Firebug;
    Firebug.PanelActivation.toggleAll("off");  // These should be done with button presses not API calls.
    Firebug.PanelActivation.toggleAll("none");
    Firebug.PanelActivation.clearAnnotations(true);

    if (Firebug.isDetached())
        Firebug.toggleDetachBar();

    // First clear all breakpoints and consequently the reset all options that
    // clears the breakpoints storage.
    Firebug.Debugger.clearAllBreakpoints(null);
    Firebug.resetAllOptions(false);

    // Console preview is hidden by default
    if (this.isConsolePreviewVisible())
        this.clickConsolePreviewButton();

    // Use default Firebug height and side panel width
    this.setBrowerWindowSize(1024, 768);
    this.setFirebugBarHeight(270);
    this.setSidePanelWidth(350);

    this.clearSearchField();

    // xxxHonza: xxxJJB how clear the persisted panel state?
};

// ********************************************************************************************* //
// Manual verification (direct access to FBTestApp). These APIs should not be used in automated
// test-suites

function manualTest(verifyMsg, instructions, cleanupHandler)
{
    FBTestApp.TestRunner.manualVerify(verifyMsg, instructions, cleanupHandler);
}

this.manualVerify = function(verifyMsg, instructions)
{
    var self = this;
    manualTest(
        verifyMsg, instructions,
        function(passes)
        {
            FBTest.ok(passes, "Manual verification");
            self.closeFirebug();
            self.cleanUpTestTabs();
            FBTestApp.TestRunner.testDone(false);
        });
};

// ********************************************************************************************* //
// Event automation

this.click = function(node, win)
{
    this.sendMouseEvent({type: "click"}, node, win);
};

this.dblclick = function(node, win)
{
    this.sendMouseEvent({type: "click", detail: 2}, node, win);
};

this.rightClick = function(node, win)
{
    this.sendMouseEvent({type: "click", button: 2}, node, win);
};

this.mouseDown = function(node, win)
{
    this.sendMouseEvent({type: "mousedown"}, node, win);
};

this.mouseUp = function(node, win)
{
    this.sendMouseEvent({type: "mouseup"}, node, win);
};

this.mouseOver = function(node, offsetX, offsetY)
{
    var win = node.ownerDocument.defaultView;

    var eventDetails = {type: "mouseover"};
    this.synthesizeMouse(node, offsetX, offsetY, eventDetails, win);
};

this.mouseMove = function(node, offsetX, offsetY)
{
    var win = node.ownerDocument.defaultView;

    var eventDetails = {type: "mousemove"};
    this.synthesizeMouse(node, offsetX, offsetY, eventDetails, win);
};

this.sendMouseEvent = function(event, target, win)
{
    if (!target)
    {
        FBTest.progress("sendMouseEvent target is null");
        return;
    }

    var targetIsString = typeof target == "string";

    if (!win)
    {
        win = targetIsString ?
            // if the target is a string, we cannot know which window that target
            // belongs to, so we are assuming it to be the global window
            window :
            // if the target is not a string, thus it is assumed to be an Element,
            // then we are assuming the window is the one in which that target lives
            target.ownerDocument.defaultView;
    }

    if (targetIsString)
        target = win.document.getElementById(target);

    sendMouseEvent(event, target, win);
};

/**
 * Send the char aChar to the node with id aTarget. This method handles casing
 * of chars (sends the right charcode, and sends a shift key for uppercase chars).
 * No other modifiers are handled at this point.
 *
 * For now this method only works for English letters (lower and upper case)
 * and the digits 0-9.
 *
 * Returns true if the keypress event was accepted (no calls to preventDefault
 * or anything like that), false otherwise.
 */
this.sendChar = function(aChar, aTarget)
{
    aTarget = _getEventTarget(aTarget);
    return sendChar(aChar, aTarget);
};

/**
 * Send the string aStr to the node with id aTarget.
 *
 * For now this method only works for English letters (lower and upper case)
 * and the digits 0-9.
 */
this.sendString = function(aStr, aTarget)
{
    for (var i = 0; i < aStr.length; ++i)
        this.sendChar(aStr.charAt(i), aTarget);
};

/**
 * Send the non-character key aKey to the node with id aTarget.
 * The name of the key should be a lowercase
 * version of the part that comes after "DOM_VK_" in the KeyEvent constant
 * name for this key.  No modifiers are handled at this point.
 *
 * Returns true if the keypress event was accepted (no calls to preventDefault
 * or anything like that), false otherwise.
 */
this.sendKey = function(aKey, aTarget)
{
    aTarget = _getEventTarget(aTarget);
    return sendKey(aKey, aTarget, aTarget.ownerDocument.defaultView);
};

function _getEventTarget(aTarget)
{
    //var loc = FW.Firebug.currentContext ? FW.FBL.getFileName(FW.Firebug.currentContext.window.location.href) : "NULL";
    //if (aTarget && !(aTarget instanceof Node))
    //    FBTrace.sysout("[" + aTarget + " | " + loc + "]~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~- OOOPS ~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-");

    // FIXME xxxpedro
    if (aTarget && aTarget instanceof Node)
        aTarget = aTarget;
    else if (aTarget)
        aTarget = FW.Firebug.chrome.$(aTarget);
    else
        aTarget = FW.Firebug.chrome.window.document.documentElement;

    var doc = aTarget.ownerDocument;

    // Properly focus before typing. First the parent window and then the target itself.
    doc.defaultView.focus();
    FBTest.focus(aTarget);

    return aTarget;
}

this.synthesizeMouse = function(node, offsetX, offsetY, event, win)
{
    win = win || node.ownerDocument.defaultView;

    event = event || {};

    var rectCollection = node.getClientRects();

    // Use the first client rect for clicking (e.g. SPAN can have more).
    var rect = rectCollection[0]; //node.getBoundingClientRect();

    if (!FBTest.ok(rect, "Mouse event must be synthesized"))
        return;

    var frameOffset = getFrameOffset(node);

    FBTest.sysout("frameOffset " + frameOffset);

    // Hit the middle of the button
    // (Clicks to hidden parts of the element doesn't open the context menu).
    offsetX = (typeof offsetX != "undefined" ? offsetX : 0.5 * Math.max(1, rect.width));
    offsetY = (typeof offsetY != "undefined" ? offsetY : 0.5 * Math.max(1, rect.height));

    // include frame offset
    offsetX += frameOffset.left;
    offsetY += frameOffset.top;

    synthesizeMouse(node, offsetX, offsetY, event, win);
};

this.getStringDataFromClipboard = function()
{
    // https://developer.mozilla.org/en-US/docs/Using_the_Clipboard
    var clip = Components.classes["@mozilla.org/widget/clipboard;1"].getService(Components.interfaces.nsIClipboard);
    if (!clip)
        return false;

    var trans = Components.classes["@mozilla.org/widget/transferable;1"].createInstance(Components.interfaces.nsITransferable);
    if (!trans)
        return false;
    if ('init' in trans)
        trans.init(null);
    trans.addDataFlavor("text/unicode");

    clip.getData(trans, clip.kGlobalClipboard);

    var str       = new Object();
    var strLength = new Object();

    trans.getTransferData("text/unicode", str, strLength);

    if (str)
    {
        str = str.value.QueryInterface(Components.interfaces.nsISupportsString);
        pastetext = str.data.substring(0, strLength.value / 2);
        return pastetext;
    }

    return false;
};

function getFrameOffset(win)
{
    var top = 0;
    var left = 0;
    // FIXME xxxpedro
    var frameElement;
    while(frameElement = win.frameElement)
    {
        // xxxpedro shouldn't it be frameElement.top?
        top += win.frameElement.top;
        left += win.frameElement.left;
    }
    return {left: left, top: top};
}

/**
 * Synthesize a key event. It is targeted at whatever would be targeted by an
 * actual keypress by the user, typically the focused element.
 *
 * aKey should be either a character or a keycode starting with VK_ such as
 * VK_ENTER. See list of all possible key-codes here:
 * [[http://www.w3.org/TR/2000/WD-DOM-Level-3-Events-20000901/events.html]]
 *
 * aEvent is an object which may contain the properties:
 *   shiftKey, ctrlKey, altKey, metaKey, accessKey, type
 *
 * If the type is specified, a key event of that type is fired. Otherwise,
 * a keydown, a keypress and then a keyup event are fired in sequence.
 *
 * aWindow is optional, and defaults to the current window object.
 */
this.synthesizeKey = function(aKey, aEvent, aWindow)
{
    aEvent = aEvent || {};

    synthesizeKey(aKey, aEvent, aWindow);
};

this.focus = function(node)
{
    // If the focus() method is available apply it, but don't return.
    // Sometimes the event needs to be applied too (e.g. the command line).
    if (node.focus)
        node.focus();

    // DOMFocusIn doesn't seem to work with the command line.
    var doc = node.ownerDocument, event = doc.createEvent("UIEvents");
    event.initUIEvent("focus", true, true, doc.defaultView, 1);
    node.dispatchEvent(event);
};

// TODO: xxxpedro remove this function
this.pressKey = function(keyCode, target)
{
    function getKeyName(keyCode)
    {
        for (var name in KeyEvent)
        {
            if (KeyEvent[name] == keyCode)
                return name.replace("DOM_VK_", "");
        }

        return null;
    }

    FBTrace.sysout("DEPRECATE WARNING: FBTest.pressKey() should not be used. Use FBTest.sendKey() instead.");
    return this.sendKey(getKeyName(keyCode), target);
};

// ********************************************************************************************* //
// Firebug UI

/**
 * Open/close Firebug UI. If forceOpen is true, Firebug is only opened if closed.
 * @param {Boolean} forceOpen Set to true if Firebug should stay opened.
 */
this.pressToggleFirebug = function(forceOpen, target)
{
    var isOpen = this.isFirebugOpen();
    FBTest.sysout("pressToggleFirebug; before forceOpen: " + forceOpen + ", is open: " + isOpen);

    // Don't close if it's open and should stay open.
    if (forceOpen && isOpen)
    {
        FBTest.sysout("pressToggleFirebug; bail out");
        return;
    }

    FBTest.sendKey("F12", target); // F12

    isOpen = this.isFirebugOpen();
    FBTest.sysout("pressToggleFirebug; after forceOpen: " + forceOpen + ", is open: " + isOpen);
};

/**
 * Open Firebug UI. If it's already opened, it stays opened.
 */
this.openFirebug = function()
{
    this.pressToggleFirebug(true);
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

this.getBrowser = function()
{
    return FW.Firebug.Firefox.getTabBrowser();
};

// ********************************************************************************************* //
// URLs

/**
 * Opens specific URL in a new tab and calls the callback as soon as the tab is ready.
 * @param {String} url URL to be opened in the new tab.
 * @param {Function} callback Callback handler that is called as soon as the page is loaded.
 */
this.openNewTab = function(url, callback)
{
    var tabbrowser = FBTestFirebug.getBrowser();

    // Open new tab and mark as 'test' so it can be closed automatically.
    var newTab = tabbrowser.addTab(url);
    newTab.setAttribute("firebug", "test");
    tabbrowser.selectedTab = newTab;

    // Wait till the new window is loaded.
    var browser = tabbrowser.getBrowserForTab(newTab);
    waitForWindowLoad(browser, callback);

    return newTab;
};

/**
 * Opens specific URL in the current tab and calls the callback as soon as the tab is ready.
 * @param {String} url URL to be opened.
 * @param {Function} callback Callback handler that is called as soon as the page is loaded.
 */
this.openURL = function(url, callback)
{
    var tabbrowser = FBTestFirebug.getBrowser();
    var currTab = tabbrowser.selectedTab;

    // Get the current tab and wait till the new URL is loaded.
    var browser = tabbrowser.getBrowserForTab(currTab);
    waitForWindowLoad(browser, callback);

    // Reload content of the selected tab.
    tabbrowser.selectedBrowser.contentDocument.defaultView.location.href = url;

    return currTab;
};

/**
 * Refres the current tab.
 * @param {Function} callback Callback handler that is called as soon as the page is reloaded.
 */
this.reload = function(callback)
{
    var tabbrowser = FBTestFirebug.getBrowser();
    var currTab = tabbrowser.selectedTab;

    // Get the current tab and wait till it's reloaded.
    var browser = tabbrowser.getBrowserForTab(currTab);
    waitForWindowLoad(browser, callback);

    // Reload content of the selected tab.
    tabbrowser.selectedBrowser.contentDocument.defaultView.location.reload();

    return currTab;
};

/**
 * Helper method for wait till a window is *really* loaded.
 * @param {Object} browser Window's parent browser.
 * @param {Window} callback Executed when the window is loaded. The window is passed in
 *      as the parameter.
 */
function waitForWindowLoad(browser, callback)
{
    // If the callback isn't specified don't watch the window load at all.
    if (!callback)
        return;

    var loaded = false;
    var painted = false;

    // All expected events have been fired, execute the callback.
    function executeCallback()
    {
        try
        {
            var win = browser.contentWindow;

            // This is a workaround for missing wrappedJSObject property,
            // if the test case comes from http (and not from chrome)
            // xxxHonza: this is rather a hack, it should be removed if possible.
            //if (!win.wrappedJSObject)
            //    win.wrappedJSObject = win;

            //xxxHonza: I have seen win == null once. It looks like the callback
            // is executed for a window, which is already unloaded. Could this happen
            // in case where the test is finished before the listeners are actually
            // executed?
            // xxxHonza: remove 'load' and 'MozAfterPaint' listeners when the test
            // finishes before the window is actually loaded.
            // Use refreshHaltedDebugger test as an example. (breaks during the page load
            // and immediatelly calls testDone)
            if (!win)
                FBTrace.sysout("waitForWindowLoad: ERROR no window!");

            // The window is loaded, execute the callback now.
            if (win)
                callback(win);
        }
        catch (exc)
        {
            FBTest.exception("waitForWindowLoad", exc);
            FBTest.sysout("runTest FAILS " + exc, exc);
        }
    }

    // Wait for all event that must be fired before the window is loaded.
    // Any event is missing?
    // xxxHonza: In case of Firefox 3.7 the new 'content-document-global-created'
    // (bug549539) could be utilized.
    function waitForEvents(event)
    {
        if (event.type == "load" && event.target === browser.contentDocument)
        {
            browser.removeEventListener("load", waitForEvents, true);
            loaded = true;
        }
        else if (event.type == "MozAfterPaint" && event.target === browser.contentWindow)
        {
            browser.removeEventListener("MozAfterPaint", waitForEvents, true);
            painted = true;
        }

        // Execute callback after 100ms timout (the inspector tests need it for now),
        // but this shoud be set to 0.
        if (loaded && painted)
            setTimeout(executeCallback, 100);
    }

    FBTest.sysout("waitForWindowLoad: adding event listener");

    browser.addEventListener("load", waitForEvents, true);
    browser.addEventListener("MozAfterPaint", waitForEvents, true);
}

/**
 * Closes all Firefox tabs that were opened because of test purposes.
 */
this.cleanUpTestTabs = function()
{
    //FBTest.progress("clean up tabs");

    FBTestFirebug.cleanUpListeners();

    var tabbrowser = FBTestFirebug.getBrowser();
    var removeThese = [];
    for (var i = 0; i < tabbrowser.mTabs.length; i++)
    {
        var tab = tabbrowser.mTabs[i];

        var firebugAttr = tab.getAttribute("firebug");

        FBTest.sysout(i+"/"+tabbrowser.mTabs.length+" cleanUpTestTabs on tab "+tab+" firebug: "+firebugAttr);

        if (firebugAttr == "test")
            removeThese.push(tab);
    }

    if (!tabbrowser._removingTabs)
        tabbrowser._removingTabs = [];

    for (var i = 0; i < removeThese.length; i++)
        tabbrowser.removeTab(removeThese[i]);
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

/**
 * Clears Firefox cache.
 */
this.clearCache = function()
{
    try
    {
        var cache = Cc["@mozilla.org/network/cache-service;1"].getService(Ci.nsICacheService);
        cache.evictEntries(Ci.nsICache.STORE_ON_DISK);
        cache.evictEntries(Ci.nsICache.STORE_IN_MEMORY);
    }
    catch(exc)
    {
        FBTest.sysout("clearCache FAILS "+exc, exc);
    }
};

// ********************************************************************************************* //
// Firebug Panel Enablement.

this.getPanelTypeByName = function(panelName, doc)
{
    if (!doc)
        doc = FW.Firebug.chrome.window.document;

    var panelTabs = doc.getElementById("fbPanelBar1-panelTabs");
    for (var child = panelTabs.firstChild; child; child = child.nextSibling)
    {
        var label = child.getAttribute("label");
        FBTest.sysout("getPanelTypeByName trying '"+label+"'");
        var role = child.getAttribute("role");
        if (role == "tab" && label == panelName)
            return child.panelType.prototype.name;
    }

    return null;
};

this.setPanelState = function(model, panelName, callbackTriggersReload, enable)
{
    // Open Firebug UI
    this.pressToggleFirebug(true);

    var panelType = FW.Firebug.getPanelType(panelName);
    if (panelType.prototype.isEnabled() != enable)
    {
        var panelTab;

        var doc = FW.Firebug.chrome.window.document;
        var panelTabs = doc.getElementById("fbPanelBar1-panelTabs");
        for (var child = panelTabs.firstChild; child; child = child.nextSibling)
        {
            if (panelType == child.panelType)
            {
                panelTab = child;
                break;
            }
        }

        if (!panelTab)
        {
            this.ok(panelTab, "Such panel doesn't exist! " + panelName + ", " + enable);
            return;
        }

        // Execute directly menu commands.
        if (enable)
            panelTab.tabMenu.onEnable();
        else
            panelTab.tabMenu.onDisable();
    }

    // Clear cache and reload.
    this.clearCache();
    if (callbackTriggersReload)
        this.reload(callbackTriggersReload);
};

/**
 * Disables the Net panel and reloads if a callback is specified.
 * @param {Function} callback A handler that is called as soon as the page is reloaded.
 */
this.disableNetPanel = function(callback)
{
    this.setPanelState(FW.Firebug.NetMonitor, "net", callback, false);
};

/**
 * Enables the Net panel and reloads if a callback is specified.
 * @param {Function} callback A handler that is called as soon as the page is reloaded.
 */
this.enableNetPanel = function(callback)
{
    this.setPanelState(FW.Firebug.NetMonitor, "net", callback, true);
};

/**
 * Disables the Script panel and reloads if a callback is specified.
 * @param {Function} callback A handler that is called as soon as the page is reloaded.
 */
this.disableScriptPanel = function(callback)
{
    this.setPanelState(FW.Firebug.Debugger, "script", callback, false);
};

/**
 * Enables the Script panel and reloads if a callback is specified.
 * @param {Function} callback A handler that is called as soon as the page is reloaded.
 */
this.enableScriptPanel = function(callback)
{
    this.setPanelState(FW.Firebug.Debugger, "script", callback, true);
};

/**
 * Disables the Console panel and reloads if a callback is specified.
 * @param {Function} callback A handler that is called as soon as the page is reloaded.
 */
this.disableConsolePanel = function(callback)
{
    this.setPanelState(FW.Firebug.Console, "console", callback, false);
};

/**
 * Enables the Console panel and reloads if a callback is specified.
 * @param {Function} callback A handler that is called as soon as the page is reloaded.
 */
this.enableConsolePanel = function(callback)
{
    this.setPanelState(FW.Firebug.Console, "console", callback, true);
};

/**
 * Disables all activable panels.
 */
this.disableAllPanels = function()
{
    FW.FBL.$("cmd_firebug_disablePanels").doCommand();
};

/**
 * Enables all activable panels.
 */
this.enableAllPanels = function()
{
    FW.FBL.$("cmd_firebug_enablePanels").doCommand();
};

/**
 * Select specific panel in the UI.
 * @param {Object} panelName Name of the panel (e.g. <i>console</i>, <i>dom</i>, <i>script</i>,
 * <i>net</i>, <i>css</i>).
 * @param {Object} chrome Firebug chrome object.
 */
this.selectPanel = function(panelName, chrome)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var panelType = FW.Firebug.getPanelType(panelName);
    if (panelType.prototype.parentPanel)
        return chrome.selectSidePanel(panelName);

    return chrome.selectPanel(panelName);
};

this.selectSidePanel = function(panelName, chrome)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    return chrome.selectSidePanel(panelName);
};

/* select a panel tab */
this.selectPanelTab = function(name, doc)
{
    if (!doc)
        doc = FW.Firebug.chrome.window.document;

    var panelTabs = doc.getElementById("fbPanelBar1-panelTabs");
    for (var child = panelTabs.firstChild; child; child = child.nextSibling)
    {
        var label = child.getAttribute("label");
        FBTest.sysout("selectPanelTab trying "+label);
        var role = child.getAttribute("role");
        if (role == "tab" && label == name)
        {
            var panelBar = panelTabs;
            while (panelBar && (panelBar.tagName != "panelBar") )
                panelBar = panelBar.parentNode;

            panelBar.selectTab(child);
            return true;
        }
    }
    return false;
};

this.getSelectedPanelTab = function(doc)
{
    if (!doc)
        doc = FW.Firebug.chrome.window.document;

    var panelTabs = doc.getElementById("fbPanelBar1-panelTabs");
    for (var child = panelTabs.firstChild; child; child = child.nextSibling)
    {
        if (child.getAttribute("selected") == "true")
            return child;
    }
    return null;
};

/* selected panel on UI (not via context) */
this.getSelectedPanel = function()
{
    var panelBar1 = FW.Firebug.chrome.$("fbPanelBar1");
    return panelBar1.selectedPanel; // may be null
};

/* selected side panel on UI (not via context) */
this.getSelectedSidePanel = function()
{
    var panelBar2 = FW.Firebug.chrome.$("fbPanelBar2");
    return panelBar2.selectedPanel; // may be null
};

/**
 * Returns document object of Main Firebug content UI (content of all panels is presented
 * in this document).
 */
this.getPanelDocument = function()
{
    var panelBar1 = FW.Firebug.chrome.$("fbPanelBar1");
    return panelBar1.browser.contentDocument;
};

this.getSidePanelDocument = function()
{
    var panelBar2 = FW.Firebug.chrome.$("fbPanelBar2");
    return panelBar2.browser.contentDocument;
};

/* user sees panel tab disabled? */
this.isPanelTabDisabled = function(name)
{
    var panelBar1 = FW.Firebug.chrome.$("fbPanelBar1-panelTabs");
    for (var child = panelBar1.firstChild; child; child = child.nextSibling)
    {
        var label = child.getAttribute("label");
        FBTest.sysout("isPanelTabDisabled trying '"+label+"'");
        var role = child.getAttribute("role");
        if (role == "tab" && label == name)
        {
            FBTest.sysout("isPanelTablDisabled found role tab and label '"+label+"' has "+child.getAttribute("aria-disabled"));
            return child.getAttribute("aria-disabled"); // "true" or "false"
        }
    }
    return null;
};

/**
 * Returns panel object that represents a specified panel. In order to get root element of
 * panels's content use <i>panel.panelNode</i>, where <i>panel</i> is the returned value.
 * @param {Object} name Name of the panel to be returned (e.g. <i>net</i>).
 */
this.getPanel = function(name)
{
    if (!FW.Firebug.currentContext)
    {
        this.ok(FW.Firebug.currentContext, "There is no current context!");
        return;
    }

    return FW.Firebug.currentContext.getPanel(name);
};

/**
 * Wait until the debugger has been activated, after enabling the Script panel.
 *
 * @param {Object} callback The callback executed when the debugger has been activated.
 */
this.waitForDebuggerActivation = function(callback)
{
    // Add a function to be executed after we have gone back to the event loop
    // and activated the debugger.
    // (Despite the appearance, this shouldn't be a race condition.)
    setTimeout(function()
    {
        callback();
    }, 0);
};

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
// Firebug preferences

/**
 * Sets Firebug preference.
 * @param {Object} pref Name of the preference without <i>extensions.firebug</i> prefix.
 * For instance: <i>activateSameOrigin</i>. Always use this method for seting a preference.
 * Notice that FBTest automatically resets all preferences before every single test is executed.
 * @param {Object} value New value of the preference.
 */
this.setPref = function(pref, value, prefDomain)
{
    if (!prefDomain)
        prefDomain = FW.Firebug.prefDomain;

    FW.Firebug.setPref(prefDomain, pref, value);
};

/**
 * Returns value of specified Firebug preference.
 * @param {Object} pref Name of the preference without <i>extensions.firebug</i> prefix.
 * For instance: <i>showXMLHttpRequests</i>. Notice that FBTest automatically resets all
 * preferences before every single test is executed.
 */
this.getPref = function(pref)
{
    return FW.Firebug.getPref(FW.Firebug.prefDomain, pref);
};

/**
 * Resets the value of the specified Firebug preference.
 * @param {Object} pref Name of the preference without <i>extensions.firebug</i> prefix.
 * For instance: <i>showXMLHttpRequests</i>.
 */
this.clearPref = function(pref)
{
    FW.Firebug.Options.clearPref(FW.Firebug.prefDomain, pref);
};

// ********************************************************************************************* //
// Command Line

function getCommandLine(useCommandEditor)
{
    return useCommandEditor ?
        FW.Firebug.CommandEditor :
        FW.Firebug.CommandLine.getSingleRowCommandLine();
}

/**
 * executes an expression inside the Command Line
 * @param {String} the command to execute
 * @param {Object} the Firebug.chrome object
 * @param {Boolean} if set to true, type in the CommandEditor, or in the CommandLine otherwise
 */
this.executeCommand = function(expr, chrome, useCommandEditor)
{
    FBTest.clearAndTypeCommand(expr, useCommandEditor);

    if (useCommandEditor)
        FBTest.clickToolbarButton(chrome, "fbCmdLineRunButton");
    else
        FBTest.sendKey("RETURN", "fbCommandLine");
};

/**
 * clears the Command Line or the Command Editor
 */
this.clearCommand = function()
{
    FW.Firebug.CommandLine.clear(FW.Firebug.currentContext);
};


/**
 * clears and types a command into the Command Line or the Command Editor
 * @param {String} the command to type
 * @param {Boolean} if set to true, type in the CommandEditor, or in the CommandLine otherwise
 *
 */
this.clearAndTypeCommand = function(string, useCommandEditor)
{
    FBTest.clearCommand();
    FBTest.typeCommand(string, useCommandEditor);
};

/**
 * types a command into the Command Line or the Command Editor
 * @param {String} the command to type
 * @param {Boolean} if set to true, type in the CommandEditor, or in the CommandLine otherwise
 *
 */
this.typeCommand = function(string, useCommandEditor)
{
    var doc = FW.Firebug.chrome.window.document;
    var panelBar1 = doc.getElementById("fbPanelBar1");
    var cmdLine = getCommandLine(useCommandEditor);
    var win = panelBar1.browser.contentWindow;

    FBTest.setPref("commandEditor", (useCommandEditor == true));

    FW.Firebug.chrome.window.focus();
    panelBar1.browser.contentWindow.focus();
    cmdLine.focus();

    FBTest.sysout("typing "+string+" in to "+cmdLine+" focused on "+
        FW.FBL.getElementCSSSelector(doc.commandDispatcher.focusedElement)+
        " win "+panelBar1.browser.contentWindow);

    this.sendString(string, doc.commandDispatcher.focusedElement);
};

/**
 * Helper function for executing expression on the command line.
 * @param {Function} callback Appended by the test harness.
 * @param {String} expression Expression to be executed.
 * @param {String} expected Expected value displayed.
 * @param {String} tagName Name of the displayed element.
 * @param {String} class Class of the displayed element.
 * @param {Boolean} if set to false, does not clear the console logs
 * @param {Boolean} if set to true, use the Command Editor instead of the Command Line
 */
this.executeCommandAndVerify = function(callback, expression, expected, tagName, classes, clear,
    useCommandEditor)
{
    if (clear !== false)
        FBTest.clearConsole();

    var config = {tagName: tagName, classes: classes};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.compare(expected, row.textContent, "Verify: " +
            expression + " SHOULD BE " + expected);
        if (clear !== false)
            FBTest.clearConsole();

        if (callback)
            callback();
    });

    FBTest.progress("Execute expression: " + expression);
    FBTest.executeCommand(expression, undefined, useCommandEditor);
};

/**
 * Simulate selection in the Command Editor or the Command Line
 * @param {Integer} the index of the start of the selection
 * @param {Integer} the index of the end of the selection
 */
/*this.setCommandSelectionRange = function(selectionStart, selectionEnd)
{
    FW.Firebug.CommandLine.getCommandLine().setSelectionRange(selectionStart, selectionEnd);
}*/

// ********************************************************************************************* //
// Toolbar buttons

/**
 * Simulates click on the Continue button that is available in the Script panel when
 * Firebug is halted in the debugger. This action resumes the debugger (of course, the debugger
 * can stop at another breakpoint).
 * @param {Object} chrome Firebug.chrome object.
 */
this.clickContinueButton = function(chrome)
{
    this.clickToolbarButton(chrome, "fbContinueButton");
};

this.clickStepOverButton = function(chrome)
{
    this.clickToolbarButton(chrome, "fbStepOverButton");
};

this.clickStepIntoButton = function(chrome)
{
    this.clickToolbarButton(chrome, "fbStepIntoButton");
};

this.clickStepOutButton = function(chrome)
{
    this.clickToolbarButton(chrome, "fbStepOutButton");
};

this.clickRerunButton = function(chrome)
{
    this.clickToolbarButton(chrome, "fbRerunButton");
};

/**
 * Simulates click on the Break On Next button that is available in main Firebug toolbar.
 * The specific action (e.g. break on next XHR or break on next HTML mutation) depends
 * on the current panel.
 * @param {Object} chrome Firebug.chrome object.
 */
this.clickBreakOnNextButton = function(chrome)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var doc = chrome.window.document;
    var button = doc.getElementById("fbBreakOnNextButton");
    var breakable = button.getAttribute("breakable");

    if (breakable == "true")
        FBTest.sysout("FBTestFirebug breakable true, click should arm break on next");
    else if (breakable == "false")
        FBTest.sysout("FBTestFirebug breakable false, click should disarm break on next");
    else
        FBTest.sysout("FBTestFirebug breakOnNext breakable:"+breakable, button);

    // Do not use FBTest.click, toolbar buttons need to use sendMouseEvent.
    this.synthesizeMouse(button);
};

/**
 * Simulates click on the Persist button that is available in the Script and Net panels.
 * Having this button pressed causes persistence of the appropriate panel content across reloads.
 * @param {Object} chrome Firebug.chrome object.
 */
this.clickPersistButton = function(chrome)
{
    this.clickToolbarButton(chrome, "fbConsolePersist");
};

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


//********************************************************************************************* //
//Watch Panel

/**
* Appends a new selector trial to the Selectors panel (side panel of the CSS panel).
* @param {Object} chrome Current Firebug's chrome (can be null).
* @param {String} selector Selector to be added
* @param {Function} callback Callback function called after the result is displayed
*/
this.addSelectorTrial = function(chrome, selector, callback)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var selectorsPanel = FBTest.getPanel("selectors", true);
    FBTest.ok(selectorsPanel, "Selectors side panel must be there");

    // Create new selector trial
    var panelNode = selectorsPanel.panelNode;
    var trySelectorField = panelNode.getElementsByClassName("selectorEditorContainer")[0];
    FBTest.ok(trySelectorField, "Field to create a new selector group must be there");

    // Click to open a text editor
    FBTest.click(trySelectorField);

    var editor = panelNode.getElementsByClassName("selectorsPanelEditor")[0];
    FBTest.ok(editor, "Selector editor must be there");

    // Wait till the result is evaluated and displayed
    var doc = FBTest.getSidePanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, "a",
        {"class": "objectLink-element"});

    recognizer.onRecognizeAsync(function(objectLink)
    {
        if (callback)
            callback(objectLink);
    });

    // Type selector and press Enter
    FBTest.sendString(selector, editor);
    FBTest.sendKey("RETURN", editor);
};

// ********************************************************************************************* //
// Debugger

this.getSourceLineNode = function(lineNo, chrome)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var panel = chrome.getSelectedPanel();
    var sourceBox = panel.selectedSourceBox;
    if (!FBTest.ok(sourceBox, "getSourceLineNode needs selectedSourceBox in panel " + panel.name))
        return false;

    var sourceViewport =  FW.FBL.getChildByClass(sourceBox, "sourceViewport");
    if (!sourceViewport)
    {
        FBTest.ok(sourceViewport, "There is a sourceViewport after scrolling");
        return false;
    }

    var rows = sourceViewport.childNodes;
    FBTest.sysout("getSourceLineNode has sourceViewport with "+rows.length+" childNodes");

    // Look for line
    var row = null;
    for (var i=0; i < rows.length; i++)
    {
        var line = rows[i].getElementsByClassName("sourceLine").item(0);
        if (parseInt(line.textContent, 10) == lineNo)
        {
            row = rows[i];
            break;
        }
        else
        {
            FBTest.sysout("Tried row "+i+" "+line.textContent+"=?="+lineNo);
        }
    }

    if (!row)
    {
        FBTest.sysout("getSourceLineNode did not find "+lineNo);
    }
    else
    {
        FBTest.sysout("getSourceLineNode found "+lineNo+" "+rows[i].innerHTML);
        FBTest.sysout("getSourceLineNode found "+lineNo+" "+row.innerHTML);
    }

    return row;
};

/**
 * Registers handler for break in Debugger. The handler is called as soon as Firebug
 * breaks the JS execution on a breakpoint or due a <i>Break On Next<i> active feature.
 * @param {Object} chrome Current Firebug's chrome object (e.g. FW.Firebug.chrome)
 * @param {Number} lineNo Expected source line number where the break should happen.
 * @param {Object} breakpoint Set to true if breakpoint should be displayed in the UI.
 * @param {Object} callback Handeler that should be called when break happens.
 */
this.waitForBreakInDebugger = function(chrome, lineNo, breakpoint, callback)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    FBTest.progress("waitForBreakInDebugger in chrome.window: " + chrome.window.location);

    // Get document of Firebug's panel.html
    var panel = chrome.getSelectedPanel();
    if (!panel)
    {
        FBTest.ok(panel, "Firebug needs a selected panel!");
        return;
    }

    var doc = panel.panelNode.ownerDocument;

    // Complete attributes that must be set on sourceRow element.
    var attributes = {"class": "sourceRow", exe_line: "true"};
    if (breakpoint)
        attributes.breakpoint = breakpoint ? "true" : "false";

    // Wait for the UI modification that shows the source line where break happened.
    var lookBP = new MutationRecognizer(doc.defaultView, "div", attributes);
    lookBP.onRecognizeAsync(function onBreak(sourceRow)
    {
        var panel = chrome.getSelectedPanel();
        if (panel)
        {
            setTimeout(function() {
                onPanelReady(sourceRow);
            }, 200);
            return;
        }

        FBTest.progress("onRecognizeAsync; wait for panel to be selected");

        // The script panel is not yet selected so wait for the 'selectingPanel' event.
        var panelBar1 = FW.FBL.$("fbPanelBar1", chrome.window.document);
        function onSelectingPanel()
        {
            panelBar1.removeEventListener("selectingPanel", onSelectingPanel, false);
            setTimeout(function() {
                onPanelReady(sourceRow);
            }, 200);
        }
        panelBar1.addEventListener("selectingPanel", onSelectingPanel, false);
    });

    function onPanelReady(sourceRow)
    {
        try
        {
            FBTest.progress("onRecognizeAsync; check source line number, exe_line" +
                (breakpoint ? " and breakpoint" : ""));

            var panel = chrome.getSelectedPanel();
            FBTest.compare("script", panel.name, "The script panel should be selected");

            var row = FBTestFirebug.getSourceLineNode(lineNo, chrome);
            FBTest.ok(row, "Row " + lineNo + " must be found");

            var currentLineNo = parseInt(sourceRow.firstChild.textContent, 10);
            FBTest.compare(lineNo, currentLineNo, "The break must be on line " + lineNo + ".");

            callback(sourceRow);
        }
        catch (exc)
        {
            FBTest.exception("waitForBreakInDebugger", exc);
            FBTest.sysout("listenForBreakpoint callback FAILS "+exc, exc);
        }
    }

    FBTest.sysout("fbTestFirebug.waitForBreakInDebugger recognizing ", lookBP);
};

/**
 * Wait till the debugger is resumed.
 *
 * @param {Object} callback A callback executed when the debugger is resumed.
 */
this.waitForDebuggerResume = function(callback)
{
    var timeout = 250;
    var counter = 20;
    var chrome = FW.Firebug.chrome;

    function checkResumeState()
    {
        counter--;

        var stopped = chrome.getGlobalAttribute("fbDebuggerButtons", "stopped");
        if (stopped == "false" || counter <= 0)
            callback();
        else
            setTimeout(checkResumeState, timeout);
    }

    // Start checking state on timeout.
    setTimeout(checkResumeState, timeout);
};

/**
 * Set a breakpoint
 * @param {Object} chrome Firebug chrome object. If null, the default is used.
 * @param {Object} url URL of the target file. If null, the current file is used.
 * @param {Object} lineNo Source line number.
 * @param {Object} attributes Additional breakpoint attributes
 * @param {Object} callback Asynchronous callback is called as soon as the breakpoint is set.
 */
this.setBreakpoint = function(chrome, url, lineNo, attributes, callback)
{
    // FIXME: xxxpedro Test case for Issue 4553 is failing sometimes and it seems
    // to be something inside this FBTest.setBreakpoint() function
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var panel = FBTestFirebug.selectPanel("script");
    if (!url)
        url = panel.getObjectLocation(panel.location);

    // FIXME: xxxpedro this function seems to be hacky, and could be the source
    // of the problem with the test case for Issue 4553
    FBTestFirebug.selectSourceLine(url, lineNo, "js", chrome, function(row)
    {
        if (row.getAttribute("breakpoint") != "true")
        {
            if (attributes && attributes.condition)
            {
                // Righ-click to open the condition editor
                var eventDetails = {type : "contextmenu", button : 2};
                var sourceLine = row.querySelector(".sourceLine");
                FBTest.synthesizeMouse(sourceLine, 2, 2, eventDetails);
                var editor = panel.panelNode.querySelector(".conditionInput.completionInput");
                FBTest.sendString(attributes.condition, editor);
                FBTest.sendKey("RETURN", editor);

                FBTest.mouseOver(sourceLine);

                // FIXME xxxpedro variable never used. Is the following
                // "FBTest.waitForDisplayedText" waiting for the correct condition?
                var config = {tagName: "div", classes: "infoTip"};
                FBTest.waitForDisplayedText("script", attributes.condition, function (infoTip)
                {
                    FBTest.compare(attributes.condition, infoTip.textContent,
                        "Breakpoint condition must be set correctly");
                    callback(row);
                });
            }
            else
            {
                // Click to create a breakpoint.
                FBTest.mouseDown(row.querySelector(".sourceLine"));
                FBTest.compare(row.getAttribute("breakpoint"), "true", "Breakpoint must be set");
                callback(row);
            }
        }
        else
        {
            callback(row);
        }
    });
};

this.removeBreakpoint = function(chrome, url, lineNo, callback)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var panel = FBTestFirebug.selectPanel("script");
    if (!url)
        url = panel.getObjectLocation(panel.location);

    FBTestFirebug.selectSourceLine(url, lineNo, "js", chrome, function(row)
    {
        if (row.getAttribute("breakpoint") == "true")
        {
            // Click to remove a breakpoint.
            FBTest.mouseDown(row.querySelector(".sourceLine"));
            FBTest.ok(row.getAttribute("breakpoint") != "true", "Breakpoint must be set");
        }
        callback(row);
    });
};

// ********************************************************************************************* //
// Watch Panel

/**
 * Appends a new expression into the Watch panel (the side panel for the Script panel).
 * @param {Object} chrome The current Firebug's chrome (can be null).
 * @param {Object} expression The expression to be evaluated.
 * @param {Object} callback Called after the result is displayed.
 */
this.addWatchExpression = function(chrome, expression, callback)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var watchPanel = FBTest.getPanel("watches", true);
    FBTest.ok(watchPanel, "The watch panel must be there; " + expression);

    // Create new watch expression (should be done by events).
    var panelNode = watchPanel.panelNode;
    var watchNewRow = panelNode.querySelector(".watchEditBox");
    FBTest.ok(watchNewRow, "The watch edit box must be there; " + expression);

    // Click to open a text editor.
    FBTest.mouseDown(watchNewRow);

    var editor = panelNode.querySelector(".completionInput");
    FBTest.ok(editor, "The editor must be there; " + expression);

    // Wait till the result is evaluated and displayed.
    var doc = FBTest.getSidePanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, "td",
        {"class": "memberValueCell"});

    recognizer.onRecognizeAsync(function(memberValueColumn)
    {
        var td = FW.FBL.hasClass(memberValueColumn, "memberValueCell") ?
            memberValueColumn : memberValueColumn.querySelector(".memberValueCell");

        if (callback)
            callback(td);
    });

    // Set expression and press enter.
    FBTest.sendString(expression, editor);
    FBTest.sendKey("RETURN", editor);
};

/**
 * Sets new value for specified expression in the Watch side panel.
 *
 * @param {Object} chrome The current Firebug's chrome (can be null).
 * @param {Object} varName Name of the variable in the Watch panel.
 * @param {Object} expression New expression/value
 * @param {Object} callback Called after the result is displayed.
 */
this.setWatchExpressionValue = function(chrome, varName, expression, callback)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var watchPanel = FBTest.getPanel("watches", true);
    var row = this.getWatchExpressionRow(chrome, varName);
    if (!row)
        return null;

    // Click to open a text editor.
    FBTest.dblclick(row);

    var panelNode = watchPanel.panelNode;
    var editor = panelNode.querySelector(".completionInput");
    FBTest.ok(editor, "The editor must be there; " + varName);

    // Wait till the result is evaluated and displayed.
    var doc = FBTest.getSidePanelDocument();
    var recognizer = new MutationRecognizer(doc.defaultView, "td",
        {"class": "memberValueCell"});

    recognizer.onRecognizeAsync(function(memberValueColumn)
    {
        var td = FW.FBL.hasClass(memberValueColumn, "memberValueCell") ?
            memberValueColumn : memberValueColumn.querySelector(".memberValueCell");

        if (callback)
            callback(td);
    });

    // Set expression and press enter.
    FBTest.sendString(expression, editor);
    FBTest.sendKey("RETURN", editor);
}

/**
 * Toggles boolean value in the Watch side panel.
 *
 * @param {Object} chrome The current Firebug's chrome (can be null).
 * @param {Object} varName Variable name
 * @param {Object} callback Called after the result is displayed.
 */
this.toggleWatchExpressionBooleanValue = function(chrome, varName, callback)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var watchPanel = FBTest.getPanel("watches", true);
    var row = this.getWatchExpressionRow(chrome, varName);
    if (!row)
        return null;

    // Click to open a text editor.
    FBTest.dblclick(row);

    callback(row);
}

/**
 * Returns value for specified expression displayed in the Watch panel.
 *
 * @param {Object} chrome The current Firebug's chrome (optional)
 * @param {Object} expression The expression we are looking for.
 */
this.getWatchExpressionValue = function(chrome, expression)
{
    var row = this.getWatchExpressionRow(chrome, expression);
    if (!row)
        return null;

    var cell = row.querySelector(".memberValueCell");
    return cell.textContent;
};

/**
 * Returns the row element "&lt;tr&gt;" from the 'watches' side-panel for specified expression.
 *
 * @param {Object} chrome The current Firebug's chrome (optional)
 * @param {Object} expression The expression we are looking for.
 */
this.getWatchExpressionRow = function(chrome, expression)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var watchPanel = FBTest.getPanel("watches", true);
    FBTest.ok(watchPanel, "The watch panel must be there; " + expression);

    return getDOMMemberRow(watchPanel, expression);
};

function getDOMMemberRow(panel, name)
{
    var panelNode = panel.panelNode;
    var rows = panelNode.querySelectorAll(".memberRow");

    // Iterate over all rows and pick the one that fits the name.
    for (var i=0; i<rows.length; i++)
    {
        var row = rows[i];
        var labelCell = row.querySelector(".memberLabelCell");
        if (labelCell.textContent == name)
            return row;
    }
}

// ********************************************************************************************* //
// Error handling

/** @ignore */
window.onerror = function(errType, errURL, errLineNum)
{
    var path = window.location.pathname;
    var fileName = path.substr(path.lastIndexOf("/") + 1);
    var errorDesc = errType + " (" + errLineNum + ")" + " " + errURL;
    FBTest.sysout(fileName + " ERROR " + errorDesc);
    if (!FBTrace.DBG_ERRORS)  // then we are watching with another tracer, let it go
        FBTest.ok(false, fileName + " ERROR " + errorDesc);
    FBTestFirebug.testDone();
    return false;
};

// ********************************************************************************************* //
// Panel Navigation

/**
 * Select a location, e.g. a source file inside the Script panel, using the string the user
 * sees.
 *
 * Example:
 * ~~
 * var panel = FBTest.selectPanel("script");
 * FBTest.selectPanelLocationByName(panel, "foo.js");
 * ~~
 */
this.selectPanelLocationByName = function(panel, name)
{
    var locations = panel.getLocationList();
    for(var i = 0; i < locations.length; i++)
    {
        var location = locations[i];
        var description = panel.getObjectDescription(location);
        if (description.name == name)
        {
            panel.navigate(location);
            return true;
        }
    }
    return false;
};

/**
 * Returns current location in the current panel. For example, if the Script panel
 * is selected the return value might be: myScript.js
 */
this.getCurrentLocation = function()
{
    var locationList = FW.Firebug.chrome.$("fbLocationList");
    return locationList.label;
};

/**
 * Jump to a file@line.
 *
 * Example:
 *
 * ~~
 * FBTest.selectSourceLine(sourceFile.href, 1143, "js");
 * ~~
 */
// TODO: xxxpedro this function seems to be hacky
this.selectSourceLine = function(url, lineNo, category, chrome, callback)
{
    var sourceLink = new FBTest.FirebugWindow.FBL.SourceLink(url, lineNo, category);
    if (chrome)
        chrome.select(sourceLink);
    else
        FBTest.FirebugWindow.Firebug.chrome.select(sourceLink);

    if (!callback)
        return;

    var tries = 5;
    var checking = setInterval(function checkScrolling()
    {
        var row = FBTestFirebug.getSourceLineNode(lineNo, chrome);
        if (!row && --tries)
            return;

        clearInterval(checking);
        callback(row);
    }, 50);
};

// ********************************************************************************************* //
// DOM

this.expandElements = function(panelNode, className) // className, className, ...
{
    var rows = FW.FBL.getElementsByClass.apply(null, arguments);
    for (var i=0; i<rows.length; i++)
    {
        var row = rows[i];
        if (!FW.FBL.hasClass(row, "opened") && !FW.FBL.hasClass(row, "collapsed"))
            FBTest.click(row);
    }

    return rows;
};

/**
 * Executes passed callback as soon as an expected element is displayed within the
 * specified panel. A DOM node representing the UI is passed into the callback as
 * the only parameter.
 *
 * If 'config.onlyMutations' is set to true, the method is always waiting for changes
 * and ignoring the fact that the nodes might be already displayed.
 *
 * @param {String} panelName Name of the panel that shows the result.
 * @param {Object} config Requirements, which must be fulfilled to trigger the callback function
 *     (can include "tagName", "id", "classes", "attributes", "counter" and "onlyMutations")
 * @param {Function} callback A callback function with one parameter.
 */
this.waitForDisplayedElement = function(panelName, config, callback)
{
    if (!config)
    {
        // Default configuration for specific panels.
        config = {};
        switch (panelName)
        {
            case "net":
                config.tagName = "tr";
                config.classes = "netRow category-xhr hasHeaders loaded";
                break;

            case "console":
                config.tagName = "div";
                config.classes = "logRow logRow-spy loaded";
                break;

            default:
                FBTest.sysout("waitForDisplayedElement; ERROR Unknown panel name specified.");
                return;
        }
    }

    if (!config.counter)
        config.counter = 1;

    this.selectPanel(panelName);

    // If config.onlyMutations is not true, let's check the UI since the nodes we
    // are waiting for might me already displayed.
    if (!config.onlyMutations)
    {
        var panelNode = this.getPanel(panelName).panelNode;

        if (config.id)
        {
            var node = panelNode.getElementById(config.id);
            if (node)
            {
                setTimeout(function()
                {
                    callback(node);
                });
                return;
            }
        }
        else
        {
            // Expected elements can be already displayed. In such case just asynchronously
            // execute the callback (with the last element passed in).
            // Execute the callback if there is equal or more matched elements in the UI as
            // expected in the config.
            var nodes = panelNode.getElementsByClassName(config.classes);
            if (nodes.length >= config.counter)
            {
                setTimeout(function()
                {
                    callback(nodes[nodes.length-1]);
                });
                return;
            }
        }
    }

    var panelType = FW.Firebug.getPanelType(panelName);
    var doc = panelType.prototype.parentPanel ? this.getSidePanelDocument() :
        this.getPanelDocument();
    var mutationAttributes = {};
    if (config.id)
        mutationAttributes.id = config.id;
    else
        mutationAttributes.class = config.classes;

    if (config.attributes)
    {
        for (var prop in config.attributes)
            mutationAttributes[prop] = config.attributes[prop];
    }

    var recognizer = new MutationRecognizer(doc.defaultView, config.tagName, mutationAttributes);

    var tempCallback = callback;
    if (config.counter > 1)
    {
        /** @ignore */
        tempCallback = function(element)
        {
            var panelNode = FBTestFirebug.getPanel(panelName).panelNode;
            var nodes = panelNode.getElementsByClassName(config.classes);

            if (nodes.length < config.counter)
                FBTest.waitForDisplayedElement(panelName, config, callback);
            else
                // wwwFlorent: oddly, element != nodes[config.counter - 1]
                callback(nodes[config.counter - 1]);
        };
    }

    recognizer.onRecognizeAsync(tempCallback);
};

/**
 * Wait till a text is displayed in specified panel.
 * @param {Object} panelName Name of the panel where the text should appear.
 * @param {Object} text Text to wait for.
 * @param {Object} callback Executed as soon as the text is displayed.
 */
this.waitForDisplayedText = function(panelName, text, callback)
{
    var panel = this.selectPanel(panelName);
    var rec = new MutationRecognizer(panel.document.defaultView, "Text", {}, text);
    rec.onRecognizeAsync(callback);
};

this.waitForPanel = function(panelName, callback)
{
    panelBar1 = FW.Firebug.chrome.$("fbPanelBar1");
    panelBar1.addEventListener("selectingPanel",function onSelectingPanel(event)
    {
        var panel = panelBar1.selectedPanel;
        if (panel.name === panelName)
        {
            panelBar1.removeEventListener("selectingPanel", onSelectingPanel, false);
            callback(panel);
        }
        else
        {
            FBTest.sysout("waitForPanel saw "+panel.name);
        }
    }, false);
};

// ********************************************************************************************* //
// Console panel

this.clearConsole = function(chrome)
{
    this.clickToolbarButton(chrome, "fbConsoleClear");
};

// ********************************************************************************************* //
// Search

this.clearSearchField = function(callback)
{
    // FIX ME: characters should be sent into the search box individually
    // (using key events) to simulate incremental search.
    var searchBox = FW.Firebug.chrome.$("fbSearchBox");
    searchBox.value = "";

    var doc = searchBox.ownerDocument;
    doc.defaultView.focus();
    FBTest.focus(searchBox);

    FBTest.sendKey("RETURN", "fbSearchBox");

    if (callback)
    {
        // Firebug uses search delay so, we need to wait till the panel is updated
        // (see firebug/chrome/searchBox module, searchDelay constant).
        setTimeout(function() {
            callback()
        }, 250);
    }
}

this.getSearchFieldText = function()
{
    return FW.Firebug.chrome.$("fbSearchBox").value;
}

this.setSearchFieldText = function(searchText, callback)
{
    FBTest.clearSearchField(function()
    {
        // Focus the search box.
        var searchBox = FW.Firebug.chrome.$("fbSearchBox");
        var doc = searchBox.ownerDocument;
        doc.defaultView.focus();
        FBTest.focus(searchBox);

        // Send text into the input box.
        FBTest.synthesizeText(searchText, doc.defaultView);
        FBTest.sendKey("RETURN", "fbSearchBox");

        if (callback)
        {
            // Firebug uses search delay so, we need to wait till the panel is updated
            // (see firebug/chrome/searchBox module, searchDelay constant).
            setTimeout(function() {
                callback()
            }, 250);
        }
    });
}

/**
 * Executes search within the Script panel.
 * @param {String} searchText Keyword set into the search box.
 * @param {Function} callback Function called as soon as the result has been found.
 */
this.searchInScriptPanel = function(searchText, callback)
{
    FBTest.selectPanel("script");

    var config =
    {
        tagName: "div",
        classes: "sourceRow jumpHighlight"
    };

    FBTest.waitForDisplayedElement("script", config, function(element)
    {
        waitForUnhighlight(config, callback);
    });

    // Set search string into the search box.
    var searchBox = FW.Firebug.chrome.$("fbSearchBox");

    // FIXME: characters should be sent into the search box individually
    // (using key events) to simulate incremental search.
    searchBox.value = searchText;

    // Setting the 'value' property doesn't fire an 'input' event so,
    // press enter instead (asynchronously).
    FBTest.sendKey("RETURN", "fbSearchBox");
};

/**
 * Executes search within the CSS panel.
 * @param {String} searchText Keyword set into the search box.
 * @param {Function} callback Function called as soon as the result has been found.
 */
this.searchInCssPanel = function(searchText, callback)
{
    // FIXME: xxxpedro variable not used
    var panel = FBTest.selectPanel("stylesheet");

    var config =
    {
        tagName: "div",
        classes: "jumpHighlight"
    };

    FBTest.waitForDisplayedElement("stylesheet", config, function(element)
    {
        waitForUnhighlight(config, callback);
    });

    // Set search string into the search box
    var searchBox = FW.Firebug.chrome.$("fbSearchBox");

    // FIX ME: characters should be sent into the search box individually
    // (using key events) to simulate incremental search.
    searchBox.value = searchText;

    // Setting the 'value' property doesn't fire an 'input' event so,
    // press enter instead (asynchronously).
    FBTest.sendKey("RETURN", "fbSearchBox");
};

/**
 * Helper for searchInScriptPanel and searchInCssPanel, waits till the highlighted line
 * (using jumpHighlight class) is unhighlighted (Firebug unhilights this on timeout).
 *
 * @param {Object} config Specifies the tagName fo the target element.
 * @param {Object} callback
 */
function waitForUnhighlight(config, callback)
{
    var doc = FBTestFirebug.getPanelDocument();

    // Wait till jumpHighlight is removed.
    var attributes = {"class": "jumpHighlight"}
    var recognizer = new MutationRecognizer(doc.defaultView, config.tagName,
        null, null, attributes);

    recognizer.onRecognizeAsync(callback);
}

/**
 * Executes search within the HTML panel.
 * @param {String} searchText Keyword set into the search box.
 * @param {Function} callback Function called as soon as the result has been found.
 */
this.searchInHtmlPanel = function(searchText, callback)
{
    var panel = FBTest.selectPanel("html");

    // Reset the search box.
    var searchBox = FW.Firebug.chrome.$("fbSearchBox");
    searchBox.value = "";

    // The listener is automatically removed when the test window
    // is unloaded in case the seletion actually doesn't occur,
    // see FBTestSelection.js
    FBTestApp.SelectionController.addListener(function selectionListener()
    {
        var sel = panel.document.defaultView.getSelection();
        if (sel && !sel.isCollapsed && sel.toString() == searchText)
        {
            FBTestApp.SelectionController.removeListener(arguments.callee);
            callback(sel);
        }
    });

    // Focus the search box.
    var doc = searchBox.ownerDocument;
    doc.defaultView.focus();
    FBTest.focus(searchBox);

    // Send text into the input box.
    this.synthesizeText(searchText, doc.defaultView);

    FBTest.sendKey("RETURN", "fbSearchBox");
};

this.synthesizeText = function(str, win)
{
    synthesizeText({
        composition: {
            string: str,
            clauses: [
                { length: str.length, attr: COMPOSITION_ATTR_RAWINPUT }
            ]
        },
        caret: { start: str.length, length: 0 }
    }, win);
}

// ********************************************************************************************* //
// HTML Panel

/**
 * Waits for an HTML mutation inside the HTML panel
 * @param {String} chrome Chrome to use.
 * @param {String} tagName Name of the tag to observe.
 * @param {Function} callback Function called as soon as a mutation occurred.
 */
this.waitForHtmlMutation = function(chrome, tagName, callback)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    // FIXME: xxxpedro variable not used
    var htmlPanel = FBTest.selectPanel("html");
    var doc = FBTest.getPanelDocument();
    var view = doc.defaultView;
    var attributes = {"class": "mutated"};

    // Make sure that random mutations coming from other pages (but still in the
    // same view (panel.html) are ignored.
    function matches(element)
    {
        var panel = FW.Firebug.getElementPanel(element);
        if (panel != htmlPanel)
            return null;

        return MutationRecognizer.prototype.matches.apply(this, arguments);
    }

    // Wait for mutation event. The HTML panel will set "mutate" class on the
    // corresponding element.
    var mutated = new MutationRecognizer(view, tagName, attributes);
    mutated.matches = matches;
    mutated.onRecognize(function onMutate(node)
    {
        // Now wait till the HTML panel unhighlight the element (removes the mutate class)
        var unmutated = new MutationRecognizer(view, tagName, null, null, attributes);
        unmutated.matches = matches;
        unmutated.onRecognizeAsync(function onUnMutate(node)
        {
            callback(node);
        });
    });
};

/**
 * Selects an element within the HTML panel.
 * @param {String} element Name or ID of the element to select.
 * @param {Function} callback Function called as soon as the element is selected.
 */
this.selectElementInHtmlPanel = function(element, callback)
{
    // if the parameter is a string, then find the element with the given id
    if (typeof element == "string")
    {
        var id = element;
        element = FW.Firebug.currentContext.window.document.getElementById(id);

        if (!FBTest.ok(element, "the element #"+id+" must exist in the document"))
        {
            return;
        }
    }

    // select the elelement in the HTML Panel
    var htmlPanel = FBTest.getPanel("html");
    htmlPanel.select(element);

    // find the related nodeBox in the HTML Panel tree that corresponds to the element
    var nodeBox = htmlPanel.panelNode.querySelector(".nodeBox.selected");

    // call the callback with the nodeBox
    //setTimeout(function()
    //{
        callback(nodeBox);
    //},0);

    /*
    FBTest.searchInHtmlPanel(element, function(sel)
    {
        // Click on the element to make sure it's selected
        var nodeLabelBox = FW.FBL.getAncestorByClass(sel.anchorNode, "nodeLabelBox");
        var nodeTag = nodeLabelBox.querySelector(".nodeTag");
        FBTest.mouseDown(nodeTag);

        var nodeBox = FW.FBL.getAncestorByClass(sel.anchorNode, "nodeBox");
        callback(nodeBox);
    });
    */
};

/**
 * Returns selected node box - a <div> element in the HTML panel. The element should have
 * following classes set: "nodeBox containerNodeBox selected"
 */
this.getSelectedNodeBox = function()
{
    var panel = FBTest.getPanel("html");
    return panel.panelNode.querySelector(".nodeBox.selected");
}

//********************************************************************************************* //
// CSS panel
this.getAtRulesByType = function(type)
{
    var panel = FBTest.selectPanel("stylesheet");
    var ruleTypes = panel.panelNode.getElementsByClassName("cssRuleName");

    var rules = [];
    for (var i=0, len = ruleTypes.length; i<len; ++i)
    {
        if (ruleTypes[i].textContent == type)
            rules.push(FW.FBL.getAncestorByClass(ruleTypes[i], "cssRule"));
    }

    return rules;
};

this.getStyleRulesBySelector = function(selector)
{
    var panel = FBTest.selectPanel("stylesheet");
    var selectors = panel.panelNode.getElementsByClassName("cssSelector");

    var rules = [];
    for (var i = 0, len = selectors.length; i < len; ++i)
    {
        if (selectors[i].textContent.indexOf(selector) != -1)
            rules.push(FW.FBL.getAncestorByClass(selectors[i], "cssRule"));
    }

    return rules;
};


// ********************************************************************************************* //
// Context menu

/**
 * Opens context menu for target element and executes specified command.
 * Context menu listener is registered through ContextMenuController object, which ensures
 * that the listener is removed at the end of the test even in cases where the context menu
 * is never opened and so, the listener not removed by the test itself.
 *
 * @param {Element} target Element, which's context menu should be opened
 * @param {String or Object} menuItemIdentifier ID or object holding the label of the
 *      menu item, that should be executed
 * @param {Function} callback Function called as soon as the element is selected.
 */
this.executeContextMenuCommand = function(target, menuItemIdentifier, callback)
{
    var contextMenu = ContextMenuController.getContextMenu(target);

    var self = this;

    function onPopupShown(event)
    {
        ContextMenuController.removeListener(target, "popupshown", onPopupShown);

        // Fire the event handler asynchronously so items have a chance to be appended.
        setTimeout(function()
        {
            var menuItem;
            if (typeof menuItemIdentifier == "string" || menuItemIdentifier.id)
            {
                var menuItemId = menuItemIdentifier.id || menuItemIdentifier;
                menuItem = contextMenu.ownerDocument.getElementById(menuItemId);
            }
            else if (menuItemIdentifier.label)
            {
                var menuItemId = menuItemIdentifier.label;
                for (var item = contextMenu.firstChild; item; item = item.nextSibling)
                {
                    if (item.label == menuItemId)
                    {
                        menuItem = item;
                        break;
                    }
                }
            }

            self.ok(menuItem, "'" + menuItemId + "' item must be available in the context menu.");

            // If the menu item isn't available close the context menu and bail out.
            if (!menuItem)
            {
                contextMenu.hidePopup();
                return;
            }

            var submenupopup = FW.FBL.getAncestorByTagName(menuItem, "menupopup");
            // if the item appears in a sub-menu:
            if (submenupopup && submenupopup.parentNode.tagName === "menu")
            {
                var isParentEnabled = submenupopup.parentNode.disabled === false;
                self.ok(isParentEnabled, "the parent \""+submenupopup.parentNode.label+
                    "\" of the sub-menu must be enabled");
                if (!isParentEnabled)
                {
                    contextMenu.hidePopup();
                    return;
                }
                submenupopup.showPopup();
            }

            // Click on specified menu item.
            self.synthesizeMouse(menuItem);

            // Make sure the context menu is closed.
            contextMenu.hidePopup();

            if (callback)
            {
                // Since the command is dispatched asynchronously,
                // execute the callback using timeout.
                // Especially Mac OS needs this.
                setTimeout(function()
                {
                    callback();
                }, 250);
            }
        }, 10);
    }

    // Wait till the menu is displayed.
    ContextMenuController.addListener(target, "popupshown", onPopupShown);

    // Right click on the target element.
    var eventDetails = {type: "contextmenu", button: 2};
    this.synthesizeMouse(target, 2, 2, eventDetails);
};

// ********************************************************************************************* //
// Clipboard

/**
 * Clears the current textual content in the clipboard.
 */
this.clearClipboard = function()
{
    this.setClipboardText("");
};

/**
 * Sets provided text into the clipboard
 * @param {Object} text String to put into the clipboard.
 */
this.setClipboardText = function(text)
{
    try
    {
        var clipboard = Cc["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard);
        var trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
        trans.addDataFlavor("text/unicode");

        var string = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
        string.data = text;
        trans.setTransferData("text/unicode", string, text.length * 2);

        clipboard.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
    }
    catch (e)
    {
        FBTest.exception("setClipboardText", e);
        FBTest.sysout("setClipboardText FAILS " + e, e);
    }
};

/**
 * Returns the current textual content in the clipboard
 */
this.getClipboardText = function()
{
    try
    {
        var clipboard = Cc["@mozilla.org/widget/clipboard;1"].getService(Ci.nsIClipboard);
        var trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
        trans.addDataFlavor("text/unicode");
        clipboard.getData(trans, Ci.nsIClipboard.kGlobalClipboard);

        var str = new Object();
        var strLength = new Object();
        trans.getTransferData("text/unicode", str, strLength);
        str = str.value.QueryInterface(Ci.nsISupportsString);
        return str.data.substring(0, strLength.value / 2);
    }
    catch (e)
    {
        FBTest.exception("getClipboardText", e);
        FBTest.sysout("getClipboardText FAILS " + e, e);
    }

    return null;
};

/**
 * Wait till the an expected text is available in the clipboard.
 *
 * @param {Object} expected The text that should appear in the clipboard. Can be also
 *      a regular expression.
 * @param {Object} callback A callback executed when the text is sucessfully set or
 *      on timeout. The method regularly checks the clipboard for 5 sec.
 */
this.waitForClipboard = function(expected, callback)
{
    var timeout = 250;
    var counter = 20;
    var self = this;

    function checkClipboard()
    {
        counter--;

        var text = self.getClipboardText();

        var result;
        if (expected instanceof RegExp)
            result = text ? text.match(expected) : false;
        else
            result = (text == expected);

        // If the text is set or we tried N times, execute the callback.
        // Otherwise, try again later.
        if (result || counter <= 0)
            callback(text);
        else
            setTimeout(checkClipboard, timeout);
    }

    // Start checking clipboard on timeout.
    setTimeout(checkClipboard, timeout);
};

// ********************************************************************************************* //
// Firefox Version

/**
 * Compare expected Firefox version with the current Firefox installed.
 *
 * Example:
 * ~~
 * if (compareFirefoxVersion("3.6") >= 0)
 * {
 *     // execute code for Firebug 3.6+
 * }
 * ~~
 *
 * @param {Object} expectedVersion Expected version of Firefox.
 * @returns
 * -1 the current version is smaller
 *  0 the current version is the same
 *  1 the current version is bigger
 */
this.compareFirefoxVersion = function(expectedVersion)
{
    var versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].
        getService(Ci.nsIVersionComparator);
    var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
    return versionChecker.compare(appInfo.version, expectedVersion);
};

// ********************************************************************************************* //
// Support for asynchronous test suites (within a FBTest).

/**
 * Support for set of asynchronous actions within a FBTest.
 *
 * Example:
 * ~~
 *  // A suite of asynchronous tests.
 *  var testSuite = [];
 *  testSuite.push(function(callback) {
 *      // TODO: test implementation
 *      // Continue with other tests.
 *      callback();
 *  });
 *  testSuite.push(function(callback) {
 *      // TODO: test implementation
 *      // Continue with other tests.
 *      callback();
 *  });
 *  // Run entire suite.
 *  runTestSuite(testSuite, function() {
 *      FBTestFirebug.testDone("DONE");
 *  });
 * ~~
 * @param {Array} tests List of asynchronous functions to be executed in order.
 * @param {Function} callback A callback that is executed as soon
 *                   as all fucntions in the list are finished.
 * @param {Number} delay A delay between tasks [ms]
 */
this.runTestSuite = function(tests, callback, delay)
{
    delay = delay || 200;

    setTimeout(function()
    {
        var test = tests.shift();
        if (!test)
        {
            callback();
            return;
        }

        function runNext()
        {
            FBTestFirebug.runTestSuite(tests, callback, delay);
        }

        try
        {
            test.call(this, runNext);
        }
        catch (err)
        {
            FBTest.exception("runTestSuite", err);
        }
    }, delay);
};

// ********************************************************************************************* //
// Task List (replaces the single runTestSuite method.

this.TaskList = function()
{
    this.tasks = [];
};

this.TaskList.prototype =
{
    push: function()
    {
        var args = FW.FBL.cloneArray(arguments);
        args = FW.FBL.arrayInsert(args, 1, [window]);
        this.tasks.push(FW.FBL.bind.apply(this, args));
    },

    /**
     * Wrap a function that does not take a callback parameter and push it to the list.
     */
    wrapAndPush: function(func)
    {
        var args = Array.prototype.slice.call(arguments, 1);
        this.push(function(callback)
        {
            func.apply(null, args);
            callback();
        });
    },

    run: function(callback, delay)
    {
        FBTest.runTestSuite(this.tasks, callback, delay);
    }
};

// ********************************************************************************************* //
// Screen copy

this.getImageDataFromNode = function(node, x, y, width, height)
{
    var top = 0;
    var left = 0;
    var currentNode = node;
    do
    {
        top += currentNode.offsetTop;
        left += currentNode.offsetLeft;
        currentNode = currentNode.parentNode;
    } while (currentNode.parentNode !== currentNode.ownerDocument);

    if (x)
        left += x;
    if (y)
        top += y;

    var canvas = this.getCanvasFromWindow(node.ownerDocument.defaultView, left, top,
        width || node.clientWidth, height || node.clientHeight);
    return canvas.toDataURL("image/png", "");
};

this.getImageDataFromWindow = function(win, width, height)
{
    var canvas = this.getCanvasFromWindow(win, 0, 0, width, height);
    return canvas.toDataURL("image/png", "");
};

this.getCanvasFromWindow = function(win, top, left, width, height)
{
    var canvas = createCanvas(width, height);
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.scale(1, 1);
    ctx.drawWindow(win, top, left, width, height, "rgb(255,255,255)");
    ctx.restore();
    return canvas;
};

this.loadImageData = function(url, callback)
{
    var image = new Image();
    /** @ignore */
    image.onload = function()
    {
        var width = image.width;
        var height = image.height;

        var canvas = createCanvas(image.width, image.height);
        var ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, width, height);
        callback(canvas.toDataURL("image/png", ""));
    };

    image.src = url;
    return image;
};

this.saveWindowImageToFile = function(win, width, height, destFile)
{
    var canvas = this.getCanvasFromWindow(win, width, height);

    // convert string filepath to an nsIFile
    var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(destFile);

    // create a data url from the canvas and then create URIs of the source and targets
    var io = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    var source = io.newURI(canvas.toDataURL("image/png", ""), "UTF8", null);
    var target = io.newFileURI(file);

    // prepare to save the canvas data
    var persist = Cc["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].
        createInstance(Ci.nsIWebBrowserPersist);

    persist.persistFlags = Ci.nsIWebBrowserPersist.PERSIST_FLAGS_REPLACE_EXISTING_FILES;
    persist.persistFlags |= Ci.nsIWebBrowserPersist.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;

    // displays a download dialog (remove these 3 lines for silent download)
    var xfer = Cc["@mozilla.org/transfer;1"].createInstance(Ci.nsITransfer);
    xfer.init(source, target, "", null, null, null, persist);
    persist.progressListener = xfer;

    // save the canvas data to the file
    persist.saveURI(source, null, null, null, null, file);
};

function createCanvas(width, height)
{
     var canvas = document.createElement("canvas");
     canvas.style.width = width + "px";
     canvas.style.height = height + "px";
     canvas.width = width;
     canvas.height = height;
     return canvas;
}

// ********************************************************************************************* //
// Inspector
this.inspectElement = function(elt)
{
    FBTest.clickToolbarButton(FW.Firebug.chrome, "fbInspectButton");
    FBTest.click(elt);
};

this.inspectUsingFrame = function(elt)
{
    FW.Firebug.Inspector.highlightObject(elt, FW.Firebug.currentContext, "frame", null);
};

this.inspectUsingBoxModel = function(elt)
{
    FW.Firebug.Inspector.highlightObject(elt, FW.Firebug.currentContext, "boxModel", null);
};

this.inspectUsingBoxModelWithRulers = function(elt)
{
    FW.Firebug.Inspector.highlightObject(elt, FW.Firebug.currentContext, "boxModel", "content");
};

this.inspectorClear = function()
{
    FW.Firebug.Inspector.highlightObject(null);
};

// ********************************************************************************************* //
// DOM

/**
 * Waits till a specified property is displayed in the DOM panel.
 *
 * @param {String} propName Name of the property to be displayed
 * @param {Function} callback Function called after the property is visible.
 * @param {Boolean} checkAvailability Execute the callback synchronously if the property
 *      is already available.
 */
this.waitForDOMProperty = function(propName, callback, checkAvailability)
{
    var panel = FBTest.getPanel("dom");
    if (checkAvailability)
    {
        var row = getDOMMemberRow(panel, propName);
        if (row)
            return callback(row);
    }

    var recognizer = new MutationRecognizer(panel.document.defaultView,
        "Text", {}, propName);

    recognizer.onRecognizeAsync(function(element)
    {
        var row = FW.FBL.getAncestorByClass(element, "memberRow");

        // If the memberRow isn't there, the mutation comes from different panel (console?).
        if (!row)
            FBTest.waitForDOMProperty(propName, callback, checkAvailability);
        else
            callback(row);
    });
};

this.refreshDOMPanel = function()
{
    var panel = this.getPanel("dom");
    panel.rebuild(true);
};

/**
 * Returns the row element "&lt;tr&gt;" from the DOM panel for specified member name.
 *
 * @param {Object} chrome The current Firebug's chrome (optional)
 * @param {Object} propName The name of the member displayed in the panel.
 */
this.getDOMPropertyRow = function(chrome, propName)
{
    if (!chrome)
        chrome = FW.Firebug.chrome;

    var domPanel = FBTest.getPanel("dom", true);
    FBTest.ok(domPanel, "The DOM panel must be there");

    return getDOMMemberRow(domPanel, propName);
};

// ********************************************************************************************* //
// Tooltips

this.showTooltip = function(target, callback)
{
    function onTooltipShowing(event)
    {
        TooltipController.removeListener(onTooltipShowing);

        callback(event.target);
    }

    // Tooltip controller ensures clean up (listners removal) in cases
    // when the tooltip is never shown and so, the listener not removed.
    TooltipController.addListener(onTooltipShowing);

    var win = target.ownerDocument.defaultView;

    try
    {
        disableNonTestMouseEvents(win, true);

        this.synthesizeMouse(target, 2, 2, {type: "mouseover"});
        this.synthesizeMouse(target, 4, 4, {type: "mousemove"});
        this.synthesizeMouse(target, 6, 6, {type: "mousemove"});
    }
    catch (e)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("EXCEPTION " + e, e);
    }
    finally
    {
        disableNonTestMouseEvents(win, false);
    }
}

// ********************************************************************************************* //
// Module Loader

this.getRequire = function()
{
    if (typeof FW.require !== "undefined")
        return FW.require;

    var fbMainFrame = FW.document.getElementById("fbMainFrame");
    return fbMainFrame.contentWindow.require;
};

// ********************************************************************************************* //
// Shortcuts

this.sendShortcut = function(aKey, aEvent, aWindow)
{
    aWindow = aWindow || FW;
    return FBTest.synthesizeKey(aKey, aEvent, aWindow);
};

// ********************************************************************************************* //
// Inspector

this.isInspectorActive = function()
{
    return FW.Firebug.Inspector.inspecting;
};

// ********************************************************************************************* //
// OS

this.isMac = function()
{
    var hiddenWindow = Cc["@mozilla.org/appshell/appShellService;1"]
        .getService(Ci.nsIAppShellService).hiddenDOMWindow;
    return (hiddenWindow.navigator.platform.indexOf("Mac") >= 0);
}

// ********************************************************************************************* //
}).apply(FBTest);
