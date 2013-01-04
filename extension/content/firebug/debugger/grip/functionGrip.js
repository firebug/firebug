/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/debugger/grip/objectGrip",
],
function (FBTrace, ObjectGrip) {

// ********************************************************************************************* //
// Function Grip

function FunctionGrip(grip, cache)
{
    this.grip = grip;
    this.cache = cache;
    this.signature = null;
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

        return this;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerGrip("Function", FunctionGrip);

return FunctionGrip;

// ********************************************************************************************* //
});
