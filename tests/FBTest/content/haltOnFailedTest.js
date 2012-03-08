/* See license.txt for terms of usage */

FBTestApp.ns(function() { with (FBL) {

// ************************************************************************************************
// Halt On Failed Test Implementation

var Cc = Components.classes;
var Ci = Components.interfaces;

// Services
var loader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);

// ************************************************************************************************

FBTestApp.TestWindowLoader.HaltOnFailedTest =
{
    initialize: function()
    {
        // Localize strings in XUL (using string bundle).
        this.internationalizeUI();

        FBTestApp.TestWindowLoader.HaltOnFailedTest.enabled = Firebug.getPref(FBTestApp.prefDomain, "haltOnFailedTest");
        this.setHaltOnFailedTestButton();
        FBTestApp.TestConsole.noTestTimeout = Firebug.getPref(FBTestApp.prefDomain, "noTestTimeout");
        this.setNoTestTimeout();
    },

    internationalizeUI: function()
    {
        var buttons = ["haltOnFailedTest"];

        for (var i=0; i<buttons.length; i++)
        {
            var element = $(buttons[i]);
            FBL.internationalize(element, "label");
            FBL.internationalize(element, "tooltiptext");
            FBL.internationalize(element, "pickerTooltiptext");
            FBL.internationalize(element, "barTooltiptext");
        }
    },

    setHaltOnFailedTestButton: function()
    {
        $('haltOnFailedTest').setAttribute('checked', FBTestApp.TestWindowLoader.HaltOnFailedTest.enabled?'true':'false');
    },

    setNoTestTimeout: function()
    {
        $('noTestTimeout').setAttribute('checked', FBTestApp.TestConsole.noTestTimeout?'true':'false');
    },

    onToggleHaltOnFailedTest: function()
    {
        FBTestApp.TestWindowLoader.HaltOnFailedTest.enabled = !FBTestApp.TestWindowLoader.HaltOnFailedTest.enabled;
        Firebug.setPref(FBTestApp.prefDomain, "haltOnFailedTest", FBTestApp.TestWindowLoader.HaltOnFailedTest.enabled);
        FBTestApp.TestWindowLoader.HaltOnFailedTest.setHaltOnFailedTestButton();
    },

    onFailure: function()
    {
        if (!FBTestApp.TestWindowLoader.HaltOnFailedTest.enabled)
            return;

        if (FBTrace.DBG_FBTEST)
            FBTrace.sysout("FBTestApp.TestWindowLoader.HaltOnFailedTest.onFailure ");

        FBTestApp.TestRunner.clearTestTimeout();
        Firebug.Debugger.halt(function breakOnFailure(frame)
        {
            var dropFrames = 7;

            if (FBTrace.DBG_FBTEST)
                FBTrace.sysout("FBTestApp.TestWindowLoader.HaltOnFailedTest.onFailure.breakOnFailure dropping "+dropFrames, frame);

            for (var i = 0; frame && frame.isValid && i < dropFrames; i++)
                frame = frame.callingFrame;

            Firebug.Debugger.breakAsIfDebugger(frame);
        });
    },

    /* nsIObserve */
    observe: function(subject, topic, data)
    {
        try
        {
            if (topic == "fbtest")
            {
                if (data === "shutdown")
                    observerService.removeObserver(FBTestApp.TestWindowLoader.HaltOnFailedTest, "fbtest");

                if (data in FBTestApp.TestWindowLoader.HaltOnFailedTest)
                {
                    FBTestApp.TestWindowLoader.HaltOnFailedTest[data]();
                }
                else
                {
                    if (FBTrace.DBG_FBTEST)
                        FBTrace.sysout("FBTestApp.TestWindowLoader.HaltOnFailedTest no method for "+data);
                }
            }
        }
        catch (e)
        {
            dump("FBTestApp.TestWindowLoader.observe; EXCEPTION " + e, e);
        }
    },
};

// ************************************************************************************************
// Registration

/**
 * Listen to events fired by {@link FBTestApp.TestConsole}.
 */
observerService.addObserver(FBTestApp.TestWindowLoader.HaltOnFailedTest, "fbtest", false);

// ************************************************************************************************
}});
