/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
    "fbtrace/lib/dom",
    "fbtrace/lib/object",
    "fbtrace/lib/window",
    "fbtrace/lib/menu",
    "fbtrace/lib/system",
],
function(FBTrace, Dom, Obj, Win, Menu, System) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

var sourceEditorScope = System.importModule([
    "resource://fbtrace/orion/source-editor.jsm",
    "resource:///modules/source-editor.jsm",
    "resource:///modules/devtools/sourceeditor/source-editor.jsm"]);

Cu["import"]("resource://fbtrace/storageService.js");

// ********************************************************************************************* //
// Command Line Implementation

var TraceCommandLine =
{
    currentWindow: null,

    onLoad: function(event)
    {
        if (this.editor)
            return;

        this.editor = new sourceEditorScope.SourceEditor();

        // Load previous command line content.
        var commandLineIntro = this.loadContent();

        var config = {
            mode: sourceEditorScope.SourceEditor.MODES.JAVASCRIPT,
            showLineNumbers: true,
            initialText: commandLineIntro,
        };

        var editorPlaceholder = document.getElementById("fbTrace-editor");

        // Remove simple textbox used for Firefox version < 8.
        var scriptBox = document.getElementById("fbTraceScriptBox");
        editorPlaceholder.removeChild(scriptBox);

        // Initialize Orion editor.
        this.editor.init(editorPlaceholder, config, this.onEditorLoad.bind(this));
    },

    onEditorLoad: function()
    {
        //this.editor.addEventListener(SourceEditor.EVENTS.CONTEXT_MENU, this.onContextMenu);
        this.editor.setCaretOffset(this.editor.getCharCount());
    },

    onUnload: function()
    {
        if (this.editor)
        {
            // Store command line content
            this.storeContent(this.editor.getText());

            this.editor.destroy();
            this.editor = null;
        }
    },

    toggleCommandLine: function()
    {
        var splitter = document.getElementById("fbTraceSplitter");
        var commandLine = document.getElementById("fbTraceCommandLine");

        // Toggle visibility of the command line.
        var shouldShow = Dom.isCollapsed(splitter);
        Dom.collapse(splitter, !shouldShow);
        Dom.collapse(commandLine, !shouldShow);

        if (shouldShow && this.editor)
            this.editor.focus();

        // Update menu item.
        var showCommandLine = document.getElementById("showCommandLine");
        showCommandLine.setAttribute("checked", shouldShow);

        // Select the first browser window by default.
        if (!this.currentWindow)
        {
            var self = this;
            Win.iterateBrowserWindows("navigator:browser", function(win)
            {
                return self.currentWindow = win;
            });
        }

        this.updateLabel();
    },

    onContextMenuShowing: function(popup)
    {
        // Collect available browser windows.
        var windows = [];
        Win.iterateBrowserWindows("", function(win)
        {
            windows.push(win);
        });

        // Populate the menu with entries.
        for (var i=0; i<windows.length; ++i)
        {
            var win = windows[i];
            var item = {
                nol10n: true,
                label: win.document.title,
                type: "radio",
                checked: this.currentWindow == win,
                command: Obj.bindFixed(this.selectContext, this, win)
            };
            Menu.createMenuItem(popup, item);
        }
    },

    selectContext: function(win)
    {
        this.currentWindow = win;
    },

    updateLabel: function()
    {
        if (!this.currentWindow)
            return;

        var button = document.getElementById("cmdLineContext");
        button.setAttribute("label", "in:   " + this.currentWindow.document.title + " ");
    },

    onContextMenuHidden: function(popup)
    {
        while (popup.childNodes.length > 0)
            popup.removeChild(popup.lastChild);
    },

    evaluate: function()
    {
        if (!this.currentWindow)
        {
            FBTrace.sysout("ERROR: You need to select target browser window!");
            return;
        }

        try
        {
            var script;
            if (this.editor)
            {
                script = this.editor.getText();
            }
            else
            {
                var scriptBox = document.getElementById("fbTraceScriptBox");
                script = scriptBox.value;
            }

            var result = this.currentWindow.eval(script);
            FBTrace.sysout(result, result);
        }
        catch (exc)
        {
            FBTrace.sysout("EXCEPTION " + exc, exc);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Persistence

    loadContent: function()
    {
        var file = this.getStorageFile();
        if (file.exists())
        {
            var text = TextService.readText(file, text);
            if (text)
                return text;
        }

        return commandLineIntro;
    },

    storeContent: function(text)
    {
        var file = this.getStorageFile();
        if (!file.exists())
            file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);

        TextService.writeText(file, text);
    },

    getStorageFile: function()
    {
        var dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
        var file = dirService.get("ProfD", Ci.nsIFile);
        file.append("firebug");
        file.append("fbtrace");
        file.append("commandLine.txt");
        return file;
    }
};

// ********************************************************************************************* //

var commandLineIntro =
"/*\n" +
" * This is a FBTrace Command Line.\n" +
" * Enter some JavaScript, then:\n" +
" * 1. Select target window scope.\n" +
" * 2. Press Evaluate in the toolbar to evaluate the script (or Ctrl+Enter).\n" +
" */\n" +
"\n";

// ********************************************************************************************* //
// Registration

addEventListener("load", TraceCommandLine.onLoad.bind(TraceCommandLine), false);
addEventListener("unload", TraceCommandLine.onUnload.bind(TraceCommandLine), false);

return TraceCommandLine;

// ********************************************************************************************* //
});
