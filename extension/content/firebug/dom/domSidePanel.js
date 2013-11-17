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
],
function(Firebug, FBTrace, Obj, DOMBasePanel, DomPanelTree, DomProvider, DOMMemberProvider) {

"use strict";

// ********************************************************************************************* //
// Constants

// ********************************************************************************************* //
// DOM Side Panel Implementation

/**
 * @panel This object represents a DOM Side panel used inside the HTML panel.
 */
function DOMSidePanel()
{
}

DOMSidePanel.prototype = Obj.extend(DOMBasePanel.prototype,
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
        // Content rendering
        this.provider = new DomProvider(this);
        this.tree = new DomPanelTree(this.provider, new DOMMemberProvider(this.context));

        DOMBasePanel.prototype.initialize.apply(this, arguments);
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(DOMSidePanel);

return DOMSidePanel;

// ********************************************************************************************* //
});
