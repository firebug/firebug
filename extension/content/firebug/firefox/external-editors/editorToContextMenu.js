/* See license.txt for terms of usage */

// ********************************************************************************************* //

// xxxHonza: this file should be transformed into AMD module.
// Or perhaps joined with an existing module?
function addOpenEditorShowHide(event)
{
    top.window.removeEventListener("load", addOpenEditorShowHide, false);

    var doc = top.window.document;
    var contextMenu = doc.getElementById("contentAreaContextMenu");
    if (contextMenu)
        addContextToForms();
};

function addContextToForms(contextMenu)
{
    if (typeof(top.nsContextMenu) == "undefined")
        return;

    // https://bugzilla.mozilla.org/show_bug.cgi?id=433168
    var setTargetOriginal = top.nsContextMenu.prototype.setTarget;
    top.nsContextMenu.prototype.setTarget = function(aNode, aRangeParent, aRangeOffset)
    {
        setTargetOriginal.apply(this, arguments);
        if (this.isTargetAFormControl(aNode))
            this.shouldDisplay = true;
    };
}

// ********************************************************************************************* //

top.window.addEventListener("load", addOpenEditorShowHide, false);

// ********************************************************************************************* //
