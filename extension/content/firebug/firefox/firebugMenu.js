/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/chrome/firefox",
    "firebug/lib/css",
    "firebug/lib/array",
],
function(Obj, Firebug, Firefox, Css, Arr) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Module Implementation

Firebug.FirebugMenu = Obj.extend(Firebug.Module,
{
    dispatchName: "firebugMenu",

    initializeUI: function()
    {
        Firebug.Module.initializeUI.apply(this, arguments);

        // Initialize Firebug Icon menu. The content comes from the global space.
        var firebugMenuPopup = Firefox.$("fbFirebugMenuPopup");
        this.initializeMenu(Firebug.chrome.$("fbFirebugMenu"), firebugMenuPopup);
    },

    /**
     * Insert Firebug menu into specified location in the UI. Firebug menu appears
     * at several location depending on Firefox version and/or application (e.g. SeaMonkey)
     */
    initializeMenu: function(parentMenu, popupMenu)
    {
        if (!parentMenu)
            return;

        if (parentMenu.getAttribute("initialized"))
            return;

        parentMenu.appendChild(popupMenu.cloneNode(true));
        parentMenu.setAttribute("initialized", "true");
    },
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.FirebugMenu);

// ********************************************************************************************* //

return Firebug.FirebugMenu;

// ********************************************************************************************* //
});
