/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/firefox",
    "firebug/chrome/reps",
    "firebug/lib/domplate",
    "arch/javascripttool",
    "arch/compilationunit",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/url",
    "firebug/js/sourceLink",
    "firebug/js/stackFrame",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/chrome/window",
    "firebug/lib/search",
    "firebug/lib/persist",
    "firebug/lib/system",
    "firebug/chrome/menu",
    "firebug/trace/debug",
    "firebug/lib/keywords",
    "firebug/chrome/panelNotification",
    "firebug/lib/options",
    "firebug/editor/editorSelector",
    "firebug/chrome/infotip",
    "firebug/chrome/searchBox",
    "firebug/js/sourceBox",
    "firebug/js/watchPanel",
],
function (Obj, Firebug, Firefox, FirebugReps, Domplate, JavaScriptTool, CompilationUnit,
    Locale, Events, Url, SourceLink, StackFrame, Css, Dom, Win, Search, Persist,
    System, Menu, Debug, Keywords, PanelNotification, Options) {

// ********************************************************************************************* //
// Script panel

Firebug.ScriptPanel = function() {};

for (var p in Firebug.EditorSelector)
{
    if (Firebug.EditorSelector.hasOwnProperty(p))
        Firebug.ScriptPanel[p] = Firebug.EditorSelector[p];
}

Firebug.ScriptPanel.getEditorOptionKey = function()
{
    return "JSEditor";
};

Firebug.ScriptPanel.reLineNumber = /^[^\\]?#(\d*)$/;

/**
 * object used to markup JavaScript source lines.
 * In the namespace Firebug.ScriptPanel.
 */
Firebug.ScriptPanel.decorator = Obj.extend(new Firebug.SourceBoxDecorator,
{
    decorate: function(sourceBox, unused)
    {
        this.markExecutableLines(sourceBox);
        this.setLineBreakpoints(sourceBox.repObject, sourceBox);
    },

    markExecutableLines: function(sourceBox)
    {
        var compilationUnit = sourceBox.repObject;
        if (FBTrace.DBG_BP || FBTrace.DBG_LINETABLE)
            FBTrace.sysout("script.markExecutableLines START: "+compilationUnit.toString());

        var lineNode;
        var lineNo = sourceBox.firstViewableLine;
        while (lineNode = sourceBox.getLineNode(lineNo))
        {
            if (lineNode.alreadyMarked)
            {
                lineNo++;
                continue;
            }

            var script = compilationUnit.isExecutableLine(lineNo);

            if (FBTrace.DBG_LINETABLE)
                FBTrace.sysout("script.markExecutableLines [" + lineNo + "]=" + script);

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
            FBTrace.sysout("script.markExecutableLines DONE: " + compilationUnit.toString());
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
                {
                    scriptRow.setAttribute("condition", "true");
                    scriptRow.breakpointCondition = props.condition;
                }
            }

            if (FBTrace.DBG_LINETABLE)
            {
                FBTrace.sysout("script.setLineBreakpoints found " + scriptRow + " for " + line +
                    "@" + compilationUnit.getURL(), props);
            }
        });
    },
});

// ********************************************************************************************* //

Firebug.ScriptPanel.prototype = Obj.extend(Firebug.SourceBoxPanel,
{
    dispatchName: "scriptPanel",

    /**
     * Framework connection
     */
    updateSourceBox: function(sourceBox)
    {
        this.location = sourceBox.repObject;

        this.onUpdateSourceBox(sourceBox);
    },

    /**
     * Framework connection
     */
    getSourceType: function()
    {
        return "js";
    },

    /**
     * Framework connection
     */
    getDecorator: function(sourceBox)
    {
        return Firebug.ScriptPanel.decorator;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // TODO Class method

    onJavaScriptDebugging: function(active)
    {
        // Front side state
        Firebug.jsDebuggerOn = active;

        // If this panel is selected, the change in JSD causes a refresh.
        // Note that onJavaScriptDebugging is called on the prototype.
        var selectedPanel = Firebug.chrome.getSelectedPanel();
        if (selectedPanel && Object.getPrototypeOf(selectedPanel) === this)
            Firebug.chrome.syncPanel(this.name);

        // Front side UI mark
        var firebugStatus = Firefox.getElementById("firebugStatus");
        if (firebugStatus)
        {
            // Use enabled state for the status flag. JSD can be active even if
            // the Script panel itself is deactivated (i.e. because the Console
            // panel is enabled). See issue 2582 for more details.
            var enabled = this.isEnabled();
            firebugStatus.setAttribute("script", (enabled && active) ? "on" : "off");
        }

        if (Firebug.StartButton)
            Firebug.StartButton.resetTooltip();
        else
            FBTrace.sysout("No Firebug.StartButton in onJavaScriptDebugging?");

        if (FBTrace.DBG_ACTIVATION)
        {
            FBTrace.sysout("script.onJavaScriptDebugging " + active + " icon attribute: " +
                Firefox.getElementById("firebugStatus").getAttribute("script"));
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    showFunction: function(fn)
    {
        var sourceLink = Firebug.SourceFile.findSourceForFunction(fn, this.context);
        if (sourceLink)
        {
            this.showSourceLink(sourceLink);
        }
        else
        {
            // Want to avoid the Script panel if possible
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("no sourcelink for function");
        }
    },

    showSourceLink: function(sourceLink, noHighlight)
    {
        var compilationUnit = this.context.getCompilationUnit(sourceLink.href);
        if (compilationUnit)
        {
            this.navigate(compilationUnit);
            if (sourceLink.line)
            {
                var highlighter = noHighlight ? null :
                    this.jumpHighlightFactory(sourceLink.line, this.context);

                this.scrollToLine(sourceLink.href, sourceLink.line, highlighter);

                Events.dispatch(this.fbListeners, "onShowSourceLink", [this, sourceLink.line]);
            }

            // If the source link is selected, clear it so the next link will scroll and highlight.
            if (sourceLink == this.selection)
                this.selection = null;
        }
    },

    /**
     * Some source files (compilation units) can be loaded asynchronously (e.g. when using
     * RequireJS). If this case happens, this method tries it again after a short timeout.
     *
     * @param {Object} sourceLink  Link to the script and line to be displayed.
     * @param {Boolean} noHighlight Do not highlight the line
     * @param {Number} counter  Number of async attempts.
     */
    showSourceLinkAsync: function(sourceLink, noHighlight, counter)
    {
        var compilationUnit = this.context.getCompilationUnit(sourceLink.href);
        if (compilationUnit)
        {
            this.showSourceLink(sourceLink, noHighlight);
        }
        else
        {
            if (typeof(counter) == "undefined")
                counter = 15;

            // Stop trying. The target script is probably not going to appear.
            if (counter < 0)
                return;

            var self = this;
            this.context.setTimeout(function()
            {
                // If JS execution is stopped at a breakpoint, do not restore the previous
                // location. The user wants to see the breakpoint now.
                if (!self.context.stopped)
                    self.showSourceLinkAsync(sourceLink, noHighlight, --counter);
            }, 50);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    highlightingAttribute: "exe_line",

    removeExeLineHighlight: function(sourceBox)
    {
        if (sourceBox.selectedLine)
        {
            sourceBox.selectedLine.removeAttribute(this.highlightingAttribute);

            // Make sure the highlighter for the selected line is removed, too (issue 4359).
            sourceBox.highlighter = null;
        }
    },

    highlightLine: function(lineNumber, context)
    {
        var panel = this;
        return function exeHighlightFactory(sourceBox)
        {
            panel.removeExeLineHighlight(sourceBox);

            // We close over lineNumber
            var lineNode = sourceBox.getLineNode(lineNumber);
            // If null, clears
            sourceBox.selectedLine = lineNode;

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
            {
                FBTrace.sysout("sourceBox.highlightLine lineNo: "+lineNumber+
                    " sourceBox.selectedLine="+sourceBox.selectedLine+" in "+
                    sourceBox.repObject.getURL());
            }

            // Sticky, if we have a valid line
            return sourceBox.selectedLine;
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
        // Make sure the current frame seen by the user is set (issue 4818)
        // xxxHonza: Better solution (important for remoting)
        // Set this.context.currentFrame = frame (meaning frameXB) and pass the value of
        // frameXB during evaluation calls, causing the backend to select the appropriate
        // frame for frame.eval().
        this.context.currentFrame = frame.nativeFrame;

        var url = frame.getURL();
        var lineNo = frame.getLineNumber();

        if (FBTrace.DBG_STACK)
            FBTrace.sysout("showStackFrame: "+url+"@"+lineNo+"\n");

        if (this.context.breakingCause)
            this.context.breakingCause.lineNo = lineNo;

        this.scrollToLine(url, lineNo, this.highlightLine(lineNo, this.context));
        this.context.throttle(this.updateInfoTip, this);
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
        // Clear the stack on the panel toolbar
        panelStatus.clear();
        this.updateInfoTip();

        var watchPanel = this.context.getPanel("watches", true);
        if (watchPanel)
            watchPanel.showEmptyMembers();
    },

    toggleBreakpoint: function(lineNo)
    {
        var href = this.getSourceBoxURL(this.selectedSourceBox);
        var lineNode = this.selectedSourceBox.getLineNode(lineNo);

        if (!lineNode)
        {
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("script.toggleBreakpoint no lineNode at " + lineNo +
                    " in selectedSourceBox with URL " + href, this.selectedSourceBox);
            }

            return;
        }

        if (FBTrace.DBG_BP)
        {
            FBTrace.sysout("script.toggleBreakpoint lineNo=" + lineNo + " lineNode.breakpoint:" +
                (lineNode ? lineNode.getAttribute("breakpoint") : "(no lineNode)"),
                this.selectedSourceBox);
        }

        if (lineNode.getAttribute("breakpoint") == "true")
            JavaScriptTool.clearBreakpoint(this.context, href, lineNo);
        else
            JavaScriptTool.setBreakpoint(this.context, href, lineNo);
    },

    toggleDisableBreakpoint: function(lineNo)
    {
        var href = this.getSourceBoxURL(this.selectedSourceBox);

        var lineNode = this.selectedSourceBox.getLineNode(lineNo);
        if (lineNode.getAttribute("disabledBreakpoint") == "true")
        {
            JavaScriptTool.enableBreakpoint(this.context, href, lineNo);
        }
        else
        {
            if (lineNode.getAttribute("breakpoint") != "true")
                JavaScriptTool.setBreakpoint(this.context, href, lineNo);

            JavaScriptTool.disableBreakpoint(this.context, href, lineNo);
        }
    },

    editBreakpointCondition: function(lineNo)
    {
        var sourceRow = this.selectedSourceBox.getLineNode(lineNo);
        var sourceLine = Dom.getChildByClass(sourceRow, "sourceLine");
        var condition = JavaScriptTool.getBreakpointCondition(this.context,
            this.location.getURL(), lineNo);

        if (condition)
        {
            var watchPanel = this.context.getPanel("watches", true);
            watchPanel.removeWatch(condition);
            watchPanel.rebuild();
        }

        Firebug.Editor.startEditing(sourceLine, condition);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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
        System.copyToClipboard(source);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Info Tips

    updateInfoTip: function()
    {
        var infoTip = this.panelBrowser.infoTip;
        if (infoTip && this.infoTipExpr)
            this.populateInfoTip(infoTip, this.infoTipExpr);
    },

    showInfoTip: function(infoTip, target, x, y, rangeParent, rangeOffset)
    {
        var sourceLine = Dom.getAncestorByClass(target, "sourceLine");
        if (sourceLine)
            return this.populateBreakpointInfoTip(infoTip, sourceLine);

        var frame = this.context.currentFrame;
        if (!frame)
            return;

        var sourceRowText = Dom.getAncestorByClass(target, "sourceRowText");
        if (!sourceRowText)
            return;

        // See http://code.google.com/p/fbug/issues/detail?id=889
        // Idea from: Jonathan Zarate's rikaichan extension (http://www.polarcloud.com/rikaichan/)
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

    populateInfoTip: function(infoTip, expr)
    {
        if (!expr || Keywords.isJavaScriptKeyword(expr))
            return false;

        var self = this;

        // If the evaluate fails, then we report an error and don't show the infotip
        Firebug.CommandLine.evaluate(expr, this.context, null, this.context.getCurrentGlobal(),
            function success(result, context)
            {
                var rep = Firebug.getRep(result, context);
                var tag = rep.shortTag ? rep.shortTag : rep.tag;

                if (FBTrace.DBG_STACK)
                    FBTrace.sysout("populateInfoTip result is "+result, result);

                tag.replace({object: result}, infoTip);

                // If the menu is never displayed, the contextMenuObject is not reset
                // (back to null) and is reused at the next time the user opens the
                // context menu, which is wrong.
                // This line was appended when fixing:
                // http://code.google.com/p/fbug/issues/detail?id=1700
                // The object should be returned by getPopupObject(),
                // that is called when the context menu is showing.
                // The problem is, that the "onContextShowing" event doesn't have the
                // rangeParent field set and so it isn't possible to get the
                // expression under the cursor (see getExpressionAt).
                //Firebug.chrome.contextMenuObject = result;

                self.infoTipExpr = expr;
            },
            function failed(result, context)
            {
                self.infoTipExpr = "";
            }
        );
        return (self.infoTipExpr == expr);
    },

    populateBreakpointInfoTip: function(infoTip, sourceLine)
    {
        var sourceRow = Dom.getAncestorByClass(sourceLine, "sourceRow");
        var condition = sourceRow.getAttribute("condition");
        if (!condition)
            return false;

        var expr = sourceRow.breakpointCondition;
        if (!expr)
            return false;

        if (expr == this.infoTipExpr)
            return true;

        Firebug.ScriptPanel.BreakpointInfoTip.render(infoTip, expr);

        this.infoTipExpr = expr;

        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // UI event listeners

    onMouseDown: function(event)
    {
        // Don't interfere with clicks made into a notification editor.
        if (Dom.getAncestorByClass(event.target, "breakNotification"))
            return;

        var sourceLine = Dom.getAncestorByClass(event.target, "sourceLine");
        if (!sourceLine)
            return;

        var compilationUnit = Dom.getAncestorByClass(sourceLine, "sourceBox").repObject;
        var lineNo = parseInt(sourceLine.textContent);

        if (Events.isLeftClick(event))
        {
            this.toggleBreakpoint(lineNo);
        }
        else if (Events.isShiftClick(event))
        {
            this.toggleDisableBreakpoint(lineNo);
        }
        else if (Events.isControlClick(event) || Events.isMiddleClick(event))
        {
            JavaScriptTool.runUntil(compilationUnit, lineNo);
            Events.cancelEvent(event);
        }
    },

    onContextMenu: function(event)
    {
        var sourceLine = Dom.getAncestorByClass(event.target, "sourceLine");
        if (!sourceLine)
            return;

        var lineNo = parseInt(sourceLine.textContent);
        this.editBreakpointCondition(lineNo);
        Events.cancelEvent(event);
    },

    onMouseOver: function(event)
    {
        var sourceLine = Dom.getAncestorByClass(event.target, "sourceLine");
        if (sourceLine)
        {
            if (this.hoveredLine)
                Css.removeClass(this.hoveredLine.parentNode, "hovered");

            this.hoveredLine = sourceLine;

            if (Dom.getAncestorByClass(sourceLine, "sourceViewport"))
                Css.setClass(sourceLine.parentNode, "hovered");
        }
    },

    onMouseOut: function(event)
    {
        var sourceLine = Dom.getAncestorByClass(event.relatedTarget, "sourceLine");
        if (!sourceLine)
        {
            if (this.hoveredLine)
                Css.removeClass(this.hoveredLine.parentNode, "hovered");

            delete this.hoveredLine;
        }
    },

    onScroll: function(event)
    {
        var scrollingElement = event.target;
        this.reView(scrollingElement);
        var searchBox = Firebug.chrome.$("fbSearchBox");
        searchBox.placeholder = Locale.$STR("Use hash plus number to go to line");
    },

    onKeyPress: function(event)
    {
        var ch = String.fromCharCode(event.charCode);

        if (ch == "l" && Events.isControl(event))
        {
            var searchBox = Firebug.chrome.$("fbSearchBox");
            searchBox.value = "#";
            searchBox.focus();

            Events.cancelEvent(event);
        }

        if (ch == "w" && Events.isAlt(event))
        {
            this.addSelectionWatch();
            Events.cancelEvent(event);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "script",
    searchable: true,
    breakable: true,
    enableA11y: true,
    order: 40,

    initialize: function(context, doc)
    {
        this.location = null;

        this.onMouseDown = Obj.bind(this.onMouseDown, this);
        this.onContextMenu = Obj.bind(this.onContextMenu, this);
        this.onMouseOver = Obj.bind(this.onMouseOver, this);
        this.onMouseOut = Obj.bind(this.onMouseOut, this);
        this.onScroll = Obj.bind(this.onScroll, this);
        this.onKeyPress = Obj.bind(this.onKeyPress, this);

        this.panelSplitter = Firebug.chrome.$("fbPanelSplitter");
        this.sidePanelDeck = Firebug.chrome.$("fbSidePanelDeck");

        Firebug.SourceBoxPanel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        // We want the location (compilationUnit) to persist, not the selection (eg stackFrame).
        this.selection = null;

        var sourceBox = this.selectedSourceBox;
        if (sourceBox)
        {
            if (sourceBox.centralLine)
                state.previousCentralLine = sourceBox.centralLine;
            else
                state.scrollTop = sourceBox.scrollTop ? sourceBox.scrollTop : this.lastScrollTop;

            delete this.selectedSourceBox;
        }

        Persist.persistObjects(this, state);

        if (this.location instanceof CompilationUnit)
        {
             state.location = this.location;
        }
        else
        {
            if (FBTrace.DBG_COMPILATION_UNITS)
            {
                FBTrace.sysout("script.destroy had location not a CompilationUnit ",
                    this.location);
            }
        }

        // xxxHonza: why this is here? I don't see addListener.
        //Firebug.connection.removeListener(this);

        // Make sure listeners are removed.
        this.detachListeners(this.context, Firebug.chrome);

        Firebug.SourceBoxPanel.destroy.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        // xxxHonza: is this tooltip still used?
        this.tooltip = this.document.createElement("div");
        Css.setClass(this.tooltip, "scriptTooltip");
        this.tooltip.setAttribute("aria-live", "polite");
        Css.obscure(this.tooltip, true);
        this.panelNode.appendChild(this.tooltip);

        this.initializeNotificationBox();

        Events.addEventListener(this.panelNode, "mousedown", this.onMouseDown, true);
        Events.addEventListener(this.panelNode, "contextmenu", this.onContextMenu, false);
        Events.addEventListener(this.panelNode, "mouseover", this.onMouseOver, false);
        Events.addEventListener(this.panelNode, "mouseout", this.onMouseOut, false);
        Events.addEventListener(this.panelNode, "scroll", this.onScroll, true);

        Firebug.SourceBoxPanel.initializeNode.apply(this, arguments);
    },

    initializeNotificationBox: function()
    {
        var box = this.panelNode.getElementsByClassName("panelNotificationBox");
        if (box.length > 0)
            return;

        var prefName = Options.prefDomain + ".cache.responseLimit";
        var config = {
            message: Locale.$STR("script.SourceLimited"),
            prefName: prefName,
            buttonTooltip: Locale.$STRF("LimitPrefsTitle", [prefName])
        };

        // Render panel notification box (hidden by default).
        this.notificationBox = PanelNotification.render(this.panelNode, config);
        Css.setClass(this.notificationBox, "panelNotificationBox collapsed");
    },

    destroyNode: function()
    {
        if (this.tooltipTimeout)
            clearTimeout(this.tooltipTimeout);

        Events.removeEventListener(this.panelNode, "mousedown", this.onMouseDown, true);
        Events.removeEventListener(this.panelNode, "contextmenu", this.onContextMenu, false);
        Events.removeEventListener(this.panelNode, "mouseover", this.onMouseOver, false);
        Events.removeEventListener(this.panelNode, "mouseout", this.onMouseOut, false);
        Events.removeEventListener(this.panelNode, "scroll", this.onScroll, true);

        Firebug.SourceBoxPanel.destroyNode.apply(this, arguments);
    },

    clear: function()
    {
        Dom.clearNode(this.panelNode);
    },

    showWarning: function()
    {
        // Fill the panel node with a warning if needed
        var aLocation = this.getDefaultLocation();
        var jsEnabled = Options.getPref("javascript", "enabled");

        if (FBTrace.DBG_PANELS)
        {
            FBTrace.sysout("script.showWarning; " + this.context.getName(), {
                jsDebuggerOn: Firebug.jsDebuggerOn,
                jsDebuggerCalledUs: this.context.jsDebuggerCalledUs,
                jsEnabled: jsEnabled,
                aLocation: aLocation,
                activitySuspended: this.context.activitySuspended,
                stopped: this.context.stopped
            });
        }

        var currentURI = Firefox.getCurrentURI();
        var activitySuspended = this.isActivitySuspended();
        if (activitySuspended && !this.context.stopped)
        {
            // Make sure that the content of the panel is restored as soon as
            // the debugger is resumed.
            this.restored = false;
            this.activeWarningTag = WarningRep.showActivitySuspended(this.panelNode);
        }
        else if (!jsEnabled)
        {
            this.activeWarningTag = WarningRep.showNotEnabled(this.panelNode);
        }
        else if (currentURI && (Url.isSystemURL(currentURI.spec) ||
            currentURI.spec.match(Url.reChrome)))
        {
            this.activeWarningTag = WarningRep.showNoDebuggingForSystemSources(this.panelNode);
        }
        else if (this.context.allScriptsWereFiltered)
        {
            this.activeWarningTag = WarningRep.showFiltered(this.panelNode);
        }
        else if (aLocation && !this.context.jsDebuggerCalledUs)
        {
            this.activeWarningTag = WarningRep.showInactive(this.panelNode);
        }
        else if (!Firebug.jsDebuggerOn)  // set asynchronously by jsd in FF 4.0
        {
            this.activeWarningTag = WarningRep.showDebuggerInactive(this.panelNode);
        }
        else if (!aLocation) // they were not filtered, we just had none
        {
            this.activeWarningTag = WarningRep.showNoScript(this.panelNode);
        }
        else
        {
            return false;
        }

        return true;
    },

    isActivitySuspended: function()
    {
        return Win.iterateBrowserWindows("navigator:browser", function(win)
        {
            // Firebug doesn't have to be loaded in every browser window (see delayed load).
            if (!win.Firebug.TabWatcher)
                return false;

            return win.Firebug.TabWatcher.iterateContexts(function(context)
            {
                if (context.stopped)
                     return true;
            });
        });
    },

    show: function(state)
    {
        var enabled = this.isEnabled();
        if (!enabled)
            return;

        var active = !this.showWarning();
        if (active)
        {
            // The box might have been removed by the warning message.
            this.initializeNotificationBox();

            Events.addEventListener(this.panelNode.ownerDocument, "keypress", this.onKeyPress, true);
            Events.addEventListener(this.resizeEventTarget, "resize", this.onResize, true);

            this.location = this.getDefaultLocation();

            if (this.context.loaded)
            {
                if (!this.restored)
                {
                    // remove the default location, if any
                    delete this.location;
                    Persist.restoreLocation(this, state);
                    this.restored = true;
                }
                else
                {
                    // we already restored
                    if (!this.selectedSourceBox)
                    {
                        // but somehow we did not make a sourcebox?
                        this.navigate(this.location);
                    }
                    else
                    {
                        // then we can sync the location to the sourcebox
                        this.updateSourceBox(this.selectedSourceBox);
                    }
                }

                if (state)
                {
                    if (state.location)
                    {
                        var sourceLink = new SourceLink.SourceLink(state.location.getURL(),
                            state.previousCentralLine, "js");

                        // Causes the Script panel to show the proper location.
                        // Do not highlight the line (second argument true), we just want
                        // to restore the position.
                        // Also do it asynchronously, the script doesn't have to be
                        // available immediately.
                        this.showSourceLinkAsync(sourceLink, true);

                        // Do not restore the location again, it could happen during
                        // the single stepping and overwrite the debugger location.
                        delete state.location;
                    }

                    if (state.scrollTop)
                    {
                        this.selectedSourceBox.scrollTop = state.scrollTop;
                    }
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

        Dom.collapse(Firebug.chrome.$("fbToolbar"), !active);

        // These buttons are visible only, if debugger is enabled.
        this.showToolbarButtons("fbLocationSeparator", active);
        this.showToolbarButtons("fbDebuggerButtons", active);
        this.showToolbarButtons("fbLocationButtons", active);
        this.showToolbarButtons("fbScriptButtons", active);
        this.showToolbarButtons("fbStatusButtons", active);
        this.showToolbarButtons("fbLocationList", active);

        Firebug.chrome.$("fbRerunButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut", [Locale.$STR("script.Rerun"),
                Locale.getFormattedKey(window, "shift", null, "VK_F8")]));
        Firebug.chrome.$("fbContinueButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut", [Locale.$STR("script.Continue"),
                Locale.getFormattedKey(window, null, null, "VK_F8")]));
        Firebug.chrome.$("fbStepIntoButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut", [Locale.$STR("script.Step_Into"),
                Locale.getFormattedKey(window, null, null, "VK_F11")]));
        Firebug.chrome.$("fbStepOverButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut", [Locale.$STR("script.Step_Over"),
                Locale.getFormattedKey(window, null, null, "VK_F10")]));
        Firebug.chrome.$("fbStepOutButton").setAttribute("tooltiptext",
            Locale.$STRF("firebug.labelWithShortcut", [Locale.$STR("script.Step_Out"),
                Locale.getFormattedKey(window, "shift", null, "VK_F11")]));

        // Additional debugger panels are visible only, if debugger is active.
        this.panelSplitter.collapsed = !active;
        this.sidePanelDeck.collapsed = !active;
    },

    hide: function(state)
    {
        if (this.selectedSourceBox)
            this.lastScrollTop = this.selectedSourceBox.scrollTop;

        this.highlight(this.context.stopped);

        Events.removeEventListener(this.panelNode.ownerDocument, "keypress", this.onKeyPress,
            true);
        Events.removeEventListener(this.resizeEventTarget, "resize", this.onResize, true);

        if (FBTrace.DBG_PANELS)
            FBTrace.sysout("script panel HIDE removed onResize eventhandler");

        var panelStatus = Firebug.chrome.getPanelStatusElements();
        Dom.hide(panelStatus, false);

        delete this.infoTipExpr;
    },

    onUpdateSourceBox: function(sourceBox)
    {
        var url = sourceBox.repObject.url;
        if (!url)
            return;

        var limited = this.context.sourceCache.isLimited(url);
        if (!limited)
            return;

        // Show the notification box, so the user knows the script content has
        // been limited in the cache.
        Css.removeClass(this.notificationBox, "collapsed");
        var view = this.notificationBox.ownerDocument.defaultView;
        var cs = view.getComputedStyle(this.notificationBox);
        this.selectedSourceBox.style.top = cs.height;
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

        // Check, if the search is for a line number
        var m = Firebug.ScriptPanel.reLineNumber.exec(text);
        if (m)
        {
            if (!m[1])
                return true; // Don't beep, if only a # has been typed

            var lineNo = parseInt(m[1]);
            if (!isNaN(lineNo) && (lineNo > 0) && (lineNo < sourceBox.lines.length) )
            {
                this.scrollToLine(sourceBox.repObject.getURL(), lineNo,
                    this.jumpHighlightFactory(lineNo, this.context));
                return true;
            }
        }

        var curDoc = this.searchCurrentDoc(!Firebug.searchGlobal, text, reverse);
        if (!curDoc && Firebug.searchGlobal)
        {
            return this.searchOtherDocs(text, reverse) ||
                this.searchCurrentDoc(true, text, reverse);
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

            // TODO The source lines arrive asynchronous in general
            compilationUnit.getSourceLines(-1, -1, function loadSource(unit, firstLineNumber,
                lastLineNumber, linesRead)
            {
                lines = linesRead;
            });

            if (!lines)
                return;

            // We don't care about reverse here as we are just looking for existence.
            // If we do have a result, we will handle the reverse logic on display.
            for (var i = 0; i < lines.length; i++)
            {
                if (scanRE.test(lines[i]))
                    return true;
            }
        }

        if (this.navigateToNextDocument(scanDoc, reverse))
            return this.searchCurrentDoc(true, text, reverse) && "wraparound";
    },

    searchCurrentDoc: function(wrapSearch, text, reverse)
    {
        var sourceBox = this.selectedSourceBox;

        var lineNo = null;
        if (this.currentSearch && text == this.currentSearch.text)
        {
            lineNo = this.currentSearch.findNext(wrapSearch, reverse,
                Firebug.Search.isCaseSensitive(text));
        }
        else
        {
            if (!this.currentSearch || !this.currentSearch.tryToContinueSearch(sourceBox, text))
                this.currentSearch = new Search.SourceBoxTextSearch(sourceBox);

            lineNo = this.currentSearch.find(text, reverse, Firebug.Search.isCaseSensitive(text));
        }

        if (lineNo || lineNo === 0)
        {
            // This lineNo is an zero-based index into sourceBox.lines.
            // Add one for user line numbers
            this.scrollToLine(sourceBox.repObject.getURL(), lineNo,
                this.jumpHighlightFactory(lineNo+1, this.context));

            Events.dispatch(this.fbListeners, "onScriptSearchMatchFound",
                [this, text, sourceBox.repObject, lineNo]);

            return this.currentSearch.wrapped ? "wraparound" : true;
        }
        else
        {
            Events.dispatch(this.fbListeners, "onScriptSearchMatchFound",
                [this, text, null, null]);

            return false;
        }
    },

    getSearchOptionsMenuItems: function()
    {
        return [
            Firebug.Search.searchOptionMenu("search.Case_Sensitive", "searchCaseSensitive",
                "search.tip.Case_Sensitive"),
            Firebug.Search.searchOptionMenu("search.Multiple_Files", "searchGlobal",
                "search.tip.Multiple_Files"),
            Firebug.Search.searchOptionMenu("search.Use_Regular_Expression",
                "searchUseRegularExpression", "search.tip.Use_Regular_Expression")
        ];
    },

    supportsObject: function(object, type)
    {
        if (object instanceof CompilationUnit
            || (object instanceof SourceLink.SourceLink && object.type == "js")
            || typeof(object) == "function"
            || object instanceof StackFrame.StackFrame)
        {
            return 1;
        }

        return 0;
    },

    // Delete any sourceBoxes that are not in sync with compilationUnits
    refresh: function()
    {
        var previousCentralLine;
        var previousUrl;

        for (var url in this.sourceBoxes)
        {
            if (this.sourceBoxes.hasOwnProperty(url))
            {
                var sourceBox = this.sourceBoxes[url];
                var compilationUnit = this.context.getCompilationUnit(url);

                // then out of sync
                if (!compilationUnit || compilationUnit != sourceBox.repObject)
                {
                    var victim = this.sourceBoxes[url];
                    delete this.sourceBoxes[url];
                    if (this.selectedSourceBox == victim)
                    {
                        previousCentralLine = this.selectedSourceBox.centralLine;
                        previousUrl = this.getSourceBoxURL(this.selectedSourceBox);

                        Dom.collapse(this.selectedSourceBox, true);
                        delete this.selectedSourceBox;
                    }

                    if (FBTrace.DBG_COMPILATION_UNITS)
                        FBTrace.sysout("script.refresh deleted sourceBox for " + url);
                }
            }
        }

        // If selectedSourceBox is undefined, then show() has not run,
        // but we have to refresh, so do the default.
        if (!this.selectedSourceBox)
        {
            // If the current source-box has been deleted because it's out of sync
            // (the victim, see above), we need to navigate again to the same URL.
            // Otherwise the script panel would coincidentally switch to another script.
            // (see issue 5134)
            var object;
            if (previousUrl)
                object = this.context.getCompilationUnit(previousUrl);

            this.navigate(object);

            // Restore the scroll position (issue 5111)
            if (this.selectedSourceBox)
            {
                var url = this.getSourceBoxURL(this.selectedSourceBox);
                if (this.selectedSourceBox && url == previousUrl)
                    this.scrollToLine(null, previousCentralLine);
            }
        }
    },

    updateLocation: function(compilationUnit)
    {
        // XXXjjb do we need to show a blank?
        if (!compilationUnit)
            return;

        if (!(compilationUnit instanceof CompilationUnit))
        {
            FBTrace.sysout("Script panel location not a CompilationUnit: ", compilationUnit);
            throw new Error("Script panel location not a CompilationUnit: " + compilationUnit);
        }

        // Since our last use of the compilationUnit we may have compiled or
        // recompiled the source
        var updatedCompilationUnit = this.context.getCompilationUnit(compilationUnit.getURL());
        if (!updatedCompilationUnit)
            updatedCompilationUnit = this.getDefaultLocation();

        if (!updatedCompilationUnit)
            return;

        if (this.activeWarningTag)
        {
            Dom.clearNode(this.panelNode);
            delete this.activeWarningTag;

            // The user was seeing the warning, but selected a file to show in the Script panel.
            // The removal of the warning leaves the panel without a clientHeight, so
            //  the old sourcebox will be out of sync. Just remove it and start over.
            this.removeAllSourceBoxes();
            // we are not passing state so I guess we could miss a restore
            this.show();

            // If show() reset the flag, obey it
            if (this.activeWarningTag)
                return;
        }

        this.showSource(updatedCompilationUnit.getURL());
        Events.dispatch(this.fbListeners, "onUpdateScriptLocation", [this, updatedCompilationUnit]);
    },

    updateSelection: function(object)
    {
        if (FBTrace.DBG_PANELS)
        {
            FBTrace.sysout("script updateSelection object:" + object + " of type " +
                typeof(object), object);

            if (object instanceof CompilationUnit)
                FBTrace.sysout("script updateSelection this.navigate(object)", object);
            else if (object instanceof SourceLink.SourceLink)
                FBTrace.sysout("script updateSelection this.showSourceLink(object)", object);
            else if (typeof(object) == "function")
                FBTrace.sysout("script updateSelection this.showFunction(object)", object);
            else if (object instanceof StackFrame.StackFrame)
                FBTrace.sysout("script updateSelection this.showStackFrameXB(object)", object);
            else
                FBTrace.sysout("script updateSelection this.showStackFrame(null)", object);
        }

        if (object instanceof CompilationUnit)
            this.navigate(object);
        else if (object instanceof SourceLink.SourceLink)
            this.showSourceLink(object);
        else if (typeof(object) == "function")
            this.showFunction(object);
        else if (object instanceof StackFrame.StackFrame)
            this.showStackFrameXB(object);
    },

    showThisCompilationUnit: function(compilationUnit)
    {
        if (compilationUnit.getURL().lastIndexOf("chrome://", 0) === 0)
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

        var filter = Options.get("scriptsFilter");
        this.showEvents = (filter == "all" || filter == "events");
        this.showEvals = (filter == "all" || filter == "evals");

        var list = [];
        for (var i = 0; i < allSources.length; i++)
        {
            if (this.showThisCompilationUnit(allSources[i]))
            {
                list.push(allSources[i]);
            }
            else if (FBTrace.DBG_COMPILATION_UNITS)
            {
                FBTrace.sysout("scrpt.getLocationList filtered "+allSources[i].getURL(),
                    allSources[i]);
            }
        }

        if (!list.length && allSources.length)
            this.context.allScriptsWereFiltered = true;
        else
            delete this.context.allScriptsWereFiltered;

        if (FBTrace.DBG_COMPILATION_UNITS)
        {
            FBTrace.sysout("script.getLocationList enabledOnLoad:" + context.onLoadWindowContent +
                " all:" + allSources.length + " filtered:" + list.length + " allFiltered: " +
                this.context.allScriptsWereFiltered, list);
        }

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
        }

        return compilationUnits[0];
    },

    getDefaultSelection: function()
    {
        return this.getDefaultLocation();
    },

    getTooltipObject: function(target)
    {
        // Target should be an element with class = sourceLine
        if (Css.hasClass(target, "sourceLine"))
            return null; // TODO

        return null;
    },

    getPopupObject: function(target)
    {
        // Don't show the popup over the line numbers. We show the conditional breakpoint
        // editor there instead
        if (Dom.getAncestorByClass(target, "sourceLine"))
            return;

        var sourceRow = Dom.getAncestorByClass(target, "sourceRow");
        if (!sourceRow)
            return;

        var lineNo = parseInt(sourceRow.firstChild.textContent);
        var scripts = Firebug.SourceFile.findScripts(this.context, this.location.getURL(), lineNo);

        // Gee I wonder what will happen?
        return scripts;
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
        return Url.splitURLBase(compilationUnit.getURL());
    },

    getSourceLink: function(target, object)
    {
        var sourceRow = Dom.getAncestorByClass(target, "sourceRow");
        if (!sourceRow)
            return;

        var sourceLine = Dom.getChildByClass(sourceRow, "sourceLine");
        var lineNo = parseInt(sourceLine.textContent);
        return new SourceLink.SourceLink(this.location.url, lineNo, "js");
    },

    getOptionsMenuItems: function()
    {
        var context = this.context;

        return [
            // 1.2: always check last line; optionMenu("UseLastLineForEvalName", "useLastLineForEvalName"),
            // 1.2: always use MD5 optionMenu("UseMD5ForEvalName", "useMD5ForEvalName")
            Menu.optionMenu("script.option.Track_Throw_Catch", "trackThrowCatch",
                "script.option.tip.Track_Throw_Catch"),
            //"-",
            //1.2 option on toolbar this.optionMenu("DebuggerEnableAlways", enableAlwaysPref)
            Menu.optionMenu("firebug.breakpoint.showBreakNotifications", "showBreakNotification",
                "firebug.breakpoint.tip.Show_Break_Notifications")
        ];
    },

    optionMenu: function(label, option)
    {
        var checked = Options.get(option);
        return {
            label: label, type: "checkbox", checked: checked,
            command: function()
            {
                var checked = this.hasAttribute("checked");
                Options.set(option, checked);
            }
        };
    },

    getContextMenuItems: function(fn, target)
    {
        if (Dom.getAncestorByClass(target, "sourceLine"))
            return;

        var sourceRow = Dom.getAncestorByClass(target, "sourceRow");
        if (!sourceRow)
            return;

        var sourceLine = Dom.getChildByClass(sourceRow, "sourceLine");
        var lineNo = parseInt(sourceLine.textContent);

        var items = [];

        var selection = this.document.defaultView.getSelection();
        if (selection.toString())
        {
            items.push(
                {
                    label: "CopySourceCode",
                    tooltiptext: "script.tip.Copy_Source_Code",
                    command: Obj.bind(this.copySource, this)
                },
                "-",
                {
                    label: "AddWatch",
                    tooltiptext: "watch.tip.Add_Watch",
                    acceltext: Locale.getFormattedKey(window, "alt", "W"),
                    command: Obj.bind(this.addSelectionWatch, this)
                }
            );
        }

        var hasBreakpoint = sourceRow.getAttribute("breakpoint") == "true";

        items.push(
            "-",
            {
                label: "SetBreakpoint",
                tooltiptext: "script.tip.Set_Breakpoint",
                type: "checkbox",
                checked: hasBreakpoint,
                command: Obj.bindFixed(this.toggleBreakpoint, this, lineNo)
            }
        );

        if (hasBreakpoint)
        {
            var isDisabled = JavaScriptTool.isBreakpointDisabled(this.context, this.location.href,
                lineNo);
            items.push(
                {
                    label: "breakpoints.Disable_Breakpoint",
                    tooltiptext: "breakpoints.tip.Disable_Breakpoint",
                    type: "checkbox",
                    checked: isDisabled,
                    command: Obj.bindFixed(this.toggleDisableBreakpoint, this, lineNo)
                }
            );
        }

        items.push(
            {
                label: "EditBreakpointCondition",
                tooltiptext: "breakpoints.tip.Edit_Breakpoint_Condition",
                command: Obj.bindFixed(this.editBreakpointCondition, this, lineNo)
            }
        );

        if (this.context.stopped)
        {
            var sourceRow = Dom.getAncestorByClass(target, "sourceRow");
            if (sourceRow)
            {
                var compilationUnit = Dom.getAncestorByClass(sourceRow, "sourceBox").repObject;
                var lineNo = parseInt(sourceRow.firstChild.textContent);

                var debuggr = this;
                items.push(
                    "-",
                    {
                        label: "script.Rerun",
                        tooltiptext: "script.tip.Rerun",
                        id: "contextMenuRerun",
                        command: Obj.bindFixed(debuggr.rerun, debuggr, this.context),
                        acceltext: Locale.getFormattedKey(window, "shift", null, "VK_F8")
                    },
                    {
                        label: "script.Continue",
                        tooltiptext: "script.tip.Continue",
                        id: "contextMenuContinue",
                        command: Obj.bindFixed(debuggr.resume, debuggr, this.context),
                        acceltext: Locale.getFormattedKey(window, null, null, "VK_F8")
                    },
                    {
                        label: "script.Step_Over",
                        tooltiptext: "script.tip.Step_Over",
                        id: "contextMenuStepOver",
                        command: Obj.bindFixed(debuggr.stepOver, debuggr, this.context),
                        acceltext: Locale.getFormattedKey(window, null, null, "VK_F10")
                    },
                    {
                        label: "script.Step_Into",
                        tooltiptext: "script.tip.Step_Into",
                        id: "contextMenuStepInto",
                        command: Obj.bindFixed(debuggr.stepInto, debuggr, this.context),
                        acceltext: Locale.getFormattedKey(window, null, null, "VK_F11")
                    },
                    {
                        label: "script.Step_Out",
                        tooltiptext: "script.tip.Step_Out",
                        id: "contextMenuStepOut",
                        command: Obj.bindFixed(debuggr.stepOut, debuggr, this.context),
                        acceltext: Locale.getFormattedKey(window, "shift", null, "VK_F11")
                    },
                    {
                        label: "firebug.RunUntil",
                        tooltiptext: "script.tip.Run_Until",
                        id: "contextMenuRunUntil",
                        command: Obj.bindFixed(debuggr.runUntil, debuggr, this.context,
                            compilationUnit, lineNo)
                    }
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    supportsBreakOnNext: function()
    {
        return this.breakable && Firebug.jsDebuggerOn;
    },

    breakOnNext: function(enabled)
    {
        if (enabled)
            JavaScriptTool.breakOnNext(this.context, true);
        else
            JavaScriptTool.breakOnNext(this.context, false);
    },

    getBreakOnNextTooltip: function(armed)
    {
        return (armed ?
            Locale.$STR("script.Disable Break On Next") : Locale.$STR("script.Break On Next"));
    },

    shouldBreakOnNext: function()
    {
        return !!this.context.breakOnNextHook;  // TODO BTI
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends ActivablePanel

    /**
     * Support for panel activation.
     */
    onActivationChanged: function(enable)
    {
        JavaScriptTool.setActivation(enable);

        if (enable)
            Firebug.TabCacheModel.addObserver(this);
        else
            Firebug.TabCacheModel.removeObserver(this);

        // If the Script is disabled make sure the BON tab flag (orange background)
        // is properly updated.
        Firebug.Breakpoint.updatePanelTabs(Firebug.currentContext);
    },

    // implements Tool
    onActiveTool: function(isActive)
    {
        this.onJavaScriptDebugging(isActive, "onActiveTool");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Toolbar functions

    attachListeners: function(context, chrome)
    {
        this.keyListeners =
        [
            chrome.keyCodeListen("F8", Events.isShift, Obj.bind(this.rerun, this, context), true),
            chrome.keyCodeListen("F8", null, Obj.bind(this.resume, this, context), true),
            chrome.keyCodeListen("F10", null, Obj.bind(this.stepOver, this, context), true),
            chrome.keyCodeListen("F11", null, Obj.bind(this.stepInto, this, context)),
            chrome.keyCodeListen("F11", Events.isShift, Obj.bind(this.stepOut, this, context))
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
                FBTrace.sysout("debugger.syncCommand, context with no chrome", context);
            return;
        }

        if (context.stopped)
        {
            chrome.setGlobalAttribute("fbDebuggerButtons", "stopped", "true");
            chrome.setGlobalAttribute("cmd_firebug_rerun", "disabled", "false");
            chrome.setGlobalAttribute("cmd_firebug_resumeExecution", "disabled", "false");
            chrome.setGlobalAttribute("cmd_firebug_stepOver", "disabled", "false");
            chrome.setGlobalAttribute("cmd_firebug_stepInto", "disabled", "false");
            chrome.setGlobalAttribute("cmd_firebug_stepOut", "disabled", "false");
        }
        else
        {
            chrome.setGlobalAttribute("fbDebuggerButtons", "stopped", "false");
            chrome.setGlobalAttribute("cmd_firebug_rerun", "disabled", "true");
            chrome.setGlobalAttribute("cmd_firebug_stepOver", "disabled", "true");
            chrome.setGlobalAttribute("cmd_firebug_stepInto", "disabled", "true");
            chrome.setGlobalAttribute("cmd_firebug_stepOut", "disabled", "true");
            chrome.setGlobalAttribute("cmd_firebug_resumeExecution", "disabled", "true");
        }
    },

    rerun: function(context)
    {
        JavaScriptTool.rerun(context);
    },

    resume: function(context)
    {
        JavaScriptTool.resumeJavaScript(context);
    },

    stepOver: function(context)
    {
        JavaScriptTool.stepOver(context);
    },

    stepInto: function(context)
    {
        JavaScriptTool.stepInto(context);
    },

    stepOut: function(context)
    {
        JavaScriptTool.stepOut(context);
    },

    runUntil: function(context, compilationUnit, lineNo)
    {
        JavaScriptTool.runUntil(compilationUnit, lineNo);
    },

    onStartDebugging: function(frame)
    {
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("script.startDebugging enter context: " + this.context.getName());

        try
        {
            var currentBreakable = Firebug.chrome.getGlobalAttribute("cmd_firebug_toggleBreakOn",
                "breakable");

            if (FBTrace.DBG_BP)
            {
                FBTrace.sysout("debugger.startDebugging; currentBreakable " + currentBreakable +
                    " in " + this.context.getName() + " currentContext " +
                    Firebug.currentContext.getName());
            }

            // If currentBreakable is false, then we are armed, but we broke
            if (currentBreakable == "false")
                Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable", "true");

            // If Firebug is minimized, open the UI to show we are stopped
            if (Firebug.isMinimized())
                Firebug.unMinimize();

            this.syncCommands(this.context);
            this.syncListeners(this.context);

            // Update Break on Next lightning
            Firebug.Breakpoint.updatePanelTab(this, false);
            Firebug.chrome.select(frame, "script", null, true);
            Firebug.chrome.syncPanel("script");  // issue 3463 and 4213
            Firebug.chrome.focus();
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Resuming debugger: error during debugging loop: " + exc, exc);

            Firebug.Console.log("Resuming debugger: error during debugging loop: " + exc);
            this.resume(this.context);
        }

        if (FBTrace.DBG_UI_LOOP)
        {
            FBTrace.sysout("script.onStartDebugging exit context.stopped:" +
                this.context.stopped + " for context: " + this.context.getName());
        }
    },

    onStopDebugging: function()
    {
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("script.onStopDebugging enter context: " + this.context.getName());

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

            // After main panel is completely updated
            chrome.syncSidePanels();
        }
        catch (exc)
        {
            if (FBTrace.DBG_UI_LOOP)
                FBTrace.sysout("debugger.stopDebugging FAILS", exc);

            // If the window is closed while the debugger is stopped,
            // then all hell will break loose here
            Debug.ERROR(exc);
        }
    },

});

// ********************************************************************************************* //

const reWord = /([A-Za-z_$0-9]+)(\.([A-Za-z_$0-9]+)|\[([A-Za-z_$0-9]+|["'].+?["'])\])*/;

function getExpressionAt(text, charOffset)
{
    var offset = 0;
    for (var m = reWord.exec(text); m; m = reWord.exec(text.substr(offset)))
    {
        var word = m[0];
        var wordOffset = offset+m.index;
        if (charOffset >= wordOffset && charOffset <= wordOffset+word.length)
        {
            var innerOffset = charOffset-wordOffset;
            m = word.substr(innerOffset+1).match(/\.|\]|\[|$/);
            var end = m.index + innerOffset + 1, start = 0;

            var openBr = word.lastIndexOf('[', innerOffset);
            var closeBr = word.lastIndexOf(']', innerOffset);

            if (openBr == innerOffset)
                end++;
            else if (closeBr < openBr)
            {
                if (/['"\d]/.test(word[openBr+1]))
                    end++;
                else
                    start = openBr + 1;
            }

            word = word.substring(start, end);

            if (/^\d+$/.test(word) && word[0] != '0')
                word = '';

            return {expr: word, offset: wordOffset-start};
        }
        offset = wordOffset+word.length;
    }

    return {expr: null, offset: -1};
};

// ********************************************************************************************* //
// Domplate Templates

with (Domplate) {

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
            Locale.$STR("script.button.enable_javascript")
        ),

    focusDebuggerTag:
        SPAN({"class": "objectLink", onclick: "$onFocusDebugger", style: "color: blue"},
            Locale.$STR("script.button.Go to that page")
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onEnableScript: function(event)
    {
        Options.setPref("javascript", "enabled", true);

        Firebug.TabWatcher.reloadPageFromMemory(Firebug.currentContext);
    },

    onFocusDebugger: function(event)
    {
        Win.iterateBrowserWindows("navigator:browser", function(win)
        {
            return win.Firebug.TabWatcher.iterateContexts(function(context)
            {
                if (context.stopped)
                {
                    // Focus browser window with active debugger and select the Script panel
                    win.Firebug.focusBrowserTab(context.window);
                    win.Firebug.chrome.selectPanel("script");
                    return true;
                }
            });
        });

        // No context is stopped
        if (FBTrace.DBG_UI_LOOP)
            FBTrace.sysout("script.onFocusDebugger FAILED");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    showInactive: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.inactive_during_page_load"),
            suggestion: Locale.$STR("script.suggestion.inactive_during_page_load2")
        };

        var box = this.tag.replace(args, parentNode, this);
        var description = box.getElementsByClassName("disabledPanelDescription").item(0);
        FirebugReps.Description.render(args.suggestion, description,
            Obj.bindFixed(Firebug.TabWatcher.reloadPageFromMemory,  Firebug.TabWatcher,
            Firebug.currentContext));

        return box;
    },

    showNotEnabled: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.javascript_not_enabled"),
            suggestion: Locale.$STR("script.suggestion.javascript_not_enabled")
        };

        var box = this.tag.replace(args, parentNode, this);
        this.enableScriptTag.append({}, box, this);

        return box;
    },

    showDebuggerInactive: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.debugger_not_activated"),
            suggestion: Locale.$STR("script.suggestion.debugger_not_activated")
        };

        var box = this.tag.replace(args, parentNode, this);

        return box;
    },

    showFiltered: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.all_scripts_filtered"),
            suggestion: Locale.$STR("script.suggestion.all_scripts_filtered")
        };
        return this.tag.replace(args, parentNode, this);
    },

    showNoScript: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.no_javascript"),
            suggestion: Locale.$STR("script.suggestion.no_javascript2")
        };
        return this.tag.replace(args, parentNode, this);
    },

    showNoDebuggingForSystemSources: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.no_system_source_debugging"),
            suggestion: Locale.$STR("script.suggestion.no_system_source_debugging")
        };

        var box = this.tag.replace(args, parentNode, this);
        var description = box.getElementsByClassName("disabledPanelDescription").item(0);
        FirebugReps.Description.render(args.suggestion, description,
            Obj.bindFixed(Firebug.chrome.visitWebsite, this, "issue5110"));

        return box;
    },

    showActivitySuspended: function(parentNode)
    {
        var args = {
            pageTitle: Locale.$STR("script.warning.debugger_active"),
            suggestion: Locale.$STR("script.suggestion.debugger_active")
        };

        var box = this.tag.replace(args, parentNode, this);
        this.focusDebuggerTag.append({}, box, this);

        return box;
    }
});

var WarningRep = Firebug.ScriptPanel.WarningRep;

// ********************************************************************************************* //

Firebug.ScriptPanel.BreakpointInfoTip = domplate(Firebug.Rep,
{
    tag:
        DIV("$expr"),

    render: function(parentNode, expr)
    {
        this.tag.replace({expr: expr}, parentNode, this);
    }
});

// ********************************************************************************************* //

}; // END with (Domplate)

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(Firebug.ScriptPanel);

return Firebug.ScriptPanel;

// ********************************************************************************************* //
});
