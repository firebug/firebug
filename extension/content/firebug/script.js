/* See license.txt for terms of usage */

define(["arch/tools", "editorSelector.js"], function(ToolsInterface) { with (FBL) {

var CompilationUnit = ToolsInterface.CompilationUnit;



// Script panel

Firebug.ScriptPanel = function() {};

for(var p in Firebug.EditorSelector)
{
    if (Firebug.EditorSelector.hasOwnProperty(p))
        Firebug.ScriptPanel[p] = Firebug.EditorSelector[p];
}

Firebug.ScriptPanel.getEditorOptionKey = function()
{
    return "JSEditor";
}

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
            FBTrace.sysout("script.markExecutableLines START: "+compilationUnit.toString());

        var lineNo = sourceBox.firstViewableLine;
        while( lineNode = sourceBox.getLineNode(lineNo) )
        {
            if (lineNode.alreadyMarked)
            {
                lineNo++;
                continue;
            }

            var script = compilationUnit.isExecutableLine(lineNo);

            if (FBTrace.DBG_LINETABLE)
                FBTrace.sysout("script.markExecutableLines ["+lineNo+"]="+script);

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
            FBTrace.sysout("script.markExecutableLines DONE: "+compilationUnit.toString()+"\n");
    },

    setLineBreakpoints: function(compilationUnit, sourceBox)
    {
        compilationUnit.eachBreakpoint(function setAttributes(line, props)
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
                FBTrace.sysout("script.setLineBreakpoints found "+scriptRow+" for "+line+"@"+
                    compilationUnit.getURL()+"\n");
        });
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
        this.location = sourceBox.repObject;
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // TODO Class method
    onJavaScriptDebugging: function(active)
    {
        if (Firebug.chrome.getSelectedPanel() === this) // then the change in jsd causes a refresh
            Firebug.chrome.syncPanel(this.name);

        // Front side UI mark
        var firebugStatus = $('firebugStatus');
        if (firebugStatus)
        {
            if (active)
                firebugStatus.setAttribute("script", "on");
            else
                firebugStatus.setAttribute("script", "off");
        }

        Firebug.StartButton.resetTooltip();

        // Front side state
        Firebug.jsDebuggerOn = active;

        if (FBTrace.DBG_ACTIVATION)
            FBTrace.sysout("script.onJavaScriptDebugging "+active+" icon attribute: "+$('firebugStatus').getAttribute("script"));
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
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("no sourcelink for function"); // want to avoid the script panel if possible
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
                this.scrollToLine(sourceLink.href, sourceLink.line,
                    this.jumpHighlightFactory(sourceLink.line, this.context));

                dispatch(this.fbListeners, "onShowSourceLink", [this, sourceLink.line]);
            }

            // then clear it so the next link will scroll and highlight.
            if (sourceLink == this.selection)
                delete this.selection;
        }
    },

    highlightingAttribute: "exe_line",

    removeExeLineHighlight: function(sourceBox)
    {
        if (sourceBox.selectedLine)
            sourceBox.selectedLine.removeAttribute(this.highlightingAttribute);
    },

    highlightLine: function(lineNumber, context)
    {
        var panel = this;
        return function exeHighlightFactory(sourceBox)
        {
            panel.removeExeLineHighlight(sourceBox);

            var lineNode = sourceBox.getLineNode(lineNumber);  // we close over lineNumber
            sourceBox.selectedLine = lineNode;  // if null, clears

            if (sourceBox.selectedLine)
            {
                lineNode.setAttribute(panel.highlightingAttribute, "true");
                if (context.breakingCause && !context.breakingCause.shown)
                {
                    context.breakingCause.shown = true;
                    var cause = context.breakingCause;
                    if (cause && Firebug.showBreakNotification)
                    {
                        var box = new Firebug.Breakpoint.BreakNotification(panel.document, cause);
                        box.show(panel.panelNode);
                        sourceBox.breakCauseBox = box;
                    }
                }
            }

            if (FBTrace.DBG_BP || FBTrace.DBG_STACK || FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("sourceBox.highlightLine lineNo: "+lineNumber+
                    " sourceBox.selectedLine="+sourceBox.selectedLine+" in "+sourceBox.repObject.getURL());

            return sourceBox.selectedLine; // sticky if we have a valid line
        };
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

         this.scrollToLine(url, lineNo, this.highlightLine(lineNo, this.context));
         this.context.throttle(this.updateInfoTip, this);
         return;
    },

    showNoStackFrame: function()
    {
        if (this.selectedSourceBox)
        {
            this.removeExeLineHighlight(this.selectedSourceBox);

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

        if(!lineNode)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("script.toggleBreakpoint no lineNode at "+lineNo+" in selectedSourceBox with URL "+href, this.selectedSourceBox);
            return;
        }

        if (FBTrace.DBG_BP)
            FBTrace.sysout("script.toggleBreakpoint lineNo="+lineNo+
                " lineNode.breakpoint:"+(lineNode?lineNode.getAttribute("breakpoint"):"(no lineNode)"),
                 this.selectedSourceBox);

        if (lineNode.getAttribute("breakpoint") == "true")
            ToolsInterface.JavaScript.clearBreakpoint(this.context, href, lineNo);
        else
            ToolsInterface.JavaScript.setBreakpoint(this.context, href, lineNo);
    },

    toggleDisableBreakpoint: function(lineNo)
    {
        var href = this.getSourceBoxURL(this.selectedSourceBox);

        var lineNode = this.selectedSourceBox.getLineNode(lineNo);
        if (lineNode.getAttribute("disabledBreakpoint") == "true")
            ToolsInterface.JavaScript.enableBreakpoint(this.context, href, lineNo);
        else
            ToolsInterface.JavaScript.disableBreakpoint(this.context, href, lineNo);
    },

    editBreakpointCondition: function(lineNo)
    {
        var sourceRow = this.selectedSourceBox.getLineNode(lineNo);
        var sourceLine = getChildByClass(sourceRow, "sourceLine");
        var condition = ToolsInterface.JavaScript.getBreakpointCondition(this.context, this.location.href, lineNo);

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
            ToolsInterface.JavaScript.runUntil(this.context, compilationUnit, lineNo);
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
        var searchBox = Firebug.chrome.$("fbSearchBox");
        searchBox.placeholder = $STR("Use hash plus number to go to line");
    },

    onKeyPress: function(event)
    {
        var ch = String.fromCharCode(event.charCode);
        var searchBox = Firebug.chrome.$("fbSearchBox");

        if (ch == "l" && isControl(event))
        {
            searchBox.value = "#";
            searchBox.focus();

            cancelEvent(event);
        }
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
        this.onKeyPress = bind(this.onKeyPress, this);

        this.panelSplitter = $("fbPanelSplitter");
        this.sidePanelDeck = $("fbSidePanelDeck");

        Firebug.SourceBoxPanel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        delete this.selection; // We want the location (compilationUnit) to persist, not the selection (eg stackFrame).
        persistObjects(this, state);

        if (this.location instanceof CompilationUnit)
        {
             state.location = this.location;
        }
        else
        {
            if (FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("script.destroy had location not a CompilationUnit ", this.location);
        }

        var sourceBox = this.selectedSourceBox;
        if (sourceBox)
        {
            state.previousCenterLine = sourceBox.centerLine;
            delete this.selectedSourceBox;
        }
        ToolsInterface.browser.removeListener(this);
        Firebug.SourceBoxPanel.destroy.apply(this, arguments);
    },

    detach: function(oldChrome, newChrome)
    {
        if (this.selectedSourceBox)
            this.lastSourceScrollTop = this.selectedSourceBox.scrollTop;

        if (this.context.stopped)
        {
            this.detachListeners(this.context, oldChrome);
            this.attachListeners(this.context, newChrome);
        }

        this.syncCommands(this.context);

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
        var jsEnabled = Firebug.Options.getPref("javascript", "enabled");
        if (this.context.activitySuspended && !this.context.stopped)
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
        else if (!Firebug.jsDebuggerOn)  // set asynchronously by jsd in FF 4.0
            this.activeWarningTag = WarningRep.showDebuggerInactive(this.panelNode);
        else if (!aLocation) // they were not filtered, we just had none
            this.activeWarningTag = WarningRep.showNoScript(this.panelNode);
        else
            return false;

        return true;
    },

    show: function(state)
    {
        var enabled = this.isEnabled();
        if (!enabled)
            return;

        var active = !this.showWarning();

        if (active)
        {
            this.panelNode.ownerDocument.addEventListener("keypress", this.onKeyPress, true);
            this.resizeEventTarget.addEventListener("resize", this.onResize, true);

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
                        this.updateSourceBox(this.selectedSourceBox);
                }

                if (state && this.location)  // then we are restoring and we have a location, so scroll when we can
                {
                    var sourceLink = new FBL.SourceLink(this.location.getURL(), state.previousCenterLine, 'js');
                    this.showSourceLink(sourceLink);
                }
            }
            else // show default
            {
                this.navigate(this.location);
            }

            this.highlight(this.context.stopped);

            var breakpointPanel = this.context.getPanel("breakpoints", true);
            if (breakpointPanel)
                breakpointPanel.refresh();

            this.syncCommands(this.context);
            this.ableWatchSidePanel(this.context);
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

        this.panelNode.ownerDocument.removeEventListener("keypress", this.onKeyPress, true);
        this.resizeEventTarget.removeEventListener("resize", this.onResize, true);

        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("script panel HIDE removed onResize eventhandler");

        var panelStatus = Firebug.chrome.getPanelStatusElements();
        FBL.hide(panelStatus, false);

        delete this.infoTipExpr;
    },

    ableWatchSidePanel: function(context)
    {
        // TODO if (commandline is not active, then we should not show the new watch feature)
        var watchPanel = context.getPanel("watches", true);
        if (watchPanel)
            return watchPanel;
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
                this.scrollToLine(sourceBox.repObject.getURL(), lineNo,  this.jumpHighlightFactory(lineNo, this.context))
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
            this.scrollToLine(sourceBox.repObject.getURL(), lineNo, this.jumpHighlightFactory(lineNo+1, this.context));
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
                       FBTrace.sysout("script.refresh deleted sourceBox for "+url);
                }
            }
        }

        if (!this.selectedSourceBox)  // then show() has not run,
            this.navigate();          // but we have to refresh, so do the default.
    },

    updateLocation: function(compilationUnit)
    {
        if (!compilationUnit)
            return;  // XXXjjb do we need to show a blank?
        if ( !(compilationUnit instanceof CompilationUnit) )
            throw new Error("Script panel location not a CompilationUnit: "+compilationUnit);

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
            this.show(); // we are not passing state so I guess we could miss a restore
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
            if (FBTrace.DBG_COMPILATION_UNITS) FBTrace.sysout("script getLocationList "+context.getName()+" allSources", allSources);
            return allSources;
        }

        var filter = Firebug.Options.get("scriptsFilter");
        this.showEvents = (filter == "all" || filter == "events");
        this.showEvals = (filter == "all" || filter == "evals");

        var list = [];
        for (var i = 0; i < allSources.length; i++)
        {
            if (this.showThisCompilationUnit(allSources[i]))
                list.push(allSources[i]);
            else if (FBTrace.DBG_COMPILATION_UNITS)
                FBTrace.sysout("scrpt.getLocationList filtered "+allSources[i].getURL(), allSources[i]);
        }

        if (!list.length && allSources.length)
            this.context.allScriptsWereFiltered = true;
        else
            delete this.context.allScriptsWereFiltered;

        if (FBTrace.DBG_COMPILATION_UNITS)
            FBTrace.sysout("script.getLocationList enabledOnLoad:"+context.onLoadWindowContent+" all:"+allSources.length+" filtered:"+list.length+" allFiltered: "+this.context.allScriptsWereFiltered, list);
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
                if (url == compilationUnits[i].getURL())
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
        var scripts = findScripts(this.context, this.location.getURL(), lineNo);
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
            FBTrace.sysout("script.getObjectPath "+frame, frame);

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
            optionMenu("ShowAllSourceFiles", "showAllSourceFiles"),
            // 1.2: always check last line; optionMenu("UseLastLineForEvalName", "useLastLineForEvalName"),
            // 1.2: always use MD5 optionMenu("UseMD5ForEvalName", "useMD5ForEvalName")
            optionMenu("TrackThrowCatch", "trackThrowCatch"),
            //"-",
            //1.2 option on toolbar this.optionMenu("DebuggerEnableAlways", enableAlwaysPref)
            optionMenu("firebug.breakpoint.showBreakNotifications", "showBreakNotification")
        ];
    },

    optionMenu: function(label, option)
    {
        var checked = Firebug.Options.get(option);
        return {label: label, type: "checkbox", checked: checked,
            command: bindFixed(Firebug.Options.set, Firebug, option, !checked) };
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
            var isDisabled = this.context.isBreakpointDisabled(this.location.href, lineNo);
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

                var debuggr = this;
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
        return this.breakable && Firebug.jsDebuggerOn;
    },

    breakOnNext: function(enabled)
    {
        if (enabled)
            ToolsInterface.JavaScript.breakOnNext(this.context, true);
        else
            ToolsInterface.JavaScript.breakOnNext(this.context, false);
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
    },

    // implements Tool
    onActiveTool: function(isActive)
    {
        this.onJavaScriptDebugging(isActive, "onActiveTool");
    },

    // **********************************************************************************
    // Toolbar functions

    attachListeners: function(context, chrome)
    {
        this.keyListeners =
            [
                chrome.keyCodeListen("F8", null, bind(this.resume, this, context), true),
                chrome.keyListen("/", isControl, bind(this.resume, this, context)),
                chrome.keyCodeListen("F10", null, bind(this.stepOver, this, context), true),
                chrome.keyListen("'", isControl, bind(this.stepOver, this, context)),
                chrome.keyCodeListen("F11", null, bind(this.stepInto, this, context)),
                chrome.keyListen(";", isControl, bind(this.stepInto, this, context)),
                chrome.keyCodeListen("F11", isShift, bind(this.stepOut, this, context)),
                chrome.keyListen(",", isControlShift, bind(this.stepOut, this, context))
            ];
        },

    detachListeners: function(context, chrome)
    {
        if (this.keyListeners)
        {
            for (var i = 0; i < this.keyListeners.length; ++i)
                chrome.keyIgnore(this.keyListeners[i]);
            delete this.keyListeners;
        }
    },

    syncListeners: function(context)
    {
        var chrome = Firebug.chrome;

        if (context.stopped)
            this.attachListeners(context, chrome);
        else
            this.detachListeners(context, chrome);
    },

    syncCommands: function(context)
    {
        var chrome = Firebug.chrome;
        if (!chrome)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("debugger.syncCommand, context with no chrome: "+context.getGlobalScope());
            return;
        }

        if (context.stopped)
        {
            chrome.setGlobalAttribute("fbDebuggerButtons", "stopped", "true");
            chrome.setGlobalAttribute("cmd_rerun", "disabled", "false");
            chrome.setGlobalAttribute("cmd_resumeExecution", "disabled", "false");
            chrome.setGlobalAttribute("cmd_stepOver", "disabled", "false");
            chrome.setGlobalAttribute("cmd_stepInto", "disabled", "false");
            chrome.setGlobalAttribute("cmd_stepOut", "disabled", "false");
        }
        else
        {
            chrome.setGlobalAttribute("fbDebuggerButtons", "stopped", "false");
            chrome.setGlobalAttribute("cmd_rerun", "disabled", "true");
            chrome.setGlobalAttribute("cmd_stepOver", "disabled", "true");
            chrome.setGlobalAttribute("cmd_stepInto", "disabled", "true");
            chrome.setGlobalAttribute("cmd_stepOut", "disabled", "true");
            chrome.setGlobalAttribute("cmd_resumeExecution", "disabled", "true");
        }
    },

    resume: function(context)
    {
        ToolsInterface.JavaScript.resumeJavaScript(context);
    },

    stepOver: function(context)
    {
        ToolsInterface.JavaScript.stepOver(context);
    },

    stepInto: function(context)
    {
        ToolsInterface.JavaScript.stepInto(context);
    },

    stepOut: function(context)
    {
        ToolsInterface.JavaScript.stepOut(context);
    },

    onStartDebugging: function(frame)
    {
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("script.startDebugging enter context: "+this.context.getName()+"\n");

        try
        {
            var currentBreakable = Firebug.chrome.getGlobalAttribute("cmd_breakOnNext", "breakable");

            if (FBTrace.DBG_BP)
                FBTrace.sysout("debugger.startDebugging; currentBreakable "+currentBreakable+
                    " in " + this.context.getName()+" currentContext "+Firebug.currentContext.getName());

            if (currentBreakable == "false") // then we are armed but we broke
                Firebug.chrome.setGlobalAttribute("cmd_breakOnNext", "breakable", "true");

            if (Firebug.isMinimized()) // then open the UI to show we are stopped
                Firebug.unMinimize();

            this.syncCommands(this.context);
            this.syncListeners(this.context);

            // Update Break on Next lightning.
            Firebug.Breakpoint.updatePanelTab(this, false);
            this.context.stoppedFrameXB = frame;
            Firebug.chrome.select(frame, "script", null, true);
            Firebug.chrome.syncPanel("script");  // issue 3463 and 4213
            Firebug.chrome.focus();
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Resuming debugger: error during debugging loop: "+exc, exc);
            Firebug.Console.log("Resuming debugger: error during debugging loop: "+exc);
            this.resume(this.context);
        }

        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("script.onStartDebugging exit context.stopped:"+this.context.stopped+" for context: "+
                this.context.getName()+"\n");
    },

    onStopDebugging: function()
    {
        if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("script.onStopDebugging enter context: "+this.context.getName()+"\n");
        try
        {
                var chrome = Firebug.chrome;

                if (this.selectedSourceBox && this.selectedSourceBox.breakCauseBox)
                {
                    this.selectedSourceBox.breakCauseBox.hide();
                    delete this.selectedSourceBox.breakCauseBox;
                }

                this.syncCommands(this.context);
                this.syncListeners(this.context);
                this.highlight(false);

                chrome.syncSidePanels();  // after main panel is all updated.
        }
        catch (exc)
        {
            if (FBTrace.DBG_UI_LOOP) FBTrace.sysout("debugger.stopDebugging FAILS", exc);
            // If the window is closed while the debugger is stopped,
            // then all hell will break loose here
            ERROR(exc);
        }
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
        Firebug.Options.setPref("javascript", "enabled", true);

        Firebug.TabWatcher.reloadPageFromMemory(this.context);
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
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("script.onFocusDebugger FAILED");
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
            bindFixed(Firebug.TabWatcher.reloadPageFromMemory,  Firebug.TabWatcher, Firebug.currentContext));

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
