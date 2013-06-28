/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/url",
    "firebug/js/sourceLink",
    "firebug/js/stackFrame",
],
function(Obj, Firebug, Url, SourceLink, StackFrame) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const PCMAP_SOURCETEXT = Ci.jsdIScript.PCMAP_SOURCETEXT;
const PCMAP_PRETTYPRINT = Ci.jsdIScript.PCMAP_PRETTYPRINT;

var jsd = Cc["@mozilla.org/js/jsd/debugger-service;1"].getService(Ci.jsdIDebuggerService);

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

/**
 * SourceFile one for every compilation unit.
 * Unique URL for each. (href)
 * Unique outerScript, the statements outside of any function definition
 * sourceCache keyed by href has source for this compilation unit
 * Stored by href in context.
 * Contains array of jsdIScript for functions (scripts) defined in this unit
 * May contain line table (for sources viewed)
 */
Firebug.SourceFile = function (compilation_unit_type)
{
    this.compilation_unit_type = compilation_unit_type;
};

Firebug.SourceFile.prototype =
{
    getBaseLineOffset: function()
    {
        return 0;
    },

    getURL: function()
    {
        return this.href;
    },

    toString: function()
    {
        var str = (this.compilation_unit_type?this.compilation_unit_type + " " : "") +
            this.href + " script.tags( ";

        if (this.outerScript)
            str += (this.outerScript.isValid?this.outerScript.tag:"X") +"| ";

        if (this.innerScripts)
        {
            var numberInvalid = 0;
            for (var p in this.innerScripts)
            {
                var script = this.innerScripts[p];
                if (script.isValid)
                    str += p+" ";
                else
                    numberInvalid++;
            }
        }

        str += ")" + (numberInvalid ? "(" + numberInvalid + " invalid)" : "");
        return str;
    },

    forEachScript: function(callback)
    {
         if (this.outerScript)
             callback(this.outerScript);

         if (this.innerScripts)
         {
             for (var p in this.innerScripts)
             {
                 var script = this.innerScripts[p];
                 var rc = callback(script);
                 if (rc)
                     return rc;
             }
         }
    },

    getLineRanges: function()
    {
        var str = "";
        this.forEachScript(function appendARange(script)
        {
            var endLineNumber = script.baseLineNumber + script.lineExtent;
            str += " "+script.baseLineNumber +"-("+script.tag+")-"+endLineNumber;
        });

        return str;
    },

    getSourceLength: function()
    {
        return this.sourceLength;
    },

    getLine: function(context, lineNo)
    {
        return context.sourceCache.getLine(this.href, lineNo);
    },

    addToLineTable: function(script)
    {
        if (!script || !script.isValid)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("addToLineTable got invalid script " +
                    (script ? script.tag : "null"));
            return;
        }

        // For outer scripts, a better algorithm would loop over PC, use pcToLine to mark the lines.
        // This assumes there are fewer PCs in an outer script than lines, probably true for large
        // systems.
        // And now addToLineTable is only used for outerScripts (eval and top-level).
        // But since we can't know the range of PC values we cannot use that approach.

        if (!this.outerScriptLineMap)
            this.outerScriptLineMap = [];

        var lineCount = script.lineExtent + 1;
        var offset = this.getBaseLineOffset();

        if (FBTrace.DBG_LINETABLE)
        {
            FBTrace.sysout("lib.SourceFile.addToLineTable script.tag:" + script.tag +
                " lineExtent=" + lineCount + " baseLineNumber=" + script.baseLineNumber +
                " offset=" + offset + " for " + this.compilation_unit_type);
            var startTime = new Date().getTime();
        }

        // isLineExecutable requires about 1ms per line, so it can only be called for toy programs
        if (lineCount > 100)
            lineCount = 100;

        for (var i = 0; i <= lineCount; i++)
        {
            // the max is (i + script.baseLineNumber + script.lineExtent)
            var scriptLineNo = i + script.baseLineNumber;
            var mapLineNo = scriptLineNo - offset;
            try
            {
                if (script.isLineExecutable(scriptLineNo, this.pcmap_type))
                    this.outerScriptLineMap.push(mapLineNo);
            }
            catch (e)
            {
                // I guess not...
            }

            if (FBTrace.DBG_LINETABLE)
            {
                var pcFromLine = script.lineToPc(scriptLineNo, this.pcmap_type);
                var lineFromPC = script.pcToLine(pcFromLine, this.pcmap_type);

                if (this.outerScriptLineMap.indexOf(mapLineNo) != -1)
                {
                    FBTrace.sysout("lib.SourceFile.addToLineTable ["+mapLineNo+"]="+script.tag+
                        " for scriptLineNo="+scriptLineNo+" vs "+lineFromPC+
                        "=lineFromPC; lineToPc="+pcFromLine+" with map="+
                        (this.pcmap_type==PCMAP_PRETTYPRINT?"PP":"SOURCE"));
                }
                else
                {
                    FBTrace.sysout("lib.SourceFile.addToLineTable not executable scriptLineNo="+
                        scriptLineNo+" vs "+lineFromPC+"=lineFromPC; lineToPc="+pcFromLine);
                }
            }
        }

        if (FBTrace.DBG_LINETABLE)
        {
            var endTime = new Date().getTime();
            var delta = endTime - startTime;
            if (delta > 0)
            {
                FBTrace.sysout("SourceFile.addToLineTable processed "+lineCount+" lines in "+
                    delta+" millisecs "+Math.round(lineCount/delta)+" lines per millisecond");
            }

            FBTrace.sysout("SourceFile.addToLineTable: "+this.toString());
        }
     },

     addToLineTableByPCLoop: function(script)
     {
        // This code is not called; it crashes FF3pre
        // https://bugzilla.mozilla.org/show_bug.cgi?id=430205
        if (!this.outerScriptLineMap)
            this.outerScriptLineMap = {};

        var lineCount = script.lineExtent;
        var offset = this.getBaseLineOffset();
        if (FBTrace.DBG_LINETABLE)
        {
            FBTrace.sysout("lib.SourceFile.addToLineTableByPCLoop script.tag:"+script.tag+
                " lineCount="+lineCount+" offset="+offset+" for "+this.compilation_unit_type);
            var startTime = new Date().getTime();
        }

        for (var i = 0; i <= 10*lineCount; i++)
        {
            var lineFromPC = script.pcToLine(i, this.pcmap_type);
            //FBTrace.sysout("lib.SourceFile.addToLineTableByPCLoop pc="+i+" line: "+lineFromPC+"\n");
            this.outerScriptLineMap[lineFromPC] = script;
            if (lineFromPC >= lineCount)
                break;
        }

        if (FBTrace.DBG_LINETABLE)
        {
            FBTrace.sysout("SourceFile.addToLineTableByPCLoop: "+this.toString()+"\n");
            var endTime = new Date().getTime();
            var delta = endTime - startTime;

            if (delta > 0)
            {
                FBTrace.sysout("SourceFileaddToLineTableByPCLoop processed "+lineCount+
                    " lines in "+delta+" millisecs "+Math.round(lineCount/delta)+
                    " lines per millisecond\n");
            }
        }
    },

    hasScriptAtLineNumber: function(lineNo, mustBeExecutableLine)
    {
        var offset = this.getBaseLineOffset();

        if (!this.innerScripts)
            return; // eg URLOnly

        // lineNo is user-viewed number, targetLineNo is jsd number
        var targetLineNo = lineNo + offset;

        var scripts = [];
        for (var p in this.innerScripts)
        {
            var script = this.innerScripts[p];
            if (mustBeExecutableLine && !script.isValid)
                continue;

            this.addScriptAtLineNumber(scripts, script, targetLineNo,
                mustBeExecutableLine, offset);

            if (scripts.length)
                return true;
        }

        if (this.outerScript && !(mustBeExecutableLine && !this.outerScript.isValid))
        {
            this.addScriptAtLineNumber(scripts, this.outerScript, targetLineNo,
                mustBeExecutableLine, offset);
        }

        return (scripts.length > 0);
    },

    getScriptsAtLineNumber: function(lineNo, mustBeExecutableLine)
    {
        var offset = this.getBaseLineOffset();

        if (!this.innerScripts)
            return; // eg URLOnly

        // lineNo is user-viewed number, targetLineNo is jsd number
        var targetLineNo = lineNo + offset;

        var scripts = [];
        for (var p in this.innerScripts)
        {
            var script = this.innerScripts[p];
            if (mustBeExecutableLine && !script.isValid)
                continue;

            this.addScriptAtLineNumber(scripts, script, targetLineNo,
                mustBeExecutableLine, offset);
        }

        if (this.outerScript && !(mustBeExecutableLine && !this.outerScript.isValid))
        {
            this.addScriptAtLineNumber(scripts, this.outerScript, targetLineNo,
                mustBeExecutableLine, offset);
        }

        if (FBTrace.DBG_LINETABLE)
        {
            if (scripts.length < 1)
            {
                FBTrace.sysout("lib.getScriptsAtLineNumber no targetScript at "+lineNo,
                    " for sourceFile:"+this.toString());
                return false;
            }
            else
            {
                FBTrace.sysout("getScriptsAtLineNumber offset "+offset+" for sourcefile: "+
                    this.toString());
            }
        }

        return (scripts.length > 0) ? scripts : false;
     },

     addScriptAtLineNumber: function(scripts, script, targetLineNo, mustBeExecutableLine, offset)
     {
        // script.isValid will be true.
        if (FBTrace.DBG_LINETABLE)
            FBTrace.sysout("addScriptAtLineNumber trying "+script.tag+", is "+
                script.baseLineNumber+" <= "+targetLineNo +" <= "+ (script.baseLineNumber +
                script.lineExtent)+"? using offset = "+offset+"\n");

        if (targetLineNo >= script.baseLineNumber)
        {
            if ((script.baseLineNumber + script.lineExtent) >= targetLineNo)
            {
                if (mustBeExecutableLine)
                {
                    try
                    {
                        if (!script.isLineExecutable(targetLineNo, this.pcmap_type) )
                        {
                            if (FBTrace.DBG_LINETABLE)
                                FBTrace.sysout("getScriptsAtLineNumber tried "+script.tag+
                                    ", not executable at targetLineNo:"+targetLineNo+" pcmap:"+
                                    this.pcmap_type);
                            return;
                        }
                    }
                    catch (e)
                    {
                        // Component returned failure code: 0x80040111 (NS_ERROR_NOT_AVAILABLE)
                        // [jsdIScript.isLineExecutable]
                        return;
                    }
                }

                scripts.push(script);

                if (FBTrace.DBG_LINETABLE)
                {
                    var checkExecutable = "";
                    if (mustBeExecutableLine)
                        checkExecutable = " isLineExecutable: "+
                        script.isLineExecutable(targetLineNo, this.pcmap_type)+"@pc:"+
                        script.lineToPc(targetLineNo, this.pcmap_type);

                    FBTrace.sysout("getScriptsAtLineNumber found "+script.tag+", isValid: "+
                        script.isValid+" targetLineNo:"+targetLineNo+checkExecutable);
                }
            }
        }
    },

    scriptsIfLineCouldBeExecutable: function(lineNo)  // script may not be valid
    {
        var scripts = this.getScriptsAtLineNumber(lineNo, true);

        if (FBTrace.DBG_LINETABLE && !scripts)
            FBTrace.sysout("lib.scriptsIfLineCouldBeExecutable this.outerScriptLineMap",
                this.outerScriptLineMap);

        if (!scripts && this.outerScriptLineMap && (this.outerScriptLineMap.indexOf(lineNo) != -1))
            return [this.outerScript];

        return scripts;
    },

    isExecutableLine: function(lineNo)  // script may not be valid
    {
        if (this.hasScriptAtLineNumber(lineNo, true))
           return true;

        if (this.outerScriptLineMap && (this.outerScriptLineMap.indexOf(lineNo) != -1))
            return true;

        return false;
    },

    hasScript: function(script)
    {
        if (this.outerScript && (this.outerScript.tag == script.tag) )
            return true;

        // XXXjjb Don't use indexOf or similar tests that rely on ===, since we are really
        // working with wrappers around jsdIScript, not script themselves.  I guess.

        return (this.innerScripts && this.innerScripts.hasOwnProperty(script.tag));
    },

    // these objects map JSD's values to correct values
    getScriptAnalyzer: function(script)
    {
        if (script && this.outerScript && (script.tag == this.outerScript.tag) )
            return this.getOuterScriptAnalyzer();

        return new Firebug.SourceFile.NestedScriptAnalyzer(this);
    },

    // return.path: group/category label, return.name: item label
    getObjectDescription: function()
    {
        return Url.splitURLBase(this.href);
    },

    isEval: function()
    {
        return (this.compilation_unit_type == "eval-level") ||
            (this.compilation_unit_type == "newFunction");
    },

    isEvent: function()
    {
        return (this.compilation_unit_type == "event");
    },

    loadScriptLines: function(context)  // array of lines
    {
        if (this.source)
            return this.source;
        else if (context.sourceCache)
            return context.sourceCache.load(this.href);
        else if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("sourceFile.loadScriptLines FAILS no sourceCache "+
                context.getName(), context);
    },

    getOuterScriptAnalyzer: function()
    {
        FBTrace.sysout("getOuterScriptAnalyzer not overridden for "+sourceFile, this);
    }
};

Firebug.SourceFile.summarizeSourceLineArray = function(sourceLines, size)
{
    var buf  = "";
    for (var i = 0; i < sourceLines.length; i++)
     {
         var aLine = sourceLines[i].substr(0,240);  // avoid huge lines
         buf += aLine.replace(/\s/, " ", "g");
         if (buf.length > size || aLine.length > 240)
             break;
     }
     return buf.substr(0, size);
};


Firebug.SourceFile.NestedScriptAnalyzer = function(sourceFile)
{
    this.sourceFile = sourceFile;
};

Firebug.SourceFile.NestedScriptAnalyzer.prototype =
{
    // Adjust JSD line numbers based on origin of script
    getSourceLineFromFrame: function(context, frame)
    {
        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("NestedScriptAnalyzer in "+this.sourceFile.compilation_unit_type+
                ": frame.line  - this.sourceFile.getBaseLineOffset() "+
                frame.line +" - "+this.sourceFile.getBaseLineOffset());

        return frame.line - (this.sourceFile.getBaseLineOffset());
    },

    // Interpret frame to give fn(args)
    getFunctionDescription: function(script, context, frame)
    {
        if (frame)
        {
            var name = frame.name;
            var args = StackFrame.getFunctionArgValues(frame);
        }
        else
        {
            var name = script.functionName;
            var args = [];
        }

        if (name == "anonymous")
        {
            var name = StackFrame.guessFunctionName(this.sourceFile.href,
                this.getBaseLineNumberByScript(script), context);
        }

        return {name: name, args: args};
    },

    // link to source for this script.
    getSourceLinkForScript: function (script)
    {
        var line = this.getBaseLineNumberByScript(script);
        return new SourceLink.SourceLink(this.sourceFile.href, line, "js");
    },

    getBaseLineNumberByScript: function(script)
    {
        // Do not subtract 1 (see issue 6566)
        return script.baseLineNumber - (this.sourceFile.getBaseLineOffset()/* - 1*/);
    }
};

Firebug.SourceFile.addScriptsToSourceFile = function(sourceFile, outerScript, innerScripts)
{
    // Attach the innerScripts for use later
    if (!sourceFile.innerScripts)
         sourceFile.innerScripts = {};

    var total = 0;
    while (innerScripts.hasMoreElements())
    {
        var script = innerScripts.getNext();
        if (!script || ((script instanceof Ci.jsdIScript) && !script.tag))
        {
            if (FBTrace.DBG_SOURCEFILES)
                FBTrace.sysout("addScriptsToSourceFile innerScripts.getNext FAILS "+
                    sourceFile, script);
            continue;
        }

        sourceFile.innerScripts[script.tag] = script;

        if (FBTrace.DBG_SOURCEFILES)
            total++;
    }

    if (FBTrace.DBG_SOURCEFILES)
    {
        FBTrace.sysout("addScriptsToSourceFile "+ total +" scripts, sourcefile="+
            sourceFile.toString(), sourceFile);
    }
};

// ********************************************************************************************* //

Firebug.EvalLevelSourceFile = function(url, script, eval_expr, source, mapType,
    innerScriptEnumerator)
{
    this.href = url.href;
    this.hrefKind = url.kind;
    this.outerScript = script;
    this.containingURL = script.fileName;
    this.evalExpression = eval_expr;
    this.sourceLength = source.length;
    this.source = source;
    this.pcmap_type = mapType;
    Firebug.SourceFile.addScriptsToSourceFile(this, script, innerScriptEnumerator);
};

Firebug.EvalLevelSourceFile.prototype =
    Obj.descend(new Firebug.SourceFile("eval-level"), // shared prototype
{
    getLine: function(context, lineNo)
    {
        return this.source[lineNo - 1];
    },

    getBaseLineOffset: function()
    {
        // baseLineNumber always valid even after jsdIscript isValid false
        return this.outerScript.baseLineNumber - 1;
    },

    getObjectDescription: function()
    {
        if (this.hrefKind == "source" || this.hrefKind == "data")
            return Url.splitURLBase(this.href);

        if (!this.summary)
        {
            if (this.evalExpression)
                this.summary = Firebug.SourceFile.summarizeSourceLineArray(
                    this.evalExpression.substr(0, 240), 120);

            if (!this.summary)
                this.summary = "";

            if (this.summary.length < 120)
                this.summary = "eval("+this.summary + "...)=" +
                    Firebug.SourceFile.summarizeSourceLineArray(this.source,
                        120 - this.summary.length);
        }

        var containingFileDescription = Url.splitURLBase(this.containingURL);

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("EvalLevelSourceFile this.evalExpression.substr(0, 240):"+
                (this.evalExpression?this.evalExpression.substr(0, 240):"null")+" summary",
                this.summary);

        return {
            path: containingFileDescription.path,
            name: containingFileDescription.name+"/eval: "+this.summary
        };
    },

    getOuterScriptAnalyzer: function()
    {
        return new Firebug.EvalLevelSourceFile.OuterScriptAnalyzer(this);
    },
});

Firebug.EvalLevelSourceFile.OuterScriptAnalyzer = function(sourceFile)
{
    this.sourceFile = sourceFile;
};

Firebug.EvalLevelSourceFile.OuterScriptAnalyzer.prototype =
{
    // Adjust JSD line numbers based on origin of script
    getSourceLineFromFrame: function(context, frame)
    {
        return frame.line - this.sourceFile.getBaseLineOffset();
    },

    // Interpret frame to give fn(args)
    getFunctionDescription: function(script, context, frame)
    {
        return {name: "eval", args: [this.evalExpression] };
    },

    getSourceLinkForScript: function (script)
    {
        return new SourceLink.SourceLink(this.sourceFile.href, 1, "js");
    }
};

// ********************************************************************************************* //

Firebug.EventSourceFile = function(url, script, title, source, innerScriptEnumerator)
{
     this.href = url;
     this.outerScript = script;
     this.containingURL = script.fileName;
     this.title = title;
     this.source = source; // points to the sourceCache lines
     this.sourceLength = source.length;
     this.pcmap_type = PCMAP_PRETTYPRINT;

     Firebug.SourceFile.addScriptsToSourceFile(this, script, innerScriptEnumerator);
};

Firebug.EventSourceFile.prototype = Obj.descend(new Firebug.SourceFile("event"),
{
    getLine: function(context, lineNo)
    {
        return this.source[lineNo - 1];
    },

    getBaseLineOffset: function()
    {
        return 1;
    },

    getObjectDescription: function()
    {
        if (!this.summary)
             this.summary = Firebug.SourceFile.summarizeSourceLineArray(this.source, 120);

        var containingFileDescription = Url.splitURLBase(this.containingURL);

        return {
            path: containingFileDescription.path,
            name: containingFileDescription.name+"/event: "+this.summary
        };
    },

    getOuterScriptAnalyzer: function()
    {
        return new Firebug.EventSourceFile.OuterScriptAnalyzer(this);
    },
});

Firebug.EventSourceFile.OuterScriptAnalyzer = function(sourceFile)
{
    this.sourceFile = sourceFile;
};

Firebug.EventSourceFile.OuterScriptAnalyzer.prototype =
{
    // Adjust JSD line numbers based on origin of script
    getSourceLineFromFrame: function(context, frame)
    {
        var script = frame.script;
        var line = script.pcToLine(frame.pc, PCMAP_PRETTYPRINT);
        return line - 1;
    },

    // Interpret frame to give fn(args)
    getFunctionDescription: function(script, context, frame)
    {
        var name = script.functionName;
        if (!name)
            name = "jsdbug_NoScriptFunctionName";

        if (frame)
        {
            var args = StackFrame.getFunctionArgValues(frame);
        }
        else
        {
            var args = [];
        }
        return {name: name, args: args};
    },

    getSourceLinkForScript: function (script)
    {
        return new SourceLink.SourceLink(this.sourceFile.href, 1, "js");
    }
};

// ********************************************************************************************* //

Firebug.SourceFile.CommonBase =
{
    getSourceLength: function()
    {
        if (!this.sourceLength)
            this.sourceLength = this.context.sourceCache.load(this.href).length;
        return this.sourceLength;
    },

    getOuterScriptAnalyzer: function()
    {
        return Firebug.TopLevelSourceFile.OuterScriptAnalyzer;
    }
};

// ********************************************************************************************* //

Firebug.TopLevelSourceFile = function(url, outerScript, sourceLength, innerScriptEnumerator)
{
    this.href = url;
    this.outerScript = outerScript;  // Beware may not be valid after we return!!
    this.sourceLength = sourceLength;
    this.pcmap_type = PCMAP_SOURCETEXT;

    Firebug.SourceFile.addScriptsToSourceFile(this, outerScript, innerScriptEnumerator);
};

Firebug.TopLevelSourceFile.prototype = Obj.descend(new Firebug.SourceFile("top-level"),
    Firebug.SourceFile.CommonBase);

Firebug.TopLevelSourceFile.OuterScriptAnalyzer =
{
    // Adjust JSD line numbers based on origin of script
    getSourceLineFromFrame: function(context, frame)
    {
        return frame.line;
    },

    // Interpret frame to give fn(args)
    getFunctionDescription: function(script, context, frame)
    {
        // this is more useful that just "top_level"
        var file_name = Url.getFileName(Url.normalizeURL(script.fileName));
        file_name = file_name ? file_name: "__top_level__";
        return {name: file_name, args: []};
    },

    getSourceLinkForScript: function (script)
    {
        return SourceLink.SourceLink(Url.normalizeURL(script.fileName),
            script.baseLineNumber, "js");
    }
};

// ********************************************************************************************* //

// we don't have the outer script and we delay source load.
Firebug.EnumeratedSourceFile = function(url)
{
    // may not be outerScript file name, eg this could be an enumerated eval
    this.href = new String(url);
    this.innerScripts = {};
    this.pcmap_type = PCMAP_SOURCETEXT;
};

Firebug.EnumeratedSourceFile.prototype = Obj.descend(
    new Firebug.SourceFile("enumerated"),
    Firebug.SourceFile.CommonBase);

// ********************************************************************************************* //

Firebug.NoScriptSourceFile = function(context, url) // Somehow we got the Url, but not the script
{
    this.href = url;  // we know this much
    this.innerScripts = {};
};

Firebug.NoScriptSourceFile.prototype = Obj.descend(
    new Firebug.SourceFile("URLOnly"),
    Firebug.SourceFile.CommonBase);

// ********************************************************************************************* //
// javascript in a .xul or .xml file, no outerScript

Firebug.XULSourceFile = function(url, outerScript, innerScriptEnumerator)
{
    this.href = url;
    this.pcmap_type = PCMAP_SOURCETEXT;
    this.outerScript = outerScript;  // Beware may not be valid after we return!!

    Firebug.SourceFile.addScriptsToSourceFile(this, outerScript, innerScriptEnumerator);
};

Firebug.XULSourceFile.prototype = Obj.descend(
    new Firebug.SourceFile("xul"),
    Firebug.SourceFile.CommonBase);

// ********************************************************************************************* //

// element.appendChild(scriptTag)
Firebug.ScriptTagAppendSourceFile = function(url, outerScript, sourceLength, innerScriptEnumerator)
{
    this.href = url;
    this.outerScript = outerScript;  // Beware may not be valid after we return!!
    this.sourceLength = sourceLength;
    this.pcmap_type = PCMAP_SOURCETEXT;

    Firebug.SourceFile.addScriptsToSourceFile(this, outerScript, innerScriptEnumerator);
};

Firebug.ScriptTagAppendSourceFile.prototype = Obj.descend(
    new Firebug.SourceFile("scriptTagAppend"),
    Firebug.SourceFile.CommonBase);

// ********************************************************************************************* //

// we don't have the outer script and we delay source load
Firebug.ScriptTagSourceFile = function(context, url, scriptTagNumber)
{
    this.context = context;
    this.href = url;  // we know this is not an eval
    this.scriptTagNumber = scriptTagNumber;
    this.innerScripts = {};
    this.pcmap_type = PCMAP_SOURCETEXT;
};

Firebug.ScriptTagSourceFile.prototype = Obj.descend(
    new Firebug.SourceFile("scriptTag"),
    Firebug.SourceFile.CommonBase);

// ********************************************************************************************* //

Firebug.SourceFile.getSourceFileByScript = function(context, script)
{
    if (!context.sourceFileMap)
         return null;

    // Other algorithms are possible:
    //   We could store an index, context.sourceFileByTag
    //   Or we could build a tree keyed by url, with SpiderMonkey script.fileNames at the top
    //   and our urls below

    // we won't be lucky for file:/ urls, no normalizeURL applied
    var lucky = context.sourceFileMap[script.fileName];
    if (FBTrace.DBG_SOURCEFILES && lucky)
        FBTrace.sysout("getSourceFileByScript trying to be lucky for "+
            script.tag + " in "+lucky, script);

    if (lucky && lucky.hasScript(script))
        return lucky;

    if (FBTrace.DBG_SOURCEFILES)
        FBTrace.sysout("getSourceFileByScript looking for "+script.tag+"@"+script.fileName+" in "+
            context.getName()+": ", context.sourceFileMap);

    for (var url in context.sourceFileMap)
    {
        var sourceFile = context.sourceFileMap[url];
        if (sourceFile.hasScript(script))
            return sourceFile;
    }
};

Firebug.SourceFile.getScriptAnalyzer = function(context, script)
{
    var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, script);
    if (FBTrace.DBG_STACK)
         FBTrace.sysout("getScriptAnalyzer "+ (sourceFile?"finds sourceFile: ":
            "FAILS to find sourceFile"), sourceFile);

    if (sourceFile)
    {
        var analyzer = sourceFile.getScriptAnalyzer(script);
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("getScriptAnalyzer finds analyzer: ", analyzer);

        return analyzer;
    }

    return undefined;
};

Firebug.SourceFile.getSourceFileAndLineByScript= function(context, script, frame)
{
    var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, script);
    if (sourceFile)
    {
        if (sourceFile.pcmap_type)
            var line = script.pcToLine(1, sourceFile.pcmap_type);
        else
            var line = 1;

        return { sourceFile: sourceFile, lineNo: line };
    }
};

Firebug.SourceFile.guessEnclosingFunctionName = function(url, line, context)
{
    var sourceFile = context.sourceFileMap[url];
    if (sourceFile)
    {
        var scripts = sourceFile.getScriptsAtLineNumber(line);
        if (scripts)
        {
            // TODO try others?
            var script = scripts[0];
            var analyzer = sourceFile.getScriptAnalyzer(script);

            // Some analyzers don't implement this method.
            if (analyzer.getBaseLineNumberByScript)
                line = analyzer.getBaseLineNumberByScript(script);
        }
    }

    // Do not subtract 1 (see issue 6566)
    return StackFrame.guessFunctionName(url, line/*-1*/, context);
};

// ********************************************************************************************* //
// Functions

Firebug.SourceFile.findScripts = function(context, url, line)
{
    var sourceFile = context.sourceFileMap[url];
    if (sourceFile)
    {
        var scripts = sourceFile.scriptsIfLineCouldBeExecutable(line);
    }
    else
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("lib.findScript, no sourceFile in context for url=", url);
    }
    return scripts;
};

Firebug.SourceFile.findScriptForFunctionInContext = function(context, fn)
{
    var found = null;

    if (!fn || typeof(fn) !== "function")
        return found;

    try
    {
        var wrapped = jsd.wrapValue(fn);
        found = wrapped.script;
        if (!found)
            found = wrapped.jsParent.script;

        if (!found && FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("findScriptForFunctionInContext ",
                {fn: fn, wrapValue: jsd.wrapValue(fn), found: found});
        }
    }
    catch (err)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("sourceFile.findScriptForFunctionInContext; EXCEPTION " + err, err);
    }

    if (FBTrace.DBG_FUNCTION_NAMES)
        FBTrace.sysout("findScriptForFunctionInContext found " + (found ? found.tag : "none"));

    return found;
};

Firebug.SourceFile.findSourceForFunction = function(fn, context)
{
    var script = Firebug.SourceFile.findScriptForFunctionInContext(context, fn);
    return script ? Firebug.SourceFile.getSourceLinkForScript(script, context) : null;
};

Firebug.SourceFile.getSourceLinkForScript = function(script, context)
{
    var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, script);
    if (sourceFile)
    {
        var scriptAnalyzer = sourceFile.getScriptAnalyzer(script);
        if (scriptAnalyzer)
        {
            return scriptAnalyzer.getSourceLinkForScript(script);
        }
        else
        {
            // no-op for detrace
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("getSourceLineForScript FAILS no scriptAnalyser for sourceFile " +
                    sourceFile);
            }
        }
    }
};

// ********************************************************************************************* //
// Source Files

Firebug.SourceFile.getSourceFileByHref = function(url, context)
{
    return context.sourceFileMap[url];
};

Firebug.SourceFile.sourceURLsAsArray = function(context)
{
    var urls = [];
    var sourceFileMap = context.sourceFileMap;
    for (var url in sourceFileMap)
        urls.push(url);

    if (FBTrace.DBG_SOURCEFILES)
        FBTrace.sysout("sourceURLsAsArray urls="+urls.length+" in context "+context.getName());

    return urls;
};

// deprecated, use mapAsArray
Firebug.SourceFile.sourceFilesAsArray = function(sourceFileMap)
{
    var sourceFiles = [];
    for (var url in sourceFileMap)
        sourceFiles.push(sourceFileMap[url]);

    if (FBTrace.DBG_SOURCEFILES)
        FBTrace.sysout("sourceFilesAsArray sourcefiles="+sourceFiles.length, sourceFiles);

    return sourceFiles;
};

Firebug.SourceFile.mapAsArray = function(map)
{
    var entries = [];
    for (var url in map)
        entries.push(map[url]);

    return entries;
};

// ********************************************************************************************* //

return Firebug.SourceFile;

// ********************************************************************************************* //
});
