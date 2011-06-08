/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/firefox/menu",
    "firebug/trace/debug",
],
function(Obj, Firebug, Domplate, Locale, Events, Css, Dom, Str, Arr, Menu, Debug) {

// ************************************************************************************************
// Constants

const saveTimeout = 400;
const largeChangeAmount = 10;
const smallChangeAmount = 0.1;

// ************************************************************************************************
// Globals

var currentTarget = null;
var currentGroup = null;
var currentPanel = null;
var currentEditor = null;

var defaultEditor = null;

var originalClassName = null;

var originalValue = null;
var defaultValue = null;
var previousValue = null;

var invalidEditor = false;
var ignoreNextInput = false;

// ************************************************************************************************

Firebug.Editor = Obj.extend(Firebug.Module,
{
    supportsStopEvent: true,

    dispatchName: "editor",
    tabCharacter: "    ",

    setSelection: function(selectionData)
    {
        if (currentEditor && currentEditor.setSelection)
            currentEditor.setSelection(selectionData);
    },

    startEditing: function(target, value, editor, selectionData)
    {
        this.stopEditing();

        if (Css.hasClass(target, "insertBefore") || Css.hasClass(target, "insertAfter"))
            return;

        var panel = Firebug.getElementPanel(target);
        if (!panel.editable)
            return;

        if (FBTrace.DBG_EDITOR)
            FBTrace.sysout("editor.startEditing " + value, target);

        defaultValue = target.getAttribute("defaultValue");
        if (value == undefined)
        {
            value = target.textContent;
            if (value == defaultValue)
                value = "";
        }

        originalValue = previousValue = value;

        invalidEditor = false;
        currentTarget = target;
        currentPanel = panel;
        currentGroup = Dom.getAncestorByClass(target, "editGroup");

        currentPanel.editing = true;

        var panelEditor = currentPanel.getEditor(target, value);
        currentEditor = editor ? editor : panelEditor;
        if (!currentEditor)
            currentEditor = getDefaultEditor(currentPanel);

        Css.setClass(panel.panelNode, "editing");
        Css.setClass(target, "editing");
        if (currentGroup)
            Css.setClass(currentGroup, "editing");

        currentEditor.show(target, currentPanel, value, selectionData);
        Events.dispatch(this.fbListeners, "onBeginEditing", [currentPanel, currentEditor, target, value]);
        currentEditor.beginEditing(target, value);
        if (FBTrace.DBG_EDITOR)
            FBTrace.sysout("Editor start panel "+currentPanel.name);
        this.attachListeners(currentEditor, panel.context);
    },

    saveAndClose: function()
    {
        if (!currentTarget)
            return;

        Events.dispatch(currentPanel.fbListeners, 'onInlineEditorClose', [currentPanel, currentTarget, !originalValue]);
        this.stopEditing();
    },

    stopEditing: function(cancel)
    {
        if (!currentTarget)
            return;

        if (FBTrace.DBG_EDITOR)
            FBTrace.sysout("editor.stopEditing cancel:" + cancel+" saveTimeout: "+this.saveTimeout);

        clearTimeout(this.saveTimeout);
        delete this.saveTimeout;

        this.detachListeners(currentEditor, currentPanel.context);

        Css.removeClass(currentPanel.panelNode, "editing");
        Css.removeClass(currentTarget, "editing");
        if (currentGroup)
            Css.removeClass(currentGroup, "editing");

        var value = currentEditor.getValue();
        if (value == defaultValue)
            value = "";

        // Reset the editor's value so it isn't accidentaly reused the next time
        // the editor instance is reused (see also 3280, 3332).
        currentEditor.setValue("");

        var removeGroup = currentEditor.endEditing(currentTarget, value, cancel);

        try
        {
            if (cancel)
            {
                Events.dispatch(currentPanel.fbListeners, 'onInlineEditorClose', [currentPanel, currentTarget, removeGroup && !originalValue]);
                if (value != originalValue)
                    this.saveEditAndNotifyListeners(currentTarget, originalValue, previousValue);

                if (removeGroup && !originalValue && currentGroup)
                    currentGroup.parentNode.removeChild(currentGroup);
            }
            else if (!value)
            {
                this.saveEditAndNotifyListeners(currentTarget, "", previousValue);

                if (removeGroup && currentGroup && currentGroup.parentNode)
                    currentGroup.parentNode.removeChild(currentGroup);
            }
            else
                this.save(value);
        }
        catch (exc)
        {
            Debug.ERROR(exc);
        }

        currentEditor.hide();
        currentPanel.editing = false;

        Events.dispatch(this.fbListeners, "onStopEdit", [currentPanel, currentEditor, currentTarget]);
        if (FBTrace.DBG_EDITOR)
            FBTrace.sysout("Editor stop panel "+currentPanel.name);
        currentTarget = null;
        currentGroup = null;
        currentPanel = null;
        currentEditor = null;
        originalValue = null;
        invalidEditor = false;

        return value;
    },

    cancelEditing: function()
    {
        return this.stopEditing(true);
    },

    update: function(saveNow)
    {
        if (this.saveTimeout)
            clearTimeout(this.saveTimeout);

        invalidEditor = true;

        currentEditor.layout();

        if (saveNow)
            this.save();
        else
        {
            var context = currentPanel.context;
            this.saveTimeout = context.setTimeout(Obj.bindFixed(this.save, this), saveTimeout);
            if (FBTrace.DBG_EDITOR)
                FBTrace.sysout("editor.update saveTimeout: "+this.saveTimeout);
        }
    },

    save: function(value)
    {
        if (!invalidEditor)
            return;

        if (value == undefined)
            value = currentEditor.getValue();
        if (FBTrace.DBG_EDITOR)
            FBTrace.sysout("editor.save saveTimeout: "+this.saveTimeout+" currentPanel: "+(currentPanel?currentPanel.name:"null"));
        try
        {
            this.saveEditAndNotifyListeners(currentTarget, value, previousValue);

            previousValue = value;
            invalidEditor = false;
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("editor.save FAILS "+exc, exc);
        }
    },

    saveEditAndNotifyListeners: function(currentTarget, value, previousValue)
    {
        currentEditor.saveEdit(currentTarget, value, previousValue);
        Events.dispatch(this.fbListeners, "onSaveEdit", [currentPanel, currentEditor, currentTarget, value, previousValue]);
    },

    setEditTarget: function(element)
    {
        if (!element)
        {
            Events.dispatch(currentPanel.fbListeners, 'onInlineEditorClose', [currentPanel, currentTarget, true]);
            this.stopEditing();
        }
        else if (Css.hasClass(element, "insertBefore"))
            this.insertRow(element, "before");
        else if (Css.hasClass(element, "insertAfter"))
            this.insertRow(element, "after");
        else
            this.startEditing(element);
    },

    tabNextEditor: function()
    {
        if (!currentTarget)
            return;

        var value = currentEditor.getValue();
        var nextEditable = currentTarget;
        do
        {
            nextEditable = !value && currentGroup
                ? getNextOutsider(nextEditable, currentGroup)
                : Dom.getNextByClass(nextEditable, "editable");
        }
        while (nextEditable && !nextEditable.offsetHeight);

        this.setEditTarget(nextEditable);
    },

    tabPreviousEditor: function()
    {
        if (!currentTarget)
            return;

        var value = currentEditor.getValue();
        var prevEditable = currentTarget;
        do
        {
            prevEditable = !value && currentGroup
                ? getPreviousOutsider(prevEditable, currentGroup)
                : Dom.getPreviousByClass(prevEditable, "editable");
        }
        while (prevEditable && !prevEditable.offsetHeight);

        this.setEditTarget(prevEditable);
    },

    insertRow: function(relative, insertWhere)
    {
        var group =
            relative || Dom.getAncestorByClass(currentTarget, "editGroup") || currentTarget;
        var value = this.stopEditing();

        currentPanel = Firebug.getElementPanel(group);

        currentEditor = currentPanel.getEditor(group, value);
        if (!currentEditor)
            currentEditor = getDefaultEditor(currentPanel);

        currentGroup = currentEditor.insertNewRow(group, insertWhere);
        if (!currentGroup)
            return;

        var editable = Css.hasClass(currentGroup, "editable")
            ? currentGroup
            : Dom.getNextByClass(currentGroup, "editable");

        if (editable)
            this.setEditTarget(editable);
    },

    insertRowForObject: function(relative)
    {
        var container = Dom.getAncestorByClass(relative, "insertInto");
        if (container)
        {
            relative = Dom.getChildByClass(container, "insertBefore");
            if (relative)
                this.insertRow(relative, "before");
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    attachListeners: function(editor, context)
    {
        var win = currentTarget.ownerDocument.defaultView;
        win.addEventListener("resize", this.onResize, true);
        win.addEventListener("blur", this.onBlur, true);

        var chrome = Firebug.chrome;

        this.listeners = [
            chrome.keyCodeListen("ESCAPE", null, Obj.bind(this.cancelEditing, this)),
        ];

        if (editor.arrowCompletion)
        {
            this.listeners.push(
                chrome.keyCodeListen("UP", null, Obj.bindFixed(editor.completeValue, editor, -1)),
                chrome.keyCodeListen("DOWN", null, Obj.bindFixed(editor.completeValue, editor, 1)),
                chrome.keyCodeListen("UP", Events.isShift, Obj.bindFixed(editor.completeValue, editor, -largeChangeAmount)),
                chrome.keyCodeListen("DOWN", Events.isShift, Obj.bindFixed(editor.completeValue, editor, largeChangeAmount)),
                chrome.keyCodeListen("UP", Events.isControl, Obj.bindFixed(editor.completeValue, editor, -smallChangeAmount)),
                chrome.keyCodeListen("DOWN", Events.isControl, Obj.bindFixed(editor.completeValue, editor, smallChangeAmount))
            );
        }

        if (currentEditor.tabNavigation)
        {
            this.listeners.push(
                chrome.keyCodeListen("RETURN", null, Obj.bind(this.tabNextEditor, this)),
                chrome.keyCodeListen("RETURN", Events.isShift, Obj.bind(this.saveAndClose, this)),
                chrome.keyCodeListen("RETURN", Events.isControl, Obj.bind(this.insertRow, this, null, "after")),
                chrome.keyCodeListen("TAB", null, Obj.bind(this.tabNextEditor, this)),
                chrome.keyCodeListen("TAB", Events.isShift, Obj.bind(this.tabPreviousEditor, this))
            );
        }
        else if (currentEditor.multiLine)
        {
            this.listeners.push(
                chrome.keyCodeListen("TAB", null, insertTab)
            );
        }
        else
        {
            this.listeners.push(
                chrome.keyCodeListen("RETURN", null, Obj.bindFixed(this.stopEditing, this))
            );

            if (currentEditor.tabCompletion)
            {
                this.listeners.push(
                    chrome.keyCodeListen("TAB", null, Obj.bind(editor.completeValue, editor, 1)),
                    chrome.keyCodeListen("TAB", Events.isShift, Obj.bind(editor.completeValue, editor, -1)),
                    chrome.keyCodeListen("UP", null, Obj.bindFixed(editor.completeValue, editor, -1, true)),
                    chrome.keyCodeListen("DOWN", null, Obj.bindFixed(editor.completeValue, editor, 1, true)),
                    chrome.keyCodeListen("UP", Events.isShift, Obj.bindFixed(editor.completeValue, editor, -largeChangeAmount)),
                    chrome.keyCodeListen("DOWN", Events.isShift, Obj.bindFixed(editor.completeValue, editor, largeChangeAmount)),
                    chrome.keyCodeListen("UP", Events.isControl, Obj.bindFixed(editor.completeValue, editor, -smallChangeAmount)),
                    chrome.keyCodeListen("DOWN", Events.isControl, Obj.bindFixed(editor.completeValue, editor, smallChangeAmount))
                );
            }
        }
    },

    detachListeners: function(editor, context)
    {
        if (!this.listeners)
            return;

        var win = currentTarget.ownerDocument.defaultView;
        win.removeEventListener("resize", this.onResize, true);
        win.removeEventListener("blur", this.onBlur, true);
        win.removeEventListener('input', this.onInput, true);

        var chrome = Firebug.chrome;
        if (chrome)
        {
            for (var i = 0; i < this.listeners.length; ++i)
                chrome.keyIgnore(this.listeners[i]);
        }

        delete this.listeners;
    },

    onResize: function(event)
    {
        currentEditor.layout(true);
    },

    onBlur: function(event)
    {
        if (currentEditor.enterOnBlur && Dom.isAncestor(event.target, currentEditor.box))
            this.stopEditing();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initialize: function()
    {
        this.onResize = Obj.bindFixed(this.onResize, this);
        this.onBlur = Obj.bind(this.onBlur, this);

        Firebug.Module.initialize.apply(this, arguments);
    },

    disable: function()
    {
        this.stopEditing();
    },

    showContext: function(browser, context)
    {
        this.stopEditing();
    },

    showPanel: function(browser, panel)
    {
        this.stopEditing();
    }
});

// ************************************************************************************************
// BaseEditor

Firebug.BaseEditor = Obj.extend(Firebug.MeasureBox,
{
    getValue: function()
    {
    },

    setValue: function(value)
    {
    },

    show: function(target, panel, value, textSize)
    {
    },

    hide: function()
    {
    },

    layout: function(forceAll)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Support for context menus within inline editors.

    getContextMenuItems: function(target)
    {
        var items = [];
        items.push({label: "Cut", command: Obj.bind(this.onCommand, this, "cmd_cut")});
        items.push({label: "Copy", command: Obj.bind(this.onCommand, this, "cmd_copy")});
        items.push({label: "Paste", command: Obj.bind(this.onCommand, this, "cmd_paste")});
        return items;
    },

    onCommand: function(command, cmdId)
    {
        var browserWindow = Firebug.chrome.window;

        // Use the right browser window to get the current command controller (issue 4177).
        var controller = browserWindow.document.commandDispatcher.getControllerForCommand(cmdId);
        var enabled = controller.isCommandEnabled(cmdId);
        if (controller && enabled)
            controller.doCommand(cmdId);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Editor Module listeners will get "onBeginEditing" just before this call

    beginEditing: function(target, value)
    {
    },

    // Editor Module listeners will get "onSaveEdit" just after this call
    saveEdit: function(target, value, previousValue)
    {
    },

    endEditing: function(target, value, cancel)
    {
        // Remove empty groups by default
        return true;
    },

    insertNewRow: function(target, insertWhere)
    {
    },
});

// ************************************************************************************************
// InlineEditor

Firebug.InlineEditor = function(doc)
{
    this.initializeInline(doc);
};

with (Domplate) {
Firebug.InlineEditor.prototype = domplate(Firebug.BaseEditor,
{
    enterOnBlur: true,

    tag:
        DIV({"class": "inlineEditor"},
            INPUT({"class": "textEditorInner", type: "text",
                oninput: "$onInput", onkeypress: "$onKeyPress", onoverflow: "$onOverflow",
                oncontextmenu: "$onContextMenu"}
            )
        ),

    inputTag :
        INPUT({"class": "textEditorInner", type: "text",
            oninput: "$onInput", onkeypress: "$onKeyPress", onoverflow: "$onOverflow"}
        ),

    expanderTag:
        SPAN({"class": "inlineExpander", style: "-moz-user-focus:ignore;opacity:0.5"}),

    initialize: function()
    {
        this.fixedWidth = false;
        this.completeAsYouType = true;
        this.tabNavigation = true;
        this.multiLine = false;
        this.tabCompletion = false;
        this.arrowCompletion = true;
        this.noWrap = true;
        this.numeric = false;
    },

    destroy: function()
    {
        this.destroyInput();
    },

    initializeInline: function(doc)
    {
        this.box = this.tag.replace({}, doc, this);
        this.input = this.box.firstChild;
        this.expander = this.expanderTag.replace({}, doc, this);
        this.initialize();
    },

    destroyInput: function()
    {
        // XXXjoe Need to remove input/keypress handlers to avoid leaks
    },

    getValue: function()
    {
        return this.input.value;
    },

    setValue: function(value)
    {
        // It's only a one-line editor, so new lines shouldn't be allowed
        return this.input.value = Str.stripNewLines(value);
    },

    setSelection: function(selectionData)
    {
        this.input.setSelectionRange(selectionData.start, selectionData.end);
        // Ci.nsISelectionController SELECTION_NORMAL SELECTION_ANCHOR_REGION SCROLL_SYNCHRONOUS
        this.input.QueryInterface(Ci.nsIDOMNSEditableElement)
            .editor.selectionController.scrollSelectionIntoView(1, 0, 2);
    },

    show: function(target, panel, value, selectionData)
    {
        Events.dispatch(panel.fbListeners, "onInlineEditorShow", [panel, this]);
        this.target = target;
        this.panel = panel;

        this.targetOffset = Dom.getClientOffset(target);

        this.originalClassName = this.box.className;

        var classNames = target.className.split(" ");
        for (var i = 0; i < classNames.length; ++i)
            Css.setClass(this.box, "editor-" + classNames[i]);

        // remove error information
        this.box.removeAttribute('saveSuccess');

        // Make the editor match the target's font style
        Css.copyTextStyles(target, this.box);

        this.setValue(value);

        this.getAutoCompleter().reset();

        panel.panelNode.appendChild(this.box);
        this.input.select();
        if (selectionData) //transfer selection to input element
            this.setSelection(selectionData);

        // Insert the "expander" to cover the target element with white space
        if (!this.fixedWidth)
        {
            this.startMeasuring(target);

            Css.copyBoxStyles(target, this.expander);
            target.parentNode.replaceChild(this.expander, target);
            Dom.collapse(target, true);
            this.expander.parentNode.insertBefore(target, this.expander);
            this.textSize = this.measureInputText(value);
        }
        this.updateLayout(true);

        Dom.scrollIntoCenterView(this.box, null, true);
    },

    hide: function()
    {
        this.box.className = this.originalClassName;

        if (!this.fixedWidth)
        {
            this.stopMeasuring();

            Dom.collapse(this.target, false);

            if (this.expander.parentNode)
                this.expander.parentNode.removeChild(this.expander);
        }

        if (this.box.parentNode)
        {
            try { this.input.setSelectionRange(0, 0); } catch (exc) {}
            this.box.parentNode.removeChild(this.box);
        }

        delete this.target;
        delete this.panel;
    },

    layout: function(forceAll)
    {
        if (!this.fixedWidth)
            this.textSize = this.measureInputText(this.input.value);

        if (forceAll)
            this.targetOffset = Dom.getClientOffset(this.expander);

        this.updateLayout(false, forceAll);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    beginEditing: function(target, value)
    {
    },

    saveEdit: function(target, value, previousValue)
    {
    },

    endEditing: function(target, value, cancel)
    {
        // Remove empty groups by default
        return true;
    },

    insertNewRow: function(target, insertWhere)
    {
    },

    advanceToNext: function(target, charCode)
    {
        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getAutoCompleteRange: function(value, offset)
    {
    },

    getAutoCompleteList: function(preExpr, expr, postExpr)
    {
    },

    isValidAutoCompleteProperty: function(value)
    {
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getAutoCompleter: function()
    {
        if (!this.autoCompleter)
        {
            this.autoCompleter = new Firebug.AutoCompleter(null,
                Obj.bind(this.getAutoCompleteRange, this), Obj.bind(this.getAutoCompleteList, this),
                true, false, undefined, undefined, undefined, Obj.bind(this.isValidAutoCompleteProperty, this));
        }

        return this.autoCompleter;
    },

    completeValue: function(amt)
    {
        if (this.getAutoCompleter().complete(currentPanel.context, this.input, null, true, amt < 0, true))
            Firebug.Editor.update(true);
        else
            this.incrementValue(amt);
    },

    incrementValue: function(amt)
    {
        var value = this.input.value;
        var start = this.input.selectionStart, end = this.input.selectionEnd;

        var range = this.getAutoCompleteRange(value, start);
        if (!range || range.type != "int")
            range = {start: 0, end: value.length-1};

        var expr = value.substr(range.start, range.end-range.start+1);
        preExpr = value.substr(0, range.start);
        postExpr = value.substr(range.end+1);

        // See if the value is an number, and if so increment it
        var intValue = parseFloat(expr);
        if (!!intValue || intValue == 0)
        {
            var m = /\d+(\.\d+)?/.exec(expr);
            var digitPost = expr.substr(m.index+m[0].length);

            var completion = Math.round((intValue-amt)*100)/100; // avoid rounding errors
            this.input.value = preExpr + completion + digitPost + postExpr;
            this.input.setSelectionRange(start, end);

            Firebug.Editor.update(true);

            return true;
        }
        else
            return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onKeyPress: function(event)
    {
        if (event.keyCode == 27 && !this.completeAsYouType)
        {
            var reverted = this.getAutoCompleter().revert(this.input);
            if (reverted)
                Events.cancelEvent(event);
        }
        else if (event.charCode && this.advanceToNext(this.target, event.charCode))
        {
            Firebug.Editor.tabNextEditor();
            Events.cancelEvent(event);
        }
        else if (this.numeric && event.charCode && (event.charCode < 48 || event.charCode > 57) && event.charCode != 45 && event.charCode != 46)
        {
            Events.cancelEvent(event);
        }
        else
        {
            // If the user backspaces, don't autocomplete after the upcoming input event
            this.ignoreNextInput = event.keyCode == 8;
        }
    },

    onOverflow: function()
    {
        this.updateLayout(false, false, 3);
    },

    onInput: function()
    {
        if (this.ignoreNextInput)
        {
            this.ignoreNextInput = false;
            this.getAutoCompleter().reset();
        }
        else if (this.completeAsYouType)
            this.getAutoCompleter().complete(currentPanel.context, this.input, null, false);
        else
            this.getAutoCompleter().reset();

        Firebug.Editor.update();
    },

    onContextMenu: function(event)
    {
        Events.cancelEvent(event);

        var popup = Firebug.chrome.$("fbInlineEditorPopup");
        Dom.eraseNode(popup);

        var target = event.target;
        var menu = this.getContextMenuItems(target);
        if (menu)
        {
            for (var i = 0; i < menu.length; ++i)
                Menu.createMenuItem(popup, menu[i]);
        }

        if (!popup.firstChild)
            return false;

        popup.openPopupAtScreen(event.screenX, event.screenY, true);
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    updateLayout: function(initial, forceAll, extraWidth)
    {
        if (this.fixedWidth)
        {
            this.box.style.left = this.targetOffset.x + "px";
            this.box.style.top = this.targetOffset.y + "px";

            var w = this.target.offsetWidth;
            var h = this.target.offsetHeight;
            this.input.style.width = w + "px";
            this.input.style.height = (h-3) + "px";
        }
        else
        {
            this.expander.textContent = this.input.value;

            var clR = this.expander.getClientRects(),
                wasWrapped = this.wrapped, inputWidth = Infinity;
            if(clR.length == 1)
                this.wrapped = false;
            else if (clR.length == 2)
            {
                var w1 = clR[0].width;
                var w2 = clR[1].width;

                if (w2 > w1){
                    this.wrapped = true;
                    inputWidth = w2
                } else
                    this.wrapped = false;
            }
            else if (clR.length == 3)
            {
                this.wrapped = true;
                if (clR[2].width > 50)
                    inputWidth = clR[1].width;
            }
            else // clR.length>3
                this.wrapped = true

            if(this.wrapped)
            {
                var fixupL = clR[1].left - clR[0].left,
                    fixupT = clR[1].top - clR[0].top;
            }
            else
            {
                var fixupL = 0, fixupT = 0;
                var approxTextWidth = this.textSize.width;
                // Make the input one character wider than the text value so that
                // typing does not ever cause the textbox to scroll
                var charWidth = this.measureInputText('m').width;

                // Sometimes we need to make the editor a little wider, specifically when
                // an overflow happens, otherwise it will scroll off some text on the left
                if (extraWidth)
                    charWidth *= extraWidth;

                var inputWidth = approxTextWidth + charWidth;
            }


            var container = currentPanel.panelNode;
            var maxWidth = container.clientWidth - this.targetOffset.x - fixupL + container.scrollLeft-6;

            if(inputWidth > maxWidth)
                inputWidth = maxWidth;

            if (forceAll || initial || this.wrapped != wasWrapped)
            {
                this.box.style.left = (this.targetOffset.x + fixupL) + "px";
                this.box.style.top = (this.targetOffset.y + fixupT) + "px";
            }
            this.input.style.width = inputWidth + "px";
        }

        if (forceAll)
            Dom.scrollIntoCenterView(this.box, null, true);
    }
})};

// ************************************************************************************************
// Autocompletion

Firebug.AutoCompleter = function(getExprOffset, getRange, evaluator, selectMode, caseSensitive,
    noCompleteOnBlank, noShowGlobal, showCompletionPopup, isValidProperty, simplifyExpr,
    killCompletions)
{
    var candidates = null;
    var originalValue = null;
    var originalOffset = -1;
    var lastExpr = null;
    var lastOffset = -1;
    var exprOffset = 0;
    var lastIndex = -2;  // adding 1 will still be less then zero
    var preParsed = null;
    var preExpr = null;
    var postExpr = null;
    var completionPopup = Firebug.chrome.$("fbCommandLineCompletionList");
    var commandCompletionLineLimit = 40;
    // current completion state values
    var preCompletion = "";
    var completionStart = -1;
    var completionEnd = -1;

    // XXXsilin 'reJavascriptChar', 'value' and 'accepted' seemed to be unused, so I removed them.

    this.revert = function(textBox)
    {
        if (originalOffset != -1)
        {
            textBox.value = originalValue;
            textBox.setSelectionRange(originalOffset, originalOffset);

            this.reset();
            return true;
        }
        else
        {
            this.reset();
            return false;
        }
    };

    this.reset = function()
    {
        candidates = null;
        originalValue = null;
        originalOffset = -1;
        lastExpr = null;
        lastOffset = 0;
        exprOffset = 0;
        lastIndex = -2;
    };

    this.complete = function(context, textBox, completionBox, cycle, reverse, showGlobals)
    {
        this.clearCandidates(textBox, completionBox);

        if (!this.getVerifiedText(textBox) && !showGlobals) // then no completion is desired
            return false;

        var offset = textBox.selectionStart; // defines the cursor position

        var found = this.pickCandidates(textBox, offset, context, cycle, reverse, showGlobals);

        if (completionBox)
        {
            if (found)
                this.showCandidates(textBox, completionBox);
            else
                this.clear(completionBox);
        }

        return found;
    };

    /*
     * returns true if candidate list was created
     */
    this.pickCandidates = function(textBox, offset, context, cycle, reverse, showGlobals)
    {
        var value = textBox.value;

        if (!candidates || !cycle || offset != lastOffset)
        {
            originalOffset = offset;
            originalValue = value;

            // XXXsilin What's the reason for dealing with offsets here? Most
            // functions seem to ignore them entirely (getExpressionOffset, getDot),
            // and it seems completions are killed entirely when not at the end
            // of an expression anyway. If they have to remain, why not just use
            // value.substr(0, offset) instead of value everywhere?

            // Create a simplified expression by redacting contents/normalizing
            // delimiters of strings and regexes, to make parsing easier.
            // Give up if the syntax is too weird.
            var svalue = simplifyExpr ? simplifyExpr(value, context) : value;
            if (svalue === null)
                return false;

            if (killCompletions && killCompletions(svalue, offset, context))
                return false;

            // Find the part of the string that will be parsed
            var parseStart = getExprOffset ? getExprOffset(svalue, offset, context) : 0;
            preParsed = value.substr(0, parseStart);
            var parsed = value.substr(parseStart);
            var sparsed = svalue.substr(parseStart);

            // Find the part of the string that is being completed
            var range = getRange ? getRange(sparsed, offset-parseStart, context) : null;
            if (!range)
                range = {start: 0, end: parsed.length-1};

            var expr = parsed.substr(range.start, range.end-range.start+1);
            var spreExpr = sparsed.substr(0, range.start);
            preExpr = parsed.substr(0, range.start);
            postExpr = parsed.substr(range.end+1);
            exprOffset = parseStart + range.start;

            if (FBTrace.DBG_EDITOR)
            {
                var sep = (parsed.indexOf('|') > -1) ? '^' : '|';
                FBTrace.sysout(preExpr+sep+expr+sep+postExpr+" offset: "+offset+
                    " parseStart:"+parseStart);
            }

            if (!cycle)
            {
                if (!expr)
                {
                    return false;
                }
                else if (lastExpr && lastExpr.indexOf(expr) != 0)
                {
                    candidates = null;
                }
                else if (lastExpr && lastExpr.length >= expr.length)
                {
                    candidates = null;
                    lastExpr = expr;
                    return false;
                }
            }

            lastExpr = expr;
            lastOffset = offset;

            var searchExpr;

            // Check if the cursor is at the very right edge of the expression, or
            // somewhere in the middle of it
            if (expr && offset != parseStart+range.end+1)
            {
                if (cycle)
                {
                    // We are in the middle of the expression, but we can
                    // complete by cycling to the next item in the values
                    // list after the expression
                    offset = range.start;
                    searchExpr = expr;
                    expr = "";
                }
                else
                {
                    // We can't complete unless we are at the ridge edge
                    return false;
                }
            }

            if (!showGlobals && !preExpr && !expr && !postExpr)
            {
                // Don't complete globals unless we are forced to do so.
                return false;
            }

            var values = evaluator(preExpr, expr, postExpr, context, spreExpr);
            if (!values)
                return false;

            if (expr)
            {
                this.setCandidatesByExpr(expr, values, reverse);
            }
            else if (searchExpr)
            {
                if (!this.setCandidatesBySearchExpr(searchExpr, expr, values))
                    return false;
                expr = searchExpr;
            }
            else
            {
                this.setCandidatesByValues(values);
            }
        }

        if (cycle)
            expr = lastExpr;

        if (!candidates.length)
        {
            return false;
        }

        this.adjustLastIndex(cycle, reverse);

        var completion = candidates[lastIndex];
        preCompletion = expr.substr(0, offset-exprOffset);
        var postCompletion = completion.substr(offset-exprOffset);

        var line = preParsed + preExpr + preCompletion + postCompletion + postExpr;
        var offsetEnd = preParsed.length + preExpr.length + completion.length;


        if (selectMode) // inline completion uses this
        {
            textBox.value = line;
            textBox.setSelectionRange(offset, offsetEnd);
        }
        else
        {
            textBox.setSelectionRange(offsetEnd, offsetEnd);
        }

        // store current state of completion
        currentLine = line;
        completionStart = offset;
        completionEnd = offsetEnd;

        return true;
    };

    this.setCandidatesByExpr = function(expr, values, reverse)
    {
        // Filter the list of values to those which begin with expr. We
        // will then go on to complete the first value in the resulting list
        candidates = [];

        if (caseSensitive)
        {
            for (var i = 0; i < values.length; ++i)
            {
                var name = values[i];
                if (name.indexOf && name.indexOf(expr) == 0)
                    candidates.push(name);
            }
        }
        else
        {
            var lowerExpr = caseSensitive ? expr : expr.toLowerCase();
            for (var i = 0; i < values.length; ++i)
            {
                var name = values[i];
                if (name.indexOf && name.toLowerCase().indexOf(lowerExpr) == 0)
                    candidates.push(name);
            }
        }

        lastIndex = -2;
    };

    this.setCandidatesBySearchExpr = function(searchExpr, expr, values)
    {
        var searchIndex = -1;

        // Find the first instance of searchExpr in the values list. We
        // will then complete the string that is found
        if (caseSensitive)
        {
            searchIndex = values.indexOf(expr);
        }
        else
        {
            var lowerExpr = searchExpr.toLowerCase();
            for (var i = 0; i < values.length; ++i)
            {
                var name = values[i];
                if (name && name.toLowerCase().indexOf(lowerExpr) == 0)
                {
                    searchIndex = i;
                    break;
                }
            }
        }

        // Nothing found, so there's nothing to complete to
        if (searchIndex == -1)
        {
            this.reset();
            return false;
        }

        candidates = Arr.cloneArray(values);
        lastIndex = searchIndex;
        return true;
    };

    this.setCandidatesByValues = function(values)
    {
        expr = "";
        candidates = [];
        for (var i = 0; i < values.length; ++i)
        {
            var value = values[i];
            if (isValidProperty(value))
                candidates.push(value);
        }
        lastIndex = -2;
    }


    this.adjustLastIndex = function(cycle, reverse)
    {
        if (!cycle) // we have a valid lastIndex but we are not cycling, so reset it
            lastIndex = this.pickDefaultCandidate();
        else if (candidates.length === 1)
            lastIndex = 0;
        else if (lastIndex >= candidates.length)  // use default on first completion, else cycle
            lastIndex = (lastIndex === -2) ? this.pickDefaultCandidate() : 0;
        else if (lastIndex < 0)
            lastIndex = (lastIndex === -2) ? this.pickDefaultCandidate() : (candidates.length - 1);
        else // we have cycle == true
        {
            lastIndex += reverse ? -1 : 1;
            if (lastIndex >= candidates.length)
                lastIndex = 0;
            else if (lastIndex < 0)
                lastIndex = candidates.length - 1;
        }
    };

    this.cycle = function(reverse)
    {
        if (lastIndex < 0)
            return false;

        this.adjustLastIndex(true, reverse);

        var completion = candidates[lastIndex];
        var postCompletion = completion.substr(preCompletion.length);
        var line = currentLine.substr(0, completionStart);
        line += postCompletion;
        var end = line.length;
        line += currentLine.substr(completionEnd);

        // preCompletion and completionStart do not change
        currentLine = line;
        completionEnd = end;
        return true;
    },

    this.pickDefaultCandidate = function()
    {
        // The shortest candidate is default value
        var pick = 0;
        for (var i = 1; i < candidates.length; i++)
        {
            if (candidates[i].length < candidates[pick].length)
                pick = i;
        }
        return pick;
    };

    this.showCandidates = function(textBox, completionBox)
    {
        completionBox.value = currentLine;

        if (showCompletionPopup && candidates.length && candidates.length > 1)
        {
            this.popupCandidates(candidates, textBox, completionBox);
            return false;
        }
        else
        {
            this.hide(candidates.length ? null : completionBox);
        }
        return true;
    };

    this.clearCandidates = function(textBox, completionBox)
    {
        if (completionBox)
            completionBox.value = "";
    },

    this.popupCandidates = function(candidates, textBox, completionBox)
    {
        // This method should not operate on the textBox or candidates list
        Dom.eraseNode(completionPopup);

        var vbox = completionPopup.ownerDocument.createElement("vbox");
        completionPopup.appendChild(vbox);
        vbox.classList.add("fbCommandLineCompletions");

        var title = completionPopup.ownerDocument.createElementNS("http://www.w3.org/1999/xhtml","div");
        title.innerHTML = Locale.$STR("console.Use Arrow keys or Enter");
        title.classList.add('fbPopupTitle');
        vbox.appendChild(title);

        var prefix = this.getVerifiedText(textBox);
        var pre = null;

        var showTop = 0;
        var showBottom = candidates.length;

        if (candidates.length > commandCompletionLineLimit)
        {
            var showBottom = commandCompletionLineLimit;

            if (lastIndex > (commandCompletionLineLimit - 3) ) // then implement manual scrolling
            {
                if (lastIndex > (candidates.length - commandCompletionLineLimit) ) // then just show the bottom
                {
                    var showTop = candidates.length - commandCompletionLineLimit;
                    var showBottom = candidates.length;
                }
                else
                {
                    var showTop = lastIndex - (commandCompletionLineLimit - 3);
                    var showBottom = lastIndex + 3;
                }
            }
            // else we are in the top part of the list
        }

        for (var i = showTop; i < showBottom; i++)
        {
            var hbox = completionPopup.ownerDocument.createElementNS("http://www.w3.org/1999/xhtml","div");
            pre = completionPopup.ownerDocument.createElementNS("http://www.w3.org/1999/xhtml","span");
            pre.innerHTML = Str.escapeForTextNode(prefix);
            var post = completionPopup.ownerDocument.createElementNS("http://www.w3.org/1999/xhtml","span");
            var completion = candidates[i].substr(preCompletion.length);
            post.innerHTML = Str.escapeForTextNode(completion);
            if (i === lastIndex)
                post.setAttribute('selected', 'true');

            hbox.appendChild(pre);
            hbox.appendChild(post);
            vbox.appendChild(hbox);
            pre.classList.add("userTypedText");
            post.classList.add("completionText");
        }

        completionPopup.currentCompletionBox = completionBox;
        var anchor = textBox;
        this.linuxFocusHack = textBox;
        completionPopup.openPopup(anchor, "before_start", 0, 0, false, false);

        return;
    };

    this.hide = function(box)
    {
        if (box)
            box.value = ""; // erase the text in the second track

        delete completionPopup.currentCompletionBox;

        if (completionPopup.state == "closed")
            return false;

        try
        {
            completionPopup.hidePopup();
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("Firebug.editor; EXCEPTION " + err, err);
        }

        return true;
    };

    this.clear = function(box)
    {
        var textBox = completionPopup.currentCompletionBox;
        if (textBox)
            this.hide(box);

        if (box)
            box.value = ""; // erase the text in the second track

        this.reset();
    };

    this.getVerifiedText = function(textBox)
    {
        return textBox.value;
    };

    this.getCompletionText = function(box)
    {
        return box.value;
    };

    this.handledKeyUp = function(event, context, textBox, completionBox)
    {
        return;  // Some of the keyDown maybe should be in keyUp
    };

    this.handledKeyDown = function(event, context, textBox, completionBox)
    {
        var clearedTabWarning = this.clearTabWarning(completionBox);

        if (event.altKey || event.metaKey)
            return false;

        if (event.ctrlKey && event.keyCode === 32) // Control space
        {
            this.complete(context, textBox, completionBox, false, false, true); // force completion incl globals
            return true;
        }
        else if (event.keyCode === 9 || // TAB
            (event.keyCode === 39 && completionBox.value.length && textBox.selectionStart === textBox.value.length)) // right arrow
        {
            if (!completionBox.value.length)  // then no completion text,
            {
                if (clearedTabWarning) // then you were warned,
                    return false; //  pass TAB along

                this.setTabWarning(textBox, completionBox);
                Events.cancelEvent(event);
                return true;
            }
            else  // complete
            {
                this.acceptCompletionInTextBox(textBox, completionBox);
                Events.cancelEvent(event);
                return true;
            }
        }
        else if (event.keyCode === 27) // ESC, close the completer
        {
            if (this.hide(completionBox))  // then we closed the popup
            {
                Events.cancelEvent(event); // Stop event bubbling if it was used to close the popup.
                return true;
            }
        }
        else if (event.keyCode === 38 || event.keyCode === 40) // UP or DOWN arrow
        {
            if (this.getCompletionText(completionBox))
            {
                if (this.cycle(event.keyCode === 38))
                    this.showCandidates(textBox, completionBox);
                Events.cancelEvent(event);
                return true;
            }
            // else the arrow will fall through to command history
        }
    };

    this.clearTabWarning = function(completionBox)
    {
        if (completionBox.tabWarning)
        {
            completionBox.value = "";
            delete completionBox.tabWarning;
            return true;
        }
        return false;
    };

    this.setTabWarning = function(textBox, completionBox)
    {
        completionBox.value = textBox.value + "    " + Locale.$STR("firebug.completion.empty");
        completionBox.tabWarning = true;
    };

    this.setCompletionOnEvent = function(event)
    {
        if (completionPopup.currentCompletionBox)
        {
            var selected = event.target;
            while (selected && (selected.localName !== "div"))
                selected = selected.parentNode;

            if (selected)
            {
                var completionText = selected.getElementsByClassName('completionText')[0];
                if (!completionText)
                    return;

                var completion = selected.textContent;
                var textBox = completionPopup.currentCompletionBox;
                textBox.value = completion;
                if (FBTrace.DBG_EDITOR)
                    FBTrace.sysout("textBox.setCompletionOnEvent "+completion);
            }
        }
    };

    this.acceptCompletionInTextBox = function(textBox, completionBox)
    {
        textBox.value = completionBox.value;
        textBox.setSelectionRange(textBox.value.length, textBox.value.length); // ensure the cursor at EOL
        this.hide(completionBox);
        return true;
    };

    this.acceptCompletion = function(event)
    {
        if (completionPopup.currentCompletionBox)
            this.acceptCompletionInTextBox(Firebug.CommandLine.getCommandLineSmall(), Firebug.CommandLine.getCompletionBox());
    };

    this.acceptCompletion = Obj.bind(this.acceptCompletion, this);

    this.focusHack = function(event)
    {
        if (this.linuxFocusHack)
            this.linuxFocusHack.focus();  // XXXjjb This does not work, but my experience with focus is that it usually does not work.
        delete this.linuxFocusHack;
    };

    completionPopup.addEventListener("mouseover", this.setCompletionOnEvent, true);
    completionPopup.addEventListener("click", this.acceptCompletion, true);
    completionPopup.addEventListener("focus", this.focusHack, true);
};




// ************************************************************************************************
// Local Helpers

function getDefaultEditor(panel)
{
    if (!defaultEditor)
    {
        var doc = panel.document;
        defaultEditor = new Firebug.InlineEditor(doc);
    }

    return defaultEditor;
}

/**
 * An outsider is the first element matching the stepper element that
 * is not an child of group. Elements tagged with insertBefore or insertAfter
 * classes are also excluded from these results unless they are the sibling
 * of group, relative to group's parent editGroup. This allows for the proper insertion
 * rows when groups are nested.
 */
function getOutsider(element, group, stepper)
{
    var parentGroup = Dom.getAncestorByClass(group.parentNode, "editGroup");
    var next;
    do
    {
        next = stepper(next || element);
    }
    while (Dom.isAncestor(next, group) || isGroupInsert(next, parentGroup));

    return next;
}

function isGroupInsert(next, group)
{
    return (!group || Dom.isAncestor(next, group))
        && (Css.hasClass(next, "insertBefore") || Css.hasClass(next, "insertAfter"));
}

function getNextOutsider(element, group)
{
    return getOutsider(element, group, Obj.bind(Dom.getNextByClass, Dom, "editable"));
}

function getPreviousOutsider(element, group)
{
    return getOutsider(element, group, Obj.bind(Dom.getPreviousByClass, Dom, "editable"));
}

function getInlineParent(element)
{
    var lastInline = element;
    for (; element; element = element.parentNode)
    {
        var s = element.ownerDocument.defaultView.getComputedStyle(element, "");
        if (s.display != "inline")
            return lastInline;
        else
            lastInline = element;
    }
    return null;
}

function insertTab()
{
    Dom.insertTextIntoElement(currentEditor.input, Firebug.Editor.tabCharacter);
}

// ************************************************************************************************
// Registration

Firebug.registerModule(Firebug.Editor);

return Firebug.Editor;

// ************************************************************************************************
});
