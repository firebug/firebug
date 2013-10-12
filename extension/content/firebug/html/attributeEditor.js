/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/xml",
    "firebug/editor/inlineEditor",
    "firebug/html/htmlReps",
],
function(Firebug, Dom, Domplate, Events, Xml, InlineEditor, HTMLReps) {

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

        if (!cancel && value !== previousValue &&
            target.classList.contains("nodeName"))
        {
            // Save changed attribute names here instead of in saveEdit, because otherwise
            // unrelated properties might get discarded.
            var element = Firebug.getRepObject(target);
            if (!element)
                return;

            if (previousValue)
            {
                element.removeAttribute(previousValue);
            }

            if (value)
            {
                var attrValue = Dom.getNextByClass(target, "nodeValue").textContent;
                element.setAttribute(value, attrValue);
            }

            var panel = Firebug.getElementPanel(target);
            Events.dispatch(Firebug.uiListeners, "onObjectChanged", [element, panel]);
        }

        // Remove group unless it is valid for it to be empty.
        return !this.emptyIsValid(target);
    },

    emptyIsValid: function(target)
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
        else if (target.classList.contains("nodeValue"))
        {
            var attrName = Dom.getPreviousByClass(target, "nodeName").textContent;
            return Xml.getValuesForAttribute(nodeType, tagName, attrName);
        }
    },

    autoCompleteAdjustSelection: function(value, offset)
    {
        if (offset >= 2 && value.substr(offset-2, 2) === "()")
            return offset-1;
        return offset;
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
