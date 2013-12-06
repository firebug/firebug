/* See license.txt for terms of usage */
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/xml",
    "firebug/css/autoCompleter",
    "firebug/editor/editor",
    "firebug/editor/inlineEditor",
    "firebug/html/htmlReps",
],
function(Firebug, Dom, Domplate, Events, Xml, CSSAutoCompleter, Editor, InlineEditor, HTMLReps) {

"use strict";

// ********************************************************************************************* //
// AttributeEditor

function AttributeEditor(doc)
{
    this.initializeInline(doc);
}

AttributeEditor.prototype = Domplate.domplate(InlineEditor.prototype,
{
    saveEdit: function(target, value, previousValue)
    {
        var element = Firebug.getRepObject(target);
        if (!element)
            return;

        // For HTML elements, make the attribute name into lower case to match
        // what it gets normalized to by the browser - otherwise we will be
        // fooled into thinking that an extra attribute has appeared (issue 6996).
        if (target.classList.contains("nodeName") && Xml.isElementHTML(element))
            value = value.toLowerCase();

        target.textContent = value;

        // Note: attribute name changes are saved in endEditing, to prevent overwriting
        // existing attributes.

        if (target.classList.contains("nodeValue") && value !== previousValue)
        {
            var attrName = Dom.getPreviousByClass(target, "nodeName").textContent;
            element.setAttribute(attrName, value);

            var panel = Firebug.getElementPanel(target);
            Events.dispatch(Firebug.uiListeners, "onObjectChanged", [element, panel]);
        }
    },

    beginEditing: function(target, value)
    {
        this.initialValue = value;
    },

    endEditing: function(target, value, cancel)
    {
        var previousValue = this.initialValue;
        delete this.initialValue;

        if (!cancel && value !== previousValue)
        {
            var element = Firebug.getRepObject(target);
            if (!element)
                return;

            if (target.classList.contains("nodeName"))
            {
                // Save changed attribute names here instead of in saveEdit, because otherwise
                // unrelated properties might get discarded.
                if (previousValue)
                    element.removeAttribute(previousValue);

                if (value)
                {
                    var attrValue = Dom.getNextByClass(target, "nodeValue").textContent;
                    element.setAttribute(value, attrValue);
                }

                var panel = Firebug.getElementPanel(target);
                Events.dispatch(Firebug.uiListeners, "onObjectChanged", [element, panel]);
            }
            else
            {
                var attrName = Dom.getPreviousByClass(target, "nodeName").textContent;
                if (attrName === "style" && value.endsWith("; "))
                {
                    value = value.slice(0, -1);
                    this.input.value = value;
                    element.setAttribute(attrName, value);
                }
            }
        }

        // Remove group unless it is valid for it to be empty.
        return !this.isEmptyValid(target);
    },

    isEmptyValid: function(target)
    {
        return target.classList.contains("nodeValue");
    },

    advanceToNext: function(target, charCode)
    {
        if (charCode == 61 /* '=' */ && target.classList.contains("nodeName"))
        {
            return true;
        }
        else if ((charCode == 34 /* '"' */ || charCode == 39 /* ''' */) &&
            target.classList.contains("nodeValue"))
        {
            var nonRestrictiveAttributes =
            [
                "onabort",
                "onblur",
                "onchange",
                "onclick",
                "ondblclick",
                "onerror",
                "onfocus",
                "onkeydown",
                "onkeypress",
                "onkeyup",
                "onload",
                "onmousedown",
                "onmousemove",
                "onmouseout",
                "onmouseover",
                "onmouseup",
                "onreset",
                "onselect",
                "onsubmit",
                "onunload",
                "title",
                "alt",
                "style"
            ];

            var attrName = Dom.getPreviousByClass(target, "nodeName").textContent;

            // This should cover most of the cases where quotes are allowed inside the value
            // See issue 4542
            for (var i = 0; i < nonRestrictiveAttributes.length; i++)
            {
                if (attrName == nonRestrictiveAttributes[i])
                    return false;
            }
            return true;
        }
    },

    isInStyleAttrValue: function()
    {
        var target = this.target;
        if (!target.classList.contains("nodeValue"))
            return false;
        var attrName = Dom.getPreviousByClass(target, "nodeName").textContent;
        return (attrName === "style");
    },

    getAutoCompleteRange: function(value, offset)
    {
        if (!this.isInStyleAttrValue())
            return null;

        var propNameIndex = offset ? value.lastIndexOf(";", offset-1) + 1 : 0;
        var propValueIndex = offset ? value.lastIndexOf(":", offset-1) + 1 : 0;
        while (propValueIndex < value.length && value.charAt(propValueIndex) === " ")
            propValueIndex++;
        while (propNameIndex < value.length && value.charAt(propNameIndex) === " ")
            propNameIndex++;

        if (propValueIndex > propNameIndex)
        {
            // Auto-complete a property value.
            var propName = value.slice(propNameIndex).replace(/:.*/, "").trim();
            var start = propValueIndex;
            var end = value.indexOf(";", propValueIndex);
            if (end === -1)
                end = value.length;

            var propValue = value.slice(start, end);
            var subRange = CSSAutoCompleter.getPropertyRange(propName, propValue,
                offset - start);
            if (!subRange)
                subRange = {start: 0, end: propValue.length};
            start = propValueIndex + subRange.start;
            end = propValueIndex + subRange.end;

            return {
                start: start,
                end: end,
                type: "value",
                propName: propName,
                subRange: subRange
            };
        }
        else
        {
            // Auto-complete a property name.
            var end = value.indexOf(":", propNameIndex);
            if (end === -1)
                end = value.length;
            return {start: propNameIndex, end: end, type: "name"};
        }
    },

    getAutoCompletePropSeparator: function(range, expr, prefixOf)
    {
        if (!this.isInStyleAttrValue())
            return null;
        if (range.type === "name")
        {
            if (prefixOf.charAt(0) === ";")
                return ": ";
            else
                return ": ; ";
        }
        else
        {
            return CSSAutoCompleter.getValuePropSeparator(range.propName, range.subRange);
        }
    },

    getAutoCompleteList: function(preExpr, expr, postExpr, range, cycle, context, out)
    {
        var target = this.target;
        var element = Firebug.getRepObject(target);
        if (!element)
            return;

        var nodeType = Xml.getElementSimpleType(element);
        var tagName = element.localName;
        if (target.classList.contains("nodeName"))
        {
            var list = Xml.getAttributesForTagName(nodeType, tagName);
            var initialValue = this.initialValue;
            return list.filter(function(name)
            {
                return (name === initialValue || !element.hasAttribute(name));
            });
        }
        else if (this.isInStyleAttrValue())
        {
            if (range.type === "name")
            {
                return CSSAutoCompleter.autoCompletePropertyName(nodeType, expr, cycle, out);
            }
            else
            {
                var pre = preExpr.slice(preExpr.lastIndexOf(":") + 1).trim();
                var postInd = postExpr.indexOf(";");
                var post = (postInd === -1 ? postExpr : postExpr.slice(0, postInd));
                return CSSAutoCompleter.autoCompletePropertyValue(nodeType, range.propName,
                    pre, expr, post, range.subRange, cycle, context, out);
            }
        }
        else if (target.classList.contains("nodeValue"))
        {
            var attrName = Dom.getPreviousByClass(target, "nodeName").textContent;
            return Xml.getValuesForAttribute(nodeType, tagName, attrName);
        }
    },

    autoCompleteAdjustSelection: function(value, offset, data)
    {
        // For CSS, and some SVG attribute values, jump into function parameter lists.
        if (offset >= 2 && value.substr(offset - 2, 2) === "()")
            return offset - 1;

        if (!this.isInStyleAttrValue())
            return offset;

        // In the case "prop|:", accepting the completion should jump directly into
        // the property value (skipping the colons).
        if (offset < value.length && value.substr(offset, 2) === ":")
            value = this.input.value = value + " ";
        if (offset < value.length && value.substr(offset, 2) === ": ")
            return offset + 2;

        // When accepting the completion, except by right arrow key (which should
        // work only within the property value), skip past semicolons and possibly
        // add a new separator (colon/semicolon, depending on which part we are in).
        if (data === "styleadvance")
        {
            if (offset < value.length && value.substr(offset, 2) === ";")
                value = this.input.value = value + " ";
            if (offset < value.length && value.substr(offset, 2) === "; ")
                return offset + 2;
            if (offset === value.length)
            {
                var propNameIndex = value.lastIndexOf(";");
                var propValueIndex = value.lastIndexOf(":");
                var endingChar = (propValueIndex > propNameIndex ? ";" : ":");
                this.input.value = value + endingChar + " ";
                return offset + 2;
            }
        }
        return offset;
    },

    handleStyleAttrKeyPress: function(event)
    {
        var inputField = this.input;
        var value = inputField.value;
        var offset = inputField.selectionStart;
        var hasSelection = (offset != inputField.selectionEnd);

        var propNameIndex = offset ? value.lastIndexOf(";", offset-1) + 1 : 0;
        var propValueIndex = offset ? value.lastIndexOf(":", offset-1) + 1 : 0;
        var inValue = (propValueIndex > propNameIndex);

        // Compute which one of ; (59) and : (58) should advance to the next
        // field (depending on whether we are in a value or a name).
        var advanceChar = (inValue ? 59 : 58);
        var advanceByChar = (event.charCode === advanceChar);

        if (advanceByChar)
        {
            if (this.getAutoCompleter().acceptCompletion(inputField, "styleadvance"))
                return true;
            if (!hasSelection && value.charCodeAt(offset) === advanceChar)
            {
                // Make ; advance past a ; already there.
                inputField.setSelectionRange(offset + 2, offset + 2);
                return true;
            }
        }
        else if (event.keyCode === KeyEvent.DOM_VK_TAB ||
            event.keyCode === KeyEvent.DOM_VK_RETURN)
        {
            if (this.getAutoCompleter().acceptCompletion(inputField, "styleadvance"))
                return true;
            if (!hasSelection && !inValue && value.slice(propNameIndex, offset).trim())
            {
                // Make <tab> advance from name to value.
                var ind = this.autoCompleteAdjustSelection(value, offset,
                    "styleadvance");
                if (ind !== null)
                {
                    inputField.setSelectionRange(ind, ind);
                    Editor.update();
                    return true;
                }
            }
        }
        return false;
    },

    onKeyPress: function(event)
    {
        if (this.isInStyleAttrValue())
        {
            var handled = this.handleStyleAttrKeyPress(event);
            if (handled)
                Events.cancelEvent(event);
        }
        InlineEditor.prototype.onKeyPress.call(this, event);
    },

    insertNewRow: function(target, insertWhere)
    {
        var emptyAttr = {name: "", value: ""};
        var sibling = insertWhere == "before" ? target.previousSibling : target;
        return HTMLReps.AttrTag.insertAfter({attr: emptyAttr}, sibling);
    },

    getInitialValue: function(target, value)
    {
        if (!value)
            return value;

        var element = Firebug.getRepObject(target);
        if (element && element instanceof window.Element)
        {
            // If object that was clicked to edit was
            // attribute value, not attribute name.
            if (target.classList.contains("nodeValue"))
            {
                var attributeName = Dom.getPreviousByClass(target, "nodeName").textContent;
                return element.getAttribute(attributeName);
            }
        }
        return value;
    }
});

// ********************************************************************************************* //
// Registration

return AttributeEditor;

// ********************************************************************************************* //
});
