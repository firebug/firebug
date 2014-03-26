/* See license.txt for terms of usage */

/**
 * This file defines Inspector APIs for test drivers.
 */

(function() {

// ********************************************************************************************* //
// Inspector API

this.inspectElement = function(elt, onlyHover)
{
    FBTest.clickToolbarButton(FW.Firebug.chrome, "fbInspectButton");
    FBTest.mouseOver(elt);

    if (!onlyHover)
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

this.stopInspecting = function()
{
    if (this.isInspectorActive())
        FBTest.clickToolbarButton(FW.Firebug.chrome, "fbInspectButton");
};
// ********************************************************************************************* //
}).apply(FBTest);
