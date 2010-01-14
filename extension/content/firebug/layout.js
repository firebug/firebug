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
                DIV({class: "positionLayoutBox $outerTopMode $outerRightMode $outerBottomMode $outerLeftMode focusGroup"},
                    DIV({class: "layoutEdgeTop layoutEdge"}),
                    DIV({class: "layoutEdgeRight layoutEdge"}),
                    DIV({class: "layoutEdgeBottom layoutEdge"}),
                    DIV({class: "layoutEdgeLeft layoutEdge"}),

                    DIV({class: "layoutLabelBottom layoutLabel layoutLabelPosition"},
                            SPAN({class: "layoutPosition layoutCaption", 'aria-label' : $STR('a11y.layout.position')}, $STR('position')+": "+'$position'),
                            SPAN({class: "layoutZIndex v$zIndex", 'aria-label' : $STR('a11y.layout.z-index')}, "z: "+'$zIndex')
                        ),

                    DIV({class: "layoutLabelTop layoutLabel v$outerTop"},
                        SPAN({class: "editable focusStart", 'aria-label' : $STR('a11y.layout.position top')}, '$outerTop')
                    ),
                    DIV({class: "layoutLabelRight layoutLabel v$outerRight"},
                        SPAN({class: "editable", 'aria-label' : $STR('a11y.layout.position right')}, '$outerRight')
                    ),
                    DIV({class: "layoutLabelBottom layoutLabel v$outerBottom"},
                        SPAN({class: "editable", 'aria-label' : $STR('a11y.layout.position bottom')}, '$outerBottom')
                    ),
                    DIV({class: "layoutLabelLeft layoutLabel v$outerLeft"},
                        SPAN({class: "editable", 'aria-label' : $STR('a11y.layout.position left')}, '$outerLeft')
                    ),

                    DIV({class: "layoutCaption"}, '$outerLabel'),


                    DIV({class: "marginLayoutBox layoutBox editGroup focusGroup"},
                        DIV({class: "layoutCaption"}, $STR("LayoutMargin")),
                        DIV({class: "layoutLabelTop layoutLabel v$marginTop"},
                            SPAN({class: "editable focusStart", 'aria-label' : $STR('a11y.layout.margin top')}, '$marginTop')
                        ),
                        DIV({class: "layoutLabelRight layoutLabel v$marginRight"},
                            SPAN({class: "editable", 'aria-label' : $STR('a11y.layout..margin right')}, '$marginRight')
                        ),
                        DIV({class: "layoutLabelBottom layoutLabel v$marginBottom"},
                            SPAN({class: "editable", 'aria-label' : $STR('a11y.layout.margin bottom')}, '$marginBottom')
                        ),
                        DIV({class: "layoutLabelLeft layoutLabel v$marginLeft"},
                            SPAN({class: "editable", 'aria-label' : $STR('a11y.layout.margin left')}, '$marginLeft')
                        ),

                        DIV({class: "borderLayoutBox layoutBox editGroup focusGroup"},
                            DIV({class: "layoutCaption"}, $STR("LayoutBorder")),
                            DIV({class: "layoutLabelTop layoutLabel v$borderTop"},
                                SPAN({class: "editable  focusStart", 'aria-label' : $STR('a11y.layout.border top')}, '$borderTop')
                            ),
                            DIV({class: "layoutLabelRight layoutLabel v$borderRight"},
                                SPAN({class: "editable", 'aria-label' : $STR('a11y.layout.border right')}, '$borderRight')
                            ),
                            DIV({class: "layoutLabelBottom layoutLabel v$borderBottom"},
                                SPAN({class: "editable", 'aria-label' : $STR('a11y.layout.border bottom')}, '$borderBottom')
                            ),
                            DIV({class: "layoutLabelLeft layoutLabel v$borderLeft"},
                                SPAN({class: "editable", 'aria-label' : $STR('a11y.layout.border left')}, '$borderLeft')
                            ),

                            DIV({class: "paddingLayoutBox layoutBox editGroup focusGroup"},
                                DIV({class: "layoutCaption"}, $STR("LayoutPadding")),
                                DIV({class: "layoutLabelTop layoutLabel v$paddingTop"},
                                    SPAN({class: "editable focusStart", 'aria-label' : $STR('a11y.layout.padding top')}, '$paddingTop')
                                ),
                                DIV({class: "layoutLabelRight layoutLabel v$paddingRight"},
                                    SPAN({class: "editable", 'aria-label' : $STR('a11y.layout.padding right')}, '$paddingRight')
                                ),
                                DIV({class: "layoutLabelBottom layoutLabel v$paddingBottom"},
                                    SPAN({class: "editable", 'aria-label' : $STR('a11y.layout.padding bottom')}, '$paddingBottom')
                                ),
                                DIV({class: "layoutLabelLeft layoutLabel v$paddingLeft"},
                                    SPAN({class: "editable", 'aria-label' : $STR('a11y.layout.padding left')}, '$paddingLeft')
                                ),

                                DIV({class: "contentLayoutBox layoutBox editGroup focusGroup"},
                                    DIV({class: "layoutLabelCenter layoutLabel"},
                                        SPAN({class: "layoutLabelWidth layoutLabel editable focusStart", 'aria-label' : $STR('a11y.layout.width')}, '$width'),
                                        " x ",
                                        SPAN({class: "layoutLabelHeight layoutLabel editable", 'aria-label' : $STR('a11y.layout.height')}, '$height')
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
    order: 2,

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
        dispatch([Firebug.A11yModel], 'onInitializeNode', [this]);
    },

    destroyNode: function()
    {
        this.panelNode.removeEventListener("mouseover", this.onMouseOver, false);
        this.panelNode.removeEventListener("mouseout", this.onMouseOut, false);
        dispatch([Firebug.A11yModel], 'onDestroyNode', [this]);
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

        var args = getBoxFromStyles(style, element);

        args.outerLeft = args.outerRight = args.outerTop = args.outerBottom = '';
        args.outerLeftMode = args.outerRightMode = args.outerTopMode = args.outerBottomMode = "";
        args.zIndex = args.zIndex ? args.zIndex : "auto";

        var position = style.getPropertyCSSValue("position").cssText;
        args.position = position;
        args.outerLabel = '';
        
        if (isElementSVG(element) || isElementMathML(element) || isElementXUL(element))
        {
            var rect = element.getBoundingClientRect();
            if (rect.wrappedJSObject)
                rect = rect.wrappedJSObject;

            args.width = Math.round(rect.width);
            args.height = Math.round(rect.height);
        }
        
        // these Modes are classes on the domplate
        args.outerLeftMode = args.outerRightMode = args.outerTopMode
        = args.outerBottomMode = "blankEdge";
        
        if (position == "absolute" || position == "fixed" || position == "relative")
        {
            function getStyle(style, name) { var v = style.getPropertyCSSValue(name); return (v && v.cssText) ? parseInt(v.cssText) : ' '; }

            args.outerLabel = $STR("LayoutPosition");
            
            args.outerLeft = getStyle(style,'left');
            args.outerTop = getStyle(style,'top');
            args.outerRight = getStyle(style,'right');
            args.outerBottom = getStyle(style,'bottom');
            
            args.outerLeftMode = args.outerRightMode = args.outerTopMode
                = args.outerBottomMode = "absoluteEdge";
        }
        
        var node = this.template.tag.replace(args, this.panelNode);
        this.adjustCharWidth(this.getMaxCharWidth(args, node), this.panelNode);

        dispatch([Firebug.A11yModel], 'onLayoutBoxCreated', [this, node, args]);
    },

    /*
     * The nested boxes of the Layout panel have digits which need to fit between the boxes.
     * @param maxWidth: pixels the largest digit string
     * @param node: panelNode to be adjusted (from tag:)
     */
    adjustCharWidth: function(maxWidth, node)
    {
        maxWidth += 10; // margin
        if (maxWidth < 20)
            maxWidth = 20;

        this.adjustBoxWidth(node, "marginLayoutBox", maxWidth);
        this.adjustBoxWidth(node, "borderLayoutBox", maxWidth);
        this.adjustBoxWidth(node, "paddingLayoutBox", maxWidth);

        var box = node.getElementsByClassName("outerLayoutBox").item(0);
        box.style.cssText = "width: "+(240 + 3*maxWidth)+"px;";  // defaults to 300px

        this.adjustLabelWidth(node, "layoutLabelLeft", maxWidth);
        this.adjustLabelWidth(node, "layoutLabelRight", maxWidth);
    },

    /*
     * By adjusting this width, the labels can be centered.
     */
    adjustLabelWidth: function(node, labelName, maxWidth)
    {
        var labels = node.getElementsByClassName(labelName);
        for (var i = 0; i < labels.length; i++)
            labels[i].style.cssText = "width: "+maxWidth+"px;";
    },

    adjustBoxWidth: function(node, boxName, width)
    {
        var box = node.getElementsByClassName(boxName).item(0);
        box.style.cssText = "right: "+width + 'px;'+" left: "+width + 'px;';
    },

    getMaxCharWidth: function(args, node)
    {
        Firebug.MeasureBox.startMeasuring(node);
        var maxWidth = Math.max(
                Firebug.MeasureBox.measureText(args.marginLeft+"").width,
                Firebug.MeasureBox.measureText(args.marginRight+"").width,
                Firebug.MeasureBox.measureText(args.borderLeft+"").width,
                Firebug.MeasureBox.measureText(args.borderRight+"").width,
                Firebug.MeasureBox.measureText(args.paddingLeft+"").width,
                Firebug.MeasureBox.measureText(args.paddingRight+"").width
                );
        Firebug.MeasureBox.stopMeasuring();
        return maxWidth;
    },

    updateOption: function(name, value)
    {
        /*
        if (name == "newOptionHere")
        {
            this.updateSelection(this.selection);
        }
        */
    },

    getOptionsMenuItems: function()
    {
        return [
            optionMenu("ShowRulers", "showRulers")
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
        if (boxFrame == "content" || boxFrame == "position")
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
