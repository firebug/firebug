/* See license.txt for terms of usage */

define([
    "firebug/lib/array",
    "firebug/lib/object",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/options",
    "firebug/lib/search",
    "firebug/lib/xml",
    "firebug/lib/xpath",
    "firebug/lib/string",
],
function(Arr, Obj, Events, Css, Dom, Options, Search, Xml, Xpath, Str) {

// ********************************************************************************************* //
// Constants

const Ci = Components.interfaces;
const SHOW_ALL = Ci.nsIDOMNodeFilter.SHOW_ALL;

// ********************************************************************************************* //

/**
 * @class Static utility class. Contains utilities used for displaying and
 *        searching a HTML tree.
 */
var HTMLLib =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Node Search Utilities

    /**
     * Constructs a NodeSearch instance.
     *
     * @class Class used to search a DOM tree for the given text. Will display
     *        the search results in a IO Box.
     *
     * @constructor
     * @param {String} text Text to search for
     * @param {Object} root Root of search. This may be an element or a document
     * @param {Object} panelNode Panel node containing the IO Box representing the DOM tree.
     * @param {Object} ioBox IO Box to display the search results in
     * @param {Object} walker Optional walker parameter.
     */
    NodeSearch: function(text, root, panelNode, ioBox, walker)
    {
        root = root.documentElement || root;
        walker = walker || new HTMLLib.DOMWalker(root);
        var re = new Search.ReversibleRegExp(text, "m");
        var matchCount = 0;
        var nodeSet = new Set();

        // Try also to parse the text as a CSS or XPath selector, and merge
        // the result sets together.
        try
        {
            var isXPath = (text.charAt(0) === "/");
            function eachDoc(doc)
            {
                var nodes = isXPath ?
                    Xpath.evaluateXPath(doc, text, doc, XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE) :
                    doc.querySelectorAll(text);

                for (var i = 0, len = nodes.length; i < len; ++i)
                    nodeSet.add(nodes[i]);

                var frames = doc.querySelectorAll("frame, iframe");
                for (var i = 0, len = frames.length; i < len; ++i)
                {
                    var fr = frames[i];
                    if (fr.contentDocument)
                        eachDoc(fr.contentDocument);
                }
            }
            eachDoc(root.ownerDocument || root);
        }
        catch (exc)
        {
            // Not a valid selector.
            nodeSet = null;
        }

        /**
         * Finds the first match within the document.
         *
         * @param {boolean} revert true to search backward, false to search forward
         * @param {boolean} caseSensitive true to match exact case, false to ignore case
         * @return true if no more matches were found, but matches were found previously.
         */
        this.find = function(reverse, caseSensitive)
        {
            var match = this.findNextMatch(reverse, caseSensitive);
            if (match)
            {
                this.lastMatch = match;
                ++matchCount;

                var node = match.node;
                var nodeBox = this.openToNode(node, match.isValue, match.ownerElement);

                this.selectMatched(nodeBox, node, match, reverse);
            }
            else if (matchCount)
            {
                return true;
            }
            else
            {
                this.noMatch = true;
                Events.dispatch([Firebug.A11yModel], "onHTMLSearchNoMatchFound",
                    [panelNode.ownerPanel, text]);
            }
        };

        /**
         * Resets the search to the beginning of the document.
         */
        this.reset = function()
        {
            delete this.lastMatch;
        };

        /**
         * Finds the next match in the document.
         *
         * The return value is an object with the fields
         * - node: Node that contains the match
         * - isValue: true if the match is a match due to the value of the node, false if it is due to the name
         * - match: Regular expression result from the match
         *
         * @param {boolean} revert true to search backward, false to search forward
         * @param {boolean} caseSensitive true to match exact case, false to ignore case
         * @return Match object if found
         */
        this.findNextMatch = function(reverse, caseSensitive)
        {
            var innerMatch = this.findNextInnerMatch(reverse, caseSensitive);
            if (innerMatch)
                return innerMatch;
            else
                this.reset();

            function walkNode() { return reverse ? walker.previousNode() : walker.nextNode(); }

            var node;
            while (node = walkNode())
            {
                if (node.nodeType == Node.TEXT_NODE && HTMLLib.isSourceElement(node.parentNode))
                    continue;

                var ownerElement = walker.getOwnerElement();
                var m = this.checkNode(node, reverse, caseSensitive, 0, ownerElement);
                if (m)
                    return m;
            }
        };

        /**
         * Helper util used to scan the current search result for more results
         * in the same object.
         *
         * @private
         */
        this.findNextInnerMatch = function(reverse, caseSensitive)
        {
            if (this.lastMatch)
            {
                var lastMatchNode = this.lastMatch.node;
                var lastReMatch = this.lastMatch.match;
                var lastOwnerElement = this.lastMatch.ownerElement;
                var m = re.exec(lastReMatch.input, reverse, lastReMatch.caseSensitive,
                    lastReMatch);
                if (m)
                {
                    return {
                        node: lastMatchNode,
                        ownerElement: lastOwnerElement,
                        isValue: this.lastMatch.isValue,
                        match: m,
                        fullNodeMatch: false
                    };
                }

                // May need to check the pair for attributes
                if (lastMatchNode.nodeType == Node.ATTRIBUTE_NODE &&
                    this.lastMatch.isValue == !!reverse)
                {
                    return this.checkNode(lastMatchNode, reverse, caseSensitive, 1,
                        lastOwnerElement);
                }
            }
        };

        /**
         * Checks a given node for a search match.
         *
         * @private
         */
        this.checkNode = function(node, reverse, caseSensitive, firstStep, ownerElement)
        {
            if (nodeSet && nodeSet.has(node))
            {
                // If a selector matches the node, that takes priority.
                return {
                    node: node,
                    ownerElement: ownerElement,
                    isValue: false,
                    match: re.fakeMatch(node.localName, reverse, caseSensitive),
                    fullNodeMatch: true
                };
            }

            var checkOrder;
            if (node.nodeType == Node.ELEMENT_NODE)
            {
                // For non-qualified XML names (where localName and nodeName are the same thing) we
                // want the initial capitalization (localName); when !caseSensitive it doesn't matter.
                var name = (!caseSensitive || node.nodeName.length > node.localName.length ?
                    "nodeName" : "localName");
                checkOrder = [{name: name, isValue: false}];
            }
            else if (node.nodeType == Node.TEXT_NODE)
            {
                checkOrder = [{name: "nodeValue", isValue: false}];
            }
            else if (node.nodeType == Node.ATTRIBUTE_NODE)
            {
                checkOrder = [{name: "nodeName", isValue: false}, {name: "value", isValue: true}];
                if (reverse)
                    checkOrder.reverse();
            }
            else
            {
                // Skip comment nodes etc.
                return;
            }

            for (var i = firstStep || 0; i < checkOrder.length; i++)
            {
                var m = re.exec(node[checkOrder[i].name], reverse, caseSensitive);
                if (m) {
                    return {
                        node: node,
                        ownerElement: ownerElement,
                        isValue: checkOrder[i].isValue,
                        match: m,
                        fullNodeMatch: false
                    };
                }
            }
        };

        /**
         * Opens the given node in the associated IO Box.
         *
         * @private
         */
        this.openToNode = function(node, isValue, ownerElement)
        {
            if (node.nodeType == Node.ELEMENT_NODE)
            {
                var nodeBox = ioBox.openToObject(node);
                return nodeBox.getElementsByClassName("nodeTag")[0];
            }
            else if (node.nodeType == Node.ATTRIBUTE_NODE)
            {
                var nodeBox = ioBox.openToObject(ownerElement);
                if (nodeBox)
                {
                    var attrNodeBox = HTMLLib.findNodeAttrBox(nodeBox, node.name);
                    return Dom.getChildByClass(attrNodeBox, isValue ? "nodeValue" : "nodeName");
                }
            }
            else if (node.nodeType == Node.TEXT_NODE)
            {
                var nodeBox = ioBox.openToObject(node);
                if (nodeBox)
                {
                    return nodeBox;
                }
                else
                {
                    var nodeBox = ioBox.openToObject(node.parentNode);
                    if (Css.hasClass(nodeBox, "textNodeBox"))
                        nodeBox = HTMLLib.getTextElementTextBox(nodeBox);
                    return nodeBox;
                }
            }
        };

        /**
         * Selects the search results.
         *
         * @private
         */
        this.selectMatched = function(nodeBox, node, match, reverse)
        {
            // Force a reflow to make sure search highlighting works (issue 6952).
            nodeBox.offsetWidth;

            if (match.fullNodeMatch)
            {
                this.selectWholeNode(nodeBox);
            }
            else
            {
                var reMatch = match.match;
                this.selectNodeText(nodeBox, node, reMatch[0], reMatch.index, reverse,
                    reMatch.caseSensitive);
            }

            Events.dispatch([Firebug.A11yModel], "onHTMLSearchMatchFound",
                [panelNode.ownerPanel, match]);
        };

        /**
         * Select a whole node as a search result.
         *
         * @private
         */
        this.selectWholeNode = function(nodeBox)
        {
            nodeBox = Dom.getAncestorByClass(nodeBox, "nodeBox");
            var labelBox = Dom.getChildByClass(nodeBox, "nodeLabel");
            Css.setClass(labelBox, "search-selection");
            Dom.scrollIntoCenterView(labelBox, panelNode);

            var sel = panelNode.ownerDocument.defaultView.getSelection();
            sel.removeAllRanges();

            var range = panelNode.ownerDocument.createRange();
            var until = labelBox.getElementsByClassName("nodeBracket")[0];
            var from = until.parentNode.firstChild;
            range.setStartBefore(from);
            range.setEndAfter(until);
            sel.addRange(range);

            Css.removeClass(labelBox, "search-selection");
        },

        /**
         * Select text node search results.
         *
         * @private
         */
        this.selectNodeText = function(nodeBox, node, text, index, reverse, caseSensitive)
        {
            var row;

            // If we are still inside the same node as the last search, advance the range
            // to the next substring within that node
            if (nodeBox == this.lastNodeBox)
            {
                row = this.textSearch.findNext(false, true, reverse, caseSensitive);
            }

            if (!row)
            {
                // Search for the first instance of the string inside the node
                function findRow(node)
                {
                    return node.nodeType == Node.ELEMENT_NODE ? node : node.parentNode;
                }

                this.textSearch = new Search.TextSearch(nodeBox, findRow);
                row = this.textSearch.find(text, reverse, caseSensitive);
                this.lastNodeBox = nodeBox;
            }

            if (row)
            {
                var trueNodeBox = Dom.getAncestorByClass(nodeBox, "nodeBox");

                // Temporarily add '-moz-user-select: text' to the node, so
                // that selections show up (issue 2741).
                // XXX(simon): This doesn't seem to be needed any more as of
                // Fx 27, so we ought to remove it at some point.
                Css.setClass(trueNodeBox, "search-selection");

                Dom.scrollIntoCenterView(row, panelNode);
                var sel = panelNode.ownerDocument.defaultView.getSelection();
                sel.removeAllRanges();
                sel.addRange(this.textSearch.range);

                Css.removeClass(trueNodeBox, "search-selection");
                return true;
            }
        };
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Constructs a DOMWalker instance.
     *
     * @constructor
     * @class Implements an ordered traveral of the document, including attributes and
     *        iframe contents within the results.
     *
     *        Note that the order for attributes is not defined. This will follow the
     *        same order as the Element.attributes accessor.
     * @param {Element} root Element to traverse
     */
    DOMWalker: function(root)
    {
        var walker;
        var currentNode, attrIndex;
        var pastStart, pastEnd;
        var doc = root.ownerDocument;

        function createWalker(docElement)
        {
            var walk = doc.createTreeWalker(docElement, SHOW_ALL, null, true);
            walker.unshift(walk);
        }

        function getLastAncestor()
        {
            while (walker[0].lastChild()) {}
            return walker[0].currentNode;
        }

        /**
         * Move to the previous node.
         *
         * @return The previous node if one exists, undefined otherwise.
         */
        this.previousNode = function()
        {
            if (pastStart)
                return undefined;

            if (attrIndex)
            {
                attrIndex--;
            }
            else
            {
                var prevNode;
                if (currentNode == walker[0].root)
                {
                    if (walker.length > 1)
                    {
                        walker.shift();
                        prevNode = walker[0].currentNode;
                    }
                    else
                    {
                        prevNode = undefined;
                    }
                }
                else
                {
                    prevNode = !currentNode ? getLastAncestor(): walker[0].previousNode();

                    // Really shouldn't occur, but to be safe
                    if (!prevNode)
                        prevNode = walker[0].root;

                    var tagName = (prevNode.nodeName || "").toUpperCase();
                    while (["FRAME", "IFRAME"].indexOf(tagName) !== -1)
                    {
                        createWalker(prevNode.contentDocument.documentElement);
                        prevNode = getLastAncestor();
                    }
                }
                currentNode = prevNode;
                attrIndex = ((prevNode || {}).attributes || []).length;
            }

            if (!currentNode)
                pastStart = true;
            else
                pastEnd = false;

            return this.currentNode();
        };

        /**
         * Move to the next node.
         *
         * @return The next node if one exists, otherwise undefined.
         */
        this.nextNode = function()
        {
            if (pastEnd)
                return undefined;

            if (!currentNode)
            {
                // We are working with a new tree walker
                currentNode = walker[0].root;
                attrIndex = 0;
            }
            else
            {
                var tagName = (currentNode.nodeName || "").toUpperCase();

                // First check attributes
                var attrs = currentNode.attributes || [];
                if (attrIndex < attrs.length)
                {
                    attrIndex++;
                }
                else if (["FRAME", "IFRAME"].indexOf(tagName) !== -1)
                {
                    // Attributes have completed, check for iframe contents
                    createWalker(currentNode.contentDocument.documentElement);
                    currentNode = walker[0].root;
                    attrIndex = 0;
                }
                else
                {
                    // Next node
                    var nextNode = walker[0].nextNode();
                    while (!nextNode && walker.length > 1)
                    {
                        walker.shift();
                        nextNode = walker[0].nextNode();
                    }
                    currentNode = nextNode;
                    attrIndex = 0;
                }
            }

            if (!currentNode)
                pastEnd = true;
            else
                pastStart = false;

            return this.currentNode();
        };

        /**
         * Retrieves the current node.
         *
         * @return The current node, if not past the beginning or end of the iteration.
         */
        this.currentNode = function()
        {
            return !attrIndex ? currentNode : currentNode.attributes[attrIndex-1];
        };

        /**
         * Retrieves the owner element of the current node. For attribute nodes this
         * is the same as the element that has the attribute, for anything else it is
         * equal to the node itself. (This information was previously available from
         * the attribute node itself, but was removed in Firefox 29.)
         *
         * @return The owner element of the current node, if not past the beginning
         * or end of the iteration.
         */
        this.getOwnerElement = function()
        {
            return currentNode;
        };

        /**
         * Resets the walker position back to the initial position.
         */
        this.reset = function()
        {
            pastStart = false;
            pastEnd = false;
            walker = [];
            currentNode = undefined;
            attrIndex = 0;

            createWalker(root);
        };

        this.reset();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Node/Element Utilities

    /**
     * Determines if the given element is the source for a non-DOM resource such
     * as Javascript source or CSS definition.
     *
     * @param {Element} element Element to test
     * @return true if the element is a source element
     */
    isSourceElement: function(element)
    {
        if (!Xml.isElementHTMLOrXHTML(element))
            return false;

        var tag = element.localName ? element.localName.toLowerCase() : "";
        return tag == "script" || (tag == "link" && element.getAttribute("rel") == "stylesheet") ||
            tag == "style";
    },

    /**
     * Retrieves the source URL for any external resource associated with a node.
     *
     * @param {Element} element Element to examine
     * @return URL of the external resouce.
     */
    getSourceHref: function(element)
    {
        var tag = element.localName.toLowerCase();
        if (tag == "script" && element.src)
            return element.src;
        else if (tag == "link")
            return element.href;
        else
            return null;
    },

    /**
     * Retrieves the source text for inline script and style elements.
     *
     * @param {Element} element Script or style element
     * @return Source text
     */
    getSourceText: function(element)
    {
        var tag = element.localName.toLowerCase();
        if (tag == "script" && !element.src)
            return element.textContent;
        else if (tag == "style")
            return element.textContent;
        else
            return null;
    },

    /**
     * Determines if the given element is a container element.
     *
     * @param {Element} element Element to test
     * @return True if the element is a container element.
     */
    isContainerElement: function(element)
    {
        var tag = element.localName.toLowerCase();
        switch (tag)
        {
            case "script":
            case "style":
            case "iframe":
            case "frame":
            case "tabbrowser":
            case "browser":
                return true;
            case "link":
                return element.getAttribute("rel") == "stylesheet";
            case "embed":
                return element.getSVGDocument();
        }
        return false;
    },

    /**
     * Determines if the given node has any children which are elements.
     *
     * @param {Element} element Element to test.
     * @return true if immediate children of type Element exist, false otherwise
     */
    hasNoElementChildren: function(element)
    {
        if (element === null)
            return true;

        if (element.childElementCount != 0)  // FF 3.5+
            return false;

        // https://developer.mozilla.org/en/XBL/XBL_1.0_Reference/DOM_Interfaces
        if (element.ownerDocument instanceof Ci.nsIDOMDocumentXBL)
        {
            if (FBTrace.DBG_HTML)
            {
                FBTrace.sysout("hasNoElementChildren "+Css.getElementCSSSelector(element)+
                    " (element.ownerDocument instanceof Ci.nsIDOMDocumentXBL) "+
                    (element.ownerDocument instanceof Ci.nsIDOMDocumentXBL), element);
            }

            var walker = new HTMLLib.ElementWalker();
            var child = walker.getFirstChild(element);

            while (child)
            {
                if (child.nodeType === Node.ELEMENT_NODE)
                    return false;
                child = walker.getNextSibling(child);
            }
        }

        if (FBTrace.DBG_HTML)
            FBTrace.sysout("hasNoElementChildren TRUE "+element.tagName+
                " (element.ownerDocument instanceof Ci.nsIDOMDocumentXBL) "+
                (element.ownerDocument instanceof Ci.nsIDOMDocumentXBL), element);

        return true;
    },


    /**
     * Determines if the given node has any children which are comments.
     *
     * @param {Element} element Element to test.
     * @return true if immediate children of type Comment exist, false otherwise
     */
    hasCommentChildren: function(element)
    {
        if (element.hasChildNodes())
        {
            var children = element.childNodes;
            for (var i = 0; i < children.length; i++)
            {
                if (children[i] instanceof Comment)
                   return true;
            }
        };
        return false;
    },


    /**
     * Determines if the given node consists solely of whitespace text.
     *
     * @param {Node} node Node to test.
     * @return true if the node is a whitespace text node
     */
    isWhitespaceText: function(node)
    {
        if (node instanceof window.HTMLAppletElement)
            return false;

        return node.nodeType == window.Node.TEXT_NODE && Str.isWhitespace(node.nodeValue);
    },

    /**
     * Determines if a given element is empty. When the
     * {@link Firebug#showTextNodesWithWhitespace} parameter is true, an element is
     * considered empty if it has no child elements and is self closing. When
     * false, an element is considered empty if the only children are whitespace
     * nodes.
     *
     * @param {Element} element Element to test
     * @return true if the element is empty, false otherwise
     */
    isEmptyElement: function(element)
    {
        // XXXjjb the commented code causes issues 48, 240, and 244. I think the lines should be deleted.
        // If the DOM has whitespace children, then the element is not empty even if
        // we decide not to show the whitespace in the UI.

        // XXXsroussey reverted above but added a check for self closing tags
        if (Options.get("showTextNodesWithWhitespace"))
        {
            return !element.firstChild && Xml.isSelfClosing(element);
        }
        else
        {
            for (var child = element.firstChild; child; child = child.nextSibling)
            {
                if (!HTMLLib.isWhitespaceText(child))
                    return false;
            }
        }
        return Xml.isSelfClosing(element);
    },

    /**
     * Finds the next sibling of the given node. If the
     * {@link Firebug#showTextNodesWithWhitespace} parameter is set to true, the next
     * sibling may be a whitespace, otherwise the next is the first adjacent
     * non-whitespace node.
     *
     * @param {Node} node Node to analyze.
     * @return Next sibling node, if one exists
     */
    findNextSibling: function(node)
    {
        return this.findNextNodeFrom(node.nextSibling);
    },

    /**
     * Like findNextSibling, except it also allows returning the node itself.
     */
    findNextNodeFrom: function(node)
    {
        if (Options.get("showTextNodesWithWhitespace"))
        {
            return node;
        }
        else
        {
            // only return a non-whitespace node
            for (var child = node; child; child = child.nextSibling)
            {
                if (!HTMLLib.isWhitespaceText(child))
                    return child;
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Domplate Utilities

    /**
     * Locates the attribute domplate node for a given element domplate. This method will
     * only examine notes marked with the "nodeAttr" class that are the direct
     * children of the given element.
     *
     * @param {Object} objectNodeBox The domplate element to look up the attribute for.
     * @param {String} attrName Attribute name
     * @return Attribute's domplate node
     */
    findNodeAttrBox: function(objectNodeBox, attrName)
    {
        var child = objectNodeBox.firstChild.lastChild.firstChild;
        for (; child; child = child.nextSibling)
        {
            if (Css.hasClass(child, "nodeAttr") && child.childNodes[1].firstChild
                && child.childNodes[1].firstChild.nodeValue == attrName)
            {
                return child;
            }
        }
    },

    /**
     * Locates the text domplate node for a given text element domplate.
     * @param {Object} nodeBox Text element domplate
     * @return Element's domplate text node
     */
    getTextElementTextBox: function(nodeBox)
    {
        var nodeLabelBox = nodeBox.firstChild.lastChild;
        return Dom.getChildByClass(nodeLabelBox, "nodeText");
    },

    // These functions can be copied to add tree walking feature, they allow Chromebug
    // to reuse the HTML panel
    ElementWalkerFunctions:
    {
        getTreeWalker: function(node)
        {
            if (!this.treeWalker || this.treeWalker.currentNode !== node)
                this.treeWalker = node.ownerDocument.createTreeWalker(
                    node, NodeFilter.SHOW_ALL, null, false);

            return this.treeWalker;
        },

        getFirstChild: function(node)
        {
            return node.firstChild;
        },

        getNextSibling: function(node)
        {
            // the Mozilla XBL tree walker fails for nextSibling
            return node.nextSibling;
        },

        getParentNode: function(node)
        {
            // the Mozilla XBL tree walker fails for parentNode
            return node.parentNode;
        }
    },

    ElementWalker: function()  // tree walking via new ElementWalker
    {

    }
};

// ********************************************************************************************* //
// Registration

HTMLLib.ElementWalker.prototype = HTMLLib.ElementWalkerFunctions;

return HTMLLib;

// ********************************************************************************************* //
});
