/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {



/* Defines the API for SourceBoxDecorator and provides the default implementation.
 * Decorators are passed the source box on construction, called to create the HTML,
 * and called whenever the user scrolls the view.
 */
Firebug.SourceBoxDecorator = function(sourceBox){}

Firebug.SourceBoxDecorator.sourceBoxCounter = 0;

Firebug.SourceBoxDecorator.prototype =
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
    decorate: function(sourceBox, sourceFile)
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
        var html = escapeHTML(sourceBox.lines[lineNo-1]);

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


/*
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
/* @lends */
Firebug.SourceBoxPanel = extend( extend(Firebug.MeasureBox, Firebug.ActivablePanel),
{

    initialize: function(context, doc)
    {
        this.onResize =  bind(this.resizer, this);

        this.sourceBoxes = {};
        this.decorator = this.getDecorator();
        Firebug.Panel.initialize.apply(this, arguments);
    },

    initializeNode: function(panelNode)
    {
        this.resizeEventTarget = Firebug.chrome.$('fbContentBox');
        this.resizeEventTarget.addEventListener("resize", this.onResize, true);
    },

    reattach: function(doc)
    {
        var oldEventTarget = this.resizeEventTarget;
        oldEventTarget.removeEventListener("resize", this.onResize, true);
        Firebug.Panel.reattach.apply(this, arguments);
        this.resizeEventTarget = Firebug.chrome.$('fbContentBox');
        this.resizeEventTarget.addEventListener("resize", this.onResize, true);
    },

    destroyNode: function()
    {
        Firebug.Panel.destroyNode.apply(this, arguments);
        this.resizeEventTarget.removeEventListener("resize", this.onResize, true);
    },

    // **************************************
    /*  Panel extension point.
     *  Called just before box is shown
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
        throw "Need to override in extender";
    },

    // **************************************
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

        var anchorSourceRow = getAncestorByClass(selection.anchorNode, "sourceRow");
        var focusSourceRow = getAncestorByClass(selection.focusNode, "sourceRow");
        if (anchorSourceRow == focusSourceRow)
        {
            var buf = this.getSourceLine(anchorSourceRow, selection.anchorOffset, selection.focusOffset);
            return buf;
        }
        var buf = this.getSourceLine(anchorSourceRow, selection.anchorOffset);

        var currentSourceRow = anchorSourceRow.nextSibling;
        while(currentSourceRow && (currentSourceRow != focusSourceRow) && hasClass(currentSourceRow, "sourceRow"))
        {
            buf += this.getSourceLine(currentSourceRow);
            currentSourceRow = currentSourceRow.nextSibling;
        }
        buf += this.getSourceLine(focusSourceRow, 0, selection.focusOffset);
        return buf;
    },

    getSourceLine: function(sourceRow, beginOffset, endOffset)
    {
        var source = getChildByClass(sourceRow, "sourceRowText").innerHTML;
        if (endOffset)
            source = source.substring(beginOffset, endOffset);
        else if (beginOffset)
            source = source.substring(beginOffset);
        else
            source = source;

        return unEscapeHTML(source);
    },

    // ****************************************************************************************

    getSourceBoxBySourceFile: function(sourceFile)
    {
        if (sourceFile.href)
        {
            var sourceBox = this.getSourceBoxByURL(sourceFile.href);
            if (sourceBox && sourceBox.repObject == sourceFile)
                return sourceBox;
            else
                return null;  // cause a new one to be created
        }
    },

    getSourceBoxByURL: function(url)
    {
        return url ? this.sourceBoxes[url] : null;
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

    showSourceFile: function(sourceFile)
    {
        var sourceBox = this.getSourceBoxBySourceFile(sourceFile);
        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("firebug.showSourceFile: "+sourceFile, sourceBox);
        if (!sourceBox)
            sourceBox = this.createSourceBox(sourceFile);

        this.showSourceBox(sourceBox);
    },

    showSourceBox: function(sourceBox)
    {
        if (this.selectedSourceBox)
            collapse(this.selectedSourceBox, true);

        this.selectedSourceBox = sourceBox;
        delete this.currentSearch;

        if (sourceBox)
        {
            this.reView(sourceBox);
            this.updateSourceBox(sourceBox);
            collapse(sourceBox, false);
        }
    },

    /* Private, do not call outside of this object
    * A sourceBox is a div with additional operations and state.
    * @param sourceFile there is at most one sourceBox for each sourceFile
    */
    createSourceBox: function(sourceFile)  // decorator(sourceFile, sourceBox)
    {
        var sourceBox = this.initializeSourceBox(sourceFile);

        sourceBox.decorator = this.decorator;

        // Framework connection
        sourceBox.decorator.onSourceBoxCreation(sourceBox);

        this.sourceBoxes[sourceFile.href] = sourceBox;

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("firebug.createSourceBox with "+sourceBox.maximumLineNumber+" lines for "+sourceFile+(sourceFile.href?" sourceBoxes":" anon "), sourceBox);

        this.panelNode.appendChild(sourceBox);
        this.setSourceBoxLineSizes(sourceBox);

        return sourceBox;
    },

    initializeSourceBox: function(sourceFile)
    {
        var sourceBox = this.document.createElement("div");
        setClass(sourceBox, "sourceBox");
        collapse(sourceBox, true);

        var lines = sourceFile.loadScriptLines(this.context);
        if (!lines)
        {
            lines = ["Failed to load source for sourceFile "+sourceFile];
        }

        sourceBox.lines = lines;
        sourceBox.repObject = sourceFile;

        sourceBox.maximumLineNumber = lines.length;
        sourceBox.maxLineNoChars = (sourceBox.maximumLineNumber + "").length;

        sourceBox.getLineNode =  function(lineNo)
        {
            // XXXjjb this method is supposed to return null if the lineNo is not in the viewport
            return $(this.decorator.getLineId(this, lineNo), this.ownerDocument);
        };

        var paddedSource =
            "<div class='topSourcePadding'>" +
                "<div class='sourceRow'><div class='sourceLine'></div><div class='sourceRowText'></div></div>"+
            "</div>"+
            "<div class='sourceViewport'></div>"+
            "<div class='bottomSourcePadding'>"+
                "<div class='sourceRow'><div class='sourceLine'></div><div class='sourceRowText'></div></div>"+
            "</div>";

        appendInnerHTML(sourceBox, paddedSource);

        sourceBox.viewport = getChildByClass(sourceBox, 'sourceViewport');
        return sourceBox;
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

        if (FBTrace.DBG_SOURCEFILES)
        {
            FBTrace.sysout("setSourceBoxLineSizes size", size);
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
        return new SourceLink(this.selectedSourceBox.repObject.href, lineNo, this.getSourceType());
    },

    /* Select sourcebox with href, scroll lineNo into center, highlight lineNo with highlighter given
     * @param href a URL, null means the selected sourcefile
     * @param lineNo integer 1-maximumLineNumber
     * @param highlighter callback, a function(sourceBox). sourceBox.centralLine will be lineNo
     */
    scrollToLine: function(href, lineNo, highlighter)
    {
        if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("SourceBoxPanel.scrollToLine: "+lineNo+"@"+href+"\n");

        if (this.context.scrollTimeout)
        {
            this.context.clearTimeout(this.contextscrollTimeout);
            delete this.context.scrollTimeout
        }

        if (href)
        {
            if (!this.selectedSourceBox || this.selectedSourceBox.repObject.href != href)
            {
                var sourceFile = this.context.sourceFileMap[href];
                if (!sourceFile)
                {
                    if(FBTrace.DBG_SOURCEFILES)
                        FBTrace.sysout("scrollToLine FAILS, no sourceFile for href "+href, this.context.sourceFileMap);
                    return;
                }
                this.navigate(sourceFile);
            }
        }

        this.context.scrollTimeout = this.context.setTimeout(bindFixed(function()
        {
            if (!this.selectedSourceBox)
            {
                if (FBTrace.DBG_SOURCEFILES)
                    FBTrace.sysout("SourceBoxPanel.scrollTimeout no selectedSourceBox");
                return;
            }

            this.selectedSourceBox.targetedLine = lineNo;

            // At this time we know which sourcebox is selected but the viewport is not selected.
            // We need to scroll, let the scroll handler set the viewport, then highlight any lines visible.
            var skipScrolling = false;
            if (this.selectedSourceBox.firstViewableLine && this.selectedSourceBox.lastViewableLine)
            {
                var linesFromTop = lineNo - this.selectedSourceBox.firstViewableLine;
                var linesFromBot = this.selectedSourceBox.lastViewableLine - lineNo;
                skipScrolling = (linesFromTop > 3 && linesFromBot > 3);
                if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("SourceBoxPanel.scrollTimeout: skipScrolling: "+skipScrolling+" fromTop:"+linesFromTop+" fromBot:"+linesFromBot);
            }
            else  // the selectedSourceBox has not been built
            {
                if (FBTrace.DBG_SOURCEFILES)
                    FBTrace.sysout("SourceBoxPanel.scrollTimeout, no viewable lines", this.selectedSourceBox);
            }

            if (highlighter)
                 this.selectedSourceBox.highlighter = highlighter;

            if (!skipScrolling)
            {
                var viewRange = this.getViewRangeFromTargetLine(this.selectedSourceBox, lineNo);
                this.selectedSourceBox.newScrollTop = this.getScrollTopFromViewRange(this.selectedSourceBox, viewRange);
                if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("SourceBoxPanel.scrollTimeout: newScrollTop "+this.selectedSourceBox.newScrollTop+" for "+this.selectedSourceBox.repObject.href);
                this.selectedSourceBox.scrollTop = this.selectedSourceBox.newScrollTop; // *may* cause scrolling
                if (FBTrace.DBG_SOURCEFILES) FBTrace.sysout("SourceBoxPanel.scrollTimeout: scrollTo "+lineNo+" scrollTop:"+this.selectedSourceBox.scrollTop+ " lineHeight: "+this.selectedSourceBox.lineHeight);
            }

            if (this.selectedSourceBox.highlighter)
                this.applyDecorator(this.selectedSourceBox); // may need to highlight even if we don't scroll

        }, this));
    },

    /*
     * @return a highlighter function(sourceBox) that puts a class on the line for a time slice
     */
    jumpHighlightFactory: function(lineNo, context)
    {
        return function jumpHighlightIfInView(sourceBox)
        {
            var  lineNode = sourceBox.getLineNode(lineNo);
            if (lineNode)
            {
                setClassTimed(lineNode, "jumpHighlight", context);
                if (FBTrace.DBG_SOURCEFILES)
                    FBTrace.sysout("jumpHighlightFactory on line "+lineNo+" lineNode:"+lineNode.innerHTML+"\n");
            }
            else
            {
                if (FBTrace.DBG_SOURCEFILES)
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
            if (FBTrace.DBG_SOURCEFILES)
                FBTrace.sysout("resizer event: "+event.type, event);

            this.reView(this.selectedSourceBox);
        }
    },

    reView: function(sourceBox, clearCache)  // called for all scroll events, including any time sourcebox.scrollTop is set
    {
        if (sourceBox.targetedLine)
        {
            sourceBox.targetLineNumber = sourceBox.targetedLine;
            var viewRange = this.getViewRangeFromTargetLine(sourceBox, sourceBox.targetedLine);
            delete sourceBox.targetedLine;
        }
        else
        {
            var viewRange = this.getViewRangeFromScrollTop(sourceBox, sourceBox.scrollTop);
        }

        if (clearCache)
        {
            this.clearSourceBox(sourceBox, viewRange);
        }
        else if (sourceBox.scrollTop === sourceBox.lastScrollTop && sourceBox.clientHeight === sourceBox.lastClientHeight)
        {
            if (FBTrace.DBG_SOURCEFILES)
                FBTrace.sysout("reView skipping sourceBox "+sourceBox.scrollTop+"=scrollTop="+sourceBox.lastScrollTop+", "+ sourceBox.clientHeight+"=clientHeight="+sourceBox.lastClientHeight, sourceBox);
            // skip work if nothing changes.
            return;
        }

        dispatch([Firebug.A11yModel], "onBeforeViewportChange", [this]);  // XXXjjb TODO where should this be?
        this.buildViewAround(sourceBox, viewRange);

        if (Firebug.uiListeners.length > 0)
        {
            var link = new SourceLink(sourceBox.repObject.href, sourceBox.centralLine, this.getSourceType());
            dispatch(Firebug.uiListeners, "onViewportChange", [link]);
        }

        sourceBox.lastScrollTop = sourceBox.scrollTop;
        sourceBox.lastClientHeight = sourceBox.clientHeight;
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

        this.setViewportPadding(sourceBox, viewRange);

        sourceBox.centralLine = Math.floor( (viewRange.lastLine - viewRange.firstLine)/2 );

        this.applyDecorator(sourceBox);

        return;
    },

    updateViewportCache: function(sourceBox, viewRange)
    {
        var cacheHit = this.insertedLinesOverlapCache(sourceBox, viewRange);

        if (!cacheHit)
        {
            this.clearSourceBox(sourceBox, viewRange);
        }
        else
        {
            sourceBox.firstRenderedLine = Math.min(viewRange.firstLine, sourceBox.firstRenderedLine);
            sourceBox.lastRenderedLine = Math.max(viewRange.lastLine, sourceBox.lastRenderedLine);
        }
        sourceBox.firstViewableLine = viewRange.firstLine;  // todo actually check that these are viewable
        sourceBox.lastViewableLine = viewRange.lastLine;
        sourceBox.numberOfRenderedLines = sourceBox.lastRenderedLine - sourceBox.firstRenderedLine + 1;

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("buildViewAround viewRange: "+viewRange.firstLine+"-"+viewRange.lastLine+" rendered: "+sourceBox.firstRenderedLine+"-"+sourceBox.lastRenderedLine, sourceBox);
    },

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

            var newElement = appendInnerHTML(sourceBox.viewport, lineHTML, ref);
        }
        return cacheHit;
    },

    clearSourceBox: function(sourceBox, viewRange)
    {
        var topMostCachedElement = sourceBox.viewport.firstChild;
        this.removeLines(sourceBox, topMostCachedElement, sourceBox.numberOfRenderedLines);
        sourceBox.firstRenderedLine = viewRange.firstLine;
        sourceBox.lastRenderedLine = viewRange.lastLine;
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
        var linesPerViewport = Math.round((panelHeight / averageLineHeight) + 1);

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
        viewRange.firstLine = Math.floor(scrollTop / averageLineHeight + 1);

        var panelHeight = this.panelNode.clientHeight;
        var viewableLines = Math.ceil((panelHeight / averageLineHeight) + 1);
        viewRange.lastLine = viewRange.firstLine + viewableLines;
        if (viewRange.lastLine > sourceBox.maximumLineNumber)
            viewRange.lastLine = sourceBox.maximumLineNumber;

        viewRange.centralLine = Math.floor((viewRange.lastLine - viewRange.firstLine)/2);

        if (FBTrace.DBG_SOURCEFILES)
        {
            FBTrace.sysout("getViewRangeFromScrollTop scrollTop:"+scrollTop+" viewRange: "+viewRange.firstLine+"-"+viewRange.lastLine);
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
        var scrollTop = Math.floor(averageLineHeight * (viewRange.firstLine - 1));

        if (FBTrace.DBG_SOURCEFILES)
        {
            FBTrace.sysout("getScrollTopFromViewRange viewRange:"+viewRange.firstLine+"-"+viewRange.lastLine+" averageLineHeight: "+averageLineHeight+" scrollTop "+scrollTop);
            if (!this.noRecurse)
            {
                this.noRecurse = true;
                var testViewRange = this.getViewRangeFromScrollTop(sourceBox, scrollTop);
                delete this.noRecurse;
                var vrStr = viewRange.firstLine+"-"+viewRange.lastLine;
                var tvrStr = testViewRange.firstLine+"-"+testViewRange.lastLine;
                FBTrace.sysout("getScrollTopFromCenterLine "+((viewRange==testViewRange)? "checks" : vrStr+"=!viewRange!="+tvrStr));
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
            var scrollBarHeight = sourceBox.offsetHeight - sourceBox.clientHeight;
            // the total - view-taken-up - scrollbar
            var totalPadding = sourceBox.clientHeight - sourceBox.viewport.clientHeight - 1;
        }
        else
            var totalPadding = virtualSourceBoxHeight - sourceBox.viewport.clientHeight;

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("getTotalPadding clientHeight:"+sourceBox.viewport.clientHeight+"  max: "+max+" gives total padding "+totalPadding);

        return totalPadding;
    },

    setViewportPadding: function(sourceBox, viewRange)
    {
        var firstRenderedLineElement = sourceBox.getLineNode(sourceBox.firstRenderedLine);
        if (!firstRenderedLineElement)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("setViewportPadding FAILS, no line at "+sourceBox.firstRenderedLine, sourceBox);
            return;
        }

        var firstRenderedLineOffset = firstRenderedLineElement.offsetTop;
        var firstViewRangeElement = sourceBox.getLineNode(viewRange.firstLine);
        var firstViewRangeOffset = firstViewRangeElement.offsetTop;
        var topPadding = sourceBox.scrollTop - (firstViewRangeOffset - firstRenderedLineOffset);
        // Because of rounding when converting from pixels to lines, topPadding can be +/- lineHeight/2, round up
        var averageLineHeight = this.getAverageLineHeight(sourceBox);
        var linesOfPadding = Math.floor( (topPadding + averageLineHeight)/ averageLineHeight);
        var topPadding = (linesOfPadding - 1)* averageLineHeight;

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("setViewportPadding sourceBox.scrollTop - (firstViewRangeOffset - firstRenderedLineOffset): "+sourceBox.scrollTop+"-"+"("+firstViewRangeOffset+"-"+firstRenderedLineOffset+")="+topPadding);
        // we want the bottomPadding to take up the rest
        var totalPadding = this.getTotalPadding(sourceBox);
        if (totalPadding < 0)
            var bottomPadding = Math.abs(totalPadding);
        else
            var bottomPadding = Math.floor(totalPadding - topPadding);

        if (bottomPadding < 0)
            bottomPadding = 0;

        if(FBTrace.DBG_SOURCEFILES)
        {
            FBTrace.sysout("setViewportPadding viewport.offsetHeight: "+sourceBox.viewport.offsetHeight+" viewport.clientHeight "+sourceBox.viewport.clientHeight);
            FBTrace.sysout("setViewportPadding sourceBox.offsetHeight: "+sourceBox.offsetHeight+" sourceBox.clientHeight "+sourceBox.clientHeight);
            FBTrace.sysout("setViewportPadding scrollTop: "+sourceBox.scrollTop+" firstRenderedLine "+sourceBox.firstRenderedLine+" bottom: "+bottomPadding+" top: "+topPadding);
        }
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
    },

    applyDecorator: function(sourceBox)
    {
        if (this.context.sourceBoxDecoratorTimeout)
        {
            this.context.clearTimeout(this.context.sourceBoxDecoratorTimeout);
            delete this.context.sourceBoxDecoratorTimeout;
        }

        this.context.sourceBoxDecoratorTimeout = this.context.setTimeout(bindFixed(function delaySourceBoxDecorator()
        {
            try
            {
                if (sourceBox.highlighter)
                {
                    var sticky = sourceBox.highlighter(sourceBox);
                    if (FBTrace.DBG_SOURCEFILES)
                        FBTrace.sysout("sourceBoxDecoratorTimeout highlighter sticky:"+sticky, sourceBox.highlighter);
                    if (!sticky)
                        delete sourceBox.highlighter;
                }
                sourceBox.decorator.decorate(sourceBox, sourceBox.repObject);

                if (Firebug.uiListeners.length > 0) dispatch(Firebug.uiListeners, "onApplyDecorator", [sourceBox]);
                if (FBTrace.DBG_SOURCEFILES)
                    FBTrace.sysout("sourceBoxDecoratorTimeout "+sourceBox.repObject, sourceBox);
            }
            catch (exc)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("sourcebox applyDecorator FAILS "+exc, exc);
            }
        }, this));
    },
});




    // ************************************************************************************************
}});
