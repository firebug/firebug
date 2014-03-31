/* See license.txt for terms of usage */

define([
    "firebug/lib/options",
    "firebug/firefox/browserOverlayLib",
],
function(Options, BrowserOverlayLib) {

// ********************************************************************************************* //
// Constants

var shortcuts = [
    "toggleFirebug",
    "toggleInspecting",
    "focusCommandLine",
    "detachFirebug",
    "closeFirebug",
    "toggleBreakOn"
];

var {$, $el, $command} = BrowserOverlayLib;

/* Used by the browser menu, but should be really global shortcuts?
key_increaseTextSize
key_decreaseTextSize
key_normalTextSize
key_help
key_toggleProfiling
key_focusFirebugSearch
key_customizeFBKeys
*/

// ********************************************************************************************* //
// BrowserCommands Implementation

var BrowserCommands =
{
    overlay: function(doc)
    {
        this.overlayCommands(doc);
        this.overlayShortcuts(doc);
    },

    overlayCommands: function(doc)
    {
        $command(doc, "cmd_firebug_closeFirebug", "Firebug.closeFirebug(true);");
        $command(doc, "cmd_firebug_toggleInspecting", "if (!Firebug.currentContext) Firebug.toggleBar(true); Firebug.Inspector.toggleInspecting(Firebug.currentContext);");
        $command(doc, "cmd_firebug_focusCommandLine", "if (!Firebug.currentContext) Firebug.toggleBar(true); Firebug.CommandLine.focus(Firebug.currentContext, {select: true});");
        $command(doc, "cmd_firebug_toggleFirebug", "Firebug.toggleBar();");
        $command(doc, "cmd_firebug_detachFirebug", "Firebug.toggleDetachBar(false, true);");
        $command(doc, "cmd_firebug_inspect", "Firebug.Inspector.inspectFromContextMenu(arg);", "document.popupNode");
        $command(doc, "cmd_firebug_toggleBreakOn", "if (Firebug.currentContext) Firebug.BreakOnNext.onToggleBreakOnNext(event);");
        $command(doc, "cmd_firebug_toggleDetachFirebug", "Firebug.toggleDetachBar(false, true);");
        $command(doc, "cmd_firebug_increaseTextSize", "Firebug.Options.changeTextSize(1);");
        $command(doc, "cmd_firebug_decreaseTextSize", "Firebug.Options.changeTextSize(-1);");
        $command(doc, "cmd_firebug_normalTextSize", "Firebug.Options.setTextSize(0);");
        $command(doc, "cmd_firebug_focusFirebugSearch", "if (Firebug.currentContext) Firebug.Search.onSearchCommand(document);");
        $command(doc, "cmd_firebug_customizeFBKeys", "Firebug.ShortcutsModel.customizeShortcuts();");
        $command(doc, "cmd_firebug_enablePanels", "Firebug.PanelActivation.enableAllPanels();");
        $command(doc, "cmd_firebug_disablePanels", "Firebug.PanelActivation.disableAllPanels();");
        $command(doc, "cmd_firebug_clearActivationList", "Firebug.PanelActivation.clearAnnotations();");
        $command(doc, "cmd_firebug_clearConsole", "Firebug.Console.clear(Firebug.currentContext);");
        $command(doc, "cmd_firebug_allOn", "Firebug.PanelActivation.toggleAll('on');");
        $command(doc, "cmd_firebug_toggleOrient", "Firebug.chrome.toggleOrient();");
        $command(doc, "cmd_firebug_resetAllOptions", "Firebug.resetAllOptions(true);");
        $command(doc, "cmd_firebug_toggleProfiling", ""); //todo
        $command(doc, "cmd_firebug_openInEditor", "Firebug.ExternalEditors.onContextMenuCommand(event)");
    },

    overlayShortcuts: function(doc)
    {
        function getShortcutInfo(shortcut)
        {
            var tokens = shortcut.split(" ");
            var key = tokens.pop();
            var modifiers = tokens.join(",");
            var attr = "";
            if (key.length <= 1)
                attr = "key";
            else if (doc.defaultView.KeyEvent["DOM_"+key])
                attr = "keycode";

            return {attr: attr, key: key, modifiers: modifiers};
        }

        var self = this;
        function disableAllExistingShortcuts()
        {
            Services.obs.removeObserver(this, "devtools-loaded", false);

            for (var i = 0; i < shortcuts.length; i++)
            {
                var id = shortcuts[i];
                var shortcut = Options.get("key.shortcut." + id);
                var {attr, key, modifiers} = getShortcutInfo(shortcut);

                // Disable existing global shortcuts
                self.disableExistingShortcuts.call(self, doc.documentElement, attr, key,
                    modifiers);
            }
        }

        var win = $(doc, "main-window");
        var keyset = $el(doc, "keyset", {id: "firebugKeyset"}, win);

        for (var i = 0; i < shortcuts.length; i++)
        {
            var id = shortcuts[i];
            var shortcut = Options.get("key.shortcut." + id);
            var {attr, key, modifiers} = getShortcutInfo(shortcut);

            var keyProps = {
                id: "key_firebug_" + id,
                modifiers: modifiers,
                command: "cmd_firebug_" + id,
                position: 1
            };
            keyProps[attr] = key;

            $el(doc, "key", keyProps, keyset);

            // Disable existing global shortcuts
            this.disableExistingShortcuts(doc, attr, key, modifiers);
        }

        Services.obs.addObserver(disableAllExistingShortcuts, "devtools-loaded", false);
        keyset.parentNode.insertBefore(keyset, keyset.nextSibling);
    },

    disableExistingShortcuts: function(root, attr, key, modifiers)
    {
        var selector = ":-moz-any(key[" + attr + "='" + key + "'], key[" + attr + "='" +
            key.toUpperCase() + "'])" + (modifiers ? "[modifiers='" + modifiers + "']" : "") +
            ":not([id*='firebug']):not([disabled='true'])";
        var win = root.defaultView || root.ownerDocument.defaultView;

        if (!win.disabledKeyElements)
            win.disabledKeyElements = [];

        var existingKeyElements = root.querySelectorAll(selector);
        for (var i = existingKeyElements.length - 1; i >= 0; i--)
        {
            if (win.disabledKeyElements.indexOf(existingKeyElements[i]) === -1)
            {
                existingKeyElements[i].setAttribute("disabled", "true");
                win.disabledKeyElements.push(existingKeyElements[i]);
            }
        }
    },

    resetDisabledKeys: function(win)
    {
        if (win.disabledKeyElements)
        {
            for (var element of win.disabledKeyElements)
                element.removeAttribute("disabled");
        }

        delete win.disabledKeyElements;
    }
};

// ********************************************************************************************* //
// Registration

return BrowserCommands;

// ********************************************************************************************* //
});
