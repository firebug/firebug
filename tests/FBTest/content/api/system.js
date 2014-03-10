/* See license.txt for terms of usage */

/**
 * This file defines System APIs for test drivers.
 */

(function() {

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
// Clipboard API

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

        var str = {};
        var strLength = {};
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
 * The method regularly checks the clipboard and re-executes the copying function multiple times
 * in case the clipboard doesn't contain the text.
 *
 * @param {String|RegExp} expected - Text that should appear in the clipboard. Can also be
 *      a regular expression.
 * @param {Function} copyingFunction - Function that causes the text to be copied to the clipboard
 * @param {Function} callback - Callback function executed when the text is successfully set or
 *      on timeout.
 */
this.waitForClipboard = function(expected, copyingFunction, callback)
{
    var checkTimeout = 50;
    var copyCounter = 5;
    var checks = 10;
    var checkCounter = 0;
    var text = "";
    var self = this;

    // Execute the copying function and check the clipboard
    function executeAndVerifyClipboard()
    {
        copyCounter--;

        if (copyCounter > 0)
        {
            copyingFunction();

            checkCounter = checks;
            setTimeout(checkClipboard, checkTimeout);
        }
        else
        {
            callback(text);
        }
    }

    // Check the clipboard for the expected text. Repeat the check after a while
    // if the clipboard doesn't contain the text.
    function checkClipboard()
    {
        checkCounter--;

        text = self.getClipboardText();

        var result;
        if (expected instanceof RegExp)
            result = text ? text.match(expected) : false;
        else
            result = (text == expected);

        // If the text is set, execute the callback. If we tried N times without result,
        // execute the copying function again and check again. Otherwise, try again later.
        if (result)
            callback(text);
        else if (checkCounter === 0)
            executeAndVerifyClipboard();
        else
            setTimeout(checkClipboard, checkTimeout);
    }
    
    executeAndVerifyClipboard();
};

this.waitForClipboard2 = function(expected, copyingFunction, callback)
{
    var timeout = 250;
    var counter = 20;
    var self = this;
    
    function executeAndVerifyClipboard()
    {
        copyingFunction();
        
        // Start checking clipboard on timeout
        setTimeout(checkClipboard, timeout);
    }
    
    function checkClipboard()
    {
        counter--;
        copyingFunction();
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
            executeAndVerifyClipboard();
    }
    
    executeAndVerifyClipboard();
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
// OS

this.isMac = function()
{
    var hiddenWindow = Cc["@mozilla.org/appshell/appShellService;1"]
        .getService(Ci.nsIAppShellService).hiddenDOMWindow;
    return (hiddenWindow.navigator.platform.indexOf("Mac") >= 0);
}

// ********************************************************************************************* //
}).apply(FBTest);
