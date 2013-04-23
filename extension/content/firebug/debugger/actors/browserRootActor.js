/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/trace",
],
function(Obj, FBTrace) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// ********************************************************************************************* //

Cu["import"]("resource://gre/modules/devtools/dbg-server.jsm");

var BrowserRootActor = DebuggerServer.BrowserRootActor;

// ********************************************************************************************* //
// Implementation

// xxxHonza: a workaround till the Firefox implementation is fixed (TBD: bug number)
var originalExitTabActor = BrowserRootActor.prototype.exitTabActor;
BrowserRootActor.prototype.exitTabActor = function(aWindow)
{
    var actor = this._tabActors.get(aWindow);
    if (actor)
    {
        this._tabActors["delete"](actor.browser);
        actor.exit();
    }
}

// ********************************************************************************************* //
// Registration

return {};

// ********************************************************************************************* //
});
