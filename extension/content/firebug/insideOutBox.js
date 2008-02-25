/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

/**
 * Creates a tree based on objects provided by a separate "view" object.
 *
 * Construction uses an "inside-out" algorithm, meaning that the view's job is first
 * to tell us the ancestry of each object, and secondarily its descendants.
 */
top.InsideOutBox = function(view, box)
{
    this.view = view;
    this.box = box;

    this.rootObject = null;

    this.rootObjectBox = null;
    this.selectedObjectBox = null;
    this.highlightedObjectBox = null;

    this.onMouseDown = bind(this.onMouseDown, this);
    box.addEventListener("mousedown", this.onMouseDown, false);
};

InsideOutBox.prototype =
{
    destroy: function()
    {
        this.box.removeEventListener("mousedown", this.onMouseDown, false);
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
        if (FBTrace.DBG_HTML) FBTrace.dumpProperties("insideOutBox.select object:", object);                     /*@explore*/
        var objectBox = this.createObjectBox(object);
        this.selectObjectBox(objectBox, forceOpen);
        if (makeBoxVisible)
        {
            this.openObjectBox(objectBox);
            if (!noScrollIntoView)
                scrollIntoCenterView(objectBox);
        }
        return objectBox;
    },

    expandObject: function(object)
    {
        var objectBox = this.createObjectBox(object);
        if (objectBox)
            this.expandObjectBox(objectBox);
    },

    contractObject: function(object)
    {
        var objectBox = this.createObjectBox(object);
        if (objectBox)
            this.contractObjectBox(objectBox);
    },

    highlightObjectBox: function(objectBox)
    {
        if (this.highlightedObjectBox)
        {
            removeClass(this.highlightedObjectBox, "highlighted");

            var highlightedBox = this.getParentObjectBox(this.highlightedObjectBox);
            for (; highlightedBox; highlightedBox = this.getParentObjectBox(highlightedBox))
                removeClass(highlightedBox, "highlightOpen");
        }

        this.highlightedObjectBox = objectBox;

        if (objectBox)
        {
            setClass(objectBox, "highlighted");

            var highlightedBox = this.getParentObjectBox(objectBox);
            for (; highlightedBox; highlightedBox = this.getParentObjectBox(highlightedBox))
                setClass(highlightedBox, "highlightOpen");

           scrollIntoCenterView(objectBox);
        }
    },

    selectObjectBox: function(objectBox, forceOpen)
    {
        var isSelected = this.selectedObjectBox && objectBox == this.selectedObjectBox;
        if (!isSelected)
        {
            removeClass(this.selectedObjectBox, "selected");

            this.selectedObjectBox = objectBox;

            if (objectBox)
            {
                setClass(objectBox, "selected");

                // Force it open the first time it is selected
                if (forceOpen)
                    this.toggleObjectBox(objectBox, true);
            }
        }
    },

    openObjectBox: function(objectBox)
    {
        if (objectBox)
        {
            // Set all of the node's ancestors to be permanently open
            var parentBox = this.getParentObjectBox(objectBox);
            for (; parentBox; parentBox = this.getParentObjectBox(parentBox))
                setClass(parentBox, "open");
        }
    },

    expandObjectBox: function(objectBox)
    {
        var nodeChildBox = this.getChildObjectBox(objectBox);
        if (!nodeChildBox)
            return;

        if (!objectBox.populated)
        {
            var firstChild = this.view.getChildObject(objectBox.repObject, 0);
            this.populateChildBox(firstChild, nodeChildBox);
        }

        setClass(objectBox, "open");
    },

    contractObjectBox: function(objectBox)
    {
        removeClass(objectBox, "open");
    },

    toggleObjectBox: function(objectBox, forceOpen)
    {
        var isOpen = hasClass(objectBox, "open");
        if (!forceOpen && isOpen)
            this.contractObjectBox(objectBox);

        else if (!isOpen)
            this.expandObjectBox(objectBox);
    },

    getNextObjectBox: function(objectBox)
    {
        return findNext(objectBox, isVisibleTarget, false, this.box);
    },

    getPreviousObjectBox: function(objectBox)
    {
        return findPrevious(objectBox, isVisibleTarget, true, this.box);
    },

    /**
     * Creates all of the boxes for an object, its ancestors, and siblings.
     */
    createObjectBox: function(object)
    {
        if (!object)
            return null;

       // var rootObject = this.rootObject;
       // if (!rootObject)
            this.rootObject = this.getRootNode(object);
      //  else                                                                                                           /*@explore*/
      //      if (FBTrace.DBG_HTML)                                                                                      /*@explore*/
      //      {                                                                                                          /*@explore*/
      //          FBTrace.sysout("Root already set:");                                                                   /*@explore*/
      //          this.getRootNode(object);                                                                              /*@explore*/
      //      }                                                                                                          /*@explore*/

        // Get or create all of the boxes for the target and its ancestors
        var objectBox = this.createObjectBoxes(object, this.rootObject);

        if (FBTrace.DBG_HTML)                                                                                          /*@explore*/
            FBTrace.sysout("\n----\ninsideOutBox.createObjectBox for object="+formatNode(object)+" got objectBox="+formatNode(objectBox)+"\n");/*@explore*/
                                                                                                                       /*@explore*/
        if (!objectBox)
            return null;
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
        if (FBTrace.DBG_HTML)                                                                                          /*@explore*/
            FBTrace.sysout("\n----\ninsideOutBox.createObjectBoxes("+formatNode(object)+", "+formatNode(rootObject)+")\n");                          /*@explore*/
        if (!object)
            return null;

        if (object == rootObject)
        {
            if (!this.rootObjectBox || this.rootObjectBox.repObject != rootObject)
            {
                if (this.rootObjectBox)
                {
                    try {
                        this.box.removeChild(this.rootObjectBox);
                    } catch (exc) {
                        if (FBTrace.DBG_HTML || true) FBTrace.sysout(" this.box.removeChild(this.rootObjectBox) FAILS "+this.box+" must not contain "+this.rootObjectBox+"\n");
                    }
                }

                this.highlightedObjectBox = null;
                this.selectedObjectBox = null;
                this.rootObjectBox = this.view.createObjectBox(object, true);
                this.box.appendChild(this.rootObjectBox);
            }
            if (FBTrace.DBG_HTML)                                                                                      /*@explore*/
                FBTrace.sysout("insideOutBox.createObjectBoxes("+formatNode(object)+","+formatNode(rootObject)+") rootObjectBox: "             /*@explore*/
                                            +this.rootObjectBox+"\n\n");                                               /*@explore*/
            return this.rootObjectBox;
        }
        else
        {
            var parentNode = this.view.getParentObject(object);
            if (FBTrace.DBG_HTML)                                                                                      /*@explore*/
                FBTrace.sysout("insideOutBox.createObjectBoxes view.getParentObject("+formatNode(object)+")=parentNode: "+formatNode(parentNode)+"\n"); /*@explore*/

            var parentObjectBox = this.createObjectBoxes(parentNode, rootObject);
            if (FBTrace.DBG_HTML)                                                                                      /*@explore*/
                FBTrace.sysout("insideOutBox.createObjectBoxes createObjectBoxes("+formatNode(parentNode)+","+formatNode(rootObject)+"):parentNode: "+formatNode(parentObjectBox)+"\n"); /*@explore*/
            if (!parentObjectBox)
                return null;

            var parentChildBox = this.getChildObjectBox(parentObjectBox);
            if (FBTrace.DBG_HTML)                                                                                      /*@explore*/
                FBTrace.sysout("insideOutBox.createObjectBoxes getChildObjectBox("+formatNode(parentObjectBox)+")= parentChildBox: "+formatNode(parentChildBox)+"\n"); /*@explore*/
            if (!parentChildBox)
                return null;

            var childObjectBox = this.findChildObjectBox(parentChildBox, object);
            if (FBTrace.DBG_HTML)                                                                                      /*@explore*/
                FBTrace.sysout("insideOutBox.createObjectBoxes findChildObjectBox("+formatNode(parentChildBox)+","+formatNode(object)+"): childObjectBox: "+formatNode(childObjectBox)+"\n"); /*@explore*/
            return childObjectBox
                ? childObjectBox
                : this.populateChildBox(object, parentChildBox);
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

            var parentChildBox = this.getChildObjectBox(parentObjectBox);
            if (!parentChildBox)
                return null;

            return this.findChildObjectBox(parentChildBox, object);
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

    populateChildBox: function(repObject, nodeChildBox)  // We want all children of the parent of repObject.
    {
        if (!repObject)
            return null;

        var parentObjectBox = nodeChildBox.parentNode;
        if (FBTrace.DBG_HTML)                                                                                          /*@explore*/
                FBTrace.sysout("+++insideOutBox.populateChildBox("+(repObject.localName?repObject.localName:repObject)+") parentObjectBox.populated "+parentObjectBox.populated+"\n"); /*@explore*/
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
                    if (lastSiblingBox)
                        nodeChildBox.insertBefore(newBox, lastSiblingBox);
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
        if (FBTrace.DBG_HTML)                                                                                          /*@explore*/
                FBTrace.sysout("---insideOutBox.populateChildBox("+(repObject.localName?repObject.localName:repObject)+") targetBox "+targetBox+"\n");              /*@explore*/

        return targetBox;
    },

    getParentObjectBox: function(objectBox)
    {
        var parent = objectBox.parentNode ? objectBox.parentNode.parentNode : null;
        return parent && parent.repObject ? parent : null;
    },

    getChildObjectBox: function(objectBox)
    {
        return getChildByClass(objectBox, "nodeChildBox");
    },

    findChildObjectBox: function(parentNodeBox, repObject)
    {
        for (var childBox = parentNodeBox.firstChild; childBox; childBox = childBox.nextSibling)
        {
            if (FBTrace.DBG_HTML)                                                                                      /*@explore*/
                FBTrace.sysout("insideOutBox.findChildObjectBox "+(childBox.repObject == repObject?"match ":"no match ")+" childBox.repObject: "+(childBox.repObject.localName?childBox.repObject.localName:childBox.repObject) +" repObject: "+(repObject.localName?repObject.localName:repObject)+"\n"); /*@explore*/
            if (childBox.repObject == repObject)
                return childBox;
        }
    },

    getRootNode: function(node)
    {
        if (FBTrace.DBG_HTML)                                                                                          /*@explore*/
            FBTrace.sysout("insideOutBox.getRootNode for ");                                                           /*@explore*/
        while (1)
        {
            if (FBTrace.DBG_HTML)                                                                                      /*@explore*/
                FBTrace.sysout(node.localName+" < ");                                                                        /*@explore*/
            var parentNode = this.view.getParentObject(node);
            if (FBTrace.DBG_HTML)                                													   /*@explore*/
                FBTrace.sysout((parentNode?" (parent="+parentNode.localName+")":" (null parentNode)"+"\n"));                                 /*@explore*/

            if (!parentNode)
                return node;
            else
                node = parentNode;
        }
        return null;
    },

    // ********************************************************************************************

    onMouseDown: function(event)
    {
        var hitTwisty = false;
        for (var child = event.target; child; child = child.parentNode)
        {
            if (hasClass(child, "twisty"))
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
    if (node.repObject && node.repObject.nodeType == 1)
    {
        for (var parent = node.parentNode; parent; parent = parent.parentNode)
        {
            if (hasClass(parent, "nodeChildBox")
                && !hasClass(parent.parentNode, "open")
                && !hasClass(parent.parentNode, "highlightOpen"))
                return false;
        }
        return true;
    }
}

function formatNode(object)
{
    if (object)
        return (object.localName ? object.localName : object);
    else
        return "(null object)";
}

}});
