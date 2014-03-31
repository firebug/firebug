/* See license.txt for terms of usage */
/*global define:1, Components:1, Firebug:1, CSSRule:1, CSSStyleRule:1, CSSImportRule:1, Node:1*/

define([
    "firebug/lib/trace",
    "firebug/lib/array",
    "firebug/lib/url",
    "firebug/lib/options",
    "firebug/lib/xml",
    "firebug/lib/http",
    "firebug/lib/xpath",
    "firebug/chrome/window",
],
function(FBTrace, Arr, Url, Options, Xml, Http, Xpath, Win) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;

var TraceError = FBTrace.toError();
var Trace = FBTrace.to("DBG_CSS");

// ********************************************************************************************* //
// Module Implementation

var Css = {};

// ********************************************************************************************* //
// CSS

var cssKeywordMap = null;
var cachedPropNames = null;
var domUtils = Cc["@mozilla.org/inspector/dom-utils;1"].getService(Ci.inIDOMUtils);
var universalValues = new Set(["initial", "inherit", "unset"]);

function expandKeywordList(list)
{
    var res = [];
    for (var prop of list)
    {
        var keywords = Css.cssKeywords[prop];
        if (keywords)
            res.push.apply(res, keywords);
        else
            res.push(prop);
    }
    return res;
}

function initPropertyData()
{
    if (cssKeywordMap)
        return;
    cssKeywordMap = {};

    // Create the list of property names through the help of inIDOMUtils.
    // This includes also SVG presentational attributes, so filter the names
    // into two groups based on that. Also remove -moz-math-display and
    // -moz-script-level from the list, as they are impossible to set (they are
    // internal helpers for MathML).
    var props = new Set(domUtils.getCSSPropertyNames(domUtils.INCLUDE_ALIASES));
    props.delete("-moz-math-display");
    props.delete("-moz-script-level");

    var htmlProps = [], svgProps = [];
    for (let prop of props)
    {
        let html = !svgPresentationalProperties.has(prop);
        let svg = !html || svgInheritedFromHtml.has(prop);
        if (html)
            htmlProps.push(prop);
        if (svg)
            svgProps.push(prop);
    }

    cachedPropNames = {
        html: htmlProps.sort(),
        svg: svgProps.sort(),
        mathml: []
    };

    // Set up a map of property values. Let's start with some helpers for
    // munging the property data given to us by the API.

    // We block initial, inherit and unset from appearing in results, instead
    // we manually add them to auto-completion when they constitute the only
    // value in an editor. Some prexed values are also removed in favor of
    // standardized equivalents.
    var forbiddenValues = new Set(universalValues.values());
    forbiddenValues.add("-moz-calc");
    forbiddenValues.add("-moz-linear-gradient");
    forbiddenValues.add("-moz-radial-gradient");
    forbiddenValues.add("-moz-repeating-linear-gradient");
    forbiddenValues.add("-moz-repeating-radial-gradient");
    var filterValues = function(list)
    {
        return list.filter((value) => !forbiddenValues.has(value));
    };

    // The API doesn't indicate whether a value represents a function or not,
    // so we hard-code a list and add parens to any known returned function.
    // We also camel-case some SVG property values to make them more readable.
    var functionNames = new Set([
        "url", "calc", "rect", "hsl", "hsla", "rgb", "rgba",
        "-moz-element", "-moz-image-rect",
        "linear-gradient", "radial-gradient",
        "repeating-linear-gradient", "repeating-radial-gradient",
        "cubic-bezier", "steps", "attr", "counter", "counters",
        "matrix", "matrix3d", "rotate", "rotateX", "rotateY", "rotateZ",
        "scale", "scaleX", "scaleY", "scaleZ", "scale3d", "skewX", "skewY",
        "translate", "translateX", "translateY", "translateZ",
    ]);
    var convertCase = new Map();
    for (let value of ["linearRGB", "sRGB", "geometricPrecision",
        "optimizeQuality", "optimizeSpeed", "optimizeLegibility", "crispEdges",
        "visibleFill", "visiblePainted", "visibleStroke"])
    {
        convertCase.set(value.toLowerCase(), value);
    }
    var transformPropertyValue = function(value)
    {
        if (functionNames.has(value))
            value += "()";
        if (convertCase.has(value))
            return convertCase.get(value);
        return value;
    };

    // Some values are simply missing from the API. Add those when detected.
    var addMissingValues = function(values, propName)
    {
        if (propName === "transition" || propName === "transition-property")
            values = values.concat(animatableProperties);

        // "currentColor", system colors, Mozilla-specific colors, see bug 927367
        if (values.indexOf("aqua") !== -1)
            values = values.concat(extraColors);

        // Gradients, see bug 973345
        // xxxsz: Can be removed when Firefox 31 is the minimum supported version
        if (values.indexOf("-moz-element()") !== -1)
            values = values.concat(extraImages);

        return values;
    };

    // Set up part of the data tables.
    Css.cssKeywords.color = getColorValues();

    for (let prop of props)
    {
        var values;

        // See if the property is special-cased due to missing or incorrect values.
        if (cssDataExceptions.hasOwnProperty(prop))
        {
            values = expandKeywordList(cssDataExceptions[prop]);
        }
        else
        {
            values = domUtils.getCSSValuesForProperty(prop);
            values = filterValues(values);
            values = values.map(transformPropertyValue);
            values = addMissingValues(values, prop);
        }
        cssKeywordMap[prop] = Arr.sortUnique(values);
    }
}

Css.getCSSKeywordsByProperty = function(nodeType, propName, avoid)
{
    initPropertyData();

    // CSS isn't supported for MathML elements.
    if (nodeType === "mathml")
        return [];

    // For other kinds of elements, return keywords from the global pool of
    // properties, not just the ones specific to the nodeType, since:
    // a) it's simpler,
    // b) technically the CSS is still valid.

    propName = propName.toLowerCase();
    if (!cssKeywordMap.hasOwnProperty(propName))
        return [];

    // Special case: most "pointer-events" values are only supported for SVG.
    if (nodeType === "html" && propName === "pointer-events")
        return ["auto", "none"];

    if (avoid)
        return getCSSPropertyKeywordsExcludingCategories(propName, avoid);

    return cssKeywordMap[propName];
};

function assertShorthand(propName)
{
    // Currently getCSSPropertyKeywordsExcludingCategories and getCSSShorthandCategory
    // only support background, border and font, assert that nothing else gets passed
    // in so we don't get subtle failures. Ideally this would be extended to any
    // shorthand property in the future. (See also css/autoCompleter.js.)
    if (["background", "border", "font"].indexOf(propName) === -1)
        throw new Error("invalid shorthand name " + propName);
}

function getCSSPropertyKeywordsExcludingCategories(propName, avoid)
{
    assertShorthand(propName);
    var list = [];
    var types = cssDataExceptions[propName];
    for (var i = 0; i < types.length; ++i)
    {
        var type = types[i];
        if (avoid.indexOf(type) !== -1)
            continue;
        var keywords = Css.cssKeywords[type];
        if (keywords)
            list.push.apply(list, keywords);
        else
            list.push(type);
    }
    return list;
}

Css.getCSSPropertyNames = function(nodeType)
{
    initPropertyData();
    return cachedPropNames[nodeType];
};

Css.getCSSShorthandCategory = function(nodeType, shorthandProp, keyword)
{
    initPropertyData();

    assertShorthand(shorthandProp);
    var category = null;
    var types = cssDataExceptions[shorthandProp];
    for (var i = 0; i < types.length; ++i)
    {
        var type = types[i], matches;
        if (type in Css.cssKeywords)
            matches = (Css.cssKeywords[type].indexOf(keyword) !== -1);
        else
            matches = (type === keyword);

        if (matches)
        {
            // Set this as the matched category, or if there is one already
            // bail out (we don't have a unique one).
            if (category)
                return null;
            category = type;
        }
    }
    return category;
};

/**
 * Parses the CSS properties of a CSSStyleRule
 * @param {Object} style CSSStyleRule to get the properties of
 * @param {Object} element Element to which the style applies. Needed for parsing
 *      shorthand properties correctly.
 *
 * @returns {Array} Properties represented by {name, value, priority, longhandProps}
 */
Css.parseCSSProps = function(style, element)
{
    var props = [];

    if (!element)
    {
        for (var i = 0, len = style.length; i < len; ++i)
        {
            var prop = style.item(i);
            props.push({name: prop,
                value: style.getPropertyValue(prop),
                priority: style.getPropertyPriority(longhandProp)});
        }
    }
    else
    {
        var lineRE = /(?:[^;\(]*(?:\([^\)]*?\))?[^;\(]*)*;?/g;
        var propRE = /\s*([^:\s]*)\s*:\s*(.*?)\s*(?:! (important))?;?$/;
        var lines = style.cssText.match(lineRE);
        for (var i = 0, len = lines.length; i < len; ++i)
        {
            var match = propRE.exec(lines[i]);
            if (!match)
                continue;

            if (match[2])
            {
                var prop = {name: match[1], value: match[2], priority: match[3] || ""};

                // Add longhand properties to shorthand property
                var doc = element.ownerDocument;
                var dummyElement = doc.createElementNS(element.namespaceURI, element.tagName);
                var dummyStyle = dummyElement.style;
                dummyStyle.cssText = "";
                dummyStyle.setProperty(prop.name, prop.value, prop.priority);

                if (dummyStyle.length > 1)
                {
                    prop.longhandProps = [];
                    for (var j = 0, propLen = dummyStyle.length; j < propLen; ++j)
                    {
                        var longhandProp = dummyStyle.item(j);
                        prop.longhandProps.push({name: longhandProp,
                            value: dummyStyle.getPropertyValue(longhandProp),
                            priority: dummyStyle.getPropertyPriority(longhandProp)});
                    }
                }

                props.push(prop);
            }
        }
    }

    return props;
};

function getColorValues()
{
    return domUtils.getCSSValuesForProperty("color")
        .filter((value) => !universalValues.has(value))
        .concat(extraColors);
}

var colorKeywordSet = null;
Css.isColorKeyword = function(keyword)
{
    if (keyword == "transparent")
        return false;

    if (!colorKeywordSet)
        colorKeywordSet = new Set(getColorValues());

    return colorKeywordSet.has(keyword.toLowerCase());
};

var reImageProperty = /(^background|image)$/;
Css.isImageProperty = function(propName)
{
    return reImageProperty.test(propName);
};

Css.copyTextStyles = function(fromNode, toNode, style)
{
    var view = fromNode ? fromNode.ownerDocument.defaultView : null;
    if (view)
    {
        if (!style)
            style = view.getComputedStyle(fromNode, "");

        toNode.style.fontFamily = style.fontFamily;
        toNode.style.fontSize = style.fontSize;
        toNode.style.fontWeight = style.fontWeight;
        toNode.style.fontStyle = style.fontStyle;
        toNode.style.fontSizeAdjust = style.fontSizeAdjust;
        toNode.style.fontStretch = style.fontStretch;
        toNode.style.fontVariant = style.fontVariant;
        toNode.style.MozFontFeatureSettings = style.MozFontFeatureSettings;

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

        toNode.style.marginTop = style.marginTop;
        toNode.style.marginRight = style.marginRight;
        toNode.style.marginBottom = style.marginBottom;
        toNode.style.marginLeft = style.marginLeft;
        toNode.style.borderTopWidth = style.borderTopWidth;
        toNode.style.borderRightWidth = style.borderRightWidth;
        toNode.style.borderBottomWidth = style.borderBottomWidth;
        toNode.style.borderLeftWidth = style.borderLeftWidth;
        toNode.style.unicodeBidi = style.unicodeBidi;

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
        "z-index": "zIndex"
    };

    var styles = {};
    for (var styleName in styleNames)
        styles[styleNames[styleName]] = parseInt(style.getPropertyCSSValue(styleName).cssText) || 0;

    Trace.sysout("css.readBoxStyles;", styles);

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

    if (element.classList)
    {
        for (var i=0, len=element.classList.length; i<len; ++i)
            label += "." + element.classList[i];
    }

    return label;
};

Css.getElementCSSPath = function(element)
{
    var paths = [];

    for (; element && element.nodeType == Node.ELEMENT_NODE; element = element.parentNode)
    {
        var selector = Css.getElementCSSSelector(element);
        paths.splice(0, 0, selector);
    }

    return paths.length ? paths.join(" ") : null;
};

// ********************************************************************************************* //
// CSS classes

var classNameReCache={};

Css.hasClass = function(node, name)
{
    if (!node || node.nodeType != Node.ELEMENT_NODE || !node.className || !name)
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
        re = new RegExp('(^|\\s)' + name + '(\\s|$)', "g");
    return node.className.search(re) != -1;
};

Css.setClass = function(node, name)
{
    if (!node || node.nodeType != Node.ELEMENT_NODE || name == '')
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
    if (!node || node.nodeType != Node.ELEMENT_NODE || node.className == '' || name == '')
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
        re = new RegExp('(^|\\s)' + name + '(\\s|$)', "g");

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
    if (Trace.active)
    {
        Trace.sysout("css.setClassTimed; elt.__setClassTimeout: " + elt.__setClassTimeout +
            " Xml.isVisible(elt): " + Xml.isVisible(elt) +
            " elt.__invisibleAtSetPoint: " + elt.__invisibleAtSetPoint);
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
        TraceError.sysout("css.safeGetCSSRules; EXCEPTION " + e, e);
    }

    return null;
};

Css.isValidStylesheet = function(styleSheet)
{
    try
    {
        // See if the getter triggers an exception. "void" is there to silence jshint.
        void styleSheet.cssRules;
        return true;
    }
    catch (exc)
    {
        TraceError.sysout("css.isValidStylesheet; EXCEPTION " + exc, exc);
    }

    return false;
};

// ********************************************************************************************* //
// Stylesheet API

Css.shouldIgnoreSheet = function(sheet)
{
    // Ignore by the regular method, except for default stylesheets that are
    // used in case there is no other stylesheet.
    if (sheet.defaultStylesheet)
        return false;
    return (sheet.ownerNode && Firebug.shouldIgnore(sheet.ownerNode));
};

Css.createStyleSheet = function(doc, url)
{
    var style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
    style.setAttribute("charset", "utf-8");
    style.setAttribute("type", "text/css");

    var cssText = url ? Http.getResource(url, true) : null;
    if (cssText)
    {
        var index = url.lastIndexOf("/");
        var absURL = url.substr(0, index+1);

        // Replace all relative URLs with absolute (using the passed url).
        // Note that stylesheets can come from various extensions and the source can
        // be even used in a browser env where relative URLs make more sense.
        var expr = /url\(([\'"]?)(?![\'"]?(?:[a-z]+:|\/))/gi;
        cssText = cssText.replace(expr, "url($1" + absURL);

        style.textContent = cssText;
    }

    Firebug.setIgnored(style);
    return style;
};

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
        TraceError.sysout("css.addStyleSheet; ERROR to append a stylesheet");
    }
};

Css.appendStylesheet = function(doc, uri)
{
    // Make sure the stylesheet is not appended twice.
    var styleSheet = doc.getElementById(uri);
    if (styleSheet)
        return styleSheet;

    styleSheet = Css.createStyleSheet(doc, uri);
    styleSheet.setAttribute("id", uri);
    Css.addStyleSheet(doc, styleSheet);

    return styleSheet;
};

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
                //TraceError.sysout("css.createStyleSheetMap; EXCEPTION " + err, err);
            }
        }
    });

    Trace.sysout("css.createStyleSheetMap; for " + context.getName(), context.styleSheetMap);

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

        if (Css.shouldIgnoreSheet(sheet))
            return;

        styleSheets.push(sheet);

        try
        {
            for (var i = 0; i < sheet.cssRules.length; ++i)
            {
                var rule = sheet.cssRules[i];
                if (rule instanceof CSSImportRule)
                    addSheet(rule.styleSheet);
            }
        }
        catch (e)
        {
            TraceError.sysout("css.getAllStyleSheets; sheet.cssRules FAILS for " +
                (sheet ? sheet.href : "null sheet") + e, e);
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

    return (styleSheet.href ? styleSheet.href : styleSheet.ownerNode.ownerDocument.documentURI);
};

/**
 * Retrieves the instance number for a given style sheet. The instance number
 * is sheet's index within the set of all other sheets whose URL is the same.
 */
Css.getInstanceForStyleSheet = function(styleSheet, ownerDocument)
{
    // ownerDocument is an optional hint for performance
    if (Trace.active)
    {
        Trace.sysout("css.getInstanceForStyleSheet; href:" + styleSheet.href + " mediaText:" +
            styleSheet.media.mediaText + " path to ownerNode" +
            (styleSheet.ownerNode && Xpath.getElementXPath(styleSheet.ownerNode)), ownerDocument);
    }

    ownerDocument = ownerDocument || Css.getDocumentForStyleSheet(styleSheet);
    if (!ownerDocument)
        return;

    var ret = 0,
        styleSheets = ownerDocument.styleSheets,
        href = styleSheet.href;

    for (var i = 0; i < styleSheets.length; i++)
    {
        var curSheet = styleSheets[i];

        if (Trace.active)
        {
            Trace.sysout("css.getInstanceForStyleSheet; compare href " + i +
                " " + curSheet.href + " " + curSheet.media.mediaText + " " +
                (curSheet.ownerNode && Xpath.getElementXPath(curSheet.ownerNode)));
        }

        if (Css.shouldIgnoreSheet(curSheet))
            break;

        if (curSheet == styleSheet)
            break;

        if (curSheet.href == href)
            ret++;
    }
    return ret;
};

Css.getDocumentForStyleSheet = function(styleSheet)
{
    if (!styleSheet)
        return;

    while (styleSheet.parentStyleSheet && !styleSheet.ownerNode)
        styleSheet = styleSheet.parentStyleSheet;

    if (styleSheet.ownerNode)
        return styleSheet.ownerNode.ownerDocument;
};

// ********************************************************************************************* //

Css.stripUnits = function(value)
{
    // remove units from '0px', '0em' etc. leave non-zero units in-tact.
    return value.replace(/(url\(.*?\)|[^0]\S*\s*)|0(%|em|ex|px|in|cm|mm|pt|pc)(\s|$)/gi,
        function(_, skip, remove, whitespace)
        {
            return skip || ('0' + whitespace);
        }
    );
};

Css.extractURLs = function(value)
{
    var urls = [];
    var urlValues = value.match(/url\((["']).*?\1\)/g);

    for (var i in urlValues)
        urls.push(urlValues[i].replace(/url\((["'])(.*?)\1\)/, "$2"));

    return urls;
};

Css.colorNameToRGB = function(value)
{
    if (!domUtils.colorNameToRGB)
        return value;

    var reSplit = /(\(|,|\)|\s)/;
    var parts = value.split(reSplit);

    var newValue = "";
    for (var i=0, len=parts.length; i<len; ++i)
    {
        var part = parts[i];
        if (part === "transparent")
        {
            newValue += "rgba(0, 0, 0, 0)";
        }
        else
        {
            if (Css.isColorKeyword(part))
            {
                try
                {
                    var rgbValue = domUtils.colorNameToRGB(part);
                    newValue += "rgb(" + rgbValue.r + ", " + rgbValue.g + ", " + rgbValue.b + ")";
                }
                catch(e)
                {
                    // Color keyword is a system color, which can't be resolved by
                    // domUtils.colorNameToRGB(), so just return the keyword itself
                    // (see issue 6753)
                    newValue += part;
                }
            }
            else
            {
                newValue += part;
            }
        }
    }

    return newValue;
};

Css.rgbToHex = function(value)
{
    function convertRGBToHex(r, g, b)
    {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + (b << 0)).
            toString(16).substr(-6).toUpperCase();
    }

    value = Css.colorNameToRGB(value);

    return value.replace(/\brgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)/gi,
        function(_, r, g, b) {
            return convertRGBToHex(r, g, b);
        });
};

Css.rgbToHSL = function(value)
{
    function convertRGBToHSL(r, g, b, a)
    {
        r = parseInt(r);
        g = parseInt(g);
        b = parseInt(b);

        var gray = (r == g && g == b);

        r /= 255;
        g /= 255;
        b /= 255;

        var max = Math.max(r, g, b);
        var min = Math.min(r, g, b);

        var h = 0;
        var s = 0;
        var l = (max+min)/2;

        if (!gray)
        {
            var delta = max - min;
            s = l > 0.5 ? delta/(2-max-min) : delta/(max+min);

            switch (max)
            {
                case r:
                    h = (g-b)/delta + (g < b ? 6 : 0);
                    break;

                case g:
                    h = (b-r)/delta + 2;
                    break;

                case b:
                    h = (r-g)/delta + 4;
                    break;
            }
        }

        h = Math.round(h * 60);
        s = Math.round(s * 100);
        l = Math.round(l * 100);

        if (a)
            return "hsla("+h+", "+s+"%, "+l+"%, "+a+")";
        else
            return "hsl("+h+", "+s+"%, "+l+"%)";
    }

    value = Css.colorNameToRGB(value);

    return value.replace(/\brgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})(,\s*(\d.\d+|\d))?\)/gi,
        function(_, r, g, b, _, a)
        {
            return convertRGBToHSL(r, g, b, a);
        });
};

// ********************************************************************************************* //
// CSS Data

var cssDataExceptions =
{
    // Fonts. Note that specification of font families in "font" is
    // special-cased by auto-completion, so "fontFamily" isn't included in the list.
    // (For SVG presentational attribute completion it is wanted, but let's ignore
    // that case for now - it's rather uncommon.)
    "font": ["fontStyle", "fontVariant", "namedFontWeight", "fontSize", "mozFont"],
    "font-family": ["fontFamily"],

    // Shorthands (incorrect values, and we are also interested in how they
    // split into subproperties for improved cycling in auto-completion)
    "border-image": ["borderImageRepeat", "thickness", "image"],
    "background": ["bgRepeat", "bgAttachment", "position", "length", "color", "image", "boxModels"],
    "border": ["borderStyle", "thickness", "length", "color"],

    // Incorrect values
    "text-decoration": ["textDecoration"],
    "-moz-text-decoration-line": ["textDecoration"],

    // Missing values
    "background-position": ["position", "length"],
    "background-size": ["bgSize", "length"],
    "border-image-slice": ["fill"],
    "border-image-width": ["auto", "length"],
    "border-image-outset": ["length"],
    "border-image-repeat": ["borderImageRepeat"],
    "border-top-left-radius": ["length"],
    "border-top-right-radius": ["length"],
    "border-bottom-right-radius": ["length"],
    "border-bottom-left-radius": ["length"],
    "border-spacing": ["length"],
    "-moz-border-bottom-colors": ["color"],
    "-moz-border-left-colors": ["color"],
    "-moz-border-right-colors": ["color"],
    "-moz-border-top-colors": ["color"],
    "box-shadow": ["boxShadow", "color", "none", "length"],
    "clip": ["rect()", "auto"],
    "content": ["string", "url()", "none", "normal"],
    "counter-increment": ["none"],
    "counter-reset": ["none"],
    "cursor": ["cursor", "url()"],
    "fill": ["clipRule"],
    "filter": ["url()", "none"],
    "font-weight": ["fontWeight"],
    "-moz-font-feature-settings": ["mozFontFeatureSettings"],
    "-moz-image-region": ["rect()"],
    "paint-order": ["normal", "fill", "stroke", "markers"],
    "stroke-dasharray": ["none"],
    "quotes": ["none"],
    "text-overflow": ["textOverflow"],
    "text-shadow": ["color", "length"],
    "transform": ["transformFunction", "none", "length"],
    "transform-origin": ["position", "length"],
    "border-radius": ["length"],
    "-moz-perspective-origin": ["position", "length"],
};

var svgPresentationalProperties = new Set([
    "clip-rule",
    "color-interpolation",
    "color-interpolation-filters",
    "dominant-baseline",
    "fill",
    "fill-opacity",
    "fill-rule",
    "flood-color",
    "flood-opacity",
    "lighting-color",
    "marker",
    "marker-end",
    "marker-mid",
    "marker-start",
    "mask-type",
    "shape-rendering",
    "stop-color",
    "stop-opacity",
    "stroke",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-opacity",
    "stroke-width",
    "text-anchor",
    "vector-effect",

    // Unimplemented by Firefox, but it doesn't hurt to include them for future compatibility.
    "alignment-baseline",
    "baseline-shift",
    "color-profile",
    "color-rendering",
    "enable-background",
    "glyph-orientation-horizontal",
    "glyph-orientation-vertical",
    "kerning",
    "paint-order",
    "writing-mode",
]);

// CSS properties for HTML that also apply to SVG, taken from:
// http://www.w3.org/TR/SVG/styling.html#SVGStylingProperties
var svgInheritedFromHtml = new Set([
    "clip",
    "color",
    "cursor",
    "direction",
    "display",
    "filter",
    "font",
    "font-family",
    "font-size",
    "font-size-adjust",
    "font-stretch",
    "font-style",
    "font-variant",
    "font-weight",
    "image-rendering",
    "letter-spacing",
    "mask",
    "opacity",
    "overflow",
    "pointer-events",
    "text-decoration",
    "text-rendering",
    "unicode-bidi",
    "visibility",
    "word-spacing",
]);

Css.multiValuedProperties =
{
    "animation": 1,
    "background": 1,
    "background-position": 1,
    "border": 1,
    "border-color": 1,
    "border-style": 1,
    "border-width": 1,
    "border-radius": 1,
    "box-shadow": 1,
    "font": 1,
    "font-family": 1,
    "margin": 1,
    "padding": 1
};

Css.unitlessProperties =
{
    "counter-increment": 1,
    "counter-reset": 1,
    "font-size-adjust": 1,
    "font-weight": 1,
    "line-height": 1,
    "opacity": 1,
    "orphans": 1,
    "widows": 1,
    "z-index": 1,
    "-moz-column-count": 1
};

Css.cssKeywords =
{
    // "color" is set in initPropertyData.

    "cursor":
    [
        "auto",
        "default",
        "pointer",
        "text",
        "crosshair",
        "move",
        "help",
        "no-drop",
        "not-allowed",
        "none",
        "-moz-grab",
        "-moz-grabbing",
        "-moz-zoom-in",
        "-moz-zoom-out",
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
        "cell",
        "context-menu",
        "progress",
        "vertical-text",
        "wait",
        "copy",
        "alias"
    ],

    "boxModels":
    [
        "padding-box",
        "border-box",
        "content-box"
    ],

    "bgAttachment":
    [
        "local",
        "scroll",
        "fixed"
    ],

    "position":
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

    "bgSize":
    [
        "auto",
        "cover",
        "contain"
    ],

    "borderStyle":
    [
        "solid",
        "none",
        "dotted",
        "dashed",
        "double",
        "hidden",
        "groove",
        "ridge",
        "inset",
        "outset",
    ],

    "string":
    [
        "open-quote",
        "close-quote",
        "no-open-quote",
        "no-close-quote",
        "attr()",
        "counter()",
        "counters()"
    ],

    "fontStyle":
    [
        "normal",
        "italic",
        "oblique"
    ],

    "fontVariant":
    [
        "normal",
        "small-caps"
    ],


    // Named font-weight values, worth completing in "font"
    "namedFontWeight":
    [
        "normal",
        "bold",
        "bolder",
        "lighter"
    ],

    "fontWeight":
    [
        "normal",
        "bold",
        "bolder",
        "lighter",
        "100",
        "200",
        "300",
        "400",
        "500",
        "600",
        "700",
        "800",
        "900"
    ],

    "fontSize":
    [
        // Absolute size keywords
        "xx-small",
        "x-small",
        "small",
        "medium",
        "large",
        "x-large",
        "xx-large",

        // Relative size keywords
        "smaller",
        "larger"
    ],

    "fontFamily":
    [
        // Common font families
        "Arial",
        "Comic Sans MS",
        "Georgia",
        "Tahoma",
        "Verdana",
        "Times New Roman",
        "Trebuchet MS",
        "Lucida Console",
        "Lucida Grande",
        "Helvetica",

        // Generic font families
        "serif",
        "sans-serif",
        "cursive",
        "fantasy",
        "monospace",

        // Additional font families
        "caption",
        "icon",
        "menu",
        "message-box",
        "small-caption",
        "status-bar",
        "-moz-fixed"
    ],

    "mozFont":
    [
        "-moz-button",
        "-moz-info",
        "-moz-desktop",
        "-moz-dialog",
        "-moz-document",
        "-moz-workspace",
        "-moz-window",
        "-moz-list",
        "-moz-pull-down-menu",
        "-moz-field"
    ],

    "textDecoration":
    [
        "none",
        "underline",
        "overline",
        "line-through",
        "-moz-anchor-decoration"
    ],

    "thickness":
    [
        "thin",
        "medium",
        "thick"
    ],

    "boxShadow":
    [
        "inset"
    ],

    "image":
    [
        "url()",
        "linear-gradient()",
        "radial-gradient()",
        "repeating-linear-gradient()",
        "repeating-radial-gradient()",
        "-moz-image-rect()",
        "-moz-element()",
        "none",
    ],

    "length":
    [
        "calc()"
    ],

    "transformFunction":
    [
        "matrix()",
        "matrix3d()",
        "rotate()",
        "rotateX()",
        "rotateY()",
        "rotateZ()",
        "scale()",
        "scaleX()",
        "scaleY()",
        "scaleZ()",
        "scale3d()",
        "skewX()",
        "skewY()",
        "translate()",
        "translateX()",
        "translateY()",
        "translateZ()"
    ],

    "mozFontFeatureSettings":
    [
        "normal",
        "on",
        "off",

        // Font features
        // Doesn't include cv01-cv99
        "\"aalt\"",
        "\"abvf\"",
        "\"abvm\"",
        "\"abvs\"",
        "\"afrc\"",
        "\"akhn\"",
        "\"blwf\"",
        "\"blwm\"",
        "\"blws\"",
        "\"calt\"",
        "\"case\"",
        "\"ccmp\"",
        "\"cfar\"",
        "\"cjct\"",
        "\"clig\"",
        "\"cpct\"",
        "\"cpsp\"",
        "\"cswh\"",
        "\"curs\"",
        "\"c2pc\"",
        "\"c2sc\"",
        "\"dist\"",
        "\"dlig\"",
        "\"dnom\"",
        "\"expt\"",
        "\"falt\"",
        "\"fin2\"",
        "\"fin3\"",
        "\"fina\"",
        "\"frac\"",
        "\"fwid\"",
        "\"half\"",
        "\"haln\"",
        "\"halt\"",
        "\"hist\"",
        "\"hkna\"",
        "\"hlig\"",
        "\"hngl\"",
        "\"hojo\"",
        "\"hwid\"",
        "\"init\"",
        "\"isol\"",
        "\"ital\"",
        "\"jalt\"",
        "\"jp78\"",
        "\"jp83\"",
        "\"jp90\"",
        "\"jp04\"",
        "\"kern\"",
        "\"lfbd\"",
        "\"liga\"",
        "\"ljmo\"",
        "\"lnum\"",
        "\"locl\"",
        "\"ltra\"",
        "\"ltrm\"",
        "\"mark\"",
        "\"med2\"",
        "\"medi\"",
        "\"mgrk\"",
        "\"mkmk\"",
        "\"mset\"",
        "\"nalt\"",
        "\"nlck\"",
        "\"nukt\"",
        "\"numr\"",
        "\"onum\"",
        "\"opbd\"",
        "\"ordn\"",
        "\"ornm\"",
        "\"palt\"",
        "\"pcap\"",
        "\"pkna\"",
        "\"pnum\"",
        "\"pref\"",
        "\"pres\"",
        "\"pstf\"",
        "\"psts\"",
        "\"pwid\"",
        "\"qwid\"",
        "\"rand\"",
        "\"rkrf\"",
        "\"rlig\"",
        "\"rphf\"",
        "\"rtbd\"",
        "\"rtla\"",
        "\"rtlm\"",
        "\"ruby\"",
        "\"salt\"",
        "\"sinf\"",
        "\"size\"",
        "\"smcp\"",
        "\"smpl\"",
        "\"ss01\"",
        "\"ss02\"",
        "\"ss03\"",
        "\"ss04\"",
        "\"ss05\"",
        "\"ss06\"",
        "\"ss07\"",
        "\"ss08\"",
        "\"ss09\"",
        "\"ss10\"",
        "\"ss11\"",
        "\"ss12\"",
        "\"ss13\"",
        "\"ss14\"",
        "\"ss15\"",
        "\"ss16\"",
        "\"ss17\"",
        "\"ss18\"",
        "\"ss19\"",
        "\"ss20\"",
        "\"subs\"",
        "\"sups\"",
        "\"swsh\"",
        "\"titl\"",
        "\"tjmo\"",
        "\"tnam\"",
        "\"tnum\"",
        "\"trad\"",
        "\"twid\"",
        "\"unic\"",
        "\"valt\"",
        "\"vatu\"",
        "\"vert\"",
        "\"vhal\"",
        "\"vjmo\"",
        "\"vkna\"",
        "\"vkrn\"",
        "\"vpal\"",
        "\"vrt2\"",
        "\"zero\""
    ],

    "textOverflow":
    [
       "clip",
       "ellipsis"
    ],

    "clipRule":
    [
        "nonzero",
        "evenodd"
    ],
};

var extraColors = [
    "currentColor",

    // System colors
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

    // Mozilla system color extensions
    "-moz-ButtonDefault",
    "-moz-ButtonHoverFace",
    "-moz-ButtonHoverText",
    "-moz-CellHighlight",
    "-moz-CellHighlightText",
    "-moz-Combobox",
    "-moz-ComboboxText",
    "-moz-Dialog",
    "-moz-DialogText",
    "-moz-dragtargetzone",
    "-moz-EvenTreeRow",
    "-moz-Field",
    "-moz-FieldText",
    "-moz-html-CellHighlight",
    "-moz-html-CellHighlightText",
    "-moz-mac-accentdarkestshadow",
    "-moz-mac-accentdarkshadow",
    "-moz-mac-accentface",
    "-moz-mac-accentlightesthighlight",
    "-moz-mac-accentlightshadow",
    "-moz-mac-accentregularhighlight",
    "-moz-mac-accentregularshadow",
    "-moz-mac-chrome-active",
    "-moz-mac-chrome-inactive",
    "-moz-mac-focusring",
    "-moz-mac-menuselect",
    "-moz-mac-menushadow",
    "-moz-mac-menutextselect",
    "-moz-MenuHover",
    "-moz-MenuHoverText",
    "-moz-MenuBarText",
    "-moz-MenuBarHoverText",
    "-moz-nativehyperlinktext",
    "-moz-OddTreeRow",
    "-moz-win-communicationstext",
    "-moz-win-mediatext",

    // Mozilla color preference extensions
    "-moz-activehyperlinktext",
    "-moz-default-background-color",
    "-moz-default-color",
    "-moz-hyperlinktext",
    "-moz-visitedhyperlinktext",
];

var extraImages = [
    "linear-gradient()",
    "repeating-linear-gradient()",
    "radial-gradient()",
    "repeating-radial-gradient()",
];

var animatableProperties = [
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
    "margin",
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
    "transform-origin",
    "transform",
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
];

// Most common supported charsets according to http://en.wikipedia.org/wiki/Character_encoding
Css.charsets =
[
    "Big5",
    "Big5-HKSCS",
    "EUC-JP",
    "EUC-KR",
    "GB18030",
    "GB2312",
    "GBK",
    "ISO-2022-JP",
    "ISO-2022-JP-2",
    "ISO-2022-KR",
    "ISO-8859-1",
    "ISO-8859-2",
    "ISO-8859-3",
    "ISO-8859-4",
    "ISO-8859-5",
    "ISO-8859-6",
    "ISO-8859-7",
    "ISO-8859-8",
    "ISO-8859-9",
    "ISO-8859-10",
    "JIS_Encoding",
    "KOI8-R",
    "KOI8-U",
    "Shift_JIS",
    "TSCII",
    "UTF-8",
    "US-ASCII",
    "VISCII",
    "Windows-1250",
    "Windows-1251",
    "Windows-1252",
    "Windows-1253",
    "Windows-1254",
    "Windows-1255",
    "Windows-1256",
    "Windows-1257",
    "Windows-1258"
];

// http://www.w3.org/TR/CSS21/media.html#media-types
Css.mediaTypes =
[
    "all",
    "aural",
    "braille",
    "embossed",
    "handheld",
    "print",
    "projection",
    "screen",
    "tty",
    "tv"
];

// https://developer.mozilla.org/en-US/docs/CSS/@document
Css.documentConditions =
[
    "url()",
    "url-prefix()",
    "domain()",
    "regexp()"
];

// https://developer.mozilla.org/en-US/docs/CSS/@keyframes#Values
Css.keyframeKeys =
{
    "from": "0%",
    "to": "100%"
};

// http://mxr.mozilla.org/mozilla-central/source/layout/style/nsCSSPseudoClassList.h
// Also http://mxr.mozilla.org/mozilla-central/source/layout/style/nsCSSAnonBoxList.h
// but that's not relevant for our purposes.
Css.pseudoClasses =
[
    ":active",
    ":checked",
    ":default",
    ":disabled",
    ":empty",
    ":enabled",
    ":first-child",
    ":first-of-type",
    ":focus",
    ":hover",
    ":indeterminate",
    ":in-range",
    ":invalid",
    ":lang()",
    ":last-child",
    ":last-of-type",
    ":link",
    ":not()",
    ":nth-child()",
    ":nth-last-child()",
    ":nth-last-of-type()",
    ":nth-of-type()",
    ":only-child",
    ":only-of-type",
    ":optional",
    ":out-of-range",
    ":required",
    ":root",
    ":target",
    ":valid",
    ":visited",
    ":-moz-any()",
    ":-moz-any-link",
    ":-moz-bound-element",
    ":-moz-broken",
    ":-moz-drag-over",
    ":-moz-empty-except-children-with-localname()",
    ":-moz-first-node",
    ":-moz-focusring",
    ":-moz-full-screen",
    ":-moz-full-screen-ancestor",
    ":-moz-handler-blocked",
    ":-moz-handler-clicktoplay",
    ":-moz-handler-crashed",
    ":-moz-handler-disabled",
    ":-moz-has-handlerref",
    ":-moz-is-html",
    ":-moz-last-node",
    ":-moz-loading",
    // ":-moz-locale-dir(ltr)", // http://bugzil.la/588996
    // ":-moz-locale-dir(rtl)",
    ":-moz-lwtheme",
    ":-moz-lwtheme-brighttext",
    ":-moz-lwtheme-darktext",
    ":-moz-math-increment-script-level",
    ":-moz-meter-optimum",
    ":-moz-meter-sub-optimum",
    ":-moz-meter-sub-sub-optimum",
    ":-moz-only-whitespace",
    ":-moz-placeholder",
    ":-moz-read-only",
    ":-moz-read-write",
    ":-moz-submit-invalid",
    ":-moz-suppressed",
    ":-moz-system-metric(images-in-menus)",
    ":-moz-system-metric(mac-graphite-theme)",
    ":-moz-system-metric(scrollbar-end-backward)",
    ":-moz-system-metric(scrollbar-end-forward)",
    ":-moz-system-metric(scrollbar-start-backward)",
    ":-moz-system-metric(scrollbar-start-forward)",
    ":-moz-system-metric(scrollbar-thumb-proportional)",
    ":-moz-system-metric(touch-enabled)",
    ":-moz-system-metric(windows-default-theme)",
    ":-moz-table-border-nonzero",
    ":-moz-type-unsupported",
    ":-moz-ui-invalid",
    ":-moz-ui-valid",
    ":-moz-user-disabled",
    ":-moz-window-inactive"
];

// https://developer.mozilla.org/en-US/docs/CSS/CSS_Reference/Mozilla_Extensions#Pseudo-elements_and_pseudo-classes
// http://mxr.mozilla.org/mozilla-central/source/browser/devtools/styleinspector/CssLogic.jsm
Css.pseudoElements =
[
    "::after",
    "::before",
    "::first-letter",
    "::first-line",
    "::-moz-focus-inner",
    "::-moz-focus-outer",
    "::-moz-list-bullet",
    "::-moz-list-number",
    "::-moz-math-anonymous",
    "::-moz-math-stretchy",
    "::-moz-placeholder",
    "::-moz-progress-bar",
    "::-moz-selection"
];

Css.nonEditableTags =
{
    "HTML": 1, "html": 1,
    "HEAD": 1, "head": 1
};

Css.innerEditableTags =
{
    "BODY": 1, "body": 1
};

Css.nonDeletableTags =
{
    "HTML": 1, "html": 1,
    "HEAD": 1, "head": 1,
    "BODY": 1, "body": 1
};

// lib/xml can't depend on lib/css, so inject the relevant function from here.
var presentationalPropMap = null;
Xml.getPresentationalSVGProperties = function()
{
    if (!presentationalPropMap)
    {
        presentationalPropMap = {};
        for (let name of Css.getCSSPropertyNames("svg"))
            presentationalPropMap[name] = Css.getCSSKeywordsByProperty("svg", name);
    }
    return presentationalPropMap;
};

// ********************************************************************************************* //
// Registration

return Css;

// ********************************************************************************************* //
});
