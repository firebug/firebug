/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/debugger/grips/objectGrip",
],
function (FBTrace, Obj, ObjectGrip) {

// ********************************************************************************************* //
// Function Grip

function FunctionGrip(grip, cache)
{
    this.grip = grip;
    this.cache = cache;
    this.signature = null;

    // xxxHonza: function name in the function grip can be provided as:
    // name, displayName or userDisplayName
    // See: dbg-script-actors.js, ObjectActor.grip
    // See Reps.Func
    this.displayName = grip.name;
}

FunctionGrip.prototype = Obj.descend(new ObjectGrip(),
{
    toString: function()
    {
        return this.getSignature();
    },

    hasProperties: function()
    {
        return false;
    },

    getSignature: function()
    {
        if (this.signature)
            return this.signature;

        var packet = {
            to: this.getActor(),
            type: "parameterNames"
        };

        var self = this;
        return this.cache.request(packet).then(function(response)
        {
            var r = response;
            var params = r.parameters ? r.parameters.join(", ") : "";
            self.signature = r.name + "(" + params + ")";
            return self.signature;
        });
    },

    getType: function()
    {
        return "function";
    },

    getValue: function()
    {
        //xxxHonza: This method is executed 2x more than it should be, why?
        //FBTrace.sysout("FunctionGrip.getValue; " + this.signature)

        if (!this.signature)
            return this.getSignature();

        // The Reps.Func will deal with this object.
        return this;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerGrip("Function", FunctionGrip);

return FunctionGrip;

// ********************************************************************************************* //
});
