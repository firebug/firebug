/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/url",
    "firebug/lib/options",
],
function(FBTrace, URL, Options) {

// ********************************************************************************************* //
// Module Implementation

var CSS = {};

// ********************************************************************************************* //
// CSS API

CSS.safeGetCSSRules = function(styleSheet)
{
    try
    {
        return styleSheet.cssRules;
    }
    catch (e)
    {
    }

    return null;
}

// ********************************************************************************************* //
// Stylesheet API

CSS.createStyleSheet = function(doc, url)
{
    var style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
    style.setAttribute("charset","utf-8");
    style.setAttribute("type", "text/css");

    var cssText = url ? FBL.getResource(url) : null;
    if (cssText)
    {
        var index = url.lastIndexOf("/");
        var absURL = url.substr(0, index+1);

        // Replace all relative URLs with absolute (using the passed url).
        // Note that stylesheets can come from various extensions and the source can
        // be even used in a browser env where relative URLs make more sense.
        var expr = /url\(([\'"]?)(?![\'"]?(?:[a-z]+:|\/))/gi;
        cssText = cssText.replace(expr, "url($1" + absURL);

        style.innerHTML = cssText;
    }

    Firebug.setIgnored(style);
    return style;
}

CSS.addStyleSheet = function(doc, style)
{
    var heads = doc.getElementsByTagName("head");
    if (heads.length)
        heads[0].appendChild(style);
    else
        doc.documentElement.appendChild(style);
};

CSS.appendStylesheet = function(doc, uri)
{
    // Make sure the stylesheet is not appended twice.
    var styleSheet = FBL.$(uri, doc);
    if (styleSheet)
        return styleSheet;

    var styleSheet = CSS.createStyleSheet(doc, uri);
    styleSheet.setAttribute("id", uri);
    CSS.addStyleSheet(doc, styleSheet);

    return styleSheet;
},

CSS.getStyleSheetByHref = function(url, context)
{
    if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
    {
        var r = CSS.totalRules;
        var s = CSS.totalSheets;
        var t = new Date();
    }

    if (!context.styleSheetMap)
        CSS.createStyleSheetMap(context);  // fill cache

    if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
        FBTrace.sysout((CSS.totalRules-r)+" rules in "+ (CSS.totalSheets-s)+
            " sheets required "+(new Date().getTime() - t.getTime())+" ms",
            context.styleSheetMap);

    // hasOwnProperty is called to prevent possible conflicts with prototype extensions
    // and strict mode warnings
    return context.styleSheetMap.hasOwnProperty(url) ? context.styleSheetMap[url] : undefined;
};

CSS.createStyleSheetMap = function(context)
{
    context.styleSheetMap = {};

    function addSheet(sheet)
    {
        var sheetURL = CSS.getURLForStyleSheet(sheet);
        context.styleSheetMap[sheetURL] = sheet;

        if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
        {
            CSS.totalSheets++;
            FBTrace.sysout("addSheet "+CSS.totalSheets+" "+sheetURL);
        }

        // recurse for imported sheets

        for (var i = 0; i < sheet.cssRules.length; ++i)
        {
            if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
                CSS.totalRules++;

            var rule = sheet.cssRules[i];
            if (rule instanceof CSSStyleRule)
            {
                if (rule.type == CSSRule.STYLE_RULE)  // once we get here no more imports
                    return;
            }
            else if (rule instanceof CSSImportRule)
            {
                addSheet(rule.styleSheet);
            }
        }
    }

    FBL.iterateWindows(context.window, function(subwin)
    {
        var rootSheets = subwin.document.styleSheets;
        if (!rootSheets)
            return; // XUL?

        for (var i = 0; i < rootSheets.length; ++i)
        {
            addSheet(rootSheets[i]);
        }
    });

    if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
        FBTrace.sysout("css.createStyleSheetMap for "+context.getName(), context.styleSheetMap);

    return context.styleSheetMap;
};

CSS.getAllStyleSheets = function(context)
{
    var styleSheets = [];

    function addSheet(sheet)
    {
        var sheetLocation =  CSS.getURLForStyleSheet(sheet);

        if (!Options.get("showUserAgentCSS") && URL.isSystemURL(sheetLocation))
            return;

        if (sheet.ownerNode && Firebug.shouldIgnore(sheet.ownerNode))
            return;

        styleSheets.push(sheet);

        try
        {
            for (var i = 0; i < sheet.cssRules.length; ++i)
            {
                var rule = sheet.cssRules[i];
                if (rule instanceof window.CSSImportRule)
                    addSheet(rule.styleSheet);
            }
        }
        catch(e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("getAllStyleSheets sheet.cssRules FAILS for "+
                    (sheet?sheet.href:"null sheet")+e, e);
        }
    }

    FBL.iterateWindows(context.window, function(subwin)
    {
        var rootSheets = subwin.document.styleSheets;
        for (var i = 0; i < rootSheets.length; ++i)
            addSheet(rootSheets[i]);
    });

    return styleSheets;
};

CSS.getURLForStyleSheet = function(styleSheet)
{
    // http://www.w3.org/TR/DOM-Level-2-Style/stylesheets.html#StyleSheets-StyleSheet.
    // For inline style sheets, the value of this attribute is null.
    return (styleSheet.href ? styleSheet.href : styleSheet.ownerNode.ownerDocument.URL);
};

/**
 * Retrieves the instance number for a given style sheet. The instance number
 * is sheet's index within the set of all other sheets whose URL is the same.
 */
CSS.getInstanceForStyleSheet = function(styleSheet, ownerDocument)
{
    // ownerDocument is an optional hint for performance
    if (FBTrace.DBG_CSS)
        FBTrace.sysout("getInstanceForStyleSheet href:" + styleSheet.href + " mediaText:" +
            styleSheet.media.mediaText + " path to ownerNode" +
            (styleSheet.ownerNode && FBL.getElementXPath(styleSheet.ownerNode)), ownerDocument);

    ownerDocument = ownerDocument || CSS.getDocumentForStyleSheet(styleSheet);
    if (!ownerDocument)
        return;

    var ret = 0,
        styleSheets = ownerDocument.styleSheets,
        href = styleSheet.href;

    for (var i = 0; i < styleSheets.length; i++)
    {
        var curSheet = styleSheets[i];
        if (FBTrace.DBG_CSS)
            FBTrace.sysout("getInstanceForStyleSheet: compare href " + i +
                " " + curSheet.href + " " + curSheet.media.mediaText + " " +
                (curSheet.ownerNode && FBL.getElementXPath(curSheet.ownerNode)));

        if (curSheet == styleSheet)
            break;

        if (curSheet.href == href)
            ret++;
    }
    return ret;
};

CSS.getDocumentForStyleSheet = function(styleSheet)
{
    while (styleSheet.parentStyleSheet && !styleSheet.ownerNode)
    {
        styleSheet = styleSheet.parentStyleSheet;
    }

    if (styleSheet.ownerNode)
        return styleSheet.ownerNode.ownerDocument;
};

// ********************************************************************************************* //
// CSS Info

CSS.cssInfo = {};
CSS.cssInfo.html =
{
    "background": ["bgRepeat", "bgAttachment", "bgPosition", "color", "systemColor",
        "mozBackgroundImage", "none"],
    "background-attachment": ["bgAttachment"],
    "background-color": ["color", "systemColor"],
    "background-image": ["none", "mozBackgroundImage"],
    "background-position": ["bgPosition"],
    "background-repeat": ["bgRepeat"],
    "background-size": ["bgSize"],
    "background-clip": ["boxModels"], //FF4.0
    "background-origin": ["boxModels"], //FF4.0

    "border": ["borderStyle", "thickness", "color", "systemColor", "none"],
    "border-top": ["borderStyle", "borderCollapse", "color", "systemColor", "none"],
    "border-right": ["borderStyle", "borderCollapse", "color", "systemColor", "none"],
    "border-bottom": ["borderStyle", "borderCollapse", "color", "systemColor", "none"],
    "border-left": ["borderStyle", "borderCollapse", "color", "systemColor", "none"],
    "border-collapse": ["borderCollapse"],
    "border-color": ["color", "systemColor"],
    "border-top-color": ["color", "systemColor"],
    "border-right-color": ["color", "systemColor"],
    "border-bottom-color": ["color", "systemColor"],
    "border-left-color": ["color", "systemColor"],
    "border-spacing": [],
    "border-style": ["borderStyle"],
    "border-top-style": ["borderStyle"],
    "border-right-style": ["borderStyle"],
    "border-bottom-style": ["borderStyle"],
    "border-left-style": ["borderStyle"],
    "border-width": ["thickness"],
    "border-top-width": ["thickness"],
    "border-right-width": ["thickness"],
    "border-bottom-width": ["thickness"],
    "border-left-width": ["thickness"],
    "border-radius": [], //FF4.0
    "border-top-left-radius": [], //FF4.0
    "border-top-right-radius": [], //FF4.0
    "border-bottom-right-radius": [], //FF4.0
    "border-bottom-left-radius": [], //FF4.0

    "box-shadow": [], //FF4.0

    "bottom": ["auto"],
    "caption-side": ["captionSide"],
    "clear": ["clear", "none"],
    "clip": ["auto"],
    "color": ["color", "systemColor"],
    "content": ["content", "none"],
    "counter-increment": ["none"],
    "counter-reset": ["none"],
    "cursor": ["cursor", "none"],
    "direction": ["direction"],
    "display": ["display", "none"],
    "empty-cells": [],
    "float": ["float", "none"],
    "font": ["fontStyle", "fontVariant", "fontWeight", "fontFamily"],

    "font-family": ["fontFamily"],
    "font-size": ["fontSize"],
    "font-size-adjust": [],
    "font-stretch": [],
    "font-style": ["fontStyle"],
    "font-variant": ["fontVariant"],
    "font-weight": ["fontWeight"],

    "height": ["auto"],
    "ime-mode": ["imeMode", "auto"],
    "left": ["auto"],
    "letter-spacing": [],
    "line-height": [],

    "list-style": ["listStyleType", "listStylePosition", "none"],
    "list-style-image": ["none"],
    "list-style-position": ["listStylePosition"],
    "list-style-type": ["listStyleType", "none"],

    "margin": [],
    "margin-top": [],
    "margin-right": [],
    "margin-bottom": [],
    "margin-left": [],

    "marker-offset": ["auto"],
    "min-height": ["none"],
    "max-height": ["none"],
    "min-width": ["width", "none"],
    "max-width": ["width", "none"],

    "opacity": [],

    "outline": ["borderStyle", "color", "systemColor", "none"],
    "outline-color": ["color", "systemColor"],
    "outline-style": ["borderStyle"],
    "outline-width": [],

    "overflow": ["overflow", "auto"],
    "overflow-x": ["overflow", "auto"],
    "overflow-y": ["overflow", "auto"],

    "padding": [],
    "padding-top": [],
    "padding-right": [],
    "padding-bottom": [],
    "padding-left": [],

    "position": ["position"],
    "quotes": ["none"],
    "resize": ["resize"],//FF4.0
    "right": ["auto"],
    "table-layout": ["tableLayout", "auto"],
    "text-align": ["textAlign"],
    "text-decoration": ["textDecoration", "none"],
    "text-indent": [],
    "text-rendering": ["textRendering", "auto"],
    "text-shadow": [],
    "text-transform": ["textTransform", "none"],
    "top": ["auto"],
    "unicode-bidi": [],
    "vertical-align": ["verticalAlign"],
    "visibility": ["visibility"],
    "white-space": ["whiteSpace"],
    "width": ["width", "auto"],
    "word-spacing": [],
    "word-wrap": ["wordWrap"],
    "z-index": [],

    "-moz-appearance": ["mozAppearance"],
    "-moz-border-image": ["mozBorderImage", "thickness", "none"],
    "-moz-border-radius": [],
    "-moz-border-radius-bottomleft": [],
    "-moz-border-radius-bottomright": [],
    "-moz-border-radius-topleft": [],
    "-moz-border-radius-topright": [],
    "-moz-border-top-colors": ["color", "systemColor"],
    "-moz-border-right-colors": ["color", "systemColor"],
    "-moz-border-bottom-colors": ["color", "systemColor"],
    "-moz-border-left-colors": ["color", "systemColor"],
    "-moz-border-start": ["borderStyle", "borderCollapse", "color", "systemColor", "none"],
    "-moz-border-end": ["borderStyle", "borderCollapse", "color", "systemColor", "none"],
    "-moz-border-start-color": ["color", "systemColor"],
    "-moz-border-end-color": ["color", "systemColor"],
    "-moz-border-start-style": ["borderStyle"],
    "-moz-border-end-style": ["borderStyle"],
    "-moz-border-start-width": ["thickness"],
    "-moz-border-end-width": ["thickness"],
    "-moz-box-align": ["mozBoxAlign"],
    "-moz-box-direction": ["mozBoxDirection"],
    "-moz-box-flex": [],
    "-moz-box-ordinal-group": [],
    "-moz-box-orient": ["mozBoxOrient"],
    "-moz-box-pack": ["mozBoxPack"],
    "-moz-box-shadow": ["mozBoxShadow", "none"],
    "-moz-box-sizing": ["mozBoxSizing"],
    "-moz-user-focus": ["userFocus", "none"],
    "-moz-user-input": ["userInput"],
    "-moz-user-modify": [],
    "-moz-user-select": ["userSelect", "none"],
    //"-moz-background-clip": [], //Removed/renamed in FF4.0
    "-moz-background-inline-policy": [],
    //"-moz-background-origin": [], //Removed/renamed in FF4.0
    "-moz-binding": [],
    "-moz-column-count": [],
    "-moz-column-gap": [],
    "-moz-column-rule": ["thickness", "borderStyle", "color", "systemColor"],
    "-moz-column-rule-width": ["thickness"],
    "-moz-column-rule-style": ["borderStyle"],
    "-moz-column-rule-color": ["color",  "systemColor"],
    "-moz-column-width": [],
    "-moz-image-region": [],
    "-moz-transform": ["mozTransformFunction", "none"],
    "-moz-transform-origin": ["bgPosition"],
    "-moz-font-feature-settings": ["normal"], //FF4.0
    "-moz-tab-size": [], //FF4.0,
    "-moz-transition": [], //FF4.0 TODO
    "-moz-transition-property": [], //FF4.0 TODO
    "-moz-transition-duration": [], //FF4.0 TODO
    "-moz-transition-timing-function": [], //FF4.0 TODO
    "-moz-transition-delay": [] //FF4.0 TODO

};

CSS.cssInfo.svg = {
    "alignment-baseline": ["svgAlignmentBaseline"],
    "baseline-shift": ["baselineShift"],
    "clip": ["auto"],
    "clip-path": ["none"],
    "clip-rule": ["clipRule"],
    "color": ["color"],
    "color-interpolation": ["colorInterpolation"],
    "color-interpolation-filters": ["colorInterpolation"],
    "color-profile": ["colorProfile"],
    "color-rendering": ["colorRendering"],
    "cursor": ["cursor"],
    "direction": ["direction"],
    "display": ["display"],
    "dominant-baseline": ["dominantBaseline"],
    "enable-background": ["accumulate"],
    "fill": ["clipRule"],
    "fill-opacity": [],
    "fill-rule": ["clipRule"],
    "filter": ["none"],
    "flood-color": ["currentColor"],
    "flood-opacity": [],
    "font": ["fontStyle","fontVariant","fontWeight"],
    "font-family": ["fontFamily"],
    "font-size": ["fontSize"],
    "font-size-adjust": [],
    "font-stretch": ["fontStretch"],
    "font-style": ["fontStyle"],
    "font-variant": ["fontVariant"],
    "font-weight": ["fontWeight"],
    "glyph-orientation-horizontal": [],
    "glyph-orientation-vertical": ["auto"],
    "image-rendering": ["imageRendering"],
    "kerning": ["auto"],
    "letter-spacing": ["normal"],
    "lighting-color": ["currentColor"],
    "marker": ["none"],
    "marker-end": ["none"],
    "mask": ["none"],
    "opacity": [],
    "overflow": ["auto","svgOverflow"],
    "pointer-events": ["pointerEvents","none"],
    "shape-rendering": ["auto","shapeRendering"],
    "stop-color": ["currentColor"],
    "stop-opacity": [],
    "stroke": [],
    "stroke-dasharray": ["none"],
    "stroke-dashoffset": [],
    "stroke-linecap": ["strokeLinecap"],
    "stroke-linejoin": ["strokeLinejoin"],
    "stroke-miterlimit": [],
    "stroke-opacity": [],
    "stroke-width": [],
    "text-anchor": ["mozBoxPack"],
    "text-decoration": ["none","textDecoration"],
    "text-rendering": ["none","textRendering"],
    "unicode-bidi": ["unicodeBidi"],
    "visibility": ["visibility"],
    "word-spacing": ["normal"],
    "writing-mode": ["writingMode"]
};

CSS.inheritedStyleNames =
{
    "border-collapse": 1,
    "border-spacing": 1,
    "border-style": 1,
    "caption-side": 1,
    "color": 1,
    "cursor": 1,
    "direction": 1,
    "empty-cells": 1,
    "font": 1,
    "font-family": 1,
    "font-size-adjust": 1,
    "font-size": 1,
    "font-style": 1,
    "font-variant": 1,
    "font-weight": 1,
    "letter-spacing": 1,
    "line-height": 1,
    "list-style": 1,
    "list-style-image": 1,
    "list-style-position": 1,
    "list-style-type": 1,
    "opacity": 1,
    "quotes": 1,
    "text-align": 1,
    "text-decoration": 1,
    "text-indent": 1,
    "text-shadow": 1,
    "text-transform": 1,
    "white-space": 1,
    "word-spacing": 1,
    "word-wrap": 1
};

CSS.cssKeywords =
{
    "mozAppearance":
    [
        "button",
        "button-small",
        "checkbox",
        "checkbox-container",
        "checkbox-small",
        "dialog",
        "listbox",
        "menuitem",
        "menulist",
        "menulist-button",
        "menulist-textfield",
        "menupopup",
        "progressbar",
        "radio",
        "radio-container",
        "radio-small",
        "resizer",
        "scrollbar",
        "scrollbarbutton-down",
        "scrollbarbutton-left",
        "scrollbarbutton-right",
        "scrollbarbutton-up",
        "scrollbartrack-horizontal",
        "scrollbartrack-vertical",
        "separator",
        "statusbar",
        "tab",
        "tab-left-edge",
        "tabpanels",
        "textfield",
        "toolbar",
        "toolbarbutton",
        "toolbox",
        "tooltip",
        "treeheadercell",
        "treeheadersortarrow",
        "treeitem",
        "treetwisty",
        "treetwistyopen",
        "treeview",
        "window",
        "-moz-mac-unified-toolbar", //FF3.5
        "-moz-win-borderless-glass", //FF4.0
        "-moz-win-browsertabbar-toolbox", //FF3.0
        "-moz-win-communications-toolbox", //FF3.0
        "-moz-win-glass", //FF3.5
        "-moz-win-media-toolbox" //FF
    ],

    "systemColor":
    [
        "ActiveBorder",
        "ActiveCaption",
        "AppWorkspace",
        "Background",
        "ButtonFace",
        "ButtonHighlight",
        "ButtonShadow",
        "ButtonText",
        "CaptionText",
        "GrayText",
        "Highlight",
        "HighlightText",
        "InactiveBorder",
        "InactiveCaption",
        "InactiveCaptionText",
        "InfoBackground",
        "InfoText",
        "Menu",
        "MenuText",
        "Scrollbar",
        "ThreeDDarkShadow",
        "ThreeDFace",
        "ThreeDHighlight",
        "ThreeDLightShadow",
        "ThreeDShadow",
        "Window",
        "WindowFrame",
        "WindowText",
        "-moz-field",
        "-moz-fieldtext",
        "-moz-workspace",
        "-moz-visitedhyperlinktext",
        "-moz-nativehyperlinktext",
        "-moz-use-text-color"
    ],

    "color":
    [
        "AliceBlue",
        "AntiqueWhite",
        "Aqua",
        "Aquamarine",
        "Azure",
        "Beige",
        "Bisque",
        "Black",
        "BlanchedAlmond",
        "Blue",
        "BlueViolet",
        "Brown",
        "BurlyWood",
        "CadetBlue",
        "Chartreuse",
        "Chocolate",
        "Coral",
        "CornflowerBlue",
        "Cornsilk",
        "Crimson",
        "Cyan",
        "DarkBlue",
        "DarkCyan",
        "DarkGoldenRod",
        "DarkGray",
        "DarkGreen",
        "DarkGrey",
        "DarkKhaki",
        "DarkMagenta",
        "DarkOliveGreen",
        "DarkOrange",
        "DarkOrchid",
        "DarkRed",
        "DarkSalmon",
        "DarkSeaGreen",
        "DarkSlateBlue",
        "DarkSlateGray",
        "DarkSlateGrey",
        "DarkTurquoise",
        "DarkViolet",
        "DeepPink",
        "DeepSkyBlue",
        "DimGray",
        "DimGrey",
        "DodgerBlue",
        "FireBrick",
        "FloralWhite",
        "ForestGreen",
        "Fuchsia",
        "Gainsboro",
        "GhostWhite",
        "Gold",
        "GoldenRod",
        "Gray",
        "Green",
        "GreenYellow",
        "Grey",
        "HoneyDew",
        "HotPink",
        "IndianRed",
        "Indigo",
        "Ivory",
        "Khaki",
        "Lavender",
        "LavenderBlush",
        "LawnGreen",
        "LemonChiffon",
        "LightBlue",
        "LightCoral",
        "LightCyan",
        "LightGoldenRodYellow",
        "LightGray",
        "LightGreen",
        "LightGrey",
        "LightPink",
        "LightSalmon",
        "LightSeaGreen",
        "LightSkyBlue",
        "LightSlateGray",
        "LightSlateGrey",
        "LightSteelBlue",
        "LightYellow",
        "Lime",
        "LimeGreen",
        "Linen",
        "Magenta",
        "Maroon",
        "MediumAquaMarine",
        "MediumBlue",
        "MediumOrchid",
        "MediumPurple",
        "MediumSeaGreen",
        "MediumSlateBlue",
        "MediumSpringGreen",
        "MediumTurquoise",
        "MediumVioletRed",
        "MidnightBlue",
        "MintCream",
        "MistyRose",
        "Moccasin",
        "NavajoWhite",
        "Navy",
        "OldLace",
        "Olive",
        "OliveDrab",
        "Orange",
        "OrangeRed",
        "Orchid",
        "PaleGoldenRod",
        "PaleGreen",
        "PaleTurquoise",
        "PaleVioletRed",
        "PapayaWhip",
        "PeachPuff",
        "Peru",
        "Pink",
        "Plum",
        "PowderBlue",
        "Purple",
        "Red",
        "RosyBrown",
        "RoyalBlue",
        "SaddleBrown",
        "Salmon",
        "SandyBrown",
        "SeaGreen",
        "SeaShell",
        "Sienna",
        "Silver",
        "SkyBlue",
        "SlateBlue",
        "SlateGray",
        "SlateGrey",
        "Snow",
        "SpringGreen",
        "SteelBlue",
        "Tan",
        "Teal",
        "Thistle",
        "Tomato",
        "Turquoise",
        "Violet",
        "Wheat",
        "White",
        "WhiteSmoke",
        "Yellow",
        "YellowGreen",
        "transparent",
        "invert"
    ],

    "auto":
    [
        "auto"
    ],

    "none":
    [
        "none"
    ],

    "normal":
    [
        "normal"
    ],

    "captionSide":
    [
        "top",
        "bottom",
        "left",
        "right"
    ],

    "clear":
    [
        "left",
        "right",
        "both"
    ],

    "cursor":
    [
        "auto",
        "cell",
        "context-menu",
        "crosshair",
        "default",
        "help",
        "pointer",
        "progress",
        "move",
        "e-resize",
        "all-scroll",
        "ne-resize",
        "nw-resize",
        "n-resize",
        "se-resize",
        "sw-resize",
        "s-resize",
        "w-resize",
        "ew-resize",
        "ns-resize",
        "nesw-resize",
        "nwse-resize",
        "col-resize",
        "row-resize",
        "text",
        "vertical-text",
        "wait",
        "alias",
        "copy",
        "move",
        "no-drop",
        "not-allowed",
        "-moz-alias",
        "-moz-cell",
        "-moz-copy",
        "-moz-grab",
        "-moz-grabbing",
        "-moz-contextmenu",
        "-moz-zoom-in",
        "-moz-zoom-out",
        "-moz-spinning"
    ],

    "boxModels": //FF4.0
    [
        "padding-box",
        "border-box",
        "content-box"
    ],

    "direction":
    [
        "ltr",
        "rtl"
    ],

    "bgAttachment":
    [
        "scroll",
        "fixed"
    ],

    "bgPosition":
    [
        "top",
        "center",
        "bottom",
        "left",
        "right"
    ],

    "bgRepeat":
    [
        "repeat",
        "repeat-x",
        "repeat-y",
        "no-repeat"
    ],

    "bgSize": // FF4.0
    [
        "auto",
        "cover",
        "contain"
    ],

    "borderStyle":
    [
        "hidden",
        "dotted",
        "dashed",
        "solid",
        "double",
        "groove",
        "ridge",
        "inset",
        "outset",
        "-moz-bg-inset",
        "-moz-bg-outset",
        "-moz-bg-solid"
    ],

    "borderCollapse":
    [
        "collapse",
        "separate"
    ],

    "overflow":
    [
        "visible",
        "hidden",
        "scroll",
        "-moz-scrollbars-horizontal",
        "-moz-scrollbars-none",
        "-moz-scrollbars-vertical"
    ],

    "listStyleType":
    [
        "disc",
        "circle",
        "square",
        "decimal",
        "decimal-leading-zero",
        "lower-roman",
        "upper-roman",
        "lower-greek",
        "lower-alpha",
        "lower-latin",
        "upper-alpha",
        "upper-latin",
        "hebrew",
        "armenian",
        "georgian",
        "cjk-ideographic",
        "hiragana",
        "katakana",
        "hiragana-iroha",
        "katakana-iroha",
        "inherit"
    ],

    "listStylePosition":
    [
        "inside",
        "outside"
    ],

    "content":
    [
        "open-quote",
        "close-quote",
        "no-open-quote",
        "no-close-quote",
        "inherit"
    ],

    "fontStyle":
    [
        "normal",
        "italic",
        "oblique",
        "inherit"
    ],

    "fontVariant":
    [
        "normal",
        "small-caps",
        "inherit"
    ],

    "fontWeight":
    [
        "normal",
        "bold",
        "bolder",
        "lighter",
        "inherit"
    ],

    "fontSize":
    [
        "xx-small",
        "x-small",
        "small",
        "medium",
        "large",
        "x-large",
        "xx-large",
        "smaller",
        "larger"
    ],

    "fontFamily":
    [
        "Arial",
        "Comic Sans MS",
        "Georgia",
        "Tahoma",
        "Verdana",
        "Times New Roman",
        "Trebuchet MS",
        "Lucida Grande",
        "Helvetica",
        "serif",
        "sans-serif",
        "cursive",
        "fantasy",
        "monospace",
        "caption",
        "icon",
        "menu",
        "message-box",
        "small-caption",
        "status-bar",
        "inherit"
    ],

    "display":
    [
        "block",
        "inline",
        "inline-block",
        "list-item",
        "marker",
        "run-in",
        "compact",
        "table",
        "inline-table",
        "table-row-group",
        "table-column",
        "table-column-group",
        "table-header-group",
        "table-footer-group",
        "table-row",
        "table-cell",
        "table-caption",
        "-moz-box",
        "-moz-compact",
        "-moz-deck",
        "-moz-grid",
        "-moz-grid-group",
        "-moz-grid-line",
        "-moz-groupbox",
        "-moz-inline-block",
        "-moz-inline-box",
        "-moz-inline-grid",
        "-moz-inline-stack",
        "-moz-inline-table",
        "-moz-marker",
        "-moz-popup",
        "-moz-runin",
        "-moz-stack"
    ],

    "position":
    [
        "static",
        "relative",
        "absolute",
        "fixed",
        "inherit"
    ],

    "float":
    [
        "left",
        "right"
    ],

    "textAlign":
    [
        "left",
        "right",
        "center",
        "justify"
    ],

    "tableLayout":
    [
        "fixed"
    ],

    "textDecoration":
    [
        "underline",
        "overline",
        "line-through",
        "blink"
    ],

    "textTransform":
    [
        "capitalize",
        "lowercase",
        "uppercase",
        "inherit"
    ],

    "unicodeBidi":
    [
        "normal",
        "embed",
        "bidi-override"
    ],

    "visibility":
    [
        "visible",
        "hidden",
        "collapse",
        "inherit"
    ],

    "whiteSpace":
    [
        "normal",
        "pre",
        "nowrap",
        "pre-wrap",
        "pre-line",
        "inherit"
    ],

    "verticalAlign":
    [
        "baseline",
        "sub",
        "super",
        "top",
        "text-top",
        "middle",
        "bottom",
        "text-bottom",
        "inherit"
    ],

    "thickness":
    [
        "thin",
        "medium",
        "thick"
    ],

    "userFocus":
    [
        "ignore",
        "normal"
    ],

    "userInput":
    [
        "disabled",
        "enabled"
    ],

    "userSelect":
    [
        "normal"
    ],

    "mozBoxSizing":
    [
        "content-box",
        "padding-box",
        "border-box"
    ],

    "mozBoxAlign":
    [
        "start",
        "center",
        "end",
        "baseline",
        "stretch"
    ],

    "mozBoxDirection":
    [
        "normal",
        "reverse"
    ],

    "mozBoxOrient":
    [
        "horizontal",
        "vertical"
    ],

    "mozBoxPack":
    [
        "start",
        "center",
        "end"
    ],

    "mozBoxShadow":
    [
        "inset"
    ],

    "mozBorderImage":
    [
        "stretch",
        "round",
        "repeat"
    ],

    "mozBackgroundImage":
    [
        "-moz-linear-gradient", // FF4.0
        "-moz-radial-gradient", // FF4.0
        "-moz-element", // FF4.0
        "-moz-image-rect" // FF4.0
    ],

    "mozTransformFunction":
    [
        "matrix",
        "rotate",
        "scale",
        "scaleX",
        "scaleY",
        "skew",
        "skewX",
        "skewY",
        "translate",
        "translateX",
        "translateY"
    ],

    "width":
    [
        "-moz-max-content",
        "-moz-min-content",
        "-moz-fit-content",
        "-moz-available"
    ],

    "imeMode":
    [
        "normal",
        "active",
        "inactive",
        "disabled"
    ],

    "textRendering":
    [
        "optimizeSpeed",
        "optimizeLegibility",
        "geometricPrecision"
    ],

    "wordWrap":
    [
        "normal",
        "break-word",
        "inherit"
    ],

    // start SVG specific

    "alignmentBaseline":
    [
        "auto",
        "baseline",
        "before-edge",
        "text-before-edge",
        "middle",
        "central",
        "after-edge",
        "text-after-edge",
        "ideographic",
        "alphabetic",
        "hanging",
        "mathematical"
    ],

    "baselineShift":
    [
        "baseline",
        "sub",
        "super"
    ],

    "colorInterpolation":
    [
        "auto",
        "sRGB",
        "linearRGB"
    ],

    "clipRule":
    [
        "nonzero",
        "evenodd"
    ],

    "colorProfile":
    [
        "auto",
        "sRGB"
    ],

    "colorRendering":
    [
        "auto",
        "optimizeSpeed",
        "optimizeQuality"
    ],

    "dominantBaseline":
    [
        "auto",
        "use-script",
        "no-change",
        "reset-size",
        "ideographic",
        "alphabetic",
        "hanging",
        "mathematical",
        "central",
        "middle",
        "text-after-edge",
        "text-before-edge"
    ],

    "accumulate":
    [
        "accumulate"
    ],

    "fontStretch":
    [
        "normal",
        "wider",
        "narrower",
        "ultra-condensed",
        "extra-condensed",
        "condensed",
        "semi-condensed",
        "semi-expanded",
        "expanded",
        "extra-expanded",
        "ultra-expanded"
    ],

    "imageRendering":
    [
        "auto",
        "optimizeSpeed",
        "optimizeQuality"
    ],

    "svgOverflow":
    [
        "visible",
        "hidden",
        "scroll"
    ],

    "pointerEvents":
    [
        "visiblePainted",
        "visibleFill",
        "visibleStroke",
        "visible",
        "painted",
        "fill",
        "stroke",
        "all"
    ],

    "shapeRendering":
    [
        "optimizeSpeed",
        "crispEdges",
        "geometricPrecision"
    ],

    "strokeLinecap":
    [
        "butt",
        "round",
        "square"
    ],

    "strokeLinejoin":
    [
        "miter",
        "round",
        "bevel"
    ],

    "writingMode":
    [
        "lr-tb",
        "rl-tb",
        "tb-rl",
        "lr",
        "rl",
        "tb"
    ],

    "resize":
    [
        "none",
        "both",
        "horizontal",
        "vertical",
        "inherit"
    ]
};

CSS.nonEditableTags =
{
    "HTML": 1,
    "HEAD": 1,
    "html": 1,
    "head": 1
};

CSS.innerEditableTags =
{
    "BODY": 1,
    "body": 1
};

CSS.selfClosingTags =
{ // End tags for void elements are forbidden http://wiki.whatwg.org/wiki/HTML_vs._XHTML
    "meta": 1,
    "link": 1,
    "area": 1,
    "base": 1,
    "col": 1,
    "input": 1,
    "img": 1,
    "br": 1,
    "hr": 1,
    "param":1,
    "embed":1
};

var invisibleTags = CSS.invisibleTags =
{
    "HTML": 1,
    "HEAD": 1,
    "TITLE": 1,
    "META": 1,
    "LINK": 1,
    "STYLE": 1,
    "SCRIPT": 1,
    "NOSCRIPT": 1,
    "BR": 1,
    "PARAM": 1,
    "COL": 1,

    "html": 1,
    "head": 1,
    "title": 1,
    "meta": 1,
    "link": 1,
    "style": 1,
    "script": 1,
    "noscript": 1,
    "br": 1,
    "param": 1,
    "col": 1,
    /*
    "window": 1,
    "browser": 1,
    "frame": 1,
    "tabbrowser": 1,
    "WINDOW": 1,
    "BROWSER": 1,
    "FRAME": 1,
    "TABBROWSER": 1,
    */
};

// ********************************************************************************************* //
// Registration

return CSS;

// ********************************************************************************************* //
});
