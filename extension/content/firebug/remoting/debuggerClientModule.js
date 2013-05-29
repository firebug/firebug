/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/lib/events",
    "firebug/chrome/tabWatcher",
],
function(Firebug, FBTrace, Obj, Options, Events, TabWatcher) {

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
 * - attach/detach the current tab and thread
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
    tabMap: [],

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
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Firebug Activation

    onResumeFirebug: function()
    {
        Trace.sysout("debuggerClientModule.onResumeFirebug;");

        /*if (this.transport)
            this.onActorsLoaded();
        else
            this.connect();*/
    },

    onSuspendFirebug: function()
    {
        Trace.sysout("debuggerClientModule.onSuspendFirebug;");

        // TODO: unhook packet tracing
        //this.disconnect();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // JSD2 Hooks

    onConnect: function(type, traits)
    {
        this.dispatch("onConnect", [this.client]);

        this.attachCurrentTab(Firebug.currentContext);
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
        if (!context)
            return;

        Trace.sysout("debuggerClientModule.onTabDetached; " +
            (context ? context.getId() : "no context"));

        this.dispatch("onThreadDetached", [context]);
        this.dispatch("onTabDetached", [context]);

        context.tabDetached = true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context

    initContext: function(context, persistedState)
    {
        Trace.sysout("debuggerClientModule.initContext; " + context.getName() +
            " ID: " + context.getId(), persistedState);

        // If page reloads happens the tab-client and thread-client remains the same
        // so, reuse them from the persisted state object (if they are available).
        if (persistedState)
        {
            context.tabClient = persistedState.tabClient;
            context.activeThread = persistedState.activeThread;
            context.threadActor = persistedState.threadActor;

            Trace.sysout("debuggerClientModule.initContext; from persisted state " +
                context.getName() + " ID: " + context.getId());
        }

        // Attach remote tab.
        // xxxHonza: doesn't have to be the current one.
        if (this.client && this.client._connected)
            this.attachCurrentTab(context);
    },

    destroyContext: function(context, persistedState)
    {
        Trace.sysout("debuggerClientModule.destroyContext; " + context.getName() +
            " ID: " + context.getId());

        persistedState.tabClient = context.tabClient;
        persistedState.activeThread = context.activeThread;
        persistedState.threadActor = context.threadActor;

        Trace.sysout("debuggerClientModule.destroyContext; persisted state: " +
            "tabClient: " + persistedState.tabClient +
            ", activeThread: " + persistedState.activeThread +
            ", threadActor: " + persistedState.threadActor);

        // If onTabDetached wasn't received from the server so far
        // onThreadDetached and onTabDetached events should be fired. These
        // events expect the current |context| as an argument and this is the
        // last chance to have the |context|.
        if (!context.tabDetached)
        {
            this.dispatch("onThreadDetached", [context]);
            this.dispatch("onTabDetached", [context]);

            context.tabDetached = true;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Tab

    attachCurrentTab: function(context)
    {
        if (!Firebug.Debugger.isAlwaysEnabled())
        {
            Trace.sysout("debuggerClientModule.attachCurrentTab; The Script panel not enabled");
            return;
        }

        Trace.sysout("debuggerClientModule.attachCurrentTab; " + context.getName() +
            " ID: " + context.getId());
        Trace.sysout("debuggerClientModule.attachCurrentTab; tabClient: " + context.tabClient +
            ", activeThread: " + context.activeThread);

        // I. Context already attached to the page and thread actors (page just reloaded).
        if (context.tabClient && context.threadActor && context.activeThread)
        {
            Trace.sysout("debuggerClientModule.attachCurrentTab; " +
                "Page already attached (just reloaded)");

            this.dispatch("onThreadDetached", [context, true]);
            this.dispatch("onTabDetached", [context, true]);

            this.dispatch("onTabAttached", [context, true]);
            this.dispatch("onThreadAttached", [context, true]);
            return;
        }

        // II. tab actor attached, but thread actor not yet.
        if (context.tabClient && context.threadActor && !context.activeThread)
        {
            Trace.sysout("debuggerClientModule.attachCurrentTab; " +
                "Page already attached (just reloaded), but thread not attached.");

            this.dispatch("onTabDetached", [context, true]);
            this.dispatch("onTabAttached", [context, true]);

            this.attachThread(context, context.threadActor);
            return;
        }

        var self = this;
        this.client.listTabs(function(response)
        {
            if (!context.window)
            {
                TraceError.sysout("Couldn't get list of tabs, context destroyed");
                return;
            }

            if (!context)
            {
                FBTrace.sysout("ERROR? no context");
                return;
            }

            // The response contains list of all tab and global actors registered
            // on the server side. We need to cache it since these IDs will be
            // needed later (for communication to these actors).
            // See also getActorId method.
            context.listTabsResponse = response;

            var tabGrip = response.tabs[response.selected];
            self.attachTab(context, tabGrip.actor);
        });
    },

    attachTab: function(context, tabActor)
    {
        Trace.sysout("debuggerClientModule.attachTab; " + context.getName() +
            " ID: " + context.getId(), tabActor);

        if (context.tabClient && context.threadActor)
        {
            Trace.sysout("debuggerClientModule.attachTab; context.tabClient exists. " +
                "thread actor: " + context.threadActor, context.tabClient);

            this.attachThread(context, context.threadActor);
            return;
        }

        var self = this;
        this.client.attachTab(tabActor, function(response, tabClient)
        {
            Trace.sysout("debuggerClientModule.onAttachTab; " + context.getName() +
                " ID: " + context.getId());

            if (!tabClient)
            {
                TraceError.sysout("ERROR: No tab client found!");
                return;
            }

            if (!context.window)
            {
                TraceError.sysout("Couldn't attach to tab, context destroyed");
                return;
            }

            context.threadActor = response.threadActor;
            context.tabClient = tabClient;

            self.dispatch("onTabAttached", [context, false]);

            self.attachThread(context, response.threadActor);
        });
    },

    attachThread: function(context, threadActor)
    {
        Trace.sysout("debuggerClientModule.attachThread; " + context.getName() +
            " ID: " + context.getId(), threadActor);

        if (context.activeThread)
        {
            Trace.sysout("debuggerClientModule.attachThread; context.activeThread exists. " +
                activeThread);
            return;
        }

        var self = this;
        this.client.attachThread(threadActor, function(response, threadClient)
        {
            Trace.sysout("debuggerClientModule.onAttachThread; " + context.getName() +
                " ID: " + context.getId(), threadClient);

            if (!threadClient)
            {
                TraceError.sysout("debuggerClientModule.onAttachThread; ERROR " +
                    "Couldn't attach to thread: " + response.error, response);
                return;
            }

            if (!context.window)
            {
                TraceError.sysout("debuggerClientModule.onAttachThread; ERROR " +
                    " Couldn't attach to thread, context destroyed", response);
                return;
            }

            context.activeThread = threadClient;

            self.dispatch("onThreadAttached", [context, false]);

            threadClient.resume();
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Actors

    getActorId: function(context, actorName)
    {
        var tabs = context.listTabsResponse;
        if (!tabs)
            return;

        var currTabActorId = context.tabClient._actor;

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

return DebuggerClientModule;

// ********************************************************************************************* //
});
