/* See license.txt for terms of usage */

define([
    "fbtrace/trace",
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

var Str = {};

// ********************************************************************************************* //
// String API

Str.cropMultipleLines = function(text, limit)
{
    return this.escapeNewLines(this.cropString(text, limit));
};

Str.trim = function(text)
{
    return text.replace(/^\s*|\s*$/g, "");
};

// ********************************************************************************************* //
// HTML Wrap

Str.wrapText = function(text, noEscapeHTML)
{
    var reNonAlphaNumeric = /[^A-Za-z_$0-9'"-]/;

    var html = [];
    var wrapWidth = 100;

    // Split long text into lines and put every line into a <code> element (only in case
    // if noEscapeHTML is false). This is useful for automatic scrolling when searching
    // within response body (in order to scroll we need an element).
    // Don't use <pre> elements since this adds additional new line endings when copying
    // selected source code using Firefox->Edit->Copy (Ctrl+C) (issue 2093).
    var lines = Str.splitLines(text);
    for (var i = 0; i < lines.length; ++i)
    {
        var line = lines[i];

        if (wrapWidth > 0)
        {
            while (line.length > wrapWidth)
            {
                var m = reNonAlphaNumeric.exec(line.substr(wrapWidth, 100));
                var wrapIndex = wrapWidth + (m ? m.index : 0);
                var subLine = line.substr(0, wrapIndex);
                line = line.substr(wrapIndex);

                if (!noEscapeHTML) html.push("<code class=\"wrappedText focusRow\" role=\"listitem\">");
                html.push(noEscapeHTML ? subLine : escapeForTextNode(subLine));
                if (!noEscapeHTML) html.push("</code>");
            }
        }

        if (!noEscapeHTML) html.push("<code class=\"wrappedText focusRow\" role=\"listitem\">");
        html.push(noEscapeHTML ? line : escapeForTextNode(line));
        if (!noEscapeHTML) html.push("</code>");
    }

    return html;
};

Str.insertWrappedText = function(text, textBox, noEscapeHTML)
{
    var html = Str.wrapText(text, noEscapeHTML);
    textBox.innerHTML = "<pre role=\"list\">" + html.join("") + "</pre>";
};

// ********************************************************************************************* //

Str.safeToString = function(ob)
{
    try
    {
        if (!ob)
            return ""+ob;
        if (ob && (typeof (ob["toString"]) == "function") )
            return ob.toString();
        if (ob && typeof (ob["toSource"]) == "function")
            return ob.toSource();
       /* https://bugzilla.mozilla.org/show_bug.cgi?id=522590 */
        var str = "[";
        for (var p in ob)
            str += p + ",";
        return str + "]";

    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("Str.safeToString FAILS "+exc, exc);
    }
    return "[unsupported: no toString() function in type "+typeof(ob)+"]";
};

// ********************************************************************************************* //
// Whitespace and Entity conversions

var entityConversionLists =
{
    normal : {
        whitespace : {
            "\t" : "\u200c\u2192",
            "\n" : "\u200c\u00b6",
            "\r" : "\u200c\u00ac",
            " "  : "\u200c\u00b7"
        }
    },
    reverse : {
        whitespace : {
            "&Tab;" : "\t",
            "&NewLine;" : "\n",
            "\u200c\u2192" : "\t",
            "\u200c\u00b6" : "\n",
            "\u200c\u00ac" : "\r",
            "\u200c\u00b7" : " "
        }
    }
};

var entityConversionRegexes =
{
    normal : {},
    reverse : {}
};

var escapeEntitiesRegEx =
{
    normal : function(list)
    {
        var chars = [];
        for (var ch in list)
            chars.push(ch);
        return new RegExp("([" + chars.join("") + "])", "gm");
    },
    reverse : function(list)
    {
        var chars = [];
        for (var ch in list)
            chars.push(ch);
        return new RegExp("(" + chars.join("|") + ")", "gm");
    }
};

function createSimpleEscape(name, direction)
{
    return function(value)
    {
        var list = entityConversionLists[direction][name];
        return String(value).replace(
                getEscapeRegexp(direction, {
                    group : name,
                    list : list
                }),
                function(ch)
                {
                    return list[ch];
                }
            );
    };
}

function getEscapeRegexp(direction, lists)
{
    var name = "";
    var re;
    var groups = [].concat(lists);
    for (i = 0; i < groups.length; i++)
        name += groups[i].group;
    re = entityConversionRegexes[direction][name];
    if (!re)
    {
        var list = {};
        if (groups.length > 1)
        {
            for ( var i = 0; i < groups.length; i++)
            {
                var aList = entityConversionLists[direction][groups[i].group];
                for ( var item in aList)
                    list[item] = aList[item];
            }
        }
        else if (groups.length==1)
        {
            list = entityConversionLists[direction][groups[0].group]; // faster for special case
        }
        else
        {
            list = {}; // perhaps should print out an error here?
        }
        re = entityConversionRegexes[direction][name] = escapeEntitiesRegEx[direction](list);
    }
    return re;
}

Str.escapeForElementAttribute = createSimpleEscape("attributes", "normal");

// ********************************************************************************************* //

return Str;

// ********************************************************************************************* //
});
