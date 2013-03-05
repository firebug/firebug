/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/url",
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/debugger/script/sourceLink",
],
function (FBTrace, Url, Locale, Str, SourceLink) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.to("DBG_ERRORS");
var Trace = FBTrace.to("DBG_STACK");

// ********************************************************************************************* //
// Stack Frame

// xxxHonza: should be derived from a client object
function StackFrame(sourceFile, lineNo, functionName, args, nativeFrame, pc, context, newestFrame)
{
    // Essential fields
    this.sourceFile = sourceFile;
    this.line = lineNo;
    this.fn = functionName || "(anonymous)";
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
        var sourceLink = new SourceLink(this.sourceFile.href, this.line, "js");

        // Source link from a frame is always marked as the current debug location so,
        // the underlying source view knows that the target line should be decorated.
        sourceLink.options.debugLocation = true;
        return sourceLink;
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
        return this.getActor();
    },

    getActor: function()
    {
        return this.nativeFrame.actor;
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
    if (!frame)
    {
        TraceError.sysout("stackFrame.buildStackFrame; ERROR no frame!");
        return;
    }

    var sourceFile = context.sourceFileMap[frame.where.url];
    if (!sourceFile)
        sourceFile = {href: frame.where.url};

    var args = [];
    var bindings = frame.environment.bindings;
    var arguments = bindings ? bindings.arguments : [];
    for (var i=0; i<arguments.length; i++)
    {
        var arg = arguments[i];
        args.push({
            name: getArgName(arg),
            value: getArgValue(arg, context)
        });
    }

    // Get function name
    var funcName = frame.callee ? frame.callee.displayName : "";
    if (!funcName)
        funcName = frame.callee ? frame.callee.name : "";

    return new StackFrame(sourceFile, frame.where.line, funcName,
        args, frame, 0, context);
};

StackFrame.guessFunctionName = function(url, lineNo, sourceFile)
{
    if (sourceFile)
        return StackFrame.guessFunctionNameFromLines(url, lineNo, sourceFile);

    return "? in " + Url.getFileName(url) + "@" + lineNo;
}

var reGuessFunction = /['"]?([$0-9A-Za-z_]+)['"]?\s*[:=]\s*(function|eval|new Function)/;
var reFunctionArgNames = /function ([^(]*)\(([^)]*)\)/;
StackFrame.guessFunctionNameFromLines = function(url, lineNo, sourceFile)
{
    // Walk backwards from the first line in the function until we find the line which
    // matches the pattern above, which is the function definition
    var line = "";
    for (var i = 0; i < 4; ++i)
    {
        line = sourceFile.getLine(lineNo - i) + line;
        if (line != undefined)
        {
            var m = reGuessFunction.exec(line);
            if (m)
            {
                return m[1];
            }
            else
            {
                if (FBTrace.DBG_FUNCTION_NAMES)
                    FBTrace.sysout("lib.guessFunctionName re failed for lineNo-i="+lineNo+
                        "-"+i+" line="+line+"\n");
            }

            m = reFunctionArgNames.exec(line);
            if (m && m[1])
                return m[1];
        }
    }

    return Url.getFileName(url) + "@" + lineNo;
}

// ********************************************************************************************* //
// Helpers

function getArgName(arg)
{
    for (var p in arg)
        return p;
}

function getArgValue(arg, context)
{
    var name = getArgName(arg);
    var grip = arg[name].value;

    var object = context.clientCache.getObject(grip);
    if (object && typeof(object) == "object")
        return object.getValue();

    return object;
}

// ********************************************************************************************* //
// JSD1 Artifacts

StackFrame.suspendShowStackTrace = function(){}
StackFrame.resumeShowStackTrace = function(){}

// ********************************************************************************************* //

// functionName@fileName:lineNo
var reErrorStackLine = /^(.*)@(.*):(\d*)$/;

StackFrame.parseToStackFrame = function(line, context)
{
    var m = reErrorStackLine.exec(line);
    if (!m)
        return;

    return new StackFrame({href:m[2]}, m[3], m[1], [], null, null, context);
};

StackFrame.cleanStackTraceOfFirebug = function(trace)
{
    if (trace && trace.frames)
    {
        var count = trace.frames.length - 1;
        while (trace.frames.length && (/^_[fF]irebug/.test(trace.frames[count].fn) ||
            /^\s*with\s*\(\s*_[fF]irebug/.test(trace.frames[count].sourceFile.source)))
        {
            trace.frames.pop();
        }

        if (trace.frames.length == 0)
            trace = undefined;
    }
    return trace;
};

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
};

StackFrame.getFrameSourceLink = function(frame)
{
    if (frame && frame.filename && frame.filename.indexOf("XPCSafeJSObjectWrapper") == -1)
        return new SourceLink(frame.filename, frame.lineNumber, "js");
    else
        return null;
};

// ********************************************************************************************* //
// Registration

return StackFrame;

// ********************************************************************************************* //
});
