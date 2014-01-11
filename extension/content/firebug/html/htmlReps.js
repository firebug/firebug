/* See license.txt for terms of usage */
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/array",
    "firebug/lib/domplate",
    "firebug/lib/string",
    "firebug/lib/xml",
    "firebug/chrome/reps",
    "firebug/html/htmlLib",
],
function(Firebug, Arr, Domplate, Str, Xml, FirebugReps, HTMLLib) {

"use strict";

// ********************************************************************************************* //
// Constants

var {domplate, FOR, TAG, DIV, SPAN} = Domplate;

// ********************************************************************************************* //

var AttrTag =
    SPAN({"class": "nodeAttr editGroup"},
        "&nbsp;", SPAN({"class": "nodeName editable"}, "$attr.name"), "=&quot;",
        SPAN({"class": "nodeValue editable", "title": "$attr|getAttrTitle"}, "$attr|getAttrValue"), "&quot;"
    );

var TextTag =
    SPAN({"class": "nodeText editable"},
        FOR("char", "$object|getNodeTextGroups",
            SPAN({"class": "$char.class $char.extra"}, "$char.str")
        )
    );

// ********************************************************************************************* //

var SourceText = function(lines, owner)
{
    this.lines = lines;
    this.owner = owner;
};

SourceText.getLineAsHTML = function(lineNo)
{
    return Str.escapeForSourceLine(this.lines[lineNo-1]);
};

// ********************************************************************************************* //

var CompleteElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox open $object|getHidden", _repObject: "$object", role: "presentation"},
            DIV({"class": "nodeLabel", role: "presentation"},
                SPAN({"class": "nodeLabelBox repTarget", role: "treeitem", "aria-expanded": "false"},
                    "&lt;",
                    SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({"class": "nodeBracket"}, "&gt;")
                )
            ),
            DIV({"class": "nodeChildBox", role: "group"},
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
        {
            return Arr.cloneArray(node.childNodes);
        }
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

var SoloElement = domplate(CompleteElement,
{
    tag:
        DIV({"class": "soloElement", onmousedown: "$onMouseDown"},
            CompleteElement.tag
        ),

    onMouseDown: function(event)
    {
        for (var child = event.target; child; child = child.parentNode)
        {
            if (child.repObject)
            {
                Firebug.chrome.select(child.repObject);
                break;
            }
        }
    }
});

var Element = domplate(FirebugReps.Element,
{
    tag:
    DIV({"class": "nodeBox containerNodeBox $object|getHidden", _repObject: "$object",
            role: "presentation"},
        DIV({"class": "nodeLabel", role: "presentation"},
            DIV({"class": "twisty", role: "presentation"}),
            SPAN({"class": "nodeLabelBox repTarget", role: "treeitem", "aria-expanded": "false"},
                "&lt;",
                SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                FOR("attr", "$object|attrIterator", AttrTag),
                SPAN({"class": "nodeBracket editable insertBefore"}, "&gt;")
            )
        ),
        DIV({"class": "nodeChildBox", role: "group"}), /* nodeChildBox is special signal in insideOutBox */
        DIV({"class": "nodeCloseLabel", role: "presentation"},
            SPAN({"class": "nodeCloseLabelBox repTarget"},
                "&lt;/",
                SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                "&gt;"
            )
        )
    )
});

var HTMLDocument = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox documentNodeBox containerNodeBox",
            _repObject: "$object", role: "presentation"},
            DIV({"class": "nodeChildBox", role: "group"})
        )
});

var HTMLDocType = domplate(FirebugReps.Element,
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
        return "<!DOCTYPE " + doctype.name + (doctype.publicId ? " PUBLIC \"" + doctype.publicId +
            "\"": "") + (doctype.systemId ? " \"" + doctype.systemId + "\"" : "") + ">";
    }
});

var HTMLHtmlElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox htmlNodeBox containerNodeBox $object|getHidden",
            _repObject: "$object", role: "presentation"},
            DIV({"class": "nodeLabel", role: "presentation"},
                DIV({"class": "twisty", role: "presentation"}),
                SPAN({"class": "nodeLabelBox repTarget", role: "treeitem",
                    "aria-expanded": "false"},
                    "&lt;",
                    SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({"class": "nodeBracket editable insertBefore"}, "&gt;")
                )
            ),
            DIV({"class": "nodeChildBox", role: "group"}), /* nodeChildBox is special signal in insideOutBox */
            DIV({"class": "nodeCloseLabel", role: "presentation"},
                SPAN({"class": "nodeCloseLabelBox repTarget"},
                    "&lt;/",
                    SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                    "&gt;"
                )
            )
        )
});

var TextElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox textNodeBox $object|getHidden", _repObject: "$object", role: "presentation"},
            DIV({"class": "nodeLabel", role: "presentation"},
                SPAN({"class": "nodeLabelBox repTarget", role: "treeitem"},
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

var EmptyElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox emptyNodeBox $object|getHidden", _repObject: "$object", role: "presentation"},
            DIV({"class": "nodeLabel", role: "presentation"},
                SPAN({"class": "nodeLabelBox repTarget", role: "treeitem"},
                    "&lt;",
                    SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({"class": "nodeBracket editable insertBefore"}, "&gt;")
                )
            )
        )
});

var XEmptyElement = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox emptyNodeBox $object|getHidden", _repObject: "$object", role: "presentation"},
            DIV({"class": "nodeLabel", role: "presentation"},
                SPAN({"class": "nodeLabelBox repTarget", role: "treeitem"},
                    "&lt;",
                    SPAN({"class": "nodeTag"}, "$object|getNodeName"),
                    FOR("attr", "$object|attrIterator", AttrTag),
                    SPAN({"class": "nodeBracket editable insertBefore"}, "/&gt;")
                )
            )
        )
});

var AttrNode = domplate(FirebugReps.Element,
{
    tag: AttrTag
});

var TextNode = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox", _repObject: "$object", role: "presentation"},
            TextTag
        )
});

var CDATANode = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox", _repObject: "$object", role: "presentation"},
            "&lt;![CDATA[",
            SPAN({"class": "nodeText nodeCDATA editable"}, "$object.nodeValue"),
            "]]&gt;"
        )
});

var CommentNode = domplate(FirebugReps.Element,
{
    tag:
        DIV({"class": "nodeBox nodeComment", _repObject: "$object", role: "presentation"},
            "&lt;!--",
            SPAN({"class": "nodeComment editable"}, "$object.nodeValue"),
            "--&gt;"
        )
});

// ********************************************************************************************* //

function getEmptyElementTag(node)
{
    var isXhtml = Xml.isElementXHTML(node);
    if (isXhtml)
        return XEmptyElement.tag;
    else
        return EmptyElement.tag;
}

function getNodeTag(node, expandAll)
{
    if (node instanceof window.Element)
    {
        if (node instanceof window.HTMLHtmlElement && node.ownerDocument && node.ownerDocument.doctype)
            return HTMLHtmlElement.tag;
        else if (node instanceof window.HTMLAppletElement)
            return getEmptyElementTag(node);
        else if (Firebug.shouldIgnore(node))
            return null;
        else if (HTMLLib.isContainerElement(node))
            return expandAll ? CompleteElement.tag : Element.tag;
        else if (HTMLLib.isEmptyElement(node))
            return getEmptyElementTag(node);
        else if (Firebug.showCommentNodes && HTMLLib.hasCommentChildren(node))
            return expandAll ? CompleteElement.tag : Element.tag;
        else if (HTMLLib.hasNoElementChildren(node))
            return TextElement.tag;
        else
            return expandAll ? CompleteElement.tag : Element.tag;
    }
    else if (node instanceof window.Text)
        return TextNode.tag;
    else if (node instanceof window.CDATASection)
        return CDATANode.tag;
    else if (node instanceof window.Comment && (Firebug.showCommentNodes || expandAll))
        return CommentNode.tag;
    else if (node instanceof SourceText)
        return FirebugReps.SourceText.tag;
    else if (node instanceof window.Document)
        return HTMLDocument.tag;
    else if (node instanceof window.DocumentType)
        return HTMLDocType.tag;
    else
        return FirebugReps.Nada.tag;
}

// ********************************************************************************************* //
// Registration

return {
    getNodeTag: getNodeTag,
    SourceText: SourceText,
    AttrTag: AttrTag,
    TextTag: TextTag,
    CompleteElement: CompleteElement,
    SoloElement: SoloElement,
    Element: Element,
    HTMLDocument: HTMLDocument,
    HTMLDocType: HTMLDocType,
    HTMLHtmlElement: HTMLHtmlElement,
    TextElement: TextElement,
    EmptyElement: EmptyElement,
    XEmptyElement: XEmptyElement,
    AttrNode: AttrNode,
    TextNode: TextNode,
    CDATANode: CDATANode,
    CommentNode: CommentNode
};

// ********************************************************************************************* //
});
