/* See license.txt for terms of usage */

/**
 * This file defines Inspector APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Inspector API

this.inspectElement = function(elt)
{
    FBTest.clickToolbarButton(FW.Firebug.chrome, "fbInspectButton");
    FBTest.click(elt);
};

this.inspectUsingFrame = function(elt)
{
    FW.Firebug.Inspector.highlightObject(elt, FW.Firebug.currentContext, "frame", null);
};

this.inspectUsingBoxModel = function(elt)
{
    FW.Firebug.Inspector.highlightObject(elt, FW.Firebug.currentContext, "boxModel", null);
};

this.inspectUsingBoxModelWithRulers = function(elt)
{
    FW.Firebug.Inspector.highlightObject(elt, FW.Firebug.currentContext, "boxModel", "content");
};

this.inspectorClear = function()
{
    FW.Firebug.Inspector.highlightObject(null);
};

this.isInspectorActive = function()
{
    return FW.Firebug.Inspector.inspecting;
};

// ********************************************************************************************* //
}).apply(FBTest);
