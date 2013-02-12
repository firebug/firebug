/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function (FBTrace) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_SCRIPTPANEL");

// ********************************************************************************************* //
// Factory

var ClientFactory =
{
    classes: {},
    defaultGrip: null,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Registration

    registerGrip: function(gripClass, gripType)
    {
        if (this.classes[gripClass])
        {
            TraceError.sysout("gripFactory.registerGrip; ERROR A grip is already registered " +
                "for the specified class: " + gripClass);
            return;
        }

        this.classes[gripClass] = gripType;
    },

    unregisterGrip: function(gripClass)
    {
        delete this.classes[gripClass];
    },

    registerDefaultGrip: function(gripType)
    {
        this.defaultGrip = gripType;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Factory Methods

    createGripObject: function(grip, cache)
    {
        var gripClass = grip["class"];
        if (gripClass)
        {
            var gripType = this.classes[gripClass];
            if (gripType)
                return new gripType(grip, cache);
        }

        return new this.defaultGrip(grip, cache);
    }
};

// ********************************************************************************************* //
// Registration

return ClientFactory;

// ********************************************************************************************* //
});
