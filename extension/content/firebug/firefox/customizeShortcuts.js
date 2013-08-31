/* See license.txt for terms of usage */
/* Reused code from Keyconfig by Dorando: http://mozilla.dorando.at/keyconfig.xpi*/

define([
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/locale",
    "firebug/lib/string",
    "firebug/lib/events",
],
function(FBTrace, Obj, Locale, Str, Events) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

var branch = Services.prefs.getBranch("extensions.firebug.key.shortcut.");
var defaultBranch = Services.prefs.getDefaultBranch("extensions.firebug.key.shortcut.");

// Global variables used by this dialog.
var shortcutNames = null;
var gVKNames = [];
var gPlatformKeys = new Object();
var updatedShortcuts = {};
var modified = false;

var mustBeKeyChars = {
    VK_SEMICOLON      : ";",
    VK_EQUALS         : "=",
    VK_MULTIPLY       : "*",
    VK_ADD            : "+",
    VK_SUBTRACT       : "-",
    VK_DECIMAL        : ".",
    VK_DIVIDE         : "/",
    VK_COMMA          : ",",
    VK_PERIOD         : ".",
    VK_SLASH          : "/",
    VK_BACK_QUOTE     : "`",
    VK_OPEN_BRACKET   : "[",
    VK_BACK_SLASH     : "\\",
    VK_CLOSE_BRACKET  : "]",
    VK_QUOTE          : "'"
};

// ********************************************************************************************* //
// CustomizeShortcuts Dialog Implementation

function CustomizeShortcuts()
{
}

CustomizeShortcuts.prototype =
{
    initialize: function(win)
    {
        if (FBTrace.DBG_SHORTCUTS)
            FBTrace.sysout("shortcuts.init; Customize Shortcuts dialog initialized.", win);

        this.win = win;

        this.setKeyInfo();

        shortcutNames = branch.getChildList("", {});
        shortcutNames.sort();
        shortcutNames.forEach(this.addShortcutRow.bind(this));

        this.setHandlers();

        this.win.document.title = Locale.$STR("customizeShortcuts");
    },

    setKeyInfo: function()
    {
        gPlatformKeys.shift = Locale.$STR("VK_SHIFT");
        gPlatformKeys.meta = Locale.$STR("VK_META");
        gPlatformKeys.alt = Locale.$STR("VK_ALT");
        gPlatformKeys.ctrl = Locale.$STR("VK_CONTROL");
        gPlatformKeys.sep = Locale.$STR("MODIFIER_SEPARATOR");

        switch (Services.prefs.getIntPref("ui.key.accelKey"))
        {
            case KeyEvent.DOM_VK_CONTROL:
                gPlatformKeys.accel = gPlatformKeys.ctrl;
                break;
            case KeyEvent.DOM_VK_ALT:
                gPlatformKeys.accel = gPlatformKeys.alt;
                break;
            case KeyEvent.DOM_VK_META:
                gPlatformKeys.accel = gPlatformKeys.meta;
                break;
            default:
                gPlatformKeys.accel = (this.win.navigator.platform.search("Mac") == 0 ?
                    gPlatformKeys.meta : gPlatformKeys.ctrl);
        }

        for (var property in KeyEvent)
            gVKNames[KeyEvent[property]] = property.replace("DOM_", "");

        gVKNames[8] = "VK_BACK";
    },

    setHandlers: function()
    {
        var shortcutSinks = this.win.document.getElementsByClassName("shortcutSink");
        for (var i=0; i<shortcutSinks.length; i++)
            shortcutSinks[i].addEventListener("keydown", this.recognizeShortcut.bind(this), false);

        var resetBtns = this.win.document.getElementsByClassName("shortcutResetBtn");
        for (var i=0; i<resetBtns.length; i++)
            resetBtns[i].addEventListener("command", this.handleResetBtn.bind(this), false);
    },

    saveChanges: function()
    {
        if (!modified)
            return true;

        shortcutNames.forEach(this.saveShortcut.bind(this));

        var e = Services.wm.getEnumerator("navigator:browser");
        while (e.hasMoreElements())
        {
            var fbug = e.getNext().Firebug;
            fbug && fbug.ShortcutsModel.initShortcuts();
        }
        return true;
    },

    saveShortcut: function(shortcutId, index, array)
    {
        if (shortcutId in updatedShortcuts)
            branch.setCharPref(shortcutId, updatedShortcuts[shortcutId]);
    },

    handleResetBtn: function(event)
    {
        var element = event.target.id.replace("_reset", "");
        if (branch.prefHasUserValue(element))
        {
            branch.clearUserPref(element);
            modified = true;
        }

        event.target.hidden = true;
        var textbox = this.win.document.getElementById(element + "_shortcut");
        if (textbox)
            textbox.value = this.getHumanShortcut(element);
    },

    getHumanShortcut: function(element, getDefault)
    {
        var shortcut = (getDefault ? defaultBranch : branch).getCharPref(element);
        var tokens = shortcut.split(" ");
        var keyCode = tokens.pop();

        if (keyCode.length == 1)
            return this.getFormattedKey(tokens.join(","), keyCode, null);
        else
            return this.getFormattedKey(tokens.join(","), null, keyCode);
    },

    addShortcutRow: function(element, index, array)
    {
        // Get key configuration from preference
        var shortcut = this.getHumanShortcut(element);
        var defaultShortcut = this.getHumanShortcut(element, true);
        var rows = this.win.document.getElementById("shortcutGridRows");
        var row = this.win.document.createElement("row");

        var label = this.win.document.createElement("label");

        // Get the label from firebug.properties
        var labelText = Locale.$STR("firebug.shortcut."+element+".label");
        var tooltipText = Locale.$STR("firebug.shortcut.tip."+element);

        // $STR defaults to property name (label) if it's not defined. We don't want that
        if (labelText == "label")
            labelText = element;

        label.setAttribute("value", labelText);
        row.appendChild(label);

        var textbox = this.win.document.createElement("textbox");
        textbox.id = element + "_shortcut";
        textbox.className = "shortcutSink";
        row.setAttribute("tooltiptext", tooltipText != "tip" ? tooltipText : "");
        textbox.setAttribute("value", shortcut);
        textbox.setAttribute("default_value", defaultShortcut);
        row.appendChild(textbox);

        var resetBtn = this.win.document.createElement("toolbarbutton");
        resetBtn.id = element + "_reset";
        resetBtn.setAttribute("label", Locale.$STR("a11y.labels.reset"));
        resetBtn.setAttribute("aria-label", Locale.$STRF("a11y.labels.reset_shortcut", [labelText]));
        resetBtn.className = "shortcutResetBtn";
        resetBtn.hidden = defaultShortcut == shortcut;
        row.appendChild(resetBtn);
        rows.appendChild(row);
    },

    recognizeShortcut: function(event)
    {
        // We're using keydown, so we always start with keycode
        var shortcut = "";
        if ([KeyEvent.DOM_VK_TAB, KeyEvent.DOM_VK_SHIFT, KeyEvent.DOM_VK_CONTROL, KeyEvent.DOM_VK_ALT].
                indexOf(event.keyCode) != -1 ||
            ((!event.shiftKey && !event.altKey && !event.ctrlKey) &&
            [KeyEvent.DOM_VK_RETURN, KeyEvent.DOM_VK_ESCAPE].indexOf(event.keyCode) != -1))
        {
            // Always let tab pass. Let enter & escape pass, if no modifiers are used
            return;
        }

        modified = true;

        Events.cancelEvent(event);

        var target = event.target;

        // Backspace pressed
        if (event.keyCode == 8 && !event.shiftKey && !event.altKey && !event.ctrlKey)
        {
            updatedShortcuts[target.id.replace("_shortcut", "")] = "";
            target.value = "";

            // Update reset button visibility
            target.nextSibling.hidden = false;

            return false;
        }

        var modifiers = [];
        if (event.altKey)
            modifiers.push("alt");
        if (event.ctrlKey)
            modifiers.push("control");
        if (event.metaKey)
            modifiers.push("meta");
        if (event.shiftKey)
            modifiers.push("shift");

        modifiers = modifiers.join(" ");
        var keyConstant = key = null;

        keyConstant = gVKNames[event.keyCode];

        if (!keyConstant) //should not happen
            return;

        // Check if the keycode is actually a printable character
        // 1. Convert some of the punctuation keyConstants (e.g. VK_COMMA) back to actual characters
        if (mustBeKeyChars[keyConstant])
        {
            key = mustBeKeyChars[keyConstant];
        }
        else
        {
            // 2. Detect basic alphanumeric keys
            var keyNameGuess = keyConstant.replace("VK_", "");
            if (keyNameGuess.length == 1)
                key = keyNameGuess.toLowerCase();
        }

        if (modifiers.length > 0)
            shortcut += modifiers+" ";
        shortcut += (key ? key : keyConstant);

        updatedShortcuts[target.id.replace("_shortcut", "")] = shortcut;

        // Show formatted shortcut in textbox
        modifiers = modifiers.replace(" ", ",");
        var formatted = this.getFormattedKey(modifiers, key, keyConstant);

        target.value = formatted;

        // Update reset button visibility
        target.nextSibling.hidden = formatted == target.getAttribute("default_value");
        return false;
    },

    getFormattedKey: function(modifiers, key, keyConstant)
    {
        if ((modifiers == "shift,alt,control,accel" && keyConstant == "VK_SCROLL_LOCK") ||
            (key == "" || (!key && keyConstant == "")))
        {
            return "";
        }

        var val = "";
        if (modifiers)
        {
            val = modifiers.replace(/^[\s,]+|[\s,]+$/g, "").split(/[\s,]+/g).join(gPlatformKeys.sep).
                replace("alt", gPlatformKeys.alt).replace("shift", gPlatformKeys.shift).
                replace("control", gPlatformKeys.ctrl).replace("meta", gPlatformKeys.meta).
                replace("accel", gPlatformKeys.accel) +
                gPlatformKeys.sep;
        }

        if (key)
            return val += key;

        if (keyConstant)
        {
            var localizedKey = Locale.$STR(keyConstant);

            // Create human friendly alternative ourself, if there is no translation
            // for the key constant
            if (Str.hasPrefix(localizedKey, "VK "))
                localizedKey = Str.capitalize(localizedKey.replace("VK ", ""), true);

            val += localizedKey;
        }
        return val;
    }
}

// ********************************************************************************************* //
// Registration

return CustomizeShortcuts;

// ********************************************************************************************* //
});
