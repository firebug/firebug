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

    attach: function(callback)
    {
        this.connection.addListener("tabNavigated", this.onTabNavigated);
        this.connection.addListener("tabDetached", this.onTabDetached);

        var self = this;
        this.connection.listTabs(function(response)
        {
            var tab = response.tabs[response.selected];
            self.startDebugging(tab);
        });
    },

    detach: function()
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
        FBTrace.sysout("startDebugging")
        this.connection.attachTab(tabGrip.actor, function(response, tabActor)
        {
            if (!tabActor)
            {
                Cu.reportError("No tab client found!");
                return;
            }

            this.tabActor = tabActor;

            /*this.connection.attachThread(response.threadActor, function(response, threadClient)
            {
                if (!threadClient)
                {
                    Cu.reportError("Couldn't attach to thread: " + aResponse.error);
                    return;
                }

                this.activeThread = threadClient;

                this.scripts = new SourceScripts(this.client, this.activeThread);
                this.scripts.connect();

                this.activeThread.resume();

                FBTrace.sysout("debuggerClient.startDebugging;");

            }.bind(this));*/
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
