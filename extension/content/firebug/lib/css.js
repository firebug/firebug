/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/url",
    "firebug/lib/options",
    "firebug/firefox/window",
    "firebug/lib/xml",
    "firebug/net/httpLib",
    "firebug/lib/xpath",
],
function(FBTrace, Url, Options, Win, Xml, Http, Xpath) {

// ********************************************************************************************* //
// Module Implementation

var Css = {};

// ************************************************************************************************
// CSS

var cssKeywordMap = {};
var cssPropNames = {};
var cssColorNames = null;
var imageRules = null;

Css.getCSSKeywordsByProperty = function(nodeType, propName)
{
    if (!cssKeywordMap[nodeType])
    {
        cssKeywordMap[nodeType] = {};

        for (var name in Css.cssInfo[nodeType])
        {
            var list = [];

            var types = Css.cssInfo[nodeType][name];
            for (var i = 0; i < types.length; ++i)
            {
                var keywords = Css.cssKeywords[types[i]];
                if (keywords)
                    list.push.apply(list, keywords);
            }

            cssKeywordMap[nodeType][name] = list;
        }
    }

    return propName.toLowerCase() in cssKeywordMap[nodeType] ?
        cssKeywordMap[nodeType][propName.toLowerCase()] : [];
};

Css.getCSSPropertyNames = function(nodeType)
{
    if (!cssPropNames[nodeType])
    {
        cssPropNames[nodeType] = [];

        for (var name in Css.cssInfo[nodeType])
            cssPropNames[nodeType].push(name);
    }

    return cssPropNames[nodeType];
};

Css.isColorKeyword = function(keyword)
{
    if (keyword == "transparent")
        return false;

    if (!cssColorNames)
    {
        cssColorNames = [];

        var colors = Css.cssKeywords["color"];
        for (var i = 0; i < colors.length; ++i)
            cssColorNames.push(colors[i].toLowerCase());

        var systemColors = Css.cssKeywords["systemColor"];
        for (var i = 0; i < systemColors.length; ++i)
            cssColorNames.push(systemColors[i].toLowerCase());
    }

    return cssColorNames.indexOf(keyword.toLowerCase()) != -1;
};

Css.isImageRule = function(nodeType,rule)
{
    if (!imageRules)
    {
        imageRules = [];

        for (var i in Css.cssInfo[nodeType])
        {
            var r = i.toLowerCase();
            var suffix = "image";
            if (r.match(suffix + "$") == suffix || r == "background")
                imageRules.push(r);
        }
    }

    return imageRules.indexOf(rule.toLowerCase()) != -1;
};

Css.copyTextStyles = function(fromNode, toNode, style)
{
    var view = fromNode.ownerDocument.defaultView;
    if (view)
    {
        if (!style)
            style = view.getComputedStyle(fromNode, "");

        toNode.style.fontFamily = style.getPropertyCSSValue("font-family").cssText;
        toNode.style.fontSize = style.getPropertyCSSValue("font-size").cssText;
        toNode.style.fontWeight = style.getPropertyCSSValue("font-weight").cssText;
        toNode.style.fontStyle = style.getPropertyCSSValue("font-style").cssText;

        return style;
    }
};

Css.copyBoxStyles = function(fromNode, toNode, style)
{
    var view = fromNode.ownerDocument.defaultView;
    if (view)
    {
        if (!style)
            style = view.getComputedStyle(fromNode, "");

        toNode.style.marginTop = style.getPropertyCSSValue("margin-top").cssText;
        toNode.style.marginRight = style.getPropertyCSSValue("margin-right").cssText;
        toNode.style.marginBottom = style.getPropertyCSSValue("margin-bottom").cssText;
        toNode.style.marginLeft = style.getPropertyCSSValue("margin-left").cssText;
        toNode.style.borderTopWidth = style.getPropertyCSSValue("border-top-width").cssText;
        toNode.style.borderRightWidth = style.getPropertyCSSValue("border-right-width").cssText;
        toNode.style.borderBottomWidth = style.getPropertyCSSValue("border-bottom-width").cssText;
        toNode.style.borderLeftWidth = style.getPropertyCSSValue("border-left-width").cssText;

        return style;
    }
};

Css.readBoxStyles = function(style)
{
    const styleNames = {
        "margin-top": "marginTop", "margin-right": "marginRight",
        "margin-left": "marginLeft", "margin-bottom": "marginBottom",
        "border-top-width": "borderTop", "border-right-width": "borderRight",
        "border-left-width": "borderLeft", "border-bottom-width": "borderBottom",
        "padding-top": "paddingTop", "padding-right": "paddingRight",
        "padding-left": "paddingLeft", "padding-bottom": "paddingBottom",
        "z-index": "zIndex",
    };

    var styles = {};
    for (var styleName in styleNames)
        styles[styleNames[styleName]] = parseInt(style.getPropertyCSSValue(styleName).cssText) || 0;

    if (FBTrace.DBG_INSPECT)
        FBTrace.sysout("readBoxStyles ", styles);

    return styles;
};

Css.getBoxFromStyles = function(style, element)
{
    var args = Css.readBoxStyles(style);
    args.width = element.offsetWidth
        - (args.paddingLeft+args.paddingRight+args.borderLeft+args.borderRight);
    args.height = element.offsetHeight
        - (args.paddingTop+args.paddingBottom+args.borderTop+args.borderBottom);
    return args;
};

Css.getElementCSSSelector = function(element)
{
    if (!element || !element.localName)
        return "null";

    var label = Xml.getLocalName(element);
    if (element.id)
        label += "#" + element.id;

    if (element.classList && element.classList.length > 0)
        label += "." + element.classList.item(0);

    return label;
};

Css.getElementCSSPath = function(element)
{
    var paths = [];

    for (; element && element.nodeType == 1; element = element.parentNode)
    {
        var selector = Css.getElementCSSSelector(element);
        paths.splice(0, 0, selector);
    }

    return paths.length ? paths.join(" ") : null;
};

// ************************************************************************************************
// CSS classes

var classNameReCache={};

Css.hasClass = function(node, name)
{
    if (!node || node.nodeType != 1 || !node.className || name == '')
        return false;

    if (name.indexOf(" ") != -1)
    {
        var classes = name.split(" "), len = classes.length, found=false;
        for (var i = 0; i < len; i++)
        {
            var cls = classes[i].trim();
            if (cls != "")
            {
                if (Css.hasClass(node, cls) == false)
                    return false;
                found = true;
            }
        }
        return found;
    }

    var re;
    if (name.indexOf("-") == -1)
        re = classNameReCache[name] = classNameReCache[name] || new RegExp('(^|\\s)' + name + '(\\s|$)', "g");
    else // XXXsroussey don't cache these, they are often setting values. Should be using setUserData/getUserData???
        re = new RegExp('(^|\\s)' + name + '(\\s|$)', "g")
    return node.className.search(re) != -1;
};

Css.setClass = function(node, name)
{
    if (!node || node.nodeType != 1 || name == '')
        return;

    if (name.indexOf(" ") != -1)
    {
        var classes = name.split(" "), len = classes.length;
        for (var i = 0; i < len; i++)
        {
            var cls = classes[i].trim();
            if (cls != "")
            {
                Css.setClass(node, cls);
            }
        }
        return;
    }
    if (!Css.hasClass(node, name))
        node.className = node.className.trim() + " " + name;
};

Css.getClassValue = function(node, name)
{
    var re = new RegExp(name+"-([^ ]+)");
    var m = re.exec(node.className);
    return m ? m[1] : "";
};

Css.removeClass = function(node, name)
{
    if (!node || node.nodeType != 1 || node.className == '' || name == '')
        return;

    if (name.indexOf(" ") != -1)
    {
        var classes = name.split(" "), len = classes.length;
        for (var i = 0; i < len; i++)
        {
            var cls = classes[i].trim();
            if (cls != "")
            {
                if (Css.hasClass(node, cls) == false)
                    Css.removeClass(node, cls);
            }
        }
        return;
    }

    var re;
    if (name.indexOf("-") == -1)
        re = classNameReCache[name] = classNameReCache[name] || new RegExp('(^|\\s)' + name + '(\\s|$)', "g");
    else // XXXsroussey don't cache these, they are often setting values. Should be using setUserData/getUserData???
        re = new RegExp('(^|\\s)' + name + '(\\s|$)', "g")

    node.className = node.className.replace(re, " ");

};

Css.toggleClass = function(elt, name)
{
    if (Css.hasClass(elt, name))
        Css.removeClass(elt, name);
    else
        Css.setClass(elt, name);
};

Css.obscure = function(elt, obscured)
{
    if (obscured)
        Css.setClass(elt, "obscured");
    else
        Css.removeClass(elt, "obscured");
};

Css.setClassTimed = function(elt, name, context, timeout)
{
    if (FBTrace.DBG_HTML || FBTrace.DBG_SOURCEFILES)
    {
        FBTrace.sysout("css.setClassTimed elt.__setClassTimeout: "+elt.__setClassTimeout+
                " Xml.isVisible(elt): "+Xml.isVisible(elt)+
                " elt.__invisibleAtSetPoint: "+elt.__invisibleAtSetPoint);
    }

    if (!timeout)
        timeout = 1300;

    if (elt.__setClassTimeout)  // then we are already waiting to remove the class mark
        context.clearTimeout(elt.__setClassTimeout);  // reset the timer
    else                        // then we are not waiting to remove the mark
        Css.setClass(elt, name);

    if (!Xml.isVisible(elt))
    {
        if (elt.__invisibleAtSetPoint)
            elt.__invisibleAtSetPoint--;
        else
            elt.__invisibleAtSetPoint = 5;
    }
    else
    {
        delete elt.__invisibleAtSetPoint;
    }

    elt.__setClassTimeout = context.setTimeout(function()
    {
        delete elt.__setClassTimeout;

        if (elt.__invisibleAtSetPoint)  // then user can't see it, try again later
            Css.setClassTimed(elt, name, context, timeout);
        else
        {
            delete elt.__invisibleAtSetPoint;  // may be zero
            Css.removeClass(elt, name);
        }
    }, timeout);
};

Css.cancelClassTimed = function(elt, name, context)
{
    if (elt.__setClassTimeout)
    {
        Css.removeClass(elt, name);
        context.clearTimeout(elt.__setClassTimeout);
        delete elt.__setClassTimeout;
    }
};

Css.safeGetCSSRules = function(styleSheet)
{
    try
    {
        return styleSheet.cssRules;
    }
    catch (e)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("safeGetCSSRules "+e, e);
    }

    return null;
}

Css.isValidStylesheet = function(styleSheet)
{
    try
    {
        var dummy = styleSheet.cssRules; // Mozilla throws
        return true;
    }
    catch (e)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("isValidStylesheet "+e, e);
    }

    return false;
}

// ********************************************************************************************* //
// Stylesheet API

Css.createStyleSheet = function(doc, url)
{
    var style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
    style.setAttribute("charset","utf-8");
    style.setAttribute("type", "text/css");

    var cssText = url ? Http.getResource(url) : null;
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

Css.addStyleSheet = function(doc, style)
{
    var heads = doc.getElementsByTagName("head");
    if (heads.length)
    {
        heads[0].appendChild(style);
    }
    else if (doc.documentElement)
    {
        doc.documentElement.appendChild(style);
    }
    else
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("css.addStyleSheet; ERROR to append a stylesheet");
    }
};

Css.appendStylesheet = function(doc, uri)
{
    // Make sure the stylesheet is not appended twice.
    var styleSheet = doc.getElementById(uri);
    if (styleSheet)
        return styleSheet;

    var styleSheet = Css.createStyleSheet(doc, uri);
    styleSheet.setAttribute("id", uri);
    Css.addStyleSheet(doc, styleSheet);

    return styleSheet;
},

Css.getStyleSheetByHref = function(url, context)
{
    if (!context.styleSheetMap)
        Css.createStyleSheetMap(context);  // fill cache

    // hasOwnProperty is called to prevent possible conflicts with prototype extensions
    // and strict mode warnings
    return context.styleSheetMap.hasOwnProperty(url) ? context.styleSheetMap[url] : undefined;
};

Css.createStyleSheetMap = function(context)
{
    context.styleSheetMap = {};

    function addSheet(sheet)
    {
        var sheetURL = Css.getURLForStyleSheet(sheet);
        context.styleSheetMap[sheetURL] = sheet;

        // recurse for imported sheets

        for (var i = 0; i < sheet.cssRules.length; ++i)
        {
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

    Win.iterateWindows(context.window, function(subwin)
    {
        var rootSheets = subwin.document.styleSheets;
        if (!rootSheets)
            return; // XUL?

        for (var i = 0; i < rootSheets.length; ++i)
        {
            try
            {
                addSheet(rootSheets[i]);
            }
            catch (err)
            {
                //if (FBTrace.DBG_ERRORS)
                //    FBTrace.sysout("css.createStyleSheetMap; EXCEPTION " + err, err);
            }
        }
    });

    if (FBTrace.DBG_ERRORS && FBTrace.DBG_CSS)
        FBTrace.sysout("css.createStyleSheetMap for "+context.getName(), context.styleSheetMap);

    return context.styleSheetMap;
};

Css.getAllStyleSheets = function(context)
{
    if (!context)
        return [];

    var styleSheets = [];

    var showUACSS = Options.get("showUserAgentCSS");
    function addSheet(sheet)
    {
        var sheetLocation =  Css.getURLForStyleSheet(sheet);

        if (!showUACSS && Url.isSystemURL(sheetLocation))
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

    Win.iterateWindows(context.window, function(subwin)
    {
        var rootSheets = subwin.document.styleSheets;
        for (var i = 0; i < rootSheets.length; ++i)
            addSheet(rootSheets[i]);
    });

    return styleSheets;
};

Css.getURLForStyleSheet = function(styleSheet)
{
    // http://www.w3.org/TR/DOM-Level-2-Style/stylesheets.html#StyleSheets-StyleSheet.
    // For inline style sheets, the value of this attribute is null.
    if (!styleSheet.href && !styleSheet.ownerNode)
        return null;

    return (styleSheet.href ? styleSheet.href : styleSheet.ownerNode.ownerDocument.URL);
};

/**
 * Retrieves the instance number for a given style sheet. The instance number
 * is sheet's index within the set of all other sheets whose URL is the same.
 */
Css.getInstanceForStyleSheet = function(styleSheet, ownerDocument)
{
    // ownerDocument is an optional hint for performance
    if (FBTrace.DBG_CSS)
        FBTrace.sysout("getInstanceForStyleSheet href:" + styleSheet.href + " mediaText:" +
            styleSheet.media.mediaText + " path to ownerNode" +
            (styleSheet.ownerNode && Xpath.getElementXPath(styleSheet.ownerNode)), ownerDocument);

    ownerDocument = ownerDocument || Css.getDocumentForStyleSheet(styleSheet);
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
                (curSheet.ownerNode && Xpath.getElementXPath(curSheet.ownerNode)));

        if (curSheet == styleSheet)
            break;

        if (curSheet.href == href)
            ret++;
    }
    return ret;
};

Css.getDocumentForStyleSheet = function(styleSheet)
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

Css.cssInfo = {};
Css.cssInfo.html =
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
    "-moz-transition-property": ["mozTransitionProperty"], //FF4.0 TODO
    "-moz-transition-duration": [], //FF4.0 TODO
    "-moz-transition-timing-function": ["mozTransitionTimingFunction"], //FF4.0 TODO
    "-moz-transition-delay": [], //FF4.0 TODO
    "-moz-animation":[], // FF5.0
    "-moz-animation-delay": [], // FF5.0
    "-moz-animation-direction": [], // FF5.0
    "-moz-animation-duration": [], // FF5.0
    "-moz-animation-iteration-count": [], // FF5.0
    "-moz-animation-name" : [], // FF5.0
    "-moz-animation-play-state": [], // FF5.0
    "-moz-animation-timing-function": [], // FF5.0
    "-moz-animation-fill-mode": [], // FF5.0
    "-moz-orient": [], //FF6.0 TODO
    "-moz-text-decoration-color": ["color"], //FF6.0 TODO
    "-moz-text-decoration-line": [], //FF6.0 TODO
    "-moz-text-decoration-style": [], //FF6.0 TODO
    "-moz-hyphens": [], //FF6.0 TODO
    "text-overflow": ["ellipsis","clip"] //FF7.0

};

// ::-moz-progress-bar  // FF6 TODO

Css.cssInfo.svg = {
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

Css.inheritedStyleNames =
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

Css.cssKeywords =
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

    "mozTransitionProperty":
    [
        "background-color",
        "background-image",
        "background-position",
        "background-size",
        "border-color",
        "border-radius",
        "border-width",
        "border-spacing",
        "bottom",
        "box-shadow",
        "color",
        "clip",
        "fill",
        "fill-opacity",
        "flood-color",
        "font-size",
        "font-size-adjust",
        "font-stretch",
        "font-weight",
        "height",
        "left",
        "letter-spacing",
        "lighting-color",
        "line-height",
        "margin ",
        "marker-offset",
        "max-height",
        "max-width",
        "min-height",
        "min-width",
        "opacity",
        "outline-color",
        "outline-offset",
        "outline-width",
        "padding",
        "right",
        "stop-color",
        "stop-opacity",
        "stroke",
        "stroke-dasharray",
        "stroke-dashoffset",
        "stroke-miterlimit",
        "stroke-opacity",
        "stroke-width",
        "text-indent",
        "text-shadow",
        "top",
        "vertical-align",
        "visibility",
        "width",
        "word-spacing",
        "z-index",
        "-moz-box-flex",
        "-moz-column-count",
        "-moz-column-gap",
        "-moz-column-rule-color",
        "-moz-column-rule-width",
        "-moz-column-width",
        "-moz-image-region",
        "-moz-outline-radius",
        "-moz-transform-origin",
        "-moz-transform"
    ],

    "mozTransitionTimingFunction":
    [
       "cubic-bezier",
       "ease",
       "ease-in",
       "ease-in-out",
       "ease-out",
       "linear"
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

Css.nonEditableTags =
{
    "HTML": 1,
    "HEAD": 1,
    "html": 1,
    "head": 1
};

Css.innerEditableTags =
{
    "BODY": 1,
    "body": 1
};

// ********************************************************************************************* //
// Registration

return Css;

// ********************************************************************************************* //
});
