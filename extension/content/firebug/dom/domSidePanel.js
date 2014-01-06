/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false */
/*global FBTrace:true, XPCNativeWrapper:true, Window:true, define:true */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/dom/domBasePanel",
    "firebug/dom/domPanelTree",
    "firebug/dom/domProvider",
    "firebug/dom/domMemberProvider",
    "firebug/dom/toggleBranch",
],
function(Firebug, FBTrace, Obj, DOMBasePanel, DomPanelTree, DomProvider, DOMMemberProvider,
    ToggleBranch) {

"use strict";

// ********************************************************************************************* //
// Constants

var Trace = FBTrace.to("DBG_DOM");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// DOM Side Panel Implementation

/**
 * @panel This object represents a DOM Side panel used inside the HTML panel.
 */
function DOMSidePanel()
{
}

var BasePanel = DOMBasePanel.prototype;
DOMSidePanel.prototype = Obj.extend(BasePanel,
/** @lends DOMSidePanel */
{
    dispatchName: "DOMSidePanel",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "domSide",
    parentPanel: "html",
    order: 3,
    enableA11y: true,
    deriveA11yFrom: "console",

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        BasePanel.initialize.apply(this, arguments);

        // Content rendering
        this.provider = new DomProvider(this);
        this.tree = new DomPanelTree(this.context, this.provider,
            new DOMMemberProvider(this.context));
        this.toggles = new ToggleBranch.ToggleBranch();
        this.scrollTop = 0;
    },

    destroy: function(state)
    {
        BasePanel.destroy.apply(this, arguments);

        Trace.sysout("domSidePanel.destroy; scrollTop: " + this.panelNode.scrollTop);

        // Save tree state
        state.toggles = this.toggles;
        this.tree.saveState(state.toggles);

        this.tree.destroy();

        // Save scroll position
        state.scrollTop = this.panelNode.scrollTop;
    },

    hide: function()
    {
        BasePanel.hide.apply(this, arguments);
    },

    updateSelection: function(object)
    {
        Trace.sysout("domSidePanel.updateSelection;");

        this.rebuild(false, this.scrollTop, this.toggles);
    },

    show: function(state)
    {
        BasePanel.show.apply(this, arguments);

        Trace.sysout("domSidePanel.show;", state);

        if (state)
        {
            if (state.toggles)
                this.toggles = state.toggles;

            if (state.scrollTop)
                this.scrollTop = state.scrollTop;
        }
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(DOMSidePanel);

return DOMSidePanel;

// ********************************************************************************************* //
});
