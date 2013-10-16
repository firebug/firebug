/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/trace",
    "firebug/lib/options",
],
function(Obj, FBTrace, Options) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

Cu["import"]("resource://gre/modules/devtools/dbg-server.jsm");

var ObjectActor = DebuggerServer.ObjectActor;
var propMax = Options.get("ObjectShortIteratorMax");

// ********************************************************************************************* //
// Implementation

var level = 0;

/**
 * @actor Hook existing ObjectActor object and send some properties together with
 * the basic grip. This allows e.g. the Watch panel to display more useful
 * info in the value label.
 */
var originalGrip = ObjectActor.prototype.grip;
ObjectActor.prototype.grip = function()
{
    var grip = originalGrip.apply(this, arguments);

    // Avoid recursion (we need only one level of data).
    if (level > 1)
        return grip;

    level++;

    var counter = 0;
    var props = this.obj.getOwnPropertyNames();
    for (var i=0; i<props.length; i++)
    {
        try
        {
            var name = props[i];
            var desc = this.obj.getOwnPropertyDescriptor(name);

            if (!grip.ownProperties)
                grip.ownProperties = {};

            grip.ownProperties[name] = this.threadActor.createValueGrip(desc.value);

            if (++counter > propMax)
                break;
        }
        catch (e)
        {
            // Calling getOwnPropertyDescriptor on wrapped native prototypes is not allowed.
            FBTrace.sysout("objectActor.grip; EXCEPTION " + e, e);

            // xxxHonza: if there is an error (e.g. the object doesn't exist on the
            // server side), there might be an infinite loop asking again for the
            // same object, getting error, etc.
        }
    }

    // Get also prototype info.
    grip.prototype = this.threadActor.createValueGrip(this.obj.proto);

    level--;

    return grip;
}

// ********************************************************************************************* //
// Registration

return {};

// ********************************************************************************************* //
});
