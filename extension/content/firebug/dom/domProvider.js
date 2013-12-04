/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/debugger/clients/clientProvider",
    "firebug/dom/domMemberProvider",
    "firebug/debugger/debuggerLib",
],
function (FBTrace, Obj, ClientProvider, DOMMemberProvider, DebuggerLib) {

"use strict";

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_DOM");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Watch Panel Provider

function DomProvider(panel)
{
    this.panel = panel;
    this.memberProvider = new DOMMemberProvider(panel.context);
}

/**
 * @provider Used to provide content data for {@DomPanelTree}, which is used to render
 * content within {@DOMPanel}.
 */
var BaseProvider = ClientProvider.prototype;
DomProvider.prototype = Obj.extend(BaseProvider,
/** @lends DomProvider */
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Data Provider

    getValue: function(object)
    {
        var localObject = this.getLocalObject(object);
        if (localObject)
            return localObject;

        return BaseProvider.getValue.apply(this, arguments);
    },

    hasChildren: function(object)
    {
        // If the base provider says, the object has children, let's go with it.
        if (BaseProvider.hasChildren.apply(this, arguments))
            return true;

        // ... otherwise we need to try to get the local object (breaking RDP)
        // and check if it has any JS members.
        var localObject = this.getLocalObject(object);
        if (localObject)
            return Obj.hasProperties(localObject);

        return false;
    },
});

// ********************************************************************************************* //
// Registration

return DomProvider;

// ********************************************************************************************* //
});
