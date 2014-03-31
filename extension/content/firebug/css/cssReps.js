/* See license.txt for terms of usage */

define([
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/domplate",
    "firebug/lib/fonts",
    "firebug/lib/locale",
    "firebug/lib/object",
    "firebug/lib/string",
    "firebug/chrome/infotip",
],
function(Css, Dom, Domplate, Fonts, Locale, Obj, Str, InfoTip) {

// ********************************************************************************************* //
// Constants

var {domplate, FOR, TAG, DIV, SPAN, A, TR, P, IMG, STYLE} = Domplate;

const maxWidth = 100;
const maxHeight = 80;

// ********************************************************************************************* //

var CSSInfoTip = Obj.extend(InfoTip,
{
    dispatchName: "cssInfoTip",

    tags: domplate(
    {
        infoTipTag: DIV({"class": "infoTip"}),

        colorTag:
            DIV({"class": "infoTipColorBox"},
                DIV({style: "background: $rgbValue; width: 100px; height: 40px;"})
            ),

        imgTag:
            DIV({"class": "infoTipImageBox infoTipLoading"},
                IMG({"class": "infoTipImage", src: "$urlValue", "data-repeat": "$repeat",
                    onload: "$onLoadImage", onerror: "$onErrorImage"}),
                DIV({"class": "infoTipBgImage", collapsed: true}),
                DIV({"class": "infoTipCaption"})
            ),

        fontFamilyTag:
            DIV({"class": "infoTipFontFamilyBox"},
                STYLE({"class": "infoTipFontFamilyStyle"}),
                DIV({"class": "infoTipFontFamilySample"},
                    FOR("fontStyle", "$fontStyles",
                        DIV({"class": "infoTipFontFace", style: "$fontStyle"},
                            Locale.$STR("css.fontFamilyPreview"))
                    )
                )
            ),

        onLoadImage: function(event)
        {
            var img = event.currentTarget;
            var bgImg = img.nextSibling;
            if (!bgImg)
                return; // Sometimes gets called after element is dead

            var caption = bgImg.nextSibling;
            var innerBox = img.parentNode;

            var w = img.naturalWidth;
            var h = img.naturalHeight;
            var repeat = img.dataset.repeat;

            if (repeat == "repeat-x" || (w == 1 && h > 1))
            {
                Dom.collapse(img, true);
                Dom.collapse(bgImg, false);
                bgImg.style.background = "url(" + img.src + ") repeat-x";
                bgImg.style.width = maxWidth + "px";
                if (h > maxHeight)
                    bgImg.style.height = maxHeight + "px";
                else
                    bgImg.style.height = h + "px";
            }
            else if (repeat == "repeat-y" || (h == 1 && w > 1))
            {
                Dom.collapse(img, true);
                Dom.collapse(bgImg, false);
                bgImg.style.background = "url(" + img.src + ") repeat-y";
                bgImg.style.height = maxHeight + "px";
                if (w > maxWidth)
                    bgImg.style.width = maxWidth + "px";
                else
                    bgImg.style.width = w + "px";
            }
            else if (repeat == "repeat" || (w == 1 && h == 1))
            {
                Dom.collapse(img, true);
                Dom.collapse(bgImg, false);
                bgImg.style.background = "url(" + img.src + ") repeat";
                bgImg.style.width = maxWidth + "px";
                bgImg.style.height = maxHeight + "px";
            }
            else
            {
                if (w > maxWidth || h > maxHeight)
                {
                    if (w > h)
                    {
                        img.style.width = maxWidth + "px";
                        img.style.height = Math.round((h / w) * maxWidth) + "px";
                    }
                    else
                    {
                        img.style.width = Math.round((w / h) * maxHeight) + "px";
                        img.style.height = maxHeight + "px";
                    }
                }
            }

            caption.textContent = Locale.$STRF("Dimensions", [w, h]);

            Css.removeClass(innerBox, "infoTipLoading");
        },

        onErrorImage: function(event)
        {
            var img = event.currentTarget;
            var bgImg = img.nextSibling;
            if (!bgImg)
                return;

            var caption = bgImg.nextSibling;

            // Display an error in the caption (instead of dimensions).
            if (Str.hasPrefix(img.src, "moz-filedata"))
                caption.textContent = Locale.$STR("firebug.failedToPreviewObjectURL");
            else
                caption.textContent = Locale.$STR("firebug.failedToPreviewImageURL");

            var innerBox = img.parentNode;
            Css.removeClass(innerBox, "infoTipLoading");
        }
    }),

    populateFontFamilyInfoTip: function(infoTip, fontName)
    {
        var fontStyles = [
           "font-size:12px;",
           "font-weight:bold; font-size:12px;",
           "font-style:italic; font-size:12px;",
           "font-size:14px;",
           "font-size:18px;"
        ];

        var fontObject = Fonts.getFontInfo(null, null,
            fontName.replace(/^(["'])?(.*?)\1$/g, "$2"));

        if (FBTrace.DBG_INFOTIP)
        {
            FBTrace.sysout("infotip.populateFontFamilyInfoTip;", {fontName: fontName,
                fontObject: fontObject});
        }

        var node = this.tags.fontFamilyTag.replace({fontStyles: fontStyles, fontName: fontName,
            fontObject: fontObject}, infoTip);
        var styleNode = node.getElementsByClassName("infoTipFontFamilyStyle").item(0);

        styleNode.textContent = getFontFaceCSS(fontObject ? fontObject : fontName);
        return true;
    },

    populateColorInfoTip: function(infoTip, color)
    {
        this.tags.colorTag.replace({rgbValue: color}, infoTip);
        return true;
    },

    populateImageInfoTip: function(infoTip, url, repeat)
    {
        if (!repeat)
            repeat = "no-repeat";

        this.tags.imgTag.replace({urlValue: url, repeat: repeat}, infoTip);

        return true;
    }
});

var CSSDomplateBase =
{
    isEditable: function(rule)
    {
        return !rule.isSystemSheet && !rule.isNotEditable;
    },

    isSelectorEditable: function(rule)
    {
        return rule.isSelectorEditable && this.isEditable(rule);
    },

    getPropertyValue: function(prop)
    {
        // Disabled, see http://code.google.com/p/fbug/issues/detail?id=5880
        /*
        var limit = Options.get("stringCropLength");
        */
        var limit = 0;
        if (limit > 0)
            return Str.cropString(prop.value, limit);
        return prop.value;
    }
};

var CSSPropTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssProp focusRow", $disabledStyle: "$prop.disabled",
            $editGroup: "$rule|isEditable",
            $cssOverridden: "$prop.overridden",
            role: "option"},

            // Use spaces for indent to make "copy to clipboard" nice.
            SPAN({"class": "cssPropIndent"}, "&nbsp;&nbsp;&nbsp;&nbsp;"),
            SPAN({"class": "cssPropName", $editable: "$rule|isEditable"},
                "$prop.name"
            ),

            // Use a space here, so that "copy to clipboard" has it (issue 3266).
            SPAN({"class": "cssColon"}, ": "),
            SPAN({"class": "cssPropValue", $editable: "$rule|isEditable"},
                "$prop|getPropertyValue$prop.important"
            ),
            SPAN({"class": "cssSemi"}, ";")
        )
});

var CSSRuleTag =
    TAG("$rule.tag", {rule: "$rule"});

var CSSImportRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule insertInto focusRow importRule", _repObject: "$rule.rule"},
        "@import &quot;",
        A({"class": "objectLink", _repObject: "$rule.rule.styleSheet"}, "$rule.rule.href"),
        "&quot;",
        SPAN({"class": "separator"}, "$rule.rule|getSeparator"),
        SPAN({"class": "cssMediaQuery", $editable: "$rule|isEditable"},
            "$rule.rule.media.mediaText"),
        ";"
    ),

    getSeparator: function(rule)
    {
        return rule.media.mediaText == "" ? "" : " ";
    }
});

var CSSCharsetRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule focusRow cssCharsetRule", _repObject: "$rule.rule"},
            SPAN({"class": "cssRuleName"}, "@charset"),
            "&nbsp;&quot;",
            SPAN({"class": "cssRuleValue", $editable: "$rule|isEditable"}, "$rule.rule.encoding"),
            "&quot;;"
        )
});

var CSSMediaRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule focusRow cssMediaRule", _repObject: "$rule.rule"},
            DIV({"class": "cssHead focusRow", role : "listitem"},
                SPAN({"class": "cssRuleName"}, "@media"),
                SPAN({"class": "separator"}, " "),
                SPAN({"class": "cssMediaRuleCondition", $editable: "$rule|isEditable"},
                    "$rule.rule.conditionText"),
                SPAN(" {")
            ),
            DIV({"class": "cssRulesListBox", role: "listbox"},
                FOR("subRule", "$rule.subRules",
                    TAG("$subRule.tag", {rule: "$subRule"})
                )
            ),
            DIV({$editable: "$rule|isEditable", $insertBefore:"$rule|isEditable",
                role:"presentation"},
                "}")
        )
});

var CSSSupportsRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule focusRow cssSupportsRule", _repObject: "$rule.rule"},
            DIV({"class": "cssHead focusRow", role : "listitem"},
                SPAN({"class": "cssRuleName"}, "@supports"),
                SPAN({"class": "separator"}, " "),
                SPAN({"class": "cssSupportsRuleCondition", $editable: "$rule|isEditable"},
                "$rule.rule.conditionText"),
                SPAN(" {")
            ),
            DIV({"class": "cssRulesListBox", role: "listbox"},
                FOR("subRule", "$rule.subRules",
                    TAG("$subRule.tag", {rule: "$subRule"})
                )
            ),
            DIV({$editable: "$rule|isEditable", $insertBefore:"$rule|isEditable",
                role:"presentation"},
            "}")
        )
});

var CSSKeyframesRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule focusRow cssKeyframesRule", _repObject: "$rule.rule"},
            DIV({"class": "cssHead focusRow", role : "listitem"},
                SPAN({"class": "cssRuleName"}, "@keyframes"),
                SPAN({"class": "separator"}, " "),
                SPAN({"class": "cssKeyframesRuleName", $editable: "$rule|isEditable"},
                "$rule.rule.name"),
                SPAN(" {")
            ),
            DIV({"class": "cssRulesListBox", role: "listbox"},
                FOR("subRule", "$rule.subRules",
                    TAG("$subRule.tag", {rule: "$subRule"})
                )
            ),
            DIV({role:"presentation"},
                "}")
        )
});

var CSSKeyframeRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule",
                $cssEditableRule: "$rule|isEditable",
                $insertInto: "$rule|isEditable",
                $editGroup: "$rule|isSelectorEditable",
                _repObject: "$rule.rule",
                role: "presentation"},
            DIV({"class": "cssHead focusRow", role: "listitem"},
                SPAN({"class": "cssKeyText", $editable: "$rule|isEditable"},
                    "$rule.rule.keyText"),
                " {"
            ),
            DIV({role: "group"},
                DIV({"class": "cssPropertyListBox", _rule: "$rule", role: "listbox"},
                    FOR("prop", "$rule.props",
                        TAG(CSSPropTag.tag, {rule: "$rule", prop: "$prop"})
                    )
                )
            ),
            DIV({$editable: "$rule|isEditable", $insertBefore: "$rule|isEditable",
                role:"presentation"},
                "}"
            )
        )
});

var CSSNamespaceRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule focusRow cssNamespaceRule", _repObject: "$rule.rule"},
            SPAN({"class": "cssRuleName"}, "@namespace"),
            SPAN({"class": "separator"}, "$rule.prefix|getSeparator"),
            SPAN({"class": "cssNamespacePrefix", $editable: "$rule|isEditable"}, "$rule.prefix"),
            "&nbsp;&quot;",
            SPAN({"class": "cssNamespaceName", $editable: "$rule|isEditable"}, "$rule.name"),
            "&quot;;"
        ),

    getSeparator: function(prefix)
    {
        return prefix == "" ? "" : " ";
    }
});

var CSSFontFaceRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule cssFontFaceRule",
            $cssEditableRule: "$rule|isEditable",
            $insertInto: "$rule|isEditable",
            _repObject: "$rule.rule",
            role : 'presentation'},
            DIV({"class": "cssHead focusRow", role : "listitem"}, "@font-face {"),
            DIV({role : "group"},
                DIV({"class": "cssPropertyListBox", role: "listbox"},
                    FOR("prop", "$rule.props",
                        TAG(CSSPropTag.tag, {rule: "$rule", prop: "$prop"})
                    )
                )
            ),
            DIV({$editable: "$rule|isEditable", $insertBefore:"$rule|isEditable",
                role:"presentation"},
                "}"
            )
        )
});

var CSSPageRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule focusRow cssPageRule", _repObject: "$rule.rule"},
            DIV({"class": "cssHead focusRow", role : "listitem"},
                SPAN({"class": "cssRuleName"}, "@page"),
                SPAN({"class": "separator"}, "$rule.selectorText|getSeparator"),
                SPAN({"class": "cssPageRuleSelector", $editable: "$rule|isEditable"},
                    "$rule.selectorText|getSelectorText"),
                SPAN(" {")
            ),
            DIV({role : "group"},
                DIV({"class": "cssPropertyListBox", role: "listbox"},
                    FOR("prop", "$rule.props",
                        TAG(CSSPropTag.tag, {rule: "$rule", prop: "$prop"})
                    )
                )
            ),
            DIV({$editable: "$rule|isEditable", $insertBefore:"$rule|isEditable",
                role:"presentation"},
                "}")
        ),

    getSeparator: function(selector)
    {
        return (!selector || selector == "") ? "" : " ";
    },

    getSelectorText: function(selector)
    {
        return selector || "";
    }
});

var CSSDocumentRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule focusRow cssDocumentRule", _repObject: "$rule.rule"},
            DIV({"class": "cssHead focusRow", role : "listitem"},
                SPAN({"class": "cssRuleName"}, "@-moz-document"),
                SPAN({"class": "separator"}, " "),
                SPAN({"class": "cssDocumentRuleCondition", $editable: "$rule|isEditable"},
                "$rule.rule.conditionText"),
                SPAN(" {")
            ),
            DIV({"class": "cssRulesListBox", role: "listbox"},
                FOR("subRule", "$rule.subRules",
                    TAG("$subRule.tag", {rule: "$subRule"})
                )
            ),
            DIV({$editable: "$rule|isEditable", $insertBefore:"$rule|isEditable",
                role:"presentation"},
            "}")
        )
});

var CSSStyleRuleTag = domplate(CSSDomplateBase,
{
    tag:
        DIV({"class": "cssRule",
            $cssEditableRule: "$rule|isEditable",
            $insertInto: "$rule|isEditable",
            $editGroup: "$rule|isSelectorEditable",
            _repObject: "$rule.rule",
            role: "presentation"},
            DIV({"class": "cssHead focusRow", role: "listitem"},
                SPAN({"class": "cssSelector", $editable: "$rule|isSelectorEditable"},
                    "$rule.selector"),
                " {"
            ),
            DIV({role: "group"},
                DIV({"class": "cssPropertyListBox", _rule: "$rule", role: "listbox"},
                    FOR("prop", "$rule.props",
                        TAG(CSSPropTag.tag, {rule: "$rule", prop: "$prop"})
                    )
                )
            ),
            DIV({$editable: "$rule|isEditable", $insertBefore: "$rule|isEditable",
                role:"presentation"},
                "}"
            )
        )
});

// ********************************************************************************************* //
// Local Helpers

/**
* Returns the CSS for the infotip @font-face CSS
*
* @param fontObject: Font related information
* @return @font-face CSS
*/
function getFontFaceCSS(font)
{
    var fontFaceCSS = "";
    var fontName = "";

    if (typeof font == "object")
    {
        if (font.rule)
            fontFaceCSS = font.rule.cssText.replace(/url\(.*?\)/g, "url(" + font.URI + ")");
        fontName = font.CSSFamilyName;
    }
    else
    {
        fontName = font;
    }

    fontFaceCSS += " .infoTipFontFace {font-family: " + fontName + ";}";

    return fontFaceCSS;
}

// ********************************************************************************************* //
// Registration

return {
    CSSInfoTip: CSSInfoTip,
    CSSDomplateBase: CSSDomplateBase,
    CSSPropTag: CSSPropTag,
    CSSRuleTag: CSSRuleTag,
    CSSImportRuleTag: CSSImportRuleTag,
    CSSCharsetRuleTag: CSSCharsetRuleTag,
    CSSMediaRuleTag: CSSMediaRuleTag,
    CSSSupportsRuleTag: CSSSupportsRuleTag,
    CSSKeyframesRuleTag: CSSKeyframesRuleTag,
    CSSKeyframeRuleTag: CSSKeyframeRuleTag,
    CSSNamespaceRuleTag: CSSNamespaceRuleTag,
    CSSFontFaceRuleTag: CSSFontFaceRuleTag,
    CSSPageRuleTag: CSSPageRuleTag,
    CSSDocumentRuleTag: CSSDocumentRuleTag,
    CSSStyleRuleTag: CSSStyleRuleTag
};

// ********************************************************************************************* //
});
