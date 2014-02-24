/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/events",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/chrome/module",
],
function(Firebug, FBTrace, Obj, Events, Dom, Str, Arr, Module) {

// ********************************************************************************************* //
// Constants

const saveTimeout = 400;
const hugeChangeAmount = 100;
const largeChangeAmount = 10;
const smallChangeAmount = 0.1;

var TraceError = FBTrace.toError();

// ********************************************************************************************* //
// Globals

// xxxHonza: it's bad design to have these globals.
var currentTarget = null;
var currentGroup = null;
var currentPanel = null;
var currentEditor = null;

var defaultEditor = null;

var originalValue = null;
var defaultValue = null;
var previousValue = null;

var invalidEditor = false;

// ********************************************************************************************* //

Firebug.Editor = Obj.extend(Module,
{
    supportsStopEvent: true,

    dispatchName: "editor",
    tabCharacter: "    ",

    setSelection: function(selectionData)
    {
        if (currentEditor && currentEditor.setSelection)
            currentEditor.setSelection(selectionData);
    },

    startEditing: function(target, value, editor, selectionData, panel)
    {
        // If target and currentTarget have the same group, make sure not to
        // remove that group when editing stops.
        var nextGroup = Dom.getAncestorByClass(target, "editGroup");
        var sameGroup = (nextGroup === currentGroup);
        this.stopEditing(false, sameGroup);

        if (target.classList.contains("insertBefore") || target.classList.contains("insertAfter"))
            return;

        panel = panel ? panel : Firebug.getElementPanel(target);
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
        currentGroup = nextGroup;

        currentPanel.editing = true;

        var panelEditor = currentPanel.getEditor(target, value);
        currentEditor = editor ? editor : panelEditor;
        if (!currentEditor)
            currentEditor = getDefaultEditor(currentPanel);

        panel.panelNode.classList.add("editing");
        target.classList.add("editing");
        if (currentGroup)
            currentGroup.classList.add("editing");

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

        var value = currentEditor.getValue();
        Events.dispatch(currentPanel.fbListeners, "onInlineEditorClose", [currentPanel,
            currentTarget, !value]);

        this.stopEditing();
    },

    stopEditing: function(cancel, noRemoveEmpty)
    {
        if (!currentTarget)
            return;

        if (FBTrace.DBG_EDITOR)
        {
            FBTrace.sysout("editor.stopEditing cancel: " + cancel + ", saveTimeout: " +
                this.saveTimeout);
        }

        // Make sure the content is save if there is a timeout in progress.
        if (this.saveTimeout)
            this.save();

        clearTimeout(this.saveTimeout);
        delete this.saveTimeout;

        this.detachListeners(currentEditor, currentPanel.context);

        currentPanel.panelNode.classList.remove("editing");
        currentTarget.classList.remove("editing");
        if (currentGroup)
            currentGroup.classList.remove("editing");

        var value = currentEditor.getValue();
        if (value == defaultValue)
            value = "";

        // Reset the editor's value so it isn't accidentally reused the next time
        // the editor instance is reused (see also 3280, 3332).
        currentEditor.setValue("");

        var removeGroup = true;
        try
        {
            removeGroup = currentEditor.endEditing(currentTarget, value, cancel);
        }
        catch (exc)
        {
            TraceError.sysout("editor.endEditing FAILS " + exc, exc);
        }

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
            else if (!value && !noRemoveEmpty)
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
            TraceError.sysout("Editor.stopEditing FAILS", exc);
        }

        try
        {
            currentEditor.hide();
        }
        catch (exc)
        {
            TraceError.sysout("editor.hide FAILS", exc);
        }
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
            TraceError.sysout("Editor.save FAILS "+exc, exc);
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
        else if (element.classList.contains("insertBefore"))
            this.insertRow(element, "before");
        else if (element.classList.contains("insertAfter"))
            this.insertRow(element, "after");
        else
            this.startEditing(element);
    },

    tabNextEditor: function()
    {
        if (!currentTarget)
            return;

        // If the value is empty, then jumping to a dependent editor doesn't
        // make sense, so we instead skip out of the group.
        var value = currentEditor.getValue();
        var skipEmptyGroup = (!value && currentGroup && !currentEditor.isEmptyValid(currentTarget));
        var nextEditable = currentTarget;
        do
        {
            nextEditable = skipEmptyGroup
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

        var prevEditable = currentTarget;
        do
        {
            prevEditable = Dom.getPreviousByClass(prevEditable, "editable");
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

        var editable = currentGroup.classList.contains("editable")
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

    getParentWindow: function()
    {
        return currentPanel.panelNode.ownerDocument.defaultView;
    },

    attachListeners: function(editor, context)
    {
        var win = this.getParentWindow();

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

        var win = this.getParentWindow(editor, context, currentTarget);
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
        if (FBTrace.DBG_EDITOR)
        {
            FBTrace.sysout("editor.onBlur; " + currentEditor.enterOnBlur + ", " +
                Dom.isAncestor(event.target, currentEditor.box));
        }

        if (currentEditor.enterOnBlur && Dom.isAncestor(event.target, currentEditor.box))
            this.stopEditing();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Module

    initialize: function()
    {
        this.onResize = Obj.bindFixed(this.onResize, this);
        this.onBlur = Obj.bind(this.onBlur, this);

        Module.initialize.apply(this, arguments);
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

    this.acceptCompletion = function(textBox, adjustData)
    {
        if (!adjustSelectionOnAccept)
            return false;

        var value = textBox.value;
        var offset = textBox.selectionStart;
        var offsetEnd = textBox.selectionEnd;
        if (!candidates || value !== lastValue || offset !== lastOffset || offset >= offsetEnd)
            return false;

        var ind = adjustSelectionOnAccept(value, offsetEnd, adjustData);
        if (ind === null)
            return false;

        Firebug.Editor.update();
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
    while (next && (Dom.isAncestor(next, group) || isGroupInsert(next, parentGroup)));

    return next;
}

function isGroupInsert(next, group)
{
    return (!group || Dom.isAncestor(next, group))
        && (next.classList.contains("insertBefore") || next.classList.contains("insertAfter"));
}

function getNextOutsider(element, group)
{
    return getOutsider(element, group, Obj.bind(Dom.getNextByClass, Dom, "editable"));
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
