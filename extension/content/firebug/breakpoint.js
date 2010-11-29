/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

// ************************************************************************************************

Firebug.Breakpoint = extend(Firebug.Module,
{
    dispatchName: "breakpoints",

    toggleBreakOnNext: function(panel)
    {
        var breakable = Firebug.chrome.getGlobalAttribute("cmd_breakOnNext", "breakable");

        if (FBTrace.DBG_BP)
            FBTrace.sysout("breakpoint.toggleBreakOnNext; currentBreakable "+breakable+
                " in " + panel.context.getName());

        // Toggle button's state.
        breakable = (breakable == "true" ? "false" : "true");
        Firebug.chrome.setGlobalAttribute("cmd_breakOnNext", "breakable", breakable);

        // Call the current panel's logic related to break-on-next.
        // If breakable == "true" the feature is currently disabled.
        var enabled = (breakable == "true" ? false : true);
        panel.breakOnNext(enabled);

        // Make sure the correct tooltip (coming from the current panel) is used.
        this.updateBreakOnNextTooltips(panel);

        // Light up the tab whenever break on next is selected
        this.updatePanelTab(panel, enabled);

        return enabled;
    },

    showPanel: function(browser, panel)
    {
        if (!panel)  // there is no selectedPanel?
            return;

        var breakButton = Firebug.chrome.$("fbBreakOnNextButton");
        if (panel.name)
            breakButton.setAttribute("panelName", panel.name);

        breakButton.removeAttribute("type");
        collapse(Firebug.chrome.$("fbBonButtons"), !panel.breakable);

        // Disable break-on-next if it isn't supported by the current panel.
        if (!panel.breakable || !panel.context.jsDebuggerActive )
        {
            Firebug.chrome.setGlobalAttribute("cmd_breakOnNext", "breakable", "disabled");
            return;
        }

        // Set the tooltips and update break-on-next button's state.
        var shouldBreak = panel.shouldBreakOnNext();
        this.updateBreakOnNextState(panel, shouldBreak);
        this.updateBreakOnNextTooltips(panel);
        this.updatePanelTab(panel, shouldBreak);

        var menuItems = panel.getBreakOnMenuItems();
        if (!menuItems || !menuItems.length)
            return;

        breakButton.setAttribute("type", "menu-button");

        var menuPopup = Firebug.chrome.$("fbBreakOnNextOptions");
        eraseNode(menuPopup);

        for (var i=0; i<menuItems.length; ++i)
            FBL.createMenuItem(menuPopup, menuItems[i]);
    },

    updateBreakOnNextTooltips: function(panel)
    {
        var breakable = Firebug.chrome.getGlobalAttribute("cmd_breakOnNext", "breakable");

        // Get proper tooltip for the break-on-next button from the current panel.
        // If breakable is set to "false" the feature is already activated (throbbing).
        var armed = (breakable == "false");
        var tooltip = panel.getBreakOnNextTooltip(armed);
        if (!tooltip)
            tooltip = "";

        Firebug.chrome.setGlobalAttribute("cmd_breakOnNext", "tooltiptext", tooltip);
    },

    updateBreakOnNextState: function(panel, armed)
    {
        // If the panel should break at the next chance, set the button to not breakable,
        // which means already active (throbbing).
        var breakable = armed ? "false" : "true";
        Firebug.chrome.setGlobalAttribute("cmd_breakOnNext", "breakable", breakable);
    },

    updatePanelTab: function(panel, armed)
    {
        if (!panel)
            return;

        var panelBar = Firebug.chrome.$("fbPanelBar1");
        var tab = panelBar.getTab(panel.name);
        if (tab)
            tab.setAttribute("breakOnNextArmed", armed ? "true" : "false");
    },

    breakNow: function(panel)
    {
        this.updatePanelTab(panel, false);
        Firebug.Debugger.breakNow(panel.context);
    }
});

// ************************************************************************************************

Firebug.Breakpoint.BreakpointListRep = domplate(Firebug.Rep,
{
    tag:
        DIV({onclick: "$onClick", role : "list"},
            FOR("group", "$groups",
                DIV({"class": "breakpointBlock breakpointBlock-$group.name", role: "listitem"},
                    H1({"class": "breakpointHeader groupHeader"},
                        "$group.title"
                    ),
                    DIV({"class": "breakpointsGroupListBox", role: "listbox"},
                        FOR("bp", "$group.breakpoints",
                            TAG("$bp|getBreakpointRep", {bp: "$bp"})
                        )
                    )
                )
            )
        ),

    getBreakpointRep: function(bp)
    {
        var rep = Firebug.getRep(bp, Firebug.currentContext);
        return rep.tag;
    },

    onClick: function(event)
    {
        var panel = Firebug.getElementPanel(event.target);

        if (getAncestorByClass(event.target, "breakpointCheckbox"))
        {
            var node = event.target.parentNode.getElementsByClassName("objectLink-sourceLink").item(0);
            if (!node)
                return;

            var sourceLink = node.repObject;

            // XXXjjb this prevents the UI from updating why?  panel.noRefresh = true;
            if (event.target.checked)
                fbs.enableBreakpoint(sourceLink.href, sourceLink.line);
            else
                fbs.disableBreakpoint(sourceLink.href, sourceLink.line);
            // XXX jjb panel.noRefresh = false;
        }
        else if (getAncestorByClass(event.target, "closeButton"))
        {
            var sourceLink =
                event.target.parentNode.getElementsByClassName("objectLink-sourceLink").item(0).repObject;

            panel.noRefresh = true;

            var head = getAncestorByClass(event.target, "breakpointBlock");
            var groupName = getClassValue(head, "breakpointBlock");
            if (groupName == "breakpoints")
                fbs.clearBreakpoint(sourceLink.href, sourceLink.line);
            else if (groupName == "errorBreakpoints")
                fbs.clearErrorBreakpoint(sourceLink.href, sourceLink.line);
            else if (groupName == "monitors")
            {
                fbs.unmonitor(sourceLink.href, sourceLink.line)
            }

            var row = getAncestorByClass(event.target, "breakpointRow");
            panel.removeRow(row);

            panel.noRefresh = false;
        }
    }
});

// ************************************************************************************************

Firebug.Breakpoint.BreakpointRep = domplate(Firebug.Rep,
{
    tag:
        DIV({"class": "breakpointRow focusRow", role: "option", "aria-checked": "$bp.checked"},
            DIV({"class": "breakpointBlockHead"},
                INPUT({"class": "breakpointCheckbox", type: "checkbox",
                    _checked: "$bp.checked", tabindex : '-1'}),
                SPAN({"class": "breakpointName"}, "$bp.name"),
                TAG(FirebugReps.SourceLink.tag, {object: "$bp|getSourceLink"}),
                IMG({"class": "closeButton", src: "blank.gif"})
            ),
            DIV({"class": "breakpointCode"}, "$bp.sourceLine")
        ),

    getSourceLink: function(bp)
    {
        return new SourceLink(bp.href, bp.lineNumber, "js");
    },

    supportsObject: function(object, type)
    {
        return (object instanceof Firebug.Debugger.Breakpoint);
    }
});

// ************************************************************************************************

Firebug.Breakpoint.BreakpointsPanel = function() {}

Firebug.Breakpoint.BreakpointsPanel.prototype = extend(Firebug.Panel,
{
    name: "breakpoints",
    parentPanel: "script",
    order: 2,
    enableA11y: true,
    deriveA11yFrom: "console",

    initialize: function()
    {
        Firebug.Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        Firebug.Panel.destroy.apply(this, arguments);
    },

    show: function(state)
    {
        this.refresh();
    },

    refresh: function()
    {
        if (this.noRefresh)
            return;

        var extracted = this.extractBreakpoints(this.context, breakpoints, errorBreakpoints, monitors);

        var breakpoints = extracted.breakpoints;
        var errorBreakpoints = extracted.errorBreakpoints;
        var monitors = extracted.monitors;

        if (FBTrace.DBG_BP)
            FBTrace.sysout("breakpoints.breakpoints.refresh extracted " +
                breakpoints.length+errorBreakpoints.length+monitors.length,
                [breakpoints, errorBreakpoints, monitors]);

        function sortBreakpoints(a, b)
        {
            if (a.href == b.href)
                return a.lineNumber < b.lineNumber ? -1 : 1;
            else
                return a.href < b.href ? -1 : 1;
        }

        breakpoints.sort(sortBreakpoints);
        errorBreakpoints.sort(sortBreakpoints);
        monitors.sort(sortBreakpoints);

        if (FBTrace.DBG_BP)
            FBTrace.sysout("breakpoints.breakpoints.refresh sorted "+breakpoints.length+
                errorBreakpoints.length+monitors.length, [breakpoints, errorBreakpoints, monitors]);

        var groups = [];

        if (breakpoints.length)
            groups.push({name: "breakpoints", title: $STR("Breakpoints"),
                breakpoints: breakpoints});
        if (errorBreakpoints.length)
            groups.push({name: "errorBreakpoints", title: $STR("ErrorBreakpoints"),
                breakpoints: errorBreakpoints});
        if (monitors.length)
            groups.push({name: "monitors", title: $STR("LoggedFunctions"),
                breakpoints: monitors});

        dispatch(Firebug.Debugger.fbListeners, "getBreakpoints", [this.context, groups]);

        if (groups.length)
            Firebug.Breakpoint.BreakpointListRep.tag.replace({groups: groups}, this.panelNode);
        else
            FirebugReps.Warning.tag.replace({object: "NoBreakpointsWarning"}, this.panelNode);

        if (FBTrace.DBG_BP)
            FBTrace.sysout("breakpoints.breakpoints.refresh "+breakpoints.length+
                errorBreakpoints.length+monitors.length, [breakpoints, errorBreakpoints, monitors]);

        dispatch(this.fbListeners, 'onBreakRowsRefreshed', [this, this.panelNode]);
    },

    extractBreakpoints: function(context, breakpoints, errorBreakpoints, monitors)
    {
        var breakpoints = [];
        var errorBreakpoints = [];
        var monitors = [];

        var renamer = new SourceFileRenamer(context);
        var self = this;
        var Breakpoint = Firebug.Debugger.Breakpoint;

        for (var url in context.sourceFileMap)
        {
            fbs.enumerateBreakpoints(url, {call: function(url, line, props, scripts)
            {
                if (FBTrace.DBG_BP) FBTrace.sysout("breakpoints.extractBreakpoints type: "+props.type+" in url "+url+"@"+line+" contxt "+context.getName(), props);
                if (renamer.checkForRename(url, line, props)) // some url in this sourceFileMap has changed, we'll be back.
                    return;

                if (scripts)  // then this is a current (not future) breakpoint
                {
                    var script = scripts[0];
                    var analyzer = Firebug.SourceFile.getScriptAnalyzer(context, script);
                    if (FBTrace.DBG_BP) FBTrace.sysout("breakpoints.refresh enumerateBreakpoints for script="+script.tag+(analyzer?" has analyzer":" no analyzer")+" in context "+context.getName());
                    if (analyzer)
                        var name = analyzer.getFunctionDescription(script, context).name;
                    else
                        var name = FBL.guessFunctionName(url, 1, context);
                    var isFuture = false;
                }
                else
                {
                    if (FBTrace.DBG_BP) FBTrace.sysout("breakpoints.refresh enumerateBreakpoints future for url@line="+url+"@"+line+"\n");
                    var isFuture = true;
                }

                var source = context.sourceCache.getLine(url, line);
                breakpoints.push(new Breakpoint(name, url, line, !props.disabled, source, isFuture));
            }});

            fbs.enumerateErrorBreakpoints(url, {call: function(url, line, props)
            {
                if (renamer.checkForRename(url, line, props)) // some url in this sourceFileMap has changed, we'll be back.
                    return;

                var name = Firebug.SourceFile.guessEnclosingFunctionName(url, line, context);
                var source = context.sourceCache.getLine(url, line);
                errorBreakpoints.push(new Breakpoint(name, url, line, true, source));
            }});

            fbs.enumerateMonitors(url, {call: function(url, line, props)
            {
                if (renamer.checkForRename(url, line, props)) // some url in this sourceFileMap has changed, we'll be back.
                    return;

                var name = Firebug.SourceFile.guessEnclosingFunctionName(url, line, context);
                monitors.push(new Breakpoint(name, url, line, true, ""));
            }});
        }

        var result = null;

        if (renamer.needToRename(context))
            result = this.extractBreakpoints(context); // since we renamed some sourceFiles we need to refresh the breakpoints again.
        else
            result = { breakpoints: breakpoints, errorBreakpoints: errorBreakpoints, monitors: monitors };

        // even if we did not rename, some bp may be dynamic
        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("breakpoints.extractBreakpoints context.dynamicURLhasBP: "+context.dynamicURLhasBP, result);

        return result;
    },

    getOptionsMenuItems: function()
    {
        var items = [];

        var context = this.context;

        var bpCount = 0, disabledCount = 0;
        var checkBoxes = this.panelNode.getElementsByClassName("breakpointCheckbox");
        for (var i=0; i<checkBoxes.length; i++)
        {
            ++bpCount;
            if (!checkBoxes[i].checked)
                ++disabledCount;
        }

        if (disabledCount)
        {
            items.push(
                {label: "EnableAllBreakpoints",
                    command: bindFixed(this.enableAllBreakpoints, this, context, true) }
            );
        }
        if (bpCount && disabledCount != bpCount)
        {
            items.push(
                {label: "DisableAllBreakpoints",
                    command: bindFixed(this.enableAllBreakpoints, this, context, false) }
            );
        }

        items.push(
            "-",
            {label: "ClearAllBreakpoints", disabled: !bpCount,
                command: bindFixed(this.clearAllBreakpoints, this, context) }
        );

        return items;
    },

    enableAllBreakpoints: function(context, status)
    {
        var checkBoxes = this.panelNode.getElementsByClassName("breakpointCheckbox");
        for (var i=0; i<checkBoxes.length; i++)
        {
            var box = checkBoxes[i];
            if (box.checked != status)
                this.click(box);
        }
    },

    clearAllBreakpoints: function(context)
    {
        this.noRefresh = true;

        try
        {
            // Remove regular JSD breakpoints
            Firebug.Debugger.clearAllBreakpoints(context);
        }
        catch(exc)
        {
            FBTrace.sysout("breakpoint.clearAllBreakpoints FAILS "+exc, exc);
        }

        this.noRefresh = false;
        this.refresh();

        // Remove the rest of all the other kinds of breakpoints (after refresh).
        // These can come from various modules and perhaps extensions so, use
        // the appropriate remove buttons.
        var buttons = this.panelNode.getElementsByClassName("closeButton");
        while (buttons.length)
            this.click(buttons[0]);

        // Breakpoint group titles must also go away.
        this.refresh();
    },

    click: function(node)
    {
        var doc = node.ownerDocument, event = doc.createEvent("MouseEvents");
        event.initMouseEvent("click", true, true, doc.defaultView, 0, 0, 0, 0, 0,
            false, false, false, false, 0, null);
        return node.dispatchEvent(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    removeRow: function(row)
    {
        row.parentNode.removeChild(row);

        var bpCount = countBreakpoints(this.context);
        if (!bpCount)
            this.refresh();
    },
});

// ************************************************************************************************

function countBreakpoints(context)
{
    var count = 0;
    for (var url in context.sourceFileMap)
    {
        fbs.enumerateBreakpoints(url, {call: function(url, lineNo)
        {
            ++count;
        }});
    }
    return count;
}

// ************************************************************************************************

Firebug.Breakpoint.BreakpointGroup = function()
{
    this.breakpoints = [];
}

Firebug.Breakpoint.BreakpointGroup.prototype =
{
    removeBreakpoint: function(bp)
    {
        remove(this.breakpoints, bp);
    },

    enumerateBreakpoints: function(callback)
    {
        var breakpoints = cloneArray(this.breakpoints);
        for (var i=0; i<breakpoints.length; i++)
        {
            var bp = breakpoints[i];
            if (callback(bp))
                return true;
        }
        return false;
    },

    findBreakpoint: function()
    {
        for (var i=0; i<this.breakpoints.length; i++)
        {
            var bp = this.breakpoints[i];
            if (this.matchBreakpoint(bp, arguments))
                return bp;
        }
        return null;
    },

    matchBreakpoint: function(bp, args)
    {
        // TODO: must be implemented in derived objects.
        return false;
    },

    isEmpty: function()
    {
        return !this.breakpoints.length;
    }
};

// ************************************************************************************************

function SourceFileRenamer(context)
{
    this.renamedSourceFiles = [];
    this.context = context;
    this.bps = [];
}

SourceFileRenamer.prototype.checkForRename = function(url, line, props)
{
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
        this.context.dynamicURLhasBP = true;  // whether not we needed to rename, the dynamic sourceFile has a bp.
        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("breakpoints.checkForRename found bp in "+sourceFile+" renamed files:", this.renamedSourceFiles);
    }
    else
    {
        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("breakpoints.checkForRename found static bp in "+sourceFile+" bp:", props);
    }

    return (this.renamedSourceFiles.length > 0);
};

SourceFileRenamer.prototype.needToRename = function(context)
{
    if (this.renamedSourceFiles.length > 0)
        this.renameSourceFiles(context);

    if (FBTrace.DBG_SOURCEFILES)
        FBTrace.sysout("debugger renamed " + this.renamedSourceFiles.length + " sourceFiles", context.sourceFileMap);

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

        var segs = oldURL.split('/');  // last is sequence #, next-last is "seq", next-next-last is kind
        var kind = segs.splice(segs.length - 3, 3)[0];
        var callerURL = segs.join('/');
        if (!sourceFile.source)
        {
            FBTrace.sysout("breakpoint.renameSourceFiles no source for "+oldURL+" callerURL "+callerURL, sourceFile)
            continue;
        }
        var newURL = Firebug.Debugger.getURLFromMD5(callerURL, sourceFile.source, kind);
        sourceFile.href = newURL.href;

        fbs.removeBreakpoint(bp.type, oldURL, bp.lineNo);
        delete context.sourceFileMap[oldURL];  // SourceFile delete

        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("breakpoints.renameSourceFiles type: "+bp.type, bp);

        Firebug.Debugger.watchSourceFile(context, sourceFile);
        var newBP = fbs.addBreakpoint(sameType, sourceFile, sameLineNo, bp, Firebug.Debugger);

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
            FBTrace.sysout("SourceFileRenamer renamed "+oldURL +" to "+newURL, { newBP: newBP, oldBP: bp});
    }
    return this.renamedSourceFiles.length;
}

// ************************************************************************************************

Firebug.Breakpoint.ConditionEditor = function(doc)
{
    this.initialize(doc);
}

Firebug.Breakpoint.ConditionEditor.prototype = domplate(Firebug.InlineEditor.prototype,
{
    tag:
        DIV({"class": "conditionEditor"},
            DIV({"class": "conditionEditorTop1"},
                DIV({"class": "conditionEditorTop2"})
            ),
            DIV({"class": "conditionEditorInner1"},
                DIV({"class": "conditionEditorInner2"},
                    DIV({"class": "conditionEditorInner"},
                        DIV({"class": "conditionCaption"}, $STR("ConditionInput")),
                        INPUT({"class": "conditionInput", type: "text",
                            "aria-label": $STR("ConditionInput")}
                        )
                    )
                )
            ),
            DIV({"class": "conditionEditorBottom1"},
                DIV({"class": "conditionEditorBottom2"})
            )
        ),

    initialize: function(doc)
    {
        this.box = this.tag.replace({}, doc, this);

        // XXXjjb we need childNode[1] always
        this.input = this.box.childNodes[1].firstChild.firstChild.lastChild;
        Firebug.InlineEditor.prototype.initialize.apply(this, arguments);
    },

    show: function(sourceLine, panel, value)
    {
        this.target = sourceLine;
        this.panel = panel;

        if (this.getAutoCompleter)
            this.getAutoCompleter().reset();

        hide(this.box, true);
        panel.selectedSourceBox.appendChild(this.box);

        if (this.input)
            this.input.value = value;

        setTimeout(bindFixed(function()
        {
            var offset = getClientOffset(sourceLine);

            var bottom = offset.y+sourceLine.offsetHeight;
            var y = bottom - this.box.offsetHeight;
            if (y < panel.selectedSourceBox.scrollTop)
            {
                y = offset.y;
                setClass(this.box, "upsideDown");
            }
            else
                removeClass(this.box, "upsideDown");

            this.box.style.top = y + "px";
            hide(this.box, false);

            if (this.input)
            {
                this.input.focus();
                this.input.select();
            }
        }, this));
    },

    hide: function()
    {
        this.box.parentNode.removeChild(this.box);

        delete this.target;
        delete this.panel;
    },

    layout: function()
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    endEditing: function(target, value, cancel)
    {
        if (!cancel)
        {
            var sourceFile = this.panel.location;
            var lineNo = parseInt(this.target.textContent);

            fbs.setBreakpointCondition(sourceFile, lineNo, value, Firebug.Debugger);
        }
    },

});

// ************************************************************************************************
/*
 * Construct a break notification popup
 * @param doc the document to contain the popup
 * @param cause info object for the popup, with these optional fields:
 *   strings: title, message, attrName
 *   elements: target, relatedTarget: element
 *   objects: prevValue, newValue
 */
Firebug.Breakpoint.BreakNotification = function(doc, cause)
{
    this.initialize(doc, cause);
}

Firebug.Breakpoint.BreakNotification.prototype = domplate(Firebug.InlineEditor.prototype,
{
    tag:
        DIV({"class": "conditionEditor breakNotification", onclick: "$hide"},
            DIV({"class": "notationEditorTop1"},
                DIV({"class": "notationEditorTop2"})
            ),
            DIV({"class": "notationEditorInner1"},
                DIV({"class": "notationEditorInner2"},
                    DIV({"class": "conditionEditorInner"},
                        DIV({"class": "notationCaption"},
                            SPAN({"class": "notationTitle"}, "$cause.title"),
                            BUTTON({"class": "notationButton closeButton", onclick: "$onCloseAction",
                                $collapsed: "$cause|hideCloseAction"},
                                $STR("X")
                            ),
                            BUTTON({"class": "notationButton copyButton", onclick: "$onCopyAction",
                                $collapsed: "$cause|hideCopyAction"},
                                $STR("Copy")
                            ),
                            BUTTON({"class": "notationButton disableButton", onclick: "$onSkipAction",
                                $collapsed: "$cause|hideSkipAction"},
                                $STR("script.balloon.Disable")
                            ),
                            BUTTON({"class": "notationButton ContinueButton", onclick: "$onOkAction",
                                $collapsed: "$cause|hideOkAction"},
                                $STR("script.balloon.Continue")
                            )
                        ),
                        DIV({"class": "notationCaption"},
                            SPAN({"class": "notationTitle"}, "$cause|getTitle"),
                            SPAN("&nbsp;"),
                            SPAN({"class": "notationTitle diff"}, "$cause|getDiff"),
                            SPAN("&nbsp;"),
                            TAG("$cause|getTargetTag", {object: "$cause.target"}),
                            SPAN("&nbsp;"),
                            TAG("$cause|getRelatedTargetTag", {object: "$cause.relatedNode"})
                        )
                    )
                )
            ),
            DIV({"class": "notationEditorBottom1"},
                DIV({"class": "notationEditorBottom2"})
            )
        ),

    getElementTag: function(node)
    {
        if (node)
        {
            var rep = Firebug.getRep(node);
            if (rep)
                return rep.shortTag || rep.tag;
        }
    },

    getTargetTag: function(cause)
    {
        return this.getElementTag(cause.target) || null;
    },

    getRelatedTargetTag: function(cause)
    {
        return this.getElementTag(cause.relatedNode) || null;
    },

    getDiff: function(cause)
    {
        var str = "";
        if (cause.prevValue)
            str += cropString(cause.prevValue, 40) + " -> ";
        if (cause.newValue)
            str += cropString(cause.newValue, 40);

        if (!str.length)
            return "";

        if (!cause.target)
            return str;

        return str;
    },

    getTitle: function(cause)
    {
        var str = cause.message + (cause.attrName ? (" '"+cause.attrName+"'") : "");
        if (this.getDiff(cause))
            str += ":";
        return str;
    },

    initialize: function(doc, cause)
    {
        this.cause = cause;
        this.box = this.tag.replace({cause: cause}, doc, this);
    },

    show: function(sourceLine, panel, value)
    {
        this.target = sourceLine;
        this.panel = panel;

        hide(this.box, true);
        panel.selectedSourceBox.appendChild(this.box);

        setTimeout(bindFixed(function()
        {
            var offset = getClientOffset(sourceLine);

            var bottom = offset.y+sourceLine.offsetHeight;
            var y = bottom - this.box.offsetHeight;
            if (y < panel.selectedSourceBox.scrollTop)
            {
                y = offset.y;
                setClass(this.box, "upsideDown");
            }
            else
                removeClass(this.box, "upsideDown");

            this.box.style.top = y + "px";
            hide(this.box, false);
        }, this));
    },

    hide: function(event) // the argument event does not come thru??
    {
        if (this.panel)
        {
            var guts = this.box.getElementsByClassName("conditionEditorInner").item(0);
            collapse(guts, true);  // as the box shrinks you don't want text to spill

            var msg = this.cause.message;
            if (msg)
            {
                var self = this;
                var delta = Math.max(20,Math.floor(self.box.clientWidth/20));
                var interval = setInterval(function slide(event)
                {
                    if (self.box.clientWidth < delta)
                    {
                        clearNode(guts);

                        clearInterval(interval);
                        if (self.box.parentNode)
                        {
                            self.box.parentNode.removeChild(self.box);
                            self.target.setAttribute('title', msg);
                            setClass(self.target, "noteInToolTip");
                        }
                        delete self.target;
                        delete self.panel;
                    }
                    else
                        self.box.style.width = (self.box.clientWidth - delta)+"px";
                }, 15);
            }
            else
            {
                delete this.target;
                delete this.panel;
            }
        }
        // else we already called hide
    },

    hideCopyAction: function(cause)
    {
        return !cause.copyAction;
    },

    onCopyAction: function(event)
    {
        if (this.cause.copyAction)
            this.cause.copyAction();
    },

    hideSkipAction: function(cause)
    {
        return !cause.skipAction;
    },

    onSkipAction: function(event)
    {
         if (this.cause.skipAction)
             this.cause.skipAction();
    },

    hideOkAction: function(cause)
    {
        return !cause.okAction;
    },

    onOkAction: function(event)
    {
         if (this.cause.okAction)
             this.cause.okAction();
    },

    hideCloseAction: function(cause)
    {
        return !cause.closeAction;
    },

    onCloseAction: function(event)
    {
        if (this.cause.onCloseAction)
            this.cause.onCloseAction();
        else
            this.hide(event); // same as click on balloon body
    },

});

// ************************************************************************************************
// Registration

Firebug.registerPanel(Firebug.Breakpoint.BreakpointsPanel);
Firebug.registerRep(Firebug.Breakpoint.BreakpointRep);
Firebug.registerModule(Firebug.Breakpoint);

// ************************************************************************************************
}});
