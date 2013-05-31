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
    "firebug/remoting/debuggerClientTab",
],
function(Firebug, FBTrace, Obj, Options, Events, TabWatcher, Firefox, Win, DebuggerClientTab) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var Trace = FBTrace.to("DBG_DEBUGGERCLIENTMODULE");
var TraceConn = FBTrace.to("DBG_CONNECTION");
var TraceError = FBTrace.to("DBG_ERRORS");

Cu["import"]("resource://gre/modules/devtools/dbg-client.jsm");
Cu["import"]("resource://gre/modules/devtools/dbg-server.jsm");

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
 * - start attach/detach the current tab and thread
 * - hooking packet transport for debug purposes
 *
 * This object is implemented as a module since it represents a singleton (there is
 * only one connection per Firebug instance).
 *
 * More specialized client tools (see e.g. @DebuggerTool) should register listeners
 * to this object and handle all events accordingly.
 *
 * DebuggerClientModule.addListener(this);
 */
var DebuggerClientModule = Obj.extend(Firebug.Module,
/** @lends DebuggerClientModule */
{
    client: null,
    isRemoteDebugger: false,
    connected: false,
    tabMap: new WeakMap(),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Firebug.Module.initialize.apply(this, arguments);

        Firebug.registerTracePrefix("debuggerClientModule.", "DBG_DEBUGGERCLIENTMODULE", false);
    },

    initializeUI: function()
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        this.onConnect = Obj.bind(this.onConnect, this);
        this.onDisconnect = Obj.bind(this.onDisconnect, this);

        this.onTabNavigated = Obj.bind(this.onTabNavigated, this);
        this.onTabDetached = Obj.bind(this.onTabDetached, this);

        // Connect the server in 'initializeUI' so, listeners from other modules can
        // be registered before in 'initialize'.
        this.connect();
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        Firebug.unregisterTracePrefix("debuggerClientModule.");

        this.disconnect();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    connect: function()
    {
        Trace.sysout("debuggerClientModule.connect;");

        // Initialize the server to allow connections through pipe transport.
        if (!this.isRemoteDebugger)
        {
            try
            {
                DebuggerServer.init(function () { return true; });
                DebuggerServer.addBrowserActors();
            }
            catch (e)
            {
                // If the built-in debugger has been opened browser actors
                // can be already added.
                TraceError.sysout("debuggerClientModule.connect; EXCEPTION " + e, e);
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
        Trace.sysout("debuggerClientModule.loadActors;", arguments);

        // Actors must be loaded at the time when basic browser actors are already available.
        // (i.e. addBrowserActors executed). Firebug actors can derive (or modify) existing
        // actor types.
        var config = Firebug.getModuleLoaderConfig();
        Firebug.require(config, [
            //"firebug/debugger/actors/threadActor",
            //"firebug/debugger/actors/objectActor"
            "firebug/debugger/actors/browserRootActor"
        ],
        function()
        {
            callback();
        });
    },

    onActorsLoaded: function()
    {
        Trace.sysout("debuggerClientModule.onActorsLoaded;");

        // Debugger client represents the connection to the server side
        // and so it's global.
        Firebug.debuggerClient = this.client = new DebuggerClient(this.transport);

        // Hook packet transport to allow tracing.
        if (FBTrace.DBG_CONNECTION)
            this.hookPacketTransport(this.transport);

        this.client.addListener("tabNavigated", this.onTabNavigated);
        this.client.addListener("tabDetached", this.onTabDetached);

        // Connect to the server.
        this.client.connect(this.onConnect);
    },

    disconnect: function()
    {
        if (!this.client)
            return;

        this.client.removeListener("tabNavigated", this.onTabNavigated);
        this.client.removeListener("tabDetached", this.onTabDetached);

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

        Trace.sysout("debuggerClientModule.onResumeFirebug; connected: " +
            this.connected + ", " + Win.safeGetWindowLocation(browser.contentWindow));

        // Firebug has been opened for the current tab so, attach to the back-end
        // tab and thread actor.
        if (this.connected)
            this.attachClientTab(browser);
    },

    onSuspendFirebug: function()
    {
        var browser = Firefox.getCurrentBrowser();

        Trace.sysout("debuggerClientModule.onSuspendFirebug; " +
            Win.safeGetWindowLocation(browser.contentWindow));

        // Firebug has been closed for the current tab, so explicitly detach
        // the tab and thread actor and destroy the tab instance.
        this.detachClientTab(browser);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tabs

    attachClientTab: function(browser)
    {
        if (this.tabMap.has(browser))
            return this.tabMap.get(browser);

        // There is one instance of {@DebuggerClientTab} per Firefox tab with Firebug context.
        var tab = new DebuggerClientTab(browser, this.client, this);
        this.tabMap.set(browser, tab);

        var self = this;
        tab.attach(function(threadClient)
        {
            Trace.sysout("debuggerClientModule.attachClientTab; Callback: thread attached");

            self._onResumed = self.onResumed.bind(self, threadClient);
            threadClient.addListener("resumed", self._onResumed);
        });

        return tab;
    },

    detachClientTab: function(browser)
    {
        var tab = this.tabMap.get(browser);
        if (!tab)
            return;

        // xxxHonza: what if the attach process is not finished yet?
        if (tab.threadClient)
            tab.threadClient.removeListener("resumed", this._onResumed);

        var self = this;
        tab.detach(function()
        {
            Trace.sysout("debuggerClientModule.detachClientTab; Callback: thread detached ");
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
            self.attachClientTab(context.browser);
        });
    },

    onDisconnect: function()
    {
        this.dispatch("onDisconnect", [this.client]);
    },

    onTabNavigated: function(type, packet)
    {
        var context = TabWatcher.getContextByTabActor(packet.from);
        Trace.sysout("debuggerClientModule.onTabNavigated; to: " + packet.url +
            ", context: " + context, packet);
    },

    onTabDetached: function(type, packet)
    {
        var context = TabWatcher.getContextByTabActor(packet.from);
        Trace.sysout("debuggerClientModule.onTabDetached; from: " + packet.from +
            ", context: " + context, packet);

        // xxxHonza: should we manually detach the tab now?
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // ThreadClient Handlers

    onResumed: function(threadClient)
    {
        Trace.sysout("debuggerClientModule.onResumed; ", arguments);

        this.dispatch("onResumed", [threadClient]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context

    initContext: function(context, persistedState)
    {
        var tab = this.tabMap.get(context.browser);

        Trace.sysout("debuggerClientModule.initContext; " + context.getName() +
            " ID: " + context.getId() + ", tab: " + tab, persistedState);

        // If tab object for this tab-browser exists, the 'attach to the thread actor'
        // (async) sequence already started. If the 'tab.activeThread' is set the process
        // is successfully finished.
        // If the tab object doesn't exist, let's attach the tab, but only if the connection
        // is ready. Otherwise, all contexts will be attached when 'onConnected' is fired. 
        if (tab)
        {
            context.tabClient = tab.tabClient;
            context.activeThread = tab.activeThread;
            context.threadActor = tab.threadActor;

            if (tab.activeThread)
            {
                // If the tab is already attached make sure to send the event now.
                this.dispatch("onThreadAttached", [context, true]);
            }
            else
            {
                Trace.sysout("debuggerClientModule.initContext; tab not connected to " +
                    "the thread yet");
            }
        }
        else if (this.connected)
        {
            // Attach to the tab if not attached yet, but back-end is already connected.
            this.attachClientTab(context.browser);
        }
    },

    destroyContext: function(context, persistedState)
    {
        Trace.sysout("debuggerClientModule.destroyContext; " + context.getName() +
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Event Source

    dispatch: function(eventName, args)
    {
        Trace.sysout("debuggerClientModule.dispatch; " + eventName, args);

        Firebug.Module.dispatch.apply(this, arguments);
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

Firebug.registerModule(DebuggerClientModule);

// For FBTest
Firebug.DebuggerClientModule = DebuggerClientModule;

return DebuggerClientModule;

// ********************************************************************************************* //
});
