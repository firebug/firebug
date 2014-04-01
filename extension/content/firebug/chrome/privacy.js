/* See license.txt for terms of usage */

define([
    "firebug/chrome/module",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/array",
    "firebug/lib/events",
],
function(Module, FBTrace, Obj, Arr, Events) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

try
{
    Cu["import"]("resource://gre/modules/PrivateBrowsingUtils.jsm");
}
catch (err)
{
}

// ********************************************************************************************* //

/**
 * No data should be written if Firefox is set to privatebrowsing.
 * don't forget to check it before access (issue 2923).
 *
 * xxxHonza: as soon as Fx 22 is the min for Firebug most of the methods can be removed.
 * The most important one will be the isPrivateBrowsing
 */
var Privacy = Obj.extend(Module,
{
    initialize: function()
    {
        if (this.observerService)
            return;

        this.observerService = Cc["@mozilla.org/observer-service;1"]
            .getService(Ci.nsIObserverService);

        this.observerService.addObserver(this, "private-browsing", false);

        this.update();
    },

    shutdown: function()
    {
        this.observerService.removeObserver(this, "private-browsing");
    },

    update: function(data)
    {
        try
        {
            // xxxHonza: this component has been removed in Firefox 22
            // https://bugzilla.mozilla.org/show_bug.cgi?id=845063
            var pbs = Cc["@mozilla.org/privatebrowsing;1"]
                .getService(Ci.nsIPrivateBrowsingService);

            this.privateBrowsingEnabled = pbs.privateBrowsingEnabled;

            Events.dispatch(this.fbListeners, "onPrivateBrowsingChange",
                [this.privateBrowsingEnabled]);

            if (FBTrace.DBG_ACTIVATION)
                FBTrace.sysout("Privacy.update " + this.isPrivateBrowsing());
        }
        catch (e)
        {
            // nsIPrivateBrowsingService has been removed since Fx 22 so, don't display
            // the error message.
            //if (FBTrace.DBG_ERRORS)
            //    FBTrace.sysout("Privacy.update EXCEPTION " + e, e);
        }
    },

    observe: function (subject, topic, data)
    {
        if (topic == "private-browsing")
            Privacy.update(data);
    },

    isPrivateBrowsing: function()
    {
        try
        {
            // First check existence of the new PB API. Get firebugFrame.xul and check
            // private mode (it's the same as for the top parent window).
            if (typeof PrivateBrowsingUtils != "undefined")
                return PrivateBrowsingUtils.isWindowPrivate(Firebug.chrome.window);
        }
        catch (e)
        {
        }

        // OK, use nsIPrivateBrowsingService, it should still exist and the following
        // property should be properly initialized in update() method
        return this.privateBrowsingEnabled;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Privacy);

return Privacy;

// ********************************************************************************************* //
});
