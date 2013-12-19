/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/chrome/tool",
    "firebug/debugger/script/sourceFile",
    "firebug/debugger/debuggerLib",
    "firebug/remoting/debuggerClientModule",
],
function (Firebug, FBTrace, Obj, Tool, SourceFile, DebuggerLib, DebuggerClientModule) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_SOURCETOOL");

// ********************************************************************************************* //
// Source Tool

function SourceTool(context)
{
    this.context = context;

    this._onNewSource = this.newSource.bind(this);
}

/**
 * @object This tool object is responsible for logic related to sources. It requests sources
 * from the server as well as transforms incoming packets into {@SourceFile} instances that
 * are stored inside the current {@TabContext}. Any module can consequently use these sources.
 * For example, the {@ScriptPanel} is displaying it and the {@ConsolePanel} displays source
 * lines for logged errors.
 */
SourceTool.prototype = Obj.extend(new Tool(),
/** @lends SourceTool */
{
    dispatchName: "SourceTool",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    onAttach: function(reload)
    {
        Trace.sysout("sourceTool.attach; context ID: " + this.context.getId());

        DebuggerClientModule.client.addListener("newSource", this._onNewSource);

        // Get scripts from the server. Source as fetched on demand (e.g. when
        // displayed in the Script panel).
        this.updateScriptFiles();
    },

    onDetach: function()
    {
        Trace.sysout("sourceTool.detach; context ID: " + this.context.getId());

        DebuggerClientModule.client.removeListener("newSource", this._onNewSource);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Implementation

    updateScriptFiles: function()
    {
        Trace.sysout("sourceTool.updateScriptFiles; context id: " + this.context.getId());

        var self = this;
        this.context.activeThread.getSources(function(response)
        {
            // The tool is already destroyed so, bail out.
            if (!self.attached)
                return;

            var sources = response.sources;
            for (var i = 0; i < sources.length; i++)
                self.addScript(sources[i]);
        });
    },

    newSource: function(type, response)
    {
        Trace.sysout("sourceTool.newSource; context id: " + this.context.getId() +
            ", script url: " + response.source.url, response);

        // Ignore scripts coming from different threads.
        // This is because 'newSource' listener is registered in 'DebuggerClient' not
        // in 'ThreadClient'.
        if (this.context.activeThread.actor != response.from)
        {
            Trace.sysout("sourceTool.newSource; coming from different thread");
            return;
        }

        this.addScript(response.source);
    },

    addScript: function(script)
    {
        // Ignore scripts generated from 'clientEvaluate' packets. These scripts are
        // created e.g. as the user is evaluating expressions in the watch window.
        if (DebuggerLib.isFrameLocationEval(script.url))
        {
            Trace.sysout("sourceTool.addScript; A script ignored " + script.type);
            return;
        }

        if (!this.context.sourceFileMap)
        {
            TraceError.sysout("sourceTool.addScript; ERROR Source File Map is NULL", script);
            return;
        }

        // xxxHonza: Ignore inner scripts for now
        if (this.context.sourceFileMap[script.url])
        {
            Trace.sysout("sourceTool.addScript; A script ignored: " + script.url, script);
            return;
        }

        // Create a source file and append it into the context. This is the only
        // place where an instance of {@SourceFile} is created.
        var sourceFile = new SourceFile(this.context, script.actor, script.url,
            script.isBlackBoxed);

        this.context.addSourceFile(sourceFile);

        // Notify listeners (e.g. the Script panel) to updated itself. It can happen
        // that the Script panel has been empty until now and need to display a script.
        this.dispatch("newSource", [sourceFile]);
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerTool("source", SourceTool);

return SourceTool;

// ********************************************************************************************* //
});
