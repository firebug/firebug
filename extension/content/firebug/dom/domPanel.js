/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false */
/*global FBTrace:true, XPCNativeWrapper:true, Window:true, define:true */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/array",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/css",
    "firebug/lib/search",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/persist",
    "firebug/lib/deprecated",
    "firebug/chrome/rep",
    "firebug/chrome/reps",
    "firebug/chrome/searchBox",
    "firebug/dom/domBasePanel",
    "firebug/dom/domModule",
    "firebug/dom/domPanelTree",
    "firebug/dom/domProvider",
    "firebug/dom/domMemberProvider",
    "firebug/dom/toggleBranch",
],
function(Firebug, FBTrace, Obj, Arr, Events, Dom, Css, Search, Domplate, Locale, Persist,
    Deprecated, Rep, FirebugReps, SearchBox, DOMBasePanel, DOMModule, DomPanelTree, DomProvider,
    DOMMemberProvider, ToggleBranch) {

// ********************************************************************************************* //
// Resources

// Firebug wiki: https://getfirebug.com/wiki/index.php/DOM_Panel

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_DOMPANEL");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// DOM Panel

/**
 * @panel This object represents DOM panel in the main Firebug UI.
 *
 * The panel is derived from {@DOMBasePanel} and adds logic related to 'object path'.
 * It's a path displayed in the panel's toolbar and synchronized through {@Panel.getObjectPath}
 * and {@FirebugChrome.syncStatusPath}.
 *
 * The panel also knows how to create/show/update DOM breakpoints.
 */
function DOMPanel()
{
}

var BasePanel = DOMBasePanel.prototype
DOMPanel.prototype = Obj.extend(BasePanel,
/** @lends DOMPanel */
{
    dispatchName: "DOMPanel",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "dom",
    searchable: true,
    statusSeparator: ">",
    enableA11y: true,
    deriveA11yFrom: "console",
    searchType : "dom",
    order: 50,
    inspectable: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        // Support for status path update when clicking on DOM object (must be done before
        // super class initialization).
        this.onClick = this.onClick.bind(this);

        BasePanel.initialize.apply(this, arguments);

        // Support for breakpoints
        DOMModule.addListener(this);

        // Content rendering
        this.provider = new DomProvider(this);
        this.tree = new DomPanelTree(this.context, this.provider,
            new DOMMemberProvider(this.context));

        // Object path in the toolbar.
        // xxxHonza: the persistence of the object-path would deserve complete refactoring.
        // The code is messy and hard to understand.
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
    },

    destroy: function(state)
    {
        if (this.pathIndex > -1)
            state.pathIndex = this.pathIndex;
        if (this.viewPath)
            state.viewPath = this.viewPath;
        if (this.propertyPath)
            state.propertyPath = this.propertyPath;

        if (this.propertyPath.length > 0 && !this.propertyPath[1])
            state.firstSelection = Persist.persistObject(this.getPathObject(1), this.context);

        // Save tree state into the right toggles object.
        var view = this.viewPath[this.pathIndex];
        var toggles = view ? view.toggles : this.toggles;
        this.tree.saveState(toggles);

        state.toggles = this.toggles;

        // Explicitly destroy the tree, there might be active asynchronous tasks.
        this.tree.destroy();

        DOMModule.removeListener(this);

        Trace.sysout("domPanel.destroy; state.pathIndex: " + state.pathIndex, {
            viewPath: state.viewPath,
            propertyPath: state.propertyPath,
            toggles: state.toggles
        });

        BasePanel.destroy.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        // Add this as a capturing listener to get ahead of the rep-based click handler.
        Events.addEventListener(this.panelNode, "click", this.onClick, true);

        BasePanel.initializeNode.apply(this, arguments);
    },

    destroyNode: function()
    {
        Events.removeEventListener(this.panelNode, "click", this.onClick, true);

        BasePanel.destroyNode.apply(this, arguments);
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

            Trace.sysout("domPanel.show; state.pathIndex: " + state.pathIndex, {
                viewPath: state.viewPath,
                propertyPath: state.propertyPath,
                toggles: state.toggles
            });

            if (state.pathIndex > -1)
                this.pathIndex = state.pathIndex;
            if (state.viewPath)
                this.viewPath = state.viewPath;
            if (state.propertyPath)
                this.propertyPath = state.propertyPath;

            if (state.toggles)
                this.toggles = state.toggles;

            if (!this.viewPath.length)
                this.viewPath = [{toggles: new ToggleBranch.ToggleBranch(), scrollTop: 0}];

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
        Trace.sysout("domPanel.hide; scrollTop: " + this.panelNode.scrollTop +
            ", pathIndex; " + this.pathIndex, {viewPath: this.viewPath});

        // Safe the scroll position. It can't be done in destroy() since the
        // scrollTop is always set to zero at that moment.
        var view = this.viewPath[this.pathIndex];
        if (view)
            view.scrollTop = this.panelNode.scrollTop;
    },

    updateSelection: function(object)
    {
        var previousIndex = this.pathIndex;
        var previousView = (previousIndex === -1 ? null : this.viewPath[previousIndex]);

        // pathToAppend is set within onClick
        var newPath = this.pathToAppend;
        delete this.pathToAppend;

        var pathIndex = this.findPathIndex(object);
        if (newPath || pathIndex === -1)
        {
            Trace.sysout("dom.updateSelection; newPath: " + newPath +
                ", pathIndex: " + pathIndex);

            this.toggles = new ToggleBranch.ToggleBranch();

            if (newPath)
            {
                // Remove everything after the point where we are inserting, so we
                // essentially replace it with the new path
                if (previousView)
                {
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
            if (previousView && previousView != view)
            {
                previousView.scrollTop = this.panelNode.scrollTop;
                this.tree.saveState(previousView.toggles);
            }

            var scrollTop = view ? view.scrollTop : 0;
            var toggles = view ? view.toggles : null;

            this.rebuild(false, scrollTop, toggles);
        }

        Trace.sysout("domPanel.updateSelection; this.pathIndex: " + this.pathIndex, {
            viewPath: this.viewPath,
            propertyPath: this.propertyPath,
            toggles: this.toggles
        });

    },

    findPathIndex: function(object)
    {
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

    /**
     * Used by {@FirebugChrome.syncStatusPath}
     */
    getObjectPath: function(object)
    {
        return this.objectPath;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Status Path

    onClick: function(event)
    {
        var repNode = Firebug.getRepNode(event.target);
        if (!repNode)
            return;

        // We are only interested if the click is made on an object that represents
        // DOM property value (usually a green link). Not in clicks on tree rows where
        // the repObject is a tree-member object.
        if (Css.hasClass(repNode, "memberRow"))
            return;

        var row = Dom.getAncestorByClass(event.target, "memberRow");
        if (row)
        {
            this.selectRow(row, repNode);
            Events.cancelEvent(event);
        }
    },

    selectRow: function(row, target)
    {
        Trace.sysout("domPanel.selectRow;", {
            row: row,
            target: target
        });

        if (!target)
            target = row.lastChild.firstChild;

        var object = target && target.repObject, type = typeof object;
        if (!object || !this.supportsObject(object, type))
            return;

        this.pathToAppend = this.tree.getPath(row);

        // If the object is inside an array, look up its index
        var valueBox = row.lastChild.firstChild;
        if (target !== valueBox && Css.hasClass(valueBox, "objectBox-array"))
        {
            var arrayIndex = FirebugReps.Arr.getItemIndex(target);
            this.pathToAppend.push(String(arrayIndex));
        }

        // Make sure we get a fresh status path for the object, since otherwise
        // it might find the object in the existing path and not refresh it
        Firebug.chrome.clearStatusPath();

        this.select(object, true);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Search

    search: function(text, reverse)
    {
        if (!text)
        {
            delete this.currentSearch;
            this.highlightNode(null);
            this.document.defaultView.getSelection().removeAllRanges();
            return false;
        }

        var row;
        if (this.currentSearch && text === this.currentSearch.text)
        {
            row = this.currentSearch.findNext(true, undefined, reverse,
                SearchBox.isCaseSensitive(text));
        }
        else
        {
            var findRow = function(node)
            {
                return Dom.getAncestorByClass(node, "memberRow");
            };

            this.currentSearch = new Search.TextSearch(this.panelNode, findRow);

            row = this.currentSearch.find(text, reverse, SearchBox.isCaseSensitive(text));
        }

        if (row)
        {
            var sel = this.document.defaultView.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.currentSearch.range);

            Dom.scrollIntoCenterView(row, this.panelNode);

            this.highlightNode(row);
            Events.dispatch(this.fbListeners, "onDomSearchMatchFound", [this, text, row]);
            return true;
        }
        else
        {
            this.document.defaultView.getSelection().removeAllRanges();
            Events.dispatch(this.fbListeners, "onDomSearchMatchFound", [this, text, null]);
            return false;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Breakpoints, DOMModule Listener

    onDomBreakpointAdded: function(context, object, name)
    {
        Trace.sysout("domPanel.onDomBreakpointAdded; propName: " + name +
            " (panel: " + this.name + ")", object);

        this.updateBreakpoints(object);
    },

    onDomBreakpointRemoved: function(context, object, name)
    {
        Trace.sysout("domPanel.onDomBreakpointRemoved; propName: " + name +
            " (panel: " + this.name + ")", object);

        this.updateBreakpoints(object);
    },

    updateBreakpoints: function(object)
    {
        // xxxHonza: the update should be smarter if possible. Can we just lookup
        // for the specific object and update the row directly?
        // Can we utilize DomTree widget?

        var breakpoints = this.context.dom.breakpoints;
        var rows = Dom.getElementsByClass(this.panelNode, "memberRow");
        for (var i = 0; i < rows.length; i++)
        {
            var row = rows[i];
            var member = row.domObject;

            var bp = breakpoints.findBreakpoint(member.object, member.name);
            if (bp)
            {
                row.setAttribute("breakpoint", "true");

                if (!bp.checked)
                    row.setAttribute("disabledBreakpoint", "true");
            }
            else
            {
                row.removeAttribute("breakpoint");
                row.removeAttribute("disabledBreakpoint");
            }
        }

        return null;
    },

    getBreakOnNextTooltip: function(enabled)
    {
        return (enabled ? Locale.$STR("dom.disableBreakOnPropertyChange") :
            Locale.$STR("dom.label.breakOnPropertyChange"));
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Editing

    setPropertyValue: function(row, value)
    {
        // Save tree presentation state before editing.
        var toggles = new ToggleBranch.ToggleBranch();
        this.tree.saveState(toggles);

        // Change property value (evaluation + tree refresh)
        BasePanel.setPropertyValue.apply(this, arguments);

        // Restore tree state.
        this.tree.restoreState(toggles);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Backward Compatibility with 'firebug/dom/domReps'

    /**
     * xxxHonza: following methods should be removed as soon as 'firebug/dom/domReps'
     * module is removed.
     */
    getMembers: function(object, level)
    {
        return this.tree.memberProvider.getMembers(object, level);
    },

    addMember: function()
    {
        var provider = this.tree.memberProvider;
        provider.addMember.apply(provider, arguments);
    },
});

// ********************************************************************************************* //
// Property Object Implementation

var PropertyObj = function(object, name)
{
    this.object = object;
    this.name = name;

    this.getObject = function()
    {
        return object[name];
    };
};

var Property = Domplate.domplate(Rep,
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
// Registration

Firebug.registerPanel(DOMPanel);
Firebug.registerRep(Property);

// DOMPanel.DirTable
Deprecated.property(DOMPanel, "DirTable", DOMBasePanel.prototype.dirTablePlate,
    "Using DOMPanel.DirTable is deprecated. Use 'DOMBasePanel.prototype.dirTablePlate' " +
    "module instead");

// Firebug.DOMPanel
Deprecated.property(Firebug, "DOMPanel", DOMPanel, "Using Firebug.DOMPanel is deprecated. " +
    "Load 'firebug/dom/domPanel' module instead");

return DOMPanel;

// ********************************************************************************************* //
});
