/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/xml",
    "firebug/editor/inlineEditor",
    "firebug/html/htmlReps",
],
function(Firebug, Css, Dom, Domplate, Events, Xml, InlineEditor, HTMLReps) {

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

        if (Css.hasClass(target, "nodeName"))
        {
            // For HTML elements, make the attribute name into lower case to match
            // what it gets normalized to by the browser - otherwise we will be
            // fooled into thinking that an extra attribute has appeared (issue 6996).
            if (Xml.isElementHTML(element))
                value = value.toLowerCase();

            if (value != previousValue)
                element.removeAttribute(previousValue);

            if (value)
            {
                var attrValue = Dom.getNextByClass(target, "nodeValue").textContent;
                element.setAttribute(value, attrValue);
            }
            else
            {
                element.removeAttribute(value);
            }
        }
        else if (Css.hasClass(target, "nodeValue"))
        {
            var attrName = Dom.getPreviousByClass(target, "nodeName").textContent;
            element.setAttribute(attrName, value);
        }

        target.textContent = value;

        var panel = Firebug.getElementPanel(target);
        Events.dispatch(Firebug.uiListeners, "onObjectChanged", [element, panel]);

        //this.panel.markChange();
    },

    advanceToNext: function(target, charCode)
    {
        if (charCode == 61 /* '=' */ && Css.hasClass(target, "nodeName"))
        {
            return true;
        }
        else if ((charCode == 34 /* '"' */ || charCode == 39 /* ''' */) &&
            Css.hasClass(target, "nodeValue"))
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
            if (Css.hasClass(target, "nodeValue"))
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
