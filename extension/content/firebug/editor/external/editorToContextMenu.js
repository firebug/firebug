/* See license.txt for terms of usage */

// ********************************************************************************************* //

// Runs during overlay processing
function OpenEditorShowHide(event)
{
    var item = document.getElementById("menu_firebugOpenWithEditor");

    var popupNode = document.popupNode;
    var hidden = (popupNode instanceof HTMLInputElement
        || popupNode instanceof HTMLIFrameElement
        || popupNode instanceof HTMLTextAreaElement)
    if(hidden)
    {
        item.hidden = true;
        return;
    }
    var editor=Firebug.ExternalEditors.getDefaultEditor();
    if(!editor)
    {
        item.hidden = true;
        return;
    }
    item.hidden = false;
    item.setAttribute('image', editor.image);
    item.setAttribute('label', editor.label);
    item.value = editor.id;
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
    if (typeof(nsContextMenu) == "undefined")
        return;

    // https://bugzilla.mozilla.org/show_bug.cgi?id=433168
    var setTargetOriginal = nsContextMenu.prototype.setTarget;
    nsContextMenu.prototype.setTarget = function(aNode, aRangeParent, aRangeOffset)
    {
        setTargetOriginal.apply(this, arguments);
        if (this.isTargetAFormControl(aNode))
            this.shouldDisplay = true;
    };
}

// ********************************************************************************************* //

window.addEventListener("load", addOpenEditorShowHide, false);

// ********************************************************************************************* //
