/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/chrome/firefox",
    "firebug/firebug",
    "firebug/dom/toggleBranch",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/debugger/stackFrame",
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/dom/domPanel",     // Firebug.DOMBasePanel, Firebug.DOMPanel.DirTable
],
function(Obj, Firefox, Firebug, ToggleBranch, Events, Dom, Css, StackFrame, Locale, Str) {

// ********************************************************************************************* //
// Watch Panel

function WatchPanel()
{
    this.onMouseDown = Obj.bind(this.onMouseDown, this);
    this.onMouseOver = Obj.bind(this.onMouseOver, this);
    this.onMouseOut = Obj.bind(this.onMouseOut, this);
}

/**
 * Represents the Watch side panel available in the Script panel.
 */
WatchPanel.prototype = Obj.extend(Firebug.DOMBasePanel.prototype,
/** @lends Firebug.WatchPanel */
{
    tag: Firebug.DOMPanel.DirTable.watchTag,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Members

    dispatchName: "JSD2.WatchPanel",

    name: "jsd2watches",
    order: 0,
    parentPanel: "jsd2script",
    enableA11y: true,
    deriveA11yFrom: "console",
    remoteable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Firebug.DOMBasePanel.prototype.initialize.apply(this, arguments);

        Firebug.registerUIListener(this);
        Firebug.proxy.addListener(this);
    },

    destroy: function(state)
    {
        state.watches = this.watches;

        Firebug.unregisterUIListener(this);
        Firebug.proxy.removeListener(this);

        Firebug.DOMBasePanel.prototype.destroy.apply(this, arguments);
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    onConnect: function(proxy)
    {
        this.tool = this.context.getTool("debugger");
        this.tool.attach(this.context, proxy.connection, this);

        FBTrace.sysout("WatchPanel.onConnect; " + this.tool);
    },

    onDisconnect: function(proxy)
    {
        FBTrace.sysout("WatchPanel.onDisconnect;");

        // Detach from the current tool.
        this.tool.detach(this.context, proxy.connection, this);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    show: function(state)
    {
        if (state && state.watches)
            this.watches = state.watches;
    },

    refresh: function()
    {
        this.rebuild(true);
    },

    updateSelection: function(frame)
    {
        FBTrace.sysout("watchPanel.updateSelection; " + frame, frame);

        // this method is called while the debugger has halted JS,
        // so failures don't show up in FBS_ERRORS
        try
        {
            this.doUpdateSelection(frame);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("WatchPanel.updateSelection; EXCEPTION " + exc, exc);
        }
    },

    doUpdateSelection: function(frame)
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("WatchPanel.doUpdateSelection; frame: " + frame, frame);

        Events.dispatch(this.fbListeners, "onBeforeDomUpdateSelection", [this]);

        var newFrame = frame && ("signature" in frame) &&
            (frame.signature() != this.frameSignature);

        if (newFrame)
        {
            this.toggles = new ToggleBranch.ToggleBranch();
            this.frameSignature = frame.signature();
        }

        var scopes = [this.context.getGlobalScope()];
/*
        if (frame instanceof StackFrame)
            scopes = frame.getScopes(Firebug.viewChrome);
        else
            scopes = [this.context.getGlobalScope()];

        if (FBTrace.DBG_STACK)
        {
            FBTrace.sysout("dom watch frame isStackFrame " + (frame instanceof StackFrame) +
                " updateSelection scopes " + scopes.length, scopes);
        }
*/
        var members = [];

        FBTrace.sysout("watches", this.watches);

        if (this.watches)
        {
            for (var i=0; i<this.watches.length; ++i)
            {
                var expr = this.watches[i];
                var value = null;

                var member = this.addMember(scopes[0], "watch", members, expr, value, 0);
                this.evalExpression(frame, member);

                if (FBTrace.DBG_WATCH)
                {
                    FBTrace.sysout("watch.updateSelection " + expr + " = " + value,
                        {expr: expr, value: value, members: members})
                }
            }
        }

/*
        if (frame && frame instanceof StackFrame)
        {
            var thisVar = frame.getThisValue();
            if (thisVar)
                this.addMember(scopes[0], "user", members, "this", thisVar, 0);

            // locals, pre-expanded
            members.push.apply(members, this.getMembers(scopes[0], 0, this.context));

            for (var i=1; i<scopes.length; i++)
                this.addMember(scopes[i], "scopes", members, scopes[i].toString(), scopes[i], 0);
        }
*/
        this.expandMembers(members, this.toggles, 0, 0, this.context);
        this.showMembers(members, false);

        if (FBTrace.DBG_STACK)
            FBTrace.sysout("dom watch panel updateSelection members " + members.length, members);
    },

    evalExpression: function(frame, member)
    {
        FBTrace.sysout("WatchPanel.evalExpression: ", frame);

        var self = this;
        this.tool.eval(this.context, frame, member.name, function(result)
        {
            FBTrace.sysout("evalExpression done: ", result);

            var row = getWatchRow(member);
            if (row)
            {
                self.setPropertyValue(row, value)
                var result = rowTag.insertRows({members: slice}, tbody.lastChild);
            }
        });
    },

    rebuild: function()
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("WatchPanel.rebuild", this.selection);

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Watch Actions

    addWatch: function(expression)
    {
        expression = Str.trim(expression);

        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("WatchPanel.addWatch; expression: " + expression);

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
            FBTrace.sysout("WatchPanel.removeWatch; expression: " + expression);

        if (!this.watches)
            return;

        var index = this.watches.indexOf(expression);
        if (index != -1)
            this.watches.splice(index, 1);
    },

    editNewWatch: function(value)
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("WatchPanel.editNewWatch; value: " + value);

        var watchNewRow = this.panelNode.getElementsByClassName("watchNewRow").item(0);
        if (watchNewRow)
            this.editProperty(watchNewRow, value);
    },

    setWatchValue: function(row, value)
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("WatchPanel.setWatchValue", {row: row, value: value});

        var rowIndex = getWatchRowIndex(row);
        this.watches[rowIndex] = value;
        this.rebuild(true);
    },

    deleteWatch: function(row)
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("WatchPanel.deleteWatch", row);

        var rowIndex = getWatchRowIndex(row);
        this.watches.splice(rowIndex, 1);
        this.rebuild(true);

        this.context.setTimeout(Obj.bindFixed(function()
        {
            this.showToolbox(null);
        }, this));
    },

    // deletes all the watches
    deleteAllWatches: function()
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("WatchPanel.deleteAllWatches");

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
        if (!row) 
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

        // find the index of "DeleteWatch" in the items: 
        var deleteWatchIndex = items.map(function(item)
        {
            return item.id;
        }).indexOf("DeleteProperty");

        // if DeleteWatch was found, we insert DeleteAllWatches after it
        // otherwise, we insert the item at the beginning of the menu
        var deleteAllWatchesIndex = (deleteWatchIndex >= 0) ? deleteWatchIndex + 1 : 0;

        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("insert DeleteAllWatches at: " + deleteAllWatchesIndex);

        // insert DeleteAllWatches after DeleteWatch
        items.splice(deleteAllWatchesIndex, 0, {
            id: "deleteAllWatches",
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

function getWatchRow(member)
{
    for (; row; row = row.previousSibling)
    {
        if (row.domObject == member)
            return row;
    }

    return null;
}

function updateRow(member)
{
    
}

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(WatchPanel);

return WatchPanel;

// ********************************************************************************************* //
});
