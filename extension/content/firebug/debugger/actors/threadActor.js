/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/trace",
    "firebug/lib/options",
    "firebug/debugger/actors/elementActor",
],
function(Obj, FBTrace, Options, ElementActor) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu["import"]("resource://gre/modules/devtools/dbg-server.jsm");

var ThreadActor = DebuggerServer.ThreadActor;

// ********************************************************************************************* //
// Implementation

var originalObjectGrip = ThreadActor.prototype.objectGrip;
ThreadActor.prototype.objectGrip = function(value, pool)
{
    if (!pool.objectActors)
      pool.objectActors = new WeakMap();

    if (pool.objectActors.has(value))
        return pool.objectActors.get(value).grip();
    else if (this.threadLifetimePool.objectActors.has(value))
        return this.threadLifetimePool.objectActors.get(value).grip();

    // See: https://bugzilla.mozilla.org/show_bug.cgi?id=837723
    if (typeof(value.unsafeDereference) != "undefined")
    {
        var obj = value.unsafeDereference();
        if (obj instanceof HTMLElement)
        {
            var actor = new ElementActor(value, this);
            pool.addActor(actor);
            pool.objectActors.set(value, actor);
            return actor.grip();
        }
    }

    return originalObjectGrip.apply(this, arguments);
}

// ********************************************************************************************* //
// Registration

return {};

// ********************************************************************************************* //
});
