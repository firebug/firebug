/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/array",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/lib/events",
    "firebug/lib/locale",
    "firebug/lib/object",
    "firebug/lib/options",
    "firebug/lib/persist",
    "firebug/lib/string",
    "firebug/lib/url",
    "firebug/lib/xml",
    "firebug/chrome/menu",
    "firebug/chrome/panel",
    "firebug/css/cssModule",
    "firebug/css/cssReps",
    "firebug/css/loadHandler",
    "firebug/debugger/script/sourceLink",
],
function(Firebug, Arr, Css, Dom, Domplate, Events, Locale, Obj, Options, Persist, Str, Url, Xml,
    Menu, Panel, CSSModule, CSSReps, LoadHandler, SourceLink) {

"use strict";

// ********************************************************************************************* //
// Constants

var Cu = Components.utils;

var statusClasses = ["cssUnmatched", "cssParentMatch", "cssOverridden", "cssBestMatch"];

var {domplate, FOR, TAG, DIV, H1, SPAN, TABLE, TBODY, TR, TD} = Domplate;

//********************************************************************************************* //
//Module Implementation

try
{
    // Firefox 24
    // waiting for: https://bugzilla.mozilla.org/show_bug.cgi?id=867595
    var scope = {}
    Cu.import("resource://gre/modules/devtools/Loader.jsm", scope);
    var {CssLogic} = scope.devtools.require("devtools/styleinspector/css-logic");
}
catch (e)
{
    if (FBTrace.DBG_ERRORS)
        FBTrace.sysout("cssComputedPanel: EXCEPTION CssLogic is not available! " + e, e);
}

// ********************************************************************************************* //
// CSS Computed panel (HTML side panel)

function CSSComputedPanel() {}

CSSComputedPanel.prototype = Obj.extend(Panel,
{
    template: domplate(
    {
        computedStylesTag:
            DIV({"class": "a11yCSSView", role: "list", "aria-label":
                Locale.$STR("a11y.labels.computed styles")}),

        groupedStylesTag:
            FOR("group", "$groups",
                DIV({"class": "computedStylesGroup", $opened: "$group.opened", role: "list",
                        $hidden: "$group.props|hasNoStyles", _repObject: "$group"},
                    H1({"class": "cssComputedHeader groupHeader focusRow", role: "listitem"},
                        DIV({"class": "twisty", role: "presentation"}),
                        SPAN({"class": "cssComputedLabel"}, "$group.title")
                    ),
                    TAG("$stylesTag", {props: "$group.props"})
                )
            ),

        stylesTag:
            TABLE({"class": "computedStyleTable", role: "list"},
                TBODY({role: "presentation"},
                    FOR("prop", "$props",
                        TR({"class": "focusRow computedStyleRow computedStyle",
                                $opened: "$prop.opened", role: "listitem",
                                $hasSelectors: "$prop|hasSelectors", _repObject: "$prop"},
                            TD({"class": "stylePropName", role: "presentation"},
                                "$prop.property"
                            ),
                            TD({role: "presentation"},
                                SPAN({"class": "stylePropValue"}, "$prop.value|formatValue"))
                        ),
                        TR({"class": "focusRow computedStyleRow matchedSelectors", _repObject: "$prop"},
                            TD({colspan: 2},
                                TAG("$selectorsTag", {prop: "$prop"})
                            )
                        )
                    )
                )
            ),

        selectorsTag:
            TABLE({"class": "matchedSelectorsTable", role: "list"},
                TBODY({role: "presentation"},
                    FOR("selector", "$prop.matchedSelectors",
                        TR({"class": "focusRow computedStyleRow styleSelector "+
                            "$selector.status|getStatusClass", role: "listitem",
                                _repObject: "$selector"},
                            TD({"class": "selectorName", role: "presentation"},
                                "$selector.selector.text"),
                            TD({"class": "propValue", role: "presentation"},
                                SPAN({"class": "stylePropValue"}, "$selector|getAuthoredValue|formatValue")),
                            TD({"class": "styleSourceLink", role: "presentation"},
                                TAG(FirebugReps.SourceLink.tag, {object: "$selector|getSourceLink"})
                            )
                        )
                    )
                )
            ),

        getStatusClass: function(status)
        {
            return statusClasses[status];
        },

        hasNoStyles: function(props)
        {
            return props.length == 0;
        },

        hasSelectors: function(prop)
        {
            return prop.matchedRuleCount != 0;
        },

        getSourceLink: function(selector)
        {
            var href = selector.href.href || selector.href;
            var line = selector.ruleLine;
            var selectorDef = selector.selector;
            // Dev tools API starting from FF 26.0 renamed the "_cssRule" property to "cssRule"
            // (see issue 6609)
            // TODO: This check can be removed as soon as FF 26.0 is the minimum supported version
            var rule = selectorDef.cssRule ?
                selectorDef.cssRule.domRule : selectorDef._cssRule._domRule;

            var instance = Css.getInstanceForStyleSheet(rule.parentStyleSheet);
            var sourceLink = line != -1 ? new SourceLink(href, line, "css",
                rule, instance) : null;

            return sourceLink;
        },

        getAuthoredValue: function(selector)
        {
            if (Options.get("colorDisplay") !== "authored")
                return selector.value;

            var style = selector.selector.cssRule.domRule.style;
            return style.getAuthoredPropertyValue ?
                style.getAuthoredPropertyValue(selector.property) : selector.value;
        },

        formatValue: function(value)
        {
            value = formatColor(value);

            var limit = Options.get("stringCropLength");
            if (limit > 0)
                value = Str.cropString(value, limit);

            // Add a zero-width space after a comma to allow line breaking
            return value.replace(/,/g, ",\u200B");
        }
    }),

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    updateComputedView: function(element)
    {
        // The current selection can be null.
        if (!element)
            return;

        // Update now if the document is loaded, otherwise wait for "load" event.
        var loadHandler = new LoadHandler();
        loadHandler.handle(this.context, Obj.bindFixed(this.doUpdateComputedView, this, element));
    },

    doUpdateComputedView: function(element)
    {
        function isUnwantedProp(propName)
        {
            return !Options.get("showMozillaSpecificStyles") && Str.hasPrefix(propName, "-moz");
        }

        var win = element.ownerDocument.defaultView;
        var computedStyle = win.getComputedStyle(element);

        try
        {
            if (this.cssLogic)
                this.cssLogic.highlight(element);
        }
        catch (e)
        {
            // An exception is thrown if the document is not fully loaded yet
            // The cssLogic API needs to be used after "load" has been fired.
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("computedPanel.doUpdateComputedView; EXCEPTION " + e, e);
        }

        var showUserAgentCSS = Options.get("showUserAgentCSS");
        var props = [];
        for (var i = 0; i < computedStyle.length; ++i)
        {
            // xxxsz: There's a bug in the CssLogic module, which is caused by styles inherited
            // from inline styles of ancestor elements. See issue 7269.
            try
            {
                var prop = this.cssLogic ? this.cssLogic.getPropertyInfo(computedStyle[i]) :
                    Firebug.CSSModule.getPropertyInfo(computedStyle, computedStyle[i]);

                if (isUnwantedProp(prop.property) ||
                    (this.cssLogic && !showUserAgentCSS && prop.matchedRuleCount == 0))
                {
                    continue;
                }

                props.push(prop);
            }
            catch (e)
            {
            }
        }

        var parentNode = this.template.computedStylesTag.replace({}, this.panelNode);

        if (props.length != 0)
        {
            if (Options.get("computedStylesDisplay") === "alphabetical")
            {
                this.sortProperties(props);

                for (var i = 0; i < props.length; ++i)
                    props[i].opened = this.styleOpened[props[i].property];

                var result = this.template.stylesTag.replace({props: props}, parentNode);
            }
            else
            {
                var groups = [];
                for (var groupName in styleGroups)
                {
                    var title = Locale.$STR("StyleGroup-" + groupName);
                    var group = {name: groupName, title: title, props: []};

                    var groupProps = styleGroups[groupName];
                    for (var i = 0; i < groupProps.length; ++i)
                    {
                        var propName = groupProps[i];
                        if (isUnwantedProp(propName))
                            continue;

                        var prop = this.cssLogic ? this.cssLogic.getPropertyInfo(propName) :
                            Firebug.CSSModule.getPropertyInfo(computedStyle, propName);

                        if (!showUserAgentCSS && prop.matchedRuleCount == 0)
                            continue;

                        prop.opened = this.styleOpened[propName];

                        group.props.push(prop);

                        for (var j = 0; j < props.length; ++j)
                        {
                            if (props[j].property == propName)
                            {
                                props.splice(j, 1);
                                break;
                            }
                        }
                    }

                    group.opened = this.groupOpened[groupName];

                    groups.push(group);
                }

                if (props.length > 0)
                {
                    var group = groups[groups.length-1];
                    for (var i = 0; i < props.length; ++i)
                    {
                        var propName = props[i].property;
                        if (isUnwantedProp(propName))
                            continue;

                        var prop = this.cssLogic ? this.cssLogic.getPropertyInfo(propName) :
                            Firebug.CSSModule.getPropertyInfo(computedStyle, propName);

                        prop.opened = this.styleOpened[propName];

                        group.props.push(prop);
                    }

                    group.opened = this.groupOpened[group.name];
                }

                var result = this.template.groupedStylesTag.replace({groups: groups}, parentNode);
            }
        }
        else
        {
            FirebugReps.Warning.tag.replace({object: "computed.No_User-Defined_Styles"},
                this.panelNode);
        }

        if (this.scrollTop)
        {
            this.panelNode.scrollTop = this.scrollTop;
            delete this.scrollTop;
        }

        Events.dispatch(this.fbListeners, "onCSSRulesAdded", [this, result]);
    },

    toggleGroup: function(node)
    {
        var groupNode = Dom.getAncestorByClass(node, "computedStylesGroup");
        var group = Firebug.getRepObject(groupNode);

        Css.toggleClass(groupNode, "opened");
        var opened = Css.hasClass(groupNode, "opened");
        this.groupOpened[group.name] = opened;

        if (opened)
        {
            var offset = Dom.getClientOffset(node);
            var titleAtTop = offset.y < this.panelNode.scrollTop;

            Dom.scrollTo(groupNode, this.panelNode, null,
                groupNode.offsetHeight > this.panelNode.clientHeight || titleAtTop ? "top" : "bottom");
        }
    },

    toggleAllStyles: function(event, expand)
    {
        var computedStyles = this.panelNode.getElementsByClassName("computedStyle");

        for (var i = 0; i < computedStyles.length; ++i)
        {
            if (!Css.hasClass(computedStyles[i], "hasSelectors"))
                continue;

            var isOpened = Css.hasClass(computedStyles[i], "opened");
            if ((expand && !isOpened) || (!expand && isOpened))
                this.toggleStyle(computedStyles[i], false);
        }
    },

    toggleStyle: function(node, scroll)
    {
        var styleNode = Dom.getAncestorByClass(node, "computedStyle");
        var style = Firebug.getRepObject(styleNode);

        Css.toggleClass(styleNode, "opened");
        var opened = Css.hasClass(styleNode, "opened");
        this.styleOpened[style.property] = Css.hasClass(styleNode, "opened");

        if (opened && scroll)
        {
            var selectorsNode = styleNode.nextSibling;
            var offset = Dom.getClientOffset(styleNode);
            var titleAtTop = offset.y < this.panelNode.scrollTop;
            var totalHeight = styleNode.offsetHeight + selectorsNode.offsetHeight;
            var alignAtTop = totalHeight > this.panelNode.clientHeight || titleAtTop;

            Dom.scrollTo(alignAtTop ? styleNode : selectorsNode, this.panelNode, null,
                alignAtTop ? "top" : "bottom", alignAtTop);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Events

    onClick: function(event)
    {
        if (!Events.isLeftClick(event))
            return;

        var cssComputedHeader = Dom.getAncestorByClass(event.target, "cssComputedHeader");
        if (cssComputedHeader)
        {
            this.toggleGroup(event.target);
            return;
        }

        var computedStyle = Dom.getAncestorByClass(event.target, "computedStyle");
        if (computedStyle && Css.hasClass(computedStyle, "hasSelectors"))
        {
            this.toggleStyle(event.target, true);
            return;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // extends Panel

    name: "computed",
    parentPanel: "html",
    order: 1,

    initialize: function()
    {
        if (typeof CssLogic != "undefined")
            this.cssLogic = new CssLogic();

        this.groupOpened = [];
        for (var groupName in styleGroups)
            this.groupOpened[groupName] = true;

        this.styleOpened = [];

        // Listen for CSS changes so the Computed panel is properly updated when needed.
        Firebug.CSSModule.addListener(this);

        this.onClick = Obj.bind(this.onClick, this);

        Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        state.scrollTop = this.panelNode.scrollTop ? this.panelNode.scrollTop : this.lastScrollTop;
        state.groupOpened = this.groupOpened;
        state.styleOpened = this.styleOpened;

        Persist.persistObjects(this, state);

        Firebug.CSSModule.removeListener(this);

        Panel.destroyNode.apply(this, arguments);
    },

    initializeNode: function(oldPanelNode)
    {
        Events.addEventListener(this.panelNode, "click", this.onClick, false);

        Panel.initializeNode.apply(this, arguments);
    },

    destroyNode: function()
    {
        Events.removeEventListener(this.panelNode, "click", this.onClick, false);

        Panel.destroyNode.apply(this, arguments);
    },

    show: function(state)
    {
        // Wait for loadedContext to restore the panel
        if (this.context.loaded)
        {
            Persist.restoreObjects(this, state);

            if (state)
            {
                if (state.scrollTop)
                    this.scrollTop = state.scrollTop;

                if (state.groupOpened)
                    this.groupOpened = state.groupOpened;

                if (state.styleOpened)
                    this.styleOpened = state.styleOpened;
            }
        }

        if (this.selection)
            this.refresh();
    },

    hide: function()
    {
        this.lastScrollTop = this.panelNode.scrollTop;
    },

    updateView: function(element)
    {
        this.updateComputedView(element);
    },

    supportsObject: function(object, type)
    {
        return object instanceof window.Element ? 1 : 0;
    },

    refresh: function()
    {
        this.updateSelection(this.selection);
    },

    updateSelection: function(element)
    {
        this.updateComputedView(element);
    },

    updateOption: function(name, value)
    {
        var options = new Set();
        options.add("showUserAgentCSS");
        options.add("computedStylesDisplay");
        options.add("colorDisplay");
        options.add("showMozillaSpecificStyles");

        if (options.has(name))
            this.refresh();
    },

    getOptionsMenuItems: function()
    {
        var items = [];

        if (this.cssLogic)
        {
            items.push(
                Menu.optionMenu("Show_User_Agent_CSS", "showUserAgentCSS",
                "style.option.tip.Show_User_Agent_CSS")
            );
        }

        items.push(
            {
                label: "Sort_alphabetically",
                type: "checkbox",
                checked: Options.get("computedStylesDisplay") === "alphabetical",
                tooltiptext: "computed.option.tip.Sort_Alphabetically",
                command: Obj.bind(this.toggleDisplay, this)
            },
            Menu.optionMenu("Show_Mozilla_specific_styles",
                "showMozillaSpecificStyles",
                "computed.option.tip.Show_Mozilla_Specific_Styles")
        );

        items = Arr.extendArray(items, CSSModule.getColorDisplayOptionMenuItems());

        return items;
    },

    getContextMenuItems: function(style, target)
    {
        var items = [];
        var computedStyles = this.panelNode.getElementsByClassName("computedStyle");
        var expandAll = false;
        var collapseAll = false;
        for (var i = 0; i < computedStyles.length; ++i)
        {
            if (!Css.hasClass(computedStyles[i], "hasSelectors"))
                continue;

            if (!expandAll && !Css.hasClass(computedStyles[i], "opened"))
                expandAll = true;
            if (!collapseAll && Css.hasClass(computedStyles[i], "opened"))
                collapseAll = true;
        }

        if (expandAll)
        {
            items.push(
                {
                    label: "computed.option.label.Expand_All_Styles",
                    command: Obj.bind(this.toggleAllStyles, this, true),
                    tooltiptext: "computed.option.tip.Expand_All_Styles"
                }
            );
        }

        if (collapseAll)
        {
            items.push(
                {
                    label: "computed.option.label.Collapse_All_Styles",
                    command: Obj.bind(this.toggleAllStyles, this, false),
                    tooltiptext: "computed.option.tip.Collapse_All_Styles"
                }
            );
        }

        return items;
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
        var display = Options.get("computedStylesDisplay") === "alphabetical" ?
            "grouped" : "alphabetical";
        Options.set("computedStylesDisplay", display);
    },

    sortProperties: function(props)
    {
        props.sort(function(a, b)
        {
            return a.property > b.property ? 1 : -1;
        });
    },

    getStylesheetURL: function(rule, getBaseUri)
    {
        // If parentStyleSheet.href is null, then per the CSS standard this is an inline style.
        if (rule && rule.parentStyleSheet && rule.parentStyleSheet.href)
            return rule.parentStyleSheet.href;
        else if (getBaseUri)
            return this.selection.ownerDocument.baseURI;
        else
            return this.selection.ownerDocument.location.href;
    },

    showInfoTip: function(infoTip, target, x, y, rangeParent, rangeOffset)
    {
        var propValue = Dom.getAncestorByClass(target, "stylePropValue");
        // xxxsz: This code is duplicated from CSSStyleSheetPanel. We should centralize the code somewhere,
        // so it can be reused here
        if (propValue)
        {
            var propInfo = Firebug.getRepObject(target);

            var prop = propInfo.property;

            var style = propInfo.selector ? propInfo.selector.cssRule.domRule.style : null;
            var value = (Options.get("colorDisplay") === "authored" && style &&
                    style.getAuthoredPropertyValue) ?
                style.getAuthoredPropertyValue(propInfo.property) : formatColor(propInfo.value);

            var cssValue;

            if (prop == "font" || prop == "font-family")
            {
                if (value.charAt(rangeOffset) == ",")
                    return;

                cssValue = Firebug.CSSModule.parseCSSFontFamilyValue(value, rangeOffset, prop);
            }
            else
            {
                cssValue = Firebug.CSSModule.parseCSSValue(value, rangeOffset);
            }

            if (!cssValue)
                return false;

            if (cssValue.value == this.infoTipValue)
                return true;

            this.infoTipValue = cssValue.value;

            switch (cssValue.type)
            {
                case "rgb":
                case "hsl":
                case "gradient":
                case "colorKeyword":
                    this.infoTipType = "color";
                    this.infoTipObject = cssValue.value;
                    return CSSReps.CSSInfoTip.populateColorInfoTip(infoTip, cssValue.value);

                case "url":
                    if (Css.isImageProperty(prop))
                    {
                        var baseURL = typeof propInfo.href == "object" ? propInfo.href.href : propInfo.href;
                        if (!baseURL)
                            baseURL = propInfo.matchedSelectors[0].href;
                        var relURL = Firebug.CSSModule.parseURLValue(cssValue.value);
                        var absURL = Url.isDataURL(relURL) ? relURL : Url.absoluteURL(relURL, baseURL);
                        var repeat = Firebug.CSSModule.parseRepeatValue(value);

                        this.infoTipType = "image";
                        this.infoTipObject = absURL;

                        return CSSReps.CSSInfoTip.populateImageInfoTip(infoTip, absURL, repeat);
                    }
                    break;

                case "fontFamily":
                    return CSSReps.CSSInfoTip.populateFontFamilyInfoTip(infoTip, cssValue.value);
            }

            delete this.infoTipType;
            delete this.infoTipValue;
            delete this.infoTipObject;

            return false;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Change Listener

    onCSSInsertRule: function(styleSheet, cssText, ruleIndex)
    {
        // Force update, this causes updateSelection to be called.
        // See {@link Panel.select}
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

function formatColor(color)
{
    switch (Options.get("colorDisplay"))
    {
        case "hex":
            return Css.rgbToHex(color);

        case "hsl":
            return Css.rgbToHSL(color);

        case "rgb":
            return Css.colorNameToRGB(color);

        default:
            return color;
    }
}

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
        "background-clip",
        "-moz-background-inline-policy",
        "background-origin",
        "background-size",
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
        "border-image",
        "-moz-border-start",
        "-moz-border-start-color",
        "-moz-border-start-style",
        "-moz-border-start-width",
        "border-top-left-radius",
        "border-top-right-radius",
        "border-bottom-left-radius",
        "border-bottom-right-radius",
        "-moz-outline-radius-bottomleft",
        "-moz-outline-radius-bottomright",
        "-moz-outline-radius-topleft",
        "-moz-outline-radius-topright",
        "box-shadow",
        "outline-color",
        "outline-offset",
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
        "transform",
        "transform-origin",
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

    other: []
};

// ********************************************************************************************* //
// Registration

Firebug.registerPanel(CSSComputedPanel);

return CSSComputedPanel;

// ********************************************************************************************* //
});
