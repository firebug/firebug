/* See license.txt for terms of usage */

define([
    "firebug/lib",
    "firebug/firebug",
    "firebug/domplate",
    "firebug/reps",
    "firebug/lib/locale",
    "arch/tools",
    "firebug/lib/htmlLib",
    "firebug/lib/events",
    "firebug/sourceLink",
    "firebug/breakpoint",
    "firebug/editor",
    "firebug/infotip",
    "firebug/search",
    "firebug/insideOutBox",
],
function(FBL, Firebug, Domplate, FirebugReps, Locale, ToolsInterface, HTMLLib, Events,
    SourceLink) { with (Domplate) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const MODIFICATION = window.MutationEvent.MODIFICATION;
const ADDITION = window.MutationEvent.ADDITION;
const REMOVAL = window.MutationEvent.REMOVAL;

const BP_BREAKONATTRCHANGE = 1;
const BP_BREAKONCHILDCHANGE = 2;
const BP_BREAKONREMOVE = 3;
const BP_BREAKONTEXT = 4;

var KeyEvent = window.KeyEvent;

// ************************************************************************************************

Firebug.HTMLModule = FBL.extend(Firebug.Module,
{
    dispatchName: "htmlModule",

    initialize: function(prefDomain, prefNames)
    {
        Firebug.Module.initialize.apply(this, arguments);
        ToolsInterface.browser.addListener(this.DebuggerListener);
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);
        ToolsInterface.browser.removeListener(this.DebuggerListener);
    },

    initContext: function(context, persistedState)
    {
        Firebug.Module.initContext.apply(this, arguments);
        context.mutationBreakpoints = new MutationBreakpointGroup();
    },

    loadedContext: function(context, persistedState)
    {
        context.mutationBreakpoints.load(context);
    },

    destroyContext: function(context, persistedState)
    {
        Firebug.Module.destroyContext.apply(this, arguments);

        context.mutationBreakpoints.store(context);
    },

    deleteNode: function(node, context)
    {
        Events.dispatch(this.fbListeners, "onBeginFirebugChange", [node, context]);
        node.parentNode.removeChild(node);
        Events.dispatch(this.fbListeners, "onEndFirebugChange", [node, context]);
    },

    deleteAttribute: function(node, attr, context)
    {
        Events.dispatch(this.fbListeners, "onBeginFirebugChange", [node, context]);
        node.removeAttribute(attr);
        Events.dispatch(this.fbListeners, "onEndFirebugChange", [node, context]);
    }
});

// ************************************************************************************************

Firebug.HTMLPanel = function() {};

var WalkingPanel = FBL.extend(Firebug.Panel, HTMLLib.ElementWalkerFunctions);

Firebug.HTMLPanel.prototype = FBL.extend(WalkingPanel,
{
    inspectable: true,

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

    select: function(object, forceUpdate)
    {
        if (!object)
            object = this.getDefaultSelection();

        if(FBTrace.DBG_PANELS)
            FBTrace.sysout("firebug.select "+this.name+" forceUpdate: "+forceUpdate+" "+object+((object==this.selection)?"==":"!=")+this.selection);

        if (forceUpdate || object != this.selection)
        {
            this.selection = object;
            this.updateSelection(object);
            Events.dispatch(Firebug.uiListeners, "onObjectSelected", [object, this]);

            if (this.editing && FBL.$("fbToggleHTMLEditing").getAttribute("checked") === "true")
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
            if (!FBL.hasClass(box, "open"))
                this.select(this.ioBox.getParentObjectBox(box).repObject);
            else
                this.ioBox.contractObject(this.selection);
        }
        else if (dir == "right")
        {
            var box = this.ioBox.createObjectBox(this.selection);
            if (!FBL.hasClass(box, "open"))
                this.ioBox.expandObject(this.selection);
            else
                this.selectNext();
        }
        Firebug.Inspector.highlightObject(this.selection, this.context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    editNewAttribute: function(elt)
    {
        var objectNodeBox = this.ioBox.findObjectBox(elt);
        if (objectNodeBox)
        {
            var labelBox = objectNodeBox.querySelector("*> .nodeLabel > .nodeLabelBox");
            var bracketBox = labelBox.querySelector("*> .nodeBracket");
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

    localEditors:{}, // instantiated editor cache
    editNode: function(node)
    {
        var objectNodeBox = this.ioBox.findObjectBox(node);
        if (objectNodeBox)
        {
            var type = FBL.getElementType(node);
            var editor = this.localEditors[type];
            if (!editor)
            {
             // look for special purpose editor (inserted by an extension), otherwise use our html editor
                var specializedEditor = Firebug.HTMLPanel.Editors[type] || Firebug.HTMLPanel.Editors['html'];
                editor = this.localEditors[type] = new specializedEditor(this.document);
            }
            this.startEditingNode(node, objectNodeBox, editor, type);
        }
    },

    startEditingNode: function(node, box, editor, type)
    {
        switch (type)
        {
            case 'html':
            case 'xhtml':
                this.startEditingHTMLNode(node, box, editor);
                break;
            default:
                this.startEditingXMLNode(node, box, editor);
        }
    },

    startEditingXMLNode: function(node, box, editor)
    {
        var xml = FBL.getElementXML(node);
        Firebug.Editor.startEditing(box, xml, editor);
    },

    startEditingHTMLNode: function(node, box, editor)
    {
        if (FBL.nonEditableTags.hasOwnProperty(node.localName))
            return;

        editor.innerEditMode = node.localName in FBL.innerEditableTags;

        var html = editor.innerEditMode ? node.innerHTML : FBL.getElementHTML(node);
        Firebug.Editor.startEditing(box, html, editor);
    },

    deleteNode: function(node, dir)
    {
        dir = dir || 'up';
        var box = this.ioBox.createObjectBox(node);
        if (FBL.hasClass(box, "open"))
            this.ioBox.contractObject(this.selection);
        this.selectNodeBy(dir);
        Firebug.HTMLModule.deleteNode(node, this.context);
    },

    toggleAll: function(node)
    {
        this.ioBox.toggleObject(node, true);
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
            lines = FBL.splitLines(text);
        }

        var sourceElt = new FBL.SourceText(lines, node);

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

        // Due to the delay call this may or may not exist in the tree anymore
        if (!this.ioBox.isInExistingRoot(target))
        {
            if (FBTrace.DBG_HTML)   FBTrace.sysout("mutateAttr: different tree " + target, target);
            return;
        }

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.mutateAttr target:"+target+" attrChange:"+attrChange+" attrName:"+attrName+" attrValue: "+attrValue, target);

        this.markChange();

        var objectNodeBox = Firebug.scrollToMutations || Firebug.expandMutations
            ? this.ioBox.createObjectBox(target)
            : this.ioBox.findObjectBox(target);

        if (!objectNodeBox)
            return;

        if (FBL.isVisible(objectNodeBox.repObject))
            FBL.removeClass(objectNodeBox, "nodeHidden");
        else
            FBL.setClass(objectNodeBox, "nodeHidden");

        if (attrChange == MODIFICATION || attrChange == ADDITION)
        {
            var nodeAttr = HTMLLib.findNodeAttrBox(objectNodeBox, attrName);
            if (FBTrace.DBG_HTML)
                FBTrace.sysout("mutateAttr "+attrChange+" "+attrName+"="+attrValue+" node: "+nodeAttr, nodeAttr);
            if (nodeAttr && nodeAttr.childNodes.length > 3)
            {
                var attrValueBox = nodeAttr.querySelector("*> .nodeValue");
                var attrValueText = attrValueBox.firstChild;
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

                    var labelBox = objectNodeBox.querySelector("*> .nodeLabel > .nodeLabelBox");
                    var bracketBox = labelBox.querySelector("*> .nodeBracket");
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
            }

            // We want to highlight regardless as the domplate may have been
            // generated after the attribute was removed from the node
            this.highlightMutation(objectNodeBox, objectNodeBox, "mutated");
        }

        Firebug.Inspector.repaint();
    },

    mutateText: function(target, parent, textValue)
    {
        // Due to the delay call this may or may not exist in the tree anymore
        if (!this.ioBox.isInExistingRoot(target))
        {
            if (FBTrace.DBG_HTML)   FBTrace.sysout("mutateText: different tree " + target, target);
            return;
        }

        this.markChange();

        var parentNodeBox = Firebug.scrollToMutations || Firebug.expandMutations
            ? this.ioBox.createObjectBox(parent)
            : this.ioBox.findObjectBox(parent);

        if (!parentNodeBox)
        {
            if (FBTrace.DBG_HTML)   FBTrace.sysout("html.mutateText failed to update text, parent node box does not exist");
            return;
        }

        if (!Firebug.showFullTextNodes)
            textValue = FBL.cropMultipleLines(textValue);

        var parentTag = getNodeBoxTag(parentNodeBox);
        if (parentTag == Firebug.HTMLPanel.TextElement.tag)
        {
            if (FBTrace.DBG_HTML)
                FBTrace.sysout("html.mutateText target: " + target + " parent: " + parent);

            var nodeText = HTMLLib.getTextElementTextBox(parentNodeBox);
            if (!nodeText.firstChild)
            {
                if (FBTrace.DBG_HTML)   FBTrace.sysout("html.mutateText failed to update text, TextElement firstChild does not exist");
                return;
            }

            nodeText.firstChild.nodeValue = textValue;

            this.highlightMutation(nodeText, parentNodeBox, "mutated");
        }
        else
        {
            var childBox = this.ioBox.getChildObjectBox(parentNodeBox);
            if (!childBox)
            {
                if (FBTrace.DBG_HTML)   FBTrace.sysout("html.mutateText failed to update text, no child object box found");
                return;
            }

            var textNodeBox = this.ioBox.findChildObjectBox(childBox, target);
            if (textNodeBox)
            {
                // structure for comment and cdata. Are there others?
                textNodeBox.children[0].firstChild.nodeValue = textValue;

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
            FBTrace.sysout("\nhtml.mutateNode target:"+target+" parent:"+parent+(removal?"REMOVE":"")+"\n");

        // Due to the delay call this may or may not exist in the tree anymore
        if (!removal && !this.ioBox.isInExistingRoot(target))
        {
            if (FBTrace.DBG_HTML)   FBTrace.sysout("mutateNode: different tree " + target, target);
            return;
        }

        this.markChange();  // This invalidates the panels for every mutate

        var parentNodeBox = Firebug.scrollToMutations || Firebug.expandMutations
            ? this.ioBox.createObjectBox(parent)
            : this.ioBox.findObjectBox(parent);

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.mutateNode parent:"+parent+" parentNodeBox:"+parentNodeBox+"\n");

        if (!parentNodeBox)
            return;

        if (!Firebug.showTextNodesWithWhitespace && this.isWhitespaceText(target))
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
                    if (nextSibling)
                    {
                        while (
                                (!Firebug.showTextNodesWithWhitespace && HTMLLib.isWhitespaceText(nextSibling)) ||
                                (!Firebug.showCommentNodes && nextSibling instanceof window.Comment)
                              )
                        {
                            nextSibling = this.findNextSibling(nextSibling);
                        }
                    }

                    var objectBox = nextSibling
                        ? this.ioBox.insertChildBoxBefore(parentNodeBox, target, nextSibling)
                        : this.ioBox.appendChildBox(parentNodeBox, target);

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
                    var objectBox = this.ioBox.createObjectBox(target);
                    this.highlightMutation(objectBox, objectBox, "mutated");
                }
            }
        }
        else // newParentTag != oldParentTag
        {
            var newParentNodeBox = newParentTag.replace({object: parent}, this.document);
            if (parentNodeBox.parentNode)
                parentNodeBox.parentNode.replaceChild(newParentNodeBox, parentNodeBox);

            if (FBL.hasClass(parentNodeBox, "open"))
                this.ioBox.toggleObjectBox(newParentNodeBox, true);

            if (this.selection && (!this.selection.parentNode || parent == this.selection))
                this.ioBox.select(parent, true);

            this.highlightMutation(newParentNodeBox, newParentNodeBox, "mutated");

            if (!removal && (Firebug.scrollToMutations || Firebug.expandMutations))
            {
                var objectBox = this.ioBox.createObjectBox(target);
                this.highlightMutation(objectBox, objectBox, "mutated");
            }
        }
    },

    highlightMutation: function(elt, objectBox, type)
    {
        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.highlightMutation Firebug.highlightMutations:"+Firebug.highlightMutations, {elt: elt, objectBox: objectBox, type: type});

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
                    FBL.scrollIntoCenterView(objectBox, panelNode);
            }, 200);
        }

        if (Firebug.highlightMutations)
            FBL.setClassTimed(elt, type, this.context);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // InsideOutBoxView implementation

    createObjectBox: function(object, isRoot)
    {
        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.createObjectBox("+FBL.getElementCSSSelector(object)+", isRoot:"+(isRoot?"true":"false")+")\n");
        var tag = getNodeTag(object);
        if (tag)
            return tag.replace({object: object}, this.document);
    },

    getParentObject: function(node)
    {
        if (node instanceof FBL.SourceText)
            return node.owner;

        var parentNode = this.getParentNode(node);

        // for chromebug to avoid climbing out to browser.xul
        if (node.nodeName == "#document")
            return null;

        //if (FBTrace.DBG_HTML)
        //    FBTrace.sysout("html.getParentObject for "+node.nodeName+" parentNode:"+FBL.getElementCSSSelector(parentNode));

        if (parentNode)
        {
            if (parentNode.nodeType == 9) // then parentNode is Document element
            {
                if (parentNode.defaultView)
                {
                    if (parentNode.defaultView == this.context.window)
                        return parentNode;

                    if (FBTrace.DBG_HTML)
                        FBTrace.sysout("getParentObject parentNode.nodeType 9, frameElement:"+parentNode.defaultView.frameElement+"\n");
                    return parentNode.defaultView.frameElement;
                }
                else if (this.embeddedBrowserParents)
                {
                    var skipParent = this.embeddedBrowserParents[node];  // better be HTML element, could be iframe
                    if (FBTrace.DBG_HTML)
                        FBTrace.sysout("getParentObject skipParent:"+(skipParent?skipParent.nodeName:"none")+"\n");
                    if (skipParent)
                        return skipParent;
                }
                else
                {
                     // parent is document element, but no window at defaultView.
                     return null;
                }
            }
            else if (!parentNode.localName)
            {
                if (FBTrace.DBG_HTML)
                    FBTrace.sysout("getParentObject: null localName must be window, no parentObject");
                return null;
            }
            else
                return parentNode;
        }
        else  // Documents have no parentNode; Attr, Document, DocumentFragment, Entity, and Notation. top level windows have no parentNode
        {
            if (node && node.nodeType == 9) // document type
            {
                if (node.defaultView) // generally a reference to the window object for the document, however that is not defined in the specification
                {
                    var embeddingFrame = node.defaultView.frameElement;
                    if (embeddingFrame)
                        return embeddingFrame.contentDocument;
                }
                else // a Document object without a parentNode or window
                    return null;  // top level has no parent
            }
        }
    },

    /*
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
            FBTrace.sysout("getChildObject "+node.tagName+" index "+index+" previousSibling: "+
                (previousSibling?FBL.getElementCSSSelector(previousSibling):"null"),
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
                if (!this.embeddedBrowserParents)
                    this.embeddedBrowserParents = {};

                var skipChild = node.contentDocument.documentElement;  // punch thru and adopt the root element as our child
                this.embeddedBrowserParents[skipChild] = node;         // store our adopted childe in a side table
                if (FBTrace.DBG_HTML)
                    FBTrace.sysout("Found skipChild "+FBL.getElementCSSSelector(skipChild)+" for  "+FBL.getElementCSSSelector(node)+ " with node.contentDocument "+node.contentDocument);
                return skipChild;  // (the node's).(type 9 document).(HTMLElement)
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
                if (!this.embeddedBrowserParents)
                    this.embeddedBrowserParents = {};
                var skipChild = node.getSVGDocument().documentElement; // unwrap
                this.embeddedBrowserParents[skipChild] = node;

                return skipChild;  // (the node's).(type 9 document).(SVGElement)
            }
            else
                return null;
        }

        if (previousSibling)  // then we are walking
            var child = this.getNextSibling(previousSibling);  // may return null, meaning done with iteration.
        else
            var child = this.getFirstChild(node); // child is set to at the beginning of an iteration.

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("getChildObject firstChild "+FBL.getElementCSSSelector(child)+ " with Firebug.showTextNodesWithWhitespace "+Firebug.showTextNodesWithWhitespace);

        if (Firebug.showTextNodesWithWhitespace)  // then the index is true to the node list
            return child;
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

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Events

    onMutateAttr: function(event)
    {
        var target = event.target;
        if (Firebug.shouldIgnore(target))
            return;

        var attrChange = event.attrChange;
        var attrName = event.attrName;
        var newValue = event.newValue;

        this.context.delay(function()
        {
            this.mutateAttr(target, attrChange, attrName, newValue);
        }, this);

        Firebug.HTMLModule.MutationBreakpoints.onMutateAttr(event, this.context);
    },

    onMutateText: function(event)
    {
        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.onMutateText; ", event);

        var target = event.target;
        var parent = target.parentNode;

        var newValue = event.newValue;

        this.context.delay(function()
        {
            this.mutateText(target, parent, newValue);
        }, this);

        Firebug.HTMLModule.MutationBreakpoints.onMutateText(event, this.context);
    },

    onMutateNode: function(event)
    {
        var target = event.target;
        if (Firebug.shouldIgnore(target))
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
                if (FBTrace.DBG_ERRORS && FBTrace.DBG_HTML)
                    FBTrace.sysout("html.onMutateNode FAILS:", exc);
            }
        }, this);

        Firebug.HTMLModule.MutationBreakpoints.onMutateNode(event, this.context);
    },

    onClick: function(event)
    {
        if (Events.isLeftClick(event) && event.detail == 2)
        {
            // The double-click (detail == 2) expands an HTML element, but the user must click
            // on the element itself not on the twisty.
            // The logic should be as follow:
            // - click on the twisty expands/collapses the element
            // - double click on the element name expands/collapses it
            // - click on the element name selects it
            if (!FBL.hasClass(event.target, "twisty") && !FBL.hasClass(event.target, "nodeLabel"))
                this.toggleNode(event);
        }
        else if (Events.isAltClick(event) && event.detail == 2 && !this.editing)
        {
            this.editNode(this.selection);
        }
    },

    onMouseDown: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        if (FBL.getAncestorByClass(event.target, "nodeTag"))
        {
            var node = Firebug.getRepObject(event.target);
            this.noScrollIntoView = true;
            this.select(node);

            FBL.$('fbToggleHTMLEditing').disabled =
                FBL.nonEditableTags.hasOwnProperty(node.localName);

            delete this.noScrollIntoView;
            if (FBL.hasClass(event.target, "twisty"))
                this.toggleNode(event);
        }
    },

    toggleNode: function(event)
    {
        var node = Firebug.getRepObject(event.target);
        var box = this.ioBox.createObjectBox(node);
        if (!FBL.hasClass(box, "open"))
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

        if (!Events.noKeyModifiers(event))
          return;

        // * expands the node with all its children
        // + expands the node
        // - collapses the node
        var ch = String.fromCharCode(event.charCode);
        if (ch == "*")
            this.ioBox.toggleObject(node, true, event);
        else if (ch == "+")
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
        else if (event.keyCode == KeyEvent.DOM_VK_BACK_SPACE &&
            !(node.localName in FBL.innerEditableTags) &&
            !(FBL.nonEditableTags.hasOwnProperty(node.localName)))
            this.deleteNode(node, "up");
        else if (event.keyCode == KeyEvent.DOM_VK_DELETE &&
            !(node.localName in FBL.innerEditableTags) &&
            !(FBL.nonEditableTags.hasOwnProperty(node.localName)))
            this.deleteNode(node, "down");
        else
            return;

        Events.cancelEvent(event);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "html",
    searchable: true,
    breakable: true,
    dependents: ["css", "computed", "layout", "dom", "domSide", "watch"],
    inspectorHistory: new Array(5),
    enableA11y: true,
    order: 20,

    initialize: function()
    {
        this.onMutateText = FBL.bind(this.onMutateText, this);
        this.onMutateAttr = FBL.bind(this.onMutateAttr, this);
        this.onMutateNode = FBL.bind(this.onMutateNode, this);
        this.onClick = FBL.bind(this.onClick, this);
        this.onMouseDown = FBL.bind(this.onMouseDown, this);
        this.onKeyPress = FBL.bind(this.onKeyPress, this);

        Firebug.Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        FBL.persistObjects(this, state);

        Firebug.Panel.destroy.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        if (!this.ioBox)
            this.ioBox = new Firebug.InsideOutBox(this, this.panelNode);

        this.panelNode.addEventListener("click", this.onClick, false);
        this.panelNode.addEventListener("mousedown", this.onMouseDown, false);

        Firebug.Panel.initializeNode.apply(this, arguments);
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

        Firebug.Panel.destroyNode.apply(this, arguments);
    },

    show: function(state)
    {
        this.showToolbarButtons("fbHTMLButtons", true);
        this.showToolbarButtons("fbStatusButtons", true);

        this.panelNode.ownerDocument.addEventListener("keypress", this.onKeyPress, true);

        if (this.context.loaded)
        {
            if (!this.context.attachedMutation)
            {
                this.context.attachedMutation = true;

                FBL.iterateWindows(this.context.window, FBL.bind(function(win)
                {
                    var doc = win.document;
                    doc.addEventListener("DOMAttrModified", this.onMutateAttr, false);
                    doc.addEventListener("DOMCharacterDataModified", this.onMutateText, false);
                    doc.addEventListener("DOMNodeInserted", this.onMutateNode, false);
                    doc.addEventListener("DOMNodeRemoved", this.onMutateNode, false);
                }, this));
            }

            FBL.restoreObjects(this, state);
        }
    },

    hide: function()
    {
        delete this.infoTipURL;  // clear the state that is tracking the infotip so it is reset after next show()
        this.panelNode.ownerDocument.removeEventListener("keypress", this.onKeyPress, true);
    },

    watchWindow: function(win)
    {
        var self = this;
        setTimeout(function() {
            self.watchWindowDelayed(win);
        }, 100);
    },

    watchWindowDelayed: function(win)
    {
        if (this.context.window && this.context.window != win) // then I guess we are an embedded window
        {
            var htmlPanel = this;
            FBL.iterateWindows(this.context.window, function(subwin)
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
            FBL.iterateWindows(this.context.window, function(subwin)
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
        //xxxHonza: win.document.documentElement is null if this method is synchronously
        // called after watchWindow. This is why watchWindowDelayed is introduced.
        // See issue 3342

        // document.documentElement - Returns the Element that is a direct child of document.
        // For HTML documents, this normally the HTML element.
        var self = this;
        var target = win.document.documentElement;
        var parent = win.frameElement;
        var nextSibling = self.findNextSibling(target || parent);
        self.mutateNode(target, parent, nextSibling, remove);
    },

    supportsObject: function(object, type)
    {
        if (object instanceof window.Element || object instanceof window.Text ||
            object instanceof window.CDATASection)
            return 2;
        else if (object instanceof SourceLink.SourceLink && object.type == "css" &&
            !FBL.reCSS.test(object.href))
            return 2;
        else
            return 0;
    },

    updateOption: function(name, value)
    {
        var viewOptionNames = {
                showCommentNodes:1,
                showTextNodesWithEntities:1,
                showTextNodesWithWhitespace:1,
                showFullTextNodes:1
        };
        if (name in viewOptionNames)
        {
            this.resetSearch();
            FBL.clearNode(this.panelNode);
            if (this.ioBox)
                this.ioBox.destroy();

            this.ioBox = new Firebug.InsideOutBox(this, this.panelNode);
            this.ioBox.select(this.selection, true, true);
        }
    },

    updateSelection: function(object)
    {
        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.updateSelection "+object);
        if (this.ioBox.sourceRow)
            this.ioBox.sourceRow.removeAttribute("exe_line");

        if (object instanceof SourceLink.SourceLink) // && object.type == "css" and !FBL.reCSS(object.href) by supports
        {
            var sourceLink = object;
            var stylesheet = FBL.getStyleSheetByHref(sourceLink.href, this.context);
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
                    var sourceRow = objectbox.getElementsByClassName("sourceRow").item(0); // first source row in style
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
                        this.ioBox.sourceRow.setAttribute("exe_line", "true");
                        FBL.scrollIntoCenterView(sourceRow);
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
            var found = this.ioBox.select(object, true, false, this.noScrollIntoView);
            if (!found)
            {
                // Look up for an enclosing parent. NB this will mask failures in createObjectBoxes
                var parentNode = this.getParentObject(object);

                if (FBTrace.DBG_ERRORS && FBTrace.DBG_HTML)
                    FBTrace.sysout("html.updateSelect no objectBox for object:"+FBL.getElementCSSSelector(object) + " trying "+FBL.getElementCSSSelector(parentNode));

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
                FBTrace.sysout("html.stopInspecting: inspectoryHistory updated", this.inspectorHistory);
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
            search = this.lastSearch;
        else
        {
            var doc = this.context.window.document;
            search = this.lastSearch = new HTMLLib.NodeSearch(text, doc, this.panelNode, this.ioBox);
        }

        var loopAround = search.find(reverse, Firebug.Search.isCaseSensitive(text));
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
            Firebug.Search.searchOptionMenu("search.Case Sensitive", "searchCaseSensitive")
        ];
    },

    getDefaultSelection: function()
    {
        try
        {
            var doc = this.context.window.document;
            return doc.body ? doc.body : FBL.getPreviousElement(doc.documentElement.lastChild);
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
        return Firebug.getRepObject(target);
    },

    getOptionsMenuItems: function()
    {
        return [
            FBL.optionMenu("ShowFullText", "showFullTextNodes"),
            FBL.optionMenu("ShowWhitespace", "showTextNodesWithWhitespace"),
            FBL.optionMenu("ShowComments", "showCommentNodes"),
            FBL.optionMenu("ShowTextNodesWithEntities", "showTextNodesWithEntities"),
            "-",
            FBL.optionMenu("HighlightMutations", "highlightMutations"),
            FBL.optionMenu("ExpandMutations", "expandMutations"),
            FBL.optionMenu("ScrollToMutations", "scrollToMutations"),
            "-",
            FBL.optionMenu("ShadeBoxModel", "shadeBoxModel"),
            FBL.optionMenu("ShowQuickInfoBox","showQuickInfoBox")
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
                {label: "NewAttribute", command: FBL.bindFixed(this.editNewAttribute, this, node) }
            );

            var attrBox = FBL.getAncestorByClass(target, "nodeAttr");
            if (FBL.getAncestorByClass(target, "nodeAttr"))
            {
                var attrName = attrBox.childNodes[1].textContent;

                items.push(
                    {label: Locale.$STRF("EditAttribute", [attrName]), nol10n: true,
                        command: FBL.bindFixed(this.editAttribute, this, node, attrName) },
                    {label: Locale.$STRF("DeleteAttribute", [attrName]), nol10n: true,
                        command: FBL.bindFixed(this.deleteAttribute, this, node, attrName) }
                );
            }

            if (!(FBL.nonEditableTags.hasOwnProperty(node.localName)))
            {
                var EditElement = "EditHTMLElement";

                if (FBL.isElementMathML(node))
                    EditElement = "EditMathMLElement";
                else if (FBL.isElementSVG(node))
                    EditElement = "EditSVGElement";

                items.push("-",
                    {label: EditElement, command: FBL.bindFixed(this.editNode, this, node)},
                    {label: "DeleteElement", command: FBL.bindFixed(this.deleteNode, this, node),
                        disabled:(node.localName in FBL.innerEditableTags)}
                );
            }

            var objectBox = FBL.getAncestorByClass(target, "nodeBox");
            var nodeChildBox = this.ioBox.getChildObjectBox(objectBox);
            if (nodeChildBox)
            {
                items.push("-",
                    {label: "html.label.Expand/Contract All", acceltext: "*",
                        command: FBL.bindFixed(this.toggleAll, this, node)});
            }
        }
        else
        {
            items.push(
                "-",
                {label: "EditNode", command: FBL.bindFixed(this.editNode, this, node) },
                {label: "DeleteNode", command: FBL.bindFixed(this.deleteNode, this, node) }
            );
        }

        Firebug.HTMLModule.MutationBreakpoints.getContextMenuItems(
            this.context,node, target, items);

        return items;
    },

    showInfoTip: function(infoTip, target, x, y)
    {
        if (!FBL.hasClass(target, "nodeValue"))
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
        if (FBL.hasClass(target, "nodeName") || FBL.hasClass(target, "nodeValue") || FBL.hasClass(target, "nodeBracket"))
        {
            if (!this.attrEditor)
                this.attrEditor = new Firebug.HTMLPanel.Editors.Attribute(this.document);

            return this.attrEditor;
        }
        else if (FBL.hasClass(target, "nodeComment") || FBL.hasClass(target, "nodeCDATA"))
        {
            if (!this.textDataEditor)
                this.textDataEditor = new Firebug.HTMLPanel.Editors.TextData(this.document);

            return this.textDataEditor;
        }
        else if (FBL.hasClass(target, "nodeText"))
        {
            if (!this.textNodeEditor)
                this.textNodeEditor = new Firebug.HTMLPanel.Editors.TextNode(this.document);

            return this.textNodeEditor;
        }
    },

    getInspectorVars: function()
    {
        var vars = {};
        for (var i=0; i<2; i++)
            vars["$"+i] = this.inspectorHistory[i];

        return vars;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Break on Mutate

    breakOnNext: function(breaking)
    {
        Firebug.HTMLModule.MutationBreakpoints.breakOnNext(this.context, breaking);
    },

    shouldBreakOnNext: function()
    {
        return this.context.breakOnNextMutate;
    },

    getBreakOnNextTooltip: function(enabled)
    {
        return (enabled ? Locale.$STR("html.Disable Break On Mutate") : Locale.$STR("html.Break On Mutate"));
    },
});

// ************************************************************************************************

var AttrTag = Firebug.HTMLPanel.AttrTag =
    SPAN({"class": "nodeAttr editGroup"},
        "&nbsp;", SPAN({"class": "nodeName editable"}, "$attr.nodeName"), "=&quot;",
        SPAN({"class": "nodeValue editable"}, "$attr|getAttrValue"), "&quot;"
    );

var TextTag = Firebug.HTMLPanel.TextTag =
    SPAN({"class": "nodeText editable"},
        FOR("char", "$object|getNodeTextGroups",
            SPAN({"class": "$char.class $char.extra"}, "$char.str")
        )
    );

// ************************************************************************************************

Firebug.HTMLPanel.CompleteElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox open $object|getHidden", _repObject: "$object", role : 'presentation'},
            DIV({"class": "nodeLabel", role: "presentation"},
                SPAN({"class": "nodeLabelBox repTarget", role : 'treeitem', 'aria-expanded' : 'false'},
                    "&lt;",
                    SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({"class": "nodeBracket"}, "&gt;")
                )
            ),
            DIV({"class": "nodeChildBox", role :"group"},
                FOR("child", "$object|childIterator",
                    TAG("$child|getNodeTag", {object: "$child"})
                )
            ),
            DIV({"class": "nodeCloseLabel", role:"presentation"},
                "&lt;/",
                SPAN({"class": "nodeTag"}, "$object|getNodeName"),
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

        if (Firebug.showTextNodesWithWhitespace)
            return FBL.cloneArray(node.childNodes);
        else
        {
            var nodes = [];
            var walker = new HTMLLib.ElementWalker();

            for (var child = walker.getFirstChild(node); child; child = walker.getNextSibling(child))
            {
                if (child.nodeType != Node.TEXT_NODE || !HTMLLib.isWhitespaceText(child))
                    nodes.push(child);
            }
            return nodes;
        }
    }
});

Firebug.HTMLPanel.SoloElement = domplate(Firebug.HTMLPanel.CompleteElement,
{
    tag:
        DIV({"class": "soloElement", onmousedown: "$onMouseDown"},
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
    DIV({"class": "nodeBox containerNodeBox $object|getHidden", _repObject: "$object", role :"presentation"},
        DIV({"class": "nodeLabel", role: "presentation"},
            IMG({"class": "twisty", role: "presentation"}),
            SPAN({"class": "nodeLabelBox repTarget", role : 'treeitem', 'aria-expanded' : 'false'},
                "&lt;",
                SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                FOR("attr", "$object|attrIterator", AttrTag),
                SPAN({"class": "nodeBracket editable insertBefore"}, "&gt;")
            )
        ),
        DIV({"class": "nodeChildBox", role :"group"}), /* nodeChildBox is special signal in insideOutBox */
        DIV({"class": "nodeCloseLabel", role : "presentation"},
            SPAN({"class": "nodeCloseLabelBox repTarget"},
                "&lt;/",
                SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                "&gt;"
            )
        )
    )
});

Firebug.HTMLPanel.HTMLDocument = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox documentNodeBox containerNodeBox",
            _repObject: "$object", role: "presentation"},
            DIV({"class": "nodeChildBox", role: "group"})
        )
});

Firebug.HTMLPanel.HTMLDocType = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox docTypeNodeBox containerNodeBox",
            _repObject: "$object", role: "presentation"},
            DIV({"class": "docType"},
                "$object|getDocType"
            )
        ),

    getDocType: function(doctype)
    {
        return '<!DOCTYPE ' + doctype.name + (doctype.publicId ? ' PUBLIC "' + doctype.publicId +
            '"': '') + (doctype.systemId ? ' "' + doctype.systemId + '"' : '') + '>';
    }
});

Firebug.HTMLPanel.HTMLHtmlElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox htmlNodeBox containerNodeBox $object|getHidden",
            _repObject: "$object", role :"presentation"},
            DIV({"class": "nodeLabel", role: "presentation"},
                IMG({"class": "twisty", role: "presentation"}),
                SPAN({"class": "nodeLabelBox repTarget", role: 'treeitem', 'aria-expanded': 'false'},
                    "&lt;",
                    SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({"class": "nodeBracket editable insertBefore"}, "&gt;")
                )
            ),
            DIV({"class": "nodeChildBox", role :"group"}), /* nodeChildBox is special signal in insideOutBox */
            DIV({"class": "nodeCloseLabel", role : "presentation"},
                SPAN({"class": "nodeCloseLabelBox repTarget"},
                    "&lt;/",
                    SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                    "&gt;"
                )
            )
        )
});

Firebug.HTMLPanel.TextElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox textNodeBox $object|getHidden", _repObject: "$object", role : 'presentation'},
            DIV({"class": "nodeLabel", role: "presentation"},
                SPAN({"class": "nodeLabelBox repTarget", role : 'treeitem'},
                    "&lt;",
                    SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({"class": "nodeBracket editable insertBefore"}, "&gt;"),
                    TextTag,
                    "&lt;/",
                    SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                    "&gt;"
                )
            )
        )
});

Firebug.HTMLPanel.EmptyElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox emptyNodeBox $object|getHidden", _repObject: "$object", role : 'presentation'},
            DIV({"class": "nodeLabel", role: "presentation"},
                SPAN({"class": "nodeLabelBox repTarget", role : 'treeitem'},
                    "&lt;",
                    SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({"class": "nodeBracket editable insertBefore"}, "&gt;")
                )
            )
        )
});

Firebug.HTMLPanel.XEmptyElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox emptyNodeBox $object|getHidden", _repObject: "$object", role : 'presentation'},
            DIV({"class": "nodeLabel", role: "presentation"},
                SPAN({"class": "nodeLabelBox repTarget", role : 'treeitem'},
                    "&lt;",
                    SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({"class": "nodeBracket editable insertBefore"}, "/&gt;")
                )
            )
        )
});

Firebug.HTMLPanel.AttrNode = domplate(FirebugReps.Element,
{
    tag: AttrTag
});

Firebug.HTMLPanel.TextNode = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox", _repObject: "$object", role : 'presentation'},
            TextTag
        )
});

Firebug.HTMLPanel.CDATANode = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox", _repObject: "$object", role : 'presentation'},
            "&lt;![CDATA[",
            SPAN({"class": "nodeText nodeCDATA editable"}, "$object.nodeValue"),
            "]]&gt;"
        )
});

Firebug.HTMLPanel.CommentNode = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox nodeComment", _repObject: "$object", role : 'presentation'},
            "&lt;!--",
            SPAN({"class": "nodeComment editable"}, "$object.nodeValue"),
            "--&gt;"
        )
});


// ************************************************************************************************
// TextDataEditor

/*
 * TextDataEditor deals with text of comments and cdata nodes
 */

function TextDataEditor(doc)
{
    this.initializeInline(doc);
}

TextDataEditor.prototype = domplate(Firebug.InlineEditor.prototype,
{

    saveEdit: function(target, value, previousValue)
    {
        var node = Firebug.getRepObject(target);
        if (!node)
            return;
        target.data = value;
        node.data = value;
    }
});

//************************************************************************************************
// TextNodeEditor

/*
 * TextNodeEditor deals with text nodes that do and do not have sibling elements. If
 * there are no sibling elements, the parent is known as a TextElement. In other cases
 * we keep track of their position via a range (this is in part because as people type
 * html, the range will keep track of the text nodes and elements that the user
 * is creating as they type, and this range could be in the middle of the parent
 * elements children).
 */

function TextNodeEditor(doc)
{
    this.initializeInline(doc);
}

TextNodeEditor.prototype = domplate(Firebug.InlineEditor.prototype,
{

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
        value = FBL.unescapeForTextNode(value || '');
        target.innerHTML = FBL.escapeForTextNode(value);
        if (node instanceof window.Element)
        {
            if (FBL.isElementMathML(node) || FBL.isElementSVG(node))
                node.textContent=value;
            else
                node.innerHTML=value;
        }
        else
        {
            try
            {
                var documentFragment = this.range.createContextualFragment(value);
                var cnl=documentFragment.childNodes.length;
                this.range.deleteContents();
                this.range.insertNode(documentFragment);
                var r = this.range, sc = r.startContainer, so = r.startOffset;
                this.range.setEnd(sc,so+cnl);
            } catch (e) {}
        }
    }
});

//************************************************************************************************
//AttributeEditor

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

        // XXXstr unescape value

        target.innerHTML = FBL.escapeForElementAttribute(value);

        if (FBL.hasClass(target, "nodeName"))
        {
            if (value != previousValue)
                element.removeAttribute(previousValue);
            if (value)
            {
                var attrValue = FBL.getNextByClass(target, "nodeValue").textContent;
                element.setAttribute(value, attrValue);
            }
            else
                element.removeAttribute(value);
        }
        else if (FBL.hasClass(target, "nodeValue"))
        {
            var attrName = FBL.getPreviousByClass(target, "nodeName").textContent;
            element.setAttribute(attrName, value);
        }
        //this.panel.markChange();
    },

    advanceToNext: function(target, charCode)
    {
        if (charCode == 61 /* '=' */ && FBL.hasClass(target, "nodeName"))
        {
            return true;
        }
        else if ((charCode == 34 /* '"' */ || charCode == 39 /* ''' */) && FBL.hasClass(target, "nodeValue"))
        {
            return true;
        }
    },

    insertNewRow: function(target, insertWhere)
    {
        var emptyAttr = {nodeName: "", nodeValue: ""};
        var sibling = insertWhere == "before" ? target.previousSibling : target;
        return AttrTag.insertAfter({attr: emptyAttr}, sibling);
    }
});

//************************************************************************************************
//HTMLEditor

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
    tag:
        DIV(
            TEXTAREA({"class": "htmlEditor fullPanelEditor", oninput: "$onInput"})
        ),

    getValue: function()
    {
        return this.input.value;
    },

    setValue: function(value)
    {
        return this.input.value = value;
    },

    show: function(target, panel, value, textSize)
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
            this.editingElements = FBL.setOuterHTML(this.editingElements[0], value);
    },

    endEditing: function()
    {
        //this.panel.markChange();
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onInput: function()
    {
        Firebug.Editor.update();
    }
});

// ************************************************************************************************
// Editors

Firebug.HTMLPanel.Editors = {
    html : HTMLEditor,
    Attribute : AttributeEditor,
    TextNode: TextNodeEditor,
    TextData: TextDataEditor
};


// ************************************************************************************************
// Local Helpers

function getEmptyElementTag(node)
{
    var isXhtml= FBL.isElementXHTML(node);
    if (isXhtml)
        return Firebug.HTMLPanel.XEmptyElement.tag;
    else
        return Firebug.HTMLPanel.EmptyElement.tag;
}

function getNodeTag(node, expandAll)
{
    if (node instanceof window.Element)
    {
        if (node instanceof window.HTMLHtmlElement && node.ownerDocument && node.ownerDocument.doctype)
            return Firebug.HTMLPanel.HTMLHtmlElement.tag;
        else if (node instanceof window.HTMLAppletElement)
            return getEmptyElementTag(node);
        else if (Firebug.shouldIgnore(node))
            return null;
        else if (HTMLLib.isContainerElement(node))
            return expandAll ? Firebug.HTMLPanel.CompleteElement.tag : Firebug.HTMLPanel.Element.tag;
        else if (HTMLLib.isEmptyElement(node))
            return getEmptyElementTag(node);
        else if (Firebug.showCommentNodes && HTMLLib.hasCommentChildren(node))
            return expandAll ? Firebug.HTMLPanel.CompleteElement.tag : Firebug.HTMLPanel.Element.tag;
        else if (HTMLLib.hasNoElementChildren(node))
            return Firebug.HTMLPanel.TextElement.tag;
        else
            return expandAll ? Firebug.HTMLPanel.CompleteElement.tag : Firebug.HTMLPanel.Element.tag;
    }
    else if (node instanceof window.Text)
        return Firebug.HTMLPanel.TextNode.tag;
    else if (node instanceof window.CDATASection)
        return Firebug.HTMLPanel.CDATANode.tag;
    else if (node instanceof window.Comment && (Firebug.showCommentNodes || expandAll))
        return Firebug.HTMLPanel.CommentNode.tag;
    else if (node instanceof FBL.SourceText)
        return FirebugReps.SourceText.tag;
    else if (node instanceof window.Document)
        return Firebug.HTMLPanel.HTMLDocument.tag;
    else if (node instanceof window.DocumentType)
        return Firebug.HTMLPanel.HTMLDocType.tag;
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
// Mutation Breakpoints

/**
 * @class Represents {@link Firebug.Debugger} listener. This listener is reponsible for
 * providing a list of mutation-breakpoints into the Breakpoints side-panel.
 */
Firebug.HTMLModule.DebuggerListener =
{
    getBreakpoints: function(context, groups)
    {
        if (!context.mutationBreakpoints.isEmpty())
            groups.push(context.mutationBreakpoints);
    }
};

Firebug.HTMLModule.MutationBreakpoints =
{
    breakOnNext: function(context, breaking)
    {
        context.breakOnNextMutate = breaking;
    },

    breakOnNextMutate: function(event, context, type)
    {
        if (!context.breakOnNextMutate)
            return false;

        // Ignore changes in ignored branches
        if (FBL.isAncestorIgnored(event.target))
            return false;

        context.breakOnNextMutate = false;

        this.breakWithCause(event, context, type);
    },

    breakWithCause: function(event, context, type)
    {
        var changeLabel = Firebug.HTMLModule.BreakpointRep.getChangeLabel({type: type});
        context.breakingCause = {
            title: Locale.$STR("html.Break On Mutate"),
            message: changeLabel,
            type: event.type,
            target: event.target,
            relatedNode: event.relatedNode, // http://www.w3.org/TR/DOM-Level-2-Events/events.html
            prevValue: event.prevValue,
            newValue: event.newValue,
            attrName: event.attrName,
            attrChange: event.attrChange,
        };

        Firebug.Breakpoint.breakNow(context.getPanel("html", true));
        return true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Mutation event handlers.

    onMutateAttr: function(event, context)
    {
        if (this.breakOnNextMutate(event, context, BP_BREAKONATTRCHANGE))
            return;

        var breakpoints = context.mutationBreakpoints;
        var self = this;
        breakpoints.enumerateBreakpoints(function(bp) {
            if (bp.checked && bp.node == event.target && bp.type == BP_BREAKONATTRCHANGE) {
                self.breakWithCause(event, context, BP_BREAKONATTRCHANGE);
                return true;
            }
        });
    },

    onMutateText: function(event, context)
    {
        if (this.breakOnNextMutate(event, context, BP_BREAKONTEXT))
            return;
    },

    onMutateNode: function(event, context)
    {
        var node = event.target;
        var removal = event.type == "DOMNodeRemoved";

        if (this.breakOnNextMutate(event, context, removal ? BP_BREAKONREMOVE : BP_BREAKONCHILDCHANGE))
            return;

        var breakpoints = context.mutationBreakpoints;
        var breaked = false;

        if (removal)
        {
            var self = this;
            breaked = breakpoints.enumerateBreakpoints(function(bp) {
                if (bp.checked && bp.node == node && bp.type == BP_BREAKONREMOVE) {
                    self.breakWithCause(event, context, BP_BREAKONREMOVE);
                    return true;
                }
            });
        }

        if (!breaked)
        {
            // Collect all parents of the mutated node.
            var parents = [];
            for (var parent = node.parentNode; parent; parent = parent.parentNode)
                parents.push(parent);

            // Iterate over all parents and see if some of them has a breakpoint.
            var self = this;
            breakpoints.enumerateBreakpoints(function(bp) {
                for (var i=0; i<parents.length; i++) {
                    if (bp.checked && bp.node == parents[i] && bp.type == BP_BREAKONCHILDCHANGE) {
                        self.breakWithCause(event, context, BP_BREAKONCHILDCHANGE);
                        return true;
                    }
                }
            });
        }

        if (removal)
        {
            // Remove all breakpoints assocaited with removed node.
            var invalidate = false;
            breakpoints.enumerateBreakpoints(function(bp) {
                if (bp.node == node) {
                    breakpoints.removeBreakpoint(bp);
                    invalidate = true;
                }
            });

            if (invalidate)
                context.invalidatePanels("breakpoints");
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // Context menu items

    getContextMenuItems: function(context, node, target, items)
    {
        if (!(node && node.nodeType == 1))
            return;

        var breakpoints = context.mutationBreakpoints;

        var attrBox = FBL.getAncestorByClass(target, "nodeAttr");
        if (FBL.getAncestorByClass(target, "nodeAttr"))
        {
        }

        if (!(FBL.nonEditableTags.hasOwnProperty(node.localName)))
        {
            items.push(
                "-",
                {label: "html.label.Break On Attribute Change",
                    type: "checkbox",
                    checked: breakpoints.findBreakpoint(node, BP_BREAKONATTRCHANGE),
                    command: FBL.bindFixed(this.onModifyBreakpoint, this, context, node,
                        BP_BREAKONATTRCHANGE)},
                {label: "html.label.Break On Child Addition or Removal",
                    type: "checkbox",
                    checked: breakpoints.findBreakpoint(node, BP_BREAKONCHILDCHANGE),
                    command: FBL.bindFixed(this.onModifyBreakpoint, this, context, node,
                        BP_BREAKONCHILDCHANGE)},
                {label: "html.label.Break On Element Removal",
                    type: "checkbox",
                    checked: breakpoints.findBreakpoint(node, BP_BREAKONREMOVE),
                    command: FBL.bindFixed(this.onModifyBreakpoint, this, context, node,
                        BP_BREAKONREMOVE)}
            );
        }
    },

    onModifyBreakpoint: function(context, node, type)
    {
        var xpath = FBL.getElementXPath(node);
        if (FBTrace.DBG_HTML)
            FBTrace.sysout("html.onModifyBreakpoint " + xpath );

        var breakpoints = context.mutationBreakpoints;
        var bp = breakpoints.findBreakpoint(node, type);

        // Remove an existing or create new breakpoint.
        if (bp)
            breakpoints.removeBreakpoint(bp);
        else
            context.mutationBreakpoints.addBreakpoint(node, type);

        Events.dispatch( Firebug.HTMLModule.fbListeners, "onModifyBreakpoint", [context, xpath, type]);
    },
};

Firebug.HTMLModule.Breakpoint = function(node, type)
{
    this.node = node;
    this.xpath = FBL.getElementXPath(node);
    this.checked = true;
    this.type = type;
};

Firebug.HTMLModule.BreakpointRep = domplate(Firebug.Rep,
{
    inspectable: false,

    tag:
        DIV({"class": "breakpointRow focusRow", _repObject: "$bp",
            role: "option", "aria-checked": "$bp.checked"},
            DIV({"class": "breakpointBlockHead", onclick: "$onEnable"},
                INPUT({"class": "breakpointCheckbox", type: "checkbox",
                    _checked: "$bp.checked", tabindex : "-1"}),
                TAG("$bp.node|getNodeTag", {object: "$bp.node"}),
                DIV({"class": "breakpointMutationType"}, "$bp|getChangeLabel"),
                IMG({"class": "closeButton", src: "blank.gif", onclick: "$onRemove"})
            ),
            DIV({"class": "breakpointCode"},
                TAG("$bp.node|getSourceLine", {object: "$bp.node"})
            )
        ),

    getNodeTag: function(node)
    {
        var rep = Firebug.getRep(node, Firebug.currentContext);
        return rep.shortTag ? rep.shortTag : rep.tag;
    },

    getSourceLine: function(node)
    {
        return getNodeTag(node, false);
    },

    getChangeLabel: function(bp)
    {
        switch (bp.type)
        {
        case BP_BREAKONATTRCHANGE:
            return Locale.$STR("html.label.Break On Attribute Change");
        case BP_BREAKONCHILDCHANGE:
            return Locale.$STR("html.label.Break On Child Addition or Removal");
        case BP_BREAKONREMOVE:
            return Locale.$STR("html.label.Break On Element Removal");
        case BP_BREAKONTEXT:
            return Locale.$STR("html.label.Break On Text Change");
        }

        return "";
    },

    onRemove: function(event)
    {
        Events.cancelEvent(event);

        var bpPanel = Firebug.getElementPanel(event.target);
        var context = bpPanel.context;

        if (FBL.hasClass(event.target, "closeButton"))
        {
            // Remove from list of breakpoints.
            var row = FBL.getAncestorByClass(event.target, "breakpointRow");
            context.mutationBreakpoints.removeBreakpoint(row.repObject);

            bpPanel.refresh();
        }
    },

    onEnable: function(event)
    {
        var checkBox = event.target;
        if (!FBL.hasClass(checkBox, "breakpointCheckbox"))
            return;

        var bpPanel = Firebug.getElementPanel(event.target);
        var context = bpPanel.context;

        var panel = context.getPanel("html", true);
        if (panel)
            // xxxsz: Needs a better way to update display of breakpoint than invalidate the whole panel's display
            panel.context.invalidatePanels("breakpoints");

        var bp = FBL.getAncestorByClass(checkBox, "breakpointRow").repObject;
        bp.checked = checkBox.checked;
    },

    supportsObject: function(object, type)
    {
        return object instanceof Firebug.HTMLModule.Breakpoint;
    }
});

// ************************************************************************************************

function MutationBreakpointGroup()
{
    this.breakpoints = [];
}

MutationBreakpointGroup.prototype = FBL.extend(new Firebug.Breakpoint.BreakpointGroup(),
{
    name: "mutationBreakpoints",
    title: Locale.$STR("html.label.HTML Breakpoints"),

    addBreakpoint: function(node, type)
    {
        this.breakpoints.push(new Firebug.HTMLModule.Breakpoint(node, type));
    },

    matchBreakpoint: function(bp, args)
    {
        var node = args[0];
        var type = args[1];
        return (bp.node == node) && (!bp.type || bp.type == type);
    },

    removeBreakpoint: function(bp)
    {
        FBL.remove(this.breakpoints, bp);
    },

    // Persistence
    load: function(context)
    {
        var panelState = FBL.getPersistedState(context, "html");
        if (panelState.breakpoints)
            this.breakpoints = panelState.breakpoints;

        this.enumerateBreakpoints(function(bp)
        {
            var elts = FBL.getElementsByXPath(context.window.document, bp.xpath);
            bp.node = elts && elts.length ? elts[0] : null;
        });
    },

    store: function(context)
    {
        this.enumerateBreakpoints(function(bp)
        {
            bp.node = null;
        });

        var panelState = FBL.getPersistedState(context, "html");
        panelState.breakpoints = this.breakpoints;
    },
});


// ************************************************************************************************
// Registration

Firebug.registerPanel(Firebug.HTMLPanel);
Firebug.registerModule(Firebug.HTMLModule);
Firebug.registerRep(Firebug.HTMLModule.BreakpointRep);

return Firebug.HTMLModule;

// ************************************************************************************************
}});
