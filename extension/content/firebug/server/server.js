/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// xxxHonza: FBTrace isn't available when loading from within bootstrap.js
// The default FBTrace implementation should buffer all logs that are fired
// before the tracing console is opened.

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
            // xxxHonza: get the port number from preferences
            DebuggerServer.closeListener();
            DebuggerServer.openListener(5999, false);

            this.hookPackets();
        }
        catch (ex)
        {
            Cu.reportError(ex);
        }
    },

    shutdown: function()
    {
        FBTrace.sysout("Server; shutdown");

        // xxxHonza: what if there are other tools sharing the connection?
        DebuggerServer.closeListener();
    },

    /**
     * Just for debugging purposes only. Hook server side packet communication
     * and log it into the tracing console.
     */
    hookPackets: function()
    {
        var onSocketAccepted = DebuggerServer.onSocketAccepted;
        DebuggerServer.onSocketAccepted = function(aSocket, aTransport)
        {
            onSocketAccepted.apply(this, arguments);

            var conn;
            for (var p in this._connections)
            {
                conn = this._connections[p];
                break;
            }

            if (!conn)
                return;

            var onPacket = conn.onPacket;
            conn.onPacket = function(packet)
            {
                FBTrace.sysout("PACKET RECEIVED " + JSON.stringify(packet), packet);
                onPacket.apply(this, arguments);
            }

            var send = conn._transport.send;
            conn._transport.send = function(packet)
            {
                send.apply(this, arguments);
                FBTrace.sysout("PACKET SEND " + JSON.stringify(packet), packet);
            }
        }
    }
}

// ********************************************************************************************* //
// Registration

return Server;

// ********************************************************************************************* //
});
