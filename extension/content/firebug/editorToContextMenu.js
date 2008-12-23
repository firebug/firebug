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
        contextMenu.addEventListener("popupshowing", OpenEditorShowHide, false);
};
    
window.addEventListener("load", addOpenEditorShowHide, false);