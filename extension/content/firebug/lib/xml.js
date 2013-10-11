/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/string"
],
function(FBTrace, Str) {

"use strict";

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;

var Xml = {};

// ********************************************************************************************* //
// HTML tag data

var htmlTagAttributes;
var htmlTagAttributesMap;
var htmlCommonAttributes;
var htmlCommonAttributesMap;

(function() {
    // Raw data taken from CodeMirror, available under MIT license:
    // https://github.com/marijnh/CodeMirror/blob/022bc2862faa2997/addon/hint/html-hint.js

    // START CodeMirror code

    var langs = "ab aa af ak sq am ar an hy as av ae ay az bm ba eu be bn bh bi bs br bg my ca ch ce ny zh cv kw co cr hr cs da dv nl dz en eo et ee fo fj fi fr ff gl ka de el gn gu ht ha he hz hi ho hu ia id ie ga ig ik io is it iu ja jv kl kn kr ks kk km ki rw ky kv kg ko ku kj la lb lg li ln lo lt lu lv gv mk mg ms ml mt mi mr mh mn na nv nb nd ne ng nn no ii nr oc oj cu om or os pa pi fa pl ps pt qu rm rn ro ru sa sc sd se sm sg sr gd sn si sk sl so st es su sw ss sv ta te tg th ti bo tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa cy wo fy xh yi yo za zu".split(" ");
    var targets = ["_blank", "_self", "_top", "_parent"];
    var charsets = ["ascii", "utf-8", "utf-16", "latin1", "latin1"];
    var methods = ["get", "post", "put", "delete"];
    var encs = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];
    var media = ["all", "screen", "print", "embossed", "braille", "handheld", "print", "projection", "screen", "tty", "tv", "speech",
    "3d-glasses", "resolution [>][<][=] [X]", "device-aspect-ratio: X/Y", "orientation:portrait",
    "orientation:landscape", "device-height: [X]", "device-width: [X]"];
    var s = { attrs: {} }; // Simple tag, reused for a whole lot of tags

    var data = {
        a: {
            attrs: {
                href: null, ping: null, type: null,
                media: media,
                target: targets,
                hreflang: langs
            }
        },
        abbr: s,
        acronym: s,
        address: s,
        applet: s,
        area: {
            attrs: {
                alt: null, coords: null, href: null, target: null, ping: null,
                media: media, hreflang: langs, type: null,
                shape: ["default", "rect", "circle", "poly"]
            }
        },
        article: s,
        aside: s,
        audio: {
            attrs: {
                src: null, mediagroup: null,
                crossorigin: ["anonymous", "use-credentials"],
                preload: ["none", "metadata", "auto"],
                autoplay: ["", "autoplay"],
                loop: ["", "loop"],
                controls: ["", "controls"]
            }
        },
        b: s,
        base: { attrs: { href: null, target: targets } },
        basefont: s,
        bdi: s,
        bdo: s,
        big: s,
        blockquote: { attrs: { cite: null } },
        body: s,
        br: s,
        button: {
            attrs: {
                form: null, formaction: null, name: null, value: null,
                autofocus: ["", "autofocus"],
                disabled: ["", "autofocus"],
                formenctype: encs,
                formmethod: methods,
                formnovalidate: ["", "novalidate"],
                formtarget: targets,
                type: ["submit", "reset", "button"]
            }
        },
        canvas: { attrs: { width: null, height: null } },
        caption: s,
        center: s,
        cite: s,
        code: s,
        col: { attrs: { span: null } },
        colgroup: { attrs: { span: null } },
        command: {
            attrs: {
                type: ["command", "checkbox", "radio"],
                label: null, icon: null, radiogroup: null, command: null, title: null,
                disabled: ["", "disabled"],
                checked: ["", "checked"]
            }
        },
        data: { attrs: { value: null } },
        datagrid: { attrs: { disabled: ["", "disabled"], multiple: ["", "multiple"] } },
        datalist: { attrs: { data: null } },
        dd: s,
        del: { attrs: { cite: null, datetime: null } },
        details: { attrs: { open: ["", "open"] } },
        dfn: s,
        dir: s,
        div: s,
        dl: s,
        dt: s,
        em: s,
        embed: { attrs: { src: null, type: null, width: null, height: null } },
        eventsource: { attrs: { src: null } },
        fieldset: { attrs: { disabled: ["", "disabled"], form: null, name: null } },
        figcaption: s,
        figure: s,
        font: s,
        footer: s,
        form: {
            attrs: {
                action: null, name: null,
                "accept-charset": charsets,
                autocomplete: ["on", "off"],
                enctype: encs,
                method: methods,
                novalidate: ["", "novalidate"],
                target: targets
            }
        },
        frame: s,
        frameset: s,
        h1: s, h2: s, h3: s, h4: s, h5: s, h6: s,
        head: {
            attrs: {},
            children: ["title", "base", "link", "style", "meta", "script", "noscript", "command"]
        },
        header: s,
        hgroup: s,
        hr: s,
        html: {
            attrs: { manifest: null },
            children: ["head", "body"]
        },
        i: s,
        iframe: {
            attrs: {
                src: null, srcdoc: null, name: null, width: null, height: null,
                sandbox: ["allow-top-navigation", "allow-same-origin", "allow-forms", "allow-scripts"],
                seamless: ["", "seamless"]
            }
        },
        img: {
            attrs: {
                alt: null, src: null, ismap: null, usemap: null, width: null, height: null,
                crossorigin: ["anonymous", "use-credentials"]
            }
        },
        input: {
            attrs: {
                alt: null, dirname: null, form: null, formaction: null,
                height: null, list: null, max: null, maxlength: null, min: null,
                name: null, pattern: null, placeholder: null, size: null, src: null,
                step: null, value: null, width: null,
                accept: ["audio/*", "video/*", "image/*"],
                autocomplete: ["on", "off"],
                autofocus: ["", "autofocus"],
                checked: ["", "checked"],
                disabled: ["", "disabled"],
                formenctype: encs,
                formmethod: methods,
                formnovalidate: ["", "novalidate"],
                formtarget: targets,
                multiple: ["", "multiple"],
                readonly: ["", "readonly"],
                required: ["", "required"],
                type: ["hidden", "text", "search", "tel", "url", "email", "password", "datetime", "date", "month",
                "week", "time", "datetime-local", "number", "range", "color", "checkbox", "radio",
                "file", "submit", "image", "reset", "button"]
            }
        },
        ins: { attrs: { cite: null, datetime: null } },
        kbd: s,
        keygen: {
            attrs: {
                challenge: null, form: null, name: null,
                autofocus: ["", "autofocus"],
                disabled: ["", "disabled"],
                keytype: ["RSA"]
            }
        },
        label: { attrs: { "for": null, form: null } },
        legend: s,
        li: { attrs: { value: null } },
        link: {
            attrs: {
                href: null, type: null,
                hreflang: langs,
                media: media,
                sizes: ["all", "16x16", "16x16 32x32", "16x16 32x32 64x64"]
            }
        },
        map: { attrs: { name: null } },
        mark: s,
        menu: { attrs: { label: null, type: ["list", "context", "toolbar"] } },
        meta: {
            attrs: {
                content: null,
                charset: charsets,
                name: ["viewport", "application-name", "author", "description", "generator", "keywords"],
                "http-equiv": ["content-language", "content-type", "default-style", "refresh"]
            }
        },
        meter: { attrs: { value: null, min: null, low: null, high: null, max: null, optimum: null } },
        nav: s,
        noframes: s,
        noscript: s,
        object: {
            attrs: {
                data: null, type: null, name: null, usemap: null, form: null, width: null, height: null,
                typemustmatch: ["", "typemustmatch"]
            }
        },
        ol: { attrs: { reversed: ["", "reversed"], start: null, type: ["1", "a", "A", "i", "I"] } },
        optgroup: { attrs: { disabled: ["", "disabled"], label: null } },
        option: { attrs: { disabled: ["", "disabled"], label: null, selected: ["", "selected"], value: null } },
        output: { attrs: { "for": null, form: null, name: null } },
        p: s,
        param: { attrs: { name: null, value: null } },
        pre: s,
        progress: { attrs: { value: null, max: null } },
        q: { attrs: { cite: null } },
        rp: s,
        rt: s,
        ruby: s,
        s: s,
        samp: s,
        script: {
            attrs: {
                type: ["text/javascript"],
                src: null,
                async: ["", "async"],
                defer: ["", "defer"],
                charset: charsets
            }
        },
        section: s,
        select: {
            attrs: {
                form: null, name: null, size: null,
                autofocus: ["", "autofocus"],
                disabled: ["", "disabled"],
                multiple: ["", "multiple"]
            }
        },
        small: s,
        source: { attrs: { src: null, type: null, media: null } },
        span: s,
        strike: s,
        strong: s,
        style: {
            attrs: {
                type: ["text/css"],
                media: media,
                scoped: null
            }
        },
        sub: s,
        summary: s,
        sup: s,
        table: s,
        tbody: s,
        td: { attrs: { colspan: null, rowspan: null, headers: null } },
        textarea: {
            attrs: {
                dirname: null, form: null, maxlength: null, name: null, placeholder: null,
                rows: null, cols: null,
                autofocus: ["", "autofocus"],
                disabled: ["", "disabled"],
                readonly: ["", "readonly"],
                required: ["", "required"],
                wrap: ["soft", "hard"]
            }
        },
        tfoot: s,
        th: { attrs: { colspan: null, rowspan: null, headers: null, scope: ["row", "col", "rowgroup", "colgroup"] } },
        thead: s,
        time: { attrs: { datetime: null } },
        title: s,
        tr: s,
        track: {
            attrs: {
                src: null, label: null, "default": null,
                kind: ["subtitles", "captions", "descriptions", "chapters", "metadata"],
                srclang: langs
            }
        },
        tt: s,
        u: s,
        ul: s,
        "var": s,
        video: {
            attrs: {
                src: null, poster: null, width: null, height: null,
                crossorigin: ["anonymous", "use-credentials"],
                preload: ["auto", "metadata", "none"],
                autoplay: ["", "autoplay"],
                mediagroup: ["movie"],
                muted: ["", "muted"],
                controls: ["", "controls"]
            }
        },
        wbr: s
    };

    var globalAttrs = {
        accesskey: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
        "class": null,
        contenteditable: ["true", "false"],
        contextmenu: null,
        dir: ["ltr", "rtl", "auto"],
        draggable: ["true", "false", "auto"],
        dropzone: ["copy", "move", "link", "string:", "file:"],
        hidden: ["hidden"],
        id: null,
        inert: ["inert"],
        itemid: null,
        itemprop: null,
        itemref: null,
        itemscope: ["itemscope"],
        itemtype: null,
        lang: ["en", "es"],
        spellcheck: ["true", "false"],
        style: null,
        tabindex: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
        title: null,
        translate: ["yes", "no"],
        onclick: null,
        rel: ["stylesheet", "alternate", "author", "bookmark", "help", "license", "next", "nofollow", "noreferrer", "prefetch", "prev", "search", "tag"]
    };

    // END CodeMirror code

    // Add some event handlers.
    [
        "onload", "onabort", "onblur", "onchange", "onclick", "ondblclick",
        "onerror", "onfocus", "onkeydown", "onkeypress", "onkeyup",
        "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup",
        "onreset", "onselect", "onsubmit", "onunload"
    ].forEach(function(attr)
    {
        globalAttrs[attr] = null;
    });

    // Tweak values a little.
    data.link.attrs.crossorigin = ["anonymous", "use-credentials"];
    data.meta.attrs["http-equiv"] = ["Content-Language", "Content-Type", "Default-Style", "Refresh"];
    globalAttrs.lang = langs;
    globalAttrs.tabindex = null;
    delete data.iframe.attrs.seamless;

    htmlCommonAttributesMap = globalAttrs;
    htmlCommonAttributes = Object.keys(htmlCommonAttributesMap).sort();
    htmlTagAttributesMap = {};
    htmlTagAttributes = {};
    for (var tag in data)
    {
        htmlTagAttributesMap[tag] = data[tag].attrs;
        htmlTagAttributes[tag] = Object.keys(data[tag].attrs).sort();
    }
})();

Xml.getAttributesForTagName = function(nodeType, tagName)
{
    if (nodeType == "html")
    {
        var ret = [];
        if (htmlTagAttributes.hasOwnProperty(tagName))
            ret = ret.concat(htmlTagAttributes[tagName]);
        ret = ret.concat(htmlCommonAttributes);
        return ret;
    }
    return [];
};

Xml.getValuesForAttribute = function(nodeType, tagName, attribute)
{
    if (nodeType == "html")
    {
        if (htmlCommonAttributesMap.hasOwnProperty(attribute))
            return htmlCommonAttributesMap[attribute] || [];
        if (htmlTagAttributes.hasOwnProperty(tagName) &&
            htmlTagAttributesMap[tagName].hasOwnProperty(attribute))
        {
            return htmlTagAttributesMap[tagName][attribute] || [];
        }
        return [];
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
