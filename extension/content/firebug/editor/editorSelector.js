/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/events",
    "firebug/lib/options",
],
function(Firebug, Events, Options) {

// ********************************************************************************************* //
// Reusable code for modules that support editing

Firebug.EditorSelector =
{
    editors: {},

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    // Override for each module
    getEditorOptionKey: function()
    {
        return "cssEditMode";
    },

    registerEditor: function(name, editor)
    {
        this.editors[name] = editor;
    },

    unregisterEditor: function(name, editor)
    {
        delete this.editors[name];
    },

    getEditorByName: function(name)
    {
        return this.editors[name];
    },

    getEditorsNames: function()
    {
        var names = [];
        for (var p in this.editors)
        {
            if (this.editors.hasOwnProperty(p))
                names.push(p);
        }
        return names;
    },

    setCurrentEditorName: function(name)
    {
        this.currentEditorName = name;
        Options.set(this.getEditorOptionKey(), name);
    },

    getCurrentEditorName: function()
    {
        if (!this.currentEditorName)
            this.currentEditorName = Options.get(this.getEditorOptionKey());

        return this.currentEditorName;
    },

    getCurrentEditor: function()
    {
        return this.getEditorByName(this.getCurrentEditorName());
    },

    onEditMode: function(event, menuitem)
    {
        var mode = menuitem.getAttribute("mode");
        if (mode)
            this.setCurrentEditorName(mode);

        this.updateEditButton();
        Events.cancelEvent(event);
    },

    updateEditButton: function()
    {
        // Update label and tooltip text of the edit button.
        var mode = this.getCurrentEditorName();
        if (!mode)
            return;

        var menuitem = Firebug.chrome.$("menu_firebug_" + this.getEditorOptionKey() + mode);
        var command = Firebug.chrome.$("cmd_firebug_toggle" + this.getEditorOptionKey());
        command.setAttribute("label", menuitem.label);
        command.setAttribute("tooltiptext", menuitem.tooltipText);
    },

    onOptionsShowing: function(popup)
    {
        var mode = this.getCurrentEditorName();
        if (!mode)
            return;

        for (var child = popup.firstChild; child; child = child.nextSibling)
        {
            if (child.localName == "menuitem")
            {
                if (child.id == "menu_firebug_" + this.getEditorOptionKey()+mode)
                    child.setAttribute("checked", true);
                else
                    child.removeAttribute("checked");
            }
        }
    },
};

// ********************************************************************************************* //
// Registration

return Firebug.EditorSelector;

// ********************************************************************************************* //
});
