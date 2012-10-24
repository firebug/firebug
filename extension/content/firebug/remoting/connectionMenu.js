/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/lib/events",
    "firebug/lib/dom",
],
function(FBTrace, Obj, Options, Events, Dom) {

// ********************************************************************************************* //
// Module

/**
 * @module This object represent a popu menu that is responsible for Connect and
 * disconnect to/from remote browser.
 */
Firebug.ConnectionMenu = Obj.extend(Firebug.Module,
/** @lends Firebug.ConnectionMenu */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        if (FBTrace.DBG_CONNECTION)
            FBTrace.sysout("connectionMenu; ConnectionMenu.initialize");

        Options.addListener(this);

        this.updateUI();

        var onConnect = Obj.bind(this.onConnect, this);
        var onDisconnect = Obj.bind(this.onDisconnect, this);
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        Options.removeListener(this);

        this.disconnect();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Server Connection

    isConnected: function()
    {
        return (this.connection && this.connection.isConnected());
    },

    isConnecting: function()
    {
        return (this.connection && this.connection.isConnecting());
    },

    getConnection: function()
    {
        return this.connection;
    },

    connect: function()
    {
        if (this.isConnected())
            this.disconnect();

        var host = Options.get("serverHost");
        var port = Options.get("serverPort");

        // Do not connect if host or port is not specified.
        if (!host || !port)
        {
            if (FBTrace.DBG_CONNECTION)
            {
                FBTrace.sysout("connectionMenu.connect; You need to specify host and port. Check: " +
                    "extensions.firebug.serverHost and " +
                    "extensions.firebug.serverPort");
            }
            return;
        }

        if (FBTrace.DBG_CONNECTION)
            FBTrace.sysout("connectionMenu.connect; Connecting to " + host + ":" + port + " ...");

        try
        {
            this.connection.open(host, port);
            this.updateUI();
        }
        catch (err)
        {
            if (FBTrace.DBG_CONNECTION || FBTrace.DBG_ERRORS)
                FBTrace.sysout("connectionMenu.connect; connect EXCEPTION " + err, err);
        }
    },

    disconnect: function()
    {
        if (!this.isConnected())
            return;

        try
        {
            this.connection.close();
        }
        catch(err)
        {
            if (FBTrace.DBG_CONNECTION || FBTrace.DBG_ERRORS)
                FBTrace.sysout("connectionMenu.disconnect; disconnect EXCEPTION " + err, err);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection Hooks

    onConnect: function()
    {
        if (FBTrace.DBG_CONNECTION)
            FBTrace.sysout("connectionMenu.onConnect; Connected OK");

        this.updateUI();

        Events.dispatch(this.fbListeners, "onConnect", [this.connection]);
    },

    onDisconnect: function()
    {
        if (FBTrace.DBG_CONNECTION)
            FBTrace.sysout("connectionMenu.onDisconnect;");

        this.updateUI();

        Events.dispatch(this.fbListeners, "onDisconnect");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Menu UI

    updateUI: function()
    {
        var menu = Firebug.chrome.$("firebugConnectionMenu");
        var connected = this.isConnected();
        var connecting = this.isConnecting();

        var host = Options.get("serverHost");
        var port = Options.get("serverPort");

        var label = "Connect Me ";
        if (connecting)
            label = "Connecting...";
        else if (connected)
            label = host + ":" + port + " ";

        menu.setAttribute("label", label + " ");
        menu.setAttribute("disabled", connecting ? "true" : "false");

        // xxxHonza: Hide the remoting feature behind a pref for now.
        // There should be UI for specifying the host and port in the future.
        Dom.collapse(menu, !host || !port);
    },

    onShowing: function(popup)
    {
        var isConnected = this.isConnected();

        var connectItem = Firebug.chrome.$("cmd_firebugConnect");
        var disconnectItem = Firebug.chrome.$("cmd_firebugDisconnect");

        var host = Options.get("serverHost");
        var port = Options.get("serverPort");

        connectItem.setAttribute("disabled", isConnected ? "true" : "false");
        connectItem.setAttribute("label", "Connect to: " + host + ":" + port);

        disconnectItem.setAttribute("disabled", isConnected ? "false" : "true");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Preferences

    updateOption: function(name, value)
    {
        if (name == "serverHost" || name == "serverPort")
        {
            this.updateUI();
            this.connect();
        }
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.ConnectionMenu);

return Firebug.ConnectionMenu;

// ********************************************************************************************* //
});
