/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/url",
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/debugger/clients/grip",
    "firebug/debugger/script/sourceLink",
    "firebug/debugger/debuggerLib",
],
function (FBTrace, Obj, Url, Locale, Str, Grip, SourceLink, DebuggerLib) {

// ********************************************************************************************* //
// Constants

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_STACK");

// ********************************************************************************************* //
// Stack Frame

function StackFrame(sourceFile, lineNo, functionName, args, nativeFrame, pc, context, newestFrame)
{
    Grip.call(this, nativeFrame);

    // Essential fields
    this.sourceFile = sourceFile;
    this.line = lineNo;

    // xxxHonza: the way how the function name is computed is hacky. What about displayName?
    var fileName = sourceFile.href ? Url.getFileName(sourceFile.href) : null;
    this.fn = functionName || fileName || "(anonymous)";
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

/**
 * This object represents JavaScript execution frame. Instance of this object are usually
 * created when the debugger pauses JS execution.
 * xxxHonza: should be derived from a client object?
 */
StackFrame.prototype = Obj.descend(Grip.prototype,
/** @lends StackFrame */
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

    // xxxHonza: not used, should be refactored or removed.
    getCallingFrame: function()
    {
        Trace.sysout("stackFrame.getCallingFrame; " + this, this);

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
        Trace.sysout("stackFrame.destroy; " + this.uid);

        this.script = null;
        this.nativeFrame = null;
        this.context = null;
    },

    signature: function()
    {
        return this.getActor();
    },

    /**
     * Compare two StackFrame instances and returns true if their actor is the same.
     * (Used in bindings.xml in getObjectItem())
     *
     * @param {StackFrame} other The other object to compare with.
     * @return {boolean} true if their actor is the same.
     */
    equals: function(other)
    {
        // Note: do not compare directly with their nativeFrame => they are not always equal.
        return other.nativeFrame && this.nativeFrame &&
            other.nativeFrame.actor === this.nativeFrame.actor;
    }
});

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

/**
 * Converts from RDP stack frame packet to {@link StackFrame}
 */
StackFrame.buildStackFrame = function(frame, context)
{
    if (!frame)
    {
        TraceError.sysout("stackFrame.buildStackFrame; ERROR no frame!");
        return;
    }

    var sourceFile = context.getSourceFile(frame.where.url);
    if (!sourceFile)
        sourceFile = {href: frame.where.url};

    var args = [];
    var bindings = frame.environment.bindings;
    var arguments = bindings ? bindings.arguments : [];

    for (var i = 0; i < arguments.length; i++)
    {
        var arg = arguments[i];
        args.push({
            name: getArgName(arg),
            value: getArgValue(arg, context)
        });
    }

    var funcName = StackFrame.getFunctionName(frame);
    return new StackFrame(sourceFile, frame.where.line, funcName,
        args, frame, 0, context);
};

StackFrame.getFunctionName = function(frame)
{
    var func = frame.callee;
    if (!func)
        return "";

    // Use custom displayName (coming from the script) if provided.
    if (func.userDisplayName)
        return func.userDisplayName;

    return func.displayName || func.name;
};

StackFrame.guessFunctionName = function(url, lineNo, sourceFile)
{
    if (sourceFile)
        return StackFrame.guessFunctionNameFromLines(url, lineNo, sourceFile);

    return Url.getFileName(url) + "@" + lineNo;
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
        // xxxHonza: the source can be fetched asynchronously, we should use callback.
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
                Trace.sysout("stackFrame.guessFunctionNameFromLines; re failed for lineNo-i=" +
                    lineNo + "-" + i + " line=" + line);
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

// Firefox 30 introduced also column number in the URL (see Bug 762556)
// functionName@fileName:lineNo:columnNo
// xxxHonza: at some point we might want to utilize the column number as well.
// The regular expression can be simplified to expect both (:line:column) as soon
// as Firefox 30 (Fx30) is the minimum required version.
var reErrorStackLine = /^(.*)@(.*?):(\d*)(?::(\d*))?$/

StackFrame.parseToStackFrame = function(line, context)
{
    var m = reErrorStackLine.exec(line);
    if (!m)
        return;

    return new StackFrame({href:m[2]}, m[3], m[1], [], null, null, context);
};

StackFrame.guessFunctionArgNamesFromSource = function(source)
{
    // XXXsimon: This fails with ES6 destructuring and parentheses in default parameters.
    // We'd need a proper JavaScript parser for that.
    var m = /[^\(]*\(([^\)]*)\)/.exec(source);
    if (!m)
        return null;
    var args = m[1].split(",");
    for (var i = 0; i < args.length; i++)
    {
        var arg = args[i];
        if (arg.indexOf("=") !== -1)
            arg = arg.substr(0, arg.indexOf("="));
        arg = arg.trim();
        if (!/^[a-zA-Z$_][a-zA-Z$_0-9]*$/.test(arg))
            return null;
        args[i] = arg;
    }
    return args;
};

StackFrame.removeChromeFrames = function(trace)
{
    var frames = trace ? trace.frames : null;
    if (!frames || !frames.length)
        return null;

    var filteredFrames = [];
    for (var i = 0; i < frames.length; i++)
    {
        var href = frames[i].href;
        if (href.startsWith("chrome:") || href.startsWith("resource:"))
            continue;

        // xxxFlorent: should be reverted if we integrate
        // https://github.com/fflorent/firebug/commit/d5c65e8 (related to issue6268)
        if (DebuggerLib.isFrameLocationEval(href))
            continue;

        filteredFrames.push(frames[i]);
    }

    trace.frames = filteredFrames;

    return trace;
}

StackFrame.getFrameSourceLink = function(frame)
{
    if (frame && frame.filename)
        return new SourceLink(frame.filename, frame.lineNumber, "js");
    else
        return null;
};

// ********************************************************************************************* //
// Registration

return StackFrame;

// ********************************************************************************************* //
});
