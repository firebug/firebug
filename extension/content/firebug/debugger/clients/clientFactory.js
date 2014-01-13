/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function (FBTrace) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_SCRIPTPANEL");

// ********************************************************************************************* //
// Factory

var ClientFactory =
{
    classes: {},
    defaultClient: null,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Registration

    registerClient: function(gripClass, gripType)
    {
        if (this.classes[gripClass])
        {
            TraceError.sysout("gripFactory.registerClient; ERROR A grip is already registered " +
                "for the specified class: " + gripClass);
            return;
        }

        this.classes[gripClass] = gripType;
    },

    unregisterClient: function(gripClass)
    {
        delete this.classes[gripClass];
    },

    registerDefaultClient: function(clientType)
    {
        this.defaultClient = clientType;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Factory Methods

    createClientObject: function(grip, cache)
    {
        var gripClass = grip["class"];
        if (gripClass)
        {
            var clientType = this.classes[gripClass];
            if (clientType)
                return new clientType(grip, cache);
        }

        return new this.defaultClient(grip, cache);
    }
};

// ********************************************************************************************* //
// Registration

return ClientFactory;

// ********************************************************************************************* //
});
