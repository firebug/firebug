/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/locale",
    "firebug/lib/css",
    "firebug/lib/options",
    "firebug/lib/promise",
    "firebug/chrome/module",
    "firebug/chrome/menu",
    "firebug/console/autoCompleter",
    "firebug/console/commandLine",
    "firebug/editor/sourceEditor",
],
function(Firebug, FBTrace, Obj, Events, Dom, Locale, Css, Options, Promise, Module, Menu,
    AutoCompleter, CommandLine, SourceEditor) {

"use strict";

// ********************************************************************************************* //
// Constants

var CONTEXT_MENU = SourceEditor.Events.contextMenu;
var TEXT_CHANGED = SourceEditor.Events.textChange;

var prettyPrintWorker = null;

// Tracing
var Trace = FBTrace.to("DBG_COMMANDEDITOR");
var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Command Editor

/**
 * @module This object is responsible for logic related to a command editor (known
 * also as multiline command line). It's based on {@link SourceEditor} that supports
 * JavaScript syntax coloring.
 *
 * This editor is available in the Console panel and can be used to execute JS code.
 * See also: https://getfirebug.com/wiki/index.php?title=Command_Editor
 */
var CommandEditor = Obj.extend(Module,
/** @lends CommandEditor */
{
    dispatchName: "commandEditor",

    editor: null,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Initialization

    initialize: function()
    {
        Module.initialize.apply(this, arguments);

        if (this.editor)
            return;

        this.editor = new SourceEditor();

        var config =
        {
            mode: "javascript",
            lineNumbers: true,
            readOnly: false,
            gutters: []
        };

        // Custom shortcuts for source editor
        config.extraKeys = {
            "Ctrl-Enter": this.onExecute.bind(this),
            "Cmd-Enter": this.onExecute.bind(this),
            "Esc": this.onEscape.bind(this),
            "Ctrl-Space": this.autoComplete.bind(this, true),
            "Tab": this.onTab.bind(this)
        };

        function browserLoaded(event)
        {
            var doc = event.target;
            this.parent = doc.querySelector(".panelNode");

            // Initialize source editor.
            this.editor.init(this.parent, config, this.onEditorLoad.bind(this));

            if (FBTrace.DBG_COMMANDEDITOR)
                FBTrace.sysout("commandEditor: SourceEditor initialized");
        }

        var browser = document.getElementById("fbCommandEditorBrowser");
        Events.addEventListener(browser, "load", browserLoaded.bind(this), true);
    },

    shutdown: function()
    {
        if (!this.editor)
            return;

        this.editor.removeEventListener(CONTEXT_MENU, this.onContextMenu);
        this.editor.removeEventListener(TEXT_CHANGED, this.onTextChanged);

        this.editor.destroy();
        this.editor = null;

        destroyPrettyPrintWorker();
    },

    /**
     * The load event handler for the source editor. This method does post-load
     * editor initialization.
     */
    onEditorLoad: function()
    {
        // xxxHonza: Context menu support is going to change in SourceEditor
        this.editor.addEventListener(CONTEXT_MENU, this.onContextMenu);
        this.editor.addEventListener(TEXT_CHANGED, this.onTextChanged);

        var lastLineNo = this.editor.lastLineNo();
        this.editor.setCursor(lastLineNo, this.editor.getCharCount(lastLineNo));

        Firebug.chrome.applyTextSize(Firebug.textSize);

        if (FBTrace.DBG_COMMANDEDITOR)
            FBTrace.sysout("commandEditor.onEditorLoad; SourceEditor loaded");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Keyboard shortcuts

    onExecute: function()
    {
        var context = Firebug.currentContext;
        CommandLine.update(context);
        CommandLine.enter(context);
        return true;
    },

    onEscape: function()
    {
        var context = Firebug.currentContext;
        CommandLine.update(context);
        CommandLine.cancel(context);
        return true;
    },

    autoComplete: function(allowGlobal)
    {
        var context = Firebug.currentContext;
        var out = {};
        var hintFunction = AutoCompleter.codeMirrorAutoComplete
            .bind(null, context, allowGlobal, out);
        this.editor.autoComplete(hintFunction);
        return out.attemptedCompletion;
    },

    onTab: function()
    {
        if (!this.editor.hasSelection() && this.autoComplete(false))
            return;
        this.editor.tab();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Other Events

    onTextChanged: function(event)
    {
        // Ignore changes that are triggered by Firebug's restore logic.
        if (CommandEditor.ignoreChanges)
            return;

        var context = Firebug.currentContext;
        CommandLine.update(context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Context Menu

    onContextMenu: function(event)
    {
        Events.cancelEvent(event);

        var popup = document.getElementById("fbCommandEditorPopup");
        Dom.eraseNode(popup);

        var items = CommandEditor.editor.getContextMenuItems();
        Menu.createMenuItems(popup, items);

        if (!popup.childNodes.length)
            return;

        popup.openPopupAtScreen(event.screenX, event.screenY, true);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public API

    setText: function(text)
    {
        try
        {
            // When manually setting the text, ignore the TEXT_CHANGED event.
            this.ignoreChanges = true;

            if (this.editor)
                this.editor.setText(text, "js");
        }
        catch (err)
        {
            // No exception is really expected, we just need the finally clause.
        }
        finally
        {
            this.ignoreChanges = false;
        }
    },

    getText: function()
    {
        if (this.editor)
            return this.editor.getText();
    },

    setSelectionRange: function(start, end)
    {
        if (this.editor)
            this.editor.setSelection(start, end);
    },

    getSelection: function()
    {
        if (this.editor)
            return this.editor.getSelection();
    },

    select: function()
    {
        // TODO xxxHonza
    },

    // returns the applicable commands
    getExpression: function()
    {
        if (this.editor)
        {
            if (this.isCollapsed())
                return this.getText();
            else
                return this.editor.getSelectedText();
        }
    },

    isCollapsed: function()
    {
        var selection;
        if (this.editor)
        {
            selection = this.editor.getSelection(); 
            return selection.start === selection.end;
        }
        return true;
    },

    hasFocus: function()
    {
        try
        {
            if (this.editor)
                return this.editor.hasFocus();
        }
        catch (e)
        {
        }
    },

    focus: function()
    {
        if (this.editor)
            this.editor.focus();
    },

    blur: function()
    {
        // When bluring, save the selection (see issue 7273).
        if (this.editor)
            this.editor.blur(true);
    },

    fontSizeAdjust: function(adjust)
    {
        if (!this.editor)
            return;

        if (this.editor instanceof SourceEditor)
        {
            // The source editor doesn't have to be initialized at this point.
            if (!this.editor.isInitialized())
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("commandEditor.fontSizeAdjust; ERROR Not initialized yet");
                return;
            }

            var editorViewElement = this.editor.getViewElement();
            editorViewElement.style.fontSizeAdjust = adjust;

            // line-height also needs to be changed along with font adjusting
            // to avoid overlapping lines.
            editorViewElement.style.lineHeight = adjust * 2;
        }
        else
        {
            // support for TextEditor, not used at the moment
            this.editor.textBox.style.fontSizeAdjust = adjust;
        }
    },

    // Method used for the hack of issue 6824 (Randomly get "Unresponsive Script Warning" with 
    // commandEditor.html). Adds or removes the .CommandEditor-Hidden class.
    // IMPORTANT: that method should only be used within the Firebug code, and may be removed soon.
    addOrRemoveClassCommandEditorHidden: function(addClass)
    {
        if (this.editor)
            this.editor.addOrRemoveClassCommandEditorHidden(addClass);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Pretty Print

    prettyPrint: function(context)
    {
        var worker = getPrettyPrintWorker();
        var id = "firebug-" + Obj.getUniqueId();
        var deferred = Promise.defer();

        var onReply = ({data}) =>
        {
            if (data.id !== id)
                return;

            worker.removeEventListener("message", onReply, false);

            if (data.error)
            {
                TraceError.sysout("commandEditor.prettyPrint; ERROR " + data.error, data);

                Firebug.Console.logFormatted([data.error], context, "error", true);

                deferred.reject(data.error);
            }
            else
            {
                this.setText(data.code);

                deferred.resolve(data.code);
            }
        };

        worker.addEventListener("message", onReply, false);

        worker.postMessage({
            id: id,
            url: "(command-editor)",
            indent: Options.get("replaceTabs"),
            source: this.getText()
        });

        return deferred.promise;
    }
});

// ********************************************************************************************* //
// Getters/setters

Object.defineProperty(CommandEditor, "value", {
    get: function()
    {
        return this.getText();
    },
    set: function(val)
    {
        this.setText(val);
    }
});

// ********************************************************************************************* //
// Text Editor

/**
 * A text editor based on a simple <textbox> element. Not currently used.
 * TODO get rid of this if CodeMirror works well enough.
 */
function TextEditor() {}
TextEditor.prototype =
{
    init: function(editorElement, config, callback)
    {
        var commandEditorBox = editorElement.parentNode;

        this.textBox = commandEditorBox.ownerDocument.createElement("textbox");
        this.textBox.setAttribute("id", "fbCommandEditor");
        this.textBox.setAttribute("multiline", "true");
        this.textBox.setAttribute("flex", "1");
        this.textBox.setAttribute("newlines", "pasteintact");
        this.textBox.setAttribute("label", "CommandEditor");

        commandEditorBox.replaceChild(this.textBox, editorElement);

        // The original source editor is also loaded asynchronously.
        setTimeout(callback);
    },

    destroy: function()
    {
    },

    addEventListener: function(type, callback)
    {
        if (!type)
            return;

        Events.addEventListener(this.textBox, type, callback, true);
    },

    removeEventListener: function(type, callback)
    {
        if (!type)
            return;

        Events.removeEventListener(this.textBox, type, callback, true);
    },

    setCaretOffset: function(offset)
    {
    },

    getCharCount: function()
    {
        return this.textBox.value ? this.textBox.value.length : 0;
    },

    setText: function(text)
    {
        this.textBox.value = text;
    },

    getText: function()
    {
        return this.textBox.value;
    },

    setSelectionRange: function(start, end)
    {
        this.textBox.setSelectionRange(start, end);
    },

    getSelection: function()
    {
        return {
            start: this.textBox.selectionStart,
            end: this.textBox.selectionEnd
        };
    },

    hasFocus: function()
    {
        return this.textBox.getAttribute("focused") == "true";
    },

    focus: function()
    {
        this.textBox.focus();
    },

    getSelectedText: function()
    {
        var start = this.textBox.selectionStart;
        var end = this.textBox.selectionEnd;

        return this.textBox.value.substring(start, end);
    } 
};

// ********************************************************************************************* //
// Local Helpers

/**
 * Get or create the worker that handles pretty printing.
 */
function getPrettyPrintWorker()
{
    if (!prettyPrintWorker)
    {
        prettyPrintWorker = new ChromeWorker(
            "resource://gre/modules/devtools/server/actors/pretty-print-worker.js");

        prettyPrintWorker.addEventListener("error", ({message, fileName, lineNo}) =>
        {
            TraceError.sysout("commandEditor.getPrettyPrintWorker; ERROR " + message +
                " " + fileName + ":" + lineNo);
        }, false);
    }

    return prettyPrintWorker;
}

function destroyPrettyPrintWorker()
{
    if (prettyPrintWorker)
    {
        prettyPrintWorker.terminate();
        prettyPrintWorker = null;
    }
}

// ********************************************************************************************* //
// Registration

Firebug.registerModule(CommandEditor);

// xxxHonza: backward compatibility, should be removed
Firebug.CommandEditor = CommandEditor;

return CommandEditor;

// ********************************************************************************************* //
});
