/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/chrome/firefox",
    "firebug/dom/toggleBranch",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/array",
    "firebug/chrome/menu",
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/lib/wrapper",
    "firebug/debugger/stack/stackFrame",
    "firebug/debugger/watch/returnValueModifier",
    "firebug/debugger/watch/watchEditor",
    "firebug/debugger/watch/watchTree",
    "firebug/debugger/watch/watchProvider",
    "firebug/debugger/watch/watchExpression",
    "firebug/dom/domBasePanel",
    "firebug/console/errorCopy",
    "firebug/console/commandLine",
],
function(Firebug, FBTrace, Obj, Domplate, Firefox, ToggleBranch, Events, Dom, Css, Arr, Menu,
    Locale, Str, Wrapper, StackFrame, ReturnValueModifier, WatchEditor, WatchTree, WatchProvider,
    WatchExpression, DOMBasePanel, ErrorCopy, CommandLine) {

"use strict";

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_WATCH");
var TraceError = FBTrace.toError();

var {domplate, DIV, IMG} = Domplate;

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
    this.onMouseDown = Obj.bind(this.onMouseDown, this);
    this.onMouseOver = Obj.bind(this.onMouseOver, this);
    this.onMouseOut = Obj.bind(this.onMouseOut, this);
}

/**
 * @panel Represents the Watch side panel available in the Script panel. This panel
 * allows variable inspection during debugging. It's possible to inspect existing
 * variables in the scope-chain as well as evaluating user expressions.
 *
 * The content of this panel is synchronized with the {@link ScriptPanel} through
 * {@link FirebugChrome#select} method. This panel is using the current {@link StackFrame}
 * as the selection when debugger is paused.
 *
 * The panel displays properties of the current scope (usually a window or an iframe)
 * when the debugger is resumed - the selection is the global object in such case.
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

        this.watches = [];
        this.provider = new WatchProvider(this);
        this.tree = new WatchTree(this.context, this.provider, this.provider);

        // Create different tree object and presentation state (toggles) for the default
        // tree that displays the current scope when the debugger is resumed.
        // xxxHonza: its state is preserved across page load, but not across pause/resume.
        this.defaultTree = new WatchTree(this.context, this.provider, this.provider);
        this.defaultToggles = new ToggleBranch.ToggleBranch();
    },

    destroy: function(state)
    {
        // Get tree state.
        this.defaultTree.saveState(this.defaultToggles);

        // Store all persistent info into the state object.
        state.watches = this.watches;
        state.scrollTop = this.panelNode.scrollTop;
        state.defaultToggles = this.defaultToggles;

        // Destroy tree objects, so e.g. any ongoing asynchronous tasks are stopped.
        this.defaultTree.destroy();
        this.tree.destroy();

        this.tool.removeListener(this);

        Firebug.unregisterUIListener(this);

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

    show: function(state)
    {
        BasePanel.show.apply(this, arguments);

        Trace.sysout("watchPanel.show;", state);

        if (state)
        {
            if (state.watches)
                this.watches = state.watches;

            if (state.defaultToggles)
                this.defaultToggles = state.defaultToggles;

            if (state.scrollTop)
                this.defaultScrollTop = state.scrollTop;
        }

        // Make sure the default content is displayed at the beginning.
        if (this.tree.isEmpty() || this.defaultTree.isEmpty())
            this.showEmptyMembers();
    },

    hide: function()
    {
        BasePanel.hide.apply(this, arguments);

        Trace.sysout("watchPanel.hide;");

        this.defaultTree.saveState(this.defaultToggles);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Content

    /**
     * Executed by the user from within the options menu or through the context menu.
     */
    refresh: function()
    {
        Trace.sysout("watchPanel.refresh;");

        // Refresh frames (if they are currently displayed) since some bindings (arguments,
        // local variables) could have changed (e.g. through evaluations on the command line).
        // The panel will rebuild asynchronously.
        // If a default global scope is displayed just rebuild now.
        if (this.selection instanceof StackFrame)
            this.tool.cleanScopes();
        else
            this.rebuild(true);
    },

    rebuild: function()
    {
        Trace.sysout("WatchPanel.rebuild", this.selection);

        this.doUpdateSelection(this.selection);
    },

    updateSelection: function(object)
    {
        Trace.sysout("WatchPanel.updateSelection", object);

        // xxxHonza: revisit the entire panel update when fixing issue 6943

        // Do not synchronize the content of the {@link WatchPanel} with
        // selection changes (e.g. in the Script panel). Clicking on any object
        // anywhere in the UI should not affect its content. Unless it's changing
        // the current frame.
        if (object instanceof StackFrame)
            this.doUpdateSelection(object);

        // Content of the Watch panel is synchronized/updated through debugging
        // events such as 'onStartDebugging' and 'onStopDebugging' sent by
        // {@link DebuggerTool} object.
    },

    doUpdateSelection: function(frame)
    {
        Trace.sysout("watchPanel.doUpdateSelection; frame: " + frame, frame);

        // When the debugger is resumed, properties of the current global (top level
        // window or an iframe) and user watch expressions are displayed.
        if (!(frame instanceof StackFrame))
            return this.showEmptyMembers();

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

        this.evalWatchesLocally();

        this.tree.replace(this.panelNode, input);
        this.tree.restoreState(this.toggles);

        // Throw out the old state object.
        this.toggles = new ToggleBranch.ToggleBranch();

        // Auto expand the first top scope.
        var scope = this.tree.provider.getTopScope(frame);
        this.tree.expandObject(scope);

        // Each time a watch expression is added, the rows representing the watches are built again.
        // This makes the return value animation (emphasis), that should be only run the first time
        // the value is displayed, be played a second time after a watch is added (see Issue 6989).
        // To avoid that, put a flag to tell that the return value has already been emphasized.
        var frameResultNode = this.panelNode.querySelector(".frameResultValueRow");
        if (frameResultNode)
        {
            // We can't use Firebug.getRepObject to find the |member| object since
            // tree rows are using repIgnore flag.
            var row = Dom.getAncestorByClass(frameResultNode, "memberRow");
            var frameResultValue = row.repObject.value;

            // Put the flag on the ClientObject (which is cached) representing the return value.
            // Issue 7025: doUpdateSelection is called twice, first from watchPanel.onStartDebugging
            // and second from watchPanel.framesadded. Each time, the watch panel is rebuilt.
            // So to workaround this, defer the moment when we put that flag.
            this.context.setTimeout(() => frameResultValue.alreadyEmphasized = true, 1000);
        }

        // Asynchronously evaluate all user-expressions, but make sure it isn't
        // already in-progress (to avoid infinite recursion).
        // xxxHonza: disable for now. Evaluation is done synchronously through
        // 'evalWatchesLocally'. It breaks the RDP, but since it's synchronous
        // The watch panel doesn't flash so much, which improves a lot the UX.
        //if (!this.context.evalInProgress)
        //    this.evalWatches();
    },

    showEmptyMembers: function()
    {
        Trace.sysout("watchPanel.showEmptyMembers;");

        var input = {
            domPanel: this,
            object: new WatchProvider.DefaultWatchPanelInput(this),
            watchNewRow: true,
        };

        // Evaluate watch expressions.
        this.evalWatchesLocally();

        // Either use the remembered state (from previous page session)
        // or save the current state (e.g. when the user does refresh.
        if (this.defaultToggles.isEmpty())
            this.defaultTree.saveState(this.defaultToggles);

        // Render the watch panel tree.
        this.defaultTree.replace(this.panelNode, input);

        if (this.defaultToggles.isEmpty())
        {
            var scope = this.context.getCurrentGlobal();
            var unwrappedScope = Wrapper.getContentView(scope);

            // Auto expand the global scope item after a timeout.

            // xxxHonza: iterating DOM window properties that happens in
            // {@link DOMMemberProvider} can cause reflow and break {@link TabContext}
            // initialization after Firefox tab is reopened using "Undo Close Tab" action.
            // See also: http://code.google.com/p/fbug/issues/detail?id=7340#c3
            // This might eventually go away as soon as issue 6943 is implemented
            // and the Watch panel updated asynchronously.
            //
            // It helps if the iteration is done after a timeout, but it's a hack
            // and the real problem is rather in {@link TabWatcher}.
            // This might happen for any UI widget that uses {@link DOMMemberProvider}
            // See also issue 7364
            this.context.setTimeout(() =>
            {
                this.defaultTree.expandObject(unwrappedScope);
            });
        }
        else
        {
            // The restoration process is asynchronous, so make sure that the vertical scroll
            // position is set after the tree is properly expanded and the scroll offset ready.
            // xxxHonza: the restoration of the default global scope-tree doesn't work cross
            // debugger pause/resume.
            var done = this.defaultTree.restoreState(this.defaultToggles);
            done.then(() =>
            {
                Trace.sysout("watchPanel.showEmptyMembers; state restored " +
                    "set default scroll top: " + this.defaultScrollTop);

                // xxxHonza: a little better would be to set the scroll position as soon
                // as the scroll offset reaches the scrollTop. This would improve the UX
                // since the scroll could happen synchronously in most cases and the UI
                // wouldn't blink. This would have to be done as part of the restoration
                // process within {@link DomBaseTree}.
                if (this.defaultScrollTop)
                    this.panelNode.scrollTop = this.defaultScrollTop;

                this.defaultScrollTop = null;
            });
        }

        // The direction needs to be adjusted according to the direction
        // of the user agent. See issue 5073.
        // TODO: Set the direction at the <body> to allow correct formatting of all relevant parts.
        // This requires more adjustments related for RTL user agents.
        var mainFrame = Firefox.getElementById("fbMainFrame");
        var cs = mainFrame.ownerDocument.defaultView.getComputedStyle(mainFrame);
        var watchRow = this.panelNode.getElementsByClassName("watchNewRow").item(0);
        watchRow.style.direction = cs.direction;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    showMembers: function(members, update, scrollTop)
    {
    },

    refreshMember: function(member, value)
    {
        this.tree.updateMember(member, value);
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
        this.watches[rowIndex] = new WatchExpression(value);
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
            var watchRow = this.panelNode.getElementsByClassName("watchRow")[rowIndex];
            this.showToolbox(watchRow);
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

        // The debugger must be halted at this moment in order to eval on the server side.
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

        // Evaluate through the debuggerTool.
        this.context.evalInProgress = true;
        this.tool.eval(this.context.currentFrame, expression, onEvaluated);
    },

    onEvalWatches: function(resultGrip)
    {
        Trace.sysout("watchPanel.evalWatches; EVALUATED ", resultGrip);

        // If grip is not defined an exception has been thrown.
        if (!resultGrip)
            return;

        var self = this;

        // xxxHonza: the entire logic related to evaluate result, should be refactored
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

            // The number of results should be the same as the number of user expressions
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

    evalWatchesLocally: function()
    {
        // Executed if evaluation fails. The error message is displayed instead
        // of the result value using {@link Exception} template.
        function onFailure(watch, result)
        {
            watch.value = new ErrorCopy(result + "");
        }

        // Executed if evaluation succeeds. The result value is set to related
        // {@link WatchExpression} instance.
        function onSuccess(watch, value)
        {
            watch.value = value;

            // The evaluation is synchronous at the moment and done before
            // tree rendering so, we don't have to update now. This will be
            // necessary as soon as the evaluation is async.
            //this.tree.updateObject(watch);
        }

        // Iterate over all user expressions and evaluate them using {@link CommandLine} API
        // Future implementation should used RDP and perhaps built-in WebConsoleActor, see:
        // https://developer.mozilla.org/en-US/docs/Tools/Web_Console/remoting
        // However, the built-in actor doesn't support .% syntax.
        // Pass |noStateChange == true| to avoid infinite loops.
        for (var i=0; i<this.watches.length; i++)
        {
            var watch = this.watches[i];

            CommandLine.evaluate(watch.expr, this.context, null, null,
                onSuccess.bind(this, watch), onFailure.bind(this, watch),
                {noStateChange: true});
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // DebuggerTool Listener

    onStartDebugging: function(context, event, packet)
    {
        Trace.sysout("watchPanel.onStartDebugging;");

        // Debugger is paused, display the current scope chain.
        this.selection = this.context.currentFrame;
        this.doUpdateSelection(this.selection);
    },

    onStopDebugging: function(context, event, packet)
    {
        Trace.sysout("watchPanel.onStopDebugging;");

        // Save state of the Watch panel for the next pause.
        this.tree.saveState(this.toggles);

        // Debugger is resumed, display the default content (current global scope).
        // xxxHonza: when stepping the default selection is displayed for a short
        // time, which causes content flashing. This should be fixed by issue 6943.
        this.selection = this.getDefaultSelection();
        this.doUpdateSelection(this.selection);
    },

    framesadded: function(stackTrace)
    {
        Trace.sysout("watchPanel.framesadded;", stackTrace);

        // When a variable within the scope chain is edited the {@link WatchPanel.refresh} method
        // calls {@link DebuggerTool.cleanScopes} to get fresh scopes including the new value.
        // So, when we get new frames from the backend we need to refresh the content.
        // Of course, save the presentation state before refresh.
        this.tree.saveState(this.toggles);
        this.selection = this.context.currentFrame;
        this.doUpdateSelection(this.selection);
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

        if (!panel || (panel.name != "dom" && panel.name != "watches"))
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

        items.push("-", {
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

        var itemIDs = items.map((item) => item.id);
        var isWatch = Dom.getAncestorByClass(target, "watchRow");

        // find the index of "EditDOMProperty" in the items:
        var editWatchIndex = itemIDs.indexOf("EditDOMProperty");

        // find the index of "DeleteWatch" in the items:
        var deleteWatchIndex = itemIDs.indexOf("DeleteProperty");

        if (isWatch)
        {
            if (editWatchIndex !== -1)
            {
                items[editWatchIndex].label = "EditWatch";
                items[editWatchIndex].tooltiptext = "watch.tip.Edit_Watch";
            }

            if (deleteWatchIndex !== -1)
            {
                items[deleteWatchIndex].label = "DeleteWatch";
                items[deleteWatchIndex].tooltiptext = "watch.tip.Delete_Watch";
            }
        }

        // if DeleteWatch was found, we insert DeleteAllWatches after it
        // otherwise, we insert the item at the beginning of the menu
        var deleteAllWatchesIndex = 0;
        if (deleteWatchIndex !== -1)
            deleteAllWatchesIndex = deleteWatchIndex + 1;
        else if (editWatchIndex !== -1)
            deleteAllWatchesIndex = editWatchIndex + 1;

        Trace.sysout("insert DeleteAllWatches at: " + deleteAllWatchesIndex);

        // insert DeleteAllWatches after DeleteWatch
        items.splice(deleteAllWatchesIndex, 0, {
            id: "fbDeleteAllWatches",
            label: "DeleteAllWatches",
            tooltiptext: "watch.tip.Delete_All_Watches",
            command: Obj.bindFixed(this.deleteAllWatches, this)
        });

        // Add a separator before the 'Delete All Watches' option in case a
        // DOM property was clicked
        if (!isWatch)
            items.splice(deleteAllWatchesIndex, 0, "-");

        return items;
    },

    /**
     * getPopupObject is executed when Firebug's context menu is showing.
     * The purpose of the method is returning clicked object, which is used for inspect actions.
     * See {@link FirebugChrome.onContextShowing} for more details.
     */
    getPopupObject: function(target)
    {
        Trace.sysout("watchPanel.getPopupObject; target:", target);

        var object = BasePanel.getPopupObject.apply(this, arguments);
        return object ? this.getObjectView(object) : object;
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
            Firebug.Editor.startEditing(row, member.value.expr);
            return;
        }

        // Use basic editing logic implemented in {@link DomBasePanel}.
        BasePanel.editProperty.apply(this, arguments);
    },

    deleteProperty: function(row)
    {
        this.deleteWatch(row);
    },

    getEditor: function(target, value)
    {
        if (!this.editor)
            this.editor = new WatchEditor(this.document);

        return this.editor;
    },

    setPropertyValue: function(row, value)
    {
        // The current tree is refreshed after editing a property (set by evaluation)
        // So, make sure to persist the proper tree state.
        if (this.selection instanceof StackFrame)
            this.tree.saveState(this.toggles);

        var member = row.domObject;

        // If the user changes the frame result value, store the value
        // in ReturnValueModifier. Otherwise, just redirect to the super class.
        if (member && (member.value instanceof WatchProvider.FrameResultObject))
            this.setPropertyReturnValue(value);
        else
            BasePanel.setPropertyValue.apply(this, arguments);
    },

    /**
     * Evaluate the expression and store its result in ReturnValueModifier.
     * ReturnValueModifier will store it (weakly referenced), and return it on frame completion.
     *
     * @param {string} value The expression entered by the user whose result is the value to store.
     *
     */
    setPropertyReturnValue: function(value)
    {
        var onSuccess = (result, context) =>
        {
            Trace.sysout("watchPanel.setPropertyReturnValue; evaluate success", result);
            ReturnValueModifier.setUserReturnValue(context, result);
        };

        var onFailure = (exc, context) =>
        {
            Trace.sysout("watchPanel.setPropertyReturnValue; evaluation FAILED " + exc, exc);
            try
            {
                // See DomBasePanel.setPropertyValue for the explanation.
                ReturnValueModifier.setUserReturnValue(context, value);
            }
            catch (exc)
            {
            }
        };

        var options = {noStateChange: true};
        CommandLine.evaluate(value, this.context, null, null, onSuccess, onFailure, options);

        this.refresh();
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

    getRowPropertyValue: function(row)
    {
        var member = row.domObject;
        if (member && (member.value instanceof WatchProvider.FrameResultObject))
            return this.provider.getValue(member.value);

        return BasePanel.getRowPropertyValue.apply(this, arguments);
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(WatchPanel);

return WatchPanel;

// ********************************************************************************************* //
});
