/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/debugger/sourceFile",
    "firebug/debugger/rdp",
],
function (Obj, Options, SourceFile, RDP) {

// ********************************************************************************************* //
// Constants and Services

var Cu = Components.utils;

Cu["import"]("resource:///modules/devtools/dbg-client.jsm");
Cu["import"]("resource:///modules/devtools/dbg-server.jsm");

// ********************************************************************************************* //

function BreakpointClient(connection, actor, location)
{
    this.connection = connection;
    this.actor = actor;
    this.location = location;
}

BreakpointClient.prototype =
{
    actor: null,

    /**
     * Remove the breakpoint from the server.
     */
    remove: function BC_remove(onResponse)
    {
        var packet = {
            to: this.actor,
            type: RDP.DebugProtocolTypes["delete"]
        };

        this.client.request(packet, function(response)
        {
            if (onResponse)
                onResponse(response);
        });
    }
};

// ********************************************************************************************* //
// Registration

return BreakpointClient;

// ********************************************************************************************* //
});
