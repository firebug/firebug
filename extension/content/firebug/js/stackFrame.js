/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/url",
    "firebug/lib/locale",
    "firebug/lib/wrapper",
    "firebug/js/sourceLink",
    "firebug/lib/deprecated",
    "firebug/lib/options",
],
function (FBTrace, Url, Locale, Wrapper, SourceLink, Deprecated, Options) {

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// Implementation

var StackFrame = {};

StackFrame.getStackTrace = Deprecated.deprecated("name change for self-documentation",
    StackFrame.getCorrectedStackTrace);

/**
 * Converts a Mozilla stack frame to a frameXB
 */
StackFrame.getCorrectedStackTrace = function(frame, context)
{
    try
    {
        var trace = new StackFrame.StackTrace();
        var newestFrame = null;
        var nextOlderFrame = null;
        for (; frame && frame.isValid; frame = frame.callingFrame)
        {
            if (!(Options.get("filterSystemURLs") &&
                Url.isSystemURL(Url.normalizeURL(frame.script.fileName))))
            {
                var stackFrame = StackFrame.getStackFrame(frame, context, newestFrame);
                if (stackFrame)
                {
                    if (!newestFrame)
                        newestFrame = stackFrame;

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
                    FBTrace.sysout("lib.getCorrectedStackTrace isSystemURL frame.script.fileName "+
                        frame.script.fileName+"\n");
            }
        }

        if (trace.frames.length > 100)  // TODO in the loop above
        {
            var originalLength = trace.frames.length;
            trace.frames.splice(50, originalLength - 100, null);
            var excuse = "(eliding "+(originalLength - 100)+" frames)";

            trace.frames[50] = new StackFrame.StackFrame({href: excuse}, 0, excuse,
                [], null, null, context, newestFrame);
        }

    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("getCorrectedStackTrace FAILS "+exc, exc);
    }
    return trace;
};

/*
 * Converts from Mozilla stack frame to frameXB
 */
StackFrame.getStackFrame = function(frame, context, newestFrameXB)
{
    if (frame.isNative || frame.isDebugger)
    {
        var excuse = (frame.isNative) ?  "(native)" : "(debugger)";
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("lib.getStackFrame "+excuse+" frame\n");

        return new StackFrame.StackFrame({href: excuse}, 0, excuse, [],
            null, null, context, newestFrameXB);
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
                fncSpec.name = StackFrame.guessFunctionName(url, frame.script.baseLineNumber, context);
                if (!fncSpec.name)
                    fncSpec.name = "?";
            }

            if (FBTrace.DBG_STACK)
                FBTrace.sysout("lib.getStackFrame "+fncSpec.name, {sourceFile: sourceFile,
                    script: frame.script, fncSpec: fncSpec, analyzer: analyzer});

            return new StackFrame.StackFrame(sourceFile, lineNo, fncSpec.name, fncSpec.args, frame,
                frame.pc, sourceFile.context, newestFrameXB);
        }
        else
        {
            if (FBTrace.DBG_STACK)
                FBTrace.sysout("lib.getStackFrame NO sourceFile tag@file:"+frame.script.tag+
                    "@"+frame.script.fileName, frame.script.functionSource);

            var script = frame.script;
            return new StackFrame.StackFrame({href: Url.normalizeURL(script.fileName)}, frame.line,
                script.functionName, [], frame, frame.pc, context, newestFrameXB);
        }
    }
    catch (exc)
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("getStackFrame fails: "+exc, exc);
        return null;
    }
};

// ********************************************************************************************* //
// frameXB, cross-browser frame

StackFrame.StackFrame = function(sourceFile, lineNo, functionName, args, nativeFrame, pc,
    context, newestFrame)
{
    // Essential fields
    this.sourceFile = sourceFile;
    this.line = lineNo;

    var fn = StackFrame.getDisplayName(nativeFrame ? nativeFrame.scope : null);
    this.fn = fn || functionName;  // cache?

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

StackFrame.StackFrame.prototype =
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
        return this.fn+", "+this.sourceFile.href+"@"+this.line;
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

    getThisValue: function()
    {
        if (this.nativeFrame && !this.thisVar)
            this.thisVar = Wrapper.unwrapIValue(this.nativeFrame.thisValue, Firebug.viewChrome);
        return this.thisVar;
    },

    getScopes: function(viewChrome)
    {
        if (this.nativeFrame && !this.scope)
            this.scope = this.generateScopeChain(this.nativeFrame.scope, viewChrome);
        return this.scope;
    },

    clearScopes: function(viewChrome)
    {
        // Clears cached scope chain, so that it regenerates the next time
        // getScopes() is executed.
        this.scope = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Private

    generateScopeChain: function (scope, viewChrome)
    {
        var ret = [];
        while (scope)
        {
            var scopeVars;

            // getWrappedValue will not contain any variables for closure
            // scopes, so we want to special case this to get all variables
            // in all cases.
            if (scope.jsClassName == "Call")
            {
                scopeVars = Wrapper.unwrapIValueObject(scope, viewChrome)
                scopeVars.toString = function() {return Locale.$STR("Closure Scope");}
            }
            else if (scope.jsClassName == "Block")
            {
                scopeVars = Wrapper.unwrapIValueObject(scope, viewChrome)
                scopeVars.toString = function() {return Locale.$STR("Block Scope");}
            }
            else
            {
                scopeVars = Wrapper.unwrapIValue(scope, Firebug.viewChrome);
                if (scopeVars && scopeVars.hasOwnProperty)
                {
                    if (!scopeVars.hasOwnProperty("toString"))
                    {
                        (function() {
                            var className = scope.jsClassName;
                            scopeVars.toString = function()
                            {
                                return Locale.$STR(className + " Scope");
                            };
                        })();
                    }
                }
                else
                {
                    // do not trace scopeVars, you will get a uncatchable exception
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("dom .generateScopeChain: bad scopeVars for " +
                            "scope.jsClassName:" + scope.jsClassName);

                    scopeVars = {error: "Mozilla error: invalid scope variables"};
                }
            }

            if (scopeVars)
                ret.push(scopeVars);

            scope = scope.jsParent;
        }

        ret.toString = function()
        {
            return Locale.$STR("Scope Chain");
        };

        return ret;
    },
};

//-----------------------111111----222222-----33---444  1 All 'Not a (' followed by (; 2 All 'Not a )' followed by a ); 3 text between @ and : digits

var reErrorStackLine = /^(.*)@(.*):(\d*)$/;
var reErrorStackLine2 = /^([^\(]*)\((.*)\)$/;

StackFrame.parseToStackFrame = function(line, context) // function name (arg, arg, arg)@fileName:lineNo
{
    var last255 = line.length - 255;
    if (last255 > 0)
        line = line.substr(last255);   // avoid regexp on monster compressed source (issue 4135)

    var m = reErrorStackLine.exec(line);
    if (m)
    {
        var m2 = reErrorStackLine2.exec(m[1]);
        if (m2)
        {
            var params = m2[2].split(',');
            //FBTrace.sysout("parseToStackFrame",{line:line,paramStr:m2[2],params:params});
            //var params = JSON.parse("["+m2[2]+"]");
            return new StackFrame.StackFrame({href:m[2]}, m[3], m2[1], params, null, null, context);
        }
        else
        {
            // Firefox 14 removes arguments from <exception-object>.stack.toString()
            // That's why the m2 reg doesn't match
            // See: https://bugzilla.mozilla.org/show_bug.cgi?id=744842
            return new StackFrame.StackFrame({href:m[2]}, m[3], m[1], [], null, null, context);
        }
    }
}

StackFrame.parseToStackTrace = function(stack, context)
{
     var lines = stack.split('\n');
     var trace = new StackFrame.StackTrace();
     for (var i = 0; i < lines.length; i++)
     {
         var frame = StackFrame.parseToStackFrame(lines[i],context);

         if (FBTrace.DBG_STACK)
             FBTrace.sysout("parseToStackTrace i "+i+" line:"+lines[i]+ "->frame: "+frame, frame);

         if (frame)
             trace.frames.push(frame);
     }
     return trace;
}

StackFrame.cleanStackTraceOfFirebug = function(trace)
{
    if (trace && trace.frames)
    {
        while (trace.frames.length &&
            (
             /^_[fF]irebug/.test(trace.frames[trace.frames.length - 1].fn) ||
             /^\s*with\s*\(\s*_[fF]irebug/.test(trace.frames[trace.frames.length - 1].sourceFile.source)
            )
        )
        {
            trace.frames.pop();
        }
        if (trace.frames.length == 0)
            trace = undefined;
    }
    return trace;
}

StackFrame.getStackDump = function()
{
    var lines = [];
    for (var frame = Components.stack; frame; frame = frame.caller)
        lines.push(frame.filename + " (" + frame.lineNumber + ")");

    return lines.join("\n");
};

StackFrame.getJSDStackDump = function(newestFrame)
{
    var lines = [];
    for (var frame = newestFrame; frame; frame = frame.callingFrame)
        lines.push(frame.script.fileName + " (" + frame.line + ")");

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

StackFrame.getFrameSourceLink = function(frame)
{
    if (frame && frame.filename && frame.filename.indexOf("XPCSafeJSObjectWrapper") == -1)
        return new SourceLink.SourceLink(frame.filename, frame.lineNumber, "js");
    else
        return null;
};

// TODO delete this, only used by console and console injector.
StackFrame.getStackFrameId = function()
{
    for (var frame = Components.stack; frame; frame = frame.caller)
    {
        if (frame.languageName == "JavaScript"
            && !(frame.filename && frame.filename.indexOf("://firebug/") > 0))
        {
            return frame.filename + "/" + frame.lineNumber;
        }
    }
    return null;
};

// ********************************************************************************************* //

StackFrame.StackTrace = function(adoptFrames)
{
    this.frames = adoptFrames || [];
};

StackFrame.StackTrace.prototype =
{
    toString: function()
    {
        var trace = "<top>\n";
        for (var i = 0; i < this.frames.length; i++)
        {
            trace += "[" + i + "]"+ this.frames[i]+"\n";
        }
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
            FBTrace.sysout("lib.StackTrace destroy "+this.uid+"\n");
    },

    toSourceLink: function()
    {
        if (this.frames.length > 0)
            return this.frames[0];
    }
};

// ********************************************************************************************* //

StackFrame.traceToString = function(trace)
{
    var str = "<top>";
    for(var i = 0; i < trace.frames.length; i++)
        str += "\n" + trace.frames[i];
    str += "\n<bottom>";
    return str;
};

StackFrame.buildStackTrace = function(frame)
{
    var trace = new StackFrame.StackTrace();
    while (frame)
    {
        trace.frames.push(frame);
        frame.frameIndex = trace.frames.length;
        frame = frame.getCallingFrame();
    }

    // Set the first frame (the one passed into this function) as the current one (issue 4249).
    if (trace.frames.length > 0)
        trace.currentFrameIndex = 1;

    return trace;
};

// ********************************************************************************************* //

StackFrame.getFunctionName = function(script, context, frame, noArgs)
{
    if (!script)
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("stackFrame.getFunctionName FAILS typeof(script)="+typeof(script)+"\n");
        return "(no script)";
    }

    var name = this.getDisplayName(frame ? frame.scope : null, script);
    if (name)
        return name;

    name = script.functionName;
    if (!name || (name == "anonymous"))
    {
        name = null;
        var analyzer = Firebug.SourceFile.getScriptAnalyzer(context, script);
        if (analyzer && frame)
        {
            if (FBTrace.DBG_STACK)
                FBTrace.sysout("getFunctionName analyzer.sourceFile:", analyzer.sourceFile);

            var functionSpec = analyzer.getFunctionDescription(script, context, frame);
            if (functionSpec.name)
                name = functionSpec.name + (noArgs ? "" : "("+functionSpec.args.join(',')+")");
        }

        if (!name || name == "anonymous")
        {
            if (FBTrace.DBG_STACK)
                FBTrace.sysout("getFunctionName no analyzer, "+script.baseLineNumber+"@"+
                    script.fileName+"\n");
            name = StackFrame.guessFunctionName(Url.normalizeURL(script.fileName),
                script.baseLineNumber, context);
        }
    }

    if (FBTrace.DBG_STACK)
        FBTrace.sysout("getFunctionName "+script.tag+" ="+name+"\n");

    return name;
}

StackFrame.getDisplayName = function(scope, script)
{
    try
    {
        if (scope)
        {
            return Wrapper.unwrapIValue(scope).arguments.callee.displayName;
        }
        else if (script)
        {
            var fnObj = Wrapper.unwrapIValue(script.functionObject);
            return (fnObj && fnObj.displayName) ? fnObj.displayName : script.functionName;
        }
    }
    catch (err)
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("stackFrame.getDisplayName; EXCEPTION " + err, err);
    }
}

StackFrame.guessFunctionName = function(url, lineNo, context)
{
    if (context)
    {
        if (context.sourceCache)
            return StackFrame.guessFunctionNameFromLines(url, lineNo, context.sourceCache);
    }
    return "? in "+Url.getFileName(url)+"@"+lineNo;
}

var reGuessFunction = /['"]?([$0-9A-Za-z_]+)['"]?\s*[:=]\s*(function|eval|new Function)/;
var reFunctionArgNames = /function ([^(]*)\(([^)]*)\)/;
StackFrame.guessFunctionNameFromLines = function(url, lineNo, sourceCache)
{
    // Walk backwards from the first line in the function until we find the line which
    // matches the pattern above, which is the function definition
    var line = "";
    if (FBTrace.DBG_FUNCTION_NAMES)
        FBTrace.sysout("getFunctionNameFromLines for line@URL="+lineNo+"@"+url+"\n");

    for (var i = 0; i < 4; ++i)
    {
        line = sourceCache.getLine(url, lineNo-i) + line;
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
    return "(?)";
}

// Mozilla
StackFrame.getFunctionArgValues = function(frame)
{
    if (frame.isValid && frame.scope.jsClassName == "Call")
        var values = StackFrame.getArgumentsFromCallScope(frame);
    else
        var values = StackFrame.getArgumentsFromObjectScope(frame);

    if (FBTrace.DBG_STACK)
        FBTrace.sysout("stackFrame.getFunctionArgValues "+frame+" scope: "+frame.scope.jsClassName,
            {values: values});

    return values;
}

// Mozilla
StackFrame.getArgumentsFromObjectScope = function(frame)
{
    var argNames = frame.script.getParameterNames();
    var scope = Wrapper.unwrapIValue(frame.scope, Firebug.viewChrome);

    var values = [];

    for (var i = 0; i < argNames.length; ++i)
    {
        var argName = argNames[i];
        if (scope)
        {
            var pvalue = scope[argName];
            //?? XXXjjb why are we unwrapping here, scope is a normal object
            //var value = pvalue ? Wrapper.unwrapIValue(pvalue.value) : undefined;
            values.push({name: argName, value: pvalue});
        }
        else
        {
            values.push({name: argName});
        }
    }

    return values;
};

StackFrame.getArgumentsFromCallScope = function(frame)
{
    var argNames = frame.script.getParameterNames();
    var scope = frame.scope;
    var values = [];
    for (var i = 0; i < argNames.length; ++i)
    {
        var argName = argNames[i];
        var pvalue = scope.getProperty(argName); // jsdIValue in jsdIDebuggerService
        var value = pvalue ? Wrapper.unwrapIValue(pvalue.value, Firebug.viewChrome) : undefined;
        values.push({name: argName, value: value});
    }

    return values;
};

// ********************************************************************************************* //

var saveShowStackTrace;

/**
 * use in the try{} around a call to getInterface to prevent fbs from generating stack traces
 */
StackFrame.suspendShowStackTrace = function()
{
    saveShowStackTrace = Firebug.showStackTrace;
    Firebug.showStackTrace = false;
};

/**
 * use in the finally{} to undo the suspendShowStackTrace
 */
StackFrame.resumeShowStackTrace = function()
{
    if (saveShowStackTrace)
    {
        Firebug.showStackTrace = saveShowStackTrace;
        delete saveShowStackTrace;
    }
};

// ********************************************************************************************* //
// Registration

return StackFrame;

// ********************************************************************************************* //
});
