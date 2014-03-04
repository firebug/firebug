/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/string",
    "firebug/lib/xml",
    "firebug/editor/inlineEditor"
],
function(Firebug, Str, Xml, InlineEditor) {

"use strict";

// ******************************************************************************************** //
// TextNodeEditor

 /**
  * TextNodeEditor deals with text nodes that do and do not have sibling elements. If
  * there are no sibling elements, the parent is known as a TextElement. In other cases
  * we keep track of their position via a range (this is in part because as HTML is typed
  * the range will keep track of the text nodes and elements that the user is creating.
  * And this range could be in the middle of the parent element's children).
  */
 function TextNodeEditor(doc)
 {
     this.initializeInline(doc);
 }

 TextNodeEditor.prototype = domplate(InlineEditor.prototype,
 {
     getInitialValue: function(target, value)
     {
         // The text displayed within the HTML panel can be shortened if the 'Show Full Text'
         // option is false, so get the original textContent from the associated page element
         // (issue 2183).
         var repObject = Firebug.getRepObject(target);
         if (repObject)
             return repObject.textContent;

         return value;
     },

     beginEditing: function(target, value)
     {
         var node = Firebug.getRepObject(target);
         if (!node || node instanceof window.Element)
             return;

         var document = node.ownerDocument;
         this.range = document.createRange();
         this.range.setStartBefore(node);
         this.range.setEndAfter(node);
     },

     endEditing: function(target, value, cancel)
     {
         if (this.range)
         {
             this.range.detach();
             delete this.range;
         }

         // Remove empty groups by default
         return true;
     },

     saveEdit: function(target, value, previousValue)
     {
         var node = Firebug.getRepObject(target);
         if (!node)
             return;

         value = Str.unescapeForTextNode(value || "");
         target.textContent = value;

         if (node instanceof window.Element)
         {
             if (Xml.isElementMathML(node) || Xml.isElementSVG(node))
                 node.textContent = value;
             else
                 node.innerHTML = value;
         }
         else
         {
             try
             {
                 var documentFragment = this.range.createContextualFragment(value);
                 var cnl = documentFragment.childNodes.length;
                 this.range.deleteContents();
                 this.range.insertNode(documentFragment);
                 var r = this.range, sc = r.startContainer, so = r.startOffset;
                 this.range.setEnd(sc,so+cnl);
             }
             catch (e)
             {
                 if (FBTrace.DBG_ERRORS)
                     FBTrace.sysout("TextNodeEditor.saveEdit; EXCEPTION " + e, e);
             }
         }
     }
 });

// ********************************************************************************************* //
// Registration

return TextNodeEditor;

// ********************************************************************************************* //
});
