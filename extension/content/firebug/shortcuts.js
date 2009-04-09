FBL.ns( function()
{
    with (FBL)
    {      
        Firebug.shortcutsModel = extend(Firebug.Module, { 
            initialize: function()
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
                var tokens = shortcut.split('+');
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
                keyElem.setAttribute('modifiers', modifiers);
                var keyChar = key.replace('VK_', "").toLowerCase();
                //choose between key or keycode attribute
                if (keyChar.length == 1)
                {
                    keyElem.setAttribute('key', keyChar);
                    keyElem.removeAttribute('keycode');
                }
                else
                {
                    keyElem.setAttribute('keycode', key);
                    keyElem.removeAttribute('key'); //in case default shortcut was key rather than keycode
                }
            },
        }); 
        Firebug.registerModule(Firebug.shortcutsModel);
    }
});