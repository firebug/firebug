/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/debugger/clients/objectClient",
],
function (FBTrace, Obj, ObjectClient) {

// ********************************************************************************************* //
// Watch Expression

function WatchExpression(expr)
{
    this.expr = expr;

    // The value is set after the expression is evaluated on the back-end.
    this.value = undefined;
}

WatchExpression.prototype = Obj.descend(new ObjectClient.Property(),
{
    getName: function()
    {
        return this.expr;
    }
});

// ********************************************************************************************* //
// Registration

return WatchExpression;

// ********************************************************************************************* //
});
