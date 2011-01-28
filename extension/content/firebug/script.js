/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

Components.utils.import("resource://firebug/bti/compilationunit.js");

// ************************************************************************************************
// Script panel

Firebug.ScriptPanel = function() {};

Firebug.ScriptPanel.reLineNumber = /^[^\\]?#(\d*)$/;
/*
 * object used to markup Javascript source lines.
 * In the namespace Firebug.ScriptPanel.
 */
Firebug.ScriptPanel.decorator = extend(new Firebug.SourceBoxDecorator,
{
    decorate: function(sourceBox, unused)
    {
        this.markExecutableLines(sourceBox);
        this.setLineBreakpoints(sourceBox.repObject, sourceBox)
    },

    markExecutableLines: function(sourceBox)
    {
        var compilationUnit = sourceBox.repObject;
        if (FBTrace.DBG_BP || FBTrace.DBG_LINETABLE)
            FBTrace.sysout("debugger.markExecutableLines START: "+compilationUnit.toString());

        var lineNo = sourceBox.firstViewableLine;
        while( lineNode = sourceBox.getLineNode(lineNo) )
        {
            if (lineNode.alreadyMarked)
            {
                lineNo++;
                continue;
            }

            var script = compilationUnit.isExecutableLine(lineNo);

            if (FBTrace.DBG_LINETABLE) FBTrace.sysout("debugger.markExecutableLines ["+lineNo+"]="+script);
            if (script)
                lineNode.setAttribute("executable", "true");
            else
                lineNode.removeAttribute("executable");

            lineNode.alreadyMarked = true;

            if (lineNo > sourceBox.lastViewableLine)
                break;

            lineNo++;
        }

        if (FBTrace.DBG_BP || FBTrace.DBG_LINETABLE)
            FBTrace.sysout("debugger.markExecutableLines DONE: "+compilationUnit.toString()+"\n");
    },

    setLineBreakpoints: function(compilationUnit, sourceBox)
    {
        fbs.enumerateBreakpoints(compilationUnit.getURL(), {call: function(url, line, props, scripts)
        {
            var scriptRow = sourceBox.getLineNode(line);
            if (scriptRow)
            {
                scriptRow.setAttribute("breakpoint", "true");
                if (props.disabled)
                    scriptRow.setAttribute("disabledBreakpoint", "true");
                if (props.condition)
                    scriptRow.setAttribute("condition", "true");
            }
            if (FBTrace.DBG_LINETABLE)
                FBTrace.sysout("debugger.setLineBreakpoints found "+scriptRow+" for "+line+"@"+compilationUnit.getURL()+"\n");
        }});
    },
});

// ************************************************************************************************

Firebug.ScriptPanel.prototype = extend(Firebug.SourceBoxPanel,
{
    /*
    * Framework connection
    */
    updateSourceBox: function(sourceBox)
    {
        if (this.scrollInfo && (this.scrollInfo.location == this.location))
            this.scrollToLine(this.location, this.scrollInfo.previousCenterLine);
        delete this.scrollInfo;
    },

    /*
    * Framework connection
    */
    getSourceType: function()
    {
        return "js";
    },

    /*
     * Framework connection
     */
    getDecorator: function(sourceBox)
    {
        return Firebug.ScriptPanel.decorator;
    },

    initialize: function(context, doc)
    {
        this.location = null;
        Firebug.SourceBoxPanel.initialize.apply(this, arguments);
    },

    initializeUI: function()
    {
        Firebug.Module.initializeUI.apply(this, arguments);
        Firebug.Debugger.addListener(this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Firebug.Debugger Listener
    onJSDActivate: function(active, why)
    {
        if (Firebug.chrome.getSelectedPanel() === this) // then the change in jsd causes a refresh
            Firebug.chrome.syncPanel(this.name);
    },

    onJSDDeactivate: function(active, why) // stop or pause
    {
        if (Firebug.chrome.getSelectedPanel() === this)
            Firebug.chrome.syncPanel(this.name);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    showFunction: function(fn)
    {
        var sourceLink = findSourceForFunction(fn, this.context);
        if (sourceLink)
        {
            this.showSourceLink(sourceLink);
        }
        else
        {
            if (FBTrace.DBG_ERRORS) FBTrace.sysout("no sourcelink for function"); // want to avoid the debugger panel if possible
        }
    },

    showSourceLink: function(sourceLink)
    {
        var compilationUnit = this.context.getCompilationUnit(sourceLink.href);
        if (compilationUnit)
        {
            this.navigate(compilationUnit);
            if (sourceLink.line)
            {
                this.scrollToLine(sourceLink.href, sourceLink.line, this.jumpHighlightFactory(sourceLink.line, this.context));
                dispatch(this.fbListeners, "onShowSourceLink", [this, sourceLink.line]);
            }
            if (sourceLink == this.selection)  // then clear it so the next link will scroll and highlight.
                delete this.selection;
        }
    },

    highlightLine: function()
    {
        var highlightingAttribute = "exe_line";
        if (this.selectedLine)  // could point to any node in any sourcebox, private to this function
            this.selectedLine.removeAttribute(highlightingAttribute);

        var sourceBox = this.selectedSourceBox;
        var lineNode = sourceBox.getLineNode(sourceBox.highlightedLineNumber);
        this.selectedLine = lineNode;  // if null, clears

        if (sourceBox.breakCauseBox)
        {
            sourceBox.breakCauseBox.hide();
            delete sourceBox.breakCauseBox;
        }

        if (this.selectedLine)
        {
            lineNode.setAttribute(highlightingAttribute, "true");
            if (this.context.breakingCause && !this.context.breakingCause.shown)
            {
                this.context.breakingCause.shown = true;
                var cause = this.context.breakingCause;
                if (cause && Firebug.showBreakNotification)
                {
                    var sourceLine = getChildByClass(lineNode, "sourceLine");
                    sourceBox.breakCauseBox = new Firebug.Breakpoint.BreakNotification(this.document, cause);
                    sourceBox.breakCauseBox.show(sourceLine, this, "not an editor, yet?");
                }
            }
        }

        if (FBTrace.DBG_BP || FBTrace.DBG_STACK || FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("sourceBox.highlightLine lineNo: "+sourceBox.highlightedLineNumber+" lineNode="+lineNode+" in "+sourceBox.repObject.href);

        return (sourceBox.highlightedLineNumber > 0); // sticky if we have a valid line
    },

    showStackFrameXB: function(frameXB)
    {
        if (this.context.stopped)
            this.showStackFrameTrue(frameXB);
        else
            this.showNoStackFrame();
    },

    showStackFrameTrue: function(frame)
    {
         var url = frame.getURL();
         var lineNo = frame.getLineNumber();

         if (FBTrace.DBG_STACK)
             FBTrace.sysout("showStackFrame: "+url+"@"+lineNo+"\n");

         if (this.context.breakingCause)
             this.context.breakingCause.lineNo = lineNo;

         this.scrollToLine(url, lineNo, bind(this.highlightLine, this) );
         this.context.throttle(this.updateInfoTip, this);
         return;
    },

    showNoStackFrame: function()
    {
        if (this.selectedSourceBox)
        {
            this.selectedSourceBox.highlightedLineNumber = -1;
            this.highlightLine(); // clear highlight
            if (FBTrace.DBG_STACK)
                FBTrace.sysout("showNoStackFrame clear "+this.selectedSourceBox.repObject.url);
        }

        var panelStatus = Firebug.chrome.getPanelStatusElements();
        panelStatus.clear(); // clear stack on status bar
        this.updateInfoTip();

        var watchPanel = this.context.getPanel("watches", true);
        if (watchPanel)
            watchPanel.showEmptyMembers();
    },

    toggleBreakpoint: function(lineNo)
    {
        var href = this.getSourceBoxURL(this.selectedSourceBox);
        var lineNode = this.selectedSourceBox.getLineNode(lineNo);

        var compilationUnit = this.context.getCompilationUnit(href);

        if (!compilationUnit && FBTrace.DBG_ERRORS)
            FBTrace.sysout("toggleBreakpoint no compilationUnit! ", this);
        if (FBTrace.DBG_BP)
            FBTrace.sysout("debugger.toggleBreakpoint lineNo="+lineNo+" compilationUnit.href:"+compilationUnit.href+" lineNode.breakpoint:"+(lineNode?lineNode.getAttribute("breakpoint"):"(no lineNode)")+"\n", this.selectedSourceBox);

        if (lineNode.getAttribute("breakpoint") == "true")
            fbs.clearBreakpoint(href, lineNo);
        else
            Firebug.Debugger.setBreakpoint(compilationUnit, lineNo);
    },

    toggleDisableBreakpoint: function(lineNo)
    {
        var href = this.getSourceBoxURL(this.selectedSourceBox);
        var lineNode = this.selectedSourceBox.getLineNode(lineNo);
        if (lineNode.getAttribute("disabledBreakpoint") == "true")
            fbs.enableBreakpoint(href, lineNo);
        else
            fbs.disableBreakpoint(href, lineNo);
    },

    editBreakpointCondition: function(lineNo)
    {
        var sourceRow = this.selectedSourceBox.getLineNode(lineNo);
        var sourceLine = getChildByClass(sourceRow, "sourceLine");
        var condition = fbs.getBreakpointCondition(this.location.href, lineNo);

        if (condition)
        {
            var watchPanel = this.context.getPanel("watches", true);
            watchPanel.removeWatch(condition);
            watchPanel.rebuild();
        }

        Firebug.Editor.startEditing(sourceLine, condition);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    addSelectionWatch: function()
    {
        var watchPanel = this.context.getPanel("watches", true);
        if (watchPanel)
        {
            var selection = this.document.defaultView.getSelection();
            var source = this.getSourceLinesFrom(selection);
            watchPanel.addWatch(source);
        }
    },

    copySource: function()
    {
        var selection = this.document.defaultView.getSelection();
        var source = this.getSourceLinesFrom(selection);
        copyToClipboard(source);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    updateInfoTip: function()
    {
        var infoTip = this.panelBrowser.infoTip;
        if (infoTip && this.infoTipExpr)
            this.populateInfoTip(infoTip, this.infoTipExpr);
    },

    populateInfoTip: function(infoTip, expr)
    {
        if (!expr || isJavaScriptKeyword(expr))
            return false;

        var self = this;
        // If the evaluate fails, then we report an error and don't show the infoTip
        Firebug.CommandLine.evaluate(expr, this.context, null, this.context.getGlobalScope(),
            function success(result, context)
            {
                var rep = Firebug.getRep(result, context);
                var tag = rep.shortTag ? rep.shortTag : rep.tag;

                if (FBTrace.DBG_STACK)
                    FBTrace.sysout("populateInfoTip result is "+result, result);

                tag.replace({object: result}, infoTip);

                Firebug.chrome.contextMenuObject = result;  // for context menu select()

                self.infoTipExpr = expr;
            },
            function failed(result, context)
            {
                self.infoTipExpr = "";
            }
        );
        return (self.infoTipExpr == expr);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // UI event listeners

    onMouseDown: function(event)
    {
        // Don't interfere with clicks made into a notification editor.
        if (getAncestorByClass(event.target, "breakNotification"))
            return;

        var sourceLine = getAncestorByClass(event.target, "sourceLine");
        if (!sourceLine)
            return;

        var sourceRow = sourceLine.parentNode;
        var compilationUnit = sourceRow.parentNode.repObject;
        var lineNo = parseInt(sourceLine.textContent);

        if (isLeftClick(event))
            this.toggleBreakpoint(lineNo);
        else if (isShiftClick(event))
            this.toggleDisableBreakpoint(lineNo);
        else if (isControlClick(event) || isMiddleClick(event))
        {
            Firebug.Debugger.runUntil(this.context, compilationUnit, lineNo, Firebug.Debugger);
            cancelEvent(event);
        }
    },

    onContextMenu: function(event)
    {
        var sourceLine = getAncestorByClass(event.target, "sourceLine");
        if (!sourceLine)
            return;

        var lineNo = parseInt(sourceLine.textContent);
        this.editBreakpointCondition(lineNo);
        cancelEvent(event);
    },

    onMouseOver: function(event)
    {
        var sourceLine = getAncestorByClass(event.target, "sourceLine");
        if (sourceLine)
        {
            if (this.hoveredLine)
                removeClass(this.hoveredLine.parentNode, "hovered");

            this.hoveredLine = sourceLine;

            if (getAncestorByClass(sourceLine, "sourceViewport"))
                setClass(sourceLine.parentNode, "hovered");
        }
    },

    onMouseOut: function(event)
    {
        var sourceLine = getAncestorByClass(event.relatedTarget, "sourceLine");
        if (!sourceLine)
        {
            if (this.hoveredLine)
                removeClass(this.hoveredLine.parentNode, "hovered");

            delete this.hoveredLine;
        }
    },

    onScroll: function(event)
    {
        var scrollingElement = event.target;
        this.reView(scrollingElement);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "script",
    searchable: true,
    breakable: true,
    enableA11y: true,
    order: 40,

    initialize: function(context, doc)
    {
        this.onMouseDown = bind(this.onMouseDown, this);
        this.onContextMenu = bind(this.onContextMenu, this);
        this.onMouseOver = bind(this.onMouseOver, this);
        this.onMouseOut = bind(this.onMouseOut, this);
        this.onScroll = bind(this.onScroll, this);

        this.panelSplitter = $("fbPanelSplitter");
        this.sidePanelDeck = $("fbSidePanelDeck");

        Firebug.SourceBoxPanel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        delete this.selection; // We want the location (compilationUnit) to persist, not the selection (eg stackFrame).
        persistObjects(this, state);

        state.location = this.location;

        var sourceBox = this.selectedSourceBox;
        if (sourceBox)
        {
            state.previousCenterLine = sourceBox.centerLine;
            delete this.selectedSourceBox;
        }

        Firebug.SourceBoxPanel.destroy.apply(this, arguments);
    },

    detach: function(oldChrome, newChrome)
    {
        if (this.selectedSourceBox)
            this.lastSourceScrollTop = this.selectedSourceBox.scrollTop;

        if (this.context.stopped)
        {
            Firebug.Debugger.detachListeners(this.context, oldChrome);
            Firebug.Debugger.attachListeners(this.context, newChrome);
        }

        Firebug.Debugger.syncCommands(this.context);

        Firebug.SourceBoxPanel.detach.apply(this, arguments);
    },

    reattach: function(doc)
    {
        Firebug.SourceBoxPanel.reattach.apply(this, arguments);

        setTimeout(bind(function delayScrollToLastTop()
        {
            if (this.lastSourceScrollTop)
            {
                this.selectedSourceBox.scrollTop = this.lastSourceScrollTop;
                delete this.lastSourceScrollTop;
            }
        }, this));
    },

    initializeNode: function(oldPanelNode)
    {
        this.tooltip = this.document.createElement("div");
        setClass(this.tooltip, "scriptTooltip");
        this.tooltip.setAttribute('aria-live', 'polite')
        obscure(this.tooltip, true);
        this.panelNode.appendChild(this.tooltip);

        this.panelNode.addEventListener("mousedown", this.onMouseDown, true);
        this.panelNode.addEventListener("contextmenu", this.onContextMenu, false);
        this.panelNode.addEventListener("mouseover", this.onMouseOver, false);
        this.panelNode.addEventListener("mouseout", this.onMouseOut, false);
        this.panelNode.addEventListener("scroll", this.onScroll, true);

        Firebug.SourceBoxPanel.initializeNode.apply(this, arguments);
    },

    destroyNode: function()
    {
        if (this.tooltipTimeout)
            clearTimeout(this.tooltipTimeout);

        this.panelNode.removeEventListener("mousedown", this.onMouseDown, true);
        this.panelNode.removeEventListener("contextmenu", this.onContextMenu, false);
        this.panelNode.removeEventListener("mouseover", this.onMouseOver, false);
        this.panelNode.removeEventListener("mouseout", this.onMouseOut, false);
        this.panelNode.removeEventListener("scroll", this.onScroll, true);

        Firebug.SourceBoxPanel.destroyNode.apply(this, arguments);
    },

    clear: function()
    {
        clearNode(this.panelNode);
    },

    showWarning: function()
    {
        // Fill the panel node with a warning if needed
        var aLocation = this.getDefaultLocation();
        var jsEnabled = Firebug.getPref("javascript", "enabled");
        if (FBL.fbs.activitySuspended && !this.context.stopped)
        {
            // Make sure that the content of the panel is restored as soon as
            // the debugger is resumed.
            this.restored = false;
            this.activeWarningTag = WarningRep.showActivitySuspended(this.panelNode);
        }
        else if (!jsEnabled)
            this.activeWarningTag = WarningRep.showNotEnabled(this.panelNode);
        else if (this.context.allScriptsWereFiltered)
            this.activeWarningTag = WarningRep.showFiltered(this.panelNode);
        else if (aLocation && !this.context.jsDebuggerCalledUs)
            this.activeWarningTag = WarningRep.showInactive(this.panelNode);
        else if (!Firebug.Debugger.jsDebuggerOn)  // set asynchronously by jsd in FF 4.0
            this.activeWarningTag = WarningRep.showDebuggerInactive(this.panelNode);
        else if (!aLocation) // they were not filtered, we just had none
            this.activeWarningTag = WarningRep.showNoScript(this.panelNode);
        else
            return false;

        return true;
    },

    show: function(state)
    {
        var enabled = Firebug.Debugger.isAlwaysEnabled();

        if (!enabled)
            return;

        var active = !this.showWarning();

        if (active)
        {
            this.location = this.getDefaultLocation();

            if (this.context.loaded)
            {
                if (!this.restored)
                {
                    delete this.location;  // remove the default location if any
                    restoreLocation(this, state);
                    this.restored = true;
                }
                else // we already restored
                {
                    if (!this.selectedSourceBox)  // but somehow we did not make a sourcebox?
                        this.navigate(this.location);
                    else  // then we can sync the location to the sourcebox
                        this.location = this.selectedSourceBox.repObject;
                }

                if (state && this.location)  // then we are restoring and we have a location, so scroll when we can
                    this.scrollInfo = { location: this.location, previousCenterLine: state.previousCenterLine};
            }
            else // show default
            {
                this.navigate(this.location);
            }

            this.highlight(this.context.stopped);

            var breakpointPanel = this.context.getPanel("breakpoints", true);
            if (breakpointPanel)
                breakpointPanel.refresh();
        }

        collapse(Firebug.chrome.$("fbToolbar"), !active);

        // These buttons are visible only if debugger is enabled.
        this.showToolbarButtons("fbLocationSeparator", active);
        this.showToolbarButtons("fbDebuggerButtons", active);
        this.showToolbarButtons("fbLocationButtons", active);
        this.showToolbarButtons("fbScriptButtons", active);
        this.showToolbarButtons("fbStatusButtons", active);

        // Additional debugger panels are visible only if debugger
        // is active.
        this.panelSplitter.collapsed = !active;
        this.sidePanelDeck.collapsed = !active;
    },

    hide: function(state)
    {
        this.highlight(this.context.stopped);

        var panelStatus = Firebug.chrome.getPanelStatusElements();
        FBL.hide(panelStatus, false);

        delete this.infoTipExpr;
    },

    search: function(text, reverse)
    {
        var sourceBox = this.selectedSourceBox;
        if (!text || !sourceBox)
        {
            delete this.currentSearch;
            return false;
        }

        // Check if the search is for a line number
        var m = Firebug.ScriptPanel.reLineNumber.exec(text);
        if (m)
        {
            if (!m[1])
                return true; // Don't beep if only a # has been typed

            var lineNo = parseInt(m[1]);
            if (!isNaN(lineNo) && (lineNo > 0) && (lineNo < sourceBox.lines.length) )
            {
                this.scrollToLine(sourceBox.repObject.href, lineNo,  this.jumpHighlightFactory(lineNo, this.context))
                return true;
            }
        }

        var curDoc = this.searchCurrentDoc(!Firebug.searchGlobal, text, reverse);
        if (!curDoc && Firebug.searchGlobal)
        {
            return this.searchOtherDocs(text, reverse);
        }
        return curDoc;
    },

    searchOtherDocs: function(text, reverse)
    {
        var scanRE = Firebug.Search.getTestingRegex(text);

        var self = this;

        function scanDoc(compilationUnit)
        {
            var lines = null;

            // TODO the source lines arrive async in general
            compilationUnit.getSourceLines(-1, -1, function loadSource(unit, firstLineNumber, lastLineNumber, linesRead)
            {
                lines = linesRead;
            });

            if (!lines)
                return;
            // we don't care about reverse here as we are just looking for existence,
            // if we do have a result we will handle the reverse logic on display
            for (var i = 0; i < lines.length; i++) {
                if (scanRE.test(lines[i]))
                {
                    return true;
                }
            }
        }

        if (this.navigateToNextDocument(scanDoc, reverse))
        {
            return this.searchCurrentDoc(true, text, reverse);
        }
    },

    searchCurrentDoc: function(wrapSearch, text, reverse)
    {
        var sourceBox = this.selectedSourceBox;

        var lineNo = null;
        if (this.currentSearch && text == this.currentSearch.text)
            lineNo = this.currentSearch.findNext(wrapSearch, reverse, Firebug.Search.isCaseSensitive(text));
        else
        {
            this.currentSearch = new SourceBoxTextSearch(sourceBox);
            lineNo = this.currentSearch.find(text, reverse, Firebug.Search.isCaseSensitive(text));
        }

        if (lineNo || lineNo === 0)
        {
            // this lineNo is an zero-based index into sourceBox.lines. Add one for user line numbers
            this.scrollToLine(sourceBox.repObject.href, lineNo, this.jumpHighlightFactory(lineNo+1, this.context));
            dispatch(this.fbListeners, 'onScriptSearchMatchFound', [this, text, sourceBox.repObject, lineNo]);

            return true;
        }
        else
        {
            dispatch(this.fbListeners, 'onScriptSearchMatchFound', [this, text, null, null]);
            return false;
        }
    },

    getSearchOptionsMenuItems: function()
    {
        return [
            Firebug.Search.searchOptionMenu("search.Case Sensitive", "searchCaseSensitive"),
            Firebug.Search.searchOptionMenu("search.Multiple Files", "searchGlobal"),
            Firebug.Search.searchOptionMenu("search.Use Regular Expression", "searchUseRegularExpression")
        ];
    },

    supportsObject: function(object, type)
    {
        if( object instanceof CompilationUnit
            || (object instanceof SourceLink && object.type == "js")
            || typeof(object) == "function"
            || object instanceof StackFrame)
            return 1;
        else return 0;
    },

    refresh: function()  // delete any sourceBox-es that are not in sync with compilationUnits
    {
        for(var url in this.sourceBoxes)
        {
            if (this.sourceBoxes.hasOwnProperty(url))
            {
                var sourceBox = this.sourceBoxes[url];
                var compilationUnit = this.context.getCompilationUnit(url);
                if (!compilationUnit || compilationUnit != sourceBox.repObject) // then out of sync
                {
                   var victim = this.sourceBoxes[url];
                   delete this.sourceBoxes[url];
                   if (this.selectedSourceBox == victim)
                   {
                        collapse(this.selectedSourceBox, true);
                        delete this.selectedSourceBox;
                   }
                   if (FBTrace.DBG_COMPILATION_UNITS)
                       FBTrace.sysout("debugger.refresh deleted sourceBox for "+url);
                }
            }
        }

        // then show() has not run, but we have to refresh, so do the default.
        if (!this.selectedSourceBox)
            this.navigate();
    },

    updateLocation: function(compilationUnit)
    {
        if (!compilationUnit)
            return;  // XXXjjb do we need to show a blank?

        // Since our last use of the compilationUnit we may have compiled or recompiled the source
        var updatedCompilationUnit = this.context.getCompilationUnit(compilationUnit.getURL());
        if (!updatedCompilationUnit)
            updatedCompilationUnit = this.getDefaultLocation();
        if (!updatedCompilationUnit)
            return;

        if (this.activeWarningTag)
        {
            clearNode(this.panelNode);
            delete this.activeWarningTag;

            // The user was seeing the warning, but selected a file to show in the script panel.
            // The removal of the warning leaves the panel without a clientHeight, so
            //  the old sourcebox will be out of sync. Just remove it and start over.
            this.removeAllSourceBoxes();
        }

        this.showSource(updatedCompilationUnit.getURL());
        dispatch(this.fbListeners, "onUpdateScriptLocation", [this, updatedCompilationUnit]);
    },

    updateSelection: function(object)
    {
        if (FBTrace.DBG_PANELS)
        {
            FBTrace.sysout("script updateSelection object:"+object+" of type "+typeof(object), object);
            if (object instanceof CompilationUnit)
                FBTrace.sysout("script updateSelection this.navigate(object)", object);
            else if (object instanceof SourceLink)
                FBTrace.sysout("script updateSelection this.showSourceLink(object)", object);
            else if (typeof(object) == "function")
                FBTrace.sysout("script updateSelection this.showFunction(object)", object);
            else if (object instanceof StackFrame)
                FBTrace.sysout("script updateSelection this.showStackFrameXB(object)", object);
            else
                FBTrace.sysout("script updateSelection this.showStackFrame(null)", object);
        }

        if (object instanceof CompilationUnit)
            this.navigate(object);
        else if (object instanceof SourceLink)
            this.showSourceLink(object);
        else if (typeof(object) == "function")
            this.showFunction(object);
        else if (object instanceof StackFrame)
            this.showStackFrameXB(object);
    },

    showThisCompilationUnit: function(compilationUnit)
    {
        //-----------------------------------123456789
        if (compilationUnit.getURL().substr(0, 9) == "chrome://")
            return false;

           if (compilationUnit.getKind() === CompilationUnit.EVAL && !this.showEvals)
               return false;

        if (compilationUnit.getKind() === CompilationUnit.BROWSER_GENERATED && !this.showEvents)
            return false;

        return true;
    },

    getLocationList: function()
    {
        var context = this.context;

        var allSources = context.getAllCompilationUnits();

        if (!allSources.length)
            return [];

        if (Firebug.showAllSourceFiles)
        {
            if (FBTrace.DBG_COMPILATION_UNITS) FBTrace.sysout("debugger getLocationList "+context.getName()+" allSources", allSources);
            return allSources;
        }

        var filter = Firebug.getPref(Firebug.servicePrefDomain, "scriptsFilter");
        this.showEvents = (filter == "all" || filter == "events");
        this.showEvals = (filter == "all" || filter == "evals");

        var list = [];
        for (var i = 0; i < allSources.length; i++)
        {
            if (this.showThisCompilationUnit(allSources[i]))
                list.push(allSources[i]);
        }

        if (!list.length && allSources.length)
            this.context.allScriptsWereFiltered = true;
        else
            delete this.context.allScriptsWereFiltered;

        if (FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("debugger.getLocationList enabledOnLoad:"+context.onLoadWindowContent+" all:"+allSources.length+" filtered:"+list.length, list);
        return list;
    },

    getDefaultLocation: function()
    {
        var compilationUnits = this.getLocationList();
        if (!compilationUnits.length)
            return null;

        if (this.context)
        {
            var url = this.context.getWindowLocation();
            for (var i = 0; i < compilationUnits.length; i++)
            {
                if (url == compilationUnits[i].href)
                    return compilationUnits[i];
            }
            return compilationUnits[0];
        }
        else
            return compilationUnits[0];
    },

    getDefaultSelection: function()
    {
        return this.getDefaultLocation();
    },

    getTooltipObject: function(target)
    {
        // Target should be A element with class = sourceLine
        if ( hasClass(target, 'sourceLine') )
        {
           return null; // TODO
        }
        return null;
    },

    getPopupObject: function(target)
    {
        // Don't show popup over the line numbers, we show the conditional breakpoint
        // editor there instead
        var sourceLine = getAncestorByClass(target, "sourceLine");
        if (sourceLine)
            return;

        var sourceRow = getAncestorByClass(target, "sourceRow");
        if (!sourceRow)
            return;

        var lineNo = parseInt(sourceRow.firstChild.textContent);
        var scripts = findScripts(this.context, this.location.href, lineNo);
        return scripts; // gee I wonder what will happen?
    },

    showInfoTip: function(infoTip, target, x, y, rangeParent, rangeOffset)
    {
        var frame = this.context.currentFrame;
        if (!frame)
            return;

        var sourceRowText = getAncestorByClass(target, "sourceRowText");
        if (!sourceRowText)
            return;

        // see http://code.google.com/p/fbug/issues/detail?id=889
        // idea from: Jonathan Zarate's rikaichan extension (http://www.polarcloud.com/rikaichan/)
        if (!rangeParent)
            return;
        rangeOffset = rangeOffset || 0;
        var expr = getExpressionAt(rangeParent.data, rangeOffset);
        if (!expr || !expr.expr)
            return;

        if (expr.expr == this.infoTipExpr)
            return true;
        else
            return this.populateInfoTip(infoTip, expr.expr);
    },

    getObjectPath: function(frame)
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("debugger.getObjectPath "+frame, frame);

        if (!frame || !frame.getStackNewestFrame) // then its probably not a frame after all
            return;

        var frames = [];
        frame = frame.getStackNewestFrame();
        for (; frame; frame = frame.getCallingFrame())
            frames.push(frame);

        return frames;
    },

    getObjectLocation: function(compilationUnit)
    {
        return compilationUnit.getURL();
    },

    // return.path: group/category label, return.name: item label
    getObjectDescription: function(compilationUnit)
    {
        var kind = compilationUnit.getKind();
        if (kind == CompilationUnit.BROWSER_GENERATED)
        {
            var url = compilationUnit.getURL()
            var i = url.indexOf("/event/seq");
            var container = url.substr(0,i);
            var split = FBL.splitURLBase(container);  // path & name
            return {path: split.path, name: split.name+url.substr(i) };
        }
        return FBL.splitURLBase(compilationUnit.getURL());
    },

    getSourceLink: function(target, object)
    {
        var sourceRow = getAncestorByClass(target, "sourceRow");
        if (!sourceRow)
            return;

        var sourceLine = getChildByClass(sourceRow, "sourceLine");
        var lineNo = parseInt(sourceLine.textContent);
        return new FBL.SourceLink(this.location.url, lineNo, 'js');
    },

    getOptionsMenuItems: function()
    {
        var context = this.context;

        return [
            /*optionMenu("DecompileEvals", "decompileEvals"),*/
            serviceOptionMenu("ShowAllSourceFiles", "showAllSourceFiles"),
            // 1.2: always check last line; optionMenu("UseLastLineForEvalName", "useLastLineForEvalName"),
            // 1.2: always use MD5 optionMenu("UseMD5ForEvalName", "useMD5ForEvalName")
            serviceOptionMenu("TrackThrowCatch", "trackThrowCatch"),
            //"-",
            //1.2 option on toolbar this.optionMenu("DebuggerEnableAlways", enableAlwaysPref)
            optionMenu("Show Break Notifications", "showBreakNotification")
        ];
    },

    optionMenu: function(label, option)
    {
        var checked = Firebug.getPref(prefDomain, option);
        return {label: label, type: "checkbox", checked: checked,
            command: bindFixed(Firebug.setPref, Firebug, prefDomain, option, !checked) };
    },

    getContextMenuItems: function(fn, target)
    {
        if (getAncestorByClass(target, "sourceLine"))
            return;

        var sourceRow = getAncestorByClass(target, "sourceRow");
        if (!sourceRow)
            return;

        var sourceLine = getChildByClass(sourceRow, "sourceLine");
        var lineNo = parseInt(sourceLine.textContent);

        var items = [];

        var selection = this.document.defaultView.getSelection();
        if (selection.toString())
        {
            items.push(
                {label: "CopySourceCode", command: bind(this.copySource, this) },
                "-",
                {label: "AddWatch", command: bind(this.addSelectionWatch, this) }
            );
        }

        var hasBreakpoint = sourceRow.getAttribute("breakpoint") == "true";

        items.push(
            "-",
            {label: "SetBreakpoint", type: "checkbox", checked: hasBreakpoint,
                command: bindFixed(this.toggleBreakpoint, this, lineNo) }
        );
        if (hasBreakpoint)
        {
            var isDisabled = fbs.isBreakpointDisabled(this.location.href, lineNo);
            items.push(
                {label: "DisableBreakpoint", type: "checkbox", checked: isDisabled,
                    command: bindFixed(this.toggleDisableBreakpoint, this, lineNo) }
            );
        }
        items.push(
            {label: "EditBreakpointCondition",
                command: bindFixed(this.editBreakpointCondition, this, lineNo) }
        );

        if (this.context.stopped)
        {
            var sourceRow = getAncestorByClass(target, "sourceRow");
            if (sourceRow)
            {
                var compilationUnit = getAncestorByClass(sourceRow, "sourceBox").repObject;
                var lineNo = parseInt(sourceRow.firstChild.textContent);

                var debuggr = Firebug.Debugger;
                items.push(
                    "-",
                    {label: "Continue",
                        command: bindFixed(debuggr.resume, debuggr, this.context) },
                    {label: "StepOver",
                        command: bindFixed(debuggr.stepOver, debuggr, this.context) },
                    {label: "StepInto",
                        command: bindFixed(debuggr.stepInto, debuggr, this.context) },
                    {label: "StepOut",
                        command: bindFixed(debuggr.stepOut, debuggr, this.context) },
                    {label: "RunUntil",
                        command: bindFixed(debuggr.runUntil, debuggr, this.context,
                        compilationUnit, lineNo) }
                );
            }
        }

        return items;
    },

    getEditor: function(target, value)
    {
        if (!this.conditionEditor)
            this.conditionEditor = new Firebug.Breakpoint.ConditionEditor(this.document);

        return this.conditionEditor;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    supportsBreakOnNext: function()
    {
        return this.breakable && Firebug.Debugger.jsDebuggerOn;
    },

    breakOnNext: function(enabled)
    {
        if (enabled)
            Firebug.Debugger.suspend(this.context);
        else
            Firebug.Debugger.unSuspend(this.context);
    },

    getBreakOnNextTooltip: function(armed)
    {
        return (armed ? $STR("script.Disable Break On Next") : $STR("script.Break On Next"));
    },

    shouldBreakOnNext: function()
    {
        return !!this.context.breakOnNextHook;  // TODO BTI
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends ActivablePanel

    /**
     * Support for panel activation.
     */
    onActivationChanged: function(enable)
    {
        if (FBTrace.DBG_CONSOLE || FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("ScriptPanel.onActivationChanged; " + enable);

        if (enable)
            Firebug.Debugger.addObserver(this);
        else
            Firebug.Debugger.removeObserver(this);
    },
});

// ************************************************************************************************

/**
 * @domplate Displays various warning messages within the Script panel.
 */
Firebug.ScriptPanel.WarningRep = domplate(Firebug.Rep,
{
    tag:
        DIV({"class": "disabledPanelBox"},
            H1({"class": "disabledPanelHead"},
                SPAN("$pageTitle")
            ),
            P({"class": "disabledPanelDescription", style: "margin-top: 15px;"},
                SPAN("$suggestion")
            )
        ),

    enableScriptTag:
        SPAN({"class": "objectLink", onclick: "$onEnableScript", style: "color: blue"},
            $STR("script.button.enable_javascript")
        ),

    focusDebuggerTag:
        SPAN({"class": "objectLink", onclick: "$onFocusDebugger", style: "color: blue"},
            $STR("script.button.Go to that page")
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onEnableScript: function(event)
    {
        Firebug.setPref("javascript", "enabled", true);

        this.reloadPageFromMemory(event.target);
    },

    reloadPageFromMemory: function(event)
    {
        var context= Firebug.getElementPanel(event.target).context;
        if (context.browser)
            context.browser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_CHARSET_CHANGE)
        else
            context.window.location.reload();
    },

    onFocusDebugger: function(event)
    {
        iterateBrowserWindows("navigator:browser", function(win)
        {
            return win.Firebug.TabWatcher.iterateContexts(function(context)
            {
                if (context.stopped)
                {
                     win.Firebug.focusBrowserTab(context.window);
                     return true;
                }
            });
        });
        // No context is stopped
        var depth = fbs.exitNestedEventLoop();
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("Firebug.Debugger.onFocusDebugger FAILS, aborting nested event loop at depth "+depth);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    showInactive: function(parentNode)
    {
        var args = {
            pageTitle: $STR("script.warning.inactive_during_page_load"),
            suggestion: $STR("script.suggestion.inactive_during_page_load2")
        };

        var box = this.tag.replace(args, parentNode, this);
        var description = box.querySelector(".disabledPanelDescription");
        FirebugReps.Description.render(args.suggestion, description,
            bind(this.reloadPageFromMemory, this));

        return box;
    },

    showNotEnabled: function(parentNode)
    {
        var args = {
            pageTitle: $STR("script.warning.javascript_not_enabled"),
            suggestion: $STR("script.suggestion.javascript_not_enabled")
        }

        var box = this.tag.replace(args, parentNode, this);
        this.enableScriptTag.append({}, box, this);

        return box;
    },

    showDebuggerInactive: function(parentNode)
    {
        var args = {
            pageTitle: $STR("script.warning.debugger_not_activated"),
            suggestion: $STR("script.suggestion.debugger_not_activated")
        }

        var box = this.tag.replace(args, parentNode, this);

        return box;
    },

    showFiltered: function(parentNode)
    {
        var args = {
            pageTitle: $STR("script.warning.all_scripts_filtered"),
            suggestion: $STR("script.suggestion.all_scripts_filtered")
        };
        return this.tag.replace(args, parentNode, this);
    },

    showNoScript: function(parentNode)
    {
        var args = {
            pageTitle: $STR("script.warning.no_javascript"),
            suggestion: $STR("script.suggestion.no_javascript")
        }
        return this.tag.replace(args, parentNode, this);
    },

    showActivitySuspended: function(parentNode)
    {
        var args = {
            pageTitle: $STR("script.warning.debugger_active"),
            suggestion: $STR("script.suggestion.debugger_active")
        }

        var box = this.tag.replace(args, parentNode, this);
        this.focusDebuggerTag.append({}, box, this);

        return box;
    }
});

var WarningRep = Firebug.ScriptPanel.WarningRep;

// ************************************************************************************************
// Registration

Firebug.registerPanel(Firebug.ScriptPanel);

// ************************************************************************************************
return Firebug.ScriptPanel;
}});
