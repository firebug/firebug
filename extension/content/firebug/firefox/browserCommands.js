/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/options",
    "firebug/lib/locale",
    "firebug/firefox/browserOverlayLib",
],
function(FBTrace, Options, Locale, BrowserOverlayLib) {
with (BrowserOverlayLib) {

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

        this.removeInspectorShortcutAsync(doc);
    },

    shutdown: function(doc)
    {
        this.restoreInspectorShortcut(doc);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    overlayCommands: function(doc)
    {
        $command(doc, "cmd_firebug_closeFirebug", "Firebug.closeFirebug(true);");
        $command(doc, "cmd_firebug_toggleInspecting", "if (!Firebug.currentContext) Firebug.toggleBar(true); Firebug.Inspector.toggleInspecting(Firebug.currentContext);");
        $command(doc, "cmd_firebug_focusCommandLine", "if (!Firebug.currentContext) Firebug.toggleBar(true); Firebug.CommandLine.focus(Firebug.currentContext);");
        $command(doc, "cmd_firebug_toggleFirebug", "Firebug.toggleBar();");
        $command(doc, "cmd_firebug_detachFirebug", "Firebug.toggleDetachBar(false, true);");
        $command(doc, "cmd_firebug_inspect", "Firebug.Inspector.inspectFromContextMenu(arg);", "document.popupNode");
        $command(doc, "cmd_firebug_toggleBreakOn", "if (Firebug.currentContext) Firebug.chrome.breakOnNext(Firebug.currentContext, event);");
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
        var keyset = $(doc, "mainKeyset");

        for (var i=0; i<shortcuts.length ; i++)
        {
            var id = shortcuts[i];
            var shortcut = Options.get("key.shortcut." + id);
            var tokens = shortcut.split(" ");
            var key = tokens.pop();

            var keyProps = {
                id: "key_firebug_" + id,
                modifiers: tokens.join(","),
                command: "cmd_firebug_" + id,
                position: 1
            };

            if (key.length <= 1)
                keyProps.key = key;
            else if (doc.defaultView.KeyEvent["DOM_"+key])
                keyProps.keycode = key;

            $el(doc, "key", keyProps, keyset);
        }

        keyset.parentNode.insertBefore(keyset, keyset.nextSibling);
    },

    /**
     * Remove the default Inspector shortcut (Ctrl+Shift+C), Firebug's one is used instead.
     */
    removeInspectorShortcutAsync: function(doc)
    {
        // Don't remove the devtools inspector shortcut if default
        // devtools settings should be used.
        var defaultSettings = Options.get("defaultDevToolsSetting");
        if (defaultSettings)
            return;

        // Don't remove the devtools inspector shortcut if Firebug's one is customized
        // and, so different.
        var inspectorShortcut = Options.get("key.shortcut.toggleInspecting");
        var inspectorShortcutDefault = Options.getDefault("key.shortcut.toggleInspecting");
        if (inspectorShortcut != inspectorShortcutDefault)
            return;

        if (this.removeInspectorShortcut(doc))
            return;

        // The shortcut is lazy loaded, so we need a timeout loop. Not nice, but it works.
        var self = this;
        doc.defaultView.setTimeout(function()
        {
            self.removeInspectorShortcutAsync(doc);
        }, 100);
    },

    removeInspectorShortcut: function(doc)
    {
        this.keyInspector = doc.getElementById("key_inspector");
        if (!this.keyInspector)
            return;

        this.keyInspector.setAttribute("disabled", "true");

        return this.keyInspector;
    },

    restoreInspectorShortcut: function(doc)
    {
        if (!this.keyInspector)
            return;

        this.keyInspector.removeAttribute("disabled");
    }
};

// ********************************************************************************************* //
// Registration

return BrowserCommands;

// ********************************************************************************************* //
}});
