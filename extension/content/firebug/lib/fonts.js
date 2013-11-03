/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/dom",
    "firebug/lib/url"
],
function(FBTrace, Dom, Url) {

"use strict";

// ********************************************************************************************* //
// Constants

var Fonts = {};

// ********************************************************************************************* //
// Fonts

/**
 * Retrieves all fonts used inside a node
 * @node: Node to return the fonts for
 * @return Array of fonts
 */
Fonts.getFonts = function(node)
{
    if (!Dom.domUtils)
        return [];

    var range = node.ownerDocument.createRange();
    try
    {
        range.selectNode(node);
    }
    catch(err)
    {
        if (FBTrace.DBG_FONTS || FBTrace.DBG_ERRORS)
            FBTrace.sysout("Fonts.getFonts; node couldn't be selected", err);
    }

    var fontFaces = Dom.domUtils.getUsedFontFaces(range);
    var fonts = [];
    for (var i=0; i<fontFaces.length; i++)
        fonts.push(fontFaces.item(i));

    if (FBTrace.DBG_FONTS)
        FBTrace.sysout("Fonts.getFonts; used fonts", fonts);

    return fonts;
};

/**
 * Retrieves all fonts used in a context, cached so that the first use is
 * potentially slow (several seconds on the HTML5 spec), and later ones are
 * instant but not up-to-date.
 * @context: Context to return the fonts for
 * @return Array of fonts
 */
Fonts.getFontsUsedInContext = function(context)
{
    if (context.fontCache)
        return context.fontCache;

    var fonts = [];
    if (context.window)
    {
        var doc = context.window.document;
        if (doc)
            fonts = Fonts.getFonts(doc.documentElement);
    }
    context.fontCache = fonts;
    return fonts;
};

/**
 * Retrieves the information about a font
 * @context: Context of the font
 * @win: Window the font is used in
 * @identifier: Either a URL in case of a web font or the font name
 * @return Object with information about the font
 */
Fonts.getFontInfo = function(context, win, identifier)
{
    if (!context)
        context = Firebug.currentContext;

    var doc = win ? win.document : context.window.document;
    if (!doc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("lib.getFontInfo; NO DOCUMENT", {win:win, context:context});
        return false;
    }

    var fonts = Fonts.getFonts(doc.documentElement);

    if (FBTrace.DBG_FONTS)
        FBTrace.sysout("Fonts.getFontInfo;", {fonts:fonts, identifier: identifier});

    for (var i=0; i<fonts.length; i++)
    {
        if (identifier == fonts[i].URI ||
            identifier.toLowerCase() == fonts[i].CSSFamilyName.toLowerCase() ||
            identifier.toLowerCase() == fonts[i].name.toLowerCase())
        {
            return fonts[i];
        }
    }

    return false;
};

// ********************************************************************************************* //

return Fonts;

// ********************************************************************************************* //
});
