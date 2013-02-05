/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Test Progress Implementation

var TestProgress =
{
    start: function(max)
    {
        this.max = max;
        var meter = this.getMeter();
        meter.style.display = "block";
    },

    stop: function()
    {
        var meter = this.getMeter();
        meter.style.display = "none";
    },

    update: function(value)
    {
        var current = this.max - value;
        var meter = this.getMeter();
        meter.value = current ? current / (this.max / 100) : 0;
    },

    getMeter: function()
    {
        return Firebug.chrome.$("progressMeter");
    }
};

// ********************************************************************************************* //
// Registration

return TestProgress;

// ********************************************************************************************* //
});
