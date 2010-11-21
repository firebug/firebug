/* See license.txt for terms of usage */
/* Reused code from Keyconfig by Dorando: http://mozilla.dorando.at/keyconfig.xpi*/

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

var prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch).QueryInterface(Ci.nsIPrefService);
var branch = prefs.getBranch("extensions.firebug.key.shortcut.");

// Initialized from window parameters.
var FBL; 
var FBTrace;

// Global variables used by this dialog.
var shortcutNames = null;
var gVKNames = [];
var gLocaleKeys = [];
var gPlatformKeys = new Object();
var updatedShortcuts = {}
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

// ************************************************************************************************
// Implemantation

function init()
{
    var args = window.arguments[0];
    FBL = args.FBL;
    FBTrace = args.FBTrace;

    setKeyInfo();
    shortcutNames = branch.getChildList("", {});
    shortcutNames.sort();
    shortcutNames.forEach(addShortcutRow);
    setHandlers();
    document.title = FBL.$STR('customizeShortcuts');

    if (FBTrace.DBG_SHORTCUTS)
        FBTrace.sysout("shortcuts.init; Customize Shortcuts dialog initialized.");
}

function setKeyInfo()
{
    gLocaleKeys = document.getElementById("localeKeys");
    var platformKeys = document.getElementById("platformKeys");
    gPlatformKeys.shift = FBL.$STR("VK_SHIFT", platformKeys);
    gPlatformKeys.meta = FBL.$STR("VK_META", platformKeys);
    gPlatformKeys.alt = FBL.$STR("VK_ALT", platformKeys);
    gPlatformKeys.ctrl = FBL.$STR("VK_CONTROL", platformKeys);
    gPlatformKeys.sep = FBL.$STR("MODIFIER_SEPARATOR", platformKeys);

    switch (prefs.getIntPref("ui.key.accelKey"))
    {
        case 17:
            gPlatformKeys.accel = gPlatformKeys.ctrl;
            break;
        case 18:
            gPlatformKeys.accel = gPlatformKeys.alt;
            break;
        case 224:
            gPlatformKeys.accel = gPlatformKeys.meta;
            break;
        default:
            gPlatformKeys.accel = (window.navigator.platform.search("Mac") == 0 ? gPlatformKeys.meta : gPlatformKeys.ctrl);
    }

    for ( var property in KeyEvent)
    {
        gVKNames[KeyEvent[property]] = property.replace("DOM_", "");
    }
    gVKNames[8] = "VK_BACK";
}

function setHandlers()
{
    var i;
    var shortcutSinks = document.getElementsByClassName('shortcutSink');
    for (i = 0; i < shortcutSinks.length; i++)
    {
        shortcutSinks[i].addEventListener('keydown', recognizeShortcut, false);
    }
    var resetBtns = document.getElementsByClassName('shortcutResetBtn');
    for (i = 0; i < resetBtns.length; i++)
    {
        resetBtns[i].addEventListener('command', handleResetBtn, false);
    }
}

function saveChanges()
{
    if (!modified)
        return true;

    if (window.confirm(FBL.$STR('keybindConfirmMsg')))
    {
        shortcutNames.forEach(saveShortcut);
        window.opener.Firebug.ShortcutsModel.initShortcuts();
        return true;
    }

    return false;
}

function saveShortcut(shortcutId, index, array)
{
    if (shortcutId in updatedShortcuts)
        branch.setCharPref(shortcutId, updatedShortcuts[shortcutId]);
}

function handleResetBtn(event)
{
    var element = event.target.id.replace('_reset', "");
    if (branch.prefHasUserValue(element))
    {
        branch.clearUserPref(element);
        modified = true;
    }

    var textbox = document.getElementById(element + '_shortcut');
    if (textbox)
        textbox.value = getHumanShortcut(element);
}

function getHumanShortcut(element)
{
    var shortcut = branch.getCharPref(element);
    var tokens = shortcut.split(' ');
    var keyCode = tokens.pop();

    if (keyCode.length == 1)
        return getFormattedKey(tokens.join(','), keyCode, null);
    else 
        return getFormattedKey(tokens.join(','), null, keyCode);
}

function addShortcutRow(element, index, array)
{
    //Get key configuration from preference
    var shortcut = getHumanShortcut(element);
    var rows = document.getElementById("shortcutGridRows");
    var row = document.createElement("row");
    var labelText;

    var label = document.createElement("label");
    // Get the label from firebug.properties
    labelText = FBL.$STR('firebug.shortcut.' + element + ".label");
    if (labelText == "label") // $STR defaults to property name (label) if it's not defined. We don't want that
        labelText = element
    label.setAttribute("value", labelText);
    row.appendChild(label);

    var textbox = document.createElement("textbox");
    textbox.id = element + "_shortcut";
    textbox.className = "shortcutSink";
    textbox.setAttribute('tooltiptext', labelText + " shortcut");
    textbox.setAttribute("value", shortcut);
    row.appendChild(textbox);

    var resetBtn = document.createElement('button');
    resetBtn.id = element + "_reset";
    resetBtn.setAttribute('label', FBL.$STR("a11y.labels.reset"));
    resetBtn.setAttribute('aria-label', FBL.$STRF("a11y.labels.reset_shortcut", [labelText]));
    resetBtn.className = "shortcutResetBtn";
    row.appendChild(resetBtn);
    rows.appendChild(row);
}

function recognizeShortcut(event)
{
    //we're using keydown, so we always start with keycode
    var shortcut = "";
    if ( [9, 16, 17, 18].indexOf(event.keyCode) != -1 ||
        ((!event.shiftKey && !event.altKey && !event.ctrlKey) &&
        [13, 27].indexOf(event.keyCode) != -1))
    {
        //Always let tab pass. Let enter & escape pass, if no modifiers are used
        return;
    }

    modified = true;
    event.preventDefault();
    event.stopPropagation();

    var target = event.target;

    if (event.keyCode == 8 && !event.shiftKey && !event.altKey && !event.ctrlKey) { // Backspace pressed
        updatedShortcuts[target.id.replace('_shortcut', "")] = "";
        event.target.value = "";

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

    //check if the keycode is actually a printable character

    //1. convert some of the punctuation keyConstants (e.g. VK_COMMA) back to actual characters
    if (mustBeKeyChars[keyConstant])
    {
        key = mustBeKeyChars[keyConstant];
    }
    else
    {
        //2. detect basic alphanumeric keys
        var keyNameGuess = keyConstant.replace("VK_", "");
        if (keyNameGuess.length == 1)
            key = keyNameGuess.toLowerCase();
    }

    if (modifiers.length > 0)
    {
        shortcut += modifiers;
        shortcut += " ";
    }
    shortcut += (key ? key : keyConstant);

    updatedShortcuts[target.id.replace('_shortcut', "")] = shortcut;

    //show formatted shortcut in textbox
    modifiers = modifiers.replace(" ",",")
    var formatted = getFormattedKey(modifiers, key, keyConstant);

    target.value = formatted;
    return false;
}

function getFormattedKey(modifiers, key, keyConstant)
{
    if (modifiers == "shift,alt,control,accel" && keyConstant == "VK_SCROLL_LOCK")
        return "";
    if (key == "" || (!key && keyConstant == ""))
        return "";

    var val = "";
    if (modifiers)
        val =
        modifiers.replace(/^[\s,]+|[\s,]+$/g, "").split(/[\s,]+/g).join(gPlatformKeys.sep).replace("alt", gPlatformKeys.alt).replace("shift", gPlatformKeys.shift).replace("control",
        gPlatformKeys.ctrl).replace("meta", gPlatformKeys.meta).replace("accel", gPlatformKeys.accel)
        + gPlatformKeys.sep;

    if (key)
        return val += key;

    if (keyConstant)
    {
        try
        {
            //see if a localized version for keyConstant exists (F keys, arrow, enter, pgup, etc.)
            val += gLocaleKeys.getString(keyConstant);
        }
        catch (e)
        {
            //create human friendly alternative ourself
            val += keyConstant.replace("VK_", "").replace("_", " ").toLowerCase();
        }
    }
    return val;
}
