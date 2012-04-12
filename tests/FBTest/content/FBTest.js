/* See license.txt for terms of usage */

/**
 * The FBTest object is injected into this scope by Firebug test harness.
 *
 * Note that this file is directly loaded into a test frame together with a test driver file,
 * just before the driver file is parsed/executed by the test harness (testRunner.js) and the
 * runTest method called.
 */

// ************************************************************************************************
// Constants

// XPCOM
var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;

// ************************************************************************************************
// Initialization

(function() {

// Test APIs initialization
function initialize()
{
    var loader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);

    // Load all test APIs
    // xxxHonza: should be extendable from Firebug extensions.
    loader.loadSubScript(chromeToUrl("chrome://fbtest/content/FBTestFirebug.js"), this);
    loader.loadSubScript(chromeToUrl("chrome://fbtest/content/FBTestMutation.js"), this);
    loader.loadSubScript(chromeToUrl("chrome://fbtest/content/FBTestSelection.js"), this);

    FBTest.sysout("FBTest; Test API initialized");
}

function chromeToUrl(path)
{
    var chromeRegistry = Cc['@mozilla.org/chrome/chrome-registry;1'].getService(Ci.nsIChromeRegistry);
    var ios = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService);
    var uri = ios.newURI(path, "UTF-8", null);
    return chromeRegistry.convertChromeURL(uri).spec;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

try
{
    initialize();

    // Helper shortcuts
    window.FW = FBTest.FirebugWindow;   // Set by test harness
    window.basePath = FBTest.getHTTPURLBase();
    window.baseLocalPath = FBTest.getLocalURLBase();
}
catch (e)
{
    FBTrace.sysout("FBTest; EXCEPTION " + e, e);
}

})();

// ************************************************************************************************
