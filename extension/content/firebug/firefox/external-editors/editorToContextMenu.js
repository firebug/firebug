/* See license.txt for terms of usage */

// ********************************************************************************************* //

// xxxHonza: this file should be transformed into AMD module
function OpenEditorShowHide(event)
{
    var doc = event.target.ownerDocument;
    var item = doc.getElementById("menu_firebugOpenWithEditor");

    var popupNode = doc.popupNode;
    var hidden = (popupNode instanceof HTMLInputElement
        || popupNode instanceof HTMLIFrameElement
        || popupNode instanceof HTMLTextAreaElement)

    if (hidden)
    {
        item.hidden = true;
        return;
    }

    var editor = Firebug.ExternalEditors.getDefaultEditor();
    if (!editor)
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
    top.window.removeEventListener("load", addOpenEditorShowHide, false);

    var doc = top.window.document;
    var contextMenu = doc.getElementById("contentAreaContextMenu");
    if (contextMenu)
    {
        addContextToForms();
        contextMenu.addEventListener("popupshowing", OpenEditorShowHide, false);
    }
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
