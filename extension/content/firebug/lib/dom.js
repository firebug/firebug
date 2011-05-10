/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/deprecated"
],
function(FBTrace, Deprecated) {

// ********************************************************************************************* //
// Constants

var DOM = {};
var domMemberCache = null;
var domMemberMap = {};

// ********************************************************************************************* //
// Module Implementation

DOM.getDOMMembers = function(object)
{
    if (!domMemberCache)
    {
        domMemberCache = {};

        for (var name in domMemberMap)
        {
            var builtins = domMemberMap[name];
            var cache = domMemberCache[name] = {};

            for (var i = 0; i < builtins.length; ++i)
                cache[builtins[i]] = i;
        }
    }

    if (object instanceof Window)
        { return domMemberCache.Window; }
    else if (object instanceof Document || object instanceof XMLDocument)
        { return domMemberCache.Document; }
    else if (object instanceof Location)
        { return domMemberCache.Location; }
    else if (object instanceof HTMLImageElement)
        { return domMemberCache.HTMLImageElement; }
    else if (object instanceof HTMLAnchorElement)
        { return domMemberCache.HTMLAnchorElement; }
    else if (object instanceof HTMLInputElement)
        { return domMemberCache.HTMLInputElement; }
    else if (object instanceof HTMLButtonElement)
        { return domMemberCache.HTMLButtonElement; }
    else if (object instanceof HTMLFormElement)
        { return domMemberCache.HTMLFormElement; }
    else if (object instanceof HTMLBodyElement)
        { return domMemberCache.HTMLBodyElement; }
    else if (object instanceof HTMLHtmlElement)
        { return domMemberCache.HTMLHtmlElement; }
    else if (object instanceof HTMLScriptElement)
        { return domMemberCache.HTMLScriptElement; }
    else if (object instanceof HTMLTableElement)
        { return domMemberCache.HTMLTableElement; }
    else if (object instanceof HTMLTableRowElement)
        { return domMemberCache.HTMLTableRowElement; }
    else if (object instanceof HTMLTableCellElement)
        { return domMemberCache.HTMLTableCellElement; }
    else if (object instanceof HTMLIFrameElement)
        { return domMemberCache.HTMLIFrameElement; }
    else if (object instanceof SVGSVGElement)
        { return domMemberCache.SVGSVGElement; }
    else if (object instanceof SVGElement)
        { return domMemberCache.SVGElement; }
    else if (object instanceof Element)
        { return domMemberCache.Element; }
    else if (object instanceof Text || object instanceof CDATASection)
        { return domMemberCache.Text; }
    else if (object instanceof Attr)
        { return domMemberCache.Attr; }
    else if (object instanceof Node)
        { return domMemberCache.Node; }
    else if (object instanceof Event || object instanceof FBL.EventCopy)
        { return domMemberCache.Event; }

    return null;
};

DOM.isDOMMember = function(object, propName)
{
    var members = DOM.getDOMMembers(object);
    return members && propName in members;
};

DOM.isDOMConstant = function(object, name)
{
    if (name == undefined)
        return DOM.isDOMConstantDep({},object);

    // The constant map has also its own prototype, but it isn't considered to be a constant.
    if (name == "__proto__")
        return false;

    if (!(object instanceof Window ||
        object instanceof Node ||
        object instanceof Location ||
        object instanceof Event ||
        object instanceof FBL.EventCopy)) // FBL dep is wrong
        return false;

    return DOM.domConstantMap.hasOwnProperty(name);
}

var isDOMConstantDep = Deprecated.deprecated(
    "isDOMConstant(name) signature changed (object,name)",
    DOM.isDOMConstant);

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

// xxxHonza: duplicated in lib.js remove as soon we have firebug/lib/array
function extendArray(array, array2)
{
   var newArray = [];
   newArray.push.apply(newArray, array);
   newArray.push.apply(newArray, array2);
   return newArray;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

domMemberMap.Window =
[
    "document",
    "frameElement",

    "innerWidth",
    "innerHeight",
    "outerWidth",
    "outerHeight",
    "screenX",
    "screenY",
    "mozInnerScreenX",
    "mozInnerScreenY",
    "pageXOffset",
    "pageYOffset",
    "scrollX",
    "scrollY",
    "scrollMaxX",
    "scrollMaxY",

    "URL", //FF4.0
    "mozAnimationStartTime", //FF4.0
    "mozPaintCount", //FF4.0
    "mozRequestAnimationFrame", //FF4.0
    "mozIndexedDB", //FF4.0

    "status",
    "defaultStatus",

    "parent",
    "opener",
    "top",
    "window",
    "content",
    "self",

    "location",
    "history",
    "frames",
    "navigator",
    "screen",
    "menubar",
    "toolbar",
    "locationbar",
    "personalbar",
    "statusbar",
    "directories",
    "scrollbars",
    "fullScreen",
    "netscape",
    "java",
    "console",
    "Components",
    "controllers",
    "closed",
    "crypto",
    "pkcs11",

    "name",
    "property",
    "length",

    "sessionStorage",
    "globalStorage",

    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
    "addEventListener",
    "removeEventListener",
    "dispatchEvent",
    "getComputedStyle",
    "captureEvents",
    "releaseEvents",
    "routeEvent",
    "enableExternalCapture",
    "disableExternalCapture",
    "moveTo",
    "moveBy",
    "resizeTo",
    "resizeBy",
    "scroll",
    "scrollTo",
    "scrollBy",
    "scrollByLines",
    "scrollByPages",
    "sizeToContent",
    "setResizable",
    "getSelection",
    "open",
    "openDialog",
    "close",
    "alert",
    "confirm",
    "prompt",
    "dump",
    "focus",
    "blur",
    "find",
    "back",
    "forward",
    "home",
    "stop",
    "print",
    "atob",
    "btoa",
    "updateCommands",
    "XPCNativeWrapper",
    "GeckoActiveXObject",
    "applicationCache",      // FF3
    "GetWeakReference", // Gecko
    "XPCSafeJSObjectWrapper", // Gecko
    "postMessage",
    "localStorage",  // FF3.5
    "showModalDialog", // FF 3.0, MS IE4

    "InstallTrigger",

    "getInterface",
];

domMemberMap.Location =
[
    "href",
    "protocol",
    "host",
    "hostname",
    "port",
    "pathname",
    "search",
    "hash",

    "assign",
    "reload",
    "replace"
];

domMemberMap.Node =
[
    "id",
    "className",

    "nodeType",
    "tagName",
    "nodeName",
    "localName",
    "prefix",
    "namespaceURI",
    "nodeValue",

    "ownerDocument",
    "parentNode",
    "offsetParent",
    "nextSibling",
    "previousSibling",
    "firstChild",
    "lastChild",
    "childNodes",
    "attributes",

    "dir",
    "baseURI",
    "textContent",
    "innerHTML",

    "addEventListener",
    "removeEventListener",
    "dispatchEvent",
    "cloneNode",
    "appendChild",
    "insertBefore",
    "replaceChild",
    "removeChild",
    "compareDocumentPosition",
    "hasAttributes",
    "hasChildNodes",
    "lookupNamespaceURI",
    "lookupPrefix",
    "normalize",
    "isDefaultNamespace",
    "isEqualNode",
    "isSameNode",
    "isSupported",
    "getFeature",
    "getUserData",
    "setUserData"
];

domMemberMap.Document = extendArray(domMemberMap.Node,
[
    "documentElement",
    "body",
    "title",
    "location",
    "referrer",
    "cookie",
    "contentType",
    "lastModified",
    "characterSet",
    "inputEncoding",
    "xmlEncoding",
    "xmlStandalone",
    "xmlVersion",
    "strictErrorChecking",
    "documentURI",
    "URL",

    "defaultView",
    "doctype",
    "implementation",
    "styleSheets",
    "images",
    "links",
    "forms",
    "anchors",
    "embeds",
    "plugins",
    "applets",

    "width",
    "height",

    "designMode",
    "compatMode",
    "async",
    "readyState",

    "preferredStyleSheetSet",
    "lastStyleSheetSet",
    "styleSheetSets",
    "selectedStyleSheetSet",
    "enableStyleSheetsForSet",

    "elementFromPoint",
    "hasFocus",
    "activeElement",

    /* These are also in domMemberMap.Element, but it reflects the real interface definition */
    "getElementsByClassName",
    "querySelector",
    "querySelectorAll",

    "alinkColor",
    "linkColor",
    "vlinkColor",
    "bgColor",
    "fgColor",
    "domain",

    "addEventListener",
    "removeEventListener",
    "dispatchEvent",
    "captureEvents",
    "releaseEvents",
    "routeEvent",
    "clear",
    "open",
    "close",
    "execCommand",
    "execCommandShowHelp",
    "getElementsByName",
    "getSelection",
    "queryCommandEnabled",
    "queryCommandIndeterm",
    "queryCommandState",
    "queryCommandSupported",
    "queryCommandText",
    "queryCommandValue",
    "write",
    "writeln",
    "adoptNode",
    "appendChild",
    "removeChild",
    "renameNode",
    "cloneNode",
    "compareDocumentPosition",
    "createAttribute",
    "createAttributeNS",
    "createCDATASection",
    "createComment",
    "createDocumentFragment",
    "createElement",
    "createElementNS",
    "createEntityReference",
    "createEvent",
    "createExpression",
    "createNSResolver",
    "createNodeIterator",
    "createProcessingInstruction",
    "createRange",
    "createTextNode",
    "createTreeWalker",
    "domConfig",
    "evaluate",
    "evaluateFIXptr",
    "evaluateXPointer",
    "getAnonymousElementByAttribute",
    "getAnonymousNodes",
    "addBinding",
    "removeBinding",
    "getBindingParent",
    "getBoxObjectFor",
    "setBoxObjectFor",
    "getElementById",
    "getElementsByTagName",
    "getElementsByTagNameNS",
    "hasAttributes",
    "hasChildNodes",
    "importNode",
    "insertBefore",
    "isDefaultNamespace",
    "isEqualNode",
    "isSameNode",
    "isSupported",
    "load",
    "loadBindingDocument",
    "lookupNamespaceURI",
    "lookupPrefix",
    "normalize",
    "normalizeDocument",
    "getFeature",
    "getUserData",
    "setUserData"
]);

domMemberMap.Element = extendArray(domMemberMap.Node,
[
    "clientWidth",
    "clientHeight",
    "offsetLeft",
    "offsetTop",
    "offsetWidth",
    "offsetHeight",
    "scrollLeft",
    "scrollTop",
    "scrollWidth",
    "scrollHeight",

    "style",

    "tabIndex",
    "title",
    "lang",
    "align",
    "spellcheck",

    "addEventListener",
    "removeEventListener",
    "dispatchEvent",
    "focus",
    "blur",
    "cloneNode",
    "appendChild",
    "insertBefore",
    "replaceChild",
    "removeChild",
    "compareDocumentPosition",
    "getElementsByTagName",
    "getElementsByTagNameNS",
    "getAttribute",
    "getAttributeNS",
    "getAttributeNode",
    "getAttributeNodeNS",
    "setAttribute",
    "setAttributeNS",
    "setAttributeNode",
    "setAttributeNodeNS",
    "removeAttribute",
    "removeAttributeNS",
    "removeAttributeNode",
    "hasAttribute",
    "hasAttributeNS",
    "hasAttributes",
    "hasChildNodes",
    "lookupNamespaceURI",
    "lookupPrefix",
    "normalize",
    "isDefaultNamespace",
    "isEqualNode",
    "isSameNode",
    "isSupported",
    "getFeature",
    "getUserData",
    "setUserData",

    "childElementCount",
    "children",
    "classList",
    "clientLeft",
    "clientTop",
    "contentEditable",
    "draggable",
    "firstElementChild",
    "lastElementChild",
    "nextElementSibling",
    "previousElementSibling",

    "getBoundingClientRect",
    "getClientRects",
    "getElementsByClassName",
    "mozMatchesSelector",
    "querySelector",
    "querySelectorAll",
    "scrollIntoView",

    "onLoad",//FF4.0
    "hidden",//FF4.0
    "setCapture",//FF4.0
    "releaseCapture"//FF4.0
]);

domMemberMap.SVGElement = extendArray(domMemberMap.Element,
[
    "x",
    "y",
    "width",
    "height",
    "rx",
    "ry",
    "transform",
    "href",

    "ownerSVGElement",
    "viewportElement",
    "farthestViewportElement",
    "nearestViewportElement",

    "getBBox",
    "getCTM",
    "getScreenCTM",
    "getTransformToElement",
    "getPresentationAttribute",
    "preserveAspectRatio"
]);

domMemberMap.SVGSVGElement = extendArray(domMemberMap.Element,
[
    "x",
    "y",
    "width",
    "height",
    "rx",
    "ry",
    "transform",

    "viewBox",
    "viewport",
    "currentView",
    "useCurrentView",
    "pixelUnitToMillimeterX",
    "pixelUnitToMillimeterY",
    "screenPixelToMillimeterX",
    "screenPixelToMillimeterY",
    "currentScale",
    "currentTranslate",
    "zoomAndPan",

    "ownerSVGElement",
    "viewportElement",
    "farthestViewportElement",
    "nearestViewportElement",
    "contentScriptType",
    "contentStyleType",

    "getBBox",
    "getCTM",
    "getScreenCTM",
    "getTransformToElement",
    "getEnclosureList",
    "getIntersectionList",
    "getViewboxToViewportTransform",
    "getPresentationAttribute",
    "getElementById",
    "checkEnclosure",
    "checkIntersection",
    "createSVGAngle",
    "createSVGLength",
    "createSVGMatrix",
    "createSVGNumber",
    "createSVGPoint",
    "createSVGRect",
    "createSVGString",
    "createSVGTransform",
    "createSVGTransformFromMatrix",
    "deSelectAll",
    "preserveAspectRatio",
    "forceRedraw",
    "suspendRedraw",
    "unsuspendRedraw",
    "unsuspendRedrawAll",
    "getCurrentTime",
    "setCurrentTime",
    "animationsPaused",
    "pauseAnimations",
    "unpauseAnimations"
]);

domMemberMap.HTMLImageElement = extendArray(domMemberMap.Element,
[
    "src",
    "naturalWidth",
    "naturalHeight",
    "width",
    "height",
    "x",
    "y",
    "name",
    "alt",
    "longDesc",
    "lowsrc",
    "border",
    "complete",
    "hspace",
    "vspace",
    "isMap",
    "useMap",
]);

domMemberMap.HTMLAnchorElement = extendArray(domMemberMap.Element,
[
    "name",
    "target",
    "accessKey",
    "href",
    "protocol",
    "host",
    "hostname",
    "port",
    "pathname",
    "search",
    "hash",
    "hreflang",
    "coords",
    "shape",
    "text",
    "type",
    "rel",
    "rev",
    "charset"
]);

domMemberMap.HTMLIFrameElement = extendArray(domMemberMap.Element,
[
    "contentDocument",
    "contentWindow",
    "frameBorder",
    "height",
    "longDesc",
    "marginHeight",
    "marginWidth",
    "name",
    "scrolling",
    "src",
    "width"
]);

domMemberMap.HTMLTableElement = extendArray(domMemberMap.Element,
[
    "bgColor",
    "border",
    "caption",
    "cellPadding",
    "cellSpacing",
    "frame",
    "rows",
    "rules",
    "summary",
    "tBodies",
    "tFoot",
    "tHead",
    "width",

    "createCaption",
    "createTFoot",
    "createTHead",
    "deleteCaption",
    "deleteRow",
    "deleteTFoot",
    "deleteTHead",
    "insertRow"
]);

domMemberMap.HTMLTableRowElement = extendArray(domMemberMap.Element,
[
    "bgColor",
    "cells",
    "ch",
    "chOff",
    "rowIndex",
    "sectionRowIndex",
    "vAlign",

    "deleteCell",
    "insertCell"
]);

domMemberMap.HTMLTableCellElement = extendArray(domMemberMap.Element,
[
    "abbr",
    "axis",
    "bgColor",
    "cellIndex",
    "ch",
    "chOff",
    "colSpan",
    "headers",
    "height",
    "noWrap",
    "rowSpan",
    "scope",
    "vAlign",
    "width"

]);

domMemberMap.HTMLScriptElement = extendArray(domMemberMap.Element,
[
    "src"
]);

domMemberMap.HTMLButtonElement = extendArray(domMemberMap.Element,
[
    "accessKey",
    "disabled",
    "form",
    "name",
    "type",
    "value",

    "click"
]);

domMemberMap.HTMLInputElement = extendArray(domMemberMap.Element,
[
    "type",
    "value",
    "checked",
    "accept",
    "accessKey",
    "alt",
    "autocomplete",
    "autofocus",
    "controllers",
    "defaultChecked",
    "defaultValue",
    "disabled",
    "form",
    "formAction",
    "formEnctype",
    "formMethod",
    "formNoValidate",
    "formTarget",
    "maxLength",
    "name",
    "readOnly",
    "selectionEnd",
    "selectionStart",
    "size",
    "src",
    "textLength",
    "useMap",

    "files",
    "indeterminate",
    "multiple",
    "list",
    "mozGetFileNameArray",
    "mozSetFileNameArray",

    "pattern",
    "placeholder",
    "required",

    "click",
    "select",
    "setSelectionRange"
]);

domMemberMap.HTMLFormElement = extendArray(domMemberMap.Element,
[
    "acceptCharset",
    "action",
    "author",
    "elements",
    "encoding",
    "enctype",
    "entry_id",
    "length",
    "method",
    "name",
    "post",
    "target",
    "text",
    "url",

    "reset",
    "submit"
]);

domMemberMap.HTMLBodyElement = extendArray(domMemberMap.Element,
[
    "aLink",
    "background",
    "bgColor",
    "link",
    "text",
    "vLink"
]);

domMemberMap.HTMLHtmlElement = extendArray(domMemberMap.Element,
[
    "version"
]);

domMemberMap.Text = extendArray(domMemberMap.Node,
[
    "data",
    "length",

    "appendData",
    "deleteData",
    "insertData",
    "replaceData",
    "splitText",
    "substringData"
]);

domMemberMap.Attr = extendArray(domMemberMap.Node,
[
    "name",
    "value",
    "specified",
    "ownerElement"
]);

domMemberMap.Event =
[
    "type",
    "target",
    "currentTarget",
    "originalTarget",
    "explicitOriginalTarget",
    "relatedTarget",
    "rangeParent",
    "rangeOffset",
    "view",

    "keyCode",
    "charCode",
    "screenX",
    "screenY",
    "clientX",
    "clientY",
    "layerX",
    "layerY",
    "pageX",
    "pageY",

    "detail",
    "button",
    "which",
    "ctrlKey",
    "shiftKey",
    "altKey",
    "metaKey",

    "eventPhase",
    "timeStamp",
    "bubbles",
    "cancelable",
    "cancelBubble",

    "isTrusted",
    "isChar",

    "getPreventDefault",
    "initEvent",
    "initMouseEvent",
    "initKeyEvent",
    "initUIEvent",
    "preventBubble",
    "preventCapture",
    "preventDefault",
    "stopPropagation"
];

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

var domConstantMap = DOM.domConstantMap =
{
    "ELEMENT_NODE": 1,
    "ATTRIBUTE_NODE": 1,
    "TEXT_NODE": 1,
    "CDATA_SECTION_NODE": 1,
    "ENTITY_REFERENCE_NODE": 1,
    "ENTITY_NODE": 1,
    "PROCESSING_INSTRUCTION_NODE": 1,
    "COMMENT_NODE": 1,
    "DOCUMENT_NODE": 1,
    "DOCUMENT_TYPE_NODE": 1,
    "DOCUMENT_FRAGMENT_NODE": 1,
    "NOTATION_NODE": 1,

    "DOCUMENT_POSITION_DISCONNECTED": 1,
    "DOCUMENT_POSITION_PRECEDING": 1,
    "DOCUMENT_POSITION_FOLLOWING": 1,
    "DOCUMENT_POSITION_CONTAINS": 1,
    "DOCUMENT_POSITION_CONTAINED_BY": 1,
    "DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC": 1,

    "UNKNOWN_RULE": 1,
    "STYLE_RULE": 1,
    "CHARSET_RULE": 1,
    "IMPORT_RULE": 1,
    "MEDIA_RULE": 1,
    "FONT_FACE_RULE": 1,
    "PAGE_RULE": 1,

    "CAPTURING_PHASE": 1,
    "AT_TARGET": 1,
    "BUBBLING_PHASE": 1,

    "SCROLL_PAGE_UP": 1,
    "SCROLL_PAGE_DOWN": 1,

    "MOUSEUP": 1,
    "MOUSEDOWN": 1,
    "MOUSEOVER": 1,
    "MOUSEOUT": 1,
    "MOUSEMOVE": 1,
    "MOUSEDRAG": 1,
    "CLICK": 1,
    "DBLCLICK": 1,
    "KEYDOWN": 1,
    "KEYUP": 1,
    "KEYPRESS": 1,
    "DRAGDROP": 1,
    "FOCUS": 1,
    "BLUR": 1,
    "SELECT": 1,
    "CHANGE": 1,
    "RESET": 1,
    "SUBMIT": 1,
    "SCROLL": 1,
    "LOAD": 1,
    "UNLOAD": 1,
    "XFER_DONE": 1,
    "ABORT": 1,
    "ERROR": 1,
    "LOCATE": 1,
    "MOVE": 1,
    "RESIZE": 1,
    "FORWARD": 1,
    "HELP": 1,
    "BACK": 1,
    "TEXT": 1,

    "ALT_MASK": 1,
    "CONTROL_MASK": 1,
    "SHIFT_MASK": 1,
    "META_MASK": 1,

    "DOM_VK_TAB": 1,
    "DOM_VK_PAGE_UP": 1,
    "DOM_VK_PAGE_DOWN": 1,
    "DOM_VK_UP": 1,
    "DOM_VK_DOWN": 1,
    "DOM_VK_LEFT": 1,
    "DOM_VK_RIGHT": 1,
    "DOM_VK_CANCEL": 1,
    "DOM_VK_HELP": 1,
    "DOM_VK_BACK_SPACE": 1,
    "DOM_VK_CLEAR": 1,
    "DOM_VK_RETURN": 1,
    "DOM_VK_ENTER": 1,
    "DOM_VK_SHIFT": 1,
    "DOM_VK_CONTROL": 1,
    "DOM_VK_ALT": 1,
    "DOM_VK_PAUSE": 1,
    "DOM_VK_CAPS_LOCK": 1,
    "DOM_VK_ESCAPE": 1,
    "DOM_VK_SPACE": 1,
    "DOM_VK_END": 1,
    "DOM_VK_HOME": 1,
    "DOM_VK_PRINTSCREEN": 1,
    "DOM_VK_INSERT": 1,
    "DOM_VK_DELETE": 1,
    "DOM_VK_0": 1,
    "DOM_VK_1": 1,
    "DOM_VK_2": 1,
    "DOM_VK_3": 1,
    "DOM_VK_4": 1,
    "DOM_VK_5": 1,
    "DOM_VK_6": 1,
    "DOM_VK_7": 1,
    "DOM_VK_8": 1,
    "DOM_VK_9": 1,
    "DOM_VK_SEMICOLON": 1,
    "DOM_VK_EQUALS": 1,
    "DOM_VK_A": 1,
    "DOM_VK_B": 1,
    "DOM_VK_C": 1,
    "DOM_VK_D": 1,
    "DOM_VK_E": 1,
    "DOM_VK_F": 1,
    "DOM_VK_G": 1,
    "DOM_VK_H": 1,
    "DOM_VK_I": 1,
    "DOM_VK_J": 1,
    "DOM_VK_K": 1,
    "DOM_VK_L": 1,
    "DOM_VK_M": 1,
    "DOM_VK_N": 1,
    "DOM_VK_O": 1,
    "DOM_VK_P": 1,
    "DOM_VK_Q": 1,
    "DOM_VK_R": 1,
    "DOM_VK_S": 1,
    "DOM_VK_T": 1,
    "DOM_VK_U": 1,
    "DOM_VK_V": 1,
    "DOM_VK_W": 1,
    "DOM_VK_X": 1,
    "DOM_VK_Y": 1,
    "DOM_VK_Z": 1,
    "DOM_VK_CONTEXT_MENU": 1,
    "DOM_VK_NUMPAD0": 1,
    "DOM_VK_NUMPAD1": 1,
    "DOM_VK_NUMPAD2": 1,
    "DOM_VK_NUMPAD3": 1,
    "DOM_VK_NUMPAD4": 1,
    "DOM_VK_NUMPAD5": 1,
    "DOM_VK_NUMPAD6": 1,
    "DOM_VK_NUMPAD7": 1,
    "DOM_VK_NUMPAD8": 1,
    "DOM_VK_NUMPAD9": 1,
    "DOM_VK_MULTIPLY": 1,
    "DOM_VK_ADD": 1,
    "DOM_VK_SEPARATOR": 1,
    "DOM_VK_SUBTRACT": 1,
    "DOM_VK_DECIMAL": 1,
    "DOM_VK_DIVIDE": 1,
    "DOM_VK_F1": 1,
    "DOM_VK_F2": 1,
    "DOM_VK_F3": 1,
    "DOM_VK_F4": 1,
    "DOM_VK_F5": 1,
    "DOM_VK_F6": 1,
    "DOM_VK_F7": 1,
    "DOM_VK_F8": 1,
    "DOM_VK_F9": 1,
    "DOM_VK_F10": 1,
    "DOM_VK_F11": 1,
    "DOM_VK_F12": 1,
    "DOM_VK_F13": 1,
    "DOM_VK_F14": 1,
    "DOM_VK_F15": 1,
    "DOM_VK_F16": 1,
    "DOM_VK_F17": 1,
    "DOM_VK_F18": 1,
    "DOM_VK_F19": 1,
    "DOM_VK_F20": 1,
    "DOM_VK_F21": 1,
    "DOM_VK_F22": 1,
    "DOM_VK_F23": 1,
    "DOM_VK_F24": 1,
    "DOM_VK_NUM_LOCK": 1,
    "DOM_VK_SCROLL_LOCK": 1,
    "DOM_VK_COMMA": 1,
    "DOM_VK_PERIOD": 1,
    "DOM_VK_SLASH": 1,
    "DOM_VK_BACK_QUOTE": 1,
    "DOM_VK_OPEN_BRACKET": 1,
    "DOM_VK_BACK_SLASH": 1,
    "DOM_VK_CLOSE_BRACKET": 1,
    "DOM_VK_QUOTE": 1,
    "DOM_VK_META": 1,

    "SVG_ZOOMANDPAN_DISABLE": 1,
    "SVG_ZOOMANDPAN_MAGNIFY": 1,
    "SVG_ZOOMANDPAN_UNKNOWN": 1
};

// ********************************************************************************************* //
// Registration

return DOM;

// ********************************************************************************************* //
});
