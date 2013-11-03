/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/xml",
],
function(Obj, Firebug, Events, Css, Dom, Xml) {

// ************************************************************************************************

/**
 * View interface used to populate an InsideOutBox object.
 *
 * All views must implement this interface (directly or via duck typing).
 */
var InsideOutBoxView = {
    /**
     * Retrieves the parent object for a given child object.
     */
    getParentObject: function(child) {},

    /**
     * Retrieves a given child node.
     *
     * If both index and previousSibling are passed, the implementation
     * may assume that previousSibling will be the return for getChildObject
     * with index-1.
     */
    getChildObject: function(parent, index, previousSibling) {},

    /**
     * Renders the HTML representation of the object. Should return an HTML
     * object which will be displayed to the user.
     */
    createObjectBox: function(object, isRoot) {}
};

/**
 * Creates a tree based on objects provided by a separate "view" object.
 *
 * Construction uses an "inside-out" algorithm, meaning that the view's job is first
 * to tell us the ancestry of each object, and secondarily its descendants.
 */
Firebug.InsideOutBox = function(view, box)
{
    this.view = view;
    this.box = box;

    this.rootObject = null;

    this.rootObjectBox = null;
    this.selectedObjectBox = null;
    this.highlightedObjectBox = null;

    this.onMouseDown = Obj.bind(this.onMouseDown, this);
    Events.addEventListener(this.box, "mousedown", this.onMouseDown, false);
};

Firebug.InsideOutBox.prototype =
{
    destroy: function()
    {
        Events.removeEventListener(this.box, "mousedown", this.onMouseDown, false);
    },

    highlight: function(object)
    {
        var objectBox = this.createObjectBox(object);
        this.highlightObjectBox(objectBox);
        return objectBox;
    },

    openObject: function(object)
    {
        var firstChild = this.view.getChildObject(object, 0);
        if (firstChild)
            object = firstChild;

        var objectBox = this.createObjectBox(object);
        this.openObjectBox(objectBox);
        return objectBox;
    },

    openToObject: function(object)
    {
        var objectBox = this.createObjectBox(object);
        this.openObjectBox(objectBox);
        return objectBox;
    },

    select: function(object, makeBoxVisible, forceOpen, noScrollIntoView)
    {
        if (FBTrace.DBG_HTML)
            FBTrace.sysout("insideOutBox.select object:"+object, object);

        var objectBox = this.createObjectBox(object);
        this.selectObjectBox(objectBox, forceOpen);

        if (makeBoxVisible)
        {
            this.openObjectBox(objectBox);
            if (!noScrollIntoView)
                Dom.scrollIntoCenterView(objectBox, this.box);
        }

        return objectBox;
    },

    toggleObject: function(object, all, exceptions)
    {
        var objectBox = this.createObjectBox(object);
        if (!objectBox)
            return;

        if (Css.hasClass(objectBox, "open"))
            this.contractObjectBox(objectBox, all);
        else
            this.expandObjectBox(objectBox, all, exceptions);
    },

    expandObject: function(object, expandAll)
    {
        var objectBox = this.createObjectBox(object);
        if (objectBox)
            this.expandObjectBox(objectBox, expandAll);
    },

    contractObject: function(object, contractAll)
    {
        var objectBox = this.createObjectBox(object);
        if (objectBox)
            this.contractObjectBox(objectBox, contractAll);
    },

    highlightObjectBox: function(objectBox)
    {
        if (this.highlightedObjectBox)
        {
            Css.removeClass(this.highlightedObjectBox, "highlighted");

            var highlightedBox = this.getParentObjectBox(this.highlightedObjectBox);
            for (; highlightedBox; highlightedBox = this.getParentObjectBox(highlightedBox))
                Css.removeClass(highlightedBox, "highlightOpen");
        }

        this.highlightedObjectBox = objectBox;

        if (objectBox)
        {
            Css.setClass(objectBox, "highlighted");

            var highlightedBox = this.getParentObjectBox(objectBox);
            for (; highlightedBox; highlightedBox = this.getParentObjectBox(highlightedBox))
                Css.setClass(highlightedBox, "highlightOpen");

            Dom.scrollIntoCenterView(objectBox, this.box);
        }
    },

    selectObjectBox: function(objectBox, forceOpen)
    {
        var panel = Firebug.getElementPanel(objectBox);

        if (!panel)
        {
            if (FBTrace.DBG_ERRORS && FBTrace.DBG_HTML)
                FBTrace.sysout("selectObjectBox no panel for " + objectBox, objectBox);
            return;
        }

        var isSelected = this.selectedObjectBox && objectBox == this.selectedObjectBox;
        if (!isSelected)
        {
            Css.removeClass(this.selectedObjectBox, "selected");
            Events.dispatch(panel.fbListeners, "onObjectBoxUnselected", [this.selectedObjectBox]);
            this.selectedObjectBox = objectBox;

            if (objectBox)
            {
                Css.setClass(objectBox, "selected");

                // Force it open the first time it is selected
                if (forceOpen)
                    this.toggleObjectBox(objectBox, true);
            }
        }
        Events.dispatch(panel.fbListeners, "onObjectBoxSelected", [objectBox]);
    },

    openObjectBox: function(objectBox)
    {
        if (objectBox)
        {
            // Set all of the node's ancestors to be permanently open
            var parentBox = this.getParentObjectBox(objectBox);
            var labelBox;
            for (; parentBox; parentBox = this.getParentObjectBox(parentBox))
            {
                Css.setClass(parentBox, "open");
                labelBox = parentBox.getElementsByClassName("nodeLabelBox").item(0);
                if (labelBox)
                    labelBox.setAttribute("aria-expanded", "true");
            }
        }
    },

    expandObjectBox: function(objectBox, expandAll, exceptions)
    {
        var nodeChildBox = this.getChildObjectBox(objectBox);
        if (!nodeChildBox)
            return;

        if (!objectBox.populated)
        {
            var firstChild = this.view.getChildObject(objectBox.repObject, 0);
            this.populateChildBox(firstChild, nodeChildBox);
        }

        var labelBox = objectBox.getElementsByClassName("nodeLabelBox").item(0);
        if (labelBox)
            labelBox.setAttribute("aria-expanded", "true");
        Css.setClass(objectBox, "open");

        // Recursively expand all child boxes
        if (expandAll)
        {
            for (var child = nodeChildBox.firstChild; child; child = child.nextSibling)
            {
                if (exceptions && child.repObject)
                {
                    var localName = child.repObject.localName;
                    localName = localName && localName.toLowerCase();

                    if (exceptions.indexOf(localName) !== -1 &&
                        Xml.isElementHTMLOrXHTML(child.repObject))
                    {
                        continue;
                    }
                }

                if (Css.hasClass(child, "containerNodeBox"))
                    this.expandObjectBox(child, expandAll, exceptions);
            }
        }
    },

    contractObjectBox: function(objectBox, contractAll)
    {
        Css.removeClass(objectBox, "open");

        var nodeLabel = objectBox.getElementsByClassName("nodeLabel").item(0);
        var labelBox = nodeLabel.getElementsByClassName('nodeLabelBox').item(0);
        if (labelBox)
            labelBox.setAttribute("aria-expanded", "false");

        if (contractAll)
        {
            // Recursively contract all child boxes
            var nodeChildBox = this.getChildObjectBox(objectBox);
            if (!nodeChildBox)
                return;

            for (var child = nodeChildBox.firstChild; child; child = child.nextSibling)
            {
                if (Css.hasClass(child, "containerNodeBox") && Css.hasClass(child, "open"))
                    this.contractObjectBox(child, contractAll);
            }
        }
    },

    toggleObjectBox: function(objectBox, forceOpen)
    {
        var isOpen = Css.hasClass(objectBox, "open");
        var nodeLabel = objectBox.getElementsByClassName("nodeLabel").item(0);
        var labelBox = nodeLabel.getElementsByClassName('nodeLabelBox').item(0);
        if (labelBox)
            labelBox.setAttribute("aria-expanded", isOpen);

        if (!forceOpen && isOpen)
            this.contractObjectBox(objectBox);
        else if (!isOpen)
            this.expandObjectBox(objectBox);
    },

    getNextObjectBox: function(objectBox)
    {
        return Dom.findNext(objectBox, isVisibleTarget, false, this.box);
    },

    getPreviousObjectBox: function(objectBox)
    {
        return Dom.findPrevious(objectBox, isVisibleTarget, true, this.box);
    },

    getNextSiblingObjectBox: function(objectBox)
    {
        if (!objectBox)
            return null;
        return Dom.findNext(objectBox, isVisibleTarget, true, objectBox.parentNode);
    },

    /**
     * Creates all of the boxes for an object, its ancestors, and siblings.
     */
    createObjectBox: function(object)
    {
        if (!object)
            return null;

        this.rootObject = this.getRootNode(object);

        // Get or create all of the boxes for the target and its ancestors
        var objectBox = this.createObjectBoxes(object, this.rootObject);

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("----insideOutBox.createObjectBox: createObjectBoxes(object="+
                formatNode(object)+", rootObject="+formatNode(this.rootObject)+") ="+
                formatNode(objectBox), objectBox);

        if (!objectBox)  // we found an object outside of the navigatible tree
            return;
        else if (object == this.rootObject)
            return objectBox;
        else
            return this.populateChildBox(object, objectBox.parentNode);
    },

    /**
     * Creates all of the boxes for an object, its ancestors, and siblings up to a root.
     */
    createObjectBoxes: function(object, rootObject)
    {
        if (!object)
            return null;

        if (object == rootObject)
        {
            if (!this.rootObjectBox || this.rootObjectBox.repObject != rootObject)
            {
                if (this.rootObjectBox)
                {
                    try
                    {
                        this.box.removeChild(this.rootObjectBox);
                    }
                    catch (exc)
                    {
                        if (FBTrace.DBG_HTML)
                            FBTrace.sysout(" this.box.removeChild(this.rootObjectBox) FAILS "+
                                this.box+" must not contain "+this.rootObjectBox);
                    }
                }

                this.highlightedObjectBox = null;
                this.selectedObjectBox = null;
                this.rootObjectBox = this.view.createObjectBox(object, true);
                this.box.appendChild(this.rootObjectBox);
            }

            if (FBTrace.DBG_HTML)
            {
                FBTrace.sysout("insideOutBox.createObjectBoxes("+formatNode(object)+","+
                    formatNode(rootObject)+") rootObjectBox: "+this.rootObjectBox, object);
            }

            if ((FBTrace.DBG_HTML || FBTrace.DBG_ERRORS) && !this.rootObjectBox.parentNode)
                FBTrace.sysout("insideOutBox.createObjectBoxes; ERROR - null parent node. "+
                    "object: " + formatNode(object)+", rootObjectBox: "+
                        formatObjectBox(this.rootObjectBox), object);

            return this.rootObjectBox;
        }
        else
        {
            var parentNode = this.view.getParentObject(object);

            if (FBTrace.DBG_HTML)
                FBTrace.sysout("insideOutBox.createObjectBoxes createObjectBoxes recursing " +
                    "with parentNode "+formatNode(parentNode)+" from object "+formatNode(object));

            // recurse towards parent, eventually returning rootObjectBox
            var parentObjectBox = this.createObjectBoxes(parentNode, rootObject);

            if (FBTrace.DBG_HTML)
                FBTrace.sysout("insideOutBox.createObjectBoxes createObjectBoxes("+
                    formatNode(parentNode)+","+formatNode(rootObject)+"):parentObjectBox: "+
                        formatObjectBox(parentObjectBox), parentObjectBox);

            if (!parentObjectBox)
                return null;

            // Returns an inner box (nodeChildBox) that contains list of child boxes (nodeBox).
            var childrenBox = this.getChildObjectBox(parentObjectBox);

            if (FBTrace.DBG_HTML)
                FBTrace.sysout("insideOutBox.createObjectBoxes getChildObjectBox("+
                    formatObjectBox(parentObjectBox)+")= childrenBox: "+formatObjectBox(childrenBox));

            if (!childrenBox)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("insideOutBox.createObjectBoxes FAILS for "+formatNode(object)+
                        " getChildObjectBox("+formatObjectBox(parentObjectBox)+")= childrenBox: "+
                        formatObjectBox(childrenBox));

                // This is where we could try to create a box for objects we cannot get to by
                // navigation via walker or DOM nodes (native anonymous)
                return null;
            }

            var childObjectBox = this.findChildObjectBox(childrenBox, object);

            if (FBTrace.DBG_HTML)
                FBTrace.sysout("insideOutBox.createObjectBoxes findChildObjectBox("+
                    formatNode(childrenBox)+","+formatNode(object)+"): childObjectBox: "+
                        formatObjectBox(childObjectBox), childObjectBox);

            return childObjectBox ? childObjectBox : this.populateChildBox(object, childrenBox);
        }
    },

    findObjectBox: function(object)
    {
        if (!object)
            return null;

        if (object == this.rootObject)
            return this.rootObjectBox;
        else
        {
            var parentNode = this.view.getParentObject(object);
            var parentObjectBox = this.findObjectBox(parentNode);
            if (!parentObjectBox)
                return null;

            var childrenBox = this.getChildObjectBox(parentObjectBox);
            if (!childrenBox)
                return null;

            return this.findChildObjectBox(childrenBox, object);
        }
    },

    appendChildBox: function(parentNodeBox, repObject)
    {
        var childBox = this.getChildObjectBox(parentNodeBox);
        var objectBox = this.findChildObjectBox(childBox, repObject);
        if (objectBox)
            return objectBox;

        objectBox = this.view.createObjectBox(repObject);
        if (objectBox)
        {
            var childBox = this.getChildObjectBox(parentNodeBox);
            childBox.appendChild(objectBox);
        }
        return objectBox;
    },

    insertChildBoxBefore: function(parentNodeBox, repObject, nextSibling)
    {
        var childBox = this.getChildObjectBox(parentNodeBox);
        var objectBox = this.findChildObjectBox(childBox, repObject);
        if (objectBox)
            return objectBox;

        objectBox = this.view.createObjectBox(repObject);
        if (objectBox)
        {
            var siblingBox = this.findChildObjectBox(childBox, nextSibling);
            childBox.insertBefore(objectBox, siblingBox);
        }
        return objectBox;
    },

    removeChildBox: function(parentNodeBox, repObject)
    {
        var childBox = this.getChildObjectBox(parentNodeBox);
        var objectBox = this.findChildObjectBox(childBox, repObject);
        if (objectBox)
            childBox.removeChild(objectBox);
    },

    // We want all children of the parent of repObject.
    populateChildBox: function(repObject, nodeChildBox)
    {
        if (!repObject)
            return null;

        var parentObjectBox = Dom.getAncestorByClass(nodeChildBox, "nodeBox");

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("+++insideOutBox.populateChildBox("+
                Css.getElementCSSSelector(repObject)+") parentObjectBox.populated "+
                parentObjectBox.populated);

        if (parentObjectBox.populated)
            return this.findChildObjectBox(nodeChildBox, repObject);

        var lastSiblingBox = this.getChildObjectBox(nodeChildBox);
        var siblingBox = nodeChildBox.firstChild;
        var targetBox = null;

        var view = this.view;

        var targetSibling = null;
        var parentNode = view.getParentObject(repObject);
        for (var i = 0; 1; ++i)
        {
            targetSibling = view.getChildObject(parentNode, i, targetSibling);
            if (!targetSibling)
                break;

            // Check if we need to start appending, or continue to insert before
            if (lastSiblingBox && lastSiblingBox.repObject == targetSibling)
                lastSiblingBox = null;

            if (!siblingBox || siblingBox.repObject != targetSibling)
            {
                var newBox = view.createObjectBox(targetSibling);
                if (newBox)
                {
                    if (!nodeChildBox)
                        FBTrace.sysout("insideOutBox FAILS no nodeChildBox "+repObject, repObject);

                    if (lastSiblingBox)
                    {
                        try
                        {
                            nodeChildBox.insertBefore(newBox, lastSiblingBox);
                        }
                        catch(exc)
                        {
                            FBTrace.sysout("insideOutBox FAILS insertBefore",
                                {repObject:repObject, nodeChildBox: nodeChildBox, newBox: newBox,
                                lastSiblingBox: lastSiblingBox});
                        }
                    }
                    else
                        nodeChildBox.appendChild(newBox);
                }

                siblingBox = newBox;
            }

            if (targetSibling == repObject)
                targetBox = siblingBox;

            if (siblingBox && siblingBox.repObject == targetSibling)
                siblingBox = siblingBox.nextSibling;
        }

        if (targetBox)
            parentObjectBox.populated = true;

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("---insideOutBox.populateChildBox("+
                (repObject.localName?repObject.localName:repObject)+") targetBox "+targetBox);

        return targetBox;
    },

    getParentObjectBox: function(objectBox)
    {
        var parent = objectBox.parentNode ? objectBox.parentNode.parentNode : null;
        return parent && parent.repObject ? parent : null;
    },

    getChildObjectBox: function(objectBox)
    {
        return objectBox.getElementsByClassName("nodeChildBox").item(0);
    },

    findChildObjectBox: function(parentNodeBox, repObject)
    {
        for (var childBox = parentNodeBox.firstChild; childBox; childBox = childBox.nextSibling)
        {
            if (FBTrace.DBG_HTML)
                FBTrace.sysout("insideOutBox.findChildObjectBox repObject: " +
                    formatNode(repObject)+" in "+formatNode(childBox)+" = "+
                    formatNode(childBox.repObject),
                    {childBoxRepObject: childBox.repObject,repObject:repObject});

            if (childBox.repObject == repObject)
                return childBox;
        }

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("insideOutBox.findChildObjectBox no match for repObject: " +
                formatNode(repObject)+" in "+formatNode(parentNodeBox));
    },

    /**
     * Determines if the given node is an ancestor of the current root.
     */
    isInExistingRoot: function(node)
    {
        if (FBTrace.DBG_HTML)
            var dbg_isInExistingRoot = "";

        var parentNode = node;
        while (parentNode && parentNode != this.rootObject)
        {
            if (FBTrace.DBG_HTML)
                dbg_isInExistingRoot = dbg_isInExistingRoot + parentNode.localName+" < ";

            parentNode = this.view.getParentObject(parentNode);
        }

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("insideOutBox.isInExistingRoot  "+dbg_isInExistingRoot+
                ": (parentNode == this.rootObject)="+(parentNode == this.rootObject));

        return parentNode == this.rootObject;
    },

    getRootNode: function(node)
    {
        if (FBTrace.DBG_HTML)
            var dbg_getRootNode = "";

        while (1)
        {
            var parentNode = this.view.getParentObject(node);

            if (!parentNode)
                break;

            if (FBTrace.DBG_HTML)
                dbg_getRootNode += node.localName+" < ";

            node = parentNode;
        }

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("insideOutBox.getRootNode "+dbg_getRootNode);

        return node;
    },

    // ********************************************************************************************

    onMouseDown: function(event)
    {
        var hitTwisty = false;
        for (var child = event.target; child; child = child.parentNode)
        {
            if (Css.hasClass(child, "twisty"))
                hitTwisty = true;
            else if (child.repObject)
            {
                if (hitTwisty)
                    this.toggleObjectBox(child);
                break;
            }
        }
    }
};

// ************************************************************************************************
// Local Helpers

function isVisibleTarget(node)
{
    if (node.repObject && node.repObject.nodeType == Node.ELEMENT_NODE)
    {
        for (var parent = node.parentNode; parent; parent = parent.parentNode)
        {
            if (Css.hasClass(parent, "nodeChildBox")
                && !Css.hasClass(parent.parentNode, "open")
                && !Css.hasClass(parent.parentNode, "highlightOpen"))
                return false;
        }
        return true;
    }
}

function formatNode(object)
{
    if (object)
    {
        if (!object.localName)
        {
            var str = object.toString();
            if (str)
                return str;
            else
                return "(an object with no localName or toString result)";
        }
        else  return Css.getElementCSSSelector(object);
    }
    else
        return "(null object)";
}

function formatObjectBox(object)
{
    if (object)
    {
        if (object.localName)
            return Css.getElementCSSSelector(object);
        return object.textContent;
    }
    else
        return "(null object)";
}

function getObjectPath(element, aView)
{
    var path = [];
    for (; element; element = aView.getParentObject(element))
        path.push(element);

    return path;
}

// ************************************************************************************************
// Registration

return Firebug.InsideOutBox;

// ************************************************************************************************
});
