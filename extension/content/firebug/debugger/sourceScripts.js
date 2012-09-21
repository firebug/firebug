/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/debugger/sourceFile",
],
function (FBTrace, Obj, SourceFile) {

// ********************************************************************************************* //
// Constants

FBTrace = FBTrace.to("DBG_SCRIPTVIEW");

// ********************************************************************************************* //
// Source Scripts

//xxxHonza: This entire object should be refactored.

/**
 * Keeps the source script list up-to-date, using the thread client's
 * source script cache.
 */
function SourceScripts(debuggerClient)
{
    this.context = debuggerClient.context;
    this.debuggerClient = debuggerClient;
    this.connection = debuggerClient.connection;
    this.thread = debuggerClient.activeThread;
}

SourceScripts.prototype =
{
    connect: function(callback)
    {
        this.thread.addListener(this);

        // Retrieve the list of scripts known to the server from before the client
        // was ready to handle new script notifications.
        this.thread.fillScripts();

        this.onNewScript = this.onNewScript.bind(this);
        this.connection.addListener("newScript", this.onNewScript);
    },

    disconnect: function()
    {
        this.thread.removeListener(this);
        this.connection.removeListener("newScript", this.onNewScript);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onNewScript: function(notification, script)
    {
        // Ignore scripts generated from 'clientEvaluate' packets. These scripts are
        // create as the user is evaluating expressions in the watch window.
        if (script.url == "debugger eval code")
            return;

        FBTrace.sysout("SourceScripts.onNewScript; " + notification, script);

        var sourceFile = new SourceFile(script.url, script.startLine, script.lineCount);
        this.watchSourceFile(sourceFile);

        this.thread.dispatch("newScript", [sourceFile]);
    },

    onScriptsAdded: function(scriptCache)
    {
        for (var p in scriptCache)
        {
            var script = scriptCache[p];
            this.onNewScript("newScript", script);
        }
    },

    onScriptsCleared: function()
    {
    },

    watchSourceFile: function(sourceFile)
    {
        // @hack
        // xxxHonza: the Script panel update should happen from within the Script panel
        // The DebuggerClient (or SourceScripts) should just fire an event to the panel.

        var context = Firebug.currentContext;

        // store in the context and notify listeners
        context.addSourceFile(sourceFile);

        // Update the Script panel, this script could have been loaded asynchronously
        // and perhaps is the only one that should be displayed (otherwise the panel
        // would show: No Javascript on this page). See issue 4932
        var panel = context.getPanel("jsd2script", true);
        if (!panel)
            return;

        context.invalidatePanels("jsd2script");
        context.invalidatePanels("jsd2breakpoints");

        if (!panel.location)
            panel.navigate(null);
    },
};

// ********************************************************************************************* //
// Registration

return SourceScripts;

// ********************************************************************************************* //
});
