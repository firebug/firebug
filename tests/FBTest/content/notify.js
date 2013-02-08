/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// ********************************************************************************************* //
// Connects FBTest to other modules via global events

var Rebroadcaster =
{
    onTestStart: function(aTest)
    {
        if (!this.observerService)
            Cu["import"]("resource://firebug/observer-service.js", this);

        if (this.fbObserverService)
            this.fbObserverService.notifyObservers(this, "fbtest-start-case", aTest);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    replay: function(aTest)
    {
        FBTestApp.TestRunner.runTest(aTest);
    }
};

// ********************************************************************************************* //
// Registration

FBTestApp.TestRunner.addListener(Rebroadcaster);

return Rebroadcaster;

// ********************************************************************************************* //
});
