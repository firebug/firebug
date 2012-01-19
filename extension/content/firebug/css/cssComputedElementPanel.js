/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/events",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/css/cssElementPanel",
    "firebug/firefox/menu"
],
function(Obj, Firebug, Domplate, Locale, Events, Css, Dom, CSSElementPanel, Menu) {

with (Domplate) {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// CSS Elemenet Panel (HTML side panel)

function CSSComputedElementPanel() {}

CSSComputedElementPanel.prototype = Obj.extend(CSSElementPanel.prototype,
{
    template: domplate(
    {
        computedTag:
            DIV({"class": "a11yCSSView", role: "list", "aria-label":
                Locale.$STR("aria.labels.computed styles")},
                FOR("group", "$groups",
                    DIV({"class": "computedStylesGroup", $opened: "$group.opened", role: "list"},
                        H1({"class": "cssComputedHeader groupHeader focusRow", role: "listitem"},
                            IMG({"class": "twisty", role: "presentation"}),
                            SPAN({"class": "cssComputedLabel"}, "$group.title")
                        ),
                        TAG("$stylesTag", {props: "$group.props"})
                    )
                )
            ),

        computedAlphabeticalTag:
            DIV({"class": "a11yCSSView", role: "list",
                "aria-label" : Locale.$STR("aria.labels.computed styles")},
                TAG("$stylesTag", {props: "$props"})
            ),

        stylesTag:
            TABLE({width: "100%", role: "group"},
                TBODY({role: "presentation"},
                    FOR("prop", "$props",
                        TR({"class": "focusRow computedStyleRow", role: "listitem"},
                            TD({"class": "stylePropName", role: "presentation"}, "$prop.name"),
                            TD({"class": "stylePropValue", role: "presentation"}, "$prop.value")
                        )
                    )
                )
            )
    }),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    updateComputedView: function(element)
    {
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("CSSComputedElementPanel.updateComputedView;", element);

        var win = element.ownerDocument.defaultView;
        var style = win.getComputedStyle(element, "");

        if (Firebug.computedStylesDisplay == "alphabetical")
        {
            var props = [];

            for (var groupName in styleGroups)
            {
                var groupProps = styleGroups[groupName];

                for (var i = 0; i < groupProps.length; ++i)
                {
                    var propName = groupProps[i];
                    if (!Firebug.showMozillaSpecificStyles && propName.match(/^-moz/))
                        continue;

                    var propValue = Css.stripUnits(Css.rgbToHex(style.getPropertyValue(propName)));
                    if (propValue)
                        props.push({name: propName, value: propValue});
                }
            }

            this.sortProperties(props);

            var result = this.template.computedAlphabeticalTag.replace(
                {props: props}, this.panelNode);
        }
        else
        {
            var groups = [];

            for (var groupName in styleGroups)
            {
                var title = Locale.$STR("StyleGroup-" + groupName);
                var group = {title: title, props: []};
                groups.push(group);

                var props = styleGroups[groupName];
                for (var i = 0; i < props.length; ++i)
                {
                    var propName = props[i];
                    if (!Firebug.showMozillaSpecificStyles && propName.match(/^-moz/))
                      continue;

                    var propValue = Css.stripUnits(Css.rgbToHex(style.getPropertyValue(propName)));
                    if (propValue)
                        group.props.push({name: propName, value: propValue});
                }
                group.opened = this.groupOpened[title];
            }

            var result = this.template.computedTag.replace({groups: groups}, this.panelNode);
        }

        Events.dispatch(this.fbListeners, 'onCSSRulesAdded', [this, result]);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "computed",
    parentPanel: "html",
    order: 1,

    initialize: function()
    {
        this.groupOpened = [];
        for (var groupName in styleGroups)
        {
            var title = Locale.$STR("StyleGroup-" + groupName);
            this.groupOpened[title] = true;
        }

        this.onClick = Obj.bind(this.onClick, this);
        this.onMouseDown = Obj.bind(this.onMouseDown, this);

        // Listen for CSS changes so the Computed panel is properly updated when needed.
        Firebug.CSSModule.addListener(this);

        CSSElementPanel.prototype.initialize.apply(this, arguments);
    },

    destroy: function()
    {
        Firebug.CSSModule.removeListener(this);

        CSSElementPanel.prototype.destroy.apply(this, arguments);
    },

    updateView: function(element)
    {
        this.updateComputedView(element);
    },

    updateOption: function(name, value)
    {
        if (name == "computedStylesDisplay" || name == "showMozillaSpecificStyles")
            this.refresh();
    },

    getOptionsMenuItems: function()
    {
        return [
            {
                label: "computed.option.Sort_Alphabetically",
                type: "checkbox",
                checked: Firebug.computedStylesDisplay == "alphabetical",
                tooltiptext: "computed.option.tip.Sort_Alphabetically",
                command: Obj.bind(this.toggleDisplay, this)
            },
            Menu.optionMenu("computed.option.Show_Mozilla_Specific_Styles",
                "showMozillaSpecificStyles",
                "computed.option.tip.Show_Mozilla_Specific_Styles"),
            "-",
            {
                label: "panel.Refresh",
                command: Obj.bind(this.refresh, this),
                tooltiptext: "panel.tip.Refresh"
            }
        ];
    },

    onMouseDown: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        var cssComputedHeader = Dom.getAncestorByClass(event.target, "cssComputedHeader");
        if (cssComputedHeader)
            this.toggleNode(event);
    },

    toggleNode: function(event)
    {
        var group = Dom.getAncestorByClass(event.target, "computedStylesGroup");
        var groupName = group.getElementsByClassName("cssComputedLabel")[0].textContent;

        Css.toggleClass(group, "opened");
        this.groupOpened[groupName] = Css.hasClass(group, "opened");
    },

    toggleDisplay: function()
    {
        var display = Firebug.computedStylesDisplay == "alphabetical" ? "grouped" : "alphabetical";
        Firebug.Options.set("computedStylesDisplay", display);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Change Listener

    onCSSInsertRule: function(styleSheet, cssText, ruleIndex)
    {
        // Force update, this causes updateSelection to be called.
        // See {@link Firebug.Panel.select}
        this.selection = null;
    },

    onCSSDeleteRule: function(styleSheet, ruleIndex)
    {
        this.selection = null;
    },

    onCSSSetProperty: function(style, propName, propValue, propPriority, prevValue,
        prevPriority, rule, baseText)
    {
        this.selection = null;
    },

    onCSSRemoveProperty: function(style, propName, prevValue, prevPriority, rule, baseText)
    {
        this.selection = null;
    }
});

// ********************************************************************************************* //
// Helpers

const styleGroups =
{
    text: [
        "font-family",
        "font-size",
        "font-weight",
        "font-style",
        "font-size-adjust",
        "color",
        "text-transform",
        "text-decoration",
        "letter-spacing",
        "word-spacing",
        "line-height",
        "text-align",
        "vertical-align",
        "direction",
        "column-count",
        "column-gap",
        "column-width",
        "-moz-tab-size", // FF4.0
        "-moz-font-feature-settings", // FF4.0
        "-moz-font-language-override", // FF4.0
        "-moz-text-blink", // FF6.0
        "-moz-text-decoration-color", // FF6.0
        "-moz-text-decoration-line", // FF6.0
        "-moz-text-decoration-style", // FF6.0
        "hyphens", // FF 6.0
        "text-overflow" // FF7.0
    ],

    background: [
        "background-color",
        "background-image",
        "background-repeat",
        "background-position",
        "background-attachment",
        "opacity",
        "-moz-background-clip",
        "-moz-background-inline-policy",
        "-moz-background-origin",
        "-moz-background-size",
        "-moz-image-region"
    ],

    box: [
        "width",
        "height",
        "top",
        "right",
        "bottom",
        "left",
        "margin-top",
        "margin-right",
        "margin-bottom",
        "margin-left",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "-moz-padding-start",
        "-moz-padding-end",
        "border-top-width",
        "border-right-width",
        "border-bottom-width",
        "border-left-width",
        "border-top-color",
        "-moz-border-top-colors",
        "border-right-color",
        "-moz-border-right-colors",
        "border-bottom-color",
        "-moz-border-bottom-colors",
        "border-left-color",
        "-moz-border-left-colors",
        "border-top-style",
        "border-right-style",
        "border-bottom-style",
        "border-left-style",
        "-moz-border-end",
        "-moz-border-end-color",
        "-moz-border-end-style",
        "-moz-border-end-width",
        "-moz-border-image",
        "-moz-border-start",
        "-moz-border-start-color",
        "-moz-border-start-style",
        "-moz-border-start-width",
        "-moz-border-top-radius",
        "-moz-border-right-radius",
        "-moz-border-bottom-radius",
        "-moz-border-left-radius",
        "-moz-outline-radius-bottomleft",
        "-moz-outline-radius-bottomright",
        "-moz-outline-radius-topleft",
        "-moz-outline-radius-topright",
        "-moz-box-shadow",
        "box-shadow",
        "outline-top-width",
        "outline-right-width",
        "outline-bottom-width",
        "outline-left-width",
        "outline-top-color",
        "outline-right-color",
        "outline-bottom-color",
        "outline-left-color",
        "outline-top-style",
        "outline-right-style",
        "outline-bottom-style",
        "outline-left-style",
        "-moz-box-align",
        "-moz-box-direction",
        "-moz-box-flex",
        "-moz-box-flexgroup",
        "-moz-box-ordinal-group",
        "-moz-box-orient",
        "-moz-box-pack",
        "-moz-box-sizing",
        "-moz-margin-start",
        "-moz-margin-end"
    ],

    layout: [
        "position",
        "display",
        "visibility",
        "z-index",
        "overflow-x",  // http://www.w3.org/TR/2002/WD-css3-box-20021024/#overflow
        "overflow-y",
        "overflow-clip",
        "-moz-transform",
        "-moz-transform-origin",
        "white-space",
        "clip",
        "float",
        "clear",
        "-moz-appearance",
        "-moz-stack-sizing",
        "-moz-column-count",
        "-moz-column-gap",
        "-moz-column-width",
        "-moz-column-rule",
        "-moz-column-rule-width",
        "-moz-column-rule-style",
        "-moz-column-rule-color",
        "-moz-float-edge",
        "orient"
    ],

    other: [
        "cursor",
        "list-style-image",
        "list-style-position",
        "list-style-type",
        "marker-offset",
        "-moz-user-focus",
        "-moz-user-select",
        "-moz-user-modify",
        "-moz-user-input",
        "-moz-animation", // FF5.0
        "-moz-animation-delay", // FF5.0
        "-moz-animation-direction", // FF5.0
        "-moz-animation-duration", // FF5.0
        "-moz-animation-iteration-count", // FF5.0
        "-moz-animation-name", // FF5.0
        "-moz-animation-play-state", // FF5.0
        "-moz-animation-timing-function", // FF5.0
        "-moz-animation-fill-mode", // FF5.0
        "-moz-transition", // FF4.0
        "-moz-transition-delay", // FF4.0
        "-moz-transition-duration", // FF4.0
        "-moz-transition-property", // FF4.0
        "-moz-transition-timing-function", // FF4.0
        "-moz-force-broken-image-icon",
        "-moz-window-shadow"
    ]
};

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(CSSComputedElementPanel);

return CSSComputedElementPanel;

// ********************************************************************************************* //
}});
