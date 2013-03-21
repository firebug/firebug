/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/trace",
    "firebug/chrome/firefox",
    "firebug/firebug",
    "firebug/dom/toggleBranch",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/array",
    "firebug/chrome/menu",
    "firebug/debugger/stack/stackFrame",
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/debugger/watch/watchEditor",
    "firebug/debugger/watch/watchTree",
    "firebug/debugger/watch/watchProvider",
    "firebug/debugger/watch/watchExpression",
    "firebug/dom/domBasePanel",
],
function(Obj, Domplate, FBTrace, Firefox, Firebug, ToggleBranch, Events, Dom, Css, Arr, Menu,
    StackFrame, Locale, Str, WatchEditor, WatchTree, WatchProvider, WatchExpression,
    DOMBasePanel) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_WATCH");
var TraceError = FBTrace.to("DBG_ERRORS");

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
    this.toggles = new ToggleBranch.ToggleBranch();

    this.onMouseDown = Obj.bind(this.onMouseDown, this);
    this.onMouseOver = Obj.bind(this.onMouseOver, this);
    this.onMouseOut = Obj.bind(this.onMouseOut, this);
}

/**
 * @panel Represents the Watch side panel available in the Script panel. This panel
 * allows variable inspection during debugging. It's possible to inspect existing
 * variables in the scope-chaine as well as evaluating user expressions.
 */
var BasePanel = DOMBasePanel.prototype;
WatchPanel.prototype = Obj.extend(BasePanel,
/** @lends WatchPanel */
{
    dispatchName: "WatchPanel",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Members

    name: "watches",
    order: 0,
    parentPanel: "script",
    enableA11y: true,
    deriveA11yFrom: "console",
    remoteable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        BasePanel.initialize.apply(this, arguments);

        Firebug.registerUIListener(this);

        this.tool = this.context.getTool("debugger");
        this.tool.addListener(this);

        this.provider = new WatchProvider(this);
        this.tree.memberProvider = this.provider;
    },

    destroy: function(state)
    {
        state.watches = this.watches;

        Firebug.unregisterUIListener(this);

        this.tool.removeListener(this);

        BasePanel.destroy.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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
            TraceError.sysout("WatchPanel.updateSelection; EXCEPTION " + exc, exc);
        }
    },

    doUpdateSelection: function(frame)
    {
        Trace.sysout("WatchPanel.doUpdateSelection; frame: " + frame, frame);

        // Ignore non-frame objects. When the debugger is resumed, properties of the current
        // global (usually a window) are displayed in showEmptyMembers() method.
        if (!(frame instanceof StackFrame))
            return;

        Events.dispatch(this.fbListeners, "onBeforeDomUpdateSelection", [this]);

        var newFrame = frame && ("signature" in frame) &&
            (frame.signature() != this.frameSignature);

        if (newFrame)
            this.frameSignature = frame.signature();

        var input = {
            object: frame,
            domPanel: this,
            watchNewRow: true,
        };

        this.tree.provider = this.provider;
        this.tree.replace(this.panelNode, input);
        this.tree.restoreState(input, this.toggles);

        // Throw out the old state object.
        this.toggles = new ToggleBranch.ToggleBranch();

        // Pre-expand the first top scope.
        var scope = this.tree.provider.getTopScope(frame);
        this.tree.expandObject(scope);

        // Asynchronously eval all user-expressions, but make sure it isn't
        // already in-progress (to avoid infinite recursion).
        if (!this.context.evalInProgress)
            this.evalWatches();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Content 

    showMembers: function(members, update, scrollTop)
    {
    },

    refreshMember: function(member, value)
    {
        this.tree.updateMember(member, value);
    },

    rebuild: function()
    {
        Trace.sysout("WatchPanel.rebuild", this.selection);
        this.updateSelection(this.selection);
    },

    showEmptyMembers: function()
    {
        Trace.sysout("watchPanel.showEmptyMembers;");

        var input = {
            domPanel: this,
            object: this.context.getGlobalScope(),
            watchNewRow: true,
        };

        // Remove the provider, global scope is currently the local window object.
        // Also set a member provider that is used for the DOM panel.
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

        Trace.sysout("WatchPanel.addWatch; expression: " + expression, this.watches);

        if (!this.watches)
            this.watches = [];

        for (var i=0; i<this.watches.length; i++)
        {
            if (expression == this.watches[i].expr)
                return;
        }

        this.watches.push(new WatchExpression(expression));
        this.rebuild(true);
    },

    removeWatch: function(expression)
    {
        Trace.sysout("WatchPanel.removeWatch; expression: " + expression);

        if (!this.watches)
            return;

        var index = this.watches.indexOf(expression);
        if (index != -1)
            this.watches.splice(index, 1);
    },

    editNewWatch: function(value)
    {
        Trace.sysout("WatchPanel.editNewWatch; value: " + value);

        var watchNewRow = this.panelNode.getElementsByClassName("watchNewRow").item(0);
        if (watchNewRow)
            this.editProperty(watchNewRow, value);
    },

    setWatchValue: function(row, value)
    {
        Trace.sysout("WatchPanel.setWatchValue", {row: row, value: value});

        var rowIndex = this.getWatchRowIndex(row);
        this.watches[rowIndex] = value;
        this.rebuild(true);
    },

    deleteWatch: function(row)
    {
        Trace.sysout("WatchPanel.deleteWatch", row);

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
        Trace.sysout("WatchPanel.deleteAllWatches");

        this.watches = [];
        this.rebuild(true);

        this.context.setTimeout(Obj.bindFixed(function()
        {
            this.showToolbox(null);
        }, this));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Watches Evaluation

    evalWatches: function()
    {
        // Bail out if there are no user expressions.
        if (!this.watches.length)
            return;

        // The debugger must be halted at this moment.
        if (!this.context.currentFrame)
            return;

        // Build an array of expression that is sent to the back-end and evaluated
        // all at once. The result of all evaluated expressions is sent back
        // as an array (of the same size).
        var expression = [];
        for (var i=0; i<this.watches.length; i++)
        {
            var watch = this.watches[i];

            // Avoid yielding an empty pseudo-array when evaluating 'arguments',
            // since they're overridden by the expression's closure scope.
            expression.push("(function(arguments) {" +
                // Make sure all the quotes are escaped in the expression's syntax.
                "try { return eval(\"" + watch.expr.replace(/"/g, "\\$&") + "\"); }" +
                "catch(e) { return e.name + ': ' + e.message; }" +
            "})(arguments)");
        }
        expression = "[" + expression.join(",") + "]";

        // Evaluation callback
        var self = this;
        function onEvaluated(context, event, packet)
        {
            context.evalInProgress = false;

            var result = packet.why.frameFinished["return"];

            // xxxHonza: properly deal with exceptions
            if (typeof(result) == "undefined")
                result = packet.why.frameFinished["throw"];

            self.onEvalWatches(result);
        }

        // Eval through the debuggerTool.
        this.context.evalInProgress = true;
        this.tool.eval(this.context, this.context.currentFrame, expression, onEvaluated);
    },

    onEvalWatches: function(resultGrip)
    {
        Trace.sysout("watchPanel.evalWatches; EVALUATED ", resultGrip);

        // If grip is not defined an exception has been thrown.
        if (!resultGrip)
            return;

        var self = this;

        // xxxHonza: the entire logic related to eval result, should be refactored
        // xxxHonza: see also ScriptPanel.onPopulateInfoTip()
        // The cache and grip objects should do most of the work automatically.
        // This method should be much simpler.
        var cache = this.context.clientCache;
        var gripObj = cache.getObject(resultGrip);
        gripObj.getProperties().then(function(props)
        {
            // We don't want object properties, we need the object itself (it's an
            // array with results and we want to iterate it).
            var results = gripObj.getValue();

            // The number of results shuld be the same as the number of user expressions
            // in the panel.
            // xxxHonza: we should freeze the UI during the evaluation on the server side.
            if (results.length != self.watches.length)
            {
                TraceError.sysout("watchPanel.evalWatches; ERROR wrong number " +
                    "of results after evaluation " + results.length + " != " +
                    this.watches.length);

                return;
            }

            Trace.sysout("watchPanel.evalWatches; RESULTS", results);

            for (var i=0; i<results.length; i++)
            {
                var watch = self.watches[i];
                var result = results[i].grip ? results[i].grip : results[i];
                watch.value = cache.getObject(result);
                self.tree.updateObject(watch);
            }
        });
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerTool Listener

    onStartDebugging: function(context, event, packet)
    {
    },

    onStopDebugging: function(context, event, packet)
    {
        // Save state of the Watch panel for the next pause.
        this.tree.saveState(this.toggles);

        // Update the panel content.
        this.showEmptyMembers();
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

        Trace.sysout("insert DeleteAllWatches at: " + deleteAllWatchesIndex);

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

        // Logic related to watch variables.
        if (Css.hasClass(row, "watchNewRow"))
        {
            Firebug.Editor.startEditing(row, "");
            return;
        }
        else if (Css.hasClass(row, "watchRow"))
        {
            Firebug.Editor.startEditing(row, getRowName(row));
            return;
        }

        // Use basic editing logic implemented in {@DomBasePanel}.
        BasePanel.editProperty.apply(this, arguments);
    },

    getEditor: function(target, value)
    {
        if (!this.editor)
            this.editor = new WatchEditor(this.document);

        return this.editor;
    },

    setPropertyValue: function(row, value)
    {
        // Save state of the tree before evaluation will cause rebuild.
        this.tree.saveState(this.toggles);

        BasePanel.setPropertyValue.apply(this, arguments);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Editing Helpers (override the default DomBasePanel implementation)

    getRealRowObject: function(row)
    {
        var object = this.getRowObject(row);

        // The row object can be ObjectClient instance so, make sure to use a provider
        // to get the actual value.
        object = this.provider.getValue(object);

        // Unwrapping
        return this.getObjectView(object);
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(WatchPanel);

return WatchPanel;

// ********************************************************************************************* //
}});
