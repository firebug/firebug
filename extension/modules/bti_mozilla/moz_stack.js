/* See license.txt for terms of usage */


// require fbs
Components.utils.import("resource://firebug/firebug-service.js");




/**
 * Describes the event listener functions supported by the {@link JavaScriptStack}.
 *
 * @constructor
 * @type BrowserEventListener
 * @return a new {@link BrowserEventListener}
 * @version 1.0
 */
JavaScriptStack.EventListener =
{
};


/*
 * When called, this function returns the BTI Stack from the caller back
 * through older frames to the first-called frame.
 *
 *  The Mozilla implementation halts the execution then converts the jsd stack to a BTI stack.
 */


JavaScriptStack.getCurrentStack = function(context)
{
    var trace = null;

    fbs.halt(this, function convertJSDFrameToBTIFrame(frame)
    {
        if (FBTrace.DBG_STACK) FBTrace.sysout("lib.getCurrentStackTrace frame:", frame);
        trace = this.convertToBTIStack(frame, context);
        if (FBTrace.DBG_STACK) FBTrace.sysout("lib.getCurrentStackTrace trace:", trace.toString().split('\n'));
    });

    return trace;
};

/*
 * Converts a Mozilla stack frame to a BTI StackFrame
 */
JavaScriptStack.convertToBTIStack = function(frame, context, skipSystemFrames)
{
    try
    {
        var trace = new JavaScriptStack();
        var nextOlderFrame = null;
        for (; frame && frame.isValid; frame = frame.callingFrame)
        {
            if (!(skipSystemFrames && this.isSystemURL(FBL.normalizeURL(frame.script.fileName))))
            {
                var stackFrame = this.getStackFrame(frame, context);
                if (stackFrame)
                {
                    if (context.currentFrame && context.currentFrame === frame)
                        trace.currentFrameIndex = trace.length;

                    stackFrame.setCallingFrame(nextOlderFrame, trace.frames.length);
                    nextOlderFrame = stackFrame;
                    trace.frames.push(stackFrame);
                }
            }
            else
            {
                if (FBTrace.DBG_STACK)
                    FBTrace.sysout("lib.convertToBTIStack isSystemURL frame.script.fileName "+frame.script.fileName+"\n");
            }
        }

        if (trace.frames.length > 100)  // TODO in the loop above
        {
            var originalLength = trace.frames.length;
            trace.frames.splice(50, originalLength - 100);
            var excuse = "(eliding "+(originalLength - 100)+" frames)";
            trace.frames[50] = new this.StackFrame({href: excuse}, 0, excuse, []);
        }

    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("convertToBTIStack FAILS "+exc, exc);
    }
    return trace;
};


JavaScriptStack.NativeFrame = function NativeFrame()
{
    var nativeFrame = new StackFrame(undefined, undefined, undefined, "nativeFunction", 1);
}

/*
 * Converts from Mozilla stack frame to BTI frame
 */

JavaScriptStack.getStackFrame = function(frame, context)
{
    if (frame.isNative || frame.isDebugger)
    {
        var excuse = (frame.isNative) ?  "(native)" : "(debugger)";
        if (FBTrace.DBG_STACK) FBTrace.sysout("lib.getStackFrame "+excuse+" frame\n");
        return new StackFrame(undefined, undefined, undefined, "nativeFunction", 1);
    }
    try
    {
        var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, frame.script);
        if (sourceFile)
        {
            var url = sourceFile.href;
            var analyzer = sourceFile.getScriptAnalyzer(frame.script);

            var lineNo = analyzer.getSourceLineFromFrame(context, frame);
            var fncSpec = analyzer.getFunctionDescription(frame.script, context, frame);
            if (!fncSpec.name || fncSpec.name === "anonymous")
            {
                fncSpec.name =  this.guessFunctionName(url, frame.script.baseLineNumber, context);
                if (!fncSpec.name)
                    fncSpec.name = "?";
            }

            if (FBTrace.DBG_STACK) FBTrace.sysout("lib.getStackFrame "+fncSpec.name, {sourceFile: sourceFile, script: frame.script, fncSpec: fncSpec, analyzer: analyzer});
            return new this.StackFrame(undefined, undefined, sourceFile, fncSpec.name, fncSpec.args, lineNo);
        }
        else
        {
            if (FBTrace.DBG_STACK)
                FBTrace.sysout("lib.getStackFrame NO sourceFile tag@file:"+frame.script.tag+"@"+frame.script.fileName, frame.script.functionSource);

            var script = frame.script;

            return new this.StackFrame({href: FBL.normalizeURL(script.fileName)}, frame.line, script.functionName, [], frame);
        }
    }
    catch (exc)
    {
        if (FBTrace.DBG_STACK) FBTrace.sysout("getCorrectedStackTrace fails: "+exc, exc);
        return null;
    }
};
