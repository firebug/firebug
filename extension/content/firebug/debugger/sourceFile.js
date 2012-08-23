/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Source File

/**
 * SourceFile one for every compilation unit.
 */
function SourceFile(href, startLine, lineCount)
{
    this.compilation_unit_type = "remote-script";

    this.href = href;
    this.startLine = startLine;
    this.lineCount = lineCount;
}

SourceFile.prototype =
{
    getBaseLineOffset: function()
    {
        return this.startLine;
    },

    getURL: function()
    {
        return this.href;
    },

    toString: function()
    {
        return this.href;
    },

    getSourceLength: function()
    {
        if (!this.sourceLength)
            this.sourceLength = this.context.sourceCache.load(this.href).length;

        return this.sourceLength;
    },

    getLine: function(context, lineNo)
    {
        return context.sourceCache.getLine(this.href, lineNo);
    },

    isExecutableLine: function(lineNo)
    {
        return false;
    },

    loadScriptLines: function(context)  // array of lines
    {
        if (this.source)
            return this.source;
        else if (context.sourceCache)
            return context.sourceCache.load(this.href);
        else if (FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("sourceFile.loadScriptLines FAILS no sourceCache "+
                context.getName(), context);
        }
    },
}

// ********************************************************************************************* //

return SourceFile;

// ********************************************************************************************* //
});
