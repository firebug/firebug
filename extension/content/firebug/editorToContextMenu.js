/* See license.txt for terms of usage */

// Runs during overlay processing
function OpenEditorShowHide(event) 
{
    var item = document.getElementById("menu_firebugOpenWithEditor");

    var popupNode = document.popupNode;
    item.hidden = (popupNode instanceof HTMLInputElement
        || popupNode instanceof HTMLIFrameElement
        || popupNode instanceof HTMLTextAreaElement
        || Firebug.registeredEditors.length == 0);
}

function addOpenEditorShowHide(event)
{
    window.removeEventListener("load", addOpenEditorShowHide, false);

    var contextMenu = document.getElementById("contentAreaContextMenu");
    if (contextMenu)
    {
        addContextToForms();
        contextMenu.addEventListener("popupshowing", OpenEditorShowHide, false);
    }
};

function addContextToForms(contextMenu)
{
    // https://bugzilla.mozilla.org/show_bug.cgi?id=433168
    var setTargetOriginal = nsContextMenu.prototype.setTarget;
    nsContextMenu.prototype.setTarget = function(aNode, aRangeParent, aRangeOffset)
    {
        setTargetOriginal.apply(this, arguments);
        if (this.isTargetAFormControl(aNode))
            this.shouldDisplay = true;
    };
}

window.addEventListener("load", addOpenEditorShowHide, false);
