/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Registration

var FBTestApp =
{
    initialize: function()
    {
        FBTestApp.prefDomain = "extensions.fbtest";

        // Initialize global variables before all the namespaces are initialized.
        var args = window.arguments[0];
        window.initWithParams(args);

        // Set the Firebug window now. In case of a new window we have to wait
        // till all namespaces are initialized.
        FBTestApp.FBTest.FirebugWindow = args.firebugWindow;

        // Now we can initialize entire console.
        FBTestApp.TestConsole.initialize();
    },

    shutdown: function()
    {
        window.removeEventListener("load", FBTestApp.initialize, false);
        window.removeEventListener("unload", FBTestApp.shutdown, false);

        FBTestApp.TestConsole.shutdown();
    },
};

// ********************************************************************************************* //
// Helper method for passing arguments into an existing window.

window.initWithParams = function(args)
{
    // Get default test list and optional test to be executed from the command line.
    var testListURI = args.testListURI;
    if (testListURI && testListURI.indexOf("#") > 0)
    {
        var params = testListURI.split("#");
        FBTestApp.defaultTestList = params[0];
        FBTestApp.defaultTest = params[1];
    }
    else
    {
        FBTestApp.defaultTestList = testListURI;
    }

    // The FBTest object might exist if an existing window is initializing
    // with new parameters.
    if (FBTestApp.FBTest)
        FBTestApp.FBTest.FirebugWindow = args.firebugWindow;
};

// ********************************************************************************************* //
// Registration

// Register handlers to maintain extension life cycle.
window.addEventListener("load", FBTestApp.initialize, false);
window.addEventListener("unload", FBTestApp.shutdown, false);

// xxxHonza: hack
window.FBTestApp = FBTestApp;

return FBTestApp;

// ********************************************************************************************* //
});
