/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/chrome/firefox",
    "firebug/firebug",
    "firebug/dom/toggleBranch",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/js/stackFrame",
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/dom/domPanel",     // Firebug.DOMBasePanel, Firebug.DOMPanel.DirTable
],
function(Obj, Firefox, Firebug, ToggleBranch, Events, Dom, Css, StackFrame, Locale, Str) {

// ********************************************************************************************* //
// Watch Panel

Firebug.WatchPanel = function()
{
};

/**
 * Represents the Watch side panel available in the Script panel.
 */
Firebug.WatchPanel.prototype = Obj.extend(Firebug.DOMBasePanel.prototype,
/** @lends Firebug.WatchPanel */
{
    tag: Firebug.DOMPanel.DirTable.watchTag,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "watches",
    order: 0,
    parentPanel: "script",
    enableA11y: true,
    deriveA11yFrom: "console",

    initialize: function()
    {
        this.onMouseDown = Obj.bind(this.onMouseDown, this);
        this.onMouseOver = Obj.bind(this.onMouseOver, this);
        this.onMouseOut = Obj.bind(this.onMouseOut, this);

        Firebug.registerUIListener(this);

        Firebug.DOMBasePanel.prototype.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        state.watches = this.watches;

        Firebug.unregisterUIListener(this);

        Firebug.DOMBasePanel.prototype.destroy.apply(this, arguments);
    },

    show: function(state)
    {
        if (state && state.watches)
            this.watches = state.watches;
    },

    initializeNode: function(oldPanelNode)
    {
        Events.addEventListener(this.panelNode, "mousedown", this.onMouseDown, false);
        Events.addEventListener(this.panelNode, "mouseover", this.onMouseOver, false);
        Events.addEventListener(this.panelNode, "mouseout", this.onMouseOut, false);

        Firebug.DOMBasePanel.prototype.initializeNode.apply(this, arguments);
    },

    destroyNode: function()
    {
        Events.removeEventListener(this.panelNode, "mousedown", this.onMouseDown, false);
        Events.removeEventListener(this.panelNode, "mouseover", this.onMouseOver, false);
        Events.removeEventListener(this.panelNode, "mouseout", this.onMouseOut, false);

        Firebug.DOMBasePanel.prototype.destroyNode.apply(this, arguments);
    },

    refresh: function()
    {
        this.rebuild(true);
    },

    updateSelection: function(frame)
    {
        // this method is called while the debugger has halted JS,
        // so failures don't show up in FBS_ERRORS
        try
        {
            this.doUpdateSelection(frame);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS && FBTrace.DBG_STACK)
                FBTrace.sysout("updateSelection FAILS " + exc, exc);
        }
    },

    doUpdateSelection: function(frame)
    {
        if (FBTrace.DBG_STACK)
            FBTrace.sysout("dom watch panel updateSelection frame " + frame, frame);

        Events.dispatch(this.fbListeners, "onBeforeDomUpdateSelection", [this]);

        var newFrame = frame && ("signature" in frame) &&
            (frame.signature() != this.frameSignature);

        if (newFrame)
        {
            this.toggles = new ToggleBranch.ToggleBranch();
            this.frameSignature = frame.signature();
        }

        var scopes;
        if (frame instanceof StackFrame.StackFrame)
            scopes = frame.getScopes(Firebug.viewChrome);
        else
            scopes = [this.context.getCurrentGlobal()];

        if (FBTrace.DBG_STACK)
            FBTrace.sysout("dom watch frame isStackFrame " +
                (frame instanceof StackFrame.StackFrame) +
                " updateSelection scopes " + scopes.length, scopes);

        var members = [];

        var context = this.context;
        if (this.watches)
        {
            for (var i = 0; i < this.watches.length; ++i)
            {
                var expr = this.watches[i];
                var value = null;

                Firebug.CommandLine.evaluate(expr, context, null, context.getCurrentGlobal(),
                    function success(result, context)
                    {
                        value = result;
                    },
                    function failed(result, context)
                    {
                        var exc = result;
                        value = new FirebugReps.ErrorCopy(exc+"");
                    }
                );

                this.addMember(scopes[0], "watch", members, expr, value, 0);

                if (FBTrace.DBG_DOM)
                {
                    FBTrace.sysout("watch.updateSelection \"" + expr + "\"",
                        {expr: expr, value: value, members: members});
                }
            }
        }

        if (frame && frame instanceof StackFrame.StackFrame)
        {
            var thisVar = frame.getThisValue();
            if (thisVar)
                this.addMember(scopes[0], "user", members, "this", thisVar, 0);

            // locals, pre-expanded
            members.push.apply(members, this.getMembers(scopes[0], 0));

            for (var i=1; i<scopes.length; i++)
            {
                var scope = scopes[i];
                var name = (scope.hasOwnProperty("toString") ? scope.toString() :
                    Object.prototype.toString.call(scope));

                // Some objects are stringified as [object ClassName]; extract
                // the [[Class]] from those.
                var re = /\[object (.*)\]/.exec(name);
                if (re)
                {
                    if (re[1] === "Window")
                        name = Locale.$STR("Window_Scope");
                    else
                        name = re[1];
                }

                this.addMember(scope, "scopes", members, name, scope, 0);
            }
        }

        this.expandMembers(members, this.toggles, 0, 0);
        this.showMembers(members, false);

        if (FBTrace.DBG_STACK)
            FBTrace.sysout("dom watch panel updateSelection members " + members.length, members);
    },

    rebuild: function()
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("Firebug.WatchPanel.rebuild", this.selection);

        this.updateSelection(this.selection);
    },

    showEmptyMembers: function()
    {
        var domTable = this.tag.replace({domPanel: this, toggles: new ToggleBranch.ToggleBranch()},
            this.panelNode);

        // The direction needs to be adjusted according to the direction
        // of the user agent. See issue 5073.
        // TODO: Set the direction at the <body> to allow correct formatting of all relevant parts.
        // This requires more adjustments related for rtl user agents.
        var mainFrame = Firefox.getElementById("fbMainFrame");
        var cs = mainFrame.ownerDocument.defaultView.getComputedStyle(mainFrame);
        var watchRow = domTable.getElementsByClassName("watchNewRow").item(0);
        watchRow.style.direction = cs.direction;
    },

    addWatch: function(expression)
    {
        expression = Str.trim(expression);

        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("Firebug.WatchPanel.addWatch; expression: "+expression);

        if (!this.watches)
            this.watches = [];

        for (var i=0; i<this.watches.length; i++)
        {
            if (expression == this.watches[i])
                return;
        }

        this.watches.splice(0, 0, expression);
        this.rebuild(true);
    },

    removeWatch: function(expression)
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("Firebug.WatchPanel.removeWatch; expression: " + expression);

        if (!this.watches)
            return;

        var index = this.watches.indexOf(expression);
        if (index != -1)
            this.watches.splice(index, 1);
    },

    editNewWatch: function(value)
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("Firebug.WatchPanel.editNewWatch; value: " + value);

        var watchNewRow = this.panelNode.getElementsByClassName("watchNewRow").item(0);
        if (watchNewRow)
            this.editProperty(watchNewRow, value);
    },

    setWatchValue: function(row, value)
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("Firebug.WatchPanel.setWatchValue", {row: row, value: value});

        var rowIndex = getWatchRowIndex(row);
        this.watches[rowIndex] = value;
        this.rebuild(true);
    },

    deleteWatch: function(row)
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("Firebug.WatchPanel.deleteWatch", row);

        var rowIndex = getWatchRowIndex(row);
        this.watches.splice(rowIndex, 1);
        this.rebuild(true);

        this.context.setTimeout(Obj.bindFixed(function()
        {
            var watchRow = this.panelNode.getElementsByClassName("watchRow")[rowIndex];
            this.showToolbox(watchRow);
        }, this));
    },

    // deletes all the watches
    deleteAllWatches: function()
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("Firebug.WatchPanel.deleteAllWatches");
        this.watches = [];
        this.rebuild(true);
        this.context.setTimeout(Obj.bindFixed(function()
        {
            this.showToolbox(null);
        }, this));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    showToolbox: function(row)
    {
        var toolbox = this.getToolbox();
        if (row)
        {
            if (Css.hasClass(row, "editing"))
                return;

            toolbox.watchRow = row;

            var offset = Dom.getClientOffset(row);
            toolbox.style.top = offset.y + "px";
            this.panelNode.appendChild(toolbox);
        }
        else
        {
            delete toolbox.watchRow;

            if (toolbox.parentNode)
                toolbox.parentNode.removeChild(toolbox);
        }
    },

    getToolbox: function()
    {
        if (!this.toolbox)
        {
            this.toolbox = Firebug.DOMBasePanel.ToolboxPlate.tag.replace(
                {domPanel: this}, this.document);
        }

        return this.toolbox;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onMouseDown: function(event)
    {
        var watchNewRow = Dom.getAncestorByClass(event.target, "watchNewRow");
        if (watchNewRow)
        {
            this.editProperty(watchNewRow);
            Events.cancelEvent(event);
        }
    },

    onMouseOver: function(event)
    {
        var watchRow = Dom.getAncestorByClass(event.target, "watchRow");
        if (watchRow)
            this.showToolbox(watchRow);
    },

    onMouseOut: function(event)
    {
        if (Dom.isAncestor(event.relatedTarget, this.getToolbox()))
            return;

        var watchRow = Dom.getAncestorByClass(event.relatedTarget, "watchRow");
        if (!watchRow)
            this.showToolbox(null);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    /**
     * Creates "Add Watch" menu item within DOM and Watch panel context menus.
     */
    onContextMenu: function(items, object, target, context, panel, popup)
    {
        // Ignore events from other contexts.
        if (this.context != context)
            return;

        if (panel.name != "dom" && panel.name != "watches")
            return;

        var row = Dom.getAncestorByClass(target, "memberRow");
        if (!row || row.domObject.ignoredPath)
            return;

        var path = this.getPropertyPath(row);
        if (!path || !path.length)
            return;

        // Ignore top level variables in the Watch panel.
        if (panel.name == "watches" && path.length == 1)
            return;

        items.push({
           id: "fbAddWatch",
           label: "AddWatch",
           tooltiptext: "watch.tip.Add_Watch",
           command: Obj.bindFixed(this.addWatch, this, path.join(""))
        });
    },

    getContextMenuItems: function(object, target)
    {
        var items = Firebug.DOMBasePanel.prototype.getContextMenuItems.apply(this, arguments);

        if (!this.watches || this.watches.length == 0)
            return items;

        // find the index of "DeletePropery" in the items:
        var deleteWatchIndex = items.map(function(item)
        {
            return item.id;
        }).indexOf("DeleteProperty");

        // if DeleteWatch was found, we insert DeleteAllWatches after it
        // otherwise, we insert the item at the beginning of the menu
        var deleteAllWatchesIndex = (deleteWatchIndex >= 0) ? deleteWatchIndex + 1 : 0;

        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("insert DeleteAllWatches at: "+ deleteAllWatchesIndex);

        // insert DeleteAllWatches after DeleteWatch
        items.splice(deleteAllWatchesIndex, 0, {
            id: "fbDeleteAllWatches",
            label: "DeleteAllWatches",
            tooltiptext: "watch.tip.Delete_All_Watches",
            command: Obj.bindFixed(this.deleteAllWatches, this)
        });

        return items;
    }
});

// ********************************************************************************************* //
// Local Helpers

function getWatchRowIndex(row)
{
    var index = -1;
    for (; row; row = row.previousSibling)
    {
        if (Css.hasClass(row, "watchRow"))
            ++index;
    }
    return index;
}

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(Firebug.WatchPanel);

return Firebug.WatchPanel;

// ********************************************************************************************* //
});
