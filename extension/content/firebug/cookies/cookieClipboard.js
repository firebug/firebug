/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/xpcom",
],
function(Obj, Xpcom) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;

var clipboard = Xpcom.CCSV("@mozilla.org/widget/clipboard;1", "nsIClipboard");

// ********************************************************************************************* //
// Clipboard helper

/**
 * @class This class implements clibpoard functionality.
 */
var CookieClipboard = Obj.extend(Object,
/** @lends CookieClipboard */
{
    cookieFlavour: "text/firebug-cookie",
    unicodeFlavour: "text/unicode",

    copyTo: function(cookie)
    {
        try
        {
            var trans = this.createTransferData(cookie);
            if (trans && clipboard)
                clipboard.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("cookies.CookieClipboard.copyTo; EXCEPTION " + err, err);
        }
    },

    getFrom: function()
    {
        try
        {
            var str = this.getTransferData();

            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.Get Cookie data from clipboard: " + str);

            return parseFromJSON(str);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("cookies.CookieClipboard.getFrom; EXCEPTION " + err, err);
        }

        return null;
    },

    isCookieAvailable: function()
    {
        try
        {
            if (!clipboard)
                return false;

            return clipboard.hasDataMatchingFlavors([this.cookieFlavour], 1,
                Ci.nsIClipboard.kGlobalClipboard);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("cookies.isCookieAvailable; EXCEPTION " + err, err);
        }

        return false;
    },

    createTransferData: function(cookie)
    {
        var trans = Xpcom.CCIN("@mozilla.org/widget/transferable;1", "nsITransferable");

        // See https://bugzilla.mozilla.org/show_bug.cgi?id=722872
        if (typeof(trans.init) == "function")
            trans.init(null);

        var json = cookie.toJSON();
        var wrapper1 = Xpcom.CCIN("@mozilla.org/supports-string;1", "nsISupportsString");
        wrapper1.data = json;
        trans.addDataFlavor(this.cookieFlavour);
        trans.setTransferData(this.cookieFlavour, wrapper1, json.length * 2);

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.Create JSON transfer data : " + json, cookie);

        var str = cookie.toString();
        var wrapper2 = Xpcom.CCIN("@mozilla.org/supports-string;1", "nsISupportsString");
        wrapper2.data = str;
        trans.addDataFlavor(this.unicodeFlavour);
        trans.setTransferData(this.unicodeFlavour, wrapper2, str.length * 2);

        if (FBTrace.DBG_COOKIES)
            FBTrace.sysout("cookies.Create string transfer data : " + str, cookie);

        return trans;
    },

    getTransferData: function()
    {
        var trans = Xpcom.CCIN("@mozilla.org/widget/transferable;1", "nsITransferable");

        // See https://bugzilla.mozilla.org/show_bug.cgi?id=722872
        if (typeof(trans.init) == "function")
            trans.init(null);

        trans.addDataFlavor(this.cookieFlavour);

        clipboard.getData(trans, Ci.nsIClipboard.kGlobalClipboard);

        var str = new Object();
        var strLength = new Object();

        trans.getTransferData(this.cookieFlavour, str, strLength);

        if (!str.value)
            return null;

        str = str.value.QueryInterface(Ci.nsISupportsString);
        return str.data.substring(0, strLength.value / 2);
    }
});

// ********************************************************************************************* //
// Helpers

function parseFromJSON(json)
{
    try
    {
        // Parse JSON string. In case of Firefox 3.5 the native support is used,
        // otherwise the cookie clipboard doesn't work.
        return JSON.parse(json);
    }
    catch (err)
    {
        if (FBTrace.DBG_ERRORS || FBTrace.DBG_COOKIES)
            FBTrace.sysout("Failed to parse a cookie from JSON data: " + err, err);
    }

    return null;
}

// ********************************************************************************************* //
// Registration

return CookieClipboard;

// ********************************************************************************************* //
});

