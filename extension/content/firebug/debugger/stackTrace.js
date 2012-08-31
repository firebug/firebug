/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/debugger/stackFrame",
],
function (FBTrace, StackFrame) {

// ********************************************************************************************* //
// StackTrace Implementation

function StackTrace(frames)
{
    this.frames = frames || [];
};

StackTrace.prototype =
{
    toString: function()
    {
        var trace = "<top>\n";
        for (var i = 0; i < this.frames.length; i++)
            trace += "[" + i + "]"+ this.frames[i]+"\n";
        trace += "<bottom>\n";
        return trace;
    },

    reverse: function()
    {
        this.frames.reverse();
        return this;
    },

    destroy: function()
    {
        for (var i = 0; i < this.frames.length; i++)
            this.frames[i].destroy();

        if (FBTrace.DBG_STACK)
            FBTrace.sysout("lib.StackTrace destroy " + this.uid);
    },

    toSourceLink: function()
    {
        if (this.frames.length > 0)
            return this.frames[0];
    }
};

// ********************************************************************************************* //
// Static Methods

StackTrace.buildStackTrace = function(frames, context)
{
    var trace = new StackTrace();
    for (var i=0; frames && i<frames.length; i++)
    {
        var frame = StackFrame.buildStackFrame(frames[i], context);
        trace.frames.push(frame);
        frame.frameIndex = trace.frames.length;
    }

    // Set the first frame (the one passed into this function) as the current one (issue 4249).
    if (trace.frames.length > 0)
        trace.currentFrameIndex = 1;

    return trace;
};

// ********************************************************************************************* //
// Registration

return StackTrace;

// ********************************************************************************************* //
});
