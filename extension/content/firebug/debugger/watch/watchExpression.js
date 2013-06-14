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
 * @object Represents user watch expression created within the {@WatchPanel} side panel.
 * Evaluation of the expression is done automatically by the {@WatchPanel} object.
 */
WatchExpression.prototype = Obj.descend(new ObjectClient.Property(),
/** @lends WatchExpression */
{
    getName: function()
    {
        return this.expr;
    },

    hasChildren: function()
    {
        return this.value ? Obj.hasProperties(this.value) : false;
    },
});

// ********************************************************************************************* //
// Registration

return WatchExpression;

// ********************************************************************************************* //
});
