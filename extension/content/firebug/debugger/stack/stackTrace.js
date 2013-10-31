/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/debugger/stack/stackFrame",
],
function (FBTrace, StackFrame) {

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_STACK");

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
        for (var i=0; i<this.frames.length; i++)
            trace += "[" + i + "]" + this.frames[i] + "\n";
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

        Trace.sysout("stackTrace.destroy; " + this.uid);
    },

    toSourceLink: function()
    {
        if (this.frames.length > 0)
            return this.frames[0].toSourceLink();
    },

    getTopFrame: function()
    {
        if (this.frames.length > 0)
            return this.frames[0];
    }
};

// ********************************************************************************************* //
// Static Methods

StackTrace.buildStackTrace = function(context, frames)
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

StackTrace.parseToStackTrace = function(stack, context)
{
     var lines = stack.split("\n");
     var trace = new StackTrace();

     for (var i=0; i<lines.length; i++)
     {
         var frame = StackFrame.parseToStackFrame(lines[i],context);

         Trace.sysout("StackTrace.parseToStackTrace; i " + i + " line:" + lines[i] +
            "->frame: " + frame, frame);

         if (frame)
             trace.frames.push(frame);
     }

     return trace;
};

// ********************************************************************************************* //
// Registration

return StackTrace;

// ********************************************************************************************* //
});
