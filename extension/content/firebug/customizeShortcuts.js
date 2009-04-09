/* See license.txt for terms of usage */
/* Reused code from Keyconfig by Dorando: http://mozilla.dorando.at/keyconfig.xpi*/
var shortcutNames = null;

var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch).QueryInterface(Components.interfaces.nsIPrefService);
var branch = prefs.getBranch("extensions.firebug.key.shortcut.");
var fbStrings = null;
var gVKNames = [];
var gLocaleKeys = [];
var gPlatformKeys = new Object();
var updatedShortcuts = {}
var modified = false;

function init()
{
    
    setKeyInfo();
    shortcutNames = branch.getChildList("", {});
    shortcutNames.sort();
    shortcutNames.forEach(addShortcutRow);
    setHandlers();
    document.title = $STR('customizeShortcuts', fbStrings)
}

function setKeyInfo()
{
    fbStrings = document.getElementById("fbStrings");
    
    gLocaleKeys = document.getElementById("localeKeys");
    var platformKeys = document.getElementById("platformKeys");
    gPlatformKeys.shift = $STR("VK_SHIFT", platformKeys);
    gPlatformKeys.meta = $STR("VK_META", platformKeys);
    gPlatformKeys.alt = $STR("VK_ALT", platformKeys);
    gPlatformKeys.ctrl = $STR("VK_CONTROL", platformKeys);
    gPlatformKeys.sep = $STR("MODIFIER_SEPARATOR", platformKeys);
    
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
    if (window.confirm($STR('keybindConfirmMsg', fbStrings)))
    {
        shortcutNames.forEach(saveShortcut);
        window.opener.Firebug.shortcutsModel.initShortcuts();
        return true;
    }
    return false;
}

function saveShortcut(shortcutId, index, array)
{
    if (updatedShortcuts[shortcutId])
    {
        branch.setCharPref(shortcutId, updatedShortcuts[shortcutId]);
    }
}

function handleResetBtn(event)
{
    var element = event.target.id.replace('_reset', "");
    if (branch.prefHasUserValue(element))
    {
        branch.clearUserPref(element);
        modified = true;
    }
    var textbox = document.getElementById(element + '_shortcut')
    if (textbox)
        textbox.value = getHumanShortcut(element);
}

function getHumanShortcut(element)
{
    var shortcut = branch.getCharPref(element);
    var tokens = shortcut.split('+');
    var keyCode = tokens.pop();
    return getFormattedKey(tokens.join('+'), null, keyCode);
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
    try
    {
        labelText = $STR('firebug.shortcut.' + element + ".label", fbStrings);
    }
    catch (e)
    {
        labelText = element;
    }
    label.setAttribute("value", labelText);
    row.appendChild(label);
    
    var textbox = document.createElement("textbox");
    textbox.id = element + "_shortcut";
    textbox.className = "shortcutSink";
    textbox.setAttribute('tooltiptext', labelText + " shortcut");
    textbox.setAttribute("value", shortcut);
    row.appendChild(textbox);
    
    var resetBtn = document.createElement('button');
    resetBtn.id = element + "_reset"
    resetBtn.setAttribute('label', "reset");
    resetBtn.setAttribute('aria-label', "reset " + labelText + ' shortcut');
    resetBtn.className = "shortcutResetBtn"
    row.appendChild(resetBtn);
    
    rows.appendChild(row);
}

function recognizeShortcut(event)
{
    //we're using keydown so that we can always work with keycode
    var shortcut = "";
    if ( [9, 16, 17, 18].indexOf(event.keyCode) != -1 || 
        ((!event.shiftKey && !event.altKey && !event.ctrlKey) && [ 8, 13, 27].indexOf(event.keyCode) != -1))
    {
        //Always let pass tab. Let enter, escape & backspace pass if no modifiers are used
        return;
    }
    modified = true;
    event.preventDefault();
    event.stopPropagation();
    var target = event.target;
    var modifiers = [];
    if (event.altKey)
        modifiers.push("alt");
    if (event.ctrlKey)
        modifiers.push("control");
    if (event.metaKey)
        modifiers.push("meta");
    if (event.shiftKey)
        modifiers.push("shift");
    
    modifiers = modifiers.join("+");
   
    var keycode = null;
    keycode = gVKNames[event.keyCode];
    if (!keycode)
        return;
    target.value = getFormattedKey(modifiers, null, keycode);
    
    if (modifiers.length > 0)
    {
        shortcut += modifiers;
        shortcut += "+";
    }
    
    shortcut += keycode;
    updatedShortcuts[target.id.replace('_shortcut', "")] = shortcut;
    return false;
}

function getFormattedKey(modifiers, key, keycode)
{
    if (modifiers == "shift,alt,control,accel" && keycode == "VK_SCROLL_LOCK")
        return "";
    if (key == "" || (!key && keycode == ""))
        return "";
    
    var val = "";
    if (modifiers)
        val =
        modifiers.replace(/^[\s,]+|[\s,]+$/g, "").split(/[\s,]+/g).join(gPlatformKeys.sep).replace("alt", gPlatformKeys.alt).replace("shift", gPlatformKeys.shift).replace("control",
        gPlatformKeys.ctrl).replace("meta", gPlatformKeys.meta).replace("accel", gPlatformKeys.accel)
        + gPlatformKeys.sep;
    if (key)
        val += key;
    if (keycode)
        try
        {
            val += gLocaleKeys.getString(keycode);
        }
        catch (e)
        {
            var keyNameGuess = keycode.replace("VK_", "").replace("_", " ").toLowerCase();
            
            val += keyNameGuess.replace(/\b([a-z])/g, function($0)
            {
                return $0.toUpperCase()
            });
        }
    return val;
}

function $STR(name, bundle)
{
    var str = ""
    try 
    {
        str = bundle.getString(name);
    }
    catch(e)
    {
        str = name;
    }
    return str;
}