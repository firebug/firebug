/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const MODIFICATION = MutationEvent.MODIFICATION;
const ADDITION = MutationEvent.ADDITION;
const REMOVAL = MutationEvent.REMOVAL;

const HTMLLib = Firebug.HTMLLib;

var AttrTag =
    SPAN({class: "nodeAttr editGroup"},
        "&nbsp;", SPAN({class: "nodeName editable"}, "$attr.nodeName"), "=&quot;",
        SPAN({class: "nodeValue editable"}, "$attr.nodeValue"), "&quot;"
    );

// ************************************************************************************************

Firebug.HTMLModule = extend(Firebug.Module,
{
    deleteNode: function(node, context)
    {
        dispatch(this.fbListeners, "onBeginFirebugChange", [node, context]);
        node.parentNode.removeChild(node);
        dispatch(this.fbListeners, "onEndFirebugChange", [node, context]);
    },
    deleteAttribute: function(node, attr, context)
    {
        dispatch(this.fbListeners, "onBeginFirebugChange", [node, context]);
        node.removeAttribute(attr);
        dispatch(this.fbListeners, "onEndFirebugChange", [node, context]);
    }
});

Firebug.HTMLPanel = function() {};

Firebug.HTMLPanel.prototype = extend(Firebug.Panel,
{
    toggleEditing: function()
    {
        if (this.editing)
            Firebug.Editor.stopEditing();
        else
            this.editNode(this.selection);
    },

    resetSearch: function()
    {
        delete this.lastSearch;
    },

    selectNext: function()
    {
        var objectBox = this.ioBox.createObjectBox(this.selection);
        var next = this.ioBox.getNextObjectBox(objectBox);
        if (next)
        {
            this.select(next.repObject);

            if (Firebug.Inspector.inspecting)
                Firebug.Inspector.inspectNode(next.repObject);

        }
    },

    selectPrevious: function()
    {
        var objectBox = this.ioBox.createObjectBox(this.selection);
        var previous = this.ioBox.getPreviousObjectBox(objectBox);
        if (previous)
        {
            this.select(previous.repObject);

            if (Firebug.Inspector.inspecting)
                Firebug.Inspector.inspectNode(previous.repObject);
        }
    },

    selectNodeBy: function(dir)
    {
        if (dir == "up")
            this.selectPrevious();
        else if (dir == "down")
            this.selectNext();
        else if (dir == "left")
        {
            var box = this.ioBox.createObjectBox(this.selection);
            if (!hasClass(box, "open"))
                this.select(this.ioBox.getParentObjectBox(box).repObject);
            else
                this.ioBox.contractObject(this.selection);
        }
        else if (dir == "right")
            this.ioBox.expandObject(this.selection);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    editNewAttribute: function(elt)
    {
        var objectNodeBox = this.ioBox.findObjectBox(elt);
        if (objectNodeBox)
        {
            var labelBox = objectNodeBox.firstChild.lastChild;
            var bracketBox = getChildByClass(labelBox, "nodeBracket");
            Firebug.Editor.insertRow(bracketBox, "before");
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
                Firebug.Editor.startEditing(attrValueBox, value);
            }
        }
    },

    deleteAttribute: function(elt, attrName)
    {
        Firebug.HTMLModule.deleteAttribute(elt, attrName, this.context);
    },

    editNode: function(node)
    {
        if ( nonEditableTags.hasOwnProperty(node.localName) )
            return;

        var objectNodeBox = this.ioBox.findObjectBox(node);
        if (objectNodeBox)
        {
            if (!this.htmlEditor)
                this.htmlEditor = new HTMLEditor(this.document);

            this.htmlEditor.innerEditMode = node.localName in innerEditableTags;

            var html = this.htmlEditor.innerEditMode ? node.innerHTML : getElementHTML(node);
            Firebug.Editor.startEditing(objectNodeBox, html, this.htmlEditor);
        }
    },

    deleteNode: function(node)
    {
        Firebug.HTMLModule.deleteNode(node, this.context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

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
            lines = this.context.sourceCache.load(url);
        else
        {
            var text = HTMLLib.getSourceText(node);
            lines = splitLines(text);
        }

        var sourceElt = new SourceText(lines, node);

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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    mutateAttr: function(target, attrChange, attrName, attrValue)
    {
        // Every time the user scrolls we get this pointless mutation event, which
        // is only bad for performance
        if (attrName == "curpos")
            return;
        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.mutateAttr target:"+target+" attrChange:"+attrChange+" attrName:"+attrName, target);

        this.markChange();

        var objectNodeBox = Firebug.scrollToMutations || Firebug.expandMutations
            ? this.ioBox.createObjectBox(target)
            : this.ioBox.findObjectBox(target);

        if (!objectNodeBox)
            return;

        if (isVisible(objectNodeBox.repObject))
            removeClass(objectNodeBox, "nodeHidden");
        else
            setClass(objectNodeBox, "nodeHidden");

        if (attrChange == MODIFICATION || attrChange == ADDITION)
        {
            var nodeAttr = HTMLLib.findNodeAttrBox(objectNodeBox, attrName);
            if (FBTrace.DBG_HTML)
                FBTrace.sysout("mutateAttr "+attrChange+" "+attrName+"="+attrValue+" node: "+nodeAttr, nodeAttr);
            if (nodeAttr && nodeAttr.childNodes.length > 3)
            {
                var attrValueBox = nodeAttr.childNodes[3];
                var attrValueText = nodeAttr.childNodes[3].firstChild;
                if (attrValueText)
                    attrValueText.nodeValue = attrValue;

                this.highlightMutation(attrValueBox, objectNodeBox, "mutated");
            }
            else
            {
                var attr = target.getAttributeNode(attrName);
                if (FBTrace.DBG_HTML)
                    FBTrace.sysout("mutateAttr getAttributeNode "+attrChange+" "+attrName+"="+attrValue+" node: "+attr, attr);
                if (attr)
                {
                    var nodeAttr = Firebug.HTMLPanel.AttrNode.tag.replace({attr: attr},
                            this.document);

                    var labelBox = objectNodeBox.firstChild.lastChild;
                    var bracketBox = getChildByClass(labelBox, "nodeBracket");
                    labelBox.insertBefore(nodeAttr, bracketBox);

                    this.highlightMutation(nodeAttr, objectNodeBox, "mutated");
                }
            }
        }
        else if (attrChange == REMOVAL)
        {
            var nodeAttr = HTMLLib.findNodeAttrBox(objectNodeBox, attrName);
            if (nodeAttr)
            {
                nodeAttr.parentNode.removeChild(nodeAttr);

                this.highlightMutation(objectNodeBox, objectNodeBox, "mutated");
            }
        }
    },

    mutateText: function(target, parent, textValue)
    {
        this.markChange();

        var parentNodeBox = Firebug.scrollToMutations || Firebug.expandMutations
            ? this.ioBox.createObjectBox(parent)
            : this.ioBox.findObjectBox(parent);

        if (!parentNodeBox)
            return;

        if (!Firebug.showFullTextNodes)
            textValue = cropMultipleLines(textValue, 50);

        var parentTag = getNodeBoxTag(parentNodeBox);
        if (parentTag == Firebug.HTMLPanel.TextElement.tag)
        {
            var nodeText = HTMLLib.getTextElementTextBox(parentNodeBox);
            if (!nodeText.firstChild)
                return;

            nodeText.firstChild.nodeValue = textValue;

            this.highlightMutation(nodeText, parentNodeBox, "mutated");
        }
        else
        {
            var childBox = this.ioBox.getChildObjectBox(parentNodeBox);
            if (!childBox)
                return;

            var textNodeBox = this.ioBox.findChildObjectBox(childBox, target);
            if (textNodeBox)
            {
                textNodeBox.firstChild.lastChild.nodeValue = textValue;

                this.highlightMutation(textNodeBox, parentNodeBox, "mutated");
            }
        }
    },

    mutateNode: function(target, parent, nextSibling, removal)
    {
        if (FBTrace.DBG_HTML)
            FBTrace.sysout("\nhtml.mutateNode target:"+target+" parent:"+parent+(removal?"REMOVE":"")+"\n");

        this.markChange();  // This invalidates the panels for every mutate

        var parentNodeBox = Firebug.scrollToMutations || Firebug.expandMutations
            ? this.ioBox.createObjectBox(parent)
            : this.ioBox.findObjectBox(parent);

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.mutateNode parent:"+parent+" parentNodeBox:"+parentNodeBox+"\n");

        if (!parentNodeBox)
            return;

        if (!Firebug.showWhitespaceNodes && this.isWhitespaceText(target))
            return;

        // target is only whitespace

        var newParentTag = getNodeTag(parent);
        var oldParentTag = getNodeBoxTag(parentNodeBox);

        if (newParentTag == oldParentTag)
        {
            if (parentNodeBox.populated)
            {
                if (removal)
                {
                    this.ioBox.removeChildBox(parentNodeBox, target);

                    this.highlightMutation(parentNodeBox, parentNodeBox, "mutated");
                }
                else
                {
                    var objectBox = nextSibling
                        ? this.ioBox.insertChildBoxBefore(parentNodeBox, target, nextSibling)
                        : this.ioBox.appendChildBox(parentNodeBox, target);

                    this.highlightMutation(objectBox, objectBox, "mutated");
                }
            }
            else
            {
                var newParentNodeBox = newParentTag.replace({object: parent}, this.document);
                parentNodeBox.parentNode.replaceChild(newParentNodeBox, parentNodeBox);

                this.highlightMutation(newParentNodeBox, newParentNodeBox, "mutated");

                if (Firebug.scrollToMutations || Firebug.expandMutations)
                {
                    var objectBox = this.ioBox.createObjectBox(target);
                    this.highlightMutation(objectBox, objectBox, "mutated");
                }
            }
        }
        else
        {
            var newParentNodeBox = newParentTag.replace({object: parent}, this.document);
            if (parentNodeBox.parentNode)
                parentNodeBox.parentNode.replaceChild(newParentNodeBox, parentNodeBox);

            if (hasClass(parentNodeBox, "open"))
                this.ioBox.toggleObjectBox(newParentNodeBox, true);

            if (this.selection && (!this.selection.parentNode || parent == this.selection))
                this.ioBox.select(parent, true);

            this.highlightMutation(newParentNodeBox, newParentNodeBox, "mutated");
        }
    },

    highlightMutation: function(elt, objectBox, type)
    {
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
                    scrollIntoCenterView(objectBox, panelNode);
            }, 200);
        }

        if (Firebug.highlightMutations)
            setClassTimed(elt, type, this.context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // SourceBox proxy

    createObjectBox: function(object, isRoot)
    {
        if (FBTrace.DBG_HTML) FBTrace.sysout("html.createObjectBox("+(object.tagName?object.tagName:object)+", isRoot:"+(isRoot?"true":"false")+")\n");
        var tag = getNodeTag(object);
        if (tag)
            return tag.replace({object: object}, this.document);
    },

    getParentObject: function(node)
    {
        if (node instanceof SourceText)
            return node.owner;

        if (this.rootElement && node == this.rootElement)  // this.rootElement is never set
            return null;

        var parentNode = node ? node.parentNode : null;
        if (parentNode)
            if (parentNode.nodeType == 9)
            {
                if (FBTrace.DBG_HTML)
                    FBTrace.sysout("html.getParentObject parentNode.nodeType 9\n");
                if (parentNode.defaultView)
                    return parentNode.defaultView.frameElement;
                else
                {
                    if (FBTrace.DBG_HTML || FBTrace.DBG_ERRORS)
                        FBTrace.sysout("html.getParentObject parentNode.nodeType 9 but no defaultView?", parentNode);
                }
            }
            else
                return parentNode;
        else
            if (node && node.nodeType == 9) // document type
            {
                var embeddingFrame = node.defaultView.frameElement;
                if (embeddingFrame)
                    return embeddingFrame.parentNode;
                else
                    return null;  // top level has no parent
            }

    },

    getChildObject: function(node, index, previousSibling)
    {
        if (HTMLLib.isSourceElement(node))
        {
            if (index == 0)
                return this.getElementSourceText(node);
        }
        else if (previousSibling)
        {
            return this.findNextSibling(previousSibling);
        }
        else
        {
            if (index == 0 && node.contentDocument)
                return node.contentDocument.documentElement;
            else if (Firebug.showWhitespaceNodes)
                return node.childNodes[index];
            else
            {
                var childIndex = 0;
                for (var child = node.firstChild; child; child = child.nextSibling)
                {
                    if (!this.isWhitespaceText(child) && childIndex++ == index)
                        return child;
                }
            }
        }

        return null;
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Break on Mutate

    resume: function()
    {
        this.context.breakOnMutate = !this.context.breakOnMutate;

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.resume; " + this.context.breakOnMutate + ", " + this.context.getName());

        Firebug.Debugger.syncCommands(this.context);

        var chrome = Firebug.chrome;
        var breakable = Firebug.chrome.getGlobalAttribute("cmd_resumeExecution", "breakable").toString();
        if (breakable == "true")
        {
            chrome.setGlobalAttribute("cmd_resumeExecution", "breakable", "false");
            chrome.setGlobalAttribute("cmd_resumeExecution", "tooltiptext", $STR("html.Disable Break On Mutate"));
        }
        else
        {
            chrome.setGlobalAttribute("cmd_resumeExecution", "breakable", "true");
            chrome.setGlobalAttribute("cmd_resumeExecution", "tooltiptext", $STR("html.Break On Mutate"));
        }
    },

    breakOnMutate: function(type)
    {
        if (!this.context.breakOnMutate)
            return;

        this.context.breakOnMutate = false;

        Firebug.Debugger.breakNow();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Events

    onMutateAttr: function(event)
    {
        var target = event.target;
        if (target.firebugIgnore)
            return;

        var attrChange = event.attrChange;
        var attrName = event.attrName;
        var newValue = event.newValue;

        this.context.delay(function()
        {
            this.mutateAttr(target, attrChange, attrName, newValue);
        }, this);

        this.breakOnMutate(event.type);
    },

    onMutateText: function(event)
    {
        var target = event.target;
        var parent = target.parentNode;

        var newValue = event.newValue;

        this.context.delay(function()
        {
            this.mutateText(target, parent, newValue);
        }, this);

        this.breakOnMutate(event.type);
    },

    onMutateNode: function(event)
    {
        var target = event.target;
        if (target.firebugIgnore)
            return;

        var parent = event.relatedNode;
        var removal = event.type == "DOMNodeRemoved";
        var nextSibling = removal ? null : this.findNextSibling(target);

        this.context.delay(function()
        {
            try
            {
                 this.mutateNode(target, parent, nextSibling, removal);
            }
            catch (exc)
            {
                if (FBTrace.DBG_ERRORS || FBTrace.DBG_HTML)
                    FBTrace.sysout("html.onMutateNode FAILS:", exc);
            }
        }, this);

        this.breakOnMutate(event.type);
    },

    onClick: function(event)
    {
        if (isLeftClick(event) && event.detail == 2)
        {
            if (getAncestorByClass(event.target, "nodeTag"))
            {
                var node = Firebug.getRepObject(event.target);
                this.editNode(node);
            }
        }
    },

    onMouseDown: function(event)
    {
        if (!isLeftClick(event))
            return;

        if (getAncestorByClass(event.target, "nodeTag"))
        {
            var node = Firebug.getRepObject(event.target);
            this.noScrollIntoView = true;
            this.select(node);
            delete this.noScrollIntoView;
            var box = this.ioBox.createObjectBox(node);
            if (!hasClass(box, "open"))
                this.ioBox.expandObject(node);
            else
                this.ioBox.contractObject(this.selection);
        }
    },

    onKeyPress: function(event)
    {
        if (this.editing || isControl(event) || isShift(event))
            return;

        if (event.keyCode == KeyEvent.DOM_VK_UP)
            this.selectNodeBy("up");
        else if (event.keyCode == KeyEvent.DOM_VK_DOWN)
            this.selectNodeBy("down");
        else if (event.keyCode == KeyEvent.DOM_VK_LEFT)
            this.selectNodeBy("left");
        else if (event.keyCode == KeyEvent.DOM_VK_RIGHT)
            this.selectNodeBy("right");
        else
            return;

        cancelEvent(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "html",
    searchable: true,
    dependents: ["css", "computed", "layout", "dom", "domSide", "watch"],
    inspectorHistory: new Array(5),

    initialize: function()
    {
        this.onMutateText = bind(this.onMutateText, this);
        this.onMutateAttr = bind(this.onMutateAttr, this);
        this.onMutateNode = bind(this.onMutateNode, this);
        this.onClick = bind(this.onClick, this);
        this.onMouseDown = bind(this.onMouseDown, this);
        this.onKeyPress = bind(this.onKeyPress, this);

        Firebug.Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        persistObjects(this, state);

        Firebug.Panel.destroy.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        this.panelNode.addEventListener("click", this.onClick, false);
        this.panelNode.addEventListener("mousedown", this.onMouseDown, false);
        dispatch([Firebug.A11yModel], "onInitializeNode", [this]);
    },

    destroyNode: function()
    {
        this.panelNode.removeEventListener("click", this.onClick, false);
        this.panelNode.removeEventListener("mousedown", this.onMouseDown, false);
        this.panelNode.ownerDocument.removeEventListener("keypress", this.onKeyPress, true);

        if (this.ioBox)
        {
            this.ioBox.destroy();
            delete this.ioBox;
        }
        dispatch([Firebug.A11yModel], "onDestroyNode", [this]);
    },

    show: function(state)
    {
        this.showToolbarButtons("fbHTMLButtons", true);

        if (!this.ioBox)
            this.ioBox = new InsideOutBox(this, this.panelNode);

        this.panelNode.ownerDocument.addEventListener("keypress", this.onKeyPress, true);

        if (this.context.loaded)
        {
            if (!this.context.attachedMutation)
            {
                this.context.attachedMutation = true;

                iterateWindows(this.context.window, bind(function(win)
                {
                    var doc = win.document;
                    doc.addEventListener("DOMAttrModified", this.onMutateAttr, false);
                    doc.addEventListener("DOMCharacterDataModified", this.onMutateText, false);
                    doc.addEventListener("DOMNodeInserted", this.onMutateNode, false);
                    doc.addEventListener("DOMNodeRemoved", this.onMutateNode, false);
                }, this));
            }

            Firebug.chrome.setGlobalAttribute("cmd_resumeExecution", "breakable", "true");
            Firebug.chrome.setGlobalAttribute("cmd_resumeExecution", "tooltiptext",
                $STR("html.Break On Mutate"));

            restoreObjects(this, state);
        }
    },

    hide: function()
    {
        this.showToolbarButtons("fbHTMLButtons", false);
        delete this.infoTipURL;  // clear the state that is tracking the infotip so it is reset after next show()
        this.panelNode.ownerDocument.removeEventListener("keypress", this.onKeyPress, true);
    },

    watchWindow: function(win)
    {
        if (this.context.window && this.context.window != win) // then I guess we are an embedded window
        {
            var htmlPanel = this;
            iterateWindows(this.context.window, function(subwin)
            {
                if (win == subwin)
                {
                    if (FBTrace.DBG_HTML)
                        FBTrace.sysout("html.watchWindow found subwin.location.href="+win.location.href+"\n");
                    htmlPanel.mutateDocumentEmbedded(win, false);
                }
            });

        }
        if (this.context.attachedMutation)
        {
            var doc = win.document;
            doc.addEventListener("DOMAttrModified", this.onMutateAttr, false);
            doc.addEventListener("DOMCharacterDataModified", this.onMutateText, false);
            doc.addEventListener("DOMNodeInserted", this.onMutateNode, false);
            doc.addEventListener("DOMNodeRemoved", this.onMutateNode, false);
        }
    },

    unwatchWindow: function(win)
    {
        if (this.context.window && this.context.window != win) // then I guess we are an embedded window
        {
            var htmlPanel = this;
            iterateWindows(this.context.window, function(subwin)
            {
                if (win == subwin)
                {
                    if (FBTrace.DBG_HTML)
                        FBTrace.sysout("html.unwatchWindow found subwin.location.href="+win.location.href+"\n");
                    htmlPanel.mutateDocumentEmbedded(win, true);
                }
            });

        }
        var doc = win.document;
        doc.removeEventListener("DOMAttrModified", this.onMutateAttr, false);
        doc.removeEventListener("DOMCharacterDataModified", this.onMutateText, false);
        doc.removeEventListener("DOMNodeInserted", this.onMutateNode, false);
        doc.removeEventListener("DOMNodeRemoved", this.onMutateNode, false);
    },

    mutateDocumentEmbedded: function(win, remove)
    {
        // document.documentElement    Returns the Element that is a direct child of document. For HTML documents, this normally the HTML element.
        var target = win.document.documentElement;
        var parent = win.frameElement;
        var nextSibling = this.findNextSibling(target);
        this.mutateNode(target, parent, nextSibling, remove);
    },

    supportsObject: function(object)
    {
        if (object instanceof Element || object instanceof Text || object instanceof CDATASection)
            return 2;
        else if (object instanceof SourceLink && object.type == "css" && !reCSS.test(object.href))
            return 2;
        else
            return 0;
    },

    updateOption: function(name, value)
    {
        var viewOptionNames = {showCommentNodes:1, showWhitespaceNodes:1 , showFullTextNodes:1};
        if (name in viewOptionNames)
        {
            this.resetSearch();
            clearNode(this.panelNode);
            if (this.ioBox)
                this.ioBox.destroy();

            this.ioBox = new InsideOutBox(this, this.panelNode);
            this.ioBox.select(this.selection, true, true);
        }
    },

    updateSelection: function(object)
    {
        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.updateSelection "+object);
        if (this.ioBox.sourceRow)
            this.ioBox.sourceRow.removeAttribute("exeLine");

        if (object instanceof SourceLink) // && object.type == "css" and !reCSS(object.href) by supports
         {
             var sourceLink = object;
             var stylesheet = getStyleSheetByHref(sourceLink.href, this.context);
             if (stylesheet)
             {
                var ownerNode = stylesheet.ownerNode;
                if (FBTrace.DBG_CSS)
                        FBTrace.sysout("html panel updateSelection stylesheet.ownerNode="+stylesheet.ownerNode
                                          +" href:"+sourceLink.href+"\n");
                if (ownerNode)
                {
                    var objectbox = this.ioBox.select(ownerNode, true, true, this.noScrollIntoView);

                    // XXXjjb seems like this could be bad for errors at the end of long files
                    //
                    var sourceRow = FBL.getElementByClass(objectbox, "sourceRow"); // first source row in style
                    for (var lineNo = 1; lineNo < sourceLink.line; lineNo++)
                    {
                        if (!sourceRow) break;
                        sourceRow = FBL.getNextByClass(sourceRow,  "sourceRow");
                    }
                    if (FBTrace.DBG_CSS)
                        FBTrace.sysout("html panel updateSelection sourceLink.line="+sourceLink.line
                                          +" sourceRow="+(sourceRow?sourceRow.innerHTML:"undefined")+"\n");
                    if (sourceRow)
                    {
                        this.ioBox.sourceRow = sourceRow;
                        this.ioBox.sourceRow.setAttribute("exeLine", "true");
                        scrollIntoCenterView(sourceRow);
                        this.ioBox.selectObjectBox(sourceRow, false);  // sourceRow isn't an objectBox, but the function should work anyway...
                    }
                }
            }
        }
        else if (Firebug.Inspector.inspecting)
        {
            this.ioBox.highlight(object);
        }
        else
        {
            this.ioBox.select(object, true, false, this.noScrollIntoView);
            this.inspectorHistory.unshift(object);
            if (this.inspectorHistory.length > 5)
                this.inspectorHistory.pop();
        }
    },

    stopInspecting: function(object, cancelled)
    {
        if (object != this.inspectorHistory)
        {
            // Manage history of selection for later access in the command line.
            this.inspectorHistory.unshift(object);
            if (this.inspectorHistory.length > 5)
                this.inspectorHistory.pop();

            if (FBTrace.DBG_HTML)
                FBTrace.sysout("html.stopInspecting: inspectoryHistory updated", this.inspectorHistory);
        }

        this.ioBox.highlight(null);

        if (!cancelled)
            this.ioBox.select(object, true);
    },

    search: function(text, reverse)
    {
        if (!text)
            return;

        var search;
        if (text == this.searchText && this.lastSearch)
            search = this.lastSearch;
        else
        {
            var doc = this.context.window.document;
            if (Firebug.searchSelector)
                search = this.lastSearch = new HTMLLib.SelectorSearch(text, doc, this.panelNode, this.ioBox);
            else
                search = this.lastSearch = new HTMLLib.NodeSearch(text, doc, this.panelNode, this.ioBox);
        }

        var loopAround = search.find(reverse, Firebug.searchCaseSensitive);
        if (loopAround)
        {
            this.resetSearch();
            this.search(text, reverse);
        }

        return !search.noMatch;
    },

    getSearchOptionsMenuItems: function()
    {
        return [
            optionMenu("search.html.CSS_Selector", "searchSelector")
        ];
    },

    getDefaultSelection: function()
    {
        try
        {
            var doc = this.context.window.document;
            return doc.body ? doc.body : getPreviousElement(doc.documentElement.lastChild);
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
            path.push(element);

        return path;
    },

    getPopupObject: function(target)
    {
        return Firebug.getRepObject(target);
    },

    getTooltipObject: function(target)
    {
        return null;
    },

    getOptionsMenuItems: function()
    {
        return [
            optionMenu("ShowFullText", "showFullTextNodes"),
            optionMenu("ShowWhitespace", "showWhitespaceNodes"),
            optionMenu("ShowComments", "showCommentNodes"),
            "-",
            optionMenu("HighlightMutations", "highlightMutations"),
            optionMenu("ExpandMutations", "expandMutations"),
            optionMenu("ScrollToMutations", "scrollToMutations")
        ];
    },

    getContextMenuItems: function(node, target)
    {
        if (!node)
            return null;

        var items = [];

        if (node && node.nodeType == 1)
        {
            items.push(
                "-",
                {label: "NewAttribute", command: bindFixed(this.editNewAttribute, this, node) }
            );

            var attrBox = getAncestorByClass(target, "nodeAttr");
            if (getAncestorByClass(target, "nodeAttr"))
            {
                var attrName = attrBox.childNodes[1].textContent;

                items.push(
                    {label: $STRF("EditAttribute", [attrName]), nol10n: true,
                        command: bindFixed(this.editAttribute, this, node, attrName) },
                    {label: $STRF("DeleteAttribute", [attrName]), nol10n: true,
                        command: bindFixed(this.deleteAttribute, this, node, attrName) }
                );
            }

            if (!( nonEditableTags.hasOwnProperty(node.localName) ))
            {
                items.push(
                    "-",
                    {label: "EditElement", command: bindFixed(this.editNode, this, node) },
                    {label: "DeleteElement", command: bindFixed(this.deleteNode, this, node) }
                );
            }

        }
        else
        {
            items.push(
                "-",
                {label: "EditNode", command: bindFixed(this.editNode, this, node) },
                {label: "DeleteNode", command: bindFixed(this.deleteNode, this, node) }
            );
        }

        return items;
    },

    showInfoTip: function(infoTip, target, x, y)
    {
        if (!hasClass(target, "nodeValue"))
            return;

        var targetNode = Firebug.getRepObject(target);
        if (targetNode && targetNode.nodeType == 1 && targetNode.localName.toUpperCase() == "IMG")
        {
            var url = targetNode.src;
            if (url == this.infoTipURL) // This state cleared in hide()
                return true;

            this.infoTipURL = url;
            return Firebug.InfoTip.populateImageInfoTip(infoTip, url);
        }
    },

    getEditor: function(target, value)
    {
        if (hasClass(target, "nodeName") || hasClass(target, "nodeValue") || hasClass(target, "nodeBracket"))
        {
            if (!this.attrEditor)
                this.attrEditor = new AttributeEditor(this.document);

            return this.attrEditor;
        }
        else if (hasClass(target, "nodeText"))
        {
            // XXXjoe Implement special text node editor
            if (!this.textEditor)
                this.textEditor = new AttributeEditor(this.document);

            return this.textEditor;
        }
    },

    getInspectorVars: function()
    {
        var vars = {};
        for (var i=0; i<2; i++)
            vars["$"+i] = this.inspectorHistory[i];

        return vars;
    },
});

// ************************************************************************************************

Firebug.HTMLPanel.CompleteElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({class: "nodeBox open $object|getHidden repIgnore", _repObject: "$object", role : 'presentation'},
            DIV({class: "nodeLabel", role: "presentation"},
                SPAN({class: "nodeLabelBox repTarget repTarget", role : 'treeitem', 'aria-expanded' : 'false'},
                    "&lt;",
                    SPAN({class: "nodeTag"}, "$object.localName|toLowerCase"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({class: "nodeBracket"}, "&gt;")
                )
            ),
            DIV({class: "nodeChildBox", role :"group"},
                FOR("child", "$object|childIterator",
                    TAG("$child|getNodeTag", {object: "$child"})
                )
            ),
            DIV({class: "nodeCloseLabel", role:"presentation"},
                "&lt;/",
                SPAN({class: "nodeTag"}, "$object.localName|toLowerCase"),
                "&gt;"
             )
        ),

    getNodeTag: function(node)
    {
        return getNodeTag(node, true);
    },

    childIterator: function(node)
    {
        if (node.contentDocument)
            return [node.contentDocument.documentElement];

        if (Firebug.showWhitespaceNodes)
            return cloneArray(node.childNodes);
        else
        {
            var nodes = [];
            for (var child = node.firstChild; child; child = child.nextSibling)
            {
                if (child.nodeType != 3 || !HTMLLib.isWhitespaceText(child))
                    nodes.push(child);
            }
            return nodes;
        }
    }
});

Firebug.HTMLPanel.SoloElement = domplate(Firebug.HTMLPanel.CompleteElement,
{
    tag:
        DIV({class: "soloElement", onmousedown: "$onMouseDown"},
            Firebug.HTMLPanel.CompleteElement.tag
        ),

    onMouseDown: function(event)
    {
        for (var child = event.target; child; child = child.parentNode)
        {
            if (child.repObject)
            {
                var panel = Firebug.getElementPanel(child);
                Firebug.chrome.select(child.repObject);
                break;
            }
        }
    }
});

Firebug.HTMLPanel.Element = domplate(FirebugReps.Element,
{
    tag:
        DIV({class: "nodeBox containerNodeBox $object|getHidden repIgnore", _repObject: "$object", role :"presentation"},
            DIV({class: "nodeLabel", role: "presentation"},
                IMG({class: "twisty", role: "presentation"}),
                SPAN({class: "nodeLabelBox repTarget", role : 'treeitem', 'aria-expanded' : 'false'},
                    "&lt;",
                    SPAN({class: "nodeTag"}, "$object.localName|toLowerCase"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({class: "nodeBracket editable insertBefore"}, "&gt;")
                )
            ),
            DIV({class: "nodeChildBox", role :"group"}), /* nodeChildBox is special signal in insideOutBox */
            DIV({class: "nodeCloseLabel", role : "presentation"},
                SPAN({class: "nodeCloseLabelBox repTarget"},
                    "&lt;/",
                    SPAN({class: "nodeTag"}, "$object.localName|toLowerCase"),
                    "&gt;"
                )
             )
        )
});

Firebug.HTMLPanel.TextElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({class: "nodeBox textNodeBox $object|getHidden repIgnore", _repObject: "$object", role : 'presentation'},
            DIV({class: "nodeLabel", role: "presentation"},
                SPAN({class: "nodeLabelBox repTarget", role : 'treeitem'},
                    "&lt;",
                    SPAN({class: "nodeTag"}, "$object.localName|toLowerCase"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({class: "nodeBracket editable insertBefore"}, "&gt;"),
                    SPAN({class: "nodeText editable"}, "$object|getNodeText"),
                    "&lt;/",
                    SPAN({class: "nodeTag"}, "$object.localName|toLowerCase"),
                    "&gt;"
                )
            )
        )
});

Firebug.HTMLPanel.EmptyElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({class: "nodeBox emptyNodeBox $object|getHidden repIgnore", _repObject: "$object", role : 'presentation'},
            DIV({class: "nodeLabel", role: "presentation"},
                SPAN({class: "nodeLabelBox repTarget", role : 'treeitem'},
                    "&lt;",
                    SPAN({class: "nodeTag"}, "$object.localName|toLowerCase"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({class: "nodeBracket editable insertBefore"}, "&gt;")
                )
            )
        )
});

Firebug.HTMLPanel.XEmptyElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({class: "nodeBox emptyNodeBox $object|getHidden repIgnore", _repObject: "$object", role : 'presentation'},
            DIV({class: "nodeLabel", role: "presentation"},
                SPAN({class: "nodeLabelBox repTarget", role : 'treeitem'},
                    "&lt;",
                    SPAN({class: "nodeTag"}, "$object.localName|toLowerCase"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({class: "nodeBracket editable insertBefore"}, "/&gt;")
                )
            )
        )
});

Firebug.HTMLPanel.AttrNode = domplate(FirebugReps.Element,
{
    tag: AttrTag
}),

Firebug.HTMLPanel.TextNode = domplate(FirebugReps.Element,
{
    tag:
        DIV({class: "nodeBox", _repObject: "$object"},
            SPAN({class: "nodeText editable"}, "$object.nodeValue")
        )
}),

Firebug.HTMLPanel.WhitespaceNode = domplate(FirebugReps.Element,
{
    tag:
        DIV({class: "nodeBox", _repObject: "$object"},
            FOR("char", "$object|charIterator",
                    SPAN({class: "nodeText nodeWhiteSpace editable"}, "$char")
                    )
        ),
    charIterator: function(node)
    {
        var str = node.nodeValue;
        var arr = [];
        for(var i = 0; i < str.length; i++)
        {
            // http://www.w3.org/TR/html401/struct/text.html
            var char = str[i];
            switch(char)
            {
            case ' ': arr[i] = ' ';break;
            case '\t': arr[i] = '\\t';break;
            case '\n': arr[i] = '\\n';break;
            case '\u200B': arr[i] = '\\u200B';break;  // Zero width space http://www.fileformat.info/info/unicode/char/200b/index.htm
            default: arr[i] = '?'; break;
            }
        }
        return arr;
    },
}),

Firebug.HTMLPanel.CDATANode = domplate(FirebugReps.Element,
{
    tag:
        DIV({class: "nodeBox", _repObject: "$object"},
            "&lt;![CDATA[",
            SPAN({class: "nodeText editable"}, "$object.nodeValue"),
            "]]&gt;"
        )
}),

Firebug.HTMLPanel.CommentNode = domplate(FirebugReps.Element,
{
    tag:
        DIV({class: "nodeBox", _repObject: "$object"},
            DIV({class: "nodeComment editable"},
                "&lt;!--$object.nodeValue--&gt;"
            )
        )
});

// ************************************************************************************************
// AttributeEditor

function AttributeEditor(doc)
{
    this.initializeInline(doc);
}

AttributeEditor.prototype = domplate(Firebug.InlineEditor.prototype,
{
    saveEdit: function(target, value, previousValue)
    {
        var element = Firebug.getRepObject(target);
        if (!element)
            return;

        target.innerHTML = escapeHTML(value);

        if (hasClass(target, "nodeName"))
        {
            if (value != previousValue)
                element.removeAttribute(previousValue);

            if (value)
            {
                var attrValue = getNextByClass(target, "nodeValue").textContent;
                element.setAttribute(value, attrValue);
            }
            else
                element.removeAttribute(value);
        }
        else if (hasClass(target, "nodeValue"))
        {
            var attrName = getPreviousByClass(target, "nodeName").textContent;
            element.setAttribute(attrName, value);
        }
        else if (hasClass(target, "nodeText"))
        {
            if (element instanceof Element)
                element.innerHTML = value;
            else
                element.nodeValue = value;
        }

        //this.panel.markChange();
    },

    advanceToNext: function(target, charCode)
    {
        if (charCode == 61 && hasClass(target, "nodeName"))
            return true;
    },

    insertNewRow: function(target, insertWhere)
    {
        var emptyAttr = {nodeName: "", nodeValue: ""};
        var sibling = insertWhere == "before" ? target.previousSibling : target;

        return AttrTag.insertAfter({attr: emptyAttr}, sibling);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getAutoCompleteRange: function(value, offset)
    {
    },

    getAutoCompleteList: function(preExpr, expr, postExpr)
    {
    }
});

// ************************************************************************************************
// HTMLEditor

function HTMLEditor(doc)
{
    this.box = this.tag.replace({}, doc, this);
    this.input = this.box.firstChild;

    this.multiLine = true;
    this.tabNavigation = false;
    this.arrowCompletion = false;
}

HTMLEditor.prototype = domplate(Firebug.BaseEditor,
{
    tag: DIV(
        TEXTAREA({class: "htmlEditor fullPanelEditor", oninput: "$onInput"})
    ),

    getValue: function()
    {
        return this.input.value;
    },

    setValue: function(value)
    {
        return this.input.value = value;
    },

    show: function(target, panel, value, textSize, targetSize)
    {
        this.target = target;
        this.panel = panel;
        this.editingElements = [target.repObject, null];

        this.panel.panelNode.appendChild(this.box);

        this.input.value = value;
        this.input.focus();

        var command = Firebug.chrome.$("cmd_toggleHTMLEditing");
        command.setAttribute("checked", true);
    },

    hide: function()
    {
        var command = Firebug.chrome.$("cmd_toggleHTMLEditing");
        command.setAttribute("checked", false);

        this.panel.panelNode.removeChild(this.box);

        delete this.editingElements;
        delete this.target;
        delete this.panel;
    },

    saveEdit: function(target, value, previousValue)
    {
        // Remove all of the nodes in the last range we created, except for
        // the first one, because setOuterHTML will replace it
        var first = this.editingElements[0], last = this.editingElements[1];
        if (last && last != first)
        {
            for (var child = first.nextSibling; child;)
            {
                var next = child.nextSibling;
                child.parentNode.removeChild(child);
                if (child == last)
                    break;
                else
                    child = next;
            }
        }

        // Make sure that we create at least one node here, even if it's just
        // an empty space, because this code depends on having something to replace
        if (!value)
            value = " ";

        if (this.innerEditMode)
            this.editingElements[0].innerHTML = value;
        else
            this.editingElements = setOuterHTML(this.editingElements[0], value);
    },

    endEditing: function()
    {
        //this.panel.markChange();
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onInput: function()
    {
        Firebug.Editor.update();
    }
});

// ************************************************************************************************
// Local Helpers

function getEmptyElementTag(node)
{
    if (node.ownerDocument.documentElement.namespaceURI == "http://www.w3.org/1999/xhtml")
        return Firebug.HTMLPanel.XEmptyElement.tag;
    else
        return Firebug.HTMLPanel.EmptyElement.tag;
}

function getNodeTag(node, expandAll)
{
    if (node instanceof Element)
    {
        if (node instanceof HTMLAppletElement)
            return getEmptyElementTag(node);
        else if (node.firebugIgnore)
            return null;
        else if (HTMLLib.isContainerElement(node))
            return expandAll ? Firebug.HTMLPanel.CompleteElement.tag : Firebug.HTMLPanel.Element.tag;
        else if (HTMLLib.isEmptyElement(node))
            return getEmptyElementTag(node);
        else if (HTMLLib.hasNoElementChildren(node))
            return Firebug.HTMLPanel.TextElement.tag;
        else
            return expandAll ? Firebug.HTMLPanel.CompleteElement.tag : Firebug.HTMLPanel.Element.tag;
    }
    else if (node instanceof Text)
        return Firebug.showWhitespaceNodes ? Firebug.HTMLPanel.WhitespaceNode.tag : Firebug.HTMLPanel.TextNode.tag;
    else if (node instanceof CDATASection)
        return Firebug.HTMLPanel.CDATANode.tag;
    else if (node instanceof Comment && (Firebug.showCommentNodes || expandAll))
        return Firebug.HTMLPanel.CommentNode.tag;
    else if (node instanceof SourceText)
        return FirebugReps.SourceText.tag;
    else
        return FirebugReps.Nada.tag;
}

function getNodeBoxTag(nodeBox)
{
    var re = /([^\s]+)NodeBox/;
    var m = re.exec(nodeBox.className);
    if (!m)
        return null;

    var nodeBoxType = m[1];
    if (nodeBoxType == "container")
        return Firebug.HTMLPanel.Element.tag;
    else if (nodeBoxType == "text")
        return Firebug.HTMLPanel.TextElement.tag;
    else if (nodeBoxType == "empty")
        return Firebug.HTMLPanel.EmptyElement.tag;
}

// ************************************************************************************************

Firebug.registerPanel(Firebug.HTMLPanel);

// ************************************************************************************************

}});
