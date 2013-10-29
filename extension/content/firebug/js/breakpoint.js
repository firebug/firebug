/* See license.txt for terms of usage */

define([
    "firebug/chrome/module",
    "firebug/chrome/panel",
    "firebug/chrome/rep",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/js/sourceLink",
    "firebug/js/stackFrame",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/lib/persist",
    "firebug/chrome/menu",
    "firebug/js/fbs",
    "firebug/editor/editor",
    "firebug/console/autoCompleter"
],
function(Module, Panel, Rep, Obj, Firebug, Domplate, FirebugReps, Locale, Events, SourceLink,
    StackFrame, Css, Dom, Str, Arr, Persist, Menu, FBS) {

// ********************************************************************************************* //
// Constants

var animationDuration = 0.8;

// ********************************************************************************************* //
// Breakpoints

Firebug.Breakpoint = Obj.extend(Module,
{
    dispatchName: "breakpoints",

    initialize: function()
    {
        Firebug.connection.addListener(this);
    },

    shutdown: function()
    {
        Firebug.connection.removeListener(this);
    },

    toggleBreakOnNext: function(panel)
    {
        var breakable = Firebug.chrome.getGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable");

        if (FBTrace.DBG_BP)
        {
            FBTrace.sysout("breakpoint.toggleBreakOnNext; currentBreakable " + breakable +
                " in " + panel.context.getName());
        }

        // Toggle button's state.
        breakable = (breakable == "true" ? "false" : "true");
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable", breakable);

        // Call the current panel's logic related to break-on-next.
        // If breakable == "true" the feature is currently disabled.
        var enabled = (breakable == "true" ? false : true);
        panel.breakOnNext(enabled);

        this.updatePanelState(panel);

        return enabled;
    },

    showPanel: function(browser, panel)
    {
        this.updatePanelState(panel);
    },

    onDebuggerEnabled: function()
    {
        var panel = Firebug.chrome.getSelectedPanel();
        this.updatePanelState(panel);
    },

    updatePanelState: function(panel)
    {
        // there is no selectedPanel?
        if (!panel)
            return;

        var breakButton = Firebug.chrome.$("fbBreakOnNextButton");
        if (panel.name)
            breakButton.setAttribute("panelName", panel.name);

        breakButton.removeAttribute("type");
        Dom.collapse(Firebug.chrome.$("fbBonButtons"), !panel.breakable);

        // The script panel can be created at this moment (the second parameter is false)
        // It's needed for break on next to work (do not wait till the user actually
        // selects the panel).
        var scriptPanel = panel.context.getPanel("script");
        var scriptEnabled = scriptPanel && scriptPanel.isEnabled();
        var tool = Firebug.connection.getTool("script");
        var scriptActive = tool && tool.getActive();
        var supported = panel.supportsBreakOnNext();

        // Enable by default and disable if needed.
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "disabled", null);

        // Disable BON if script is disabled or if BON isn't supported by the current panel.
        if (!scriptEnabled || !scriptActive || !supported)
        {
            Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable", "disabled");
            Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "disabled", "true");
            this.updateBreakOnNextTooltips(panel);
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
        Dom.eraseNode(menuPopup);

        Menu.createMenuItems(menuPopup, menuItems);
    },

    toggleTabHighlighting: function(event)
    {
        // Don't continue if it's the wrong animation phase
        if (Math.floor(event.elapsedTime * 10) % (animationDuration * 20) != 0)
            return;

        Events.removeEventListener(event.target, "animationiteration",
            Firebug.Breakpoint.toggleTabHighlighting, true);

        var panel = Firebug.currentContext.getPanel(event.target.panelType.prototype.name);
        if (!panel)
            return;

        if (!panel.context.delayedArmedTab)
            return;

        panel.context.delayedArmedTab.setAttribute("breakOnNextArmed", "true");
        delete panel.context.delayedArmedTab;
    },

    updateBreakOnNextTooltips: function(panel)
    {
        var breakable = Firebug.chrome.getGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable");

        // Get proper tooltip for the break-on-next button from the current panel.
        // If breakable is set to "false" the feature is already activated (throbbing).
        var armed = (breakable == "false");
        var tooltip = panel.getBreakOnNextTooltip(armed);
        if (!tooltip)
            tooltip = "";

        // The user should know that BON is disabled if the Script panel (debugger) is disabled.
        if (breakable == "disabled")
            tooltip += " " + Locale.$STR("firebug.bon.scriptPanelNeeded");

        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "tooltiptext", tooltip);
    },

    updateBreakOnNextState: function(panel, armed)
    {
        // If the panel should break at the next chance, set the button to not breakable,
        // which means already active (throbbing).
        var breakable = armed ? "false" : "true";
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "breakable", breakable);

        // Set the button as 'checked', so it has visual border (see issue 6567).
        var checked = armed ? "true" : "false";
        Firebug.chrome.setGlobalAttribute("cmd_firebug_toggleBreakOn", "checked", checked);
    },

    updatePanelTab: function(panel, armed)
    {
        if (!panel)
            return;

        // If the script panels is disabled, BON can't be active.
        if (!Firebug.PanelActivation.isPanelEnabled("script"))
            armed = false;

        var panelBar = Firebug.chrome.$("fbPanelBar1");
        var tab = panelBar.getTab(panel.name);
        if (tab)
        {
            if (armed)
            {
                // If there is already a panel armed synchronize highlighting of the panel tabs
                var tabPanel = tab.parentNode;
                var otherTabIsArmed = false;
                for (var i = 0; i < tabPanel.children.length; ++i)
                {
                    var panelTab = tabPanel.children[i];
                    if (panelTab !== tab && panelTab.getAttribute("breakOnNextArmed") == "true")
                    {
                        panel.context.delayedArmedTab = tab;
                        Events.addEventListener(panelTab, "animationiteration",
                            this.toggleTabHighlighting, true);
                        otherTabIsArmed = true;
                        break;
                    }
                }

                if (!otherTabIsArmed)
                    tab.setAttribute("breakOnNextArmed", "true");
            }
            else
            {
                delete panel.context.delayedArmedTab;
                tab.setAttribute("breakOnNextArmed", "false");
            }
        }
    },

    updatePanelTabs: function(context)
    {
        if (!context)
            return;

        var panelTypes = Firebug.getMainPanelTypes(context);
        for (var i=0; i<panelTypes.length; ++i)
        {
            var panelType = panelTypes[i];
            var panel = context.getPanel(panelType.prototype.name);
            var shouldBreak = (panel && panel.shouldBreakOnNext()) ? true : false;
            this.updatePanelTab(panel, shouldBreak);
        }
    },

    // supports non-JS break on next
    breakNow: function(panel)
    {
        this.updatePanelTab(panel, false);
        Firebug.Debugger.breakNow(panel.context);  // TODO BTI
    },

    updateOption: function(name, value)
    {
        if (name == "showBreakNotification")
        {
            var panelBar1 = Firebug.chrome.$("fbPanelBar1");
            var doc = panelBar1.browser.contentDocument;
            var checkboxes = doc.querySelectorAll(".doNotShowBreakNotification");

            for (var i=0; i<checkboxes.length; i++)
                checkboxes[i].checked = !value;
        }
    },
});

// ********************************************************************************************* //

with (Domplate) {
Firebug.Breakpoint.BreakpointListRep = domplate(Rep,
{
    tag:
        DIV({role : "list"},
            FOR("group", "$groups",
                DIV({"class": "breakpointBlock breakpointBlock-$group.name", role: "list",
                        $opened: "$group.opened", _repObject: "$group", onclick: "$onClick"},
                    H1({"class": "breakpointHeader groupHeader"},
                        DIV({"class": "twisty", role: "presentation"}),
                        SPAN({"class": "breakpointsHeaderLabel"}, "$group.title")
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

    toggleGroup: function(node)
    {
        var panel = Firebug.getElementPanel(node);
        var groupNode = Dom.getAncestorByClass(node, "breakpointBlock");
        var group = Firebug.getRepObject(groupNode);

        Css.toggleClass(groupNode, "opened");
        var opened = Css.hasClass(groupNode, "opened");
        panel.groupOpened[group.name] = opened;

        if (opened)
        {
            var offset = Dom.getClientOffset(node);
            var titleAtTop = offset.y < panel.panelNode.scrollTop;
            Dom.scrollTo(groupNode, panel.panelNode, null,
                groupNode.offsetHeight > panel.panelNode.clientHeight || titleAtTop ? "top" : "bottom");
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onClick: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        var header = Dom.getAncestorByClass(event.target, "breakpointHeader");
        if (header)
        {
            this.toggleGroup(event.target);
            return;
        }
    }
});

// ********************************************************************************************* //

Firebug.Breakpoint.BreakpointRep = domplate(Rep,
{
    tag:
        DIV({"class": "breakpointRow focusRow", $disabled: "$bp|isDisabled", role: "option",
                "aria-checked": "$bp.checked", _repObject: "$bp", onclick: "$onClick"},
            DIV({"class": "breakpointBlockHead"},
                INPUT({"class": "breakpointCheckbox", type: "checkbox",
                    _checked: "$bp.checked", tabindex : '-1'}),
                SPAN({"class": "breakpointName"}, "$bp.name"),
                TAG(FirebugReps.SourceLink.tag, {object: "$bp|getSourceLink"}),
                SPAN({"class": "closeButton"})
            ),
            DIV({"class": "breakpointCode"}, "$bp.sourceLine")
        ),

    getSourceLink: function(bp)
    {
        return new SourceLink.SourceLink(bp.href, bp.lineNumber, "js");
    },

    removeBreakpoint: function(groupName, href, lineNumber)
    {
        if (groupName == "breakpoints")
            FBS.clearBreakpoint(href, lineNumber);
        else if (groupName == "errorBreakpoints")
            FBS.clearErrorBreakpoint(href, lineNumber);
        else if (groupName == "monitors")
            FBS.unmonitor(href, lineNumber);
    },

    enableBreakpoint: function(href, lineNumber)
    {
        FBS.enableBreakpoint(href, lineNumber);
    },

    disableBreakpoint: function(href, lineNumber)
    {
        FBS.disableBreakpoint(href, lineNumber);
    },

    isDisabled: function(bp)
    {
        return !bp.checked;
    },

    getContextMenuItems: function(breakpoint, target)
    {
        var head = Dom.getAncestorByClass(target, "breakpointBlock");
        var groupName = Css.getClassValue(head, "breakpointBlock");

        var items = [{
            label: "breakpoints.Remove_Breakpoint",
            tooltiptext: "breakpoints.tip.Remove_Breakpoint",
            command: Obj.bindFixed(this.removeBreakpoint, this, groupName,
                breakpoint.href, breakpoint.lineNumber)
        }];

        if (groupName == "breakpoints")
        {
            if (breakpoint.checked)
            {
                items.push({
                    label: "breakpoints.Disable_Breakpoint",
                    tooltiptext: "breakpoints.tip.Disable_Breakpoint",
                    command: Obj.bindFixed(this.disableBreakpoint, this, breakpoint.href,
                        breakpoint.lineNumber)
                });
            }
            else
            {
                items.push({
                    label: "breakpoints.Enable_Breakpoint",
                    tooltiptext: "breakpoints.tip.Enable_Breakpoint",
                    command: Obj.bindFixed(this.enableBreakpoint, this, breakpoint.href,
                        breakpoint.lineNumber)
                });
            }
        }

        items.push(
             "-"
        );

        return items;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    inspectable: false,

    supportsObject: function(object, type)
    {
        return (object instanceof Firebug.Debugger.Breakpoint);  // FIXME moz back end
    },

    onClick: function(event)
    {
        var panel = Firebug.getElementPanel(event.target);

        if (Dom.getAncestorByClass(event.target, "breakpointCheckbox"))
        {
            var node = event.target.parentNode.getElementsByClassName(
                "objectLink-sourceLink").item(0);

            if (!node)
                return;

            var sourceLink = node.repObject;

            panel.noRefresh = true;
            var checkBox = event.target;
            var bpRow = Dom.getAncestorByClass(checkBox, "breakpointRow");

            if (checkBox.checked)
            {
                this.enableBreakpoint(sourceLink.href, sourceLink.line);
                bpRow.setAttribute("aria-checked", "true");
            }
            else
            {
                this.disableBreakpoint(sourceLink.href, sourceLink.line);
                bpRow.setAttribute("aria-checked", "false");
            }
            panel.noRefresh = false;
        }
        else if (Dom.getAncestorByClass(event.target, "closeButton"))
        {
            panel.noRefresh = true;
            var sourceLink = event.target.parentNode.getElementsByClassName(
                "objectLink-sourceLink").item(0).repObject;

            var head = Dom.getAncestorByClass(event.target, "breakpointBlock");
            var groupName = Css.getClassValue(head, "breakpointBlock");

            this.removeBreakpoint(groupName, sourceLink.href, sourceLink.line);

            panel.noRefresh = false;
        }

        panel.refresh();
    }
});
};

// ********************************************************************************************* //

Firebug.Breakpoint.BreakpointsPanel = function() {};

Firebug.Breakpoint.BreakpointsPanel.prototype = Obj.extend(Panel,
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "breakpoints",
    parentPanel: "script",
    order: 2,
    enableA11y: true,
    deriveA11yFrom: "console",

    initialize: function()
    {
        this.groupOpened = [];

        Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        state.groupOpened = this.groupOpened;

        Panel.destroy.apply(this, arguments);
    },

    show: function(state)
    {
        if (this.context.loaded)
        {
            var state = null;
            Persist.restoreObjects(this, state);

            if (state)
            {
                if (state.groupOpened)
                    this.groupOpened = state.groupOpened;
            }
        }

        this.refresh();
    },

    refresh: function()
    {
        if (this.noRefresh)
            return;

        var extracted = this.extractBreakpoints(this.context);

        var breakpoints = extracted.breakpoints;
        var errorBreakpoints = extracted.errorBreakpoints;
        var monitors = extracted.monitors;

        if (FBTrace.DBG_BP)
            FBTrace.sysout("breakpoints.refresh extracted " +
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
            FBTrace.sysout("breakpoints.refresh sorted "+breakpoints.length+
                errorBreakpoints.length+monitors.length, [breakpoints, errorBreakpoints, monitors]);

        var groups = [];

        if (breakpoints.length)
            groups.push({name: "breakpoints", title: Locale.$STR("Breakpoints"),
                breakpoints: breakpoints});

        if (errorBreakpoints.length)
            groups.push({name: "errorBreakpoints", title: Locale.$STR("ErrorBreakpoints"),
                breakpoints: errorBreakpoints});

        if (monitors.length)
            groups.push({name: "monitors", title: Locale.$STR("LoggedFunctions"),
                breakpoints: monitors});

        Firebug.connection.dispatch("getBreakpoints", [this.context, groups]);

        if (groups.length != 0)
        {
            for (var i = 0; i < groups.length; ++i)
            {
                groups[i].opened = typeof this.groupOpened[groups[i].name] != "undefined" ?
                    this.groupOpened[groups[i].name] : true;
            }

            Firebug.Breakpoint.BreakpointListRep.tag.replace({groups: groups}, this.panelNode);
        }
        else
        {
            FirebugReps.Warning.tag.replace({object: "NoBreakpointsWarning"}, this.panelNode);
        }

        if (FBTrace.DBG_BP)
        {
            FBTrace.sysout("breakpoints.refresh "+breakpoints.length+
                errorBreakpoints.length+monitors.length, [breakpoints, errorBreakpoints, monitors]);
        }

        Events.dispatch(this.fbListeners, "onBreakRowsRefreshed", [this, this.panelNode]);
    },

    extractBreakpoints: function(context)
    {
        var breakpoints = [];
        var errorBreakpoints = [];
        var monitors = [];

        var renamer = new SourceFileRenamer(context);
        var Breakpoint = Firebug.Debugger.Breakpoint;

        for (var url in context.sourceFileMap)
        {
            FBS.enumerateBreakpoints(url, {call: function(url, line, props, scripts)
            {
                if (FBTrace.DBG_BP)
                    FBTrace.sysout("breakpoints.extractBreakpoints type: "+props.type+" in url "+
                        url+"@"+line+" context "+context.getName(), props);

                // some url in this sourceFileMap has changed, we'll be back.
                if (renamer.checkForRename(url, line, props))
                    return;

                var isFuture = false;
                var name = "";
                if (scripts)  // then this is a current (not future) breakpoint
                {
                    var script = scripts[0];
                    var analyzer = Firebug.SourceFile.getScriptAnalyzer(context, script);
                    if (FBTrace.DBG_BP)
                        FBTrace.sysout("breakpoints.refresh enumerateBreakpoints for script="+
                            script.tag+(analyzer?" has analyzer":" no analyzer")+" in context "+
                            context.getName());

                    name = analyzer ?
                        analyzer.getFunctionDescription(script, context).name :
                        StackFrame.guessFunctionName(url, 1, context);
                }
                else
                {
                    if (FBTrace.DBG_BP)
                        FBTrace.sysout("breakpoints.refresh enumerateBreakpoints future for url@line="+
                            url+"@"+line+"\n");

                    isFuture = true;
                }

                var source = context.sourceCache.getLine(url, line);
                breakpoints.push(new Breakpoint(name, url, line, !props.disabled, source, isFuture));
            }});

            FBS.enumerateErrorBreakpoints(url, {call: function(url, line, props)
            {
                // some url in this sourceFileMap has changed, we'll be back.
                if (renamer.checkForRename(url, line, props))
                    return;

                var name = Firebug.SourceFile.guessEnclosingFunctionName(url, line, context);
                var source = context.sourceCache.getLine(url, line);
                errorBreakpoints.push(new Breakpoint(name, url, line, true, source));
            }});

            FBS.enumerateMonitors(url, {call: function(url, line, props)
            {
                // some url in this sourceFileMap has changed, we'll be back.
                if (renamer.checkForRename(url, line, props))
                    return;

                var name = Firebug.SourceFile.guessEnclosingFunctionName(url, line, context);
                monitors.push(new Breakpoint(name, url, line, true, ""));
            }});
        }

        var result = null;

        if (renamer.needToRename(context))
        {
            // since we renamed some sourceFiles we need to refresh the breakpoints again.
            result = this.extractBreakpoints(context);
        }
        else
        {
            result = {
                breakpoints: breakpoints,
                errorBreakpoints: errorBreakpoints,
                monitors: monitors
            };
        }

        // even if we did not rename, some bp may be dynamic
        if (FBTrace.DBG_SOURCEFILES)
            FBTrace.sysout("breakpoints.extractBreakpoints context.dynamicURLhasBP: "+
                context.dynamicURLhasBP, result);

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
                {
                    label: "EnableAllBreakpoints",
                    command: Obj.bindFixed(this.enableAllBreakpoints, this, context, true),
                    tooltiptext: "breakpoints.option.tip.Enable_All_Breakpoints"
                }
            );
        }
        if (bpCount && disabledCount != bpCount)
        {
            items.push(
                {
                    label: "DisableAllBreakpoints",
                    command: Obj.bindFixed(this.enableAllBreakpoints, this, context, false),
                    tooltiptext: "breakpoints.option.tip.Disable_All_Breakpoints"
                }
            );
        }

        items.push(
            "-",
            {
                label: "ClearAllBreakpoints",
                disabled: !bpCount,
                command: Obj.bindFixed(this.clearAllBreakpoints, this, context),
                tooltiptext: "breakpoints.option.tip.Clear_All_Breakpoints"
            }
        );

        return items;
    },

    getContextMenuItems: function(object, target, context)
    {
        return this.getOptionsMenuItems();
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
        // These can come from various modules and perhaps extensions, so use
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
    }
});

// ********************************************************************************************* //

function countBreakpoints(context)
{
    var count = 0;
    for (var url in context.sourceFileMap)
    {
        FBS.enumerateBreakpoints(url, {call: function(url, lineNo)
        {
            ++count;
        }});
    }
    return count;
}

// ********************************************************************************************* //

Firebug.Breakpoint.BreakpointGroup = function()
{
    this.breakpoints = [];
};

Firebug.Breakpoint.BreakpointGroup.prototype =
{
    removeBreakpoint: function(bp)
    {
        Arr.remove(this.breakpoints, bp);
    },

    enumerateBreakpoints: function(callback)
    {
        var breakpoints = Arr.cloneArray(this.breakpoints);
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

// ********************************************************************************************* //
// TODO move to mozilla back end

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
};

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
                " callerURL " + callerURL, sourceFile);
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
};

// ********************************************************************************************* //

Firebug.Breakpoint.ConditionEditor = function(doc)
{
    this.initialize(doc);
};

with (Domplate) {
Firebug.Breakpoint.ConditionEditor.prototype = domplate(Firebug.JSEditor.prototype,
{
    tag:
        DIV({"class": "conditionEditor"},
            DIV({"class": "conditionCaption"}, Locale.$STR("ConditionInput")),
            INPUT({"class": "conditionInput completionBox", type: "text",
                tabindex: "-1"}),
            INPUT({"class": "conditionInput completionInput", type: "text",
                "aria-label": Locale.$STR("ConditionInput"),
                oninput: "$onInput", onkeypress: "$onKeyPress"}
            )
        ),

    initialize: function(doc)
    {
        this.box = this.tag.replace({}, doc, this);
        this.input = this.box.getElementsByClassName("completionInput").item(0);

        var completionBox = this.box.getElementsByClassName("completionBox").item(0);
        var options = {
            tabWarnings: true
        };
        this.setupCompleter(completionBox, options);
    },

    show: function(sourceLine, panel, value)
    {
        this.target = sourceLine;
        this.panel = panel;

        this.getAutoCompleter().reset();

        Dom.hide(this.box, true);
        panel.selectedSourceBox.appendChild(this.box);

        this.input.value = value;

        setTimeout(Obj.bindFixed(function()
        {
            var offset = Dom.getClientOffset(sourceLine);

            var bottom = offset.y+sourceLine.offsetHeight;
            var y = bottom - this.box.offsetHeight;
            if (y < panel.selectedSourceBox.scrollTop)
            {
                y = offset.y;
                Css.setClass(this.box, "upsideDown");
            }
            else
            {
                Css.removeClass(this.box, "upsideDown");
            }

            this.box.style.top = y + "px";
            Dom.hide(this.box, false);

            this.input.focus();
            this.input.select();
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    endEditing: function(target, value, cancel)
    {
        if (!cancel)
        {
            var compilationUnit = this.panel.location;
            var lineNo = parseInt(this.target.textContent);
            // TODO rest is mozilla backend
            var sourceFile = compilationUnit.sourceFile;
            FBS.setBreakpointCondition(sourceFile, lineNo, value, Firebug.Debugger);
        }
    }
});

// ********************************************************************************************* //

/**
 * Construct a break notification popup
 * @param doc the document to contain the notification
 * @param cause info object for the popup, with these optional fields:
 *   strings: title, message, attrName
 *   elements: target, relatedTarget: element
 *   objects: prevValue, newValue
 */
Firebug.Breakpoint.BreakNotification = function(doc, cause)
{
    this.document = doc;
    this.cause = cause;
};

Firebug.Breakpoint.BreakNotification.prototype = domplate(Rep,
/** @lends Firebug.ScriptPanel.Notification */
{
    tag:
        DIV({"class": "notificationBox"},
            TABLE({"class": "notificationTable", onclick: "$onHide",
                onmouseover: "$onMouseOver", onmouseout: "$onMouseOut"},
                TBODY(
                    TR(
                        TD({"class": "imageCol"},
                            IMG({"class": "notificationImage",
                                src: "chrome://firebug/skin/breakpoint.png"})
                        ),
                        TD({"class": "descCol"},
                            SPAN({"class": "notificationDesc"}, "$cause|getDescription"),
                            SPAN("&nbsp;"),
                            SPAN({"class": "diff"}, "$cause|getDiff"),
                            SPAN({"class": "targets"}),
                            DIV({"class": "noNotificationDesc"})
                        ),
                        TD({"class": "buttonsCol"},
                            BUTTON({"class": "notificationButton copyButton",
                                onclick: "$onCopyAction",
                                $collapsed: "$cause|hideCopyAction"},
                                Locale.$STR("Copy")
                            ),
                            BUTTON({"class": "notificationButton skipButton",
                                onclick: "$onSkipAction",
                                $collapsed: "$cause|hideSkipAction"},
                                Locale.$STR("script.balloon.Disable")
                            ),
                            BUTTON({"class": "notificationButton okButton",
                                onclick: "$onOkAction",
                                $collapsed: "$cause|hideOkAction"},
                                Locale.$STR("script.balloon.Continue")
                            )
                        ),
                        TD(
                            DIV({"class": "notificationClose", onclick: "$onHide"})
                        )
                    )
                )
            )
        ),

    targets:
        SPAN(
            SPAN("&nbsp;"),
            TAG("$cause|getTargetTag", {object: "$cause.target"}),
            SPAN("&nbsp;"),
            TAG("$cause|getRelatedTargetTag", {object: "$cause.relatedNode"})
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onMouseOver: function(event)
    {
        var target = event.target;
        var box = Dom.getAncestorByClass(target, "notificationBox");
        var close = box.querySelector(".notificationClose");

        // The close button is "active" (red) if the mouse hovers over the notification
        // area except when it hovers over a button or link.
        var localName = target.localName ? target.localName.toLowerCase() : "";
        if (Css.hasClass(target, "notificationButton") || localName == "a")
            close.removeAttribute("active");
        else
            close.setAttribute("active", true);
    },

    onMouseOut: function(event)
    {
        var box = Dom.getAncestorByClass(event.target, "notificationBox");
        var close = box.querySelector(".notificationClose");
        close.removeAttribute("active");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onHide: function(event)
    {
        var notify = this.getNotifyObject(event.target);
        notify.hide();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getDescription: function(cause)
    {
        var str = cause.message + (cause.attrName ? (" '" + cause.attrName + "'") : "");
        if (this.getDiff(cause))
            str += ":";

        return str;
    },

    getTargetTag: function(cause)
    {
        return this.getElementTag(cause.target) || null;
    },

    getRelatedTargetTag: function(cause)
    {
        return this.getElementTag(cause.relatedNode) || null;
    },

    getElementTag: function(node)
    {
        if (node)
        {
            var rep = Firebug.getRep(node);
            if (rep)
                return rep.shortTag || rep.tag;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Button Handlers

    hideCopyAction: function(cause)
    {
        return !cause.copyAction;
    },

    hideSkipAction: function(cause)
    {
        return !cause.skipAction;
    },

    hideOkAction: function(cause)
    {
        return !cause.okAction;
    },

    onCopyAction: function(event)
    {
        var notify = this.getNotifyObject(event.target);
        if (notify.cause.copyAction)
            notify.cause.copyAction();
    },

    onSkipAction: function(event)
    {
        var notify = this.getNotifyObject(event.target);
        if (notify.cause.skipAction)
            notify.cause.skipAction();
    },

    onOkAction: function(event)
    {
        var notify = this.getNotifyObject(event.target);
        if (notify.cause.okAction)
            notify.cause.okAction();
    },

    onCloseAction: function(event)
    {
        var notify = this.getNotifyObject(event.target);
        if (notify.cause.onCloseAction)
            notify.cause.onCloseAction();
        else
            notify.hide(event); // same as click on notify body
    },

    getNotifyObject: function(target)
    {
        var parentNode = Dom.getAncestorByClass(target, "notificationBox");
        return parentNode.repObject;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Action handlers from "do not show again" description

    onClickLink: function(event)
    {
        this.showTabMenu(event);
    },

    disableNotifications: function(event)
    {
        Firebug.setPref(Firebug.prefDomain, "showBreakNotification", false);

        // Hide the notification, but default processing of this event would hide it anyway.
        this.onHide(event);
    },

    showTabMenu: function(event)
    {
        // Open panel's tab menu to show the "Show Break Notifications" option
        // to teach the user where to enable it again.
        var panelBar = Firebug.chrome.$("fbPanelBar1");
        var tab = panelBar.getTab("script");
        tab.tabMenu.showMenu();

        // Avoid default processing that hides the notification popup.
        Events.cancelEvent(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Helpers

    getDiff: function(cause)
    {
        var str = "";

        if (cause.prevValue)
            str += Str.cropString(cause.prevValue, 40) + " -> ";

        if (cause.newValue)
            str += Str.cropString(cause.newValue, 40);

        if (!str.length)
            return "";

        if (!cause.target)
            return str;

        return str;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public

    show: function(parentNode)
    {
        if (FBTrace.DBG_BP)
            FBTrace.sysout("breakNotification.show; " + this.id);

        // Reneder the entire notification box.
        this.box = this.tag.append(this.cause, parentNode, this);
        this.box.repObject = this;

        // Appends the HTML targets dynamically. In case they are null, it breaks
        // click events.
        // xxxHonza: this problem would deserve clarification.
        if (this.cause.target || this.cause.relatedNode)
        {
            var targetsNode = this.box.querySelector(".targets");
            this.targets.replace(this.cause, targetsNode, this);
        }

        // Render "do not show again" text
        var descNode = this.box.querySelector(".noNotificationDesc");
        FirebugReps.Description.render(Locale.$STR("firebug.breakpoint.doNotShowBreakNotification2"),
            descNode, Obj.bind(this.onClickLink, this));

        // Tooltips
        if (this.cause.skipActionTooltip)
            this.box.querySelector(".skipButton").setAttribute("title", this.cause.skipActionTooltip);
        if (this.cause.okActionTooltip)
            this.box.querySelector(".okButton").setAttribute("title", this.cause.okActionTooltip);
        if (this.cause.copyActionTooltip)
            this.box.querySelector(".copyButton").setAttribute("title", this.cause.copyActionTooltip);

        // xxxHonza: disable the animation, the interval seems to be frozen during debugger break.
        this.box.style.top = "0";
        return;

        // Animation
        var self = this;
        var delta = Math.max(3, Math.floor(this.box.clientHeight/5));
        var clientHeight = this.box.clientHeight;

        this.box.style.top = -clientHeight + "px";
        var interval = setInterval(function slide(event)
        {
            var top = parseInt(self.box.style.top, 10);
            if (top >= 0)
            {
                clearInterval(interval);
            }
            else
            {
                var newTop = (top + delta) > 0 ? 0 : (top + delta);
                self.box.style.top = newTop + "px";
            }
        }, 15);

        return this.box;
    },

    hide: function()
    {
        if (FBTrace.DBG_BP)
            FBTrace.sysout("breakNotification.hide;");

        // xxxHonza: disable the animation, the interval seems to be frozen during debugger break.
        if (this.box.parentNode)
            this.box.parentNode.removeChild(this.box);
        return;

        // Animation
        var self = this;
        var delta = Math.max(3, Math.floor(this.box.clientHeight/5));
        var clientHeight = this.box.clientHeight;
        var top = 0;

        var interval = setInterval(function slide(event)
        {
            top = top - delta;
            if (top < -clientHeight)
            {
                clearInterval(interval);

                if (self.box.parentNode)
                    self.box.parentNode.removeChild(self.box);
            }
            else
            {
                self.box.style.top = top + "px";
            }
        }, 15);
    }
});
};

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(Firebug.Breakpoint.BreakpointsPanel);
Firebug.registerRep(Firebug.Breakpoint.BreakpointRep);
Firebug.registerModule(Firebug.Breakpoint);

return Firebug.Breakpoint;

// ********************************************************************************************* //
});
