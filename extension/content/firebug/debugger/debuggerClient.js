/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/options",
],
function (Obj, Options) {

// ********************************************************************************************* //
// Constants and Services

var Cu = Components.utils;

Cu["import"]("resource:///modules/devtools/dbg-client.jsm");
Cu["import"]("resource:///modules/devtools/dbg-server.jsm");

// ********************************************************************************************* //
// Debugger Client

function JSD2DebuggerClient(connection)
{
    this.connection = connection;
}

JSD2DebuggerClient.prototype = Obj.extend(Object,
{
    dispatchName: "JSD2DebuggerClient",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    initialize: function(context, doc)
    {
    },

    destroy: function(state)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    connect: function()
    {
        this.remoteDebugger = true;

        var host = Options.get("serverHost");
        var port = Options.get("serverPort");

        // Initialize the server to allow connections throug pipe transport.
        if (!this.remoteDebugger)
        {
            DebuggerServer.init(function () { return true; });
            DebuggerServer.addBrowserActors();
        }

        var transport = this.remoteDebugger ?
            debuggerSocketConnect(host, port) :
            DebuggerServer.connectPipe();

        FBTrace.sysout("debuggerClient.connect; host: " + host + ":" + port);

        // The transport should be wrapped within a Connection object, which should be
        // passed into the constructor. This approach will allow to attach further clients
        // (like e.g. NetMonitorClient to the same connection).
        //this.client = new DebuggerClient(this.connection);

        this.client = new DebuggerClient(transport);
        this.client.addListener("tabNavigated", this.onTabNavigated);
        this.client.addListener("tabDetached", this.onTabDetached);

        this.client.connect(function(type, traits)
        {
            this.client.listTabs(function(response)
            {
                var tab = response.tabs[response.selected];
                this.startDebugging(tab);
            }.bind(this));
        }.bind(this));
    },

    disconnect: function()
    {
        
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Calbacks

    onTabNavigated: function()
    {
        FBTrace.sysout("debuggerClient.onTabNavigated;");
    },

    onTabDetached: function()
    {
        FBTrace.sysout("debuggerClient.onTabDetached;");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    startDebugging: function(tabGrip)
    {
        this.client.attachTab(tabGrip.actor, function(response, tabClient)
        {
            if (!tabClient)
            {
                Cu.reportError("No tab client found!");
                return;
            }

            this.tabClient = tabClient;

            this.client.attachThread(response.threadActor, function(response, threadClient)
            {
                if (!threadClient)
                {
                    Cu.reportError("Couldn't attach to thread: " + aResponse.error);
                    return;
                }

                this.activeThread = threadClient;

                /*DebuggerController.ThreadState.connect(function() {
                    DebuggerController.StackFrames.connect(function() {
                        DebuggerController.SourceScripts.connect(function() {
                            aThreadClient.resume();
                        });
                    });
                });*/

                this.scripts = new SourceScripts(this.client, this.activeThread);
                this.scripts.connect();

                this.activeThread.resume();

                FBTrace.sysout("debuggerClient.startDebugging;");

            }.bind(this));
        }.bind(this));
    }
});

// ********************************************************************************************* //

/**
 * Keeps the source script list up-to-date, using the thread client's
 * source script cache.
 */
function SourceScripts(client, thread)
{
    this.client = client;
    this.thread = thread;
}

SourceScripts.prototype =
{
    connect: function (callback)
    {
        this._onNewScript = this.onNewScript.bind(this);
        this._onScriptsAdded = this.onScriptsAdded.bind(this);
        this._onScriptsCleared = this.onScriptsCleared.bind(this);

        this.client.addListener("newScript", this._onNewScript);
        this.thread.addListener("scriptsadded", this._onScriptsAdded);
        this.thread.addListener("scriptscleared", this._onScriptsCleared);

        // Retrieve the list of scripts known to the server from before the client
        // was ready to handle new script notifications.
        this.thread.fillScripts();
    },

    disconnect: function()
    {
        
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onNewScript: function(notification, packet)
    {
        FBTrace.sysout("SourceScripts.onNewScript; " + notification, packet);
    },

    onScriptsAdded: function()
    {
        
    },

    onScriptsCleared: function()
    {
        
    },
};


// ********************************************************************************************* //
// Registration

return JSD2DebuggerClient;

// ********************************************************************************************* //
});
