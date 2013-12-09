/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
],
function(Obj, Firebug) {

// ********************************************************************************************* //
// TODO move to mozilla back end

// xxxHonza: this entire module could be probably removed (JSD2 branch)
function SourceFileRenamer(context)
{
    this.renamedSourceFiles = [];
    this.context = context;
    this.bps = [];
}

SourceFileRenamer.prototype.checkForRename = function(url, line, props)
{
    // xxxHonza: Do we have to rename in JSD2? I guess not...
    return false;

    var sourceFile = this.context.sourceFileMap[url];
    if (sourceFile.isEval() || sourceFile.isEvent())
    {
        var segs = sourceFile.href.split('/');
        if (segs.length > 2)
        {
            if (segs[segs.length - 2] == "seq")
            {
                this.renamedSourceFiles.push(sourceFile);
                this.bps.push(props);
            }
        }

        // whether not we needed to rename, the dynamic sourceFile has a bp.
        this.context.dynamicURLhasBP = true;

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("breakpoints.checkForRename found bp in "+sourceFile+" renamed files:",
                this.renamedSourceFiles);
    }
    else
    {
        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("breakpoints.checkForRename found static bp in " + sourceFile +
                " bp:", props);
    }

    return (this.renamedSourceFiles.length > 0);
};

SourceFileRenamer.prototype.needToRename = function(context)
{
    if (this.renamedSourceFiles.length > 0)
        this.renameSourceFiles(context);

    if (FBTrace.DBG_SOURCEFILES)
        FBTrace.sysout("debugger renamed " + this.renamedSourceFiles.length + " sourceFiles",
            context.sourceFileMap);

    return this.renamedSourceFiles.length;
}

SourceFileRenamer.prototype.renameSourceFiles = function(context)
{
    for (var i = 0; i < this.renamedSourceFiles.length; i++)
    {
        var sourceFile = this.renamedSourceFiles[i];
        var bp = this.bps[i];

        var oldURL = sourceFile.href;
        var sameType = bp.type;
        var sameLineNo = bp.lineNo;

        // last is sequence #, next-last is "seq", next-next-last is kind
        var segs = oldURL.split('/');
        var kind = segs.splice(segs.length - 3, 3)[0];
        var callerURL = segs.join('/');
        if (!sourceFile.source)
        {
            FBTrace.sysout("breakpoint.renameSourceFiles no source for " + oldURL +
                " callerURL " + callerURL, sourceFile)
            continue;
        }

        var newURL = Firebug.Debugger.getURLFromMD5(callerURL, sourceFile.source, kind);
        sourceFile.href = newURL.href;

        FBS.removeBreakpoint(bp.type, oldURL, bp.lineNo);
        delete context.sourceFileMap[oldURL];  // SourceFile delete

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("breakpoints.renameSourceFiles type: "+bp.type, bp);

        Firebug.Debugger.watchSourceFile(context, sourceFile);
        var newBP = FBS.addBreakpoint(sameType, sourceFile, sameLineNo, bp, Firebug.Debugger);

        var panel = context.getPanel("script", true);
        if (panel)
        {
            panel.context.invalidatePanels("breakpoints");
            panel.renameSourceBox(oldURL, newURL.href);
        }

        if (context.sourceCache.isCached(oldURL))
        {
            var lines = context.sourceCache.load(oldURL);
            context.sourceCache.storeSplitLines(newURL.href, lines);
            context.sourceCache.invalidate(oldURL);
        }

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("SourceFileRenamer renamed " + oldURL + " to " + newURL,
                { newBP: newBP, oldBP: bp});
    }

    return this.renamedSourceFiles.length;
}

// ********************************************************************************************* //
// Registration

return SourceFileRenamer;

// ********************************************************************************************* //
});
