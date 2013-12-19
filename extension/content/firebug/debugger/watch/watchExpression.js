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

/**
 * @object Represents user watch expression created within the {@link WatchPanel} side panel.
 * Evaluation of the expression is done automatically by the {@link WatchPanel} object.
 */
WatchExpression.prototype = Obj.descend(ObjectClient.Property.prototype,
/** @lends WatchExpression */
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
