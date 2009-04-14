/* See license.txt for terms of usage */
FBL.ns( function()
{
    with (FBL)
    {
        Firebug.ShortcutsModel = extend(Firebug.Module, {

            dispatchName: "shortcuts",

            initializeUI: function()
            {
                this.initShortcuts();
            },

            initShortcuts : function() {
                var branch = prefs.getBranch("extensions.firebug.key.shortcut.");
                var shortcutNames = branch.getChildList("", {});
                shortcutNames.forEach(this.initShortcut);
            },

            initShortcut : function(element, index, array) {
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
                    $('mainKeyset').appendChild(keyElem);
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
            }
        });
        Firebug.registerModule(Firebug.ShortcutsModel);
    }
});