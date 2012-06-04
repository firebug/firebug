/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/xpcom",
],
function(Obj, Xpcom) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var clipboard = Xpcom.CCSV("@mozilla.org/widget/clipboard;1", "nsIClipboard");
var versionChecker = Xpcom.CCSV("@mozilla.org/xpcom/version-comparator;1", "nsIVersionComparator");

// ********************************************************************************************* //
// Clipboard helper

/**
 * @class This class implements clibpoard functionality.
 */
var CookieClipboard = Obj.extend(Object,
/** @lends CookieClipboard */
{
    cookieFlavour: "text/firecookie-cookie",
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
            ERROR(err);
        }
    },

    getFrom: function()
    {
        try
        {
            var str = this.getTransferData();

            if (FBTrace.DBG_COOKIES)
                FBTrace.sysout("cookies.Get Cookie data from clipboard: " + str + "\n");

            return parseFromJSON(str);
        }
        catch (err)
        {
            ERROR(err);
        }

        return null;
    },

    isCookieAvailable: function()
    {
        try
        {
            if (!clipboard)
                return false;

            // nsIClipboard interface has been changed in FF3.
            if (versionChecker.compare(appInfo.version, "3.0*") >= 0)
            {
                // FF3
                return clipboard.hasDataMatchingFlavors([this.cookieFlavour], 1,
                    Ci.nsIClipboard.kGlobalClipboard);
            }
            else
            {
                // FF2
                var array = Xpcom.CCIN("@mozilla.org/supports-array;1", "nsISupportsArray");
                var element = Xpcom.CCIN("@mozilla.org/supports-cstring;1", "nsISupportsCString");
                element.data = this.cookieFlavour;
                array.AppendElement(element);
                return clipboard.hasDataMatchingFlavors(array, Ci.nsIClipboard.kGlobalClipboard);
            }
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
        trans.addDataFlavor(this.cookieFlavour);

        clipboard.getData(trans, Ci.nsIClipboard.kGlobalClipboard);

        var str = new Object();
        var strLength = new Object();

        trans.getTransferData(this.cookieFlavour, str, strLength);

        if (!str.value) 
            return null;

        str = str.value.QueryInterface(nsISupportsString);
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

