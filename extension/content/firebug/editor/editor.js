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
    "firebug/chrome/menu",
    "firebug/trace/debug",
],
function(Obj, Firebug, Domplate, Locale, Events, Css, Dom, Str, Arr, Menu, Debug) {

// ********************************************************************************************* //
// Constants

const saveTimeout = 400;
const hugeChangeAmount = 100;
const largeChangeAmount = 10;
const smallChangeAmount = 0.1;

// ********************************************************************************************* //
// Globals

// xxxHonza: it's bad design to have these globals.
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

// ********************************************************************************************* //

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

        originalValue = previousValue = value = currentEditor.getInitialValue(target, value);

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

        Events.dispatch(currentPanel.fbListeners, "onInlineEditorClose", [currentPanel,
            currentTarget, !originalValue]);

        this.stopEditing();
    },

    stopEditing: function(cancel)
    {
        if (!currentTarget)
            return;

        if (FBTrace.DBG_EDITOR)
        {
            FBTrace.sysout("editor.stopEditing cancel:" + cancel+" saveTimeout: " +
                this.saveTimeout);
        }

        // Make sure the content is save if there is a timeout in progress.
        if (this.saveTimeout)
            this.save();

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

        // Reset the editor's value so it isn't accidentally reused the next time
        // the editor instance is reused (see also 3280, 3332).
        currentEditor.setValue("");

        var removeGroup = currentEditor.endEditing(currentTarget, value, cancel);

        try
        {
            if (cancel)
            {
                Events.dispatch(currentPanel.fbListeners, "onInlineEditorClose",
                    [currentPanel, currentTarget, removeGroup && !originalValue]);

                if (value != originalValue)
                    this.saveEditAndNotifyListeners(currentTarget, originalValue, previousValue);

                currentEditor.cancelEditing(currentTarget, originalValue);

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
            {
                this.save(value);
            }
        }
        catch (exc)
        {
            Debug.ERROR(exc);
        }

        currentEditor.hide();
        currentPanel.editing = false;

        Events.dispatch(this.fbListeners, "onStopEdit", [currentPanel, currentEditor,
            currentTarget]);

        if (FBTrace.DBG_EDITOR)
            FBTrace.sysout("Editor stop panel " + currentPanel.name);

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
        {
            this.save();
        }
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
            FBTrace.sysout("editor.save saveTimeout: " + this.saveTimeout + " currentPanel: " +
                (currentPanel ? currentPanel.name : "null"));

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
        Events.dispatch(this.fbListeners, "onSaveEdit", [currentPanel, currentEditor,
            currentTarget, value, previousValue]);
    },

    setEditTarget: function(element)
    {
        if (!element)
        {
            Events.dispatch(currentPanel.fbListeners, "onInlineEditorClose",
                [currentPanel, currentTarget, true]);
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    attachListeners: function(editor, context)
    {
        var win = currentTarget.ownerDocument.defaultView;
        Events.addEventListener(win, "resize", this.onResize, true);
        Events.addEventListener(win, "blur", this.onBlur, true);

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
                chrome.keyCodeListen("DOWN", Events.isControl, Obj.bindFixed(editor.completeValue, editor, smallChangeAmount)),
                chrome.keyCodeListen("PAGE_UP", null, Obj.bindFixed(editor.completeValue, editor, -largeChangeAmount)),
                chrome.keyCodeListen("PAGE_DOWN", null, Obj.bindFixed(editor.completeValue, editor, largeChangeAmount)),
                chrome.keyCodeListen("PAGE_UP", Events.isShift, Obj.bindFixed(editor.completeValue, editor, -hugeChangeAmount)),
                chrome.keyCodeListen("PAGE_DOWN", Events.isShift, Obj.bindFixed(editor.completeValue, editor, hugeChangeAmount))
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
                    chrome.keyCodeListen("DOWN", Events.isControl, Obj.bindFixed(editor.completeValue, editor, smallChangeAmount)),
                    chrome.keyCodeListen("PAGE_UP", null, Obj.bindFixed(editor.completeValue, editor, -largeChangeAmount)),
                    chrome.keyCodeListen("PAGE_DOWN", null, Obj.bindFixed(editor.completeValue, editor, largeChangeAmount)),
                    chrome.keyCodeListen("PAGE_UP", Events.isShift, Obj.bindFixed(editor.completeValue, editor, -hugeChangeAmount)),
                    chrome.keyCodeListen("PAGE_DOWN", Events.isShift, Obj.bindFixed(editor.completeValue, editor, hugeChangeAmount))
                );
            }
        }
    },

    detachListeners: function(editor, context)
    {
        if (!this.listeners)
            return;

        var win = currentTarget.ownerDocument.defaultView;
        Events.removeEventListener(win, "resize", this.onResize, true);
        Events.removeEventListener(win, "blur", this.onBlur, true);
        Events.removeEventListener(win, "input", this.onInput, true);

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
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

// ********************************************************************************************* //
// BaseEditor

Firebug.BaseEditor = Obj.extend(Firebug.MeasureBox,
{
    getInitialValue: function(target, value)
    {
        return value;
    },

    getValue: function()
    {
    },

    setValue: function(value)
    {
    },

    show: function(target, panel, value, selectionData)
    {
    },

    hide: function()
    {
    },

    layout: function(forceAll)
    {
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
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

    cancelEditing: function(target, value)
    {
    },

    insertNewRow: function(target, insertWhere)
    {
    },
});

// ********************************************************************************************* //
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
        this.input.QueryInterface(Components.interfaces.nsIDOMNSEditableElement)
            .editor.selectionController.scrollSelectionIntoView(1, 0, 2);
    },

    show: function(target, panel, value, selectionData)
    {
        if (FBTrace.DBG_EDITOR)
        {
            FBTrace.sysout("Firebug.InlineEditor.show",
                {target: target, panel: panel, value: value, selectionData: selectionData});
        }

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
        if (selectionData) // transfer selection to input element
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
        if (FBTrace.DBG_EDITOR)
            FBTrace.sysout("Firebug.InlineEditor.hide");

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    beginEditing: function(target, value)
    {
    },

    saveEdit: function(target, value, previousValue)
    {
    },

    endEditing: function(target, value, cancel)
    {
        if (FBTrace.DBG_EDITOR)
        {
            FBTrace.sysout("Firebug.InlineEditor.endEditing",
                {target: target, value: value, cancel: cancel});
        }

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getAutoCompleteRange: function(value, offset)
    {
    },

    getAutoCompleteList: function(preExpr, expr, postExpr)
    {
        return [];
    },

    getAutoCompletePropSeparator: function(range, expr, prefixOf)
    {
        return null;
    },

    autoCompleteAdjustSelection: function(value, offset)
    {
        return null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getAutoCompleter: function()
    {
        if (!this.autoCompleter)
        {
            this.autoCompleter = new Firebug.AutoCompleter(false,
                Obj.bind(this.getAutoCompleteRange, this),
                Obj.bind(this.getAutoCompleteList, this),
                Obj.bind(this.getAutoCompletePropSeparator, this),
                Obj.bind(this.autoCompleteAdjustSelection, this));
        }

        return this.autoCompleter;
    },

    completeValue: function(amt)
    {
        if (this.getAutoCompleter().complete(currentPanel.context, this.input, amt, true))
            Firebug.Editor.update(true);
        else
            this.incrementValue(amt);
    },

    incrementValue: function(amt)
    {
        var value = this.input.value;
        var offset = this.input.selectionStart;
        var offsetEnd = this.input.selectionEnd;

        var newValue = this.doIncrementValue(value, amt, offset, offsetEnd);
        if (!newValue)
            return false;

        this.input.value = newValue.value;
        this.input.setSelectionRange(newValue.start, newValue.end);

        Firebug.Editor.update(true);
        return true;
    },

    incrementExpr: function(expr, amt, info)
    {
        var num = parseFloat(expr);
        if (isNaN(num))
            return null;

        var m = /\d+(\.\d+)?/.exec(expr);
        var digitPost = expr.substr(m.index+m[0].length);
        var newValue = Math.round((num-amt)*1000)/1000; // avoid rounding errors

        if (info && "minValue" in info)
            newValue = Math.max(newValue, info.minValue);
        if (info && "maxValue" in info)
            newValue = Math.min(newValue, info.maxValue);

        newValue = newValue.toString();

        // Preserve trailing zeroes of small increments.
        if (Math.abs(amt) < 1)
        {
            if (newValue.indexOf(".") === -1)
                newValue += ".";
            var dec = newValue.length - newValue.lastIndexOf(".") - 1;
            var incDec = Math.abs(amt).toString().length - 2;
            while (dec < incDec)
            {
                newValue += "0";
                ++dec;
            }
        }

        return newValue + digitPost;
    },

    doIncrementValue: function(value, amt, offset, offsetEnd, info)
    {
        // Try to find a number around the cursor to increment.
        var start, end;
        if (/^-?[0-9.]/.test(value.substring(offset, offsetEnd)) &&
            !(info && /\d/.test(value.charAt(offset-1) + value.charAt(offsetEnd))))
        {
            // We have a number selected, possibly with a suffix, and we are not in
            // the disallowed case of just part of a known number being selected.
            // Use that number.
            start = offset;
            end = offsetEnd;
        }
        else
        {
            // Parse periods as belonging to the number only if we are in a known number
            // context. (This makes incrementing the 1 in 'image1.gif' work.)
            var pattern = "[" + (info ? "0-9." : "0-9") + "]*";

            var before = new RegExp(pattern + "$").exec(value.substr(0, offset))[0].length;
            var after = new RegExp("^" + pattern).exec(value.substr(offset))[0].length;
            start = offset - before;
            end = offset + after;

            // Expand the number to contain an initial minus sign if it seems
            // free-standing.
            if (value.charAt(start-1) === "-" &&
                (start-1 === 0 || /[ (:,='"]/.test(value.charAt(start-2))))
            {
                --start;
            }
        }

        if (start !== end)
        {
            // Include percentages as part of the incremented number (they are
            // common enough).
            if (value.charAt(end) === "%")
                ++end;

            var first = value.substr(0, start);
            var mid = value.substring(start, end);
            var last = value.substr(end);
            mid = this.incrementExpr(mid, amt, info);
            if (mid !== null)
            {
                return {
                    value: first + mid + last,
                    start: start,
                    end: start + mid.length
                };
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onKeyPress: function(event)
    {
        if (event.keyCode == KeyEvent.DOM_VK_ESCAPE && !this.completeAsYouType)
        {
            var reverted = this.getAutoCompleter().revert(this.input);
            if (reverted)
                Events.cancelEvent(event);
        }
        else if (event.keyCode == KeyEvent.DOM_VK_RIGHT && this.completeAsYouType)
        {
            if (this.getAutoCompleter().acceptCompletion(this.input))
                Events.cancelEvent(event);
        }
        else if (event.charCode && this.advanceToNext(this.target, event.charCode))
        {
            Firebug.Editor.tabNextEditor();
            Events.cancelEvent(event);
        }
        else if (this.numeric && event.charCode &&
            !(event.ctrlKey || event.metaKey || event.altKey) &&
            !(KeyEvent.DOM_VK_0 <= event.charCode && event.charCode <= KeyEvent.DOM_VK_9) &&
            event.charCode !== KeyEvent.DOM_VK_INSERT && event.charCode !== KeyEvent.DOM_VK_DELETE)
        {
            Events.cancelEvent(event);
        }
        else if (event.keyCode == KeyEvent.DOM_VK_BACK_SPACE ||
            event.keyCode == KeyEvent.DOM_VK_DELETE)
        {
            // If the user deletes text, don't autocomplete after the upcoming input event
            this.ignoreNextInput = true;
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
            this.getAutoCompleter().complete(currentPanel.context, this.input, 0, false);
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
        var items = this.getContextMenuItems(target);
        if (items)
            Menu.createMenuItems(popup, items);

        if (!popup.firstChild)
            return false;

        popup.openPopupAtScreen(event.screenX, event.screenY, true);
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

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
            {
                this.wrapped = false;
            }
            else if (clR.length == 2)
            {
                var w1 = clR[0].width;
                var w2 = clR[1].width;

                if (w2 > w1){
                    this.wrapped = true;
                    inputWidth = w2;
                } else
                    this.wrapped = false;
            }
            else if (clR.length == 3)
            {
                this.wrapped = true;
                if (clR[2].width > 50)
                    inputWidth = clR[1].width;
            }
            else if(clR.length > 3)
            {
                this.wrapped = true;
            }

            if(this.wrapped)
            {
                var fixupL = clR[1].left - clR[0].left;
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
            var maxWidth = container.clientWidth - this.targetOffset.x - fixupL +
                container.scrollLeft-6;

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
});
};

// ********************************************************************************************* //
// Autocompletion

Firebug.AutoCompleter = function(caseSensitive, getRange, evaluator, getNewPropSeparator,
    adjustSelectionOnAccept)
{
    var candidates = null;
    var suggestedDefault = null;
    var lastValue = "";
    var originalOffset = -1;
    var originalValue = null;
    var lastExpr = null;
    var lastOffset = -1;
    var exprOffset = 0;
    var lastIndex = null;
    var preExpr = null;
    var postExpr = null;

    this.revert = function(textBox)
    {
        if (originalOffset != -1)
        {
            textBox.value = lastValue = originalValue;
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
        suggestedDefault = null;
        originalOffset = -1;
        originalValue = null;
        lastExpr = null;
        lastOffset = 0;
        exprOffset = 0;
        lastIndex = null;
    };

    this.acceptCompletion = function(textBox)
    {
        if (!adjustSelectionOnAccept)
            return false;

        var value = textBox.value;
        var offset = textBox.selectionStart;
        var offsetEnd = textBox.selectionEnd;
        if (!candidates || value !== lastValue || offset !== lastOffset || offset >= offsetEnd)
            return false;

        var ind = adjustSelectionOnAccept(value, offsetEnd);
        if (ind === null)
            return false;

        textBox.setSelectionRange(ind, ind);
        return true;
    };

    this.complete = function(context, textBox, cycle)
    {
        if (!textBox.value && !cycle)
        {
            // Don't complete an empty field.
            return false;
        }

        var offset = textBox.selectionStart; // defines the cursor position

        var found = this.pickCandidates(textBox, context, cycle);

        if (!found)
            this.reset();

        return found;
    };

    /**
     * returns true if candidate list was created
     */
    this.pickCandidates = function(textBox, context, cycle)
    {
        var value = textBox.value;
        var offset = textBox.selectionStart;

        if (!candidates || !cycle || value != lastValue || offset != lastOffset)
        {
            originalOffset = lastOffset = offset;
            originalValue = lastValue = value;

            // Find the part of the string that is being completed
            var range = getRange(value, lastOffset);
            if (!range)
                range = {start: 0, end: value.length};

            preExpr = value.substr(0, range.start);
            lastExpr = value.substring(range.start, range.end);
            postExpr = value.substr(range.end);
            exprOffset = range.start;

            if (FBTrace.DBG_EDITOR)
            {
                var sep = (value.indexOf("|") > -1) ? "^" : "|";
                FBTrace.sysout(preExpr+sep+lastExpr+sep+postExpr + " offset: " + lastOffset);
            }

            var search = false;

            // Check if the cursor is somewhere in the middle of the expression
            if (lastExpr && offset != range.end)
            {
                if (cycle)
                {
                    // Complete by resetting the completion list to a more complete
                    // list of candidates, finding our current position in it, and
                    // cycling from there.
                    search = true;
                    lastOffset = range.start;
                }
                else if (offset != range.start+1)
                {
                    // Nothing new started, just fail.
                    return false;
                }
                else
                {
                    // Try to parse the typed character as the start of a new
                    // property, moving the rest of lastExpr over into postExpr
                    // (possibly with a separator added). If there is no support
                    // for prefix-completions, fail. If the character could
                    // plausibly be part of a leftwards expansion, fail.
                    // Note that this does not show unless there is a completion.
                    var moveOver = lastExpr.substr(1);
                    lastExpr = lastExpr.charAt(0);
                    range.start = offset - 1;
                    range.end = offset;

                    var cand = evaluator(preExpr, lastExpr, postExpr, range, false, context, {});
                    var imov = (caseSensitive ? moveOver : moveOver.toLowerCase());
                    for (var i = 0; i < cand.length; ++i)
                    {
                        var c = cand[i];
                        if (c.length <= imov.length || c.charAt(0) !== lastExpr)
                            continue;
                        c = (caseSensitive ? c : c.toLowerCase());
                        if (c.substr(-imov.length) === imov)
                            return false;
                    }

                    var sep = getNewPropSeparator(range, lastExpr, moveOver);
                    if (sep === null)
                        return false;
                    if (!Str.hasPrefix(moveOver, sep))
                        moveOver = sep + moveOver;

                    postExpr = moveOver + postExpr;
                }
            }

            // Don't complete globals unless cycling.
            if (!cycle && !lastExpr)
                return false;

            var out = {};
            var values = evaluator(preExpr, lastExpr, postExpr, range, search, context, out);
            suggestedDefault = out.suggestion || null;

            if (search)
                this.setCandidatesBySearchExpr(lastExpr, values);
            else
                this.setCandidatesByExpr(lastExpr, values);
        }

        if (!candidates.length)
            return false;

        this.adjustLastIndex(cycle);
        var completion = candidates[lastIndex];

        // Adjust the case of the completion - when editing colors, 'd' should
        // be completed into 'darkred', not 'darkRed'.
        var userTyped = lastExpr.substr(0, lastOffset-exprOffset);
        completion = this.convertCompletionCase(completion, userTyped);

        var line = preExpr + completion + postExpr;
        var offsetEnd = exprOffset + completion.length;

        // Show the completion
        lastValue = textBox.value = line;
        textBox.setSelectionRange(lastOffset, offsetEnd);

        return true;
    };

    this.setCandidatesByExpr = function(expr, values)
    {
        // Filter the list of values to those which begin with expr. We
        // will then go on to complete the first value in the resulting list.
        candidates = [];

        var findExpr = (caseSensitive ? expr : expr.toLowerCase());
        for (var i = 0; i < values.length; ++i)
        {
            var name = values[i];
            var testName = (caseSensitive ? name : name.toLowerCase());

            if (Str.hasPrefix(testName, findExpr))
                candidates.push(name);
        }

        lastIndex = null;
    };

    this.setCandidatesBySearchExpr = function(expr, values)
    {
        var searchIndex = -1;

        var findExpr = (caseSensitive ? expr : expr.toLowerCase());

        // Find the first instance of expr in the values list. We
        // will then complete the string that is found.
        for (var i = 0; i < values.length; ++i)
        {
            var name = values[i];
            if (!caseSensitive)
                name = name.toLowerCase();

            if (Str.hasPrefix(name, findExpr))
            {
                searchIndex = i;
                break;
            }
        }

        if (searchIndex == -1)
        {
            // Nothing found, so there's nothing to complete to
            candidates = [];
            return;
        }

        candidates = Arr.cloneArray(values);
        lastIndex = searchIndex;
    };

    this.adjustLastIndex = function(cycle)
    {
        if (!cycle)
        {
            // We have a valid lastIndex but we are not cycling, so reset it
            lastIndex = this.pickDefaultCandidate();
        }
        else if (lastIndex === null)
        {
            // There is no old lastIndex, so use the default
            lastIndex = this.pickDefaultCandidate();
        }
        else
        {
            // cycle
            lastIndex += cycle;
            if (lastIndex >= candidates.length)
                lastIndex = 0;
            else if (lastIndex < 0)
                lastIndex = candidates.length - 1;
        }
    };

    this.convertCompletionCase = function(completion, userTyped)
    {
        var preCompletion = completion.substr(0, userTyped.length);
        if (preCompletion === userTyped)
        {
            // Trust the completion to be correct.
            return completion;
        }
        else
        {
            // If the typed string is entirely in one case, use that.
            if (userTyped === userTyped.toLowerCase())
                return completion.toLowerCase();
            if (userTyped === userTyped.toUpperCase())
                return completion.toUpperCase();

            // The typed string mixes case in some odd way; use the rest of
            // the completion as-is.
            return userTyped + completion.substr(userTyped.length);
        }
    };

    this.pickDefaultCandidate = function()
    {
        // If we have a suggestion and it's in the candidate list, use that
        if (suggestedDefault)
        {
            var ind = candidates.indexOf(suggestedDefault);
            if (ind !== -1)
                return ind;
        }

        var userTyped = lastExpr.substr(0, lastOffset-exprOffset);
        var utLen = userTyped.length;

        // Otherwise, default to the shortest candidate that matches the case,
        // or the shortest one that doesn't
        var pick = -1, pcand, pcaseState;
        for (var i = 0; i < candidates.length; i++)
        {
            var cand = candidates[i];
            var caseState = (cand.substr(0, utLen) === userTyped ? 1 : 0);
            if (pick === -1 ||
                caseState > pcaseState ||
                (caseState === pcaseState && cand.length < pcand.length))
            {
                pick = i;
                pcand = cand;
                pcaseState = caseState;
            }
        }
        return pick;
    };
};

// ********************************************************************************************* //
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

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.Editor);

return Firebug.Editor;

// ********************************************************************************************* //
});
