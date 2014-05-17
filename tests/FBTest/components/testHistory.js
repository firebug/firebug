/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

// Test list history
const TEST_CLASS_ID = Components.ID("{3008FA55-C12F-4992-9930-B9D52F0CF037}");
const TEST_CLASS_NAME = "FBTest: Test List History";
const TEST_CONTRACT_ID = "@mozilla.org/autocomplete/search;1?name=FBTestHistory";

// Test case history
const CASE_CLASS_ID = Components.ID("{B37D6564-77D9-4613-B088-324389E1A8F3}");
const CASE_CLASS_NAME = "FBTest: Source Server History";
const CASE_CONTRACT_ID = "@mozilla.org/autocomplete/search;1?name=FBTestCaseHistory";

// Test driver history
const DRIVER_CLASS_ID = Components.ID("{3882FC1B-D32A-4722-B935-FA82142808A5}");
const DRIVER_CLASS_NAME = "FBTest: Test Driver URL History";
const DRIVER_CONTRACT_ID = "@mozilla.org/autocomplete/search;1?name=FBTestDriverHistory";

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);

Components.utils["import"]("resource://gre/modules/XPCOMUtils.jsm");

// ********************************************************************************************* //
// Test URL History, nsIAutoCompleteSearch

function History() {}
History.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // XPCOM

    QueryInterface: XPCOMUtils.generateQI([
        Ci.nsISupports,
        Ci.nsIAutoCompleteSearch
    ]),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // nsIAutoCompleteSearch

    startSearch: function(searchString, searchParam, previousResult, listener)
    {
        // Get all test-lists from preferences.
        var history = prefs.getCharPref(this.pref);
        var arr = history.split(",");

        var map = {};
        var results = [];
        for (var i=0; i<arr.length; i++)
        {
            var url = trimSpaces(arr[i]);
            if (url && !map[url] && (!searchString || url.indexOf(searchString) > 0))
            {
                map[url] = true;
                results.push(url);
            }
        }

        listener.onSearchResult(this, new SearchResult(searchString,
            Ci.nsIAutoCompleteResult.RESULT_SUCCESS,
            0, results));
    },

    stopSearch: function()
    {
    }
};

function trimSpaces(text)
{
    return text.replace(/^\s*|\s*$/g,"");
}

// ********************************************************************************************* //
// Implements nsIAutoCompleteResult

function SearchResult(searchString, searchResult, defaultIndex, results)
{
    this.searchString = searchString;
    this.searchResult = searchResult;
    this.defaultIndex = defaultIndex;
    this.results = results;
}

SearchResult.prototype =
{
    searchString: "",
    searchResult: 0,
    defaultIndex: 0,
    results: [],
    errorDescription: "",

    get matchCount()
    {
        return this.results.length;
    },

    getValueAt: function(index)
    {
        return this.results[index];
    },

    getCommentAt: function(index)
    {
        return "";
    },

    getStyleAt: function(index)
    {
        return null;
    },

    getImageAt: function (index)
    {
        return "";
    },

    removeValueAt: function(index, removeFromDb)
    {
        this.results.splice(index, 1);
    },

    getLabelAt: function(index)
    {
        return this.results[index];
    },

    getFinalCompleteValueAt: function(index)
    {
        return this.getValueAt(index);
    },

    QueryInterface: function(aIID)
    {
        if (!aIID.equals(Ci.nsIAutoCompleteResult) &&
            !aIID.equals(Ci.nsISupports))
            throw Components.results.NS_ERROR_NO_INTERFACE;

        return this;
    }
};

// ********************************************************************************************* //
// Helper

function extend(l, r)
{
    var newOb = {};
    for (var n in l)
        newOb[n] = l[n];
    for (var n in r)
        newOb[n] = r[n];
    return newOb;
};

// ********************************************************************************************* //
// Registration

function TestHistory()
{
    this.pref = "extensions.fbtest.history";
    this.wrappedJSObject = this;
}

TestHistory.prototype = extend(History.prototype,
{
    classID: TEST_CLASS_ID,
    classDescription: TEST_CLASS_NAME,
    contractID: TEST_CONTRACT_ID,
});

// ********************************************************************************************* //

function TestCaseHistory()
{
    this.pref = "extensions.fbtest.testCaseHistory";
    this.wrappedJSObject = this;
}

TestCaseHistory.prototype = extend(History.prototype,
{
    classID: CASE_CLASS_ID,
    classDescription: CASE_CLASS_NAME,
    contractID: CASE_CONTRACT_ID,
});

// ********************************************************************************************* //

function TestDriverHistory()
{
    this.pref = "extensions.fbtest.testDriverHistory";
    this.wrappedJSObject = this;
}

TestDriverHistory.prototype = extend(History.prototype,
{
    classID: DRIVER_CLASS_ID,
    classDescription: DRIVER_CLASS_NAME,
    contractID: DRIVER_CONTRACT_ID,
});

// ********************************************************************************************* //

var components = [TestHistory, TestCaseHistory, TestDriverHistory];

if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule(components);

// ********************************************************************************************* //
