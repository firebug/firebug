/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/url",
    "firebug/lib/locale",
    "firebug/debugger/sourceLink",
],
function (FBTrace, Url, Locale, SourceLink) {

// ********************************************************************************************* //
// Stack Frame

function StackFrame(sourceFile, lineNo, functionName, args, nativeFrame, pc, context, newestFrame)
{
    // Essential fields
    this.sourceFile = sourceFile;
    this.line = lineNo;

    //var fn = StackFrame.getDisplayName(nativeFrame ? nativeFrame.scope : null);
    //this.fn = fn || functionName;  // cache?
    this.fn = functionName;  // cache?

    this.context = context;

    // the newest frame in the stack containing 'this' frame
    this.newestFrame = (newestFrame ? newestFrame : this);

    // optional
    this.args = args;

    // Derived from sourceFile
    this.href = sourceFile.href;

    // Mozilla
    this.nativeFrame = nativeFrame;
    this.pc = pc;
    this.script = nativeFrame ? nativeFrame.script : null;  // TODO-XB
};

StackFrame.prototype =
{
    getURL: function()
    {
        return this.href;
    },

    getCompilationUnit: function()
    {
        return this.context.getCompilationUnit(this.href);
    },

    getStackNewestFrame: function()
    {
        return this.newestFrame;
    },

    getFunctionName: function()
    {
        return this.fn;
    },

    toSourceLink: function()
    {
        return new SourceLink.SourceLink(this.sourceFile.href, this.line, "js");
    },

    toString: function()
    {
        return this.fn + ", " +
            (this.sourceFile ? this.sourceFile.href : "no source file") +
            "@" + this.line;
    },

    setCallingFrame: function(caller, frameIndex)
    {
        this.callingFrame = caller;
        this.frameIndex = frameIndex;
    },

    getCallingFrame: function()
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("getCallingFrame "+this, this);

        if (!this.callingFrame && this.nativeFrame && this.nativeFrame.isValid)
        {
            var nativeCallingFrame = this.nativeFrame.callingFrame;
            if (nativeCallingFrame)
                this.callingFrame = StackFrame.getStackFrame(nativeCallingFrame, this.context,
                    this.newestFrame);
        }
        return this.callingFrame;
    },

    getFrameIndex: function()
    {
        return this.frameIndex;
    },

    getLineNumber: function()
    {
        return this.line;
    },

    destroy: function()
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("StackFrame destroyed:"+this.uid+"\n");

        this.script = null;
        this.nativeFrame = null;
        this.context = null;
    },

    signature: function()
    {
        return this.script.tag + "." + this.pc;
    },
};

// ********************************************************************************************* //
// Static Methods

StackFrame.getStackDump = function()
{
    var lines = [];
    for (var frame = Components.stack; frame; frame = frame.caller)
        lines.push(frame.filename + " (" + frame.lineNumber + ")");

    return lines.join("\n");
};

StackFrame.getStackSourceLink = function()
{
    for (var frame = Components.stack; frame; frame = frame.caller)
    {
        if (frame.filename && frame.filename.indexOf("://firebug/") > 0)
        {
            for (; frame; frame = frame.caller)
            {
                var firebugComponent = "/modules/firebug-";
                if (frame.filename && frame.filename.indexOf("://firebug/") < 0 &&
                    frame.filename.indexOf(firebugComponent) == -1)
                    break;
            }
            break;
        }
    }
    return StackFrame.getFrameSourceLink(frame);
}

StackFrame.buildStackFrame = function(frame, context)
{
    var sourceFile = context.sourceFileMap[frame.where.url];
    if (!sourceFile)
        sourceFile = {href: frame.where.url};

    var connection = context.getConnection();

    var args = [];
    var arguments = frame.environment.bindings.arguments;
    for (var i=0; i<arguments.length; i++)
    {
        args.push({
            name: getArgName(arguments[i]),
            value: getArgValue(frame.arguments[i])
        });

        if (!frame.arguments[i].actor)
            continue;

        /*var gripCache = context.debuggerClient.activeThread.gripCache;
        gripCache.getObject(connection, frame.arguments[i], function(object)
        {
            FBTrace.sysout("object " + JSON.stringify(object), object);
        });*/
    }

    return new StackFrame(sourceFile, frame.where.line, frame.calleeName,
        args, frame, 0, context);
};

// ********************************************************************************************* //
// Helpers

function getArgName(arg)
{
    for (var p in arg)
        return p;
}

function getArgValue(arg)
{
    return arg["class"] ? arg["class"] : arg;
}

// ********************************************************************************************* //
// Registration

return StackFrame;

// ********************************************************************************************* //
});
