/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false */
/*global FBTrace:true, XPCNativeWrapper:true, Window:true, define:true */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/array",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/lib/domplate",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/string",
    "firebug/lib/locale",
    "firebug/lib/system",
    "firebug/dom/toggleBranch",
    "firebug/dom/domEditor",
    "firebug/dom/domReps",
    "firebug/dom/domModule",
    "firebug/chrome/menu",
    "firebug/chrome/panel",
    "firebug/chrome/searchBox",
    "firebug/chrome/panelActivation",
    "firebug/debugger/script/sourceLink",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/debuggerLib",
    "firebug/editor/editor",
    "firebug/console/commandLine",
    "firebug/console/autoCompleter",
    "firebug/console/closureInspector",
],
function(Firebug, FBTrace, Obj, Arr, Events, Wrapper, Domplate, Dom, Css, Str, Locale, System,
    ToggleBranch, DOMEditor, DOMReps, DOMModule, Menu, Panel, SearchBox, PanelActivation,
    SourceLink, StackFrame, DebuggerLib, Editor, CommandLine, JSAutoCompleter, ClosureInspector) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, DIV, SPAN} = Domplate;

var rxIdentifier = /^[$_A-Za-z][$_A-Za-z0-9]*$/;

var Trace = FBTrace.to("DBG_DOM");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //

/**
 * @panel Base object for panels displaying hierarchy of DOM objects. This object is currently
 * used as the super object for the following panels:
 *
 * {@DOMPanel} - the main DOM panel
 * {@WatchPanel} - the Watch side panel within the Script panel.
 * {@DOMSidePanel} - the DOM side panel within the HTML panel.
 */
Firebug.DOMBasePanel = function()
{
}

Firebug.DOMBasePanel.prototype = Obj.extend(Panel,
/** @lends Firebug.DOMBasePanel */
{
    // xxxHonza: Backward compatibility with extensions (Illumination, spy_eye)
    // amfExplorer.js is using getRowProperty.
    tag: DOMReps.DirTablePlate.tableTag,
    dirTablePlate: DOMReps.DirTablePlate,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Domplate

    readOnlyInfoTipTag:
        DIV({"class": "readOnlyInfoTip"},
            DIV({"class": "$desc.configurable"}, "configurable"),
            DIV({"class": "$desc.enumerable"}, "enumerable"),
            DIV({"class": "$desc.writable"}, "writable"),
            DIV({"class": "$desc.set"}, "setter"),
            DIV({"class": "$desc.get"}, "getter")
        ),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        this.toggles = new ToggleBranch.ToggleBranch();
        this.scrollTop = 0;

        Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        Panel.destroy.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    supportsObject: function(object, type)
    {
        if (type == "number" || type == "string" || type == "boolean")
            return 0;

        if (object == null)
            return 1000;
        else if (object instanceof SourceLink)
            return 0;
        else
            return 1; // just agree to support everything but not aggressively.
    },

    refresh: function()
    {
        var scrollTop = this.panelNode.scrollTop;
        var toggles = new ToggleBranch.ToggleBranch();
        this.tree.saveState(toggles);

        this.rebuild(false, scrollTop, toggles);
    },

    updateSelection: function(object)
    {
        this.rebuild(false);
    },

    getDefaultSelection: function()
    {
        // Default to showing the top window.
        return Wrapper.getContentView(this.context.window);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Options

    updateOption: function(name, value)
    {
        var options = new Set();

        options.add("showUserProps");
        options.add("showUserFuncs");
        options.add("showDOMProps");
        options.add("showDOMFuncs");
        options.add("showDOMConstants");
        options.add("showInlineEventHandlers");
        options.add("showClosures");
        options.add("showOwnProperties");
        options.add("showEnumerableProperties");

        if (options.has(name))
            this.rebuild(true);
    },

    getShowClosuresMenuItem: function()
    {
        var requireScriptPanel = DebuggerLib._closureInspectionRequiresDebugger();
        var label = Locale.$STR("ShowClosures");
        var tooltip = Locale.$STR("dom.option.tip.Show_Closures2");
        if (requireScriptPanel)
            tooltip = Locale.$STRF("script.Script_panel_must_be_enabled", [tooltip]);
        var menuItem = Menu.optionMenu(label, "showClosures", tooltip);
        menuItem.nol10n = true;
        if (requireScriptPanel && !PanelActivation.isPanelEnabled(Firebug.getPanelType("script")))
            menuItem.disabled = true;
        return menuItem;
    },

    getOptionsMenuItems: function()
    {
        return [
            Menu.optionMenu("ShowUserProps", "showUserProps",
                "dom.option.tip.Show_User_Props"),
            Menu.optionMenu("ShowUserFuncs", "showUserFuncs",
                "dom.option.tip.Show_User_Funcs"),
            Menu.optionMenu("ShowDOMProps", "showDOMProps",
                "dom.option.tip.Show_DOM_Props"),
            Menu.optionMenu("ShowDOMFuncs", "showDOMFuncs",
                "dom.option.tip.Show_DOM_Funcs"),
            Menu.optionMenu("ShowDOMConstants", "showDOMConstants",
                "dom.option.tip.Show_DOM_Constants"),
            Menu.optionMenu("ShowInlineEventHandlers", "showInlineEventHandlers",
                "ShowInlineEventHandlersTooltip"),
            this.getShowClosuresMenuItem(),
            "-",
            Menu.optionMenu("ShowOwnProperties", "showOwnProperties",
                "ShowOwnPropertiesTooltip"),
            Menu.optionMenu("ShowEnumerableProperties",
                "showEnumerableProperties", "ShowEnumerablePropertiesTooltip"),
            "-",
            {label: "Refresh", command: Obj.bindFixed(this.refresh, this),
                tooltiptext: "panel.tip.Refresh"}
        ];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    getContextMenuItems: function(object, target)
    {
        Trace.sysout("dom.getContextMenuItems;");

        var row = Dom.getAncestorByClass(target, "memberRow");

        var items = [];

        if (row && row.domObject && !row.domObject.ignoredPath)
        {
            var member = row.domObject;
            var rowName = member.name;
            var rowObject = member.object;
            var rowValue = member.value;

            var isStackFrame = rowObject instanceof StackFrame;
            var label, tooltiptext;

            items.push(
                "-",
                {
                    label: "Copy_Name",
                    tooltiptext: "dom.tip.Copy_Name",
                    command: Obj.bindFixed(this.copyName, this, row)
                },
                {
                    label: "Copy_Path",
                    tooltiptext: "dom.tip.Copy_Path",
                    command: Obj.bindFixed(this.copyPath, this, row)
                }
            );

            if (typeof rowValue === "string" || typeof rowValue === "number")
            {
                // Functions already have a copy item in their context menu
                items.push(
                    {
                        label: "CopyValue",
                        tooltiptext: "dom.tip.Copy_Value",
                        command: Obj.bindFixed(this.copyProperty, this, row)
                    }
                );
            }

            if (isStackFrame)
            {
                label = "EditVariable";
                tooltiptext = "stack.tip.Edit_Variable";
            }
            else
            {
                label = "EditProperty";
                tooltiptext = "dom.tip.Edit_Property";
            }

            var readOnly = (!isStackFrame && !!member.readOnly);
            if (!readOnly)
            {
                items.push(
                    "-",
                    {
                        label: label,
                        id: "EditDOMProperty",
                        tooltiptext: tooltiptext,
                        command: Obj.bindFixed(this.editProperty, this, row)
                    }
                );
            }

            if (member.deletable && !isStackFrame)
            {
                items.push(
                    {
                        label: "DeleteProperty",
                        id: "DeleteProperty",
                        tooltiptext: "dom.tip.Delete_Property",
                        command: Obj.bindFixed(this.deleteProperty, this, row)
                    }
                );
            }

            if (member.breakable && !Dom.isDOMMember(rowObject, rowName))
            {
                var bps = this.context.dom.breakpoints;
                var hasBreakpoint = bps.findBreakpoint(rowObject, rowName);

                items.push(
                    "-",
                    {
                        label: "dom.label.breakOnPropertyChange",
                        tooltiptext: "dom.tip.Break_On_Property_Change",
                        type: "checkbox",
                        checked: hasBreakpoint,
                        command: Obj.bindFixed(this.breakOnProperty, this, row)
                    }
                );
            }
        }

        items.push(
            "-",
            {
                label: "Refresh",
                tooltiptext: "panel.tip.Refresh",
                command: Obj.bindFixed(this.refresh, this)
            }
        );

        return items;
    },

    getEditor: function(target, value)
    {
        if (!this.editor)
            this.editor = new DOMEditor(this.document);

        return this.editor;
    },

    normalizeSelection: function(object)
    {
        // Unwrap everything we show in the DOM panel - exposing chrome views
        // of objects to the user doesn't make sense.
        return this.getObjectView(object);
    },

    getObjectView: function(object)
    {
        return Wrapper.unwrapObject(object);
    },

    // xxxHonza: |update| argument is obsolete?
    rebuild: function(update, scrollTop, toggles)
    {
        Trace.sysout("domBasePanel.rebuild; scrollTop: " + scrollTop);

        Events.dispatch(this.fbListeners, "onBeforeDomUpdateSelection", [this]);

        var input = {
            object: this.selection,
            domPanel: this,
        };

        this.tree.replace(this.panelNode, input);

        // Restore presentation state if possible.
        if (toggles)
        {
            this.tree.restoreState(toggles).then(() =>
            {
                // Scroll position must be set after the tree is completely restored
                // (and so, the scroll offset exists).
                if (scrollTop)
                    this.panelNode.scrollTop = scrollTop;
            });
        }

        // Display no-members message.
        if (this.tree.isEmpty())
            FirebugReps.Warning.tag.replace({object: "NoMembersWarning"}, this.panelNode);
    },

    getRowObject: function(row)
    {
        var object = getRowOwnerObject(row);
        return object ? object : this.selection;
    },

    getRealRowObject: function(row)
    {
        return this.getRowObject(row);
    },

    getRowPropertyValue: function(row)
    {
        var object = this.getRealRowObject(row);
        return this.getObjectPropertyValue(object, row.domObject.name);
    },

    getObjectPropertyValue: function(object, propName)
    {
        if (!object)
            return;

        // Get the value with try-catch statement. This method is used also within
        // getContextMenuItems where the exception would break the context menu.
        // 1) The Firebug.Debugger.evaluate can throw
        // 2) object[propName] can also throws in case of e.g. non existing "abc.abc" prop name.
        try
        {
            if (typeof(object) == "function")
                return Firebug.Debugger.evaluate(propName, this.context);
            else if (object instanceof StackFrame)
                return Firebug.Debugger.evaluate(propName, this.context);
            else
                return object[propName];
        }
        catch (err)
        {
            TraceError.sysout("dom.getObjectPropertyValue; EXCEPTION " + propName, object);
        }
    },

    getRowPathName: function(row)
    {
        var member = row.domObject;
        var name = member.name + "";

        // The name should be always set.
        if (!name)
            TraceError.sysout("domBasePanel.getRowPathName; ERROR missing tree-member name!");

        // Fake "(closure)" properties.
        if (member.ignoredPath)
            return ["", ""];

        // Closure variables.
        if (ClosureInspector.isScopeWrapper(member.object))
            return [".%", name];

        // Ordinals.
        if (name.match(/^[\d]+$/))
            return ["", "[" + name + "]"];

        // Identifiers.
        if (name.match(rxIdentifier))
            return [".", name];

        // Other, weird, names.
        return ["", "[\"" + name.replace(/\\/g, "\\\\").replace(/"/g,"\\\"") + "\"]"];
    },

    copyName: function(row)
    {
        var value = this.getRowPathName(row);

        // don't want the separator
        value = value[1];

        System.copyToClipboard(value);
    },

    copyPath: function(row)
    {
        var path = this.getPropertyPath(row);
        System.copyToClipboard(path.join(""));
    },

    /**
     * Walk from the current row up to the most ancient parent, building an array.
     * @return array of property names and separators, eg ['foo','.','bar'].
     */
    getPropertyPath: function(row)
    {
        var path = [];
        for (var current = row; current; current = getParentRow(current))
            path = this.getRowPathName(current).concat(path);

        // don't want the first separator
        path.shift();

        return path;
    },

    copyProperty: function(row)
    {
        var value = this.getRowPropertyValue(row);
        System.copyToClipboard(value);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Property Edit/Delete/Set

    editProperty: function(row, editValue)
    {
        var member = row.domObject;
        if (member && member.readOnly)
            return;

        var object = this.getRowObject(row);
        this.context.thisValue = object;

        if (!editValue)
        {
            var propValue = this.getRowPropertyValue(row);

            var type = typeof propValue;
            if (type === "undefined" || type === "number" || type === "boolean")
                editValue = String(propValue);
            else if (type === "string")
                editValue = "\"" + Str.escapeJS(propValue) + "\"";
            else if (propValue === null)
                editValue = "null";
            else if (object instanceof window.Window || object instanceof StackFrame)
                editValue = getRowName(row);
            else
                editValue = "this." + getRowName(row); // XXX "this." doesn't actually work
        }

        var selectionData = null;
        if (type === "string")
            selectionData = {start: 1, end: editValue.length-1};

        Editor.startEditing(row, editValue, null, selectionData);
    },

    deleteProperty: function(row)
    {
        var member = row.domObject;
        var object = member.object;
        var name = member.name;

        if (member.deletable)
        {
            try
            {
                while (object && !Obj.contentObjectHasOwnProperty(object, name))
                    object = Object.getPrototypeOf(object);

                if (object)
                    delete object[name];
            }
            catch (exc)
            {
                return;
            }

            this.rebuild(true);
            this.markChange();
        }
    },

    /**
     * Used for changing value through DOM panel editor.
     *
     * @param {TableRow} the edited row
     * @param {String} A new value, it must be a string.
     */
    setPropertyValue: function(row, value)
    {
        var member = row.domObject;
        var name = member.name;

        Trace.sysout("domBasePanel.setPropertyValue; " + name + " set to " +
            (typeof value === "string" ? "\"" + value + "\"" : "non-string!?!?"), row);

        if (name === "this")
            return;

        var object = this.getRealRowObject(row);

        function success(result, context)
        {
            Trace.sysout("domBasePanel.setPropertyValue; evaluate success object[" + name + "]" +
                " set to type " + typeof result, result);

            object[name] = result;
        }

        function failure(exc, context)
        {
            Trace.sysout("domBasePanel.setPropertyValue; evaluation FAILED " + exc, exc);

            try
            {
                // If the value doesn't parse, then just store it as a string.
                // Some users will not realize they're supposed to enter a JavaScript
                // expression and just type literal text
                object[name] = value;
            }
            catch (exc)
            {
            }
        }

        if (object && !(object instanceof StackFrame) && typeof(object) !== "function")
        {
            CommandLine.evaluate(value, this.context, object, null, success, failure,
                {noStateChange: true});
        }
        else if (this.context.stopped)
        {
            try
            {
                CommandLine.evaluate(name + "=" + value, this.context, null,
                    null, null, null, {noStateChange: true});
            }
            catch (exc)
            {
                try
                {
                    // See the comment in the failure function.
                    object[name] = value;
                }
                catch (exc)
                {
                    return;
                }
            }
        }

        this.refresh();
        this.markChange();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DOM Breakpoints

    breakOnProperty: function(row)
    {
        Trace.sysout("domBasePanel.breakOnProperty;");

        var member = row.domObject;
        if (!member)
            return;

        // Bail out if this property is not breakable.
        if (!member.breakable)
            return;

        // xxxHonza: this is specific to the Watch panel.
        var name = member.name;
        if (name === "this")
            return;

        // Toggle breakpoint on the clicked row. {@DOMModule} will perform the action
        // and also fire corresponding event that should be handled by specific
        // panels to update the UI.
        var object = this.getRowObject(row);
        if (object)
            DOMModule.toggleBreakpoint(this.context, object, name);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Info Tips

    showInfoTip: function(infoTip, target, x, y, rangeParent, rangeOffset)
    {
        if (Dom.getAncestorByClass(target, "memberValueIcon"))
            return this.populateReadOnlyInfoTip(infoTip, target);

        // Do not show anything.
        return false;
    },

    populateReadOnlyInfoTip: function(infoTip, target)
    {
        // We can't use Firebug.getRepObject to find the |member| object since
        // tree rows are using repIgnore flag (to properly populate context menus).
        // (see also issue 7337)
        var row = Dom.getAncestorByClass(target, "memberRow");
        var member = row.repObject;
        if (!member.descriptor)
        {
            // xxxHonza: this happens quite often why?
            // FBTrace.sysout("no descriptor? " + member.name, member)
            return false;
        }

        var input = {
            configurable: member.descriptor.configurable ? "yes" : "no",
            enumerable: member.descriptor.enumerable ? "yes" : "no",
            writable: member.descriptor.writable ? "yes" : "no",
            get: member.descriptor.get ? "yes" : "no",
            set: member.descriptor.set ? "yes" : "no",
        }

        this.readOnlyInfoTipTag.replace({desc: input}, infoTip);

        return true;
    },

    populateBreakpointInfoTip: function(infoTip, target)
    {
        var lineNo = this.scriptView.getLineIndex(target);
        var bp = BreakpointStore.findBreakpoint(this.getCurrentURL(), lineNo);
        if (!bp)
            return false;

        var expr = bp.condition;
        if (!expr)
            return false;

        if (expr == this.infoTipExpr)
            return true;

        BreakpointInfoTip.render(infoTip, expr);

        this.infoTipExpr = expr;

        return true;
    },
});

// ********************************************************************************************* //
// Local Helpers

function getRowName(row)
{
    // xxxHonza: DomBaseTree.getRowName() should replace this function (it has the same logic)

    // XXX This can return not only property names but also just descriptive ones,
    // like "(closure)", and indeed the collapse remembering logic relies on that.
    var labelNode = row.getElementsByClassName("memberLabelCell").item(0);
    return labelNode.textContent;
}

function getRowValue(row)
{
    var valueNode = row.getElementsByClassName("memberValueCell").item(0);
    return valueNode.firstChild.repObject;
}

function getRowOwnerObject(row)
{
    var parentRow = getParentRow(row);
    if (parentRow)
        return getRowValue(parentRow);
}

function getParentRow(row)
{
    var level = String(parseInt(row.getAttribute("level"), 10) - 1);
    if (level === "-1")
        return;

    for (row = row.previousSibling; row; row = row.previousSibling)
    {
        if (row.getAttribute("level") === level)
            return row;
    }
}

// ********************************************************************************************* //
// Registration

return Firebug.DOMBasePanel;

// ********************************************************************************************* //
});
