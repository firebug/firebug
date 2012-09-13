/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/chrome/firefox",
    "firebug/firebug",
    "firebug/dom/toggleBranch",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/array",
    "firebug/debugger/stackFrame",
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/debugger/watchEditor",
    "firebug/debugger/watchTree",
    "firebug/debugger/watchPanelProvider",
    "firebug/debugger/grips",
],
function(Obj, Domplate, Firefox, Firebug, ToggleBranch, Events, Dom, Css, Arr, StackFrame,
    Locale, Str, WatchEditor, WatchTree, WatchPanelProvider, Grips) {

with (Domplate) {

// ********************************************************************************************* //
// Domplate

// Tree row decorator
var ToolboxPlate = domplate(
{
    tag:
        DIV({"class": "watchToolbox", _domPanel: "$domPanel", onclick: "$onClick"},
            IMG({"class": "watchDeleteButton closeButton", src: "blank.gif"})
        ),

    onClick: function(event)
    {
        var toolbox = event.currentTarget;
        toolbox.domPanel.deleteWatch(toolbox.watchRow);
    }
});

// ********************************************************************************************* //
// Watch Panel

function WatchPanel()
{
    this.watches = [];
    this.tree = new WatchTree();

    this.onMouseDown = Obj.bind(this.onMouseDown, this);
    this.onMouseOver = Obj.bind(this.onMouseOver, this);
    this.onMouseOut = Obj.bind(this.onMouseOut, this);
}

/**
 * Represents the Watch side panel available in the Script panel.
 */
var BasePanel = Firebug.Panel;
WatchPanel.prototype = Obj.extend(BasePanel,
/** @lends WatchPanel */
{
    dispatchName: "JSD2.WatchPanel",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Members

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
        BasePanel.initialize.apply(this, arguments);

        Firebug.registerUIListener(this);
        Firebug.proxy.addListener(this);
    },

    destroy: function(state)
    {
        state.watches = this.watches;

        Firebug.unregisterUIListener(this);
        Firebug.proxy.removeListener(this);

        BasePanel.destroy.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        Events.addEventListener(this.panelNode, "mousedown", this.onMouseDown, false);
        Events.addEventListener(this.panelNode, "mouseover", this.onMouseOver, false);
        Events.addEventListener(this.panelNode, "mouseout", this.onMouseOut, false);

        BasePanel.initializeNode.apply(this, arguments);
    },

    destroyNode: function()
    {
        Events.removeEventListener(this.panelNode, "mousedown", this.onMouseDown, false);
        Events.removeEventListener(this.panelNode, "mouseover", this.onMouseOver, false);
        Events.removeEventListener(this.panelNode, "mouseout", this.onMouseOut, false);

        BasePanel.destroyNode.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Connection

    onConnect: function(proxy)
    {
        this.tool = this.context.getTool("debugger");
        this.tool.attach(this.context, proxy.connection, this);
    },

    onDisconnect: function(proxy)
    {
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

        Dom.clearNode(this.panelNode);

        var cache = this.context.debuggerClient.activeThread.gripCache;

        var newFrame = frame && ("signature" in frame) &&
            (frame.signature() != this.frameSignature);

        if (newFrame)
        {
            this.toggles = new ToggleBranch.ToggleBranch();
            this.frameSignature = frame.signature();
        }

        var object = frame;
        var input = {
            toggles: this.toggles,
            object: object,
            domPanel: this,
            watchNewRow: true,
        };

        if (object instanceof StackFrame)
            this.tree.provider = new WatchPanelProvider(this);

        //xxxHonza: Pre-expand local variables
        this.tree.append(this.panelNode, input);

        // Asynchronoysly eval all user-expressions
        this.evalWatches(this.watches);
    },

    showMembers: function(members, update, scrollTop)
    {
    },

    refreshMember: function(member, value)
    {
        var self = this;

        // xxxHonza: make the async op slow for now.
        setTimeout(function()
        {
            self.tree.updateMember(member, value);
        }, 1500);
    },

    rebuild: function()
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("WatchPanel.rebuild", this.selection);

        this.updateSelection(this.selection);
    },

    showEmptyMembers: function()
    {
        var input = {
            domPanel: this,
            object: this.context.getGlobalScope(),
            toggles: this.toggles,
            watchNewRow: true,
        };

        // Remove the provider, global scope is currently the local window object.
        this.tree.provider = null;
        this.tree.replace(this.panelNode, input);

        // The direction needs to be adjusted according to the direction
        // of the user agent. See issue 5073.
        // TODO: Set the direction at the <body> to allow correct formatting of all relevant parts.
        // This requires more adjustments related for rtl user agents.
        var mainFrame = Firefox.getElementById("fbMainFrame");
        var cs = mainFrame.ownerDocument.defaultView.getComputedStyle(mainFrame);
        var watchRow = this.panelNode.getElementsByClassName("watchNewRow").item(0);
        watchRow.style.direction = cs.direction;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Watches

    addWatch: function(expression)
    {
        expression = Str.trim(expression);

        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("WatchPanel.addWatch; expression: " + expression, this.watches);

        if (!this.watches)
            this.watches = [];

        for (var i=0; i<this.watches.length; i++)
        {
            if (expression == this.watches[i].expr)
                return;
        }

        this.watches.push(new Grips.WatchExpression(expression));
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

        var rowIndex = this.getWatchRowIndex(row);
        this.watches[rowIndex] = value;
        this.rebuild(true);
    },

    deleteWatch: function(row)
    {
        if (FBTrace.DBG_WATCH)
            FBTrace.sysout("WatchPanel.deleteWatch", row);

        var rowIndex = this.getWatchRowIndex(row);
        this.watches.splice(rowIndex, 1);
        this.rebuild(true);

        this.context.setTimeout(Obj.bindFixed(function()
        {
            this.showToolbox(null);
        }, this));
    },

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
    // Watches Evaluation

    // xxxHonza: should this be done throug promise-chain?
    evalWatches: function(watches)
    {
        if (watches)
            this.watchesToEval = Arr.cloneArray(watches);

        var watch = this.watchesToEval.shift();
        if (!watch)
            return;

        this.evalWatch(watch);
    },

    evalWatch: function(watch)
    {
        var expr = watch.expr;

        var self = this;
        this.tool.eval(this.context, this.context.currentFrame, expr, function(grip)
        {
            FBTrace.sysout("watchPanel.evalWatch; " + grip, grip);

            // If grip is not defined an exception has been thrown.
            if (grip)
            {
                var thread = self.context.debuggerClient.activeThread;
                watch.value = thread.getObject(grip);

                //xxxHonza: this should be in the cache/factory probably.
                if (grip.type == "undefined")
                    delete watch.value;
                else if (grip.type == "null")
                    watch.value = null;

                self.tree.updateObject(watch);
            }

            // Eval another watch in the queue.
            setTimeout(function() {
                self.evalWatches();
            });
        });
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
            this.toolbox = ToolboxPlate.tag.replace({domPanel: this}, this.document);
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
        var items = BasePanel.getContextMenuItems.apply(this, arguments);

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
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getWatchRowIndex: function(row)
    {
        var index = -1;
        for (; row; row = row.previousSibling)
        {
            if (Css.hasClass(row, "watchRow"))
                ++index;
        }
        return index;
    },

    getWatchRow: function(member)
    {
        var rows = this.panelNode.getElementsByClassName("watchRow");
        for (var i=0; i<rows.length; i++)
        {
            var row = rows[i];
            if (row.domObject == member)
                return row;
        }
        return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Editor

    editProperty: function(row, editValue)
    {
        var member = row.domObject;
        if (member && member.readOnly)
            return;

        if (Css.hasClass(row, "watchNewRow"))
        {
            Firebug.Editor.startEditing(row, "");
        }
    },

    getEditor: function(target, value)
    {
        if (!this.editor)
            this.editor = new WatchEditor(this.document);

        return this.editor;
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(WatchPanel);

return WatchPanel;

// ********************************************************************************************* //
}});
