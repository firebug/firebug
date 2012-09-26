/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/debugger/sourceScripts",
    "firebug/debugger/rdp",
    "firebug/debugger/threadClient",
],
function (Obj, Options, SourceScripts, RDP, ThreadClient) {

// ********************************************************************************************* //
// Constants and Services

var Cu = Components.utils;

Cu["import"]("resource:///modules/devtools/dbg-client.jsm");
Cu["import"]("resource:///modules/devtools/dbg-server.jsm");

// ********************************************************************************************* //
// Debugger Client

function DebuggerClient(context, connection)
{
    this.context = context;
    this.connection = connection;

    this.threadClients = {};

    this.onTabNavigatedListener = this.onTabNavigated.bind(this);
    this.onTabDetachedListener = this.onTabDetached.bind(this);
    this.onThreadStateListener = this.onThreadState.bind(this);
}

DebuggerClient.prototype = Obj.extend(new Firebug.EventSource(),
{
    dispatchName: "DebuggerClient",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    initialize: function(context, doc)
    {
    },

    destroy: function(state)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    attach: function(callback)
    {
        FBTrace.sysout("debuggerClient.attach;");

        this.connection.addListener("tabNavigated", this.onTabNavigatedListener);
        this.connection.addListener("tabDetached", this.onTabDetachedListener);
        this.connection.addListener("paused", this.onThreadStateListener);
        this.connection.addListener("resumed", this.onThreadStateListener);
        this.connection.addListener("detached", this.onThreadStateListener);

        var self = this;
        this.connection.listTabs(function(response)
        {
            var tab = response.tabs[response.selected];
            self.startDebugging(tab, callback);
        });
    },

    detach: function(callback)
    {
        FBTrace.sysout("debuggerClient.detach;");

        if (!this.activeThread)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("debuggerClient.detach; ERROR activeThread not defined?");
            return;
        }

        this.connection.removeListener("tabNavigated", this.onTabNavigatedListener);
        this.connection.removeListener("tabDetached", this.onTabDetachedListener);
        this.connection.removeListener("paused", this.onThreadStateListener);
        this.connection.removeListener("resumed", this.onThreadStateListener);
        this.connection.removeListener("detached", this.onThreadStateListener);

        var self = this;
        var activeThread = this.activeThread;

        activeThread.detach(function()
        {
            self.connection.detachTab(function()
            {
                callback(activeThread);
            });
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Calbacks

    onTabNavigated: function()
    {
        FBTrace.sysout("debuggerClient.onTabNavigated;");

        // xxxHonza: for local debugging we have TabWatcher
        // for remote debugging tab-navigated should be handler by TabClient
        /*var self = this;
        this.detach(function()
        {
            self.attach();
        });*/
    },

    onTabDetached: function()
    {
        FBTrace.sysout("debuggerClient.onTabDetached;");
    },

    onThreadState: function(type, packet)
    {
        // paused/resumed/detached get special treatment...
        if (packet.type in RDP.ThreadStateTypes && packet.from in this.threadClients)
            this.threadClients[packet.from].onThreadState(packet);
    },

    onNewScript: function(type, packet)
    {
        FBTrace.sysout("debuggerClient.onNewScript", arguments);

        if (this.scripts)
            this.scripts.onNewScript(packet);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    startDebugging: function(tabGrip, callback)
    {
        this.connection.attachTab(tabGrip.actor, function(response, tabActor)
        {
            if (!tabActor)
            {
                Cu.reportError("No tab client found!");
                return;
            }

            this.tabActor = tabActor;

            this.attachThread(response.threadActor, function(response, threadClient)
            {
                if (!threadClient)
                {
                    Cu.reportError("Couldn't attach to thread: " + response.error);
                    return;
                }

                FBTrace.sysout("debuggerClient.onAttachThread; Thread attached.");

                this.activeThread = threadClient;

                // Connect script manager
                this.scripts = new SourceScripts(this);
                this.scripts.connect();

                // Resume remote thread.
                this.activeThread.resume();

                callback(threadClient);

            }.bind(this));
        }.bind(this));
    },

    attachThread: function DebuggerClient_attachThread(threadActor, onResponse)
    {
        var packet = {
            to: threadActor,
            type: RDP.DebugProtocolTypes.attach
        };

        var self = this;
        this.connection.request(packet, function(response)
        {
            if (!response.error)
            {
                var threadClient = new ThreadClient(self.connection, threadActor, self);
                self.threadClients[threadActor] = threadClient;
                self.activeThread = threadClient;
            }

            onResponse(response, threadClient);
        });
    },
});

// ********************************************************************************************* //
// Registration

return DebuggerClient;

// ********************************************************************************************* //
});
