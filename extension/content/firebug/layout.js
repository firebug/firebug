/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************

function LayoutPanel() {}

LayoutPanel.prototype = extend(Firebug.Panel,
{
    template: domplate(
    {
        tag:
            DIV({class: "outerLayoutBox"},
                DIV({class: "offsetLayoutBox $outerTopMode $outerRightMode $outerBottomMode $outerLeftMode"},
                    DIV({class: "layoutEdgeTop layoutEdge"}),
                    DIV({class: "layoutEdgeRight layoutEdge"}),
                    DIV({class: "layoutEdgeBottom layoutEdge"}),
                    DIV({class: "layoutEdgeLeft layoutEdge"}),

                    DIV({class: "layoutLabelTop layoutLabel v$outerTop"},
                        SPAN({class: "editable"}, '$outerTop')
                    ),
                    DIV({class: "layoutLabelRight layoutLabel v$outerRight"},
                        SPAN({class: "editable"}, '')
                    ),
                    DIV({class: "layoutLabelBottom layoutLabel v$outerBottom"},
                        SPAN({class: "editable"}, '')
                    ),
                    DIV({class: "layoutLabelLeft layoutLabel v$outerLeft"},
                        SPAN({class: "editable"}, '$outerLeft')
                    ),

                    DIV({class: "layoutCaption"}, '$outerLabel'),

                    DIV({class: "marginLayoutBox layoutBox editGroup"},
                        DIV({class: "layoutCaption"}, $STR("LayoutMargin")),
                        DIV({class: "layoutLabelTop layoutLabel v$marginTop"},
                            SPAN({class: "editable"}, '$marginTop')
                        ),
                        DIV({class: "layoutLabelRight layoutLabel v$marginRight"},
                            SPAN({class: "editable"}, '$marginRight')
                        ),
                        DIV({class: "layoutLabelBottom layoutLabel v$marginBottom"},
                            SPAN({class: "editable"}, '$marginBottom')
                        ),
                        DIV({class: "layoutLabelLeft layoutLabel v$marginLeft"},
                            SPAN({class: "editable"}, '$marginLeft')
                        ),

                        DIV({class: "borderLayoutBox layoutBox editGroup"},
                            DIV({class: "layoutCaption"}, $STR("LayoutBorder")),
                            DIV({class: "layoutLabelTop layoutLabel v$borderTop"},
                                SPAN({class: "editable"}, '$borderTop')
                            ),
                            DIV({class: "layoutLabelRight layoutLabel v$borderRight"},
                                SPAN({class: "editable"}, '$borderRight')
                            ),
                            DIV({class: "layoutLabelBottom layoutLabel v$borderBottom"},
                                SPAN({class: "editable"}, '$borderBottom')
                            ),
                            DIV({class: "layoutLabelLeft layoutLabel v$borderLeft"},
                                SPAN({class: "editable"}, '$borderLeft')
                            ),

                            DIV({class: "paddingLayoutBox layoutBox editGroup"},
                                DIV({class: "layoutCaption"}, $STR("LayoutPadding")),
                                DIV({class: "layoutLabelTop layoutLabel v$paddingTop"},
                                    SPAN({class: "editable"}, '$paddingTop')
                                ),
                                DIV({class: "layoutLabelRight layoutLabel v$paddingRight"},
                                    SPAN({class: "editable"}, '$paddingRight')
                                ),
                                DIV({class: "layoutLabelBottom layoutLabel v$paddingBottom"},
                                    SPAN({class: "editable"}, '$paddingBottom')
                                ),
                                DIV({class: "layoutLabelLeft layoutLabel v$paddingLeft"},
                                    SPAN({class: "editable"}, '$paddingLeft')
                                ),

                                DIV({class: "contentLayoutBox layoutBox editGroup"},
                                    DIV({class: "layoutLabelCenter layoutLabel"},
                                        SPAN({class: "layoutLabelWidth layoutLabel editable"}, '$width'),
                                        " x ",
                                        SPAN({class: "layoutLabelHeight layoutLabel editable"}, '$height')
                                    )
                                )
                            )
                        )
                    )
                )
            ),

        getVerticalText: function(n)
        {
            return getVerticalText(n);
        }
    }),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onMouseOver: function(event)
    {
        var layoutBox = getAncestorByClass(event.target, "layoutBox");
        var boxFrame = layoutBox ? getBoxFrame(layoutBox) : null;

        if (this.highlightedBox)
            removeClass(this.highlightedBox, "highlighted");

        this.highlightedBox = layoutBox;

        if (layoutBox)
            setClass(layoutBox, "highlighted");

        Firebug.Inspector.highlightObject(this.selection, this.context, "boxModel", boxFrame);
    },

    onMouseOut: function(event)
    {
        var nextTarget = event.relatedTarget;
        if (nextTarget && getAncestorByClass(nextTarget, "layoutBox"))
            return;

        if (this.highlightedBox)
            removeClass(this.highlightedBox, "highlighted");

        this.highlightedBox = null;

        Firebug.Inspector.highlightObject(null, null, "boxModel");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: "layout",
    parentPanel: "html",
    order: 1,

    initialize: function()
    {
        this.onMouseOver = bind(this.onMouseOver, this);
        this.onMouseOut = bind(this.onMouseOut, this);

        Firebug.Panel.initialize.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        this.panelNode.addEventListener("mouseover", this.onMouseOver, false);
        this.panelNode.addEventListener("mouseout", this.onMouseOut, false);
    },

    destroyNode: function()
    {
        this.panelNode.removeEventListener("mouseover", this.onMouseOver, false);
        this.panelNode.removeEventListener("mouseout", this.onMouseOut, false);
    },

    supportsObject: function(object)
    {
        return object instanceof Element ? 1 : 0;
    },

    refresh: function()
    {
        this.updateSelection(this.selection);
    },

    updateSelection: function(element)
    {
        var view = element ? element.ownerDocument.defaultView : null;
        if (!view)
            return this.panelNode.innerHTML = "";

        var prev = getPreviousElement(element.previousSibling);
        var next = getNextElement(element.nextSibling);

        var style = view.getComputedStyle(element, "");
        var prevStyle = prev ? view.getComputedStyle(prev, "") : null;
        var nextStyle = next ? view.getComputedStyle(next, "") : null;

        function getStyle(st, name) { return parseInt(st.getPropertyCSSValue(name).cssText); }

        var args = readBoxStyles(style);
        args.width = element.offsetWidth
            - (args.paddingLeft+args.paddingRight+args.borderLeft+args.borderRight);
        args.height = element.offsetHeight
            - (args.paddingTop+args.paddingBottom+args.borderTop+args.borderBottom);

        args.outerLeft = args.outerRight = args.outerTop = args.outerBottom = 0;
        args.outerLeftMode = args.outerRightMode = args.outerTopMode = args.outerBottomMode = "";

        var position = style.getPropertyCSSValue("position").cssText;
        if (!Firebug.showAdjacentLayout || position == "absolute" || position == "fixed")
        {
            args.outerLabel = $STR("LayoutOffset");
            args.outerLeft = element.offsetLeft;
            args.outerTop = element.offsetTop;
            args.outerRight = args.outerBottom = 0;
            args.outerLeftMode = args.outerRightMode = args.outerTopMode
                = args.outerBottomMode = "absoluteEdge";
        }
        else
        {
            var parentStyle = isElement(element.parentNode)
                ? view.getComputedStyle(element.parentNode, "")
                : null;

            if (parentStyle)
            {
                var display = style.getPropertyCSSValue("display").cssText;
                if (display == "block")
                {
                    var firstSibling = getNextElement(element.parentNode.firstChild);
                    var lastSibling = getPreviousElement(element.parentNode.lastChild);

                    if (firstSibling == element)
                    {
                        args.outerTop = getStyle(parentStyle, "padding-top");
                        args.outerTopMode = "parentTop";
                    }
                    else if (prev)
                    {
                        args.outerTop = getStyle(prevStyle, "margin-bottom");
                        args.outerTopMode = "siblingTop";
                    }

                    if (lastSibling == element)
                    {
                        args.outerBottom = getStyle(parentStyle, "padding-bottom");
                        args.outerBottomMode = "parentBottom";
                    }
                    else if (next)
                    {
                        args.outerBottom = getStyle(nextStyle, "margin-top");
                        args.outerBottomMode = "siblingBottom";
                    }

                    args.outerLeft = getStyle(parentStyle, "padding-left");
                    args.outerLeftMode = "parentLeft";

                    args.outerRight = getStyle(parentStyle, "padding-right");
                    args.outerRightMode = "parentRight";
                }
                else
                {
                    if (prevStyle)
                    {
                        args.outerLeft = getStyle(prevStyle, "margin-right");
                        args.outerLeftMode = "siblingLeft";
                    }
                    else
                    {
                        args.outerLeft = getStyle(parentStyle, "padding-left");
                        args.outerLeftMode = "parentLeft";
                    }

                    if (nextStyle)
                    {
                        args.outerRight = getStyle(nextStyle, "margin-left");
                        args.outerRightMode = "siblingRight";
                    }
                    else
                    {
                        args.outerRight = getStyle(parentStyle, "padding-right");
                        args.outerRightMode = "parentRight";
                    }

                    args.outerTop = getStyle(parentStyle, "padding-top");
                    args.outerTopMode = "parentTop";

                    args.outerBottom = getStyle(parentStyle, "padding-bottom");
                    args.outerBottomMode = "parentBottom";
                }

                args.outerLabel = $STR("LayoutAdjacent");
            }
            else
                args.outerLabel = "";
        }

        this.template.tag.replace(args, this.panelNode);
    },

    updateOption: function(name, value)
    {
        if (name == "showAdjacentLayout")
        {
            this.updateSelection(this.selection);
        }
    },

    getOptionsMenuItems: function()
    {
        return [
            optionMenu("ShowRulers", "showRulers"),
        ];
    },

    getEditor: function(target, value)
    {
        if (!this.editor)
            this.editor = new LayoutEditor(this.document);

        return this.editor;
    }
});

// ************************************************************************************************
// LayoutEditor

function LayoutEditor(doc)
{
    this.initializeInline(doc);

    this.noWrap = false;
    this.numeric = true;
}

LayoutEditor.prototype = domplate(Firebug.InlineEditor.prototype,
{
    saveEdit: function(target, value, previousValue)
    {
        if (!this.panel.selection.style)
            return;

        var labelBox = getAncestorByClass(target, "layoutLabel");
        var layoutBox = getLayoutBox(labelBox);

        var boxFrame = getBoxFrame(layoutBox);
        var boxEdge = getBoxEdge(labelBox);

        var styleName;
        if (boxFrame == "content" || boxFrame == "offset")
            styleName = boxEdge.toLowerCase();
        else if (boxFrame == "border")
            styleName = boxFrame+boxEdge+"Width";
        else
            styleName = boxFrame+boxEdge;

        var intValue = value ? value : 0;
        this.panel.selection.style[styleName] = intValue + "px";

        if (Firebug.Inspector.highlightedElement == this.panel.selection)
        {
            var boxFrame = this.highlightedBox ? getBoxFrame(this.highlightedBox) : null;
            Firebug.Inspector.highlightObject(this.panel.selection, this.panel.context, "boxModel", boxFrame);
        }

        if (hasClass(target, "layoutVerticalText"))
            target.innerHTML = getVerticalText(intValue);
        else
            target.innerHTML = intValue;

        if (previousValue == "0" && !!value)
            removeClass(target.parentNode, "v0");
        else if (!value)
            setClass(target.parentNode, "v0");
    },

    endEditing: function(target, value, cancel)
    {
        // Don't remove groups
        return false;
    }
});

// ************************************************************************************************
// Local Helpers

function getLayoutBox(element)
{
    var re = /([^\s]+)LayoutBox/;
    for (var box = element; box; box = box.parentNode)
    {
        if (re.exec(box.className))
            return box;
    }
}

function getBoxFrame(element)
{
    var re = /([^\s]+)LayoutBox/;
    var m = re.exec(element.className);
    return m ? m[1] : "";
}

function getBoxEdge(element)
{
    var re = /layoutLabel([^\s]+)/;
    var m = re.exec(element.className);
    return m ? m[1] : "";
}

function getVerticalText(n)
{
    n = n+"";
    var text = [];
    for (var i = 0; i < n.length; ++i)
        text.push(n[i]);
    return text.join("<br>");
}

// ************************************************************************************************

Firebug.registerPanel(LayoutPanel);

// ************************************************************************************************

}});
