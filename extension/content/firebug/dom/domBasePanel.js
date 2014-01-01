/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false */
/*global FBTrace:true, XPCNativeWrapper:true, Window:true, define:true */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/reps",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/js/sourceLink",
    "firebug/js/stackFrame",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/search",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/lib/persist",
    "firebug/console/closureInspector",
    "firebug/dom/toggleBranch",
    "firebug/lib/system",
    "firebug/chrome/menu",
    "firebug/dom/domMemberProvider",
    "firebug/dom/domEditor",
    "firebug/dom/domReps",
    "firebug/chrome/panel",
    "firebug/chrome/panelActivation",
    "firebug/debugger/debuggerLib",
    "firebug/editor/editor",
    "firebug/js/breakpoint",
    "firebug/chrome/searchBox",
    "firebug/dom/domModule",
    "firebug/console/autoCompleter",
],
function(Obj, Firebug, FirebugReps, Locale, Events, Wrapper, SourceLink, StackFrame,
    Dom, Css, Search, Str, Arr, Persist, ClosureInspector, ToggleBranch, System, Menu,
    DOMMemberProvider, DOMEditor, DOMReps, Panel, PanelActivation, DebuggerLib) {

"use strict";

// ********************************************************************************************* //
// Constants

const rxIdentifier = /^[$_A-Za-z][$_A-Za-z0-9]*$/;

// ********************************************************************************************* //

/**
 * @panel Base class for panels displaying hierarchy of objects.
 */
Firebug.DOMBasePanel = function()
{
}

Firebug.DOMBasePanel.ToolboxPlate = DOMReps.ToolboxPlate;
Firebug.DOMBasePanel.prototype = Obj.extend(Panel,
/** lends Firebug.DOMBasePanel */
{
    tag: DOMReps.DirTablePlate.tableTag,
    dirTablePlate: DOMReps.DirTablePlate,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    initialize: function()
    {
        this.objectPath = [];
        this.propertyPath = [];
        this.viewPath = [];
        this.pathIndex = -1;
        this.toggles = new ToggleBranch.ToggleBranch();

        Panel.initialize.apply(this, arguments);
    },

    initializeNode: function(node)
    {
        Panel.initializeNode.apply(this, arguments);
    },

    destroyNode: function()
    {
        Panel.destroyNode.apply(this, arguments);
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

        if (FBTrace.DBG_DOM)
            FBTrace.sysout("dom.destroy; state:", state);

        Panel.destroy.apply(this, arguments);
    },

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
                    this.objectPath = [defaultObject];
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

            if (FBTrace.DBG_DOM)
                FBTrace.sysout("dom.show; selection:", selection);

            this.select(selection);
        }
    },

    resetPaths: function(selectObject)
    {
        for (var i = 1; i < this.propertyPath.length; ++i)
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
                this.objectPath.push(new FirebugReps.PropertyObj(object, name));
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

    getBreakOnNextTooltip: function(enabled)
    {
        return (enabled ? Locale.$STR("dom.disableBreakOnPropertyChange") :
            Locale.$STR("dom.label.breakOnPropertyChange"));
    },

    supportsObject: function(object, type)
    {
        if (type == "number" || type == "string" || type == "boolean")
            return 0;
        if (object == null)
            return 1000;
        else if (object instanceof SourceLink.SourceLink)
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
        if (FBTrace.DBG_DOM)
            FBTrace.sysout("dom.updateSelection", object);

        var previousIndex = this.pathIndex;
        var previousView = (previousIndex === -1 ? null : this.viewPath[previousIndex]);

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
                    if (FBTrace.DBG_ERRORS)
                        FBTrace.sysout("dom.updateSelection no pathObject for " + previousIndex);
                    return;
                }

                // XXX This is wrong with closures, but I haven't noticed anything
                // break and I don't know how to fix, so let's just leave it...
                for (var i = 0; i < newPath.length; ++i)
                {
                    var name = newPath[i];
                    object = value;
                    try
                    {
                        value = value[name];
                    }
                    catch(exc)
                    {
                        if (FBTrace.DBG_ERRORS)
                        {
                            FBTrace.sysout("dom.updateSelection FAILS at path_i=" + i +
                                " for name:" + name);
                        }
                        return;
                    }

                    ++this.pathIndex;
                    this.objectPath.push(new FirebugReps.PropertyObj(object, name));
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
            this.toggles = view ? view.toggles : new ToggleBranch.ToggleBranch();

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
            {label: "Refresh", command: Obj.bindFixed(this.rebuild, this, true),
                tooltiptext: "panel.tip.Refresh"}
        ];
    },

    getContextMenuItems: function(object, target)
    {
        if (FBTrace.DBG_DOM)
            FBTrace.sysout("dom.getContextMenuItems;", object);

        var row = Dom.getAncestorByClass(target, "memberRow");

        var items = [];

        if (row && row.domObject && !row.domObject.ignoredPath)
        {
            var member = row.domObject;
            var rowName = member.name;
            var rowObject = member.object;
            var rowValue = member.value;

            var isWatch = Css.hasClass(row, "watchRow");
            var isStackFrame = rowObject instanceof StackFrame.StackFrame;
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

            if (isWatch ||
                (member.deletable && !isStackFrame && !Dom.isDOMMember(rowObject, rowName)))
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

            if (!Dom.isDOMMember(rowObject, rowName) && member && member.breakable)
            {
                items.push(
                    "-",
                    {
                        label: "dom.label.breakOnPropertyChange",
                        tooltiptext: "dom.tip.Break_On_Property_Change",
                        type: "checkbox",
                        checked: this.context.dom.breakpoints.findBreakpoint(rowObject, rowName),
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
                command: Obj.bindFixed(this.rebuild, this, true)
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
        Events.dispatch(this.fbListeners, "onBeforeDomUpdateSelection", [this]);

        var members = this.getMembers(this.selection, 0);
        this.expandMembers(members, this.toggles, 0, 0);
        this.showMembers(members, update, scrollTop);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Members

    /**
     * @param object a user-level object wrapped in security blanket
     * @param level for a.b.c, level is 2
     */
    getMembers: function(object, level)
    {
        if (!this.memberProvider)
            this.memberProvider = new DOMMemberProvider(this.context);

        return this.memberProvider.getMembers(object, level);
    },

    // For backward compatibility
    addMember: function()
    {
        if (!this.memberProvider)
            this.memberProvider = new DOMMemberProvider(this.context);

        return this.memberProvider.addMember.apply(this.memberProvider, arguments);
    },

    // recursion starts with offset=0, level=0
    expandMembers: function(members, toggles, offset, level)
    {
        var expanded = 0;
        for (var i = offset; i < members.length; ++i)
        {
            var member = members[i];
            if (member.level < level)
                break;

            if (toggles.get(member.name))
            {
                // member.level <= level && member.name in toggles.
                member.open = "opened";

                // Don't expand if the member doesn't have children any more.
                if (!member.hasChildren)
                    continue;

                // sets newMembers.level to level+1
                var newMembers = this.getMembers(member.value, level+1);

                // Insert 'newMembers' into 'members'
                Arr.arrayInsert(members, i+1, newMembers);

                if (FBTrace.DBG_DOM)
                {
                    FBTrace.sysout("expandMembers member.name "+member.name+" member "+member);
                    FBTrace.sysout("expandMembers toggles "+toggles, toggles);
                    FBTrace.sysout("expandMembers toggles.get(member.name) " +
                        toggles.get(member.name), toggles.get(member.name));
                    FBTrace.sysout("dom.expandedMembers level: "+level+" member.level " +
                        member.level, member);
                }

                var moreExpanded = newMembers.length +
                    this.expandMembers(members, toggles.get(member.name), i+1, level+1);
                i += moreExpanded;
                expanded += moreExpanded;
            }
        }

        return expanded;
    },

    showMembers: function(members, update, scrollTop)
    {
        // If we are still in the midst of inserting rows, cancel all pending
        // insertions here - this is a big speedup when stepping in the debugger
        if (this.timeouts)
        {
            for (var i = 0; i < this.timeouts.length; ++i)
                this.context.clearTimeout(this.timeouts[i]);
            delete this.timeouts;
        }

        if (!members.length)
            return this.showEmptyMembers();

        var panelNode = this.panelNode;
        var priorScrollTop = (scrollTop === undefined ? panelNode.scrollTop : scrollTop);

        // If we are asked to "update" the current view, then build the new table
        // offscreen and swap it in when it's done
        var offscreen = update && panelNode.firstChild;
        var dest = offscreen ? this.document : panelNode;

        var table = this.tag.replace({domPanel: this, toggles: this.toggles}, dest);
        var tbody = table.lastChild;
        var rowTag = this.dirTablePlate.rowTag;

        // Insert the first slice immediately
        var setSize = members.length;
        var slice = members.splice(0, DOMReps.insertSliceSize);
        var result = rowTag.insertRows({members: slice}, tbody.lastChild);
        var rowCount = 1;
        var panel = this;

        Events.dispatch(this.fbListeners, "onMemberRowSliceAdded",
            [panel, result, rowCount, setSize]);

        var timeouts = [];

        var delay = 0;
        while (members.length)
        {
            let slice = members.splice(0, DOMReps.insertSliceSize);
            timeouts.push(this.context.setTimeout(function addMemberRowSlice()
            {
                result = rowTag.insertRows({members: slice}, tbody.lastChild);
                rowCount += DOMReps.insertSliceSize;

                Events.dispatch(Firebug.DOMModule.fbListeners, "onMemberRowSliceAdded",
                    [panel, result, rowCount, setSize]);

                if ((panelNode.scrollHeight+panelNode.offsetHeight) >= priorScrollTop)
                    panelNode.scrollTop = priorScrollTop;

            }, delay));

            delay += DOMReps.insertInterval;
        }

        if (offscreen)
        {
            timeouts.push(this.context.setTimeout(function()
            {
                if (panelNode.firstChild)
                    panelNode.replaceChild(table, panelNode.firstChild);
                else
                    panelNode.appendChild(table);

                // Scroll back to where we were before
                panelNode.scrollTop = priorScrollTop;
            }, delay));
        }
        else
        {
            timeouts.push(this.context.setTimeout(function()
            {
                panelNode.scrollTop = (scrollTop === undefined ? 0 : scrollTop);
            }, delay));
        }
        this.timeouts = timeouts;
    },

    showEmptyMembers: function()
    {
        FirebugReps.Warning.tag.replace({object: "NoMembersWarning"}, this.panelNode);
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
        if (object instanceof FirebugReps.PropertyObj)
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
            if (object instanceof StackFrame.StackFrame)
                return Firebug.Debugger.evaluate(propName, this.context);
            else
                return object[propName];
        }
        catch (err)
        {
            if (FBTrace.DBG_DOM || FBTrace.DBG_ERRORS)
                FBTrace.sysout("dom.getObjectPropertyValue; EXCEPTION " + propName, object);
        }
    },

    getRowPathName: function(row)
    {
        var member = row.domObject, name = member.name;

        // Fake "(closure)" properties.
        if (member.ignoredPath)
            return ["", ""];

        // Closure variables.
        if (ClosureInspector.isScopeWrapper(member.object))
            return [".%", name];

        // Ordinals.
        if (name.match(/^[\d]+$/))
            return ["", "["+name+"]"];

        // Identifiers.
        if (name.match(rxIdentifier))
            return [".", name];

        // Other, weird, names.
        return ["", "[\""+name.replace(/\\/g, "\\\\").replace(/"/g,"\\\"") + "\"]"];
    },

    copyName: function(row)
    {
        var value = this.getRowPathName(row);
        value = value[1]; //don't want the separator
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
        path.shift(); //don't want the first separator
        return path;
    },

    copyProperty: function(row)
    {
        var value = this.getRowPropertyValue(row);
        System.copyToClipboard(value);
    },

    editProperty: function(row, editValue)
    {
        var member = row.domObject;
        if (member && member.readOnly)
            return;

        if (Css.hasClass(row, "watchNewRow"))
        {
            Firebug.Editor.startEditing(row, "");
        }
        else if (Css.hasClass(row, "watchRow"))
        {
            Firebug.Editor.startEditing(row, getRowName(row));
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
                    editValue = String(propValue);
                else if (type === "string")
                    editValue = "\"" + Str.escapeJS(propValue) + "\"";
                else if (propValue === null)
                    editValue = "null";
                else if (object instanceof window.Window || object instanceof StackFrame.StackFrame)
                    editValue = getRowName(row);
                else
                    editValue = "this." + getRowName(row); // XXX "this." doesn't actually work
            }

            var selectionData = null;
            if (type === "string")
                selectionData = {start: 1, end: editValue.length-1};

            Firebug.Editor.startEditing(row, editValue, null, selectionData);
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

    setPropertyValue: function(row, value)  // value must be string
    {
        var member = row.domObject;
        var name = member.name;

        if (FBTrace.DBG_DOM)
        {
            FBTrace.sysout("setPropertyValue: " + name + " set to " +
                (typeof value === "string" ? "\"" + value + "\"" : "non-string!?!?"), row);
        }

        if (name === "this")
            return;

        var object = this.getRealRowObject(row);
        if (object && !(object instanceof StackFrame.StackFrame))
        {
            Firebug.CommandLine.evaluate(value, this.context, object, this.context.getCurrentGlobal(),
                function success(result, context)
                {
                    if (FBTrace.DBG_DOM)
                    {
                        FBTrace.sysout("setPropertyValue evaluate success object[" + name + "]" +
                            " set to type " + typeof result, result);
                    }
                    object[name] = result;
                },
                function failed(exc, context)
                {
                    try
                    {
                        if (FBTrace.DBG_DOM)
                        {
                            FBTrace.sysout("setPropertyValue evaluate FAILED", exc);
                        }

                        // If the value doesn't parse, then just store it as a string.
                        // Some users will not realize they're supposed to enter a JavaScript
                        // expression and just type literal text
                        object[name] = value;
                    }
                    catch (exc) {}
                }
            );
        }
        else if (this.context.stopped)
        {
            try
            {
                Firebug.CommandLine.evaluate(name + "=" + value, this.context);
            }
            catch (exc)
            {
                try
                {
                    // See catch block above...
                    object[name] = value;
                }
                catch (exc)
                {
                    return;
                }
            }

            // Clear cached scope chain (it'll be regenerated the next time the getScopes
            // is executed). This forces the watch window to update in case a closer scope
            // variables have been changed during a debugging session.
            if (object instanceof StackFrame.StackFrame)
                object.clearScopes();
        }

        this.rebuild(true);
        this.markChange();
    },

    breakOnProperty: function(row)
    {
        var member = row.domObject;
        if (!member)
            return;

        // Bail out if this property is not breakable.
        if (!member.breakable)
            return;

        var name = member.name;
        if (name === "this")
            return;

        var object = this.getRowObject(row);
        object = this.getObjectView(object);
        if (!object)
            return;

        // Create new or remove an existing breakpoint.
        var breakpoints = this.context.dom.breakpoints;
        var bp = breakpoints.findBreakpoint(object, name);
        if (bp)
        {
            row.removeAttribute("breakpoint");
            breakpoints.removeBreakpoint(object, name);
        }
        else
        {
            breakpoints.addBreakpoint(object, name, this, row);
            row.setAttribute("breakpoint", "true");
        }
    },
});

// ********************************************************************************************* //
// Local Helpers

function getRowName(row)
{
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

/**
 * Returns an array of parts that uniquely identifies a row (not always all JavaScript)
 */
function getPath(row)
{
    var name = getRowName(row);
    var path = [name];

    var level = parseInt(row.getAttribute("level"), 10) - 1;
    for (row = row.previousSibling; row && level >= 0; row = row.previousSibling)
    {
        if (parseInt(row.getAttribute("level"), 10) === level)
        {
            name = getRowName(row);
            path.splice(0, 0, name);

            --level;
        }
    }

    return path;
}

// ********************************************************************************************* //
// Registration

// Expose so, it can be used by derived objects.
Firebug.DOMBasePanel.getPath = getPath;

return Firebug.DOMBasePanel;

// ********************************************************************************************* //
});
