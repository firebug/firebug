/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/firefox/firefox",
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

        FBTrace.sysout("firebugMenu.initializeUI");

        // Put Firebug version on all "About" menu items. This men item appears in
        // Firefox Tools menu (Firefox UI) as well as Firebug Icon menu (Firebug UI)
        this.updateAboutMenu(document);
        this.updateAboutMenu(top.document);

        // Initialize Firebug Tools, Web Developer and Firebug Icon menus.
        var firebugMenuPopup = Firebug.chrome.$("fbFirebugMenuPopup");

        // If 'Web Developer' menu is available (introduced in Firefox 6)
        // Remove the old entry in Tools menu.
        if (Firefox.getElementById("menu_webDeveloper_firebug"))
        {
            var menuFirebug = Firefox.getElementById("menu_firebug");
            if (menuFirebug)
                menuFirebug.parentNode.removeChild(menuFirebug);
        }

        // Initialize content of Firebug menu at various places.
        this.initializeMenu(Firefox.getElementById("menu_webDeveloper_firebug"), firebugMenuPopup);
        this.initializeMenu(Firefox.getElementById("menu_firebug"), firebugMenuPopup);
        this.initializeMenu(Firefox.getElementById("appmenu_firebug"), firebugMenuPopup);
        this.initializeMenu(Firebug.chrome.$("fbFirebugMenu"), firebugMenuPopup);
    },

    /**
     * Append version info to all "About" menu items.
     * @param {Object} doc The scope document where to look for XUL menu elements.
     */
    updateAboutMenu: function(doc)
    {
        var version = Firebug.getVersion();
        if (version)
        {
            var nodes = doc.querySelectorAll(".firebugAbout");
            nodes = Arr.cloneArray(nodes);
            for (var i=0; i<nodes.length; i++)
            {
                var node = nodes[i];
                var aboutLabel = node.getAttribute("label");
                node.setAttribute("label", aboutLabel + " " + version);
                Css.removeClass(node, "firebugAbout");
            }
        }
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
});
