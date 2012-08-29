/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/options",
],
function(FBTrace, Obj, Options, TabClient) {

// ********************************************************************************************* //
// XPCOM

var Cu = Components.utils;

Cu["import"]("resource:///modules/devtools/dbg-client.jsm");
Cu["import"]("resource:///modules/devtools/dbg-server.jsm");

// ********************************************************************************************* //
// Constants

/**
 * Set of protocol messages that are sent by the server without a prior request
 * by the client.
 */
const UnsolicitedNotifications = {
  "newScript": "newScript",
  "tabDetached": "tabDetached",
  "tabNavigated": "tabNavigated"
};

/**
 * Set of protocol messages that affect thread state, and the
 * state the actor is in after each message.
 */
const ThreadStateTypes = {
  "paused": "paused",
  "resumed": "attached",
  "detached": "detached"
};

/**
 * Set of debug protocol request types that specify the protocol request being
 * sent to the server.
 */
const DebugProtocolTypes = {
  "listTabs": "listTabs",
  "attach": "attach",
  "detach": "detach",
};

const ROOT_ACTOR_NAME = "root";

// ********************************************************************************************* //
// Connection

function Connection(onConnect, onDisconnect)
{
    // Hooks
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;

    // Status flags
    this.connected = false;
    this.connecting = false;

    // Transport layer.
    this.transport = null;
    this.local = true;  // Local debugging over JSON for now. 

    // Clients ane requests management.
    this.threadClients = {};
    this.tabClients = {};

    this.pendingRequests = [];
    this.activeRequests = {};
    this.eventsEnabled = true;
}

Connection.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public

    open: function Connection_open(host, port)
    {
        host = host || Options.get("serverHost");
        port = port || Options.get("serverPort");

        // Initialize the server to allow connections throug pipe transport.
        if (this.local)
        {
            DebuggerServer.init(function () { return true; });
            DebuggerServer.addBrowserActors();
        }

        // This objet should be probably created somewhere else and passed as an argument
        // to this method. Depending on whether Firebug want to connect remote browser
        // instance or the one it's running within.
        this.transport = this.local ? DebuggerServer.connectPipe() :
            debuggerSocketConnect(host, port);

        this.transport.hooks = this;

        var self = this;
        this.addOneTimeListener("connected", function(aName, applicationType, traits)
        {
            self.onConnect(applicationType, traits);
        });

        this.transport.ready();

        // Update flag
        this.connecting = true;
    },

    /**
     * Shut down communication with the debugging server.
     *
     * @param aOnClosed function  If specified, will be called when the debugging connection
     *        has been closed.
     */
    close: function Connection_close()
    {
        // Disable detach event notifications, because event handlers will be in a
        // cleared scope by the time they run.
        this.eventsEnabled = false;

        this.addOneTimeListener("closed", function(event)
        {
            this.onDisconnect();
        });

        var closeTransport = function _closeTransport()
        {
            this.transport.close();
            this.transport = null;
        }.bind(this);

        var detachTab = function _detachTab()
        {
            if (this.activeTab)
                this.activeTab.detach(closeTransport);
            else
                closeTransport();
        }.bind(this);

        if (this.activeThread)
            this.activeThread.detach(detachTab);
        else
            detachTab();
    },

    listTabs: function Connection_listTabs(onResponse)
    {
        var packet = {
            to: ROOT_ACTOR_NAME,
            type: DebugProtocolTypes.listTabs
        };

        this.request(packet, function(aResponse)
        {
            onResponse(aResponse);
        });
    },

    attachTab: function DC_attachTab(tabActor, onResponse)
    {
        var packet = {
            to: tabActor,
            type: DebugProtocolTypes.attach
        };

        var self = this;
        this.request(packet, function(response)
        {
            if (!response.error)
                self.activeTab = tabActor;

            onResponse(response, tabActor);
        });
    },

    detachTab: function Connection_detach(onResponse)
    {
        var packet = {
            to: this.activeTab,
            type: DebugProtocolTypes.detach
        };

        var self = this;
        this.request(packet, function(response)
        {
            delete self.activeTab;

            if (onResponse)
                onResponse(response);
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Private Methods

    /**
     * Send a request to the debugging server.
     * @param request object  A JSON packet to send to the debugging server.
     * @param aOnResponse function  If specified, will be called with the response packet when
     *        debugging server responds.
     */
    request: function Connection_request(request, onResponse)
    {
        if (!this.connected)
        {
            FBTrace.sysout("Connection.request; ERROR Have not yet received a hello " +
                "packet from the server.");
        }

        if (!request.to)
        {
            var type = request.type || "";
            FBTrace.sysout("Connection.request; ERROR '" + type +
                "' request packet has no destination.");
        }

        this.pendingRequests.push({
            to: request.to,
            request: request,
            onResponse: onResponse
        });

        this.sendRequests();
    },

    /**
     * Send pending requests to any actors that don't already have an
     * active request.
     */
    sendRequests: function Connection_sendRequests()
    {
        var self = this;
        this.pendingRequests = this.pendingRequests.filter(function(request)
        {
            if (request.to in self.activeRequests)
                return true;

            self.activeRequests[request.to] = request;

            if (FBTrace.DBG_CONNECTION)
                FBTrace.sysout("connection.send; " + JSON.stringify(request), request);

            self.transport.send(request.request);

            return false;
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Transport Hooks

    /**
     * Called by DebuggerTransport to dispatch incoming packets as appropriate.
     * @param packet object The incoming packet.
     */
    onPacket: function Connection_onPacket(packet)
    {
        if (FBTrace.DBG_CONNECTION)
            FBTrace.sysout("connection.onPacket; " + JSON.stringify(packet), packet);

        if (!this.connected)
        {
            // Hello packet.
            this.connected = true;
            this.notify("connected", packet.applicationType, packet.traits);
            return;
        }

        try
        {
            if (!packet.from)
            {
                FBTrace.sysout("Connection.onPacket; ERROR Server did not specify an actor, " +
                    "dropping packet: " + JSON.stringify(packet));
                return;
            }

            var onResponse;

            // Don't count unsolicited notifications as responses.
            if (packet.from in this.activeRequests && !(packet.type in UnsolicitedNotifications))
            {
                onResponse = this.activeRequests[packet.from].onResponse;
                delete this.activeRequests[packet.from];
            }

            // paused/resumed/detached get special treatment...
            if (packet.type in ThreadStateTypes && packet.from in this.threadClients)
                this.threadClients[packet.from].onThreadState(packet);

            this.notify(packet.type, packet);

            if (packet.error)
                FBTrace.sysout("debuggerClient.attachThread; ERROR: " + packet.error, packet);

            if (onResponse)
                onResponse(packet);
        }
        catch (ex)
        {
            FBTrace.sysout("Connection.onPacket; EXCEPTION " + ex, ex);
        }

        this.sendRequests();
    },

    /**
     * Called by DebuggerTransport when the underlying stream is closed.
     *
     * @param aStatus nsresult The status code that corresponds to the reason for closing
     *              the stream.
     */
    onClosed: function Connection_onClosed(status)
    {
        this.notify("closed");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Private Methods

}

// ********************************************************************************************* //
// Event Source Decorator

function eventSource(aProto)
{
  aProto.addListener = function EV_addListener(aName, aListener) {
    if (typeof aListener != "function") {
      return;
    }

    if (!this._listeners) {
      this._listeners = {};
    }

    if (!aName) {
      aName = '*';
    }

    this._getListeners(aName).push(aListener);
  };

  aProto.addOneTimeListener = function EV_addOneTimeListener(aName, aListener) {
    var self = this;

    var l = function() {
      self.removeListener(aName, l);
      aListener.apply(null, arguments);
    };
    this.addListener(aName, l);
  };

  aProto.removeListener = function EV_removeListener(aName, aListener) {
    if (!this._listeners || !this._listeners[aName]) {
      return;
    }
    this._listeners[aName] =
      this._listeners[aName].filter(function(l) { return l != aListener });
  };

  aProto._getListeners = function EV_getListeners(aName) {
    if (aName in this._listeners) {
      return this._listeners[aName];
    }
    this._listeners[aName] = [];
    return this._listeners[aName];
  };

  aProto.notify = function EV_notify() {
    if (!this._listeners) {
      return;
    }

    var name = arguments[0];
    var listeners = this._getListeners(name).slice(0);
    if (this._listeners['*']) {
      listeners.concat(this._listeners['*']);
    }

    for each (var listener in listeners) {
      try {
        listener.apply(null, arguments);
      } catch (e) {
        // Prevent a bad listener from interfering with the others.
        var msg = e + ": " + e.stack;
        Cu.reportError(msg);
        FBTrace.sysout("EventSource.notify; ERROR " + e, e);
      }
    }
  }
}


// ********************************************************************************************* //
// Registration

eventSource(Connection.prototype);

return Connection;

// ********************************************************************************************* //
});
