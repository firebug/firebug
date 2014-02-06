/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/string",
    "firebug/editor/codemirror/html-hint-data",
],
function(FBTrace, Str, HtmlData) {

"use strict";

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;

var Xml = {};

// ********************************************************************************************* //
// Tag and attribute data

var tagAttributes = {};
var tagAttributesMap = {};
var commonAttributes = {};
var commonAttributesMap = {};

// Set up HTML attributes from the CodeMirror data
commonAttributesMap.html = HtmlData.globalAttributes;
commonAttributes.html = Object.keys(commonAttributesMap.html).sort();
tagAttributesMap.html = {};
tagAttributes.html = {};
for (var tag in HtmlData.specificAttributes)
{
    var attrs = HtmlData.specificAttributes[tag].attrs;
    tagAttributesMap.html[tag] = attrs;
    tagAttributes.html[tag] = Object.keys(attrs).sort();
}

// SVG data, taken from: http://www.w3.org/TR/SVG/attindex.html
// and removing attributes unimplemented in Firefox, going by the commented-out lines in:
// http://dxr.mozilla.org/mozilla-central/source/content/base/src/nsTreeSanitizer.cpp
// (Up to date as of Firefox 27, but it doesn't seem to change much.)

tagAttributes.svg =
{
    "a": ["class", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "target", "transform", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space"],
    "altGlyph": ["class", "dx", "dy", "externalResourcesRequired", "format", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "rotate", "style", "systemLanguage", "x", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space", "y"],
    "altGlyphDef": ["id", "xml:base", "xml:lang", "xml:space"],
    "altGlyphItem": ["id", "xml:base", "xml:lang", "xml:space"],
    "animate": ["accumulate", "additive", "attributeName", "attributeType", "begin", "by", "calcMode", "dur", "end", "externalResourcesRequired", "fill", "from", "id", "keySplines", "keyTimes", "max", "min", "onbegin", "onend", "onload", "onrepeat", "repeatCount", "repeatDur", "requiredExtensions", "requiredFeatures", "restart", "systemLanguage", "to", "values", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space"],
    "animateColor": ["accumulate", "additive", "attributeName", "attributeType", "begin", "by", "calcMode", "dur", "end", "externalResourcesRequired", "fill", "from", "id", "keySplines", "keyTimes", "max", "min", "onbegin", "onend", "onload", "onrepeat", "repeatCount", "repeatDur", "requiredExtensions", "requiredFeatures", "restart", "systemLanguage", "to", "values", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space"],
    "animateMotion": ["accumulate", "additive", "begin", "by", "calcMode", "dur", "end", "externalResourcesRequired", "fill", "from", "id", "keyPoints", "keySplines", "keyTimes", "max", "min", "onbegin", "onend", "onload", "onrepeat", "path", "repeatCount", "repeatDur", "requiredExtensions", "requiredFeatures", "restart", "rotate", "systemLanguage", "to", "values", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space"],
    "animateTransform": ["accumulate", "additive", "attributeName", "attributeType", "begin", "by", "calcMode", "dur", "end", "externalResourcesRequired", "fill", "from", "id", "keySplines", "keyTimes", "max", "min", "onbegin", "onend", "onload", "onrepeat", "repeatCount", "repeatDur", "requiredExtensions", "requiredFeatures", "restart", "systemLanguage", "to", "type", "values", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space"],
    "circle": ["class", "cx", "cy", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "r", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "transform", "xml:base", "xml:lang", "xml:space"],
    "clipPath": ["class", "clipPathUnits", "externalResourcesRequired", "id", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "transform", "xml:base", "xml:lang", "xml:space"],
    "color-profile": ["id", "name", "rendering-intent", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space"],
    "cursor": ["externalResourcesRequired", "id", "requiredExtensions", "requiredFeatures", "systemLanguage", "x", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space", "y"],
    "defs": ["class", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "transform", "xml:base", "xml:lang", "xml:space"],
    "desc": ["class", "id", "style", "xml:base", "xml:lang", "xml:space"],
    "ellipse": ["class", "cx", "cy", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "rx", "ry", "style", "systemLanguage", "transform", "xml:base", "xml:lang", "xml:space"],
    "feBlend": ["class", "height", "id", "in", "in2", "mode", "result", "style", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "feColorMatrix": ["class", "height", "id", "in", "result", "style", "type", "values", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "feComponentTransfer": ["class", "height", "id", "in", "result", "style", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "feComposite": ["class", "height", "id", "in", "in2", "k1", "k2", "k3", "k4", "operator", "result", "style", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "feConvolveMatrix": ["bias", "class", "divisor", "edgeMode", "height", "id", "in", "kernelMatrix", "kernelUnitLength", "order", "preserveAlpha", "result", "style", "targetX", "targetY", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "feDiffuseLighting": ["class", "diffuseConstant", "height", "id", "in", "kernelUnitLength", "result", "style", "surfaceScale", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "feDisplacementMap": ["class", "height", "id", "in", "in2", "result", "scale", "style", "width", "x", "xChannelSelector", "xml:base", "xml:lang", "xml:space", "y", "yChannelSelector"],
    "feDistantLight": ["azimuth", "elevation", "id", "xml:base", "xml:lang", "xml:space"],
    "feDropShadow": ["class", "dx", "dy", "height", "id", "in", "result", "stdDeviation", "style", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "feFlood": ["class", "height", "id", "result", "style", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "feFuncA": ["amplitude", "exponent", "id", "intercept", "offset", "slope", "tableValues", "type", "xml:base", "xml:lang", "xml:space"],
    "feFuncB": ["amplitude", "exponent", "id", "intercept", "offset", "slope", "tableValues", "type", "xml:base", "xml:lang", "xml:space"],
    "feFuncG": ["amplitude", "exponent", "id", "intercept", "offset", "slope", "tableValues", "type", "xml:base", "xml:lang", "xml:space"],
    "feFuncR": ["amplitude", "exponent", "id", "intercept", "offset", "slope", "tableValues", "type", "xml:base", "xml:lang", "xml:space"],
    "feGaussianBlur": ["class", "height", "id", "in", "result", "stdDeviation", "style", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "feImage": ["class", "externalResourcesRequired", "height", "id", "preserveAspectRatio", "result", "style", "width", "x", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space", "y"],
    "feMerge": ["class", "height", "id", "result", "style", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "feMergeNode": ["id", "xml:base", "xml:lang", "xml:space"],
    "feMorphology": ["class", "height", "id", "in", "operator", "radius", "result", "style", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "feOffset": ["class", "dx", "dy", "height", "id", "in", "result", "style", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "fePointLight": ["id", "x", "xml:base", "xml:lang", "xml:space", "y", "z"],
    "feSpecularLighting": ["class", "height", "id", "in", "kernelUnitLength", "result", "specularConstant", "specularExponent", "style", "surfaceScale", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "feSpotLight": ["id", "limitingConeAngle", "pointsAtX", "pointsAtY", "pointsAtZ", "specularExponent", "x", "xml:base", "xml:lang", "xml:space", "y", "z"],
    "feTile": ["class", "height", "id", "in", "result", "style", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "feTurbulence": ["baseFrequency", "class", "height", "id", "numOctaves", "result", "seed", "stitchTiles", "style", "type", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "filter": ["class", "externalResourcesRequired", "filterRes", "filterUnits", "height", "id", "primitiveUnits", "style", "width", "x", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space", "y"],
    "font": ["class", "externalResourcesRequired", "id", "style", "xml:base", "xml:lang", "xml:space"],
    "font-face": ["font-family", "font-size", "font-stretch", "font-style", "font-variant", "font-weight", "hanging", "id", "slope", "xml:base", "xml:lang", "xml:space"],
    "font-face-format": ["id", "string", "xml:base", "xml:lang", "xml:space"],
    "font-face-name": ["id", "name", "xml:base", "xml:lang", "xml:space"],
    "font-face-src": ["id", "xml:base", "xml:lang", "xml:space"],
    "font-face-uri": ["id", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space"],
    "foreignObject": ["class", "externalResourcesRequired", "height", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "transform", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "g": ["class", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "transform", "xml:base", "xml:lang", "xml:space"],
    "glyph": ["class", "d", "id", "lang", "orientation", "style", "xml:base", "xml:lang", "xml:space"],
    "glyphRef": ["class", "dx", "dy", "format", "id", "style", "x", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space", "y"],
    "hkern": ["id", "xml:base", "xml:lang", "xml:space"],
    "image": ["class", "externalResourcesRequired", "height", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "preserveAspectRatio", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "transform", "width", "x", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space", "y"],
    "linearGradient": ["class", "externalResourcesRequired", "gradientTransform", "gradientUnits", "id", "spreadMethod", "style", "x1", "x2", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space", "y1", "y2"],
    "line": ["class", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "transform", "x1", "x2", "xml:base", "xml:lang", "xml:space", "y1", "y2"],
    "marker": ["class", "externalResourcesRequired", "id", "markerHeight", "markerUnits", "markerWidth", "orient", "preserveAspectRatio", "refX", "refY", "style", "viewBox", "xml:base", "xml:lang", "xml:space"],
    "mask": ["class", "externalResourcesRequired", "height", "id", "maskContentUnits", "maskUnits", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "metadata": ["id", "xml:base", "xml:lang", "xml:space"],
    "missing-glyph": ["class", "d", "id", "style", "xml:base", "xml:lang", "xml:space"],
    "mpath": ["externalResourcesRequired", "id", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space"],
    "path": ["class", "d", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "pathLength", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "transform", "xml:base", "xml:lang", "xml:space"],
    "pattern": ["class", "externalResourcesRequired", "height", "id", "patternContentUnits", "patternTransform", "patternUnits", "preserveAspectRatio", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "viewBox", "width", "x", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space", "y"],
    "polygon": ["class", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "points", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "transform", "xml:base", "xml:lang", "xml:space"],
    "polyline": ["class", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "points", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "transform", "xml:base", "xml:lang", "xml:space"],
    "radialGradient": ["class", "cx", "cy", "externalResourcesRequired", "fx", "fy", "gradientTransform", "gradientUnits", "id", "r", "spreadMethod", "style", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space"],
    "rect": ["class", "externalResourcesRequired", "height", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "rx", "ry", "style", "systemLanguage", "transform", "width", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "script": ["externalResourcesRequired", "id", "type", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space"],
    "set": ["attributeName", "attributeType", "begin", "dur", "end", "externalResourcesRequired", "fill", "id", "max", "min", "onbegin", "onend", "onload", "onrepeat", "repeatCount", "repeatDur", "requiredExtensions", "requiredFeatures", "restart", "systemLanguage", "to", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space"],
    "stop": ["class", "id", "offset", "style", "xml:base", "xml:lang", "xml:space"],
    "style": ["id", "media", "title", "type", "xml:base", "xml:lang", "xml:space"],
    "svg": ["class", "externalResourcesRequired", "height", "id", "onabort", "onactivate", "onclick", "onerror", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "onresize", "onscroll", "onunload", "onzoom", "preserveAspectRatio", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "version", "viewBox", "width", "x", "xml:base", "xml:lang", "xml:space", "y", "zoomAndPan"],
    "switch": ["class", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "transform", "xml:base", "xml:lang", "xml:space"],
    "symbol": ["class", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "preserveAspectRatio", "style", "viewBox", "xml:base", "xml:lang", "xml:space"],
    "text": ["class", "dx", "dy", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "rotate", "style", "systemLanguage", "transform", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "textPath": ["class", "externalResourcesRequired", "id", "method", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "spacing", "startOffset", "style", "systemLanguage", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space"],
    "title": ["class", "id", "style", "xml:base", "xml:lang", "xml:space"],
    "tref": ["class", "dx", "dy", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "rotate", "style", "systemLanguage", "x", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space", "y"],
    "tspan": ["class", "dx", "dy", "externalResourcesRequired", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "rotate", "style", "systemLanguage", "x", "xml:base", "xml:lang", "xml:space", "y"],
    "use": ["class", "externalResourcesRequired", "height", "id", "onactivate", "onclick", "onfocusin", "onfocusout", "onload", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "requiredExtensions", "requiredFeatures", "style", "systemLanguage", "transform", "width", "x", "xlink:actuate", "xlink:arcrole", "xlink:href", "xlink:role", "xlink:show", "xlink:title", "xlink:type", "xml:base", "xml:lang", "xml:space", "y"],
    "view": ["externalResourcesRequired", "id", "preserveAspectRatio", "viewBox", "viewTarget", "xml:base", "xml:lang", "xml:space", "zoomAndPan"],
    "vkern": ["id", "xml:base", "xml:lang", "xml:space"],
};

tagAttributesMap.svg = {};
for (var attribute in tagAttributes.svg)
    tagAttributesMap.svg[attribute] = {};

tagAttributesMap.svg.animateTransform.type = ["translate", "scale", "rotate", "skewX", "skewY"];
tagAttributesMap.svg.feColorMatrix.type = ["matrix", "saturate", "hueRotate", "luminanceToAlpha"];
tagAttributesMap.svg.feTurbulence.type = ["fractalNoise", "turbulence"];
tagAttributesMap.svg.feTurbulence.stitchTiles = ["stitch", "noStitch"];
tagAttributesMap.svg.feConvolveMatrix.edgeMode = ["duplicate", "wrap", "none"];
tagAttributesMap.svg.feConvolveMatrix.preserveAlpha = ["false", "true"];
tagAttributesMap.svg.feComposite.operator = ["over", "in", "out", "atop", "xor", "arithmetic"];
tagAttributesMap.svg.feMorphology.operator = ["erode", "dilate"];
tagAttributesMap.svg.feBlend.mode = ["normal", "multiply", "screen", "darken", "lighten"];
tagAttributesMap.svg.script.type = ["text/javascript", "application/ecmascript"];
tagAttributesMap.svg.style.type = ["text/css"];
tagAttributesMap.svg.style.media = tagAttributesMap.html.style.media;
tagAttributesMap.svg.svg.contentStyleType = ["text/css"];
tagAttributesMap.svg.svg.contentScriptType = ["text/javascript", "application/ecmascript"];
tagAttributesMap.svg["font-face"]["font-variant"] = ["normal", "small-caps"];
tagAttributesMap.svg["font-face"]["font-weight"] = ["all", "normal", "bold",
    "100", "200", "300", "400", "500", "600", "700", "800", "900"];
tagAttributesMap.svg["font-face"]["font-stretch"] = ["all", "normal",
    "semi-condensed", "condensed", "extra-condensed", "ultra-condensed",
    "semi-expanded", "expanded", "extra-expanded", "ultra-expanded"];
tagAttributesMap.svg.filter.filterUnits = ["userSpaceOnUse", "objectBoundingBox"];
tagAttributesMap.svg.filter.primitiveUnits = ["userSpaceOnUse", "objectBoundingBox"];
tagAttributesMap.svg.glyph["arabic-form"] = ["initial", "medial", "terminal", "isolated"];
tagAttributesMap.svg.glyph.orientation = ["h", "v"];
tagAttributesMap.svg.radialGradient.gradientUnits = ["userSpaceOnUse", "objectBoundingBox"];
tagAttributesMap.svg.linearGradient.gradientUnits = ["userSpaceOnUse", "objectBoundingBox"];
tagAttributesMap.svg.pattern.patternUnits = ["userSpaceOnUse", "objectBoundingBox"];
tagAttributesMap.svg.pattern.patternContentUnits = ["userSpaceOnUse", "objectBoundingBox"];
tagAttributesMap.svg.mask.maskUnits = ["userSpaceOnUse", "objectBoundingBox"];
tagAttributesMap.svg.mask.maskContentUnits = ["userSpaceOnUse", "objectBoundingBox"];
tagAttributesMap.svg.marker.markerUnits = ["strokeWidth", "userSpaceOnUse"];
tagAttributesMap.svg.textPath.method = ["align", "stretch"];
tagAttributesMap.svg.clipPath.clipPathUnits = ["userSpaceOnUse", "objectBoundingBox"];
tagAttributesMap.svg["color-profile"]["rendering-intent"] = ["auto", "perceptual",
    "relative-colorimetric", "saturation", "absolute-colorimetric"];
tagAttributesMap.svg.feFuncA.type =
tagAttributesMap.svg.feFuncR.type =
tagAttributesMap.svg.feFuncG.type =
tagAttributesMap.svg.feFuncB.type =
    ["identity", "table", "discrete", "linear", "gamma"];

(function()
{
    // Add some attributes values en masse where specifying them for each
    // tag name would have been annoying.
    var commonAttributes = {
        "transform": ["matrix()", "translate()", "scale()", "rotate()", "skewX()", "skewY()"],
        "in": ["SourceGraphic", "SourceAlpha", "BackgroundImage", "BackgroundAlpha", "FillPaint", "StrokePaint"],
        "in2": ["SourceGraphic", "SourceAlpha", "BackgroundImage", "BackgroundAlpha", "FillPaint", "StrokePaint"],
        "externalResourcesRequired": ["true", "false"],
        "fill": ["freeze", "remove"],
        "calcMode": ["discrete", "linear", "paced", "spline"],
        "additive": ["replace", "sum"],
        "accumulate": ["none", "sum"],
        "attributeType": ["CSS", "XML", "auto"]
    };
    for (var attribute in commonAttributes)
    {
        for (var tagName in tagAttributes.svg)
        {
            if (tagAttributes.svg[tagName].indexOf(attribute) !== -1)
            {
                tagAttributesMap.svg[tagName] = tagAttributesMap.svg[tagName] || {};
                tagAttributesMap.svg[tagName][attribute] = commonAttributes[attribute];
            }
        }
    }
})();

commonAttributes.svg = [];
commonAttributesMap.svg = {};

var presentationalSVG =
{
    a: 1,
    altGlyph: 1,
    animate: 1,
    animateColor: 1,
    circle: 1,
    clipPath: 1,
    defs: 1,
    ellipse: 1,
    feBlend: 1,
    feColorMatrix: 1,
    feComponentTransfer: 1,
    feComposite: 1,
    feConvolveMatrix: 1,
    feDropShadow: 1,
    feDiffuseLighting: 1,
    feDisplacementMap: 1,
    feFlood: 1,
    feGaussianBlur: 1,
    feImage: 1,
    feMerge: 1,
    feMorphology: 1,
    feOffset: 1,
    feSpecularLighting: 1,
    feTile: 1,
    feTurbulence: 1,
    filter: 1,
    font: 1,
    foreignObject: 1,
    g: 1,
    glyph: 1,
    glyphRef: 1,
    image: 1,
    line: 1,
    linearGradient: 1,
    marker: 1,
    mask: 1,
    "missing-glyph": 1,
    path: 1,
    pattern: 1,
    polygon: 1,
    polyline: 1,
    radialGradient: 1,
    rect: 1,
    stop: 1,
    svg: 1,
    "switch": 1,
    symbol: 1,
    text: 1,
    textPath: 1,
    tref: 1,
    tspan: 1,
    use: 1
};

Xml.isPresentationalSVG = function(nodeType, tagName)
{
    return (nodeType === "svg" && presentationalSVG.hasOwnProperty(tagName));
};

// Note: Xml.getPresentationalSVGProperties gets injected from lib/css,
// because we can't have dependency cycles.

Xml.getAttributesForTagName = function(nodeType, tagName)
{
    if (!tagAttributes.hasOwnProperty(nodeType))
        return [];

    var ret = [];
    if (tagAttributes[nodeType].hasOwnProperty(tagName))
        ret = ret.concat(tagAttributes[nodeType][tagName]);
    ret = ret.concat(commonAttributes[nodeType]);
    if (Xml.isPresentationalSVG(nodeType, tagName) &&
        Xml.getPresentationalSVGProperties)
    {
        var presentational = Xml.getPresentationalSVGProperties();
        ret = ret.concat(Object.keys(presentational));
    }
    return ret;
};

Xml.getValuesForAttribute = function(nodeType, tagName, attribute)
{
    if (!tagAttributes.hasOwnProperty(nodeType))
        return [];

    if (commonAttributesMap[nodeType].hasOwnProperty(attribute))
        return commonAttributesMap[nodeType][attribute] || [];
    if (tagAttributes[nodeType].hasOwnProperty(tagName) &&
        tagAttributesMap[nodeType][tagName].hasOwnProperty(attribute))
    {
        return tagAttributesMap[nodeType][tagName][attribute] || [];
    }
    if (Xml.isPresentationalSVG(nodeType, tagName) &&
        Xml.getPresentationalSVGProperties)
    {
        var presentational = Xml.getPresentationalSVGProperties();
        if (presentational.hasOwnProperty(attribute))
            return presentational[attribute].concat(["inherit"]);
    }
    return [];
};

// ************************************************************************************************
// HTML and XML Serialization

Xml.getElementType = function(node)
{
    if (isElementXUL(node))
        return 'xul';
    else if (isElementSVG(node))
        return 'svg';
    else if (isElementMathML(node))
        return 'mathml';
    else if (isElementXHTML(node))
        return 'xhtml';
    else if (isElementHTML(node))
        return 'html';
};

Xml.getElementSimpleType = function(node)
{
    if (isElementSVG(node))
        return 'svg';
    else if (isElementMathML(node))
        return 'mathml';
    else
        return 'html';
};

var isElementHTML = Xml.isElementHTML = function(node)
{
    return node.nodeName == node.nodeName.toUpperCase() && node.namespaceURI == 'http://www.w3.org/1999/xhtml';
};

var isElementXHTML = Xml.isElementXHTML = function(node)
{
    return node.nodeName != node.nodeName.toUpperCase() && node.namespaceURI == 'http://www.w3.org/1999/xhtml';
};

var isElementHTMLOrXHTML = Xml.isElementHTMLOrXHTML = function(node)
{
    return node.namespaceURI == "http://www.w3.org/1999/xhtml";
};

var isElementMathML = Xml.isElementMathML = function(node)
{
    return node.namespaceURI == 'http://www.w3.org/1998/Math/MathML';
};

var isElementSVG = Xml.isElementSVG = function(node)
{
    return node.namespaceURI == 'http://www.w3.org/2000/svg';
};

var isElementXUL = Xml.isElementXUL = function(node)
{
    return node instanceof XULElement;
};

var getNodeName = Xml.getNodeName = function(node)
{
    var name = node.nodeName;
    return isElementHTML(node) ? name.toLowerCase() : name;
};

Xml.getLocalName = function(node)
{
    var name = node.localName;
    return isElementHTML(node) ? name.toLowerCase() : name;
};

// End tags for void elements are forbidden http://wiki.whatwg.org/wiki/HTML_vs._XHTML
var selfClosingTags = Xml.selfClosingTags =
{
    "meta": 1,
    "link": 1,
    "area": 1,
    "base": 1,
    "col": 1,
    "input": 1,
    "img": 1,
    "br": 1,
    "hr": 1,
    "param": 1,
    "embed": 1
};

var isSelfClosing = Xml.isSelfClosing = function(element)
{
    if (isElementSVG(element) || isElementMathML(element))
        return true;
    var tag = element.localName.toLowerCase();
    return (selfClosingTags.hasOwnProperty(tag));
};

Xml.getElementHTML = function(element)
{
    function toHTML(elt, html)
    {
        if (elt.nodeType == Node.ELEMENT_NODE)
        {
            if (Firebug.shouldIgnore(elt))
                return;

            var nodeName = getNodeName(elt);
            html.push('<', nodeName);

            for (var i = 0; i < elt.attributes.length; ++i)
            {
                var attr = elt.attributes[i];

                // Hide attributes set by Firebug
                // XXX Do we even have any?
                if (Str.hasPrefix(attr.localName, "firebug-"))
                    continue;

                // MathML
                if (Str.hasPrefix(attr.localName, "-moz-math"))
                {
                    // just hide for now
                    continue;
                }

                html.push(' ', attr.name, '="', Str.escapeForElementAttribute(attr.value), '"');
            }

            if (elt.firstChild)
            {
                html.push('>');

                for (var child = elt.firstChild; child; child = child.nextSibling)
                    toHTML(child, html);

                html.push('</', nodeName, '>');
            }
            else if (isElementSVG(elt) || isElementMathML(elt))
            {
                html.push('/>');
            }
            else if (isSelfClosing(elt))
            {
                html.push((isElementXHTML(elt))?'/>':'>');
            }
            else
            {
                html.push('></', nodeName, '>');
            }
        }
        else if (elt.nodeType == Node.TEXT_NODE)
        {
            html.push(Str.escapeForTextNode(elt.textContent));
        }
        else if (elt.nodeType == Node.CDATA_SECTION_NODE)
        {
            html.push('<![CDATA[', elt.nodeValue, ']]>');
        }
        else if (elt.nodeType == Node.COMMENT_NODE)
        {
            html.push('<!--', elt.nodeValue, '-->');
        }
    }

    var html = [];
    toHTML(element, html);
    return html.join("");
};

Xml.getElementXML = function(element)
{
    function toXML(elt, xml)
    {
        if (elt.nodeType == Node.ELEMENT_NODE)
        {
            if (Firebug.shouldIgnore(elt))
                return;

            var nodeName = getNodeName(elt);
            xml.push('<', nodeName);

            for (var i = 0; i < elt.attributes.length; ++i)
            {
                var attr = elt.attributes[i];

                // Hide attributes set by Firebug
                if (Str.hasPrefix(attr.localName, "firebug-"))
                    continue;

                // MathML
                if (Str.hasPrefix(attr.localName, "-moz-math"))
                {
                    // just hide for now
                    continue;
                }

                xml.push(' ', attr.nodeName, '="', Str.escapeForElementAttribute(attr.value),'"');
            }

            if (elt.firstChild)
            {
                xml.push('>');

                for (var child = elt.firstChild; child; child = child.nextSibling)
                    toXML(child, xml);

                xml.push('</', nodeName, '>');
            }
            else
                xml.push('/>');
        }
        else if (elt.nodeType == Node.TEXT_NODE)
            xml.push(elt.nodeValue);
        else if (elt.nodeType == Node.CDATA_SECTION_NODE)
            xml.push('<![CDATA[', elt.nodeValue, ']]>');
        else if (elt.nodeType == Node.COMMENT_NODE)
            xml.push('<!--', elt.nodeValue, '-->');
    }

    var xml = [];
    toXML(element, xml);
    return xml.join("");
};

// ************************************************************************************************
// Whitespace and Entity conversions

var domUtils = Cc["@mozilla.org/inspector/dom-utils;1"].getService(Ci.inIDOMUtils);

/**
 * Returns true if given document is based on a XML and so displaying pretty printed XML elements.
 */
Xml.isXMLPrettyPrint = function(context, win)
{
    if (!context)
        return;

    if (context.isXMLPrettyPrintDetected)
        return context.isXMLPrettyPrint;

    try
    {
        var doc = win ? win.document : context.window.document;
        if (!doc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("lib.isXMLPrettyPrint; NO DOCUMENT", {win:win, context:context});
            return false;
        }
        if (!doc.documentElement)
            return false;

        var bindings = domUtils.getBindingURLs(doc.documentElement);
        for (var i = 0; i < bindings.length; i++)
        {
            var bindingURI = bindings.queryElementAt(i, Ci.nsIURI);
            if (FBTrace.DBG_CSS)
                FBTrace.sysout("bindingURL: " + i + " " + bindingURI.resolve(""));

            context.isXMLPrettyPrintDetected = true;
            return context.isXMLPrettyPrint = (bindingURI.resolve("") ===
                "chrome://global/content/xml/XMLPrettyPrint.xml");
        }
    }
    catch (e)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("xml.isXMLPrettyPrint; EXCEPTION "+e, e);
    }
};

// ************************************************************************************************

Xml.isVisible = function(elt)
{
    if (isElementXUL(elt))
    {
        //FBTrace.sysout("isVisible elt.offsetWidth: "+elt.offsetWidth+" offsetHeight:"+
        // elt.offsetHeight+" localName:"+ elt.localName+" nameSpace:"+elt.nameSpaceURI+"\n");
        return (!elt.hidden && !elt.collapsed);
    }

    try
    {
        return !isElementHTMLOrXHTML(elt) ||
            elt.offsetWidth > 0 ||
            elt.offsetHeight > 0 ||
            elt.localName in invisibleTags;
    }
    catch (err)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.isVisible; EXCEPTION " + err, err);
    }

    return false;
};

var invisibleTags = Xml.invisibleTags =
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

return Xml;

// ********************************************************************************************* //
});
