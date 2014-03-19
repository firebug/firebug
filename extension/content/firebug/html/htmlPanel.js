/* See license.txt for terms of usage */
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/chrome/panel",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/html/attributeEditor",
    "firebug/html/htmlEditor",
    "firebug/html/htmlLib",
    "firebug/html/htmlModule",
    "firebug/html/htmlReps",
    "firebug/html/textDataEditor",
    "firebug/html/textNodeEditor",
    "firebug/lib/events",
    "firebug/debugger/script/sourceLink",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/chrome/window",
    "firebug/lib/options",
    "firebug/lib/string",
    "firebug/lib/xml",
    "firebug/lib/array",
    "firebug/lib/persist",
    "firebug/chrome/menu",
    "firebug/lib/url",
    "firebug/css/cssModule",
    "firebug/css/cssReps",
    "firebug/css/selectorEditor",
    "firebug/editor/baseEditor",
    "firebug/editor/editor",
    "firebug/editor/inlineEditor",
    "firebug/chrome/searchBox",
    "firebug/html/insideOutBox",
    "firebug/html/inspector",
    "firebug/html/layout"
],
function(Firebug, FBTrace, Panel, Obj, Domplate, Locale, AttributeEditor, HTMLEditor, HTMLLib,
    HTMLModule, HTMLReps, TextDataEditor, TextNodeEditor, Events, SourceLink, Css, Dom, Win,
    Options, Str, Xml, Arr, Persist, Menu, Url, CSSModule, CSSReps, CSSSelectorEditor,
    BaseEditor, Editor, InlineEditor, SearchBox, InsideOutBox, Inspector) {

// ********************************************************************************************* //
// Constants

var {domplate, DIV, TEXTAREA} = Domplate;

var KeyEvent = window.KeyEvent;

// ********************************************************************************************* //

Firebug.HTMLPanel = function() {};

var WalkingPanel = Obj.extend(Panel, HTMLLib.ElementWalkerFunctions);

Firebug.HTMLPanel.prototype = Obj.extend(WalkingPanel,
{
    inspectable: true,

    toggleEditing: function()
    {
        if (this.editing)
            this.stopEditing();
        else
            this.editNode(this.selection);
    },

    stopEditing: function()
    {
        Editor.stopEditing();
    },

    isEditing: function()
    {
        var editButton = Firebug.chrome.$("fbToggleHTMLEditing");
        return (this.editing && editButton.getAttribute("checked") === "true");
    },

    // Update the Edit button to reflect editability of the selection
    setEditEnableState: function(ignoreEditing)
    {
        var editButton = Firebug.chrome.$("fbToggleHTMLEditing");
        editButton.disabled = (this.selection && (!this.isEditing() || ignoreEditing) &&
            Css.nonEditableTags.hasOwnProperty(this.selection.localName));
    },

    resetSearch: function()
    {
        delete this.lastSearch;
    },

    select: function(object, forceUpdate, noEditChange)
    {
        if (!object)
            object = this.getDefaultSelection();

        if (FBTrace.DBG_PANELS)
        {
            FBTrace.sysout("firebug.select " + this.name + " forceUpdate: " + forceUpdate + " " +
                object + ((object == this.selection) ? "==" : "!=") + this.selection);
        }

        if (forceUpdate || object != this.selection)
        {
            this.selection = object;
            this.updateSelection(object);

            this.setEditEnableState();

            // Distribute selection change further to listeners.
            Events.dispatch(Firebug.uiListeners, "onObjectSelected", [object, this]);

            // If the 'free text' edit mode is active change the current markup
            // displayed in the editor so that it corresponds to the current
            // selection. This typically happens when the user clicks on object-status-path
            // buttons in the toolbar.
            // For the case when the selection is changed from within the editor, don't
            // change the edited element.
            if (this.isEditing() && !noEditChange)
                this.editNode(object);
        }
    },

    selectNext: function()
    {
        var objectBox = this.ioBox.createObjectBox(this.selection);
        var next = this.ioBox.getNextObjectBox(objectBox);
        if (next)
        {
            this.select(next.repObject);

            if (Inspector.inspecting)
                Inspector.inspectNode(next.repObject);
        }
    },

    selectPrevious: function()
    {
        var objectBox = this.ioBox.createObjectBox(this.selection);
        var previous = this.ioBox.getPreviousObjectBox(objectBox);
        if (previous)
        {
            this.select(previous.repObject);

            if (Inspector.inspecting)
                Inspector.inspectNode(previous.repObject);
        }
    },

    selectNodeBy: function(dir)
    {
        if (dir == "up")
        {
            this.selectPrevious();
        }
        else if (dir == "down")
        {
            this.selectNext();
        }
        else if (dir == "left")
        {
            var box = this.ioBox.createObjectBox(this.selection);
            if (Css.hasClass(box, "open"))
            {
                this.ioBox.contractObjectBox(box);
            }
            else
            {
                var parentBox = this.ioBox.getParentObjectBox(box);
                if (parentBox && parentBox.repObject instanceof window.Element)
                    this.select(parentBox.repObject);
            }
        }
        else if (dir == "right")
        {
            var box = this.ioBox.createObjectBox(this.selection);
            if (!Css.hasClass(box, "open"))
                this.ioBox.expandObject(this.selection);
            else
                this.selectNext();
        }

        Inspector.highlightObject(this.selection, this.context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    editNewAttribute: function(elt)
    {
        var objectNodeBox = this.ioBox.findObjectBox(elt);
        if (objectNodeBox)
        {
            var labelBox = objectNodeBox.querySelector("*> .nodeLabel > .nodeLabelBox");
            var bracketBox = labelBox.querySelector("*> .nodeBracket");
            Editor.insertRow(bracketBox, "before");
        }
    },

    editAttribute: function(elt, attrName)
    {
        var objectNodeBox = this.ioBox.findObjectBox(elt);
        if (objectNodeBox)
        {
            var attrBox = HTMLLib.findNodeAttrBox(objectNodeBox, attrName);
            if (attrBox)
            {
                var attrValueBox = attrBox.childNodes[3];
                var value = elt.getAttribute(attrName);
                Editor.startEditing(attrValueBox, value);
            }
        }
    },

    deleteAttribute: function(elt, attrName)
    {
        HTMLModule.deleteAttribute(elt, attrName, this.context);
    },

    localEditors:{}, // instantiated editor cache
    editNode: function(node)
    {
        var objectNodeBox = this.ioBox.findObjectBox(node);
        if (objectNodeBox)
        {
            var type = Xml.getElementType(node);
            var editor = this.localEditors[type];
            if (!editor)
            {
                // look for special purpose editor (inserted by an extension),
                // otherwise use our html editor
                var SpecializedEditor = Firebug.HTMLPanel.Editors[type] ||
                    Firebug.HTMLPanel.Editors.html;
                editor = this.localEditors[type] = new SpecializedEditor(this.document);
            }

            this.startEditingNode(node, objectNodeBox, editor, type);
        }
    },

    startEditingNode: function(node, box, editor, type)
    {
        if (type === "html" || type === "xhtml")
            this.startEditingHTMLNode(node, box, editor);
        else
            this.startEditingXMLNode(node, box, editor);
    },

    startEditingXMLNode: function(node, box, editor)
    {
        var xml = Xml.getElementXML(node);
        Editor.startEditing(box, xml, editor);
    },

    startEditingHTMLNode: function(node, box, editor)
    {
        if (Css.nonEditableTags.hasOwnProperty(node.localName))
            return;

        Editor.stopEditing();

        editor.innerEditMode = node.localName in Css.innerEditableTags;
        if (!Dom.isAttached(node))
        {
            // For detached nodes, editing HTML around the node is impossible
            // (document.createRange throws). Enter inner edit mode instead.
            editor.innerEditMode = true;
        }

        var html = editor.innerEditMode ? node.innerHTML : Xml.getElementHTML(node);
        html = Str.escapeForHtmlEditor(html);

        Editor.startEditing(box, html, editor);
    },

    deleteNode: function(node, dir)
    {
        var box = this.ioBox.createObjectBox(node);
        if (Css.hasClass(box, "open"))
            this.ioBox.contractObjectBox(box);

        if (dir === "up")
        {
            // We want a "backspace"-like behavior, including traversing parents.
            this.selectPrevious();
        }
        else
        {
            // Move to the next sibling if there is one, else backwards.
            var nextSelection = this.ioBox.getNextSiblingObjectBox(box);
            if (nextSelection)
                this.select(nextSelection.repObject);
            else
                this.selectPrevious();
        }

        HTMLModule.deleteNode(node, this.context);

        Inspector.highlightObject(this.selection, this.context);
    },

    toggleAll: function(event, node)
    {
        var expandExternalContentNodes = Events.isShift(event);
        this.ioBox.toggleObject(node, true, expandExternalContentNodes ?
            null : ["link", "script", "style"]);
    },

    updateNodeVisibility: function(node)
    {
        var wasHidden = node.classList.contains("nodeHidden");
        if (!Xml.isVisible(node.repObject))
        {
            // Hide this node and, through CSS, every descendant.
            node.classList.add("nodeHidden");
        }
        else if (wasHidden)
        {
            // The node has changed state from hidden to shown. While in the
            // hidden state, some descendants may have been explicitly marked
            // with .nodeHidden (not just through CSS inheritance), so we need
            // to recheck the visibility of those.
            node.classList.remove("nodeHidden");
            var desc = Arr.cloneArray(node.getElementsByClassName("nodeHidden"));
            for (var i = 0; i < desc.length; ++i)
            {
                if (Xml.isVisible(desc[i].repObject))
                    desc[i].classList.remove("nodeHidden");
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    getElementSourceText: function(node)
    {
        if (this.sourceElements)
        {
            var index = this.sourceElementNodes.indexOf(node);
            if (index != -1)
                return this.sourceElements[index];
        }

        var lines;

        var url = HTMLLib.getSourceHref(node);
        if (url)
        {
            lines = this.context.sourceCache.load(url);
        }
        else
        {
            var text = HTMLLib.getSourceText(node);
            lines = Str.splitLines(text);
        }

        var sourceElt = new HTMLReps.SourceText(lines, node);

        if (!this.sourceElements)
        {
            this.sourceElements =  [sourceElt];
            this.sourceElementNodes = [node];
        }
        else
        {
            this.sourceElements.push(sourceElt);
            this.sourceElementNodes.push(node);
        }

        return sourceElt;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    registerMutationListeners: function(win)
    {
        var context = this.context;
        if (!context.registeredHTMLMutationObservers)
            context.registeredHTMLMutationObservers = new WeakMap();

        var self = this;
        function addObserver(win)
        {
            var doc = win.document;
            if (context.registeredHTMLMutationObservers.has(doc))
                return;

            // xxxHonza: an iframe doesn't have to be loaded yet, so do not
            // register mutation observers in such cases since they wouldn't
            // be removed.
            // The listeners can be registered later in watchWindowDelayed,
            // but it's also risky. Mutation observers should be registered
            // at the moment when it's clear that the window/frame has been
            // loaded.

            // This breaks HTML panel for about:blank pages (see issue 5120).
            //if (doc.location == "about:blank")
            //    return;

            var observer = new MutationObserver(self.onMutationObserve);
            observer.observe(doc, {
                attributes: true,
                childList: true,
                characterData: true,
                subtree: true
            });
            context.registeredHTMLMutationObservers.set(doc, observer);
        }

        // If a window is specified use it, otherwise register observers for all
        // context windows (including the main window and all embedded iframes).
        if (win)
            addObserver(win);
        else
            Win.iterateWindows(this.context.window, addObserver);

        this.registerMutationBreakpointListeners(win);
    },

    unregisterMutationListeners: function(win)
    {
        this.unregisterMutationBreakpointListeners(win);

        var context = this.context;
        if (!context.registeredHTMLMutationObservers)
            return;

        function removeObserver(win)
        {
            var doc = win.document;
            var observer = context.registeredHTMLMutationObservers.get(doc);
            if (!observer)
                return;

            observer.disconnect();
            context.registeredHTMLMutationObservers.delete(doc);
        }

        if (win)
            removeObserver(win);
        else
            Win.iterateWindows(context.window, removeObserver);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    registerMutationBreakpointListeners: function(win)
    {
        var context = this.context;
        if (!context.mutationBreakpointListenersEnabled)
            return;

        if (!context.registeredHTMLMutationEvents)
            context.registeredHTMLMutationEvents = new WeakMap();

        var self = this;
        function addListeners(win)
        {
            var doc = win.document;
            if (context.registeredHTMLMutationEvents.has(doc))
                return;
            context.registeredHTMLMutationEvents.set(doc, 1);

            // (See also the changes in registerMutationListeners's addObserver)
            Events.addEventListener(doc, "DOMAttrModified", self.onMutateAttr, false);
            Events.addEventListener(doc, "DOMCharacterDataModified", self.onMutateText, false);
            Events.addEventListener(doc, "DOMNodeInserted", self.onMutateNode, false);
            Events.addEventListener(doc, "DOMNodeRemoved", self.onMutateNode, false);
        }

        if (win)
            addListeners(win);
        else
            Win.iterateWindows(context.window, addListeners);
    },

    unregisterMutationBreakpointListeners: function(win)
    {
        var context = this.context;
        if (!context.mutationBreakpointListenersEnabled)
            return;

        if (!context.registeredHTMLMutationEvents)
            return;

        var self = this;
        function removeListeners(win)
        {
            var doc = win.document;
            if (!context.registeredHTMLMutationEvents.has(doc))
                return;
            context.registeredHTMLMutationEvents.delete(doc);

            Events.removeEventListener(doc, "DOMAttrModified", self.onMutateAttr, false);
            Events.removeEventListener(doc, "DOMCharacterDataModified", self.onMutateText, false);
            Events.removeEventListener(doc, "DOMNodeInserted", self.onMutateNode, false);
            Events.removeEventListener(doc, "DOMNodeRemoved", self.onMutateNode, false);
        }

        if (win)
            removeListeners(win);
        else
            Win.iterateWindows(context.window, removeListeners);
    },

    updateMutationBreakpointListeners: function()
    {
        var context = this.context;
        var isEnabled = !!context.mutationBreakpointListenersEnabled;
        var shouldEnable = this.shouldBreakOnNext() ||
            context.mutationBreakpoints.hasEnabledBreakpoints();
        if (isEnabled === shouldEnable)
            return;
        if (shouldEnable)
        {
            context.mutationBreakpointListenersEnabled = true;
            this.registerMutationBreakpointListeners();
        }
        else
        {
            this.unregisterMutationBreakpointListeners();
            context.mutationBreakpointListenersEnabled = false;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    mutateAttr: function(target, attrName, attrValue, removal)
    {
        // Due to the delay call this may or may not exist in the tree anymore
        if (!this.ioBox.isInExistingRoot(target))
        {
            if (FBTrace.DBG_HTML)
                FBTrace.sysout("mutateAttr: different tree " + target, target);
            return;
        }

        if (FBTrace.DBG_HTML)
        {
            FBTrace.sysout("html.mutateAttr target:" + target + " attrName:" + attrName +
                " attrValue: " + attrValue + " removal: " + removal, target);
        }

        this.markChange();

        var objectNodeBox = Firebug.scrollToMutations || Firebug.expandMutations ?
            this.ioBox.createObjectBox(target) : this.ioBox.findObjectBox(target);

        if (!objectNodeBox)
            return;

        this.updateNodeVisibility(objectNodeBox);

        if (!removal)
        {
            var nodeAttr = HTMLLib.findNodeAttrBox(objectNodeBox, attrName);

            if (FBTrace.DBG_HTML)
                FBTrace.sysout("mutateAttr " + removal + " " + attrName + "=" + attrValue +
                    " node: " + nodeAttr, nodeAttr);

            if (nodeAttr && nodeAttr.childNodes.length > 3)
            {
                var attrValueBox = nodeAttr.getElementsByClassName("nodeValue")[0];
                var attrValueText = attrValueBox.firstChild;
                if (attrValueText)
                    attrValueText.nodeValue = attrValue;
                else
                    attrValueBox.textContent = attrValue;

                this.highlightMutation(attrValueBox, objectNodeBox, "mutated");
            }
            else
            {
                var filterAttributeByName = function(attr)
                {
                    return attr.name == attrName;
                };

                var attributes = Array.prototype.slice.call(target.attributes);
                var attr = attributes.filter(filterAttributeByName)[0];

                if (FBTrace.DBG_HTML)
                {
                    FBTrace.sysout("mutateAttr attribute node " + removal + " " + attrName +
                        "=" + attrValue + " node: " + attr, attr);
                }

                if (attr)
                {
                    nodeAttr = Firebug.HTMLPanel.AttrNode.tag.replace({attr: attr},
                        this.document);

                    var labelBox = objectNodeBox.querySelector("*> .nodeLabel > .nodeLabelBox");
                    var bracketBox = labelBox.querySelector("*> .nodeBracket");
                    labelBox.insertBefore(nodeAttr, bracketBox);

                    this.highlightMutation(nodeAttr, objectNodeBox, "mutated");
                }
            }
        }
        else
        {
            var nodeAttr = HTMLLib.findNodeAttrBox(objectNodeBox, attrName);
            if (nodeAttr)
                nodeAttr.parentNode.removeChild(nodeAttr);

            // We want to highlight regardless as the domplate may have been
            // generated after the attribute was removed from the node
            this.highlightMutation(objectNodeBox, objectNodeBox, "mutated");
        }

        Inspector.repaint();
    },

    mutateText: function(target, parent, textValue)
    {
        // Due to the delay call this may or may not exist in the tree anymore
        if (!this.ioBox.isInExistingRoot(target))
        {
            if (FBTrace.DBG_HTML)
                FBTrace.sysout("mutateText: different tree " + target, target);
            return;
        }

        this.markChange();

        var parentNodeBox = Firebug.scrollToMutations || Firebug.expandMutations ?
            this.ioBox.createObjectBox(parent) : this.ioBox.findObjectBox(parent);

        if (!parentNodeBox)
        {
            if (FBTrace.DBG_HTML)
                FBTrace.sysout("html.mutateText failed to update text, parent node " +
                    "box does not exist");
            return;
        }

        if (!Firebug.showFullTextNodes)
            textValue = Str.cropMultipleLines(textValue);

        var parentTag = getNodeBoxTag(parentNodeBox);
        if (parentTag == Firebug.HTMLPanel.TextElement.tag)
        {
            if (FBTrace.DBG_HTML)
                FBTrace.sysout("html.mutateText target: " + target + " parent: " + parent);

            // Rerender the entire parentNodeBox. Proper entity-display logic will
            // be automatically applied according to the preferences.
            var newParentNodeBox = parentTag.replace({object: parentNodeBox.repObject}, this.document);
            if (parentNodeBox.parentNode)
                parentNodeBox.parentNode.replaceChild(newParentNodeBox, parentNodeBox);

            // Reselect if the element was selected before.
            if (this.selection && (!this.selection.parentNode || parent == this.selection))
                this.ioBox.select(parent, true);

            var nodeText = HTMLLib.getTextElementTextBox(newParentNodeBox);
            if (!nodeText.firstChild)
            {
                if (FBTrace.DBG_HTML)
                {
                    FBTrace.sysout("html.mutateText failed to update text, " +
                        "TextElement firstChild does not exist");
                }
                return;
            }

            // Highlight the text box only (not the entire parentNodeBox/element).
            this.highlightMutation(nodeText, newParentNodeBox, "mutated");
        }
        else
        {
            var childBox = this.ioBox.getChildObjectBox(parentNodeBox);
            if (!childBox)
            {
                if (FBTrace.DBG_HTML)
                {
                    FBTrace.sysout("html.mutateText failed to update text, " +
                        "no child object box found");
                }
                return;
            }

            var textNodeBox = this.ioBox.findChildObjectBox(childBox, target);
            if (textNodeBox)
            {
                // structure for comment and cdata. Are there others?
                textNodeBox.firstChild.firstChild.nodeValue = textValue;

                this.highlightMutation(textNodeBox, parentNodeBox, "mutated");
            }
            else if (Firebug.scrollToMutations || Firebug.expandMutations)
            {
                // We are not currently rendered but we are set to highlight
                var objectBox = this.ioBox.createObjectBox(target);
                this.highlightMutation(objectBox, objectBox, "mutated");
            }
        }
    },

    mutateNode: function(target, parent, nextSibling, removal)
    {
        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.mutateNode target:" + target + " parent:" + parent +
                (removal ? "REMOVE" : ""));

        // Due to the delay call this may or may not exist in the tree anymore
        if (!removal && !this.ioBox.isInExistingRoot(target))
        {
            if (FBTrace.DBG_HTML)
                FBTrace.sysout("mutateNode: different tree " + target, target);
            return;
        }

        this.markChange();  // This invalidates the panels for every mutate

        var parentNodeBox = Firebug.scrollToMutations || Firebug.expandMutations
            ? this.ioBox.createObjectBox(parent)
            : this.ioBox.findObjectBox(parent);

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.mutateNode parent:" + parent + " parentNodeBox:" +
                parentNodeBox);

        if (!parentNodeBox)
            return;

        // Ignore whitespace nodes.
        if (!Firebug.showTextNodesWithWhitespace && this.isWhitespaceText(target))
            return;

        var newParentTag = HTMLReps.getNodeTag(parent);
        var oldParentTag = getNodeBoxTag(parentNodeBox);

        var objectBox = null;

        if (newParentTag == oldParentTag)
        {
            if (parentNodeBox.populated)
            {
                if (removal)
                {
                    this.ioBox.removeChildBox(parentNodeBox, target);

                    // Special case for docType.
                    if (target instanceof HTMLHtmlElement)
                        this.ioBox.removeChildBox(parentNodeBox, target.parentNode.doctype);

                    this.highlightMutation(parentNodeBox, parentNodeBox, "mutated");
                }
                else
                {
                    var childBox = this.ioBox.getChildObjectBox(parentNodeBox);

                    var comments = Firebug.showCommentNodes;
                    var whitespaces = Firebug.showTextNodesWithWhitespace;

                    // Get the right next sibling that match following criteria:
                    // 1) It's not a whitespace text node in case 'show whitespaces' is false.
                    // 2) It's not a comment in case 'show comments' is false.
                    // 3) There is a child box already created for it in the HTML panel UI.
                    // The new node will then be inserted before that sibling's child box, or
                    // appended at the end (issue 5255).
                    while (nextSibling && (
                       (!whitespaces && HTMLLib.isWhitespaceText(nextSibling)) ||
                       (!comments && nextSibling instanceof window.Comment) ||
                       (!this.ioBox.findChildObjectBox(childBox, nextSibling))))
                    {
                       nextSibling = this.findNextSibling(nextSibling);
                    }

                    objectBox = nextSibling ?
                        this.ioBox.insertChildBoxBefore(parentNodeBox, target, nextSibling) :
                        this.ioBox.appendChildBox(parentNodeBox, target);

                    // Special case for docType.
                    if (target instanceof HTMLHtmlElement)
                    {
                        this.ioBox.insertChildBoxBefore(parentNodeBox,
                            target.parentNode.doctype, target);
                    }

                    this.highlightMutation(objectBox, objectBox, "mutated");
                }
            }
            else // !parentNodeBox.populated
            {
                var newParentNodeBox = newParentTag.replace({object: parent}, this.document);
                parentNodeBox.parentNode.replaceChild(newParentNodeBox, parentNodeBox);

                if (this.selection && (!this.selection.parentNode || parent == this.selection))
                    this.ioBox.select(parent, true);

                this.highlightMutation(newParentNodeBox, newParentNodeBox, "mutated");

                if (!removal && (Firebug.scrollToMutations || Firebug.expandMutations))
                {
                    objectBox = this.ioBox.createObjectBox(target);
                    this.highlightMutation(objectBox, objectBox, "mutated");
                }
            }
        }
        else // newParentTag != oldParentTag
        {
            var newParentNodeBox = newParentTag.replace({object: parent}, this.document);
            if (parentNodeBox.parentNode)
                parentNodeBox.parentNode.replaceChild(newParentNodeBox, parentNodeBox);

            if (Css.hasClass(parentNodeBox, "open"))
                this.ioBox.toggleObjectBox(newParentNodeBox, true);

            if (this.selection && (!this.selection.parentNode || parent == this.selection))
                this.ioBox.select(parent, true);

            this.highlightMutation(newParentNodeBox, newParentNodeBox, "mutated");

            if (!removal && (Firebug.scrollToMutations || Firebug.expandMutations))
            {
                objectBox = this.ioBox.createObjectBox(target);
                this.highlightMutation(objectBox, objectBox, "mutated");
            }
        }

        if (objectBox && this.selection === target)
            this.ioBox.selectObjectBox(objectBox);
    },

    highlightMutation: function(elt, objectBox, type)
    {
        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.highlightMutation Firebug.highlightMutations:" +
                Firebug.highlightMutations, {elt: elt, objectBox: objectBox, type: type});

        if (!elt)
            return;

        if (Firebug.scrollToMutations || Firebug.expandMutations)
        {
            if (this.context.mutationTimeout)
            {
                this.context.clearTimeout(this.context.mutationTimeout);
                delete this.context.mutationTimeout;
            }

            var ioBox = this.ioBox;
            var panelNode = this.panelNode;

            this.context.mutationTimeout = this.context.setTimeout(function()
            {
                ioBox.openObjectBox(objectBox);

                if (Firebug.scrollToMutations)
                    Dom.scrollIntoCenterView(objectBox, panelNode);
            }, 200);
        }

        if (Firebug.highlightMutations)
            Css.setClassTimed(elt, type, this.context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // InsideOutBoxView implementation

    createObjectBox: function(object, isRoot)
    {
        if (FBTrace.DBG_HTML)
        {
            FBTrace.sysout("html.createObjectBox(" + Css.getElementCSSSelector(object) +
                ", isRoot:" + (isRoot? "true" : "false")+")");
        }

        var tag = HTMLReps.getNodeTag(object);
        if (tag)
            return tag.replace({object: object}, this.document);
    },

    getParentObject: function(node)
    {
        if (node instanceof HTMLReps.SourceText)
            return node.owner;

        var parentNode = this.getParentNode(node);

        // for chromebug to avoid climbing out to browser.xul
        if (node.nodeName == "#document")
            return null;

        //if (FBTrace.DBG_HTML)
        //    FBTrace.sysout("html.getParentObject for "+node.nodeName+" parentNode:"+
        //        Css.getElementCSSSelector(parentNode));

        if (parentNode)
        {
            if (parentNode.nodeType == Node.DOCUMENT_NODE)
            {
                if (parentNode.defaultView)
                {
                    if (parentNode.defaultView == this.context.window)
                        return parentNode;

                    if (FBTrace.DBG_HTML)
                    {
                        FBTrace.sysout("getParentObject; node is document node"+
                            ", frameElement:" + parentNode.defaultView.frameElement);
                    }

                    return parentNode.defaultView.frameElement;
                }
                else
                {
                    var skipParent = this.getEmbedConnection(parentNode);
                    if (FBTrace.DBG_HTML)
                        FBTrace.sysout("getParentObject skipParent:" +
                            (skipParent ? skipParent.nodeName : "none"));

                    if (skipParent)
                        return skipParent;
                    else
                        return null; // parent is document element, but no window at defaultView.
                }
            }
            else if (!parentNode.localName)
            {
                if (FBTrace.DBG_HTML)
                    FBTrace.sysout("getParentObject: null localName must be window, no parentObject");
                return null;
            }
            else
            {
                return parentNode;
            }
        }
        else
        {
            // Documents have no parentNode; Attr, Document, DocumentFragment, Entity,
            // and Notation. top level windows have no parentNode
            if (node && node.nodeType == Node.DOCUMENT_NODE)
            {
                // generally a reference to the window object for the document, however
                // that is not defined in the specification
                if (node.defaultView)
                {
                    var embeddingFrame = node.defaultView.frameElement;
                    if (embeddingFrame)
                        return embeddingFrame.contentDocument;
                }
                else
                {
                    // a Document object without a parentNode or window
                    return null;  // top level has no parent
                }
            }
        }
    },

    setEmbedConnection: function(node, skipChild)
    {
        if (!this.embeddedBrowserParents)
        {
            this.embeddedBrowserParents = [];
            this.embeddedBrowserDocument = [];
        }

        this.embeddedBrowserDocument.push(skipChild);

        // store our adopted child in a side table
        this.embeddedBrowserParents.push(node);

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("Found skipChild " + Css.getElementCSSSelector(skipChild) +
                " for  " + Css.getElementCSSSelector(node) + " with node.contentDocument " +
                node.contentDocument);

        return skipChild;
    },

    getEmbedConnection: function(node)
    {
        if (this.embeddedBrowserParents)
        {
            var index = this.embeddedBrowserParents.indexOf(node);
            if (index !== -1)
                return this.embeddedBrowserDocument[index];
        }
    },

    /**
     * @param: node a DOM node from the Web page
     * @param: index counter for important children, may skip whitespace
     * @param: previousSibling a node from the web page
     */
    getChildObject: function(node, index, previousSibling)
    {
        if (!node)
        {
            FBTrace.sysout("getChildObject: null node");
            return;
        }

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("getChildObject " + node.tagName + " index " + index +
                " previousSibling: " +
                (previousSibling ? Css.getElementCSSSelector(previousSibling) : "null"),
                {node: node, previousSibling:previousSibling});

        if (this.isSourceElement(node))
        {
            if (index == 0)
                return this.getElementSourceText(node);
            else
                return null;  // no siblings of source elements
        }
        else if (node instanceof window.Document)
        {
            if (previousSibling !== null)
                return this.getNextSibling(previousSibling);
            else
                return this.getFirstChild(node);
        }
        else if (node.contentDocument)  // then the node is a frame
        {
            if (index == 0)
            {
                // punch thru and adopt the document node as our child
                var skipChild = node.contentDocument.firstChild;

                // (the node's).(type 9 document).(HTMLElement)
                return this.setEmbedConnection(node, skipChild);
            }
            else if (previousSibling)
            {
                // Next child of a document (after doc-type) is <html>.
                return this.getNextSibling(previousSibling);
            }
        }
        else if (node.getSVGDocument && node.getSVGDocument())  // then the node is a frame
        {
            if (index == 0)
            {
                var skipChild = node.getSVGDocument().documentElement; // unwrap

                // (the node's).(type 9 document).(HTMLElement)
                return this.setEmbedConnection(node, skipChild);
            }
            else
            {
                return null;
            }
        }

        var child;
        if (previousSibling)  // then we are walking
            child = this.getNextSibling(previousSibling);  // may return null, meaning done with iteration.
        else
            child = this.getFirstChild(node); // child is set to at the beginning of an iteration.

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("getChildObject firstChild " + Css.getElementCSSSelector(child) +
                " with Firebug.showTextNodesWithWhitespace " +
                Firebug.showTextNodesWithWhitespace);

        if (Firebug.showTextNodesWithWhitespace)  // then the index is true to the node list
        {
            return child;
        }
        else
        {
            for (; child; child = this.getNextSibling(child))
            {
                if (!this.isWhitespaceText(child))
                    return child;
            }
        }

        return null;  // we have no children worth showing.
    },

    isWhitespaceText: function(node)
    {
        return HTMLLib.isWhitespaceText(node);
    },

    findNextSibling: function (node)
    {
        return HTMLLib.findNextSibling(node);
    },

    isSourceElement: function(element)
    {
        return HTMLLib.isSourceElement(element);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Events

    onMutationObserve: function(records)
    {
        for (var ri = 0; ri < records.length; ++ri)
        {
            var record = records[ri];

            var target = record.target;
            if (Firebug.shouldIgnore(target))
                continue;

            var type = record.type;
            if (type === "attributes")
            {
                var attrName = record.attributeName;
                var newValue = target.getAttribute(attrName);
                var removal = (newValue === null);
                this.context.throttle(this.mutateAttr, this,
                    [target, attrName, newValue, removal]);
            }
            else if (type === "childList")
            {
                var added = record.addedNodes, removed = record.removedNodes;
                if (added.length)
                {
                    var nextSibling = HTMLLib.findNextNodeFrom(record.nextSibling);
                    for (var i = 0; i < added.length; ++i)
                    {
                        var node = added[i];
                        if (Firebug.shouldIgnore(node))
                            continue;
                        this.context.throttle(this.mutateNode, this,
                            [node, target, nextSibling, false]);
                    }
                }
                for (var i = 0; i < removed.length; ++i)
                {
                    var node = removed[i];
                    if (Firebug.shouldIgnore(node))
                        continue;
                    this.context.throttle(this.mutateNode, this,
                        [node, target, null, true]);
                }
            }
            else if (type === "characterData")
            {
                this.context.throttle(this.mutateText, this,
                    [target, target.parentNode, target.data]);
            }
        }
    },

    onMutateAttr: function(event)
    {
        var target = event.target;
        if (Firebug.shouldIgnore(target))
            return;

        HTMLModule.MutationBreakpoints.onMutateAttr(event, this.context);
        this.updateMutationBreakpointListeners();
    },

    onMutateText: function(event)
    {
        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.onMutateText; ", event);

        HTMLModule.MutationBreakpoints.onMutateText(event, this.context);
        this.updateMutationBreakpointListeners();
    },

    onMutateNode: function(event)
    {
        var target = event.target;
        if (Firebug.shouldIgnore(target))
            return;

        HTMLModule.MutationBreakpoints.onMutateNode(event, this.context);
        this.updateMutationBreakpointListeners();
    },

    onClick: function(event)
    {
        if (Events.isLeftClick(event) && Events.isDoubleClick(event))
        {
            // The double-click expands an HTML element, but the user must click
            // on the element itself not on the twisty.
            // The logic should be as follows:
            // - click on the twisty expands/collapses the element
            // - double click on the element name expands/collapses it
            // - click on the element name selects it
            if (!Css.hasClass(event.target, "twisty") && !Css.hasClass(event.target, "nodeLabel"))
                this.toggleNode(event);
        }
        else if (Events.isAltClick(event) && !this.editing)
        {
            var node = Firebug.getRepObject(event.target);
            this.editNode(node);
            this.setEditEnableState();
        }
        else if (Dom.getAncestorByClass(event.target, "nodeBracket"))
        {
            var bracketBox = Dom.getAncestorByClass(event.target, "nodeBracket");
            Editor.insertRow(bracketBox, "before");
        }
    },

    onMouseDown: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        if (Dom.getAncestorByClass(event.target, "nodeTag"))
        {
            var node = Firebug.getRepObject(event.target);
            this.noScrollIntoView = true;
            this.select(node);

            delete this.noScrollIntoView;

            if (Css.hasClass(event.target, "twisty"))
                this.toggleNode(event);
        }
    },

    toggleNode: function(event)
    {
        var node = Firebug.getRepObject(event.target);
        var box = this.ioBox.createObjectBox(node);
        if (!Css.hasClass(box, "open"))
            this.ioBox.expandObject(node);
        else
            this.ioBox.contractObject(this.selection);
    },

    onKeyPress: function(event)
    {
        if (this.editing)
            return;

        var node = this.selection;
        if (!node)
            return;

        // * expands the node with all its children
        // + expands the node
        // - collapses the node
        var ch = String.fromCharCode(event.charCode);
        if (ch == "*")
            this.toggleAll(event, node);

        // Edit the HTML on Ctrl/Meta+E
        if (Events.isControl(event) && ch === "e")
            this.editNode(node);

        if (!Events.noKeyModifiers(event))
          return;

        if (ch == "+")
            this.ioBox.expandObject(node);
        else if (ch == "-")
            this.ioBox.contractObject(node);

        if (event.keyCode == KeyEvent.DOM_VK_UP)
            this.selectNodeBy("up");
        else if (event.keyCode == KeyEvent.DOM_VK_DOWN)
            this.selectNodeBy("down");
        else if (event.keyCode == KeyEvent.DOM_VK_LEFT)
            this.selectNodeBy("left");
        else if (event.keyCode == KeyEvent.DOM_VK_RIGHT)
            this.selectNodeBy("right");
        else if (event.keyCode == KeyEvent.DOM_VK_BACK_SPACE)
        {
            if (!Css.nonDeletableTags.hasOwnProperty(node.localName))
                this.deleteNode(node, "up");
        }
        else if (event.keyCode == KeyEvent.DOM_VK_DELETE)
        {
            if (!Css.nonDeletableTags.hasOwnProperty(node.localName))
                this.deleteNode(node, "down");
        }
        else
            return;

        Events.cancelEvent(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // CSS Listener

    updateVisibilitiesForSelectorInSheet: function(sheet, selector)
    {
        if (!selector)
            return;
        var doc = (sheet && sheet.ownerNode && sheet.ownerNode.ownerDocument);
        if (!doc)
            return;

        var affected = doc.querySelectorAll(selector);
        if (!affected.length || !this.ioBox.isInExistingRoot(affected[0]))
            return;

        for (var i = 0; i < affected.length; ++i)
        {
            var node = this.ioBox.findObjectBox(affected[i]);
            if (node)
                this.updateNodeVisibility(node);
        }
    },

    updateVisibilitiesForRule: function(rule)
    {
        this.updateVisibilitiesForSelectorInSheet(rule.parentStyleSheet, rule.selectorText);
    },

    cssPropAffectsVisibility: function(propName)
    {
        // Pretend that "display" is the only property which affects visibility,
        // which is a half-truth. We could make this more technically correct
        // by unconditionally returning true, but forcing a synchronous reflow
        // and computing offsetWidth/Height on up to every element on the page
        // isn't worth it.
        return (propName === "display");
    },

    cssTextAffectsVisibility: function(cssText)
    {
        return (cssText.indexOf("display:") !== -1);
    },

    onAfterCSSDeleteRule: function(styleSheet, cssText, selector)
    {
        if (this.cssTextAffectsVisibility(cssText))
            this.updateVisibilitiesForSelectorInSheet(styleSheet, selector);
    },

    onCSSInsertRule: function(styleSheet, cssText, ruleIndex)
    {
        if (this.cssTextAffectsVisibility(cssText))
            this.updateVisibilitiesForRule(styleSheet.cssRules[ruleIndex]);
    },

    onCSSSetProperty: function(style, propName, propValue, propPriority, prevValue,
        prevPriority, rule, baseText)
    {
        if (this.cssPropAffectsVisibility(propName))
            this.updateVisibilitiesForRule(rule);
    },

    onCSSRemoveProperty: function(style, propName, prevValue, prevPriority, rule, baseText)
    {
        if (this.cssPropAffectsVisibility(propName))
            this.updateVisibilitiesForRule(rule);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "html",
    searchable: true,
    searchPlaceholder: "search.html.Search_by_text_or_CSS_selector",
    breakable: true,
    dependents: ["css", "computed", "layout", "dom", "domSide", "watch"],
    inspectorHistory: new Array(5),
    enableA11y: true,
    order: 20,

    initialize: function()
    {
        this.onMutationObserve = this.onMutationObserve.bind(this);
        this.onMutateText = this.onMutateText.bind(this);
        this.onMutateAttr = this.onMutateAttr.bind(this);
        this.onMutateNode = this.onMutateNode.bind(this);
        this.onClick = this.onClick.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onKeyPress = this.onKeyPress.bind(this);

        Panel.initialize.apply(this, arguments);
        CSSModule.addListener(this);
    },

    destroy: function(state)
    {
        Persist.persistObjects(this, state);

        Panel.destroy.apply(this, arguments);

        delete this.embeddedBrowserParents;
        delete this.embeddedBrowserDocument;

        // xxxHonza: I don't know why this helps, but it helps to release the
        // page compartment (at least by observing about:memory);
        // Note that inspectorHistory holds references to page elements.
        for (var i=0; i<this.inspectorHistory.length; i++)
            delete this.inspectorHistory[i];
        delete this.inspectorHistory;

        CSSModule.removeListener(this);
        this.unregisterMutationListeners();
    },

    initializeNode: function(oldPanelNode)
    {
        if (!this.ioBox)
            this.ioBox = new InsideOutBox(this, this.panelNode);

        Events.addEventListener(this.panelNode, "click", this.onClick, false);
        Events.addEventListener(this.panelNode, "mousedown", this.onMouseDown, false);

        Panel.initializeNode.apply(this, arguments);
    },

    destroyNode: function()
    {
        Events.removeEventListener(this.panelNode, "click", this.onClick, false);
        Events.removeEventListener(this.panelNode, "mousedown", this.onMouseDown, false);

        Events.removeEventListener(this.panelNode.ownerDocument, "keypress",
            this.onKeyPress, true);

        if (this.ioBox)
        {
            this.ioBox.destroy();
            delete this.ioBox;
        }

        Panel.destroyNode.apply(this, arguments);
    },

    show: function(state)
    {
        this.showToolbarButtons("fbHTMLButtons", true);
        this.showToolbarButtons("fbStatusButtons", true);

        Events.addEventListener(this.panelNode.ownerDocument, "keypress", this.onKeyPress, true);

        if (this.context.loaded)
        {
            this.registerMutationListeners();

            Persist.restoreObjects(this, state);
        }
    },

    hide: function()
    {
        // clear the state that is tracking the infotip so it is reset after next show()
        delete this.infoTipURL;

        Events.removeEventListener(this.panelNode.ownerDocument, "keypress", this.onKeyPress, true);
    },

    watchWindow: function(context, win)
    {
        var self = this;
        setTimeout(function() {
            self.watchWindowDelayed(context, win);
        }, 100);
    },

    watchWindowDelayed: function(context, win)
    {
        if (this.context.window && this.context.window != win)
        {
            // then I guess we are an embedded window
            var htmlPanel = this;
            Win.iterateWindows(this.context.window, function(subwin)
            {
                if (win == subwin)
                {
                    if (FBTrace.DBG_HTML)
                        FBTrace.sysout("html.watchWindow found subwin.location.href="+
                            win.location.href);

                    htmlPanel.mutateDocumentEmbedded(win, false);
                }
            });
        }

        this.registerMutationListeners(win);
    },

    unwatchWindow: function(context, win)
    {
        if (this.context.window && this.context.window != win)
        {
            // then I guess we are an embedded window
            var htmlPanel = this;
            Win.iterateWindows(this.context.window, function(subwin)
            {
                if (win == subwin)
                {
                    if (FBTrace.DBG_HTML)
                        FBTrace.sysout("html.unwatchWindow found subwin.location.href="+
                            win.location.href);

                    htmlPanel.mutateDocumentEmbedded(win, true);
                }
            });
        }

        this.unregisterMutationListeners(win);
    },

    mutateDocumentEmbedded: function(win, remove)
    {
        //xxxHonza: win.document.documentElement is null if this method is synchronously
        // called after watchWindow. This is why watchWindowDelayed is introduced.
        // See issue 3342

        // document.documentElement - Returns the Element that is a direct child of document.
        // For HTML documents, this normally the HTML element.
        var target = win.document.documentElement;
        var parent = win.frameElement;
        var nextSibling = this.findNextSibling(target || parent);
        try
        {
            this.mutateNode(target, parent, nextSibling, remove);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("html.mutateDocumentEmbedded FAILS " + exc, exc);
        }
    },

    supportsObject: function(object, type)
    {
        if (object instanceof window.Element || object instanceof window.Text ||
            object instanceof window.CDATASection)
        {
            return 2;
        }
        else if (object instanceof SourceLink && object.type == "css" &&
            !Url.reCSS.test(object.href))
        {
            return 2;
        }
        else
        {
            return 0;
        }
    },

    updateOption: function(name, value)
    {
        var options = new Set();
        options.add("showCommentNodes");
        options.add("entityDisplay");
        options.add("showTextNodesWithWhitespace");
        options.add("showFullTextNodes");

        if (options.has(name))
        {
            this.resetSearch();
            Dom.clearNode(this.panelNode);
            if (this.ioBox)
                this.ioBox.destroy();

            this.ioBox = new InsideOutBox(this, this.panelNode);
            this.ioBox.select(this.selection, true, true);
        }
    },

    updateSelection: function(object)
    {
        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.updateSelection " + object, object);

        if (this.ioBox.sourceRow)
            this.ioBox.sourceRow.removeAttribute("exe_line");

        // && object.type == "css" and !Url.reCSS(object.href) by supports
        if (object instanceof SourceLink)
        {
            var sourceLink = object;
            var stylesheet = Css.getStyleSheetByHref(sourceLink.href, this.context);
            if (stylesheet)
            {
                var ownerNode = stylesheet.ownerNode;

                if (FBTrace.DBG_CSS)
                {
                    FBTrace.sysout("html panel updateSelection stylesheet.ownerNode=" +
                        stylesheet.ownerNode + " href:" + sourceLink.href);
                }

                if (ownerNode)
                {
                    var objectbox = this.ioBox.select(ownerNode, true, true, this.noScrollIntoView);

                    // XXXjjb seems like this could be bad for errors at the end of long files
                    // first source row in style
                    var sourceRow = objectbox.getElementsByClassName("sourceRow").item(0);
                    for (var lineNo = 1; lineNo < sourceLink.line; lineNo++)
                    {
                        if (!sourceRow) break;
                        sourceRow = Dom.getNextByClass(sourceRow,  "sourceRow");
                    }

                    if (FBTrace.DBG_CSS)
                    {
                        FBTrace.sysout("html panel updateSelection sourceLink.line=" +
                            sourceLink.line + " sourceRow=" +
                            (sourceRow ? sourceRow.innerHTML : "undefined"));
                    }

                    if (sourceRow)
                    {
                        this.ioBox.sourceRow = sourceRow;
                        this.ioBox.sourceRow.setAttribute("exe_line", "true");

                        Dom.scrollIntoCenterView(sourceRow);

                        // sourceRow isn't an objectBox, but the function should work anyway...
                        this.ioBox.selectObjectBox(sourceRow, false);
                    }
                }
            }
        }
        else if (Inspector.inspecting)
        {
            this.ioBox.highlight(object);
        }
        else
        {
            var found = this.ioBox.select(object, true, false, this.noScrollIntoView);
            if (!found)
            {
                // Look up for an enclosing parent. NB this will mask failures in createObjectBoxes
                var parentNode = this.getParentObject(object);

                if (FBTrace.DBG_ERRORS && FBTrace.DBG_HTML)
                    FBTrace.sysout("html.updateSelect no objectBox for object:"+
                        Css.getElementCSSSelector(object) + " trying "+
                        Css.getElementCSSSelector(parentNode));

                this.updateSelection(parentNode);
                return;
            }

            this.inspectorHistory.unshift(object);
            if (this.inspectorHistory.length > 5)
                this.inspectorHistory.pop();
        }
    },

    stopInspecting: function(object, canceled)
    {
        if (object != this.inspectorHistory)
        {
            // Manage history of selection for later access in the command line.
            this.inspectorHistory.unshift(object);
            if (this.inspectorHistory.length > 5)
                this.inspectorHistory.pop();

            if (FBTrace.DBG_HTML)
                FBTrace.sysout("html.stopInspecting: inspectoryHistory updated",
                    this.inspectorHistory);
        }

        this.ioBox.highlight(null);

        if (!canceled)
            this.ioBox.select(object, true);
    },

    search: function(text, reverse)
    {
        if (!text)
            return;

        var search;
        if (text == this.searchText && this.lastSearch)
        {
            search = this.lastSearch;
        }
        else
        {
            var doc = this.context.window.document;
            search = this.lastSearch = new HTMLLib.NodeSearch(text, doc, this.panelNode, this.ioBox);
        }

        var loopAround = search.find(reverse, SearchBox.isCaseSensitive(text));
        if (loopAround)
        {
            this.resetSearch();
            this.search(text, reverse);
        }

        return !search.noMatch && (loopAround ? "wraparound" : true);
    },

    shouldIgnoreIntermediateSearchFailure: function(value)
    {
        // Ignore failures for values that, according to the auto-completion system,
        // can be extended into valid selectors, or that are obviously incomplete
        // selectors.
        var editor = new CSSSelectorEditor();
        var range = editor.getAutoCompleteRange(value, value.length);
        var preExpr = value.slice(0, range.start);
        var expr = value.slice(range.start);

        if (preExpr.lastIndexOf("[") > preExpr.lastIndexOf("]"))
            return true;
        if (preExpr.lastIndexOf("(") > preExpr.lastIndexOf(")"))
            return true;

        var list = editor.getAutoCompleteList(preExpr, expr, "", range, false, this.context, {});
        return list && list.some(function(x)
        {
            return x.startsWith(expr);
        });
    },

    getSearchOptionsMenuItems: function()
    {
        return [
            SearchBox.searchOptionMenu("search.Case_Sensitive", "searchCaseSensitive",
                "search.tip.Case_Sensitive")
        ];
    },

    getDefaultSelection: function()
    {
        try
        {
            var doc = this.context.window.document;
            return doc.body ? doc.body : Dom.getPreviousElement(doc.documentElement.lastChild);
        }
        catch (exc)
        {
            return null;
        }
    },

    getObjectPath: function(element)
    {
        var path = [];
        for (; element; element = this.getParentObject(element))
        {
            // Ignore the document itself, it shouldn't be displayed in
            // the object path (aka breadcrumbs).
            if (element instanceof window.Document)
                continue;

            // Ignore elements without parent
            if (!element.parentNode)
                continue;

            path.push(element);
        }
        return path;
    },

    getPopupObject: function(target)
    {
        return Firebug.getRepObject(target);
    },

    getTooltipObject: function(target)
    {
        if (Dom.getAncestorByClass(target, "nodeLabelBox") ||
            Dom.getAncestorByClass(target, "nodeCloseLabelBox"))
        {
            return Firebug.getRepObject(target);
        }
    },

    getOptionsMenuItems: function()
    {
        return [
            Menu.optionMenu("ShowFullText", "showFullTextNodes",
                "html.option.tip.Show_Full_Text"),
            Menu.optionMenu("ShowWhitespace", "showTextNodesWithWhitespace",
                "html.option.tip.Show_Whitespace"),
            Menu.optionMenu("ShowComments", "showCommentNodes",
                "html.option.tip.Show_Comments"),
            "-",
            {
                label: "html.option.Show_Entities_As_Symbols",
                tooltiptext: "html.option.tip.Show_Entities_As_Symbols",
                type: "radio",
                name: "entityDisplay",
                id: "entityDisplaySymbols",
                command: Obj.bind(this.setEntityDisplay, this, "symbols"),
                checked: Options.get("entityDisplay") == "symbols"
            },
            {
                label: "html.option.Show_Entities_As_Names",
                tooltiptext: "html.option.tip.Show_Entities_As_Names",
                type: "radio",
                name: "entityDisplay",
                id: "entityDisplayNames",
                command: Obj.bind(this.setEntityDisplay, this, "names"),
                checked: Options.get("entityDisplay") == "names"
            },
            {
                label: "html.option.Show_Entities_As_Unicode",
                tooltiptext: "html.option.tip.Show_Entities_As_Unicode",
                type: "radio",
                name: "entityDisplay",
                id: "entityDisplayUnicode",
                command: Obj.bind(this.setEntityDisplay, this, "unicode"),
                checked: Options.get("entityDisplay") == "unicode"
            },
            "-",
            Menu.optionMenu("HighlightMutations", "highlightMutations",
                "html.option.tip.Highlight_Mutations"),
            Menu.optionMenu("ExpandMutations", "expandMutations",
                "html.option.tip.Expand_Mutations"),
            Menu.optionMenu("ScrollToMutations", "scrollToMutations",
                "html.option.tip.Scroll_To_Mutations"),
            "-",
            Menu.optionMenu("ShadeBoxModel", "shadeBoxModel",
                "inspect.option.tip.Shade_Box_Model"),
            Menu.optionMenu("ShowQuickInfoBox","showQuickInfoBox",
                "inspect.option.tip.Show_Quick_Info_Box")
        ];
    },

    getContextMenuItems: function(node, target)
    {
        if (!node)
            return null;

        var items = [];

        if (node.nodeType == Node.ELEMENT_NODE)
        {
            items.push(
                "-",
                {
                    label: "NewAttribute",
                    id: "htmlNewAttribute",
                    tooltiptext: "html.tip.New_Attribute",
                    command: Obj.bindFixed(this.editNewAttribute, this, node)
                }
            );

            var attrBox = Dom.getAncestorByClass(target, "nodeAttr");
            if (Dom.getAncestorByClass(target, "nodeAttr"))
            {
                var attrName = attrBox.childNodes[1].textContent;

                items.push(
                    {
                        id: "fbEditAttribute",
                        label: Locale.$STRF("EditAttribute", [attrName]),
                        tooltiptext: Locale.$STRF("html.tip.Edit_Attribute", [attrName]),
                        nol10n: true,
                        command: Obj.bindFixed(this.editAttribute, this, node, attrName)
                    },
                    {
                        id: "fbDeleteAttribute",
                        label: Locale.$STRF("DeleteAttribute", [attrName]),
                        tooltiptext: Locale.$STRF("html.tip.Delete_Attribute", [attrName]),
                        nol10n: true,
                        command: Obj.bindFixed(this.deleteAttribute, this, node, attrName)
                    }
                );
            }

            if (!Css.nonEditableTags.hasOwnProperty(node.localName))
            {
                var type;

                if (Xml.isElementHTMLOrXHTML(node))
                    type = "HTML";
                else if (Xml.isElementMathML(node))
                    type = "MathML";
                else if (Xml.isElementSVG(node))
                    type = "SVG";
                else if (Xml.isElementXUL(node))
                    type = "XUL";
                else
                    type = "XML";

                items.push("-",
                {
                    id: "fbEditNode",
                    label: Locale.$STRF("html.Edit_Node", [type]),
                    tooltiptext: Locale.$STRF("html.tip.Edit_Node", [type]),
                    nol10n: true,
                    acceltext: (Locale.getFormattedKey(window, "accel", "E")),
                    command: Obj.bindFixed(this.editNode, this, node)
                });

                if (!Css.nonDeletableTags.hasOwnProperty(node.localName))
                {
                    items.push({
                        id: "fbDeleteElement",
                        label: "DeleteElement",
                        tooltiptext: "html.Delete_Element",
                        acceltext: Locale.getFormattedKey(window, null, null, "VK_DELETE"),
                        command: Obj.bindFixed(this.deleteNode, this, node)
                    });
                }
            }

            var objectBox = Dom.getAncestorByClass(target, "nodeBox");
            var nodeChildBox = this.ioBox.getChildObjectBox(objectBox);
            if (nodeChildBox)
            {
                items.push(
                    "-",
                    {
                        id: "fbExpandContractAll",
                        label: "html.label.Expand/Contract_All",
                        tooltiptext: "html.tip.Expand/Contract_All",
                        acceltext: Locale.getFormattedKey(window, null, "*"),
                        command: Obj.bind(this.toggleAll, this, node)
                    }
                );
            }
        }
        else
        {
            var nodeLabel = Locale.$STR("html.Node");
            items.push(
                "-",
                {
                    id: "fbEditNode",
                    label: Locale.$STRF("html.Edit_Node", [nodeLabel]),
                    tooltiptext: Locale.$STRF("html.tip.Edit_Node", [nodeLabel]),
                    nol10n: true,
                    command: Obj.bindFixed(this.editNode, this, node)
                },
                {
                    id: "fbDeleteNode",
                    label: "DeleteNode",
                    tooltiptext: "html.Delete_Node",
                    command: Obj.bindFixed(this.deleteNode, this, node)
                }
            );
        }

        HTMLModule.MutationBreakpoints.getContextMenuItems(this.context, node, target, items);

        return items;
    },

    showInfoTip: function(infoTip, target, x, y)
    {
        if (!Css.hasClass(target, "nodeValue"))
            return;

        var node = Firebug.getRepObject(target);
        if (node && node.nodeType == Node.ELEMENT_NODE)
        {
            var nodeName = node.localName.toUpperCase();
            var attribute = Dom.getAncestorByClass(target, "nodeAttr");
            var attributeName = attribute.getElementsByClassName("nodeName").item(0).textContent;

            if ((nodeName == "IMG" || nodeName == "INPUT") && attributeName == "src")
            {
                var url = node.src;

                // This state cleared in hide()
                if (url == this.infoTipURL)
                    return true;

                this.infoTipURL = url;
                return CSSReps.CSSInfoTip.populateImageInfoTip(infoTip, url);
            }
        }
    },

    getEditor: function(target, value)
    {
        if (Css.hasClass(target, "nodeName") || Css.hasClass(target, "nodeValue") ||
            Css.hasClass(target, "nodeBracket"))
        {
            if (!this.attrEditor)
                this.attrEditor = new Firebug.HTMLPanel.Editors.Attribute(this.document);

            return this.attrEditor;
        }
        else if (Css.hasClass(target, "nodeComment") || Css.hasClass(target, "nodeCDATA"))
        {
            if (!this.textDataEditor)
                this.textDataEditor = new Firebug.HTMLPanel.Editors.TextData(this.document);

            return this.textDataEditor;
        }
        else if (Css.hasClass(target, "nodeText"))
        {
            if (!this.textNodeEditor)
                this.textNodeEditor = new Firebug.HTMLPanel.Editors.TextNode(this.document);

            return this.textNodeEditor;
        }
    },

    getInspectorVars: function()
    {
        var vars = {};
        for (var i=0; i<this.inspectorHistory.length; i++)
            vars["$"+i] = this.inspectorHistory[i] || null;

        return vars;
    },

    setEntityDisplay: function(event, type)
    {
        Options.set("entityDisplay", type);

        var menuItem = event.target;
        menuItem.setAttribute("checked", "true");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Break on Mutate

    breakOnNext: function(breaking, callback)
    {
        HTMLModule.MutationBreakpoints.breakOnNext(this.context, breaking);
        this.updateMutationBreakpointListeners();
        // Immediately invoke the callback in the case of HTMLPanel (may change soon with RDP).
        if (callback)
            callback(this.context, breaking);
    },

    shouldBreakOnNext: function()
    {
        return !!this.context.breakOnNextMutate;
    },

    getBreakOnNextTooltip: function(enabled)
    {
        return (enabled ? Locale.$STR("html.Disable Break On Mutate") :
            Locale.$STR("html.Break On Mutate"));
    }
});
// ********************************************************************************************* //
// Editors

Firebug.HTMLPanel.Editors = {
    html: HTMLEditor,
    Attribute: AttributeEditor,
    TextNode: TextNodeEditor,
    TextData: TextDataEditor
};

// ********************************************************************************************* //
// Local Helpers

function getNodeBoxTag(nodeBox)
{
    var re = /([^\s]+)NodeBox/;
    var m = re.exec(nodeBox.className);
    if (!m)
        return null;

    var nodeBoxType = m[1];
    if (nodeBoxType == "container")
        return HTMLReps.Element.tag;
    else if (nodeBoxType == "text")
        return HTMLReps.TextElement.tag;
    else if (nodeBoxType == "empty")
        return HTMLReps.EmptyElement.tag;
}

// ********************************************************************************************* //
// Registration

// Backwards compatibility
["AttrTag", "TextTag", "CompleteElement", "SoloElement", "Element", "HTMLDocument",
"HTMLDocType", "HTMLHtmlElement", "TextElement", "EmptyElement", "XEmptyElement",
"AttrNode", "TextNode", "CDATANode", "CommentNode"].forEach(function(name)
{
    Firebug.HTMLPanel[name] = HTMLReps[name];
});

Firebug.registerPanel(Firebug.HTMLPanel);

return HTMLModule;

// ********************************************************************************************* //
});
