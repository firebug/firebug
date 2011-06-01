/* See license.txt for terms of usage */

define([
    "firebug/lib/lib",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/firefox/firefox",
],
function(FBL, Obj, Firebug, Firefox) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch2);

var KeyEvent = window.KeyEvent;

// ************************************************************************************************

/**
 * ShortcutsModel object implements keyboard shortcuts logic.
 */
Firebug.ShortcutsModel = Obj.extend(Firebug.Module,
{
    dispatchName: "shortcuts",

    initializeUI: function()
    {
        if (FBTrace.DBG_SHORTCUTS)
            FBTrace.sysout("shortcuts.initializeUI; Shortcuts module initialization.");

        this.initShortcuts();
    },

    initShortcuts : function()
    {
        var branch = prefs.getBranch("extensions.firebug.key.shortcut.");
        var shortcutNames = branch.getChildList("", {});
        shortcutNames.forEach(this.initShortcut);
    },

    initShortcut : function(element, index, array)
    {
        var branch = prefs.getBranch("extensions.firebug.key.");
        var shortcut = branch.getCharPref("shortcut." + element);
        var tokens = shortcut.split(' ');
        var key = tokens.pop();
        var modifiers = tokens.join(',')

        var keyElem = document.getElementById("key_" + element);
        if (!keyElem)
        {
            //if key is not defined in xul, add it
            keyElem = document.createElement('key');
            keyElem.className = "fbOnlyKey";
            keyElem.id = "key_" + element;
            keyElem.command = "cmd_" + element;
            Firefox.getElementById('mainKeyset').appendChild(keyElem);
        }

        //choose between key or keycode attribute
        if (key.length == 1)
        {
            keyElem.setAttribute('modifiers', modifiers);
            keyElem.setAttribute('key', key);
            keyElem.removeAttribute('keycode');
        }
        else if (KeyEvent['DOM_' + key]) //only set valid keycodes
        {
            keyElem.setAttribute('modifiers', modifiers);
            keyElem.setAttribute('keycode', key);
            keyElem.removeAttribute('key'); //in case default shortcut uses key rather than keycode
        }
    },

    // UI Commands
    customizeShortcuts: function()
    {
        var args = {
            FBL: FBL,
            FBTrace: FBTrace
        };

        // Open customize shortcuts dialog. Pass FBL into the XUL window so,
        // common APIs can be used (e.g. localization).
        window.openDialog("chrome://firebug/content/firefox/customizeShortcuts.xul", "",
            "chrome,centerscreen,dialog,modal,resizable=yes", args);
    }
});

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.ShortcutsModel);

return Firebug.ShortcutsModel;

// ************************************************************************************************
});