/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/firebug",
    "firebug/lib/array",
],
function(FBTrace, Firebug, Arr) {

// ********************************************************************************************* //
// Breakpoint Group

function BreakpointGroup()
{
    this.breakpoints = [];
}

BreakpointGroup.prototype =
{
    removeBreakpoint: function(bp)
    {
        Arr.remove(this.breakpoints, bp);
    },

    enumerateBreakpoints: function(callback)
    {
        var breakpoints = Arr.cloneArray(this.breakpoints);
        for (var i=0; i<breakpoints.length; i++)
        {
            var bp = breakpoints[i];
            if (callback(bp))
                return true;
        }
        return false;
    },

    findBreakpoint: function()
    {
        for (var i=0; i<this.breakpoints.length; i++)
        {
            var bp = this.breakpoints[i];
            if (this.matchBreakpoint(bp, arguments))
                return bp;
        }
        return null;
    },

    matchBreakpoint: function(bp, args)
    {
        // TODO: must be implemented in derived objects.
        return false;
    },

    isEmpty: function()
    {
        return !this.breakpoints.length;
    }
};

// ********************************************************************************************* //
// Registration

return BreakpointGroup;

// ********************************************************************************************* //
});
