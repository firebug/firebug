/* See license.txt for terms of usage */

define([
    "firebug/chrome/module",
    "firebug/lib/object",
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/xpcom",
    "firebug/lib/events",
    "firebug/chrome/window",
    "firebug/lib/css",
    "firebug/lib/dom",
    "firebug/lib/string",
    "firebug/lib/fonts",
    "firebug/lib/url",
    "firebug/lib/http",
    "firebug/net/netUtils",
    "firebug/lib/options"
],
function(Module, Obj, Firebug, Domplate, Locale, Xpcom, Events, Win, Css, Dom, Str, Fonts, Url,
    Http, NetUtils, Options) {

// ********************************************************************************************* //
// Constants

var {domplate, FOR, TAG, DIV, SPAN, TD, TR, TABLE, TBODY, P, UL, LI, PRE, A, STYLE} = Domplate;

// List of font content types
var contentTypes =
[
    "application/x-woff",
    "application/x-font-woff",
    "application/x-ttf",
    "application/x-font-ttf",
    "font/ttf",
    "font/woff",
    "application/x-otf",
    "application/x-font-otf",
    "application/font-woff"
];

// ********************************************************************************************* //
// Model implementation

Firebug.FontViewerModel = Obj.extend(Module,
{
    dispatchName: "fontViewer",
    contentTypes: contentTypes,

    initialize: function()
    {
        Firebug.TabCacheModel.addListener(this);
        Firebug.NetMonitor.NetInfoBody.addListener(this);
        Firebug.registerUIListener(this);
    },

    shutdown: function()
    {
        Firebug.TabCacheModel.removeListener(this);
        Firebug.NetMonitor.NetInfoBody.removeListener(this);
        Firebug.unregisterUIListener(this);
    },

    /**
     * Checks whether the given file name and content are a valid font file
     *
     * @param contentType: MIME type of the file
     * @param url: URL of the file
     * @param data: File contents
     * @return True, if the given data outlines a font file, otherwise false
     */
    isFont: function(contentType, url, data)
    {
        if (!contentType)
            return false;

        if (NetUtils.matchesContentType(contentType, contentTypes))
        {
            if (FBTrace.DBG_FONTS)
            {
                FBTrace.sysout("fontviewer.isFont; content type: "+contentType,
                    {url: url, data: data});
            }

            return true;
        }

        // Workaround for font responses without proper content type
        // Let's consider all responses starting with "wOFF" as font. In the worst
        // case there will be an exception when parsing. This means that no-font
        // responses (and post data) (with "wOFF") can be parsed unnecessarily,
        // which represents a little overhead, but this happens only if the request
        // is actually expanded by the user in the UI (Net & Console panel).
        var extension = Url.getFileExtension(url);
        var validExtension = /woff|otf|ttf/.exec(extension);
        if (validExtension && (!data || Str.hasPrefix(data, "wOFF") || Str.hasPrefix(data, "OTTO")))
        {
            if (FBTrace.DBG_FONTS)
            {
                FBTrace.sysout("fontviewer.isFont; Font without proper content type",
                    {url: url, data: data});
            }

            return true;
        }

        contentType = contentType.split(";")[0];
        contentType = Str.trim(contentType);
        return contentTypes[contentType];
    },

    /**
     * Parses the file and returns information about the font
     *
     * @param file: File to parse
     * @return Font related information
     */
    parseFont: function(file)
    {
        return Fonts.getFontInfo(Firebug.currentContext, null, file.href);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // TabCacheModel listener

    shouldCacheRequest: function(request)
    {
        if (this.isFont(request.contentType, request.name))
            return true;

        return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // NetInfoBody listener

    updateResponse: function(netInfoBox, file, context)
    {
        // Let listeners parse the font
        Events.dispatch(this.fbListeners, "onParseFont", [file]);

        // The font is still not there, try to parse most common cases
        if (!file.fontObject)
        {
            if (this.isFont(Http.safeGetContentType(file.request), file.href, file.responseText))
                file.fontObject = this.parseFont(file);
        }

        if (file.fontObject)
        {
            var responseTextBox = netInfoBox.getElementsByClassName("netInfoResponseText").item(0);
            this.Preview.render(responseTextBox, file, context);
            netInfoBox.responsePresented = true;

            if (FBTrace.DBG_FONTS)
                FBTrace.sysout("fontviewer.updateResponse", file);
        }
    }
});

// ********************************************************************************************* //

Firebug.FontViewerModel.Preview = domplate(
{
    bodyTag:
        DIV({"class": "fontInfo", _repObject: "$fontObject"},
            DIV({"class": "fontInfoGroup fontInfoGeneralInfoTitle"},
                SPAN(Locale.$STR("fontviewer.General Info"))
            ),
            TABLE({cellpadding: 0, cellspacing: 0},
                TBODY({"class": "fontInfoGeneralInfoBody", "role": "list",
                    "aria-label": Locale.$STR("fontviewer.General Info")})
            ),
            DIV({"class": "fontInfoGroup fontInfoMetaDataTitle",
                $collapsed: "$fontObject|noMetaData"},
                SPAN(Locale.$STR("fontviewer.Meta Data")),
                SPAN({"class": "fontInfoToggleView", onclick: "$onToggleView",
                    _sourceDisplayed: false, _rowName: "MetaData"},
                    Locale.$STR("fontviewer.view source")
                )
            ),
            TABLE({cellpadding: 0, cellspacing: 0},
                TBODY({"class": "fontInfoMetaDataBody", "role": "list",
                    "aria-label": Locale.$STR("fontviewer.Meta Data")})
            ),
            DIV({"class": "fontInfoGroup fontInfoPreviewTitle"},
                SPAN(Locale.$STR("fontviewer.Preview")),
                SPAN({"class": "fontInfoToggleView", onclick: "$onToggleView",
                  _lettersDisplayed: false, _rowName: "Preview"},
                  Locale.$STR("fontviewer.view characters")
                )
            ),
            DIV({"class": "fontInfoPreview"},
                STYLE({"class": "fontInfoPreviewStyle"}),
                DIV({"class": "fontInfoPreviewSample"},
                    FOR("style", "$styles",
                        P({"class": "$fontObject.CSSFamilyName|getFontFaceClass",
                            "style": "font-size: $style|getFontSize"},
                            SPAN({"class": "fontViewerFontSize"}, "$style"),
                            SPAN(Locale.$STR("fontviewer.pangram"))
                        )
                    )
                ),
                DIV({"class": "fontInfoPreviewCharacters"},
                    FOR("charType", "$charTypes",
                        P({"class": "$fontObject.CSSFamilyName|getFontFaceClass"},
                            "$charType|getCharacters"
                        )
                    )
                )
            )
        ),

    propDataTag:
        FOR("prop", "$props",
            TR({"role": "listitem", _repObject: "$prop.node"},
                TD({"class": "fontInfoPropName", "role": "presentation"},
                    SPAN("$prop|getPropName")
                ),
                TD({"class": "fontInfoPropValue", "role": "list", "aria-label": "$prop.name"},
                    TAG("$prop|getTag", {node: "$prop.node"})
                )
            )
        ),

    sourceTag:
        TR({"role": "presentation"},
            TD({colspan: 2, "role": "presentation"},
                PRE({"class": "source"})
            )
        ),

    translatedInfoTag:
        DIV({"class": "fontInfoTranslatedInfo"},
            DIV({"class": "fontInfoLangInfo"},
                FOR("lang", "$node|getLanguages",
                    A({"class": "fontInfoLangTab", $selected: "$lang.selected", role: "tab",
                        onclick: "$onTranslatedLangChange"}, "$lang.name")
                )
            ),
            DIV({"class": "fontInfoTranslatedContent"},
                "$node|getTranslatedText"
            )
        ),

    vendorTag:
        TAG("$node|getLinkedTextTag", {node: "$node"}),

    licenseTag:
        DIV({"class": "fontInfoLicense"},
            TAG("$node|getLinkedTextTag", {node: "$node"}),
            TAG("$translatedInfoTag", {node: "$node"})
        ),

    creditsTag:
        UL({"class": "fontInfoCredits"},
            FOR("credit", "$node|getCredits",
                LI(
                    TAG("$credit|getLinkedTextTag", {node: "$credit"}),
                    " ",
                    SPAN({"class": "fontInfoCreditsRole"}, "$credit|getRole")
                )
            )
        ),

    linkTag:
        A({"class": "fontInfoLink", href: "$node|getUrl", onclick: "$onOpenUrl"},
            "$node|getLinkName"),

    textTag:
        SPAN("$node|getText"),

    /**
     * Handles toggling of the font information display
     *
     * @param event: Click event
     */
    onToggleView: function(event)
    {
        var target = event.target;
        var fontInfo = Dom.getAncestorByClass(target, "fontInfo");
        var fontObject = fontInfo.repObject;

        switch (target.rowName)
        {
            case "MetaData":
                if (target.sourceDisplayed)
                {
                    this.insertMetaDataFormatted(fontInfo, fontObject.metadata);
                    target.textContent = Locale.$STR("fontviewer.view source");
                }
                else
                {
                    this.insertMetaDataSource(fontInfo, fontObject.metadata);
                    target.textContent = Locale.$STR("fontviewer.pretty print");
                }
                target.sourceDisplayed = !target.sourceDisplayed;
                break;

            case "Preview":
                var sample = fontInfo.getElementsByClassName("fontInfoPreviewSample").item(0);
                var chars = fontInfo.getElementsByClassName("fontInfoPreviewCharacters").item(0);
                if (target.lettersDisplayed)
                {
                    sample.style.display = "block";
                    chars.style.display = "none";
                    target.textContent = Locale.$STR("fontviewer.view characters");
                }
                else
                {
                    sample.style.display = "none";
                    chars.style.display = "block";
                    target.textContent = Locale.$STR("fontviewer.view sample");
                }
                target.lettersDisplayed = !target.lettersDisplayed;
                break;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Meta data

    /**
     * Checks, whether the font contains meta data
     *
     * @param fontObject: Font related information
     * @return True, if font contains meta data, otherwise false
     */
    noMetaData: function(fontObject)
    {
        return fontObject.metadata == "";
    },

    /**
     * Selects the corresponding Domplate template related to a given meta data property
     *
     * @param prop: Meta data property
     * @return Domplate template related to the property
     */
    getTag: function(prop)
    {
        return prop.tag ? prop.tag : Firebug.FontViewerModel.Preview.textTag;
    },

    /**
     * Returns the translated property name
     *
     * @param prop: Meta data property
     * @return Translated name of the property
     */
    getPropName: function(prop)
    {
        return prop.name ? prop.name : Locale.$STR("fontviewer."+prop.node.nodeName);
    },

    /**
     * Returns the text of a meta data property or a string
     *
     * @param value: Meta data property or string
     * @return String representing the text related to the property
     */
    getText: function(value)
    {
        if (typeof(value) == "string")
            return value;

        var name = value.getAttribute("id") || value.getAttribute("name");
        if (name)
            return name;

        return value.textContent;
    },

    /**
     * Opens a URL in a new browser tab
     *
     * @param event: Click event
     */
    onOpenUrl: function(event)
    {
        Win.openNewTab(event.target.getAttribute("href"));
        Events.cancelEvent(event);
    },

    /**
     * Returns either text or a linked text depending on a URL to be present of a
     * meta data property
     *
     * @param node: Meta data property node
     * @return Text or linked text
     */
    getLinkedTextTag: function(node)
    {
        if (this.getUrl(node))
            return Firebug.FontViewerModel.Preview.linkTag;
        else
            return Firebug.FontViewerModel.Preview.textTag;
    },

    /**
     * Returns the URL of a meta data property
     *
     * @param node: Meta data property node
     * @return URL of the meta data property
     */
    getUrl: function(node)
    {
        return node.getAttribute("url");
    },

    /**
     * Returns the name of a link related to a meta data property
     *
     * @param node: Meta data property node
     * @return Link name of the meta data property
     */
    getLinkName: function(node)
    {
        return node.getAttribute("id") || node.getAttribute("name") || node.getAttribute("url");
    },

    /**
     * Returns an array of font credits
     *
     * @param node: Meta data property node
     * @return Credits
     */
    getCredits: function(node)
    {
        return Array.prototype.slice.call(node.children);
    },

    /**
     * Returns the role of a contributor of the font
     *
     * @param node: Meta data property node
     * @return Contributor role
     */
    getRole: function(node)
    {
        var role = node.getAttribute("role");
        return role ? "("+role+")" : "";
    },

    /**
     * Returns the available languages of a translated meta data property text
     *
     * @param node: Meta data property node
     * @return Array of languages
     */
    getLanguages: function(node)
    {
        var texts = Array.prototype.slice.call(node.getElementsByTagName("text"));
        var langs = [];
        var defaultLang = this.getDefaultLang(node);
        texts.forEach(function(e, i, a) {
            var lang = e.getAttribute("lang");
            langs.push({name: lang, selected: lang == defaultLang});
        });

        return langs;
    },

    /**
     * Returns the default language of a meta data property
     *
     * @param node: Meta data property node
     * @return Language
     */
    getDefaultLang: function(node)
    {
        var localeDomain = "general.useragent";
        var localeName = "locale";
        var localeValue = Options.getPref(localeDomain, localeName);

        if (node.querySelector("text[lang="+localeValue+"]"))
            return localeValue;

        if (node.querySelector("text[lang=en]"))
            return "en";

        if (node.firstElementChild)
            return node.firstElementChild.getAttribute("lang");

        return null;
    },

    /**
     * Returns the translated text of meta data property
     *
     * @param node: Meta data property node
     * @param lang: Language of the text
     * @return Translated text
     */
    getTranslatedText: function(node, lang)
    {
        if (!lang)
            lang = this.getDefaultLang(node);

        if (lang)
        {
            var element = node.querySelector("text[lang="+lang+"]");
            if (element)
                return element.textContent;
        }

        return "";
    },

    /**
     * Displays the XML source of the meta data
     *
     * @param fontInfo: Font related information
     * @param source: XML source of the meta data
     */
    insertMetaDataSource: function(fontInfo, source)
    {
        var tbody = fontInfo.getElementsByClassName("fontInfoMetaDataBody").item(0);
        var node = this.sourceTag.replace({}, tbody);
        var sourceNode = node.getElementsByClassName("source").item(0);
        Str.insertWrappedText(source, sourceNode);
    },

    /**
     * Displays the meta data information formatted
     *
     * @param fontInfo: Font related information
     * @param source: XML source of the meta data
     */
    insertMetaDataFormatted: function(fontInfo, source)
    {
        var tbody = fontInfo.getElementsByClassName("fontInfoMetaDataBody").item(0);
        var parser = Xpcom.CCIN("@mozilla.org/xmlextras/domparser;1", "nsIDOMParser");
        var doc = parser.parseFromString(source, "text/xml");
        var root = doc.documentElement;

        if (FBTrace.DBG_FONTS)
            FBTrace.sysout("fontviewer.insertMetaDataFormatted; XML", doc);

        Dom.clearNode(tbody);

        var props = [];
        var propValueTemplates = {
            vendor: Firebug.FontViewerModel.Preview.vendorTag,
            credits: Firebug.FontViewerModel.Preview.creditsTag,
            description: Firebug.FontViewerModel.Preview.translatedInfoTag,
            copyright: Firebug.FontViewerModel.Preview.translatedInfoTag,
            trademark: Firebug.FontViewerModel.Preview.translatedInfoTag,
            license: Firebug.FontViewerModel.Preview.licenseTag
        };

        for (var i=0; i<root.children.length; i++)
        {
            var child = root.children[i];
            props.push({tag: propValueTemplates[child.nodeName], node: child});
        }

        if (FBTrace.DBG_FONTS)
            FBTrace.sysout("fontviewer.insertMetaDataFormatted; props", props);

        tbody.repObject = root;
        Firebug.FontViewerModel.Preview.propDataTag.insertRows({props: props}, tbody);
    },

    /**
     * Handles text language changes
     *
     * @param event: Click event
     */
    onTranslatedLangChange: function(event)
    {
        var target = event.target;
        var translatedInfo = Dom.getAncestorByClass(target, "fontInfoTranslatedInfo");
        var selected = translatedInfo.getElementsByClassName("selected").item(0);
        Css.removeClass(selected, "selected");
        Css.setClass(target, "selected");

        var content = translatedInfo.getElementsByClassName("fontInfoTranslatedContent").item(0);
        content.textContent = this.getTranslatedText(Firebug.getRepObject(target),
            target.textContent);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Preview

    /**
     * Returns the CSS font-face class name
     *
     * @param cssFamilyName: CSS name of the font family
     * @return Name of the font-face class
     */
    getFontFaceClass: function(cssFamilyName)
    {
        return "fontFacePreview"+cssFamilyName.replace(/[^a-z0-9_]/ig, "");
    },

    /**
     * Returns the font size CSS
     *
     * @param size: Font size
     * @return Font size CSS
     */
    getFontSize: function(size)
    {
        return size+"pt";
    },

    /**
     * Returns the characters used for the font preview
     *
     * @param charType: Type of characters to return
     * @return Preview characters
     */
    getCharacters: function(charType)
    {
        switch (charType)
        {
            case "lowercase":
                return "abcdefghijklmnopqrstuvwxyz";

            case "uppercase":
                return "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

            case "numbersAndSpecialChars":
                return "0123456789.:,;(\"*!?')";
        }
    },

    /**
     * Returns the CSS for the @font-face CSS
     *
     * @param fontObject: Font related information
     * @return @font-face CSS
     */
    getFontFaceCss: function(fontObject)
    {
        var fontFaceClass = this.getFontFaceClass(fontObject.CSSFamilyName);
        return fontObject.rule.cssText.replace(/url\(.*?\)/g, "url("+fontObject.URI+")")+
            " ."+fontFaceClass+" {font-family: \""+fontObject.CSSFamilyName+"\";}";
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    /**
     * Displays general information about the font
     *
     * @param body: Node containing the font information display
     * @param fontObject: Font related information
     */
    insertGeneralInfo: function(body, fontObject)
    {

        var fontInfo = body.getElementsByClassName("fontInfo").item(0);
        var tbody = fontInfo.getElementsByClassName("fontInfoGeneralInfoBody").item(0);

        Dom.clearNode(tbody);

        if (fontObject)
        {
            var props =
            [
                {name: Locale.$STR("fontviewer.Name"), node: fontObject.name},
                {name: Locale.$STR("fontviewer.CSS Family Name"), node: fontObject.CSSFamilyName},
                {name: Locale.$STR("fontviewer.Format"), node: fontObject.format}
            ];
            Firebug.FontViewerModel.Preview.propDataTag.insertRows({props: props}, tbody);
        }
    },

    /**
     * Renders the font display
     *
     * @param body: Node containing the font information display
     * @param file: Font file to be displayed
     * @param context: Related context
     */
    render: function(body, file, context)
    {
        var fontObject = file.fontObject;
        if (!fontObject)
            return;

        var styles = [10, 14, 18];
        var charTypes = ["lowercase", "uppercase", "numbersAndSpecialChars"];

        var node = this.bodyTag.replace({fontObject: fontObject, styles: styles,
            charTypes: charTypes}, body, this);

        var styleNode = node.getElementsByClassName("fontInfoPreviewStyle").item(0);
        styleNode.textContent = this.getFontFaceCss(fontObject);

        this.insertGeneralInfo(body, file.fontObject);

        if (fontObject.metadata != "")
            this.insertMetaDataFormatted(body, fontObject.metadata);
    }
});

// ********************************************************************************************* //
// Registration

Firebug.registerModule(Firebug.FontViewerModel);

return Firebug.FontViewerModel;

// ********************************************************************************************* //
});
