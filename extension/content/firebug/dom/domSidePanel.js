/* See license.txt for terms of usage */
/*jshint esnext:true, es5:true, curly:false */
/*global FBTrace:true, XPCNativeWrapper:true, Window:true, define:true */

define([
    "firebug/lib/object",
    "firebug/dom/domPanel",
],
function(Obj, DOMPanel) {

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

DOMSidePanel.prototype = Obj.extend(DOMPanel.prototype,
/** @lends DOMSidePanel */
{
    name: "domSide",
    parentPanel: "html",
    order: 3,
    enableA11y: true,
    deriveA11yFrom: "console"
});

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(DOMSidePanel);

return DOMSidePanel;

// ********************************************************************************************* //
});
