/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
],
function(FBTrace, Obj) {

// ********************************************************************************************* //
// Globals

var Cu = Components.utils;

try
{
    Cu["import"]("resource:///modules/devtools/dbg-client.jsm");
}
catch (err)
{
    FBTrace.sysout("connection; Initialization FAILS (you need remote-debug Firefox build)", err);
}

// ********************************************************************************************* //
// Connection

function Connection(onConnect, onDisconnect)
{
    // Hooks
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;
    this.callbacks = {};

    this.connected = false;
    this.connecting = false;
}

Connection.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Private Methods

    /**
     * A packet received from the server.
     *
     * @param {Object} packet
     */
    onPacket: function(packet)
    {
        if (FBTrace.DBG_CONNECTION)
        {
            FBTrace.sysout("connection.onPacket; PACKET RECEIVED, type: " + packet.type +
                ", from: " + packet.from, packet);
        }

        // Introduction packet.
        if (packet.applicationType == "browser")
        {
            this.onIntro(packet);
            return;
        }

        // Error packet
        if (packet.error)
        {
            this.onError(packet);
            return;
        }

        // Execute registered callback (one shot) by type.
        if (packet.from)
            this.onHandlePacket(packet);
    },

    /**
     * Executed by the framework when the connection is interrupted.
     */
    onClosed: function()
    {
        this.connecting = false;
        this.connected = false;

        this.callbacks = {};

        if (this.onDisconnect)
            this.onDisconnect();
    },

    onIntro: function(packet)
    {
        this.connecting = false;
        this.connected = true;

        if (this.onConnect)
            this.onConnect();
    },

    onError: function(packet)
    {
        this.connecting = false;

        FBTrace.sysout("connection.onError; ERROR " + packet.error + ": " + packet.message);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Packet Handler

    onHandlePacket: function(packet)
    {
        var from = packet.from;
        var handler = this.getCallback(from);
        if (handler)
        {
            var callback = handler.callback;
            if (handler.oneShot)
                this.removeCallback(from);

            try
            {
                return callback(packet);
            }
            catch (err)
            {
                if (FBTrace.DBG_CONNECTION || FBTrace.DBG_ERROR)
                    FBTrace.sysout("connection.onHandlePacket; callback EXCEPTION: " + err, err);
            }
        }

        if (FBTrace.DBG_CONNECTION)
        {
            FBTrace.sysout("connection.onHandlePacket; No callback registered for: " +
                from, packet);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Callback Management

    /**
     * Registers a callback for response from specified actor
     * @param {String} from specified actor ID.
     * @param {Function} callback the callback function,
     * @param {Boolean} Set to true if it's a one-shot callback.
     */
    addCallback: function(from, callback, oneShot)
    {
        var prevCallback = this.getCallback(from);
        if (prevCallback)
        {
            if (FBTrace.DBG_CONNECTION)
            {
                FBTrace.sysout("connection.addCallback: Callback not registered to not " +
                    "overwrite an existing callback. " + from, prevCallback);
            }
            return;
        }

        this.callbacks[from] = {
            callback: callback,
            oneShot: oneShot,
        };
    },

    removeCallback: function(from)
    {
        var callbacks = this.callbacks[from];
        if (!callbacks)
        {
            FBTrace.sysout("connection.removeCallback ERROR; Removing unknown callback! " + from);
            return;
        }

        delete this.callbacks[from];
    },

    getCallback: function(from)
    {
        return this.callbacks[from];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public Methods

    open: function(host, port)
    {
        this.transport = debuggerSocketConnect(host ? host : "localhost", port);
        this.transport.hooks = this;
        this.transport.ready();
        this.connecting = true;
    },

    close: function()
    {
        this.transport.close();
    },

    isConnected: function()
    {
        return this.connected;
    },

    isConnecting: function()
    {
        return this.connecting;
    },

    /**
     * Use this method to implement panel-specific remote protocol APIs
     * 
     * @param {String} actor Target actor the packet will be send to.
     * @param {String} type Packet type defined by actors on the server side.
     * @param {Boolean} oneShot Set to true if the callback should be removed after the response
     *      is received, otherwise false (e.g. for subsriptions type packets)
     * @param {Function} callback Callback function called when response received
     * @param {Object} Optional data to be appended to the packet.
     */
    sendPacket: function(actor, type, oneShot, callback, data)
    {
        var packet = {
            to: actor,
            type: type,
        }

        if (data)
            packet.data = data;

        this.addCallback(actor, callback, oneShot);
        this.transport.send(packet);

        if (FBTrace.DBG_CONNECTION)
        {
            FBTrace.sysout("connection.sendPacket; PACKET SENT: " +
                JSON.stringify(packet), packet);
        }
    },
}

// ********************************************************************************************* //
// Registration

return Connection;

// ********************************************************************************************* //
});
