/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false */
/*global FBTrace:true, XPCNativeWrapper:true, Window:true, define:true */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/array",
    "firebug/chrome/rep",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/debugger/script/sourceLink",
    "firebug/debugger/stack/stackFrame",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/string",
    "firebug/lib/persist",
    "firebug/console/closureInspector",
    "firebug/dom/toggleBranch",
    "firebug/lib/system",
    "firebug/chrome/menu",
    "firebug/dom/domEditor",
    "firebug/dom/domReps",
    "firebug/chrome/panel",
    "firebug/console/commandLine",
    "firebug/editor/editor",
    "firebug/chrome/searchBox",
    "firebug/dom/domModule",
    "firebug/console/autoCompleter",
],
function(Firebug, FBTrace, Obj, Arr, Rep, Locale, Events, Wrapper, SourceLink, StackFrame,
    Dom, Css, Str, Persist, ClosureInspector, ToggleBranch, System, Menu,
    DOMEditor, DOMReps, Panel, CommandLine, Editor,
    SearchBox, DOMModule, JSAutoCompleter) {

"use strict";

// ********************************************************************************************* //
// Constants

var rxIdentifier = /^[$_A-Za-z][$_A-Za-z0-9]*$/;

var Trace = FBTrace.to("DBG_DOM");
var TraceError = FBTrace.to("DBG_ERRORS");

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
    // Initialization

    initialize: function()
    {
        // Object path in the toolbar.
        // xxxHonza: the persistence of the object-path would deserve complete refactoring.
        // The code is messy and hard to understand. The logic should be also moved to
        // DOM Panel since it doesn't make sense for the WatchPanel that is derived from
        // DOMBasePanel object.
        //
        // There are three arrays used to maintain the presentation state of the DOM panel
        // objectPath: list of objects displayed in the panel's toolbar. This array is directly
        //          used by FirebugChrome.syncStatusPath() that asks for it through
        //          panel.getObjectPath();
        // propertyPath: list of property names that are displayed in the toolbar (status-path)
        //          These are used to reconstruct the objectPath array after page reload.
        //          (after page reload we need to deal with new page objects).
        // viewPath: list of structures that contains (a) presentation state of the tree
        //          and (b) vertical scroll position - one for each corresponding object
        //          in the current path.
        //
        // I think that length of these arrays should be always the same, but it isn't true.
        // There is also a pathIndex member that indicates the currently selected object
        // in the status path (the one that is displayed in bold font).
        this.objectPath = [];
        this.propertyPath = [];
        this.viewPath = [];
        this.pathIndex = -1;

        Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        var view = this.viewPath[this.pathIndex];
        if (view && this.panelNode.scrollTop)
            view.scrollTop = this.panelNode.scrollTop;

        if (this.pathIndex > -1)
            state.pathIndex = this.pathIndex;
        if (this.viewPath)
            state.viewPath = this.viewPath;
        if (this.propertyPath)
            state.propertyPath = this.propertyPath;

        if (this.propertyPath.length > 0 && !this.propertyPath[1])
            state.firstSelection = Persist.persistObject(this.getPathObject(1), this.context);

        // Save tree state into the right toggles object.
        var toggles = view ? view.toggles : this.toggles;
        this.tree.saveState(toggles);

        state.toggles = this.toggles;

        Panel.destroy.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    show: function(state)
    {
        this.showToolbarButtons("fbStatusButtons", true);

        if (!this.selection)
        {
            if (!state)
            {
                this.select(null);
                return;
            }

            if (state.pathIndex > -1)
                this.pathIndex = state.pathIndex;
            if (state.viewPath)
                this.viewPath = state.viewPath;
            if (state.propertyPath)
                this.propertyPath = state.propertyPath;

            if (state.toggles)
                this.toggles = state.toggles;

            var defaultObject = this.getDefaultSelection();
            var selectObject = defaultObject;

            if (state.firstSelection)
            {
                var restored = state.firstSelection(this.context);
                if (restored)
                {
                    selectObject = restored;
                    this.objectPath = [defaultObject, restored];
                }
                else
                {
                    this.objectPath = [defaultObject];
                }
            }
            else
            {
                this.objectPath = [defaultObject];
            }

            if (this.propertyPath.length > 1)
            {
                selectObject = this.resetPaths(selectObject);
            }
            else
            {
                // Sync with objectPath always containing a default object.
                this.propertyPath.push(null);
            }

            var selection = (state.pathIndex < this.objectPath.length ?
                this.getPathObject(state.pathIndex) :
                this.getPathObject(this.objectPath.length-1));

            Trace.sysout("dom.show; selection:", selection);

            this.select(selection);
        }
    },

    resetPaths: function(selectObject)
    {
        for (var i = 1; i < this.propertyPath.length; i++)
        {
            var name = this.propertyPath[i];
            if (!name)
                continue;

            var object = selectObject;
            try
            {
                selectObject = object[name];
            }
            catch (exc)
            {
                selectObject = null;
            }

            if (selectObject)
            {
                this.objectPath.push(new PropertyObj(object, name));
            }
            else
            {
                // If we can't access a property, just stop
                this.viewPath.splice(i);
                this.propertyPath.splice(i);
                this.objectPath.splice(i);
                selectObject = this.getPathObject(this.objectPath.length-1);
                break;
            }
        }
    },

    hide: function()
    {
        var view = this.viewPath[this.pathIndex];
        if (view && this.panelNode.scrollTop)
            view.scrollTop = this.panelNode.scrollTop;
    },

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
        this.rebuild(true);
    },

    updateSelection: function(object)
    {
        var previousIndex = this.pathIndex;
        var previousView = (previousIndex === -1 ? null : this.viewPath[previousIndex]);

        // xxxHonza: this looks like a hack, pathToAppend is set within {@DomPanel.onClick}
        // Another reason why the related code should belong to the DOMPanel.
        var newPath = this.pathToAppend;
        delete this.pathToAppend;

        var pathIndex = this.findPathIndex(object);
        if (newPath || pathIndex === -1)
        {
            this.toggles = new ToggleBranch.ToggleBranch();

            if (newPath)
            {
                // Remove everything after the point where we are inserting, so we
                // essentially replace it with the new path
                if (previousView)
                {
                    if (this.panelNode.scrollTop)
                        previousView.scrollTop = this.panelNode.scrollTop;

                    this.objectPath.splice(previousIndex+1);
                    this.propertyPath.splice(previousIndex+1);
                    this.viewPath.splice(previousIndex+1);
                }

                var value = this.getPathObject(previousIndex);
                if (!value)
                {
                    TraceError.sysout("dom.updateSelection no pathObject for " + previousIndex);
                    return;
                }

                // XXX This is wrong with closures, but I haven't noticed anything
                // break and I don't know how to fix, so let's just leave it...
                for (var i = 0; i < newPath.length; i++)
                {
                    var name = newPath[i];
                    object = value;

                    try
                    {
                        value = value[name];
                    }
                    catch (exc)
                    {
                        TraceError.sysout("dom.updateSelection FAILS at path_i=" + i +
                            " for name: " + name);
                        return;
                    }

                    this.pathIndex++;

                    this.objectPath.push(new PropertyObj(object, name));
                    this.propertyPath.push(name);
                    this.viewPath.push({toggles: this.toggles, scrollTop: 0});
                }
            }
            else
            {
                this.toggles = new ToggleBranch.ToggleBranch();

                var win = this.getDefaultSelection();
                if (object === win)
                {
                    this.pathIndex = 0;
                    this.objectPath = [win];
                    this.propertyPath = [null];
                    this.viewPath = [{toggles: this.toggles, scrollTop: 0}];
                }
                else
                {
                    this.pathIndex = 1;
                    this.objectPath = [win, object];
                    this.propertyPath = [null, null];
                    this.viewPath = [
                        {toggles: new ToggleBranch.ToggleBranch(), scrollTop: 0},
                        {toggles: this.toggles, scrollTop: 0}
                    ];
                }
            }

            this.panelNode.scrollTop = 0;
            this.rebuild(false);
        }
        else
        {
            this.pathIndex = pathIndex;

            var view = this.viewPath[pathIndex];

            this.toggles = view ? view.toggles : this.toggles;

            // Persist the current scroll location
            if (previousView && this.panelNode.scrollTop)
                previousView.scrollTop = this.panelNode.scrollTop;

            this.rebuild(false, view ? view.scrollTop : 0);
        }
    },

    getObjectPath: function(object)
    {
        return this.objectPath;
    },

    getDefaultSelection: function()
    {
        // Default to showing the top window.
        return this.getObjectView(this.context.window);
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
            Menu.optionMenu("ShowClosures", "showClosures",
                "dom.option.tip.Show_Closures"),
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

            var isWatch = Css.hasClass(row, "watchRow");
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

            if (isWatch)
            {
                label = "EditWatch";
                tooltiptext = "watch.tip.Edit_Watch";
            }
            else if (isStackFrame)
            {
                label = "EditVariable";
                tooltiptext = "stack.tip.Edit_Variable";
            }
            else
            {
                label = "EditProperty";
                tooltiptext = "dom.tip.Edit_Property";
            }

            var readOnly = (!isWatch && !isStackFrame && member.readOnly);
            if (!readOnly)
            {
                items.push(
                    "-",
                    {
                        label: label,
                        tooltiptext: tooltiptext,
                        command: Obj.bindFixed(this.editProperty, this, row)
                    }
                );
            }

            var isDomMemeber = Dom.isDOMMember(rowObject, rowName);

            if (isWatch || (member.deletable && !isStackFrame && !isDomMemeber))
            {
                items.push(
                    {
                        label: isWatch ? "DeleteWatch" : "DeleteProperty",
                        id: "DeleteProperty",
                        tooltiptext: isWatch ? "watch.tip.Delete_Watch" :
                            "dom.tip.Delete_Property",
                        command: Obj.bindFixed(this.deleteProperty, this, row)
                    }
                );
            }

            if (!isDomMemeber && member && member.breakable)
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
                command: Obj.bindFixed(this.rebuild, this)
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

    getObjectView: function(object)
    {
        if (!Firebug.viewChrome)
        {
            // Unwrap native, wrapped objects.
            var contentView = Wrapper.getContentView(object);
            if (contentView)
                return contentView;
        }

        return object;
    },

    rebuild: function(update, scrollTop)
    {
        Trace.sysout("domBasePanel.rebuild;");

        Events.dispatch(this.fbListeners, "onBeforeDomUpdateSelection", [this]);

        var input = {
            object: this.selection,
            domPanel: this,
        };

        this.tree.replace(this.panelNode, input);
        this.tree.restoreState(input, this.toggles);

        // xxxHonza: show a message if there are no DOM members
        // FirebugReps.Warning.tag.replace({object: "NoMembersWarning"}, this.panelNode);
    },

    findPathIndex: function(object)
    {
        var pathIndex = -1;
        for (var i = 0; i < this.objectPath.length; ++i)
        {
            if (this.getPathObject(i) === object)
                return i;
        }

        return -1;
    },

    getPathObject: function(index)
    {
        var object = this.objectPath[index];
        if (object instanceof PropertyObj)
            return object.getObject();
        else
            return object;
    },

    getRowObject: function(row)
    {
        var object = getRowOwnerObject(row);
        return object ? object : this.selection;
    },

    getRealRowObject: function(row)
    {
        var object = this.getRowObject(row);
        return this.getObjectView(object);
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
        for (var current = row; current ; current = getParentRow(current))
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

        if (Css.hasClass(row, "watchNewRow"))
        {
            Editor.startEditing(row, "");
        }
        else if (Css.hasClass(row, "watchRow"))
        {
            Editor.startEditing(row, getRowName(row));
        }
        else
        {
            var object = this.getRowObject(row);
            this.context.thisValue = object;

            if (!editValue)
            {
                var propValue = this.getRowPropertyValue(row);

                var type = typeof propValue;
                if (type === "undefined" || type === "number" || type === "boolean")
                    editValue = "" + propValue;
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
        }
    },

    deleteProperty: function(row)
    {
        if (Css.hasClass(row, "watchRow"))
        {
            this.deleteWatch(row);
        }
        else
        {
            var member = row.domObject;
            var object = this.getObjectView(member.object);

            if (member.deletable)
            {
                try
                {
                    delete object[member.name];
                }
                catch (exc)
                {
                    return;
                }

                this.rebuild(true);
                this.markChange();
            }
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

        Trace.sysout("setPropertyValue: " + name + " set to " +
            (typeof value === "string" ? "\"" + value + "\"" : "non-string!?!?"), row);

        if (name === "this")
            return;

        var object = this.getRealRowObject(row);

        function success(result, context)
        {
            Trace.sysout("setPropertyValue evaluate success object[" + name + "]" +
                " set to type " + typeof result, result);

            object[name] = result;
        }

        function failure(exc, context)
        {
            Trace.sysout("setPropertyValue evaluate FAILED", exc);

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

        if (object && !(object instanceof StackFrame) && !(typeof(object) === "function"))
        {
            CommandLine.evaluate(value, this.context, object, this.context.getCurrentGlobal(),
                success, failure, {noStateChange: true});
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

    getBreakOnNextTooltip: function(enabled)
    {
        return (enabled ? Locale.$STR("dom.disableBreakOnPropertyChange") :
            Locale.$STR("dom.label.breakOnPropertyChange"));
    },

    breakOnProperty: function(row)
    {
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

        // Toggle breakpoint on the clicked row. {@DOMModule} will peform the action
        // and also fire corresponding event that should be handled by specific
        // panels to update the UI.
        var object = this.getRowObject(row);
        if (object)
            DOMModule.toggleBreakpoint(this.context, object, name);
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
    var level = "" + (parseInt(row.getAttribute("level"), 10) - 1);
    if (level === "-1")
        return;

    for (row = row.previousSibling; row; row = row.previousSibling)
    {
        if (row.getAttribute("level") === level)
            return row;
    }
}

// ********************************************************************************************* //

var Property = domplate(Rep,
{
    supportsObject: function(object, type)
    {
        return object instanceof PropertyObj;
    },

    getRealObject: function(prop, context)
    {
        return prop.object[prop.name];
    },

    getTitle: function(prop, context)
    {
        return prop.name;
    }
});

// ********************************************************************************************* //

var PropertyObj = function(object, name)
{
    this.object = object;
    this.name = name;

    this.getObject = function()
    {
        return object[name];
    };
};

// ********************************************************************************************* //
// Registration

Firebug.registerRep(Property);

return Firebug.DOMBasePanel;

// ********************************************************************************************* //
});
