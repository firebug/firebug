/* See license.txt for terms of usage */
/*jshint unused:false*/
/*global Components:1, define:1, KeyEvent:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/chrome/menu",
    "firebug/editor/baseEditor",
    "firebug/editor/editor",
],
function(Firebug, FBTrace, Domplate, Events, Css, Dom, Str, Menu, BaseEditor, Editor) {

// ********************************************************************************************* //
// Constants

var {domplate, DIV, SPAN, INPUT} = Domplate;

var Ci = Components.interfaces;

var Trace = FBTrace.to("DBG_EDITOR");

// ********************************************************************************************* //
// InlineEditor

function InlineEditor(doc)
{
    this.initializeInline(doc);
}

InlineEditor.prototype = domplate(BaseEditor,
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
        Trace.sysout("InlineEditor.show",
            {target: target, panel: panel, value: value, selectionData: selectionData});

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
        Trace.sysout("InlineEditor.hide");

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

        this.target = null;
        this.panel = null;
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
        Trace.sysout("InlineEditor.endEditing",
            {target: target, value: value, cancel: cancel});

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
                this.getAutoCompleteRange.bind(this),
                this.getAutoCompleteList.bind(this),
                this.getAutoCompletePropSeparator.bind(this),
                this.autoCompleteAdjustSelection.bind(this));
        }

        return this.autoCompleter;
    },

    completeValue: function(amt)
    {
        if (this.getAutoCompleter().complete(this.panel.context, this.input, amt, true))
            Editor.update(true);
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

        Editor.update(true);
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
            Editor.tabNextEditor();
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
            this.getAutoCompleter().complete(this.panel.context, this.input, 0, false);
        else
            this.getAutoCompleter().reset();

        Editor.update();
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

            if (clR.length <= 1)
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
            else if (clR.length > 3)
            {
                this.wrapped = true;
            }

            var fixupL = 0, fixupT = 0;
            if (this.wrapped)
            {
                fixupL = clR[1].left - clR[0].left;
                fixupT = clR[1].top - clR[0].top;
            }
            else
            {
                var approxTextWidth = this.textSize.width;
                // Make the input one character wider than the text value so that
                // typing does not ever cause the textbox to scroll
                var charWidth = this.measureInputText('m').width;

                // Sometimes we need to make the editor a little wider, specifically when
                // an overflow happens, otherwise it will scroll off some text on the left
                if (extraWidth)
                    charWidth *= extraWidth;

                inputWidth = approxTextWidth + charWidth;
            }

            var container = this.panel.panelNode;
            var maxWidth = container.clientWidth - this.targetOffset.x - fixupL +
                container.scrollLeft-6;

            if (inputWidth > maxWidth)
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

// ********************************************************************************************* //
// Registration

Firebug.InlineEditor = InlineEditor;

return InlineEditor;

// ********************************************************************************************* //
});
