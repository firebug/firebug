/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/chrome/panel",
    "firebug/lib/trace",
    "firebug/lib/object",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/xml",
    "firebug/chrome/menu",
    "firebug/editor/inlineEditor",
    "firebug/chrome/measureBox",
],
function(Firebug, Panel, FBTrace, Obj, Domplate, Locale, Events, Css, Dom, Xml, Menu,
    InlineEditor, MeasureBox) {

"use strict"

// ********************************************************************************************* //
// Constants

var {domplate, DIV, SPAN} = Domplate;

// ********************************************************************************************* //
// LayoutPanel Implementation

/**
 * @panel Represents the Layout side panel available within the HTML panel. The Layout
 * panel allows inspecting and manipulating the layout data of the selected DOM node.
 * The layout data editing is done through {@LayoutEditor} object.
 */
function LayoutPanel() {}
LayoutPanel.prototype = Obj.extend(Panel,
/** @lends LayoutPanel */
{
    name: "layout",
    parentPanel: "html",
    order: 2,
    enableA11y: true,

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Domplate

    template: domplate(
    {
        tag:
            DIV({"class": "outerLayoutBox"},
                DIV({"class": "positionLayoutBox $outerTopMode $outerRightMode " +
                        "$outerBottomMode $outerLeftMode focusGroup"},
                    DIV({"class": "layoutEdgeTop layoutEdge"}),
                    DIV({"class": "layoutEdgeRight layoutEdge"}),
                    DIV({"class": "layoutEdgeBottom layoutEdge"}),
                    DIV({"class": "layoutEdgeLeft layoutEdge"}),

                    DIV({"class": "layoutLabelBottom layoutLabel layoutLabelPosition"},
                        SPAN({"class": "layoutPosition layoutCaption",
                                "aria-label": Locale.$STR("a11y.layout.position")},
                            Locale.$STR("position") + ": " + "$position"),
                        SPAN({"class": "layoutBoxSizing layoutCaption",
                                "aria-label": Locale.$STR("a11y.layout.box-sizing")},
                            Locale.$STR("a11y.layout.box-sizing") + ": " + "$boxSizing"),
                        SPAN({"class": "layoutZIndex", $invisible: "$zIndex|isInvisible",
                                "aria-label": Locale.$STR("a11y.layout.z-index")},
                            "z: " + "$zIndex")
                    ),

                    DIV({"class": "layoutLabelTop layoutLabel",
                            $invisible: "$outerTop|isInvisible"},
                        SPAN({"class": "layoutLabelOuterTop editable focusStart",
                                "aria-label": Locale.$STR("a11y.layout.position top")},
                            "$outerTop"
                        )
                    ),
                    DIV({"class": "layoutLabelRight layoutLabel",
                            $invisible: "$outerRight|isInvisible"},
                        SPAN({"class": "layoutLabelOuterRight editable",
                                "aria-label": Locale.$STR("a11y.layout.position right")},
                            "$outerRight"
                        )
                    ),
                    DIV({"class": "layoutLabelBottom layoutLabel",
                            $invisible: "$outerBottom|isInvisible"},
                        SPAN({"class": "layoutLabelOuterBottom editable",
                                "aria-label": Locale.$STR("a11y.layout.position bottom")},
                            "$outerBottom"
                        )
                    ),
                    DIV({"class": "layoutLabelLeft layoutLabel",
                            $invisible: "$outerLeft|isInvisible"},
                        SPAN({"class": "layoutLabelOuterLeft editable",
                                "aria-label": Locale.$STR("a11y.layout.position left")},
                            "$outerLeft"
                        )
                    ),

                    DIV({"class": "outerLabel layoutCaption"}, "$outerLabel"),


                    DIV({"class": "marginLayoutBox layoutBox editGroup focusGroup"},
                        DIV({"class": "layoutCaption"}, Locale.$STR("LayoutMargin")),
                        DIV({"class": "layoutLabelTop layoutLabel",
                                $invisible: "$marginTop|isInvisible"},
                            SPAN({"class": "layoutLabelMarginTop editable focusStart",
                                    "aria-label": Locale.$STR("a11y.layout.margin top")},
                                "$marginTop"
                            )
                        ),
                        DIV({"class": "layoutLabelRight layoutLabel",
                                $invisible: "$marginRight|isInvisible"},
                            SPAN({"class": "layoutLabelMarginRight editable",
                                    "aria-label": Locale.$STR("a11y.layout.margin right")},
                                "$marginRight"
                            )
                        ),
                        DIV({"class": "layoutLabelBottom layoutLabel",
                                $invisible: "$marginBottom|isInvisible"},
                            SPAN({"class": "layoutLabelMarginBottom editable",
                                    "aria-label": Locale.$STR("a11y.layout.margin bottom")},
                                "$marginBottom"
                            )
                        ),
                        DIV({"class": "layoutLabelLeft layoutLabel",
                                $invisible: "$marginLeft|isInvisible"},
                            SPAN({"class": "layoutLabelMarginLeft editable",
                                    "aria-label": Locale.$STR("a11y.layout.margin left")},
                                "$marginLeft"
                            )
                        ),

                        DIV({"class": "borderLayoutBox layoutBox editGroup focusGroup"},
                            DIV({"class": "layoutCaption"}, Locale.$STR("LayoutBorder")),
                            DIV({"class": "layoutLabelTop layoutLabel",
                                    $invisible: "$borderTop|isInvisible"},
                                SPAN({"class": "layoutLabelBorderTop editable  focusStart",
                                        "aria-label": Locale.$STR("a11y.layout.border top")},
                                    "$borderTop"
                                )
                            ),
                            DIV({"class": "layoutLabelRight layoutLabel",
                                    $invisible: "$borderRight|isInvisible"},
                                SPAN({"class": "layoutLabelBorderRight editable",
                                        "aria-label": Locale.$STR("a11y.layout.border right")},
                                    "$borderRight"
                                )
                            ),
                            DIV({"class": "layoutLabelBottom layoutLabel",
                                    $invisible: "$borderBottom|isInvisible"},
                                SPAN({"class": "layoutLabelBorderBottom editable",
                                        "aria-label": Locale.$STR("a11y.layout.border bottom")},
                                    "$borderBottom"
                                )
                            ),
                            DIV({"class": "layoutLabelLeft layoutLabel",
                                    $invisible: "$borderLeft|isInvisible"},
                                SPAN({"class": "layoutLabelBorderLeft editable",
                                        "aria-label": Locale.$STR("a11y.layout.border left")},
                                    "$borderLeft"
                                )
                            ),

                            DIV({"class": "paddingLayoutBox layoutBox editGroup focusGroup"},
                                DIV({"class": "layoutCaption"}, Locale.$STR("LayoutPadding")),
                                DIV({"class": "layoutLabelTop layoutLabel",
                                        $invisible: "$paddingTop|isInvisible"},
                                    SPAN({"class": "layoutLabelPaddingTop editable focusStart",
                                            "aria-label": Locale.$STR("a11y.layout.padding top")},
                                        "$paddingTop"
                                    )
                                ),
                                DIV({"class": "layoutLabelRight layoutLabel",
                                        $invisible: "$paddingRight|isInvisible"},
                                    SPAN(
                                        {
                                            "class": "layoutLabelPaddingRight editable",
                                            "aria-label":
                                                Locale.$STR("a11y.layout.padding right")
                                        },
                                        "$paddingRight"
                                    )
                                ),
                                DIV({"class": "layoutLabelBottom layoutLabel",
                                        $invisible: "$paddingBottom|isInvisible"},
                                    SPAN(
                                        {
                                            "class": "layoutLabelPaddingBottom editable",
                                            "aria-label":
                                                Locale.$STR("a11y.layout.padding bottom")
                                        },
                                        "$paddingBottom"
                                    )
                                ),
                                DIV({"class": "layoutLabelLeft layoutLabel",
                                        $invisible: "$paddingLeft|isInvisible"},
                                    SPAN({"class": "layoutLabelPaddingLeft editable",
                                            "aria-label": Locale.$STR("a11y.layout.padding left")},
                                        "$paddingLeft"
                                    )
                                ),

                                DIV({"class": "contentLayoutBox layoutBox editGroup focusGroup"},
                                    DIV({"class": "layoutLabelCenter layoutLabel"},
                                        SPAN({"class": "layoutLabelWidth layoutLabel editable "+
                                                "focusStart",
                                                "aria-label": Locale.$STR("a11y.layout.width")},
                                            "$width"
                                        ),
                                        " x ",
                                        SPAN({"class": "layoutLabelHeight layoutLabel editable",
                                                "aria-label": Locale.$STR("a11y.layout.height")},
                                            "$height"
                                        )
                                    )
                                )
                            )
                        )
                    )
                )
            ),

        isInvisible: function(value)
        {
            return value == 0;
        }
    }),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    onMouseOver: function(event)
    {
        var layoutBox = Dom.getAncestorByClass(event.target, "layoutBox");
        var boxFrame = layoutBox ? getBoxFrame(layoutBox) : null;

        if (this.highlightedBox)
            Css.removeClass(this.highlightedBox, "highlighted");

        this.highlightedBox = layoutBox;

        if (layoutBox)
            Css.setClass(layoutBox, "highlighted");

        Firebug.Inspector.highlightObject(this.selection, this.context, "boxModel", boxFrame);
    },

    onMouseOut: function(event)
    {
        var nextTarget = event.relatedTarget;
        if (nextTarget && Dom.getAncestorByClass(nextTarget, "layoutBox"))
            return;

        if (this.highlightedBox)
            Css.removeClass(this.highlightedBox, "highlighted");

        this.highlightedBox = null;

        Firebug.Inspector.highlightObject(null, null, "boxModel");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Extends Panel

    initialize: function()
    {
        this.onMouseOver = Obj.bind(this.onMouseOver, this);
        this.onMouseOut = Obj.bind(this.onMouseOut, this);
        this.onAfterPaint = Obj.bindFixed(this.onMozAfterPaint, this);

        Panel.initialize.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        Events.addEventListener(this.panelNode, "mouseover", this.onMouseOver, false);
        Events.addEventListener(this.panelNode, "mouseout", this.onMouseOut, false);

        Panel.initializeNode.apply(this, arguments);
    },

    destroyNode: function()
    {
        Events.removeEventListener(this.panelNode, "mouseover", this.onMouseOver, false);
        Events.removeEventListener(this.panelNode, "mouseout", this.onMouseOut, false);

        Panel.destroyNode.apply(this, arguments);
    },

    show: function(state)
    {
        Events.addEventListener(this.context.browser, "MozAfterPaint", this.onAfterPaint, true);
    },

    hide: function()
    {
        Events.removeEventListener(this.context.browser, "MozAfterPaint", this.onAfterPaint, true);
    },

    supportsObject: function(object, type)
    {
        return object instanceof window.Element ? 1 : 0;
    },

    onMozAfterPaint: function()
    {
        // TabContext.invalidatePanels() method calls panel.refresh() on timeout and ensures
        // that it isn't executed too often. This is necessary in this case since
        // "MozAfterPaint" event can be fired very often (especially in case of animations)
        // and the update (see: updateSelection) could consume CPU cycles (see issue 6336).
        this.context.invalidatePanels("layout");
    },

    refresh: function()
    {
        this.updateSelection(this.selection);
    },

    updateSelection: function(element)
    {
        var view = element ? element.ownerDocument.defaultView : null;
        if (!view)
            return this.panelNode.textContent = "";

        var style = view.getComputedStyle(element, "");
        var args = Css.getBoxFromStyles(style, element);

        args.outerLeft = args.outerRight = args.outerTop = args.outerBottom = '';
        args.outerLeftMode = args.outerRightMode = args.outerTopMode = args.outerBottomMode = "";
        args.zIndex = args.zIndex ? args.zIndex : "auto";

        var boxSizing = style.getPropertyCSSValue("box-sizing") ||
            style.getPropertyCSSValue("-moz-box-sizing");
        args.boxSizing = boxSizing.cssText;

        var position = style.getPropertyCSSValue("position").cssText;
        args.position = position;
        args.outerLabel = "";

        if (Xml.isElementSVG(element) || Xml.isElementMathML(element) || Xml.isElementXUL(element))
        {
            var rect = element.getBoundingClientRect();
            // XXXjjb I believe this is incorrect. We should use the value as given by the call
            //if (rect.wrappedJSObject)
            //    rect = rect.wrappedJSObject;

            args.width = Math.round(rect.width);
            args.height = Math.round(rect.height);
        }

        // these Modes are classes on the domplate
        args.outerLeftMode = args.outerRightMode = args.outerTopMode = args.outerBottomMode =
            "blankEdge";

        function getStyle(style, name)
        {
            var value = style.getPropertyCSSValue(name);
            return value && value.cssText ? parseInt(value.cssText) : " ";
        }

        if (position == "absolute" || position == "fixed" || position == "relative")
        {
            args.outerLabel = Locale.$STR("LayoutPosition");
            args.outerLeft = getStyle(style, "left");
            args.outerTop = getStyle(style, "top");
            args.outerRight = getStyle(style, "right");
            args.outerBottom = getStyle(style, "bottom");
            args.outerLeftMode = args.outerRightMode = args.outerTopMode = args.outerBottomMode =
                "absoluteEdge";
        }

        var node = this.panelNode.getElementsByClassName("outerLayoutBox").item(0);
        // If the layout panel content was already created, just fill in the new values
        if (node)
        {
            // The styles for the positionLayoutBox need to be set manually
            var positionLayoutBox = this.panelNode.getElementsByClassName("positionLayoutBox").
                item(0);

            positionLayoutBox.className = "positionLayoutBox " + args.outerTopMode + " " +
                args.outerRightMode + " " + args.outerBottomMode + " " + args.outerLeftMode +
                " focusGroup";

            var values =
            {
                layoutPosition: {label: Locale.$STR("position"), value: "position"},
                layoutBoxSizing: {label: Locale.$STR("a11y.layout.box-sizing"),
                    value: "boxSizing"},
                layoutZIndex: {label: "z", value: "zIndex"},
                layoutLabelOuterTop: {value: "outerTop"},
                layoutLabelOuterRight: {value: "outerRight"},
                layoutLabelOuterBottom: {value: "outerBottom"},
                layoutLabelOuterLeft: {value: "outerLeft"},
                layoutLabelMarginTop: {value: "marginTop"},
                layoutLabelMarginRight: {value: "marginRight"},
                layoutLabelMarginBottom: {value: "marginBottom"},
                layoutLabelMarginLeft: {value: "marginLeft"},
                layoutLabelBorderTop: {value: "borderTop"},
                layoutLabelBorderRight: {value: "borderRight"},
                layoutLabelBorderBottom: {value: "borderBottom"},
                layoutLabelBorderLeft: {value: "borderLeft"},
                layoutLabelPaddingTop: {value: "paddingTop"},
                layoutLabelPaddingRight: {value: "paddingRight"},
                layoutLabelPaddingBottom: {value: "paddingBottom"},
                layoutLabelPaddingLeft: {value: "paddingLeft"},
                layoutLabelWidth: {value: "width"},
                layoutLabelHeight: {value: "height"},
                outerLabel: {value: "outerLabel"}
            };

            for (var val in values)
            {
                var element = this.panelNode.getElementsByClassName(val).item(0);

                element.textContent = values[val].label ?
                    values[val].label+": "+args[values[val].value] : args[values[val].value];

                if (this.template.isInvisible(args[values[val].value]))
                    Css.setClass(element.parentNode, "invisible");
                else
                    Css.removeClass(element.parentNode, "invisible");
            }
        }
        else
        {
            node = this.template.tag.replace(args, this.panelNode);
        }

        this.adjustCharWidth(this.getMaxCharWidth(args, node), this.panelNode);

        Events.dispatch(this.fbListeners, "onLayoutBoxCreated", [this, node, args]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
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
        box.style.cssText = "width: "+(240 + 3*maxWidth) + "px;";  // defaults to 300px

        this.adjustLabelWidth(node, "layoutLabelLeft", maxWidth);
        this.adjustLabelWidth(node, "layoutLabelRight", maxWidth);
    },

    /**
     * By adjusting this width, the labels can be centered.
     */
    adjustLabelWidth: function(node, labelName, maxWidth)
    {
        var labels = node.getElementsByClassName(labelName);
        for (var i = 0; i < labels.length; i++)
            labels[i].style.cssText = "width: " + maxWidth + "px;";
    },

    adjustBoxWidth: function(node, boxName, width)
    {
        var box = node.getElementsByClassName(boxName).item(0);
        box.style.cssText = "right: " + width + "px;" + " left: " + width + "px;";
    },

    getMaxCharWidth: function(args, node)
    {
        MeasureBox.startMeasuring(node);

        var maxWidth = Math.max(
            MeasureBox.measureText(String(args.marginLeft)).width,
            MeasureBox.measureText(String(args.marginRight)).width,
            MeasureBox.measureText(String(args.borderLeft)).width,
            MeasureBox.measureText(String(args.borderRight)).width,
            MeasureBox.measureText(String(args.paddingLeft)).width,
            MeasureBox.measureText(String(args.paddingRight)).width
        );

        MeasureBox.stopMeasuring();
        return maxWidth;
    },

    getOptionsMenuItems: function()
    {
        return [
            Menu.optionMenu("ShowRulers", "showRulers", "layout.option.tip.Show_Rulers")
        ];
    },

    getEditor: function(target, value)
    {
        if (!this.editor)
            this.editor = new LayoutEditor(this.document);

        return this.editor;
    }
});

// ********************************************************************************************* //
// LayoutEditor Implementation

function LayoutEditor(doc)
{
    this.initializeInline(doc);

    this.noWrap = false;
    this.numeric = true;
}

/**
 * @editor Represents an inline editor that is used by {@LayoutPanel} to modify layout data.
 */
LayoutEditor.prototype = domplate(InlineEditor.prototype,
/** @lends LayoutEditor */
{
    saveEdit: function(target, value, previousValue)
    {
        if (!this.panel.selection.style)
            return;

        var labelBox = Dom.getAncestorByClass(target, "layoutLabel");
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
            Firebug.Inspector.highlightObject(this.panel.selection, this.panel.context,
                "boxModel", boxFrame);
        }

        target.textContent = intValue;
    },

    endEditing: function(target, value, cancel)
    {
        // Don't remove groups
        return false;
    }
});

// ********************************************************************************************* //
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

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(LayoutPanel);

return LayoutPanel;

// ********************************************************************************************* //
});
