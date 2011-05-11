/* See license.txt for terms of usage */

define([
    "firebug/lib",
    "firebug/firebug",
    "arch/tools",
    "firebug/lib/events",
    "firebug/sourceLink",
],
function(FBL, Firebug, ToolsInterface, Events, SourceLink) {

// ************************************************************************************************
// Constants

var CompilationUnit = ToolsInterface.CompilationUnit;

// ************************************************************************************************

/**
 * @class Defines the API for SourceBoxDecorator and provides the default implementation.
 * Decorators are passed the source box on construction, called to create the HTML,
 * and called whenever the user scrolls the view.
 */
Firebug.SourceBoxDecorator = function(sourceBox){}

Firebug.SourceBoxDecorator.sourceBoxCounter = 0;

Firebug.SourceBoxDecorator.prototype =
/** @lends Firebug.SourceBoxDecorator */
{
    onSourceBoxCreation: function(sourceBox)
    {
        // allow panel-document unique ids to be generated for lines.
        sourceBox.uniqueId = ++Firebug.SourceBoxDecorator.sourceBoxCounter;
    },
    /* called on a delay after the view port is updated, eg vertical scroll
     * The sourceBox will contain lines from firstRenderedLine to lastRenderedLine
     * The user will be able to see sourceBox.firstViewableLine to sourceBox.lastViewableLine
     */
    decorate: function(sourceBox, compilationUnit)
    {
        return;
    },

    /* called once as each line is being rendered.
    * @param lineNo integer 1-maxLineNumbers
    */
    getUserVisibleLineNumber: function(sourceBox, lineNo)
    {
        return lineNo;
    },

    /* call once as each line is being rendered.
    * @param lineNo integer 1-maxLineNumbers
    */
    getLineHTML: function(sourceBox, lineNo)
    {
        var html = FBL.escapeForSourceLine(sourceBox.lines[lineNo-1]);

        // If the pref says so, replace tabs by corresponding number of spaces.
        if (Firebug.replaceTabs > 0)
        {
            var space = new Array(Firebug.replaceTabs + 1).join(" ");
            html = html.replace(/\t/g, space);
        }

        return html;
    },

    /*
     * @return a string unique to the sourcebox and line number, valid in getElementById()
     */
    getLineId: function(sourceBox, lineNo)
    {
        return 'sb' + sourceBox.uniqueId + '-L' + lineNo;
    },
}

// ************************************************************************************************

/**
 * @panel Firebug.SourceBoxPanel: Intermediate level class for showing lines of source, eg Script Panel
 * Implements a 'viewport' to render only the lines the user is viewing or has recently viewed.
 * Scroll events or scrollToLine calls are converted to viewableRange line number range.
 * The range of lines is rendered, skipping any that have already been rendered. Then if the
 * new line range overlaps the old line range, done; else delete the old range.
 * That way the lines kept contiguous.
 * The rendering details are delegated to SourceBoxDecorator; each source line may be expanded into
 * more rendered lines.
 */
Firebug.SourceBoxPanel = function() {};

var SourceBoxPanelBase = FBL.extend(Firebug.MeasureBox, Firebug.ActivablePanel);
Firebug.SourceBoxPanel = FBL.extend(SourceBoxPanelBase,
/** @lends Firebug.SourceBoxPanel */
{
    initialize: function(context, doc)
    {
        this.onResize =  FBL.bind(this.resizer, this);
        this.sourceBoxes = {};
        this.decorator = this.getDecorator();

        Firebug.ActivablePanel.initialize.apply(this, arguments);
    },

    initializeNode: function(panelNode)
    {
        this.resizeEventTarget = Firebug.chrome.$('fbContentBox');
        this.resizeEventTarget.addEventListener("resize", this.onResize, true);
        this.attachToCache();

        Firebug.ActivablePanel.initializeNode.apply(this, arguments);
    },

    detach: function(oldChrome, newChrome)
    {
        this.removeAllSourceBoxes();  // clear so we start fresh with the new window
    },

    reattach: function(doc)
    {
        var oldEventTarget = this.resizeEventTarget;
        oldEventTarget.removeEventListener("resize", this.onResize, true);
        Firebug.Panel.reattach.apply(this, arguments);
        this.resizeEventTarget = Firebug.chrome.$('fbContentBox');
        this.resizeEventTarget.addEventListener("resize", this.onResize, true);
        this.attachToCache();
    },

    destroyNode: function()
    {
        if (this.resizeEventTarget)
        {
            this.resizeEventTarget.removeEventListener("resize", this.onResize, true);
        }
        else
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("sourceBox.destroyNode; ERROR this.resizeEventTarget is NULL "+this, this);
        }

        this.detachFromCache();

        Firebug.ActivablePanel.destroyNode.apply(this, arguments);
    },

    attachToCache: function()
    {
        this.context.sourceCache.addListener(this);
    },

    detachFromCache: function()
    {
        this.context.sourceCache.removeListener(this);
    },

    onTextSizeChange: function(zoom)
    {
        this.removeAllSourceBoxes();  // clear so we start fresh with new text sizes
    },

    removeAllSourceBoxes: function()
    {
        for (var url in this.sourceBoxes)
        {
            var sourceBox = this.sourceBoxes[url];
            if (sourceBox)
                this.panelNode.removeChild(sourceBox);
            else if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("sourceBoxPanel ERROR no sourceBox at "+url+" in context "+this.context.getName());
        }

        this.sourceBoxes = {};
        delete this.selectedSourceBox;
        delete this.location;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    //  TabCache listener implementation

    onStartRequest: function(context, request)
    {

    },

    onStopRequest: function(context, request, responseText)
    {
        if (context === this.context)
        {
            var url = request.URI.spec;
            var compilationUnit = context.getCompilationUnit(url);
            if (compilationUnit)
                this.removeSourceBoxByCompilationUnit(compilationUnit);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    /**
     * Panel extension point.
     * Called just before box is shown
     */
    updateSourceBox: function(sourceBox)
    {

    },

    /* Panel extension point. Called on panel initialization
     * @return Must implement SourceBoxDecorator API.
     */
    getDecorator: function()
    {
        return new Firebug.SourceBoxDecorator();
    },

     /* Panel extension point
      * @return string eg "js" or "css"
      */
    getSourceType: function()
    {
        throw "SourceBox.getSourceType: Need to override in extender ";
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    disablePanel: function(module)
    {
        this.sourceBoxes = {};  // clear so we start fresh if enabled
        Firebug.ActivablePanel.disablePanel.apply(this, arguments);
    },

    getSourceLinesFrom: function(selection)
    {
        // https://developer.mozilla.org/en/DOM/Selection
        if (selection.isCollapsed)
            return "";

        var anchorSourceRow = FBL.getAncestorByClass(selection.anchorNode, "sourceRow");
        var focusSourceRow = FBL.getAncestorByClass(selection.focusNode, "sourceRow");
        if (anchorSourceRow == focusSourceRow)
        {
            return selection.toString();// trivial case
        }
        var buf = this.getSourceLine(anchorSourceRow, selection.anchorOffset);

        var currentSourceRow = anchorSourceRow.nextSibling;
        while(currentSourceRow && (currentSourceRow != focusSourceRow) && FBL.hasClass(currentSourceRow, "sourceRow"))
        {
            buf += this.getSourceLine(currentSourceRow);
            currentSourceRow = currentSourceRow.nextSibling;
        }
        buf += this.getSourceLine(focusSourceRow, 0, selection.focusOffset);
        return buf;
    },

    getSourceLine: function(sourceRow, beginOffset, endOffset)
    {
        var source = FBL.getChildByClass(sourceRow, "sourceRowText").textContent;
        if (endOffset)
            source = source.substring(beginOffset, endOffset);
        else if (beginOffset)
            source = source.substring(beginOffset);
        else
            source = source;

        return source;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getSourceBoxByCompilationUnit: function(compilationUnit)
    {
        if (compilationUnit.getURL())
        {
            var sourceBox = this.getSourceBoxByURL(compilationUnit.getURL());
            if (sourceBox && sourceBox.repObject == compilationUnit)
                return sourceBox;
            else
                return null;  // cause a new one to be created
        }
    },

    getCompilationUnit: function()
    {
        if (this.selectedSourceBox)
            return this.seletedSourceBox.repObject;
    },

    getSourceBoxByURL: function(url)
    {
        if (!this.sourceBoxes)
            return null;

        return url ? this.sourceBoxes[url] : null;
    },

    removeSourceBoxByCompilationUnit: function(compilationUnit)
    {
        var sourceBox = this.getSourceBoxByCompilationUnit(compilationUnit);
        if (sourceBox)  // else we did not create one for this compilationUnit
        {
            delete this.sourceBoxes[compilationUnit.getURL()];

            if (sourceBox.parentNode === this.panelNode)
                this.panelNode.removeChild(sourceBox);

            if (this.selectedSourceBox === sourceBox) // need to update the view
            {
                delete this.selectedSourceBox;
                delete this.location;
                this.showSource(compilationUnit.getURL());
            }
        }
    },

    renameSourceBox: function(oldURL, newURL)
    {
        var sourceBox = this.sourceBoxes[oldURL];
        if (sourceBox)
        {
            delete this.sourceBoxes[oldURL];
            this.sourceBoxes[newURL] = sourceBox;
        }
    },

    showSource: function(url)
    {
        var sourceBox = this.getOrCreateSourceBox(url);
        this.showSourceBox(sourceBox);
    },

    getOrCreateSourceBox: function(url)
    {
        var compilationUnit = this.context.getCompilationUnit(url);

        if (FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("firebug.showSource: "+url, compilationUnit);

        if (!compilationUnit)
            return;

        var sourceBox = this.getSourceBoxByCompilationUnit(compilationUnit);
        if (!sourceBox)
            sourceBox = this.createSourceBox(compilationUnit);

        return sourceBox;
    },

    /*
     * Assumes that locations are compilationUnits, TODO lower class
     */
    showSourceLink: function(sourceLink)
    {
        var sourceBox = this.getOrCreateSourceBox(sourceLink.href);

        if (sourceBox)
        {
            if (sourceLink.line)
            {
                this.showSourceBox(sourceBox, sourceLink.line);
                this.scrollToLine(sourceLink.href, sourceLink.line, this.jumpHighlightFactory(sourceLink.line, this.context));
            }
            else
            {
                this.showSourceBox(sourceBox);
            }
            Events.dispatch(this.fbListeners, "onShowSourceLink", [this, sourceLink.line]);
        }
        if (sourceLink == this.selection)  // then clear it so the next link will scroll and highlight.
            delete this.selection;
    },

    showSourceBox: function(sourceBox, lineNo)
    {
        if (this.selectedSourceBox)
            FBL.collapse(this.selectedSourceBox, true);

        if (this.selectedSourceBox !== sourceBox)
            delete this.currentSearch;

        this.selectedSourceBox = sourceBox;

        if (sourceBox)
        {
            sourceBox.targetedLineNumber = lineNo; // signal reView to put this line in the center
            FBL.collapse(sourceBox, false);
            this.reView(sourceBox);
            this.updateSourceBox(sourceBox);
        }
    },

    /* Private, do not call outside of this object
    * A sourceBox is a div with additional operations and state.
    * @param compilationUnit there is at most one sourceBox for each compilationUnit
    */
    createSourceBox: function(compilationUnit)  // decorator(compilationUnit, sourceBox)
    {
        var sourceBox = this.initializeSourceBox(compilationUnit);

        sourceBox.decorator = this.decorator;

        // Framework connection
        sourceBox.decorator.onSourceBoxCreation(sourceBox);

        this.sourceBoxes[compilationUnit.getURL()] = sourceBox;

        if (FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("firebug.createSourceBox with "+sourceBox.maximumLineNumber+" lines for "+compilationUnit+(compilationUnit.getURL()?" sourceBoxes":" anon "), sourceBox);

        this.panelNode.appendChild(sourceBox);
        this.setSourceBoxLineSizes(sourceBox);

        return sourceBox;
    },

    getSourceBoxURL: function(sourceBox)
    {
        return sourceBox.repObject.getURL();
    },

    initializeSourceBox: function(compilationUnit)
    {
        var sourceBox = this.document.createElement("div");
        FBL.setClass(sourceBox, "sourceBox");
        FBL.collapse(sourceBox, true);
        sourceBox.repObject = compilationUnit;
        compilationUnit.sourceBox = sourceBox;

        sourceBox.getLineNode =  function(lineNo)
        {
            // XXXjjb this method is supposed to return null if the lineNo is not in the viewport
            return this.ownerDocument.getElementById(this.decorator.getLineId(this, lineNo));
        };

        var paddedSource =
            "<div class='topSourcePadding'>" +
                "<div class='sourceRow'><div class='sourceLine'></div><div class='sourceRowText'></div></div>"+
            "</div>"+
            "<div class='sourceViewport'></div>"+
            "<div class='bottomSourcePadding'>"+
                "<div class='sourceRow'><div class='sourceLine'></div><div class='sourceRowText'></div></div>"+
            "</div>";

        FBL.appendInnerHTML(sourceBox, paddedSource);

        sourceBox.viewport = FBL.getChildByClass(sourceBox, 'sourceViewport');
        return sourceBox;
    },

    onSourceLinesAvailable: function(compilationUnit, firstLineAvailable, lastLineAvailable, lines)
    {
        var sourceBox = compilationUnit.sourceBox;
        var requestedLines = compilationUnit.pendingViewRange;
        delete compilationUnit.pendingViewRange;

        if (requestedLines) // then are viewing a range
        {
            if (firstLineAvailable > requestedLines.firstLine)
                requestedLines.firstLine = firstLineAvailable;

            if (lastLineAvailable < requestedLines.lastLine)
                requestedLines.lastLine = lastLineAvailable;
        }
        else // then no range was given, render all.
        {
            requestedLines = {firstLine: firstLineAvailable, lastLine: lastLineAvailable};
        }

        sourceBox.lines = lines;  // an array indexed from firstLineAvailable to lastLineAvailable

        sourceBox.maximumLineNumber = compilationUnit.getNumberOfLines();
        sourceBox.maxLineNoChars = (sourceBox.maximumLineNumber + "").length;

        this.reViewOnSourceLinesAvailable(sourceBox, requestedLines);
    },

    setSourceBoxLineSizes: function(sourceBox)
    {
        var view = sourceBox.viewport;

        var lineNoCharsSpacer = "";
        for (var i = 0; i < sourceBox.maxLineNoChars; i++)
              lineNoCharsSpacer += "0";

        this.startMeasuring(view);
        var size = this.measureText(lineNoCharsSpacer);
        this.stopMeasuring();

        sourceBox.lineHeight = size.height + 1;
        sourceBox.lineNoWidth = size.width;

        var view = sourceBox.viewport; // TODO some cleaner way
        view.previousSibling.firstChild.firstChild.style.width = sourceBox.lineNoWidth + "px";
        view.nextSibling.firstChild.firstChild.style.width = sourceBox.lineNoWidth +"px";

        if (FBTrace.DBG_COMPILATION_UNITS)
        {
            FBTrace.sysout("setSourceBoxLineSizes size for lineNoCharsSpacer "+lineNoCharsSpacer, size);
            FBTrace.sysout("firebug.setSourceBoxLineSizes, sourceBox.scrollTop "+sourceBox.scrollTop+ " sourceBox.lineHeight: "+sourceBox.lineHeight+" sourceBox.lineNoWidth:"+sourceBox.lineNoWidth+"\n");
        }
    },

    /*
     * @return SourceLink to currently selected source file
     */
    getSourceLink: function(lineNo)
    {
        if (!this.selectedSourceBox)
            return;

        if (!lineNo)
            lineNo = this.getCentralLine(this.selectedSourceBox);

        return new SourceLink.SourceLink(this.selectedSourceBox.repObject.href, lineNo,
            this.getSourceType());
    },

    /* Select sourcebox with href, scroll lineNo into center, highlight lineNo with highlighter given
     * @param href a URL, null means the selected compilationUnit
     * @param lineNo integer 1-maximumLineNumber
     * @param highlighter callback, a function(sourceBox). sourceBox.centralLine will be lineNo
     */
    scrollToLine: function(href, lineNo, highlighter)
    {
        if (FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("SourceBoxPanel.scrollToLine: "+lineNo+"@"+href+" with highlighter "+highlighter, highlighter);

        if (this.context.scrollTimeout)
        {
            this.context.clearTimeout(this.context.scrollTimeout);
            delete this.context.scrollTimeout
        }

        if (href)
        {
            var sourceBox = this.getOrCreateSourceBox(href);
            this.showSourceBox(sourceBox, lineNo);
        }

        if (!this.skipScrolling(lineNo))
        {
            var viewRange = this.getViewRangeFromTargetLine(this.selectedSourceBox, lineNo);
            this.selectedSourceBox.newScrollTop = this.getScrollTopFromViewRange(this.selectedSourceBox, viewRange);

            if (FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("SourceBoxPanel.scrollTimeout: newScrollTop "+
                    this.selectedSourceBox.newScrollTop+" vs old "+
                    this.selectedSourceBox.scrollTop+" for "+this.selectedSourceBox.repObject.href);

            this.selectedSourceBox.scrollTop = this.selectedSourceBox.newScrollTop; // *may* cause scrolling
        }

        this.context.scrollTimeout = this.context.setTimeout(FBL.bindFixed(function()
        {
            if (!this.selectedSourceBox)
            {
                if (FBTrace.DBG_COMPILATION_UNITS)
                    FBTrace.sysout("SourceBoxPanel.scrollTimeout no selectedSourceBox");
                return;
            }

            if (this.selectedSourceBox.highlighter)
                this.applyDecorator(this.selectedSourceBox); // may need to highlight even if we don't scroll

            if (FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("SourceBoxPanel.scrollTimeout: scrollTo "+lineNo+
                        " this.selectedSourceBox.highlighter: "+this.selectedSourceBox.highlighter);
        }, this));

        this.selectedSourceBox.highlighter = highlighter;  // clears if null
    },

    skipScrolling: function(lineNo)
    {
        var skipScrolling = false;
        var firstViewRangeElement = this.selectedSourceBox.getLineNode(this.selectedSourceBox.firstViewableLine);
        var scrollTopOffset = this.selectedSourceBox.scrollTop - firstViewRangeElement.offsetTop;

        if (FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("SourceBoxPanel.skipScrolling scrollTopOffset "+Math.abs(scrollTopOffset) + " > " + firstViewRangeElement.offsetHeight);

        if (Math.abs(scrollTopOffset) > firstViewRangeElement.offsetHeight)
            return skipScrolling;

        if (this.selectedSourceBox.firstViewableLine && this.selectedSourceBox.lastViewableLine)
        {
            var linesFromTop = lineNo - this.selectedSourceBox.firstViewableLine;
            var linesFromBot = this.selectedSourceBox.lastViewableLine - lineNo;
            skipScrolling = (linesFromTop > 3 && linesFromBot > 3);
            if (FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("SourceBoxPanel.skipScrolling: skipScrolling: "+skipScrolling+
                    " fromTop:"+linesFromTop+" fromBot:"+linesFromBot);
        }
        else  // the selectedSourceBox has not been built
        {
            if (FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("SourceBoxPanel.skipScrolling, no viewable lines", this.selectedSourceBox);
        }

        return skipScrolling;
    },

    /*
     * @return a highlighter function(sourceBox) that puts a class on the line for a time slice
     */
    jumpHighlightFactory: function(lineNo, context)
    {
        return function jumpHighlightIfInView(sourceBox)
        {
            var  lineNode = sourceBox.getLineNode(lineNo);

            if (context.highlightedRow)
              FBL.cancelClassTimed(context.highlightedRow, "jumpHighlight", context);

            if (lineNode)
            {
                FBL.setClassTimed(lineNode, "jumpHighlight", context);

                context.highlightedRow = lineNode;

                if (FBTrace.DBG_COMPILATION_UNITS)
                    FBTrace.sysout("jumpHighlightFactory on line "+lineNo+" lineNode:"+lineNode.innerHTML+"\n");
            }
            else
            {
                if (FBTrace.DBG_COMPILATION_UNITS)
                    FBTrace.sysout("jumpHighlightFactory no node at line "+lineNo, sourceBox);
            }

            return false; // not sticky
        }
    },

    /*
     * resize and scroll event handler
     */
    resizer: function(event)
    {
        // The resize target is Firebug as a whole. But most of the UI needs no special code for resize.
        // But our SourceBoxPanel has viewport that will change size.
        if (this.selectedSourceBox && this.visible)
        {
            if (FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("resizer event: "+event.type+" in panel "+this.name+" for "+this.context.getName(), event);

            this.reView(this.selectedSourceBox);
        }
    },

    reView: function(sourceBox, clearCache)  // called for all scroll events, including any time sourcebox.scrollTop is set
    {
        if (sourceBox.targetedLineNumber) // then we requested a certain line
        {
            var viewRange = this.getViewRangeFromTargetLine(sourceBox, sourceBox.targetedLineNumber);
            if (FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("reView got viewRange from target line: "+sourceBox.targetedLineNumber, viewRange);

            delete sourceBox.targetedLineNumber; // We've positioned on the targeted line. Now the user may scroll
            delete sourceBox.lastScrollTop; // our current scrolltop is not useful, so clear the saved value to avoid comparing below.
        }
        else  // no special line, assume scrolling
        {
            var viewRange = this.getViewRangeFromScrollTop(sourceBox, sourceBox.scrollTop);
            if (FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("reView got viewRange from scrollTop: "+sourceBox.scrollTop, viewRange);
        }

        if (clearCache)
        {
            this.clearSourceBox(sourceBox);
        }
        else if (sourceBox.scrollTop === sourceBox.lastScrollTop && sourceBox.clientHeight && sourceBox.clientHeight === sourceBox.lastClientHeight)
        {
            if (sourceBox.firstRenderedLine <= viewRange.firstLine && sourceBox.lastRenderedLine >= viewRange.lastLine)
            {
                if (FBTrace.DBG_COMPILATION_UNITS)
                    FBTrace.sysout("reView skipping sourceBox "+sourceBox.scrollTop+"=scrollTop="+sourceBox.lastScrollTop+", "+ sourceBox.clientHeight+"=clientHeight="+sourceBox.lastClientHeight, sourceBox);
                // skip work if nothing changes.
                return;
            }
        }

        var compilationUnit = sourceBox.repObject;
        compilationUnit.pendingViewRange = viewRange;
        compilationUnit.getSourceLines(viewRange.firstLine, viewRange.lastLine,
            FBL.bind(this.onSourceLinesAvailable, this));
    },

    reViewOnSourceLinesAvailable: function(sourceBox, viewRange)
    {
        Events.dispatch(this.fbListeners, "onBeforeViewportChange", [this]);  // XXXjjb TODO where should this be?
        this.buildViewAround(sourceBox, viewRange);

        if (Firebug.uiListeners.length > 0)
        {
            var link = new SourceLink.SourceLink(sourceBox.repObject.href, sourceBox.centralLine,
                this.getSourceType());

            Events.dispatch(Firebug.uiListeners, "onViewportChange", [link]);
        }

        sourceBox.lastScrollTop = sourceBox.scrollTop;
        sourceBox.lastClientHeight = sourceBox.clientHeight;

        if (FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("sourceBox.reViewOnSourceLinesAvailable sourceBox.lastScrollTop "+
                sourceBox.lastScrollTop+" sourceBox.lastClientHeight "+sourceBox.lastClientHeight);
    },

    buildViewAround: function(sourceBox, viewRange)
    {
        try
        {
            this.updateViewportCache(sourceBox, viewRange);
        }
        catch(exc)
        {
            if(FBTrace.DBG_ERRORS)
                FBTrace.sysout("buildViewAround updateViewportCache FAILS "+exc, exc);
        }

        FBL.collapse(sourceBox, false); // the elements must be visible for the offset values
        this.setViewportPadding(sourceBox, viewRange);

        sourceBox.centralLine = Math.floor( (viewRange.lastLine + viewRange.firstLine)/2 );

        this.applyDecorator(sourceBox);

        return;
    },

    updateViewportCache: function(sourceBox, viewRange)
    {
        var cacheHit = this.insertedLinesOverlapCache(sourceBox, viewRange);

        if (!cacheHit)
        {
            this.clearSourceBox(sourceBox);  // no overlap, remove old range
            sourceBox.firstRenderedLine = viewRange.firstLine; // reset cached range
            sourceBox.lastRenderedLine = viewRange.lastLine;
        }
        else  // cache overlap, expand range of cache
        {
            sourceBox.firstRenderedLine = Math.min(viewRange.firstLine, sourceBox.firstRenderedLine);
            sourceBox.lastRenderedLine = Math.max(viewRange.lastLine, sourceBox.lastRenderedLine);
        }
        sourceBox.firstViewableLine = viewRange.firstLine;  // todo actually check that these are viewable
        sourceBox.lastViewableLine = viewRange.lastLine;
        sourceBox.numberOfRenderedLines = sourceBox.lastRenderedLine - sourceBox.firstRenderedLine + 1;

        if (FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("buildViewAround viewRange: "+viewRange.firstLine+"-"+viewRange.lastLine+" rendered: "+sourceBox.firstRenderedLine+"-"+sourceBox.lastRenderedLine, sourceBox);
    },

    /*
     * Add lines from viewRange, but do not adjust first/lastRenderedLine.
     * @return true if viewRange overlaps first/lastRenderedLine
     */
    insertedLinesOverlapCache: function(sourceBox, viewRange)
    {
        var topCacheLine = null;
        var cacheHit = false;
        for (var line = viewRange.firstLine; line <= viewRange.lastLine; line++)
        {
            if (line >= sourceBox.firstRenderedLine && line <= sourceBox.lastRenderedLine )
            {
                cacheHit = true;
                continue;
            }

            var lineHTML = this.getSourceLineHTML(sourceBox, line);

            var ref = null;
            if (line < sourceBox.firstRenderedLine)   // prepend if we are above the cache
            {
                if (!topCacheLine)
                    topCacheLine = sourceBox.getLineNode(sourceBox.firstRenderedLine);
                ref = topCacheLine;
            }

            var newElement = FBL.appendInnerHTML(sourceBox.viewport, lineHTML, ref);
        }
        return cacheHit;
    },

    clearSourceBox: function(sourceBox)
    {
        if (sourceBox.firstRenderedLine)
        {
            var topMostCachedElement = sourceBox.getLineNode(sourceBox.firstRenderedLine);  // eg 1
            var totalCached = sourceBox.lastRenderedLine - sourceBox.firstRenderedLine + 1;   // eg 20 - 1 + 1 = 19
            if (topMostCachedElement && totalCached)
                this.removeLines(sourceBox, topMostCachedElement, totalCached);
        }
        sourceBox.lastRenderedLine = 0;
        sourceBox.firstRenderedLine = 0;
        sourceBox.numberOfRenderedLines = 0;
    },

    getSourceLineHTML: function(sourceBox, i)
    {
        var lineNo = sourceBox.decorator.getUserVisibleLineNumber(sourceBox, i);
        var lineHTML = sourceBox.decorator.getLineHTML(sourceBox, i);
        var lineId = sourceBox.decorator.getLineId(sourceBox, i);    // decorator lines may not have ids

        var lineNoText = this.getTextForLineNo(lineNo, sourceBox.maxLineNoChars);

        var theHTML =
            '<div '
               + (lineId ? ('id="' + lineId + '"') : "")
               + ' class="sourceRow" role="presentation"><a class="'
               +  'sourceLine' + '" role="presentation">'
               + lineNoText
               + '</a><span class="sourceRowText" role="presentation">'
               + lineHTML
               + '</span></div>';

        return theHTML;
    },

    getTextForLineNo: function(lineNo, maxLineNoChars)
    {
        // Make sure all line numbers are the same width (with a fixed-width font)
        var lineNoText = lineNo + "";
        while (lineNoText.length < maxLineNoChars)
            lineNoText = " " + lineNoText;

        return lineNoText;
    },

    removeLines: function(sourceBox, firstRemoval, totalRemovals)
    {
        for(var i = 1; i <= totalRemovals; i++)
        {
            var nextSourceLine = firstRemoval;
            firstRemoval = firstRemoval.nextSibling;
            sourceBox.viewport.removeChild(nextSourceLine);
        }
    },

    getCentralLine: function(sourceBox)
    {
        return sourceBox.centralLine;
    },

    getViewRangeFromTargetLine: function(sourceBox, targetLineNumber)
    {
        var viewRange = {firstLine: 1, centralLine: targetLineNumber, lastLine: 1};

        var averageLineHeight = this.getAverageLineHeight(sourceBox);
        var panelHeight = this.panelNode.clientHeight;
        //we never want viewableLines * lineHeight > clientHeight
        //so viewableLines <= clientHeight / lineHeight
        var linesPerViewport = Math.floor((panelHeight / averageLineHeight));

        viewRange.firstLine = Math.round(targetLineNumber - linesPerViewport / 2);

        if (viewRange.firstLine <= 0)
            viewRange.firstLine = 1;

        viewRange.lastLine = viewRange.firstLine + linesPerViewport;

        if (viewRange.lastLine > sourceBox.maximumLineNumber)
            viewRange.lastLine = sourceBox.maximumLineNumber;

        return viewRange;
    },

    /*
     * Use the average height of source lines in the cache to estimate where the scroll bar points based on scrollTop
     */
    getViewRangeFromScrollTop: function(sourceBox, scrollTop)
    {
        var viewRange = {};
        var averageLineHeight = this.getAverageLineHeight(sourceBox);
        // If the scrollTop comes in zero, then we better pick line 1.  (0 / 14) + 1 = 1
        // If the scrollTop comes in > averageLineHeight/2 pick line 2  (8 / 14) + 1 = 1.57 ==> ceil
        viewRange.firstLine = Math.ceil( (scrollTop / averageLineHeight) + 1);

        var panelHeight = this.panelNode.clientHeight;

        if (panelHeight === 0)  // then we probably have not inserted the elements yet and the clientHeight is bogus
            panelHeight = this.panelNode.ownerDocument.documentElement.clientHeight;

        var viewableLines = Math.floor((panelHeight / averageLineHeight));  // see getViewRangeFromTargetLine
        viewRange.lastLine = viewRange.firstLine + viewableLines - 1;  // 15 = 1 + 15 - 1;
        if (viewRange.lastLine > sourceBox.maximumLineNumber)
            viewRange.lastLine = sourceBox.maximumLineNumber;

        viewRange.centralLine = Math.ceil((viewRange.lastLine - viewRange.firstLine)/2);

        if (FBTrace.DBG_COMPILATION_UNITS)
        {
            FBTrace.sysout("getViewRangeFromScrollTop scrollTop:"+scrollTop+" viewRange: "+viewRange.firstLine+"-"+viewRange.lastLine+" max: "+sourceBox.maximumLineNumber+" panelHeight "+panelHeight);
            if (!this.noRecurse)
            {
                this.noRecurse = true;
                var testScrollTop = this.getScrollTopFromViewRange(sourceBox, viewRange);
                delete this.noRecurse;
                FBTrace.sysout("getViewRangeFromScrollTop "+((scrollTop==testScrollTop)?"checks":(scrollTop+"=!scrollTop!="+testScrollTop)));
            }
        }

        return viewRange;
    },

    /*
     * inverse of the getViewRangeFromScrollTop.
     * If the viewRange was set by targetLineNumber, then this value become the new scroll top
     *    else the value will be the same as the scrollbar's given value of scrollTop.
     */
    getScrollTopFromViewRange: function(sourceBox, viewRange)
    {
        var averageLineHeight = this.getAverageLineHeight(sourceBox);
        // If the fist line is 1, scrollTop should be 0   14 * (1 - 1) = 0
        // If the first line is 2, scrollTop would be lineHeight    14 * (2 - 1) = 14

        var scrollTop = averageLineHeight * (viewRange.firstLine - 1);

        if (FBTrace.DBG_COMPILATION_UNITS)
        {
            FBTrace.sysout("getScrollTopFromViewRange viewRange:"+viewRange.firstLine+"-"+viewRange.lastLine+" averageLineHeight: "+averageLineHeight+" scrollTop "+scrollTop);
            if (!this.noRecurse)
            {
                this.noRecurse = true;
                var testViewRange = this.getViewRangeFromScrollTop(sourceBox, scrollTop);
                delete this.noRecurse;
                var vrStr = viewRange.firstLine+"-"+viewRange.lastLine;
                var tvrStr = testViewRange.firstLine+"-"+testViewRange.lastLine;
                FBTrace.sysout("getScrollTopFromViewRange "+((vrStr==tvrStr)? "checks" : vrStr+"=!viewRange!="+tvrStr));
            }
        }

        return scrollTop;
    },

    /*
     * The virtual sourceBox height is the averageLineHeight * max lines
     * @return float
     */
    getAverageLineHeight: function(sourceBox)
    {
        var averageLineHeight = sourceBox.lineHeight;  // fall back to single line height

        var renderedViewportHeight = sourceBox.viewport.clientHeight;
        var numberOfRenderedLines = sourceBox.numberOfRenderedLines;
        if (renderedViewportHeight && numberOfRenderedLines)
            averageLineHeight = renderedViewportHeight / numberOfRenderedLines;

        return averageLineHeight;
    },

    /*
     * The virtual sourceBox = topPadding + sourceBox.viewport + bottomPadding
     * The viewport grows as more lines are added to the cache
     * The virtual sourceBox height is estimated from the average height lines in the viewport cache
     */
    getTotalPadding: function(sourceBox)
    {
        var numberOfRenderedLines = sourceBox.numberOfRenderedLines;
        if (!numberOfRenderedLines)
            return 0;

        var max = sourceBox.maximumLineNumber;
        var averageLineHeight = this.getAverageLineHeight(sourceBox);
        // total box will be the average line height times total lines
        var virtualSourceBoxHeight = Math.floor(max * averageLineHeight);
        if (virtualSourceBoxHeight < sourceBox.clientHeight)
        {
            // the total - view-taken-up - scrollbar
            // clientHeight excludes scrollbar
            var totalPadding = sourceBox.clientHeight - sourceBox.viewport.clientHeight - 1;
        }
        else
            var totalPadding = virtualSourceBoxHeight - sourceBox.viewport.clientHeight;

        if (FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("getTotalPadding clientHeight:"+sourceBox.viewport.clientHeight+"  max: "+max+" gives total padding "+totalPadding);

        return totalPadding;
    },

    setViewportPadding: function(sourceBox, viewRange)
    {
        var firstRenderedLineElement = sourceBox.getLineNode(sourceBox.firstRenderedLine);
        if (!firstRenderedLineElement)
        {
            // It's not an error if the panel is disabled.
            if (FBTrace.DBG_ERRORS && this.isEnabled())
                FBTrace.sysout("setViewportPadding FAILS, no line at "+sourceBox.firstRenderedLine, sourceBox);
            return;
        }

        var averageLineHeight = this.getAverageLineHeight(sourceBox);
        // At this point our rendered range should surround our viewRange
        var linesOfPadding = sourceBox.firstRenderedLine;  // above our viewRange.firstLine might be some rendered lines in the buffer.
        var topPadding = (linesOfPadding - 1) * averageLineHeight;  // pixels
        // Because of rounding when converting from pixels to lines, topPadding can be +/- lineHeight/2, round up
        linesOfPadding = Math.floor( (topPadding + averageLineHeight)/ averageLineHeight);
        var topPadding = (linesOfPadding - 1)* averageLineHeight;

        if (FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("setViewportPadding topPadding = "+topPadding+" = (linesOfPadding - 1)* averageLineHeight = ("+linesOfPadding+" - 1)* "+averageLineHeight);

        // we want the bottomPadding to take up the rest

        var totalPadding = this.getTotalPadding(sourceBox);
        if (totalPadding < 0)
            var bottomPadding = Math.abs(totalPadding);
        else
            var bottomPadding = Math.floor(totalPadding - topPadding);

        if (bottomPadding < 0)
            bottomPadding = 0;

        var view = sourceBox.viewport;

        // Set the size on the line number field so the padding is filled with same style as source lines.
        view.previousSibling.style.height = topPadding + "px";
        view.nextSibling.style.height = bottomPadding + "px";

        //sourceRow
        view.previousSibling.firstChild.style.height = topPadding + "px";
        view.nextSibling.firstChild.style.height = bottomPadding + "px";

        //sourceLine
        view.previousSibling.firstChild.firstChild.style.height = topPadding + "px";
        view.nextSibling.firstChild.firstChild.style.height = bottomPadding + "px";


        if(FBTrace.DBG_COMPILATION_UNITS)
        {
            var firstViewRangeElement = sourceBox.getLineNode(viewRange.firstLine);
            var scrollTopOffset = sourceBox.scrollTop - firstViewRangeElement.offsetTop;
            FBTrace.sysout("setViewportPadding viewport offsetHeight: "+sourceBox.viewport.offsetHeight+", clientHeight "+sourceBox.viewport.clientHeight);
            FBTrace.sysout("setViewportPadding sourceBox, offsetHeight: "+sourceBox.offsetHeight+", clientHeight "+sourceBox.clientHeight+", scrollHeight: "+sourceBox.scrollHeight);
            FBTrace.sysout("setViewportPadding scrollTopOffset: "+scrollTopOffset+" firstLine "+viewRange.firstLine+" bottom: "+bottomPadding+" top: "+topPadding);
        }

    },

    applyDecorator: function(sourceBox)
    {
        if (this.context.sourceBoxDecoratorTimeout)
        {
            this.context.clearTimeout(this.context.sourceBoxDecoratorTimeout);
            delete this.context.sourceBoxDecoratorTimeout;
        }

        // Run source code decorating on 150ms timeout, which is bigger than
        // the period in which scroll events are fired. So, if the user is moving
        // scroll-bar thumb (or quickly clicking on scroll-arrows), the source code is
        // not decorated (the timeout cleared by the code above) and the scrolling is fast.
        this.context.sourceBoxDecoratorTimeout = this.context.setTimeout(
            FBL.bindFixed(this.asyncDecorating, this, sourceBox), 150);

        if (this.context.sourceBoxHighlighterTimeout)
        {
            this.context.clearTimeout(this.context.sourceBoxHighlighterTimeout);
            delete this.context.sourceBoxHighlighterTimeout;
        }

        // Source code highlighting is using different timeout: 0ms. When searching
        // within the Script panel, the user expects immediate response.
        this.context.sourceBoxHighlighterTimeout = this.context.setTimeout(
            FBL.bindFixed(this.asyncHighlighting, this, sourceBox));

        if (FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("applyDecorator "+sourceBox.repObject.url+" sourceBox.highlighter "+sourceBox.highlighter, sourceBox);
    },

    asyncDecorating: function(sourceBox)
    {
        try
        {
            sourceBox.decorator.decorate(sourceBox, sourceBox.repObject);

            if (Firebug.uiListeners.length > 0)
                Events.dispatch(Firebug.uiListeners, "onApplyDecorator", [sourceBox]);

            if (FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("sourceBoxDecoratorTimeout "+sourceBox.repObject, sourceBox);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("sourcebox applyDecorator FAILS "+exc, exc);
        }
    },

    asyncHighlighting: function(sourceBox)
    {
        try
        {
            if (FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("asyncHighlighting "+sourceBox.repObject.url+" sourceBox.highlighter "+sourceBox.highlighter, sourceBox);

            if (sourceBox.highlighter)
            {
                // If the sticky flag is false, the highlight is removed, eg the search and sourcelink highlights.
                // else the highlight must be removed by the caller, eg breakpoint hit executable line.
                var sticky = sourceBox.highlighter(sourceBox);
                if (FBTrace.DBG_COMPILATION_UNITS)
                    FBTrace.sysout("asyncHighlighting highlighter sticky:"+sticky,
                        sourceBox.highlighter);

                if (!sticky)
                    delete sourceBox.highlighter;
                // else we delete these when we get highlighting call with invalid line (eg -1)
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("sourcebox highlighter FAILS "+exc, exc);
        }
    }
});

// ************************************************************************************************
// Registration

return Firebug.SourceBoxPanel;

// ************************************************************************************************
});
