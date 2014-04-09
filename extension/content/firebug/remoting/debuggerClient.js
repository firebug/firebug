/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/lib/events",
    "firebug/chrome/tabWatcher",
    "firebug/chrome/firefox",
    "firebug/chrome/window",
    "firebug/remoting/tabClient",
],
function(Firebug, FBTrace, Obj, Options, Events, TabWatcher, Firefox, Win, TabClient) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;

var Trace = FBTrace.to("DBG_DEBUGGERCLIENT");
var TraceConn = FBTrace.to("DBG_CONNECTION");
var TraceError = FBTrace.toError();

var dbgClientScope = {};
var dbgServerScope = {};

Cu["import"]("resource://gre/modules/devtools/dbg-client.jsm", dbgClientScope);
Cu["import"]("resource://gre/modules/devtools/dbg-server.jsm", dbgServerScope);

// ********************************************************************************************* //
// Module Implementation

/**
 * @module This object is responsible for 'DebuggerClient' initialization. DebuggerClient
 * is Firefox built-in object and represents the connection to the server side.
 *
 * This object should stay generic and only be responsible for:
 * - connection setup + connect/disconnect
 * - initialization of browser actors
 * - hooking DebuggerClient events
 * - firing events to more specialized listeners (client tools)
 * - start attach/detach the current tab
 * - hooking packet transport for debug purposes
 *
 * This object is implemented as a module since it represents a singleton (there is
 * only one connection per Firebug instance).
 *
 * More specialized client tools (see e.g. {@link DebuggerTool}) should register listeners
 * to this object and handle all events accordingly.
 *
 * DebuggerClient.addListener(listener);
 */
var DebuggerClient = Obj.extend(Firebug.Module,
/** @lends DebuggerClient */
{
    isRemoteDebugger: false,
    client: null,
    connected: false,
    tabMap: new WeakMap(),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        Firebug.registerTracePrefix("debuggerClient.", "DBG_DEBUGGERCLIENT", false);
    },

    initializeUI: function()
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        this.onConnect = Obj.bind(this.onConnect, this);
        this.onDisconnect = Obj.bind(this.onDisconnect, this);

        this.tabNavigated = Obj.bind(this.tabNavigated, this);
        this.tabDetached = Obj.bind(this.tabDetached, this);
        this.newSource = Obj.bind(this.newSource, this);

        // Connect the server in 'initializeUI' so, listeners from other modules can
        // be registered before in 'initialize'.
        this.connect();
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        Firebug.unregisterTracePrefix("debuggerClient.");

        this.disconnect();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    connect: function()
    {
        Trace.sysout("debuggerClient.connect;");

        // Initialize the server to allow connections through pipe transport.
        if (!this.isRemoteDebugger)
        {
            try
            {
                // The debugger server might be already initialized either by Firebug
                // in another browser window or by built-in devtools.
                if (!DebuggerServer.initialized)
                {
                    DebuggerServer.init(function () { return true; });
                    DebuggerServer.addBrowserActors();
                }
            }
            catch (e)
            {
                TraceError.sysout("debuggerClient.connect; EXCEPTION " + e, e);
            }
        }

        this.transport = (this.isRemoteDebugger) ?
            debuggerSocketConnect(Options.get("remoteHost"), Options.get("remotePort")) :
            DebuggerServer.connectPipe();

        // Load Firebug actors. If Firebug is running server side these actors
        // should also be loaded.
        this.loadActors(this.onActorsLoaded.bind(this));
    },

    loadActors: function(callback)
    {
        Trace.sysout("debuggerClient.loadActors;", arguments);

        // Actors must be loaded at the time when basic browser actors are already available.
        // (i.e. addBrowserActors executed). Firebug actors can derive (or modify) existing
        // actor types.
        var config = Firebug.getModuleLoaderConfig();
        Firebug.require(config, [
            "firebug/debugger/actors/breakpointActor"
        ],
        function()
        {
            callback();
        });
    },

    onActorsLoaded: function()
    {
        Trace.sysout("debuggerClient.onActorsLoaded;");

        // Debugger client represents the connection to the server side
        // and so it's global.
        Firebug.debuggerClient = this.client = new dbgClientScope.DebuggerClient(this.transport);

        // Hook packet transport to allow tracing.
        if (FBTrace.DBG_CONNECTION)
            this.hookPacketTransport(this.transport);

        this.client.addListener("tabNavigated", this.tabNavigated);
        this.client.addListener("tabDetached", this.tabDetached);
        this.client.addListener("newSource", this.newSource);

        // Connect to the server.
        this.client.connect(this.onConnect);
    },

    disconnect: function()
    {
        if (!this.client)
            return;

        this.client.removeListener("tabNavigated", this.tabNavigated);
        this.client.removeListener("tabDetached", this.tabDetached);
        this.client.removeListener("newSource", this.newSource);

        // Disconnect from the server.
        this.client.close(this.onDisconnect);
        this.client = null;
        this.connected = false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Firebug Activation

    onResumeFirebug: function()
    {
        var browser = Firefox.getCurrentBrowser();

        Trace.sysout("debuggerClient.onResumeFirebug; connected: " +
            this.connected + ", " + Win.safeGetWindowLocation(browser.contentWindow));

        // Firebug has been opened for the current tab so, attach to the back-end tab actor.
        // If Firebug is not yet connected, the tab will be attached in 'onConnect' handler.
        if (this.connected)
            this.attachTab(browser);
    },

    onSuspendFirebug: function()
    {
        var browser = Firefox.getCurrentBrowser();

        Trace.sysout("debuggerClient.onSuspendFirebug; " +
            Win.safeGetWindowLocation(browser.contentWindow));

        // Firebug has been closed for the current tab, so explicitly detach
        // the tab and thread actor and destroy the tab instance.
        this.detachTab(browser);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tabs

    attachTab: function(browser)
    {
        // Of course, we can attach only if Firebug is connected to the backend.
        if (!this.connected)
            return;

        // Check if there is already a client object created for this tab browser.
        if (this.tabMap.has(browser))
            return this.getTabClient(browser);

        Trace.sysout("debuggerClient.attachTab;");

        // There is one instance of {@link TabClient} per Firefox tab.
        var tab = new TabClient(browser, this.client);
        tab.addListener(this);

        this.tabMap.set(browser, tab);

        // Attach to the tab actor.
        tab.attach(function(threadClient)
        {
            Trace.sysout("debuggerClient.attachTab; Callback: tab attached");
        });

        return tab;
    },

    detachTab: function(browser)
    {
        var tab = this.getTabClient(browser);
        if (!tab)
            return;

        tab.detach(function()
        {
            Trace.sysout("debuggerClient.detachTab; Callback: tab detached");
        });

        this.tabMap.delete(browser);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerClient Handlers

    onConnect: function(type, traits)
    {
        this.dispatch("onConnect", [this.client]);

        this.connected = true;

        // Iterate existing contexts and make sure Firebug is attached
        // to the associated tab and thread actors.
        var self = this;
        TabWatcher.iterateContexts(function(context)
        {
            self.attachTab(context.browser);
        });
    },

    onDisconnect: function()
    {
        this.dispatch("onDisconnect", [this.client]);
    },

    tabNavigated: function(type, packet)
    {
        var context = TabWatcher.getContextByTabActor(packet.from);
        Trace.sysout("debuggerClient.onTabNavigated; to: " + packet.url +
            ", context: " + context, packet);
    },

    tabDetached: function(type, packet)
    {
        var context = TabWatcher.getContextByTabActor(packet.from);
        Trace.sysout("debuggerClient.onTabDetached; from: " + packet.from +
            ", context: " + context, packet);

        // xxxHonza: should we manually detach the tab now?
    },

    newSource: function(type, response)
    {
        this.dispatch("newSource", arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context

    initContext: function(context, persistedState)
    {
        var tab = this.getTabClient(context.browser);

        Trace.sysout("debuggerClient.initContext; " + context.getName() +
            " ID: " + context.getId() + ", tab: " + tab + ", connected: " +
            this.connected, persistedState);

        // Firebug needs to be connected to the backend in order to attach any actors.
        if (!this.connected)
            return;

        // If tab client object already exists use it and fire helper events,
        // otherwise attach to the give tab.
        if (tab)
        {
            if (tab.tabClient)
            {
                // If the tab is already attached send helper event. The second argument
                // says that this is only a reload and the tabActor is actually still the same.
                this.dispatch("onTabAttached", [context, true]);
            }

            if (tab.activeThread)
            {
                context.activeThread = tab.activeThread;

                // If the thread is already attached send helper event.
                this.dispatch("onThreadAttached", [context, true]);
            }
        }
        else
        {
            this.attachTab(context.browser);
        }
    },

    destroyContext: function(context, persistedState)
    {
        Trace.sysout("debuggerClient.destroyContext; " + context.getName() +
            " ID: " + context.getId());

        this.dispatch("onThreadDetached", [context]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Actors

    getActorId: function(context, actorName)
    {
        var tab = this.tabMap.get(context.browser);
        if (!tab)
            return;

        var tabs = tab.listTabsResponse;
        if (!tabs)
            return;

        var currTabActorId = tab.tabClient._actor;

        // xxxHonza: could be optimized using a map: tabId -> tab
        tabs = tabs.tabs;
        for (var i=0; i<tabs.length; i++)
        {
            var tab = tabs[i];
            if (tab.actor == currTabActorId)
                return tab[actorName];
        }
    },

    getTabClient: function(browser)
    {
        if (!browser)
            return null;

        return this.tabMap.get(browser);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // TabClient Handlers

    onTabAttached: function(browser)
    {
        this.dispatch("onTabAttached", [browser, false]);

        Firebug.dispatchEvent(browser, "onTabAttached");
    },

    onTabDetached: function(browser)
    {
        this.dispatch("onTabDetached", [browser]);
    },

    onThreadAttached: function(context)
    {
        this.dispatch("onThreadAttached", [context, false]);

        Firebug.dispatchEvent(context.browser, "onThreadAttached");
    },

    onThreadDetached: function(context)
    {
        this.dispatch("onThreadDetached", [context]);

        Firebug.dispatchEvent(context.browser, "onThreadDetached");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // EventSource

    dispatch: function(eventName, args)
    {
        Trace.sysout("debuggerClient.dispatch; " + eventName, args);

        Firebug.Module.dispatch.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    isTabAttached: function(browser)
    {
        var tab = this.getTabClient(browser);
        return tab ? (tab.tabClient != null) : false;
    },

    isThreadAttached: function(browser)
    {
        var tab = this.getTabClient(browser);
        return tab ? (tab.activeThread != null) : false;
    },

    getThreadState: function(browser)
    {
        var tab = this.getTabClient(browser);
        if (!tab || !tab.activeThread)
            return;

        return tab.activeThread.state;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Debugging

    // xxxHonza: unhook is missing.
    hookPacketTransport: function(transport)
    {
        var self = this;

        transport.hooks =
        {
            onPacket: function onPacket(packet)
            {
                // Ignore newGlobal packets for now.
                // See https://bugzilla.mozilla.org/show_bug.cgi?id=801084
                if (packet.type == "newGlobal")
                    return;

                TraceConn.sysout("PACKET RECEIVED; " + JSON.stringify(packet), packet);
                self.client.onPacket.apply(self.client, arguments);
            },

            onClosed: function(status)
            {
                self.client.onClosed(packet);
            }
        };

        var send = this.transport.send;
        this.transport.send = function(packet)
        {
            TraceConn.sysout("PACKET SEND " + JSON.stringify(packet), packet);

            send.apply(self.transport, arguments);
        }
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(DebuggerClient);

// For FBTest
Firebug.DebuggerClient = DebuggerClient;

return DebuggerClient;

// ********************************************************************************************* //
});
