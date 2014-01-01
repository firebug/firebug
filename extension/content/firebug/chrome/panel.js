/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/css",
    "firebug/lib/options",
    "firebug/lib/dom",
    "firebug/lib/events",
    "firebug/lib/wrapper",
    "firebug/chrome/eventSource",
    "firebug/chrome/searchBox",
],
function(Firebug, FBTrace, Obj, Css, Options, Dom, Events, Wrapper, EventSource, SearchBox) {

"use strict";

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_PANELS");
var TraceError = FBTrace.to("DBG_ERRORS");

// ********************************************************************************************* //
// Implementation

/**
 * @panel Base class for all panels. Every derived panel must define a constructor and
 * register with <code>Firebug.registerPanel</code> method. An instance of the panel
 * object is created by the framework for each browser tab where Firebug is activated.
 */
var Panel = Obj.extend(new EventSource(),
/** @lends Panel */
{
    searchable: false,    // supports search
    editable: true,       // clicking on contents in the panel will invoke the inline editor,
                          // e.g. the CSS Style panel or HTML panel.
    breakable: false,     // if true, supports break-on-next (the pause button functionality)
    order: 2147483647,    // relative position of the panel (or a side panel)
    statusSeparator: "<", // the character used to separate items on the panel status (aka
                          // breadcrumbs) in the tool bar, e.g. ">"  in the DOM panel
    enableA11y: false,    // true if the panel wants to participate in A11y accessibility support.
    deriveA11yFrom: null, // Name of the panel that uses the same a11y logic.
    inspectable: false,   // true to support inspecting elements inside this panel

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function(context, doc)
    {
        if (!context.browser)
        {
            TraceError.sysout("attempt to create panel with dud context!");
            return false;
        }

        this.context = context;
        this.document = doc;

        this.panelNode = doc.createElement("div");
        this.panelNode.ownerPanel = this;

        Css.setClass(this.panelNode, "panelNode panelNode-" + this.name + " contextUID=" +
            context.uid);

        // Load persistent content if any.
        var persistedState = Firebug.getPanelState(this);
        if (persistedState)
        {
            this.persistContent = persistedState.persistContent;
            if (this.persistContent && persistedState.panelNode)
                this.loadPersistedContent(persistedState);
        }

        // The default value for 'Persist' is set only the first time.
        if (typeof(this.persistContent) == "undefined")
            this.persistContent = Options.get(this.name + ".defaultPersist");

        doc.body.appendChild(this.panelNode);

        // Update panel's tab in case the break-on-next (BON) is active.
        var shouldBreak = this.shouldBreakOnNext();

        // xxxHonza: import the right module
        Firebug.Breakpoint.updatePanelTab(this, shouldBreak);

        Trace.sysout("firebug.initialize panelNode for " + this.name);

        this.initializeNode(this.panelNode);
    },

    destroy: function(state) // Panel may store info on state
    {
        Trace.sysout("firebug.destroy panelNode for " + this.name);

        state.persistContent = this.persistContent;

        if (this.panelNode)
        {
            if (this.persistContent)
                this.savePersistedContent(state);

            delete this.panelNode.ownerPanel;
        }

        this.destroyNode();

        // xxxHonza: not exactly sure why, but it helps when testing memory-leaks.
        // Note that the selection can point to a document (in case of the HTML panel).
        // Perhaps it breaks a cycle (page -> Firebug -> page)?
        this.selection = null;
        delete this.panelBrowser;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Persistence

    savePersistedContent: function(state)
    {
        state.panelNode = this.panelNode;
    },

    loadPersistedContent: function(persistedState)
    {
        // move the nodes from the persistedState to the panel
        while (persistedState.panelNode.firstChild)
            this.panelNode.appendChild(persistedState.panelNode.firstChild);

        Dom.scrollToBottom(this.panelNode);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Life Cycle

    /**
     * Called when a panel in one XUL window is about to disappear to later reappear in
     * another XUL window.
     */
    detach: function(oldChrome, newChrome)
    {
    },

    // This is how a panel in one window reappears in another window; lazily called
    reattach: function(doc)
    {
        this.document = doc;

        if (this.panelNode)
        {
            var scrollTop = this.panelNode.scrollTop;
            this.panelNode = doc.adoptNode(this.panelNode, true);
            this.panelNode.ownerPanel = this;
            doc.body.appendChild(this.panelNode);
            this.panelNode.scrollTop = scrollTop;
        }
    },

    // Called at the end of module.initialize; addEventListener-s here
    initializeNode: function(panelNode)
    {
        Events.dispatch(this.fbListeners, "onInitializeNode", [this]);
    },

    // removeEventListener-s here.
    destroyNode: function()
    {
        Events.dispatch(this.fbListeners, "onDestroyNode", [this]);
    },

    show: function(state)  // persistedPanelState plus non-persisted hide() values
    {
    },

    hide: function(state)  // store info on state for next show.
    {
    },

    watchWindow: function(context, win)
    {
    },

    unwatchWindow: function(context, win)
    {
    },

    loadWindow: function(context, win)
    {
    },

    updateOption: function(name, value)
    {
    },

    /**
     * Called after chrome.applyTextSize
     * @param zoom: ratio of current size to normal size, e.g. 1.5
     */
    onTextSizeChange: function(zoom)
    {

    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Toolbar

    showToolbarButtons: function(buttonsId, show)
    {
        try
        {
            var buttons = Firebug.chrome.$(buttonsId);
            Dom.collapse(buttons, !show);
        }
        catch (exc)
        {
            TraceError.sysout("panel.showToolbarButtons; FAILS " + exc, exc);
        }
    },

    onGetPanelToolbarButtons: function(panel, items)
    {
        return [];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Returns a number indicating the view's ability to inspect the object.
     *
     * Zero means not supported, and higher numbers indicate specificity.
     */
    supportsObject: function(object, type)
    {
        return 0;
    },

    // beyond type testing, is this object selectable?
    hasObject: function(object)
    {
        return false;
    },

    navigate: function(object)
    {
        // Get default location object if none is specified.
        if (!object)
            object = this.getDefaultLocation();

        // Make sure the location is *not* undefined.
        if (!object)
            object = null;

        // We should be extra careful when dealing with the |location| object (include
        // converting it to string).
        // There might be cases where the object is removed from the page (e.g. a stylesheet
        // that is currently displayed in the CSS panel) and the panel location not updated.
        //
        // This might happen because of optimization, where background panels do not observe
        // changes on the page (e.g. using a Mutation Observer).
        //
        // The object is a dead wrapper in such moments firing an exception anytime
        // its properties or methods are accessed.
        // So just pass the object back to the panel, which must do proper checking.
        if (!this.location || (object != this.location))
        {
            Trace.sysout("Panel.navigate; " + this.name);

            this.location = object;
            this.updateLocation(object);

            Events.dispatch(Firebug.uiListeners, "onPanelNavigate", [object, this]);
        }
        else
        {
            Trace.sysout("Panel.navigate; Skipped for panel " + this.name);
        }
    },

    /**
     * The location object has been changed, the panel should update it view
     *
     * @param object a location, must be one of getLocationList() returns
     *  if  getDefaultLocation() can return null, then updateLocation must handle it here.
     */
    updateLocation: function(object)
    {
    },

    select: function(object, forceUpdate)
    {
        if (!object)
            object = this.getDefaultSelection();

        Trace.sysout("firebug.select " + this.name + " forceUpdate: " + forceUpdate + " " +
            object + ((object == this.selection) ? "==" : "!=") + this.selection);

        if (forceUpdate || object != this.selection)
        {
            this.selection = object;
            this.updateSelection(object);

            Events.dispatch(Firebug.uiListeners, "onObjectSelected", [object, this]);
        }
    },

    /**
     * Firebug wants to show an object to the user and this panel has the best supportsObject()
     * result for the object. If the panel displays a container for objects of this type,
     * it should set this.selectedObject = object
     */
    updateSelection: function(object)
    {
    },

    /**
     * Redisplay the panel based on the current location and selection
     */
    refresh: function()
    {
        if (this.location)
            this.updateLocation(this.location);
        else if (this.selection)
            this.updateSelection(this.selection);
    },

    markChange: function(skipSelf)
    {
        if (this.dependents)
        {
            if (skipSelf)
            {
                for (var i = 0; i < this.dependents.length; i++)
                {
                    var panelName = this.dependents[i];
                    if (panelName != this.name)
                        this.context.invalidatePanels(panelName);
                }
            }
            else
            {
                this.context.invalidatePanels.apply(this.context, this.dependents);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Inspector

    /**
     * Called by the framework when the user starts inspecting. Inspecting must be enabled
     * for the panel (panel.inspectable == true)
     */
    startInspecting: function()
    {
    },

    /**
     * Called by the framework when inspecting is in progress and the user moves the mouse over
     * a new page element. Inspecting must be enabled for the panel (panel.inspectable == true).
     * This method is called in a timeout to avoid performance penalties when the user moves
     * the mouse over the page elements too fast.
     *
     * @param {Element} node The page element being inspected
     * @returns {Boolean} Returns true if the node should be selected within the panel using
     *      the default panel selection mechanism (i.e. by calling panel.select(node) method).
     */
    inspectNode: function(node)
    {
        return true;
    },

    /**
     * Called by the framework when the user stops inspecting. Inspecting must be enabled
     * for the panel (panel.inspectable == true)
     *
     * @param {Element} node The last page element inspected
     * @param {Boolean} canceled Set to true if inspecting has been canceled
     *          by pressing the escape key.
     */
    stopInspecting: function(node, canceled)
    {
    },

    /**
     * Called by the framework when inspecting is in progress. Allows to inspect
     * only nodes that are supported by the panel. Derived panels can provide effective
     * algorithms to provide these nodes.
     * @param {Element} node Currently inspected page element.
     */
    getInspectNode: function(node)
    {
        while (node)
        {
            if (this.supportsObject(node, typeof node))
                return node;
            node = node.parentNode;
        }
        return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Called by search in the case something was found.
     * This will highlight the given node for a specific time-span. There's only one node
     * highlighted at a time.
     *
     * @param {Node} Node to highlight
     */
    highlightNode: function(node)
    {
        if (this.highlightedNode)
            Css.cancelClassTimed(this.highlightedNode, "jumpHighlight", this.context);

        this.highlightedNode = node;

        if (node)
            Css.setClassTimed(node, "jumpHighlight", this.context);
    },

    /**
     * Called by the framework when panel search is used.
     * This is responsible for finding and highlighting search matches.
     *
     * @param {String} text String to search for
     * @param {Boolean} reverse Indicates, if search is reversed
     * @returns {Boolean} true, if search matched, otherwise false
     */
    search: function(text, reverse)
    {
    },

    /**
     * Retrieves the search options that this modules supports.
     * This is used by the search UI to present the proper options.
     */
    getSearchOptionsMenuItems: function()
    {
        return [
            SearchBox.searchOptionMenu("search.Case Sensitive", "searchCaseSensitive",
                "search.tip.Case_Sensitive")
        ];
    },

    /**
     * Navigates to the next document whose match parameter returns true.
     */
    navigateToNextDocument: function(match, reverse)
    {
        // This is an approximation of the UI that is displayed by the location
        // selector. This should be close enough, although it may be better
        // to simply generate the sorted list within the module, rather than
        // sorting within the UI.
        var self = this;
        function compare(a, b)
        {
            var locA = self.getObjectDescription(a);
            var locB = self.getObjectDescription(b);

            if (locA.path > locB.path)
                return 1;
            if (locA.path < locB.path)
                return -1;
            if (locA.name > locB.name)
                return 1;
            if (locA.name < locB.name)
                return -1;

            return 0;
        }

        var allLocs = this.getLocationList().sort(compare);
        for (var curPos = 0; curPos < allLocs.length && allLocs[curPos] != this.location; curPos++);

        function transformIndex(index)
        {
            if (reverse)
            {
                // For the reverse case we need to implement wrap around.
                var intermediate = curPos - index - 1;
                return (intermediate < 0 ? allLocs.length : 0) + intermediate;
            }
            else
            {
                return (curPos + index + 1) % allLocs.length;
            }
        };

        for (var next = 0; next < allLocs.length - 1; next++)
        {
            var object = allLocs[transformIndex(next)];

            if (match(object))
            {
                this.navigate(object);
                return object;
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Options menu item
     * @typedef {Object} OptionsMenuItem
     * @property {String} label - Label of the item
     * @property {String} tooltiptext - Tooltip text of the item
     * @property {Boolean} nol10n - If true, the label and tooltiptext won't be translated
     * @property {String} type - Type of the menu item
     * @property {Boolean} checked - If true, the item is checked
     * @property {Function} command - Command, which is executed when the item is clicked
     */

    /**
     * Called when "Options" clicked. Return array of
     *
     * @returns {OptionsMenuItem[]} Generated menu items
     */
    getOptionsMenuItems: function()
    {
        return null;
    },

    /**
     * Called by chrome.onContextMenu to build the context menu when this panel has focus.
     * See also FirebugRep for a similar function also called by onContextMenu
     * Extensions may monkey patch and chain off this call
     *
     * @param object: the 'realObject', a model value, e.g. a DOM property
     * @param target: the HTML element clicked on.
     * @returns an array of menu items.
     */
    getContextMenuItems: function(object, target)
    {
        return [];
    },

    getBreakOnMenuItems: function()
    {
        return [];
    },

    getEditor: function(target, value)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getDefaultSelection: function()
    {
        return null;
    },

    browseObject: function(object)
    {
    },

    getPopupObject: function(target)
    {
        return Firebug.getRepObject(target);
    },

    getTooltipObject: function(target)
    {
        return Firebug.getRepObject(target);
    },

    showInfoTip: function(infoTip, x, y)
    {

    },

    getObjectPath: function(object)
    {
        return null;
    },

    /**
     * An array of objects that can be passed to getObjectLocation.
     * The list of things a panel can show, e.g. sourceFiles.
     * Only shown if panel.location is defined and supportsObject is true
     */
    getLocationList: function()
    {
        return null;
    },

    getDefaultLocation: function()
    {
        return null;
    },

    getObjectLocation: function(object)
    {
        return "";
    },

    /**
     * URL parts
     * @typedef {Object} URLParts
     * @property {String} path - Group/category label
     * @property {String} name - Item label
     */

    /**
     * Text for the location list menu e.g. Script panel source file list
     *
     * @returns {URLParts} Object description
     */
    getObjectDescription: function(object)
    {
        var url = this.getObjectLocation(object);
        return Url.splitURLBase(url);
    },

    /**
     *  UI signal that a tab needs attention, e.g. Script panel is currently stopped on a breakpoint
     *  @param {Boolean} show If true, highlighting is turned on
     */
    highlight: function(show)
    {
        var tab = this.getTab();
        if (!tab)
            return;

        if (show)
            tab.setAttribute("highlight", "true");
        else
            tab.removeAttribute("highlight");
    },

    getTab: function()
    {
        return Firebug.getPanelTab(this.name);
    },

    /**
     * If the panel supports source viewing, then return a SourceLink, else null
     *
     * @param target an element from the panel under the mouse
     * @param object the realObject under the mouse
     */
    getSourceLink: function(target, object)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Support for Break On Next

    /**
     * Called by the framework to see if the panel currently supports BON
     */
    supportsBreakOnNext: function()
    {
        return this.breakable;  // most panels just use this flag
    },

    /**
     * Called by the framework when the user clicks on the Break On Next button.
     *
     * @param {Boolean} armed Set to true if the Break On Next feature is
     * to be armed for action and set to false if the Break On Next should be disarmed.
     * If 'armed' is true, then the next call to shouldBreakOnNext should be |true|.
     */
    breakOnNext: function(armed)
    {
    },

    /**
     * Called when a panel is selected/displayed. The method should return true
     * if the Break On Next feature is currently armed for this panel.
     */
    shouldBreakOnNext: function()
    {
        return false;
    },

    /**
     * Returns labels for Break On Next tooltip (one for enabled and one for disabled state).
     *
     * @param {Boolean} enabled Set to true if the Break On Next feature is
     * currently activated for this panel.
     */
    getBreakOnNextTooltip: function(enabled)
    {
        return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Selected Object

    /**
     * Define getter for the |selection| property. This way we can always check if the current
     * selected object is valid and reset if necessary.
     */
    get selection()
    {
        try
        {
            if (this._selection && Wrapper.isDeadWrapper(this._selection))
                this._selection = null;
        }
        catch (err)
        {
            this._selection = null;
        }

        return this._selection;
    },

    set selection(val)
    {
        this._selection = val;
    }
});

// ********************************************************************************************* //
// Registration

// xxxHonza: backward compatibility.
Firebug.Panel = Panel;

return Panel;

// ********************************************************************************************* //
});
