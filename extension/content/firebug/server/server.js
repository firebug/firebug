/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// xxxHonza: FBTrace doesn't have to be available when loading from within bootstrap.js

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// ********************************************************************************************* //
// Module

var Server =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        try
        {
            Cu.import("resource:///modules/devtools/dbg-server.jsm");

            DebuggerServer.init(function() { return true; });

            // Add built-in actors (like e.g. debugger actors)
            DebuggerServer.addBrowserActors();

            // devtools.debugger.remote-enabled pref must be true
            // Set devtools.debugger.force-local pref to false in order to
            // allow remote cross-machine connections.
            DebuggerServer.closeListener();
            DebuggerServer.openListener(2929, false);

            //FBTrace.sysout("Server; Listening at 2929...");
        }
        catch (ex)
        {
            //FBTrace.sysout("Server; EXCEPTION Couldn't start debugging server: " + ex);
        }
    },

    shutdown: function()
    {
        //FBTrace.sysout("Server; shutdown");

        // xxxHonza: what if there are other tools sharing the connection?
        DebuggerServer.closeListener();
    },
}

// ********************************************************************************************* //
// Registration

return Server;

// ********************************************************************************************* //
});
