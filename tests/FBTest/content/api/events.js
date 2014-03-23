/* See license.txt for terms of usage */

/**
 * This file defines Events APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// Basic Events API

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
    var win = _getWindowForTarget(aTarget);
    return sendChar(aChar, win);
};

/**
 * Send the string aStr to the node with id aTarget.
 *
 * For now this method only works for English letters (lower and upper case)
 * and the digits 0-9.
 */
this.sendString = function(aStr, aTarget)
{
    var win = _getWindowForTarget(aTarget);
    return sendString(aStr, win);
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
    var win = _getWindowForTarget(aTarget);
    return sendKey(aKey, win);
};

this.synthesizeMouse = function(node, offsetX, offsetY, event, win)
{
    if (!node)
    {
        FBTest.ok(false, "ERROR no target node");
        return;
    }

    win = win || node.ownerDocument.defaultView;

    event = event || {};

    var rectCollection = node.getClientRects();

    // Use the first client rect for clicking (e.g. SPAN can have more).
    var rect = rectCollection[0]; //node.getBoundingClientRect();

    FBTest.sysout("synthesizeMouse; rect", rectCollection);

    // Log the message only in case of a failure.
    if (!rect)
    {
        FBTest.ok(rect, "Mouse event must be synthesized");
        return;
    }

    var frameOffset = getFrameOffset(node);

    FBTest.sysout("frameOffset " + frameOffset);

    // Hit the middle of the button
    // (Clicks to hidden parts of the element doesn't open the context menu).
    offsetX = (typeof offsetX === "number" ? offsetX : 0.5 * Math.max(1, rect.width));
    offsetY = (typeof offsetY === "number" ? offsetY : 0.5 * Math.max(1, rect.height));

    // include frame offset
    offsetX += frameOffset.left;
    offsetY += frameOffset.top;

    synthesizeMouse(node, offsetX, offsetY, event, win);
};

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

    FBTrace.sysout("DEPRECATE WARNING: FBTest.pressKey() should not be used. " +
        "Use FBTest.sendKey() instead.");

    return this.sendKey(getKeyName(keyCode), target);
};

this.sendShortcut = function(aKey, aEvent, aWindow)
{
    aWindow = aWindow || FW;
    return FBTest.synthesizeKey(aKey, aEvent, aWindow);
};

// ********************************************************************************************* //
// Advanced Event API

this.clickContentButton = function(win, buttonId)
{
    FBTest.sysout("clickContentButton; " + buttonId);

    FBTest.click(win.document.getElementById(buttonId));
};

// ********************************************************************************************* //
// Local Helpers

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

function _getEventTarget(aTarget)
{
    //var loc = FW.Firebug.currentContext ? FW.FBL.getFileName(
    // FW.Firebug.currentContext.window.location.href) : "NULL";
    //if (aTarget && !(aTarget instanceof Node))
    //    FBTrace.sysout("[" + aTarget + " | " + loc + "]");

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

function _getWindowForTarget(aTarget)
{
    aTarget = _getEventTarget(aTarget);
    return aTarget.ownerDocument.defaultView;
}

// ********************************************************************************************* //
}).apply(FBTest);
