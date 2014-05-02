/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/options",
    "firebug/lib/deprecated",
    "firebug/lib/xpcom",
    "firebug/lib/system",
],
function(FBTrace, Options, Deprecated, Xpcom, System) {

"use strict";

// ********************************************************************************************* //
// Constants

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

const entityConverter = Xpcom.CCSV("@mozilla.org/intl/entityconverter;1", "nsIEntityConverter");

const reNotWhitespace = /[^\s]/;

var Str = {};

// ********************************************************************************************* //
// Whitespace and Entity conversions

var entityConversionLists = Str.entityConversionLists =
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

var normal = entityConversionLists.normal,
    reverse = entityConversionLists.reverse;

function addEntityMapToList(ccode, entity)
{
    var lists = Array.slice(arguments, 2),
        len = lists.length,
        ch = String.fromCharCode(ccode);

    for (var i = 0; i < len; i++)
    {
        var list = lists[i];
        normal[list]=normal[list] || {};
        normal[list][ch] = "&" + entity + ";";
        reverse[list]=reverse[list] || {};
        reverse[list]["&" + entity + ";"] = ch;
    }
}

var e = addEntityMapToList,
    white = "whitespace",
    text = "text",
    attr = "attributes",
    css = "css",
    editor = "editor";

e(0x0000, "#0", text, attr, css, editor);
e(0x0022, "quot", attr, css);
e(0x0026, "amp", attr, text, css);
e(0x0027, "apos", css);
e(0x003c, "lt", attr, text, css);
e(0x003e, "gt", attr, text, css);
e(0xa9, "copy", text, editor);
e(0xae, "reg", text, editor);
e(0x2122, "trade", text, editor);

// See http://en.wikipedia.org/wiki/Dash
e(0x2012, "#8210", attr, text, editor); // figure dash
e(0x2013, "ndash", attr, text, editor); // en dash
e(0x2014, "mdash", attr, text, editor); // em dash
e(0x2015, "#8213", attr, text, editor); // horizontal bar

// See http://www.cs.tut.fi/~jkorpela/chars/spaces.html
e(0x00a0, "nbsp", attr, text, white, editor);
e(0x2002, "ensp", attr, text, white, editor);
e(0x2003, "emsp", attr, text, white, editor);
e(0x2004, "emsp13", attr, text, white, editor);
e(0x2005, "emsp14", attr, text, white, editor);
e(0x2007, "numsp", attr, text, white, editor);
e(0x2008, "puncsp", attr, text, white, editor);
e(0x2009, "thinsp", attr, text, white, editor);
e(0x200a, "hairsp", attr, text, white, editor);
e(0x200b, "#8203", attr, text, white, editor); // zero-width space (ZWSP)
e(0x200c, "zwnj", attr, text, white, editor);

e(0x202f, "#8239", attr, text, white, editor); // NARROW NO-BREAK SPACE
e(0x205f, "#8287", attr, text, white, editor); // MEDIUM MATHEMATICAL SPACE
e(0x3000, "#12288", attr, text, white, editor); // IDEOGRAPHIC SPACE
e(0xfeff, "#65279", attr, text, white, editor); // ZERO WIDTH NO-BREAK SPACE

e(0x200d, "zwj", attr, text, white, editor);
e(0x200e, "lrm", attr, text, white, editor);
e(0x200f, "rlm", attr, text, white, editor);
e(0x202d, "#8237", attr, text, white, editor); // left-to-right override
e(0x202e, "#8238", attr, text, white, editor); // right-to-left override

// ********************************************************************************************* //
// Entity escaping

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

function escapeEntityAsName(char)
{
    try
    {
        return entityConverter.ConvertToEntity(char, entityConverter.entityW3C);
    }
    catch(e)
    {
        return char;
    }
}

function escapeEntityAsUnicode(char)
{
    var charCode = char.charCodeAt(0);

    if (charCode == 34)
        return "&quot;";
    else if (charCode == 38)
        return "&amp;";
    else if (charCode < 32 || charCode >= 127)
        return "&#" + charCode + ";";

    return char;
}

function escapeGroupsForEntities(str, lists, type)
{
    var results = [];
    var noEntityString = "";
    var textListIndex = -1;

    if (!type)
        type = "names";

    for (var i = 0, listsLen = lists.length; i < listsLen; i++)
    {
        if (lists[i].group == "text")
        {
            textListIndex = i;
            break;
        }
    }

    for (var i = 0, strLen = str.length; i < strLen; i++)
    {
        var result = str.charAt(i);

        // If there's "text" in the list groups, use a different
        // method for converting the characters
        if (textListIndex != -1)
        {
            if (type == "unicode")
                result = escapeEntityAsUnicode(str.charAt(i));
            else if (type == "names")
                result = escapeEntityAsName(str.charAt(i));
        }

        if (result != str.charAt(i))
        {
            if (noEntityString != "")
            {
                results.push({
                    "str": noEntityString,
                    "class": "",
                    "extra": ""
                });
                noEntityString = "";
            }

            results.push({
                "str": result,
                "class": lists[textListIndex].class,
                "extra": lists[textListIndex].extra[result] ? lists[textListIndex].class
                        + lists[textListIndex].extra[result] : ""
            });
        }
        else
        {
            var listEntity;
            for (var j = 0, listsLen = lists.length; j < listsLen; j++)
            {
                var list = lists[j];
                if (list.group != "text")
                {
                    listEntity = entityConversionLists.normal[list.group][result];
                    if (listEntity)
                    {
                        result = listEntity;

                        if (noEntityString != "")
                        {
                            results.push({
                                "str": noEntityString,
                                "class": "",
                                "extra": ""
                            });
                            noEntityString = "";
                        }

                        results.push({
                            "str": result,
                            "class": list.class,
                            "extra": list.extra[result] ? list.class + list.extra[result] : ""
                        });
                        break;
                    }
                }
            }

            if (result == str.charAt(i))
            {
                noEntityString += result;
            }
        }
    }

    if (noEntityString != "")
    {
        results.push({
            "str": noEntityString,
            "class": "",
            "extra": ""
        });
    }

    return results;
}

Str.escapeGroupsForEntities = escapeGroupsForEntities;

function unescapeEntities(str, lists)
{
    var re = getEscapeRegexp("reverse", lists),
        split = String(str).split(re),
        len = split.length,
        results = [],
        cur, r, i, ri = 0, l, list;

    if (!len)
        return str;

    lists = [].concat(lists);
    for (i = 0; i < len; i++)
    {
        cur = split[i];
        if (cur == '')
            continue;

        for (l = 0; l < lists.length; l++)
        {
            list = lists[l];
            r = entityConversionLists.reverse[list.group][cur];
            if (r)
            {
                results[ri] = r;
                break;
            }
        }

        if (!r)
            results[ri] = cur;
        ri++;
    }
    return results.join('') || '';
}

// ********************************************************************************************* //
// String escaping

var escapeForTextNode = Str.escapeForTextNode = createSimpleEscape("text", "normal");
var escapeForElementAttribute = Str.escapeForElementAttribute = createSimpleEscape("attributes", "normal");
Str.escapeForHtmlEditor = createSimpleEscape("editor", "normal");
Str.escapeForCss = createSimpleEscape("css", "normal");

// deprecated compatibility functions
Str.deprecateEscapeHTML = createSimpleEscape("text", "normal");
Str.deprecatedUnescapeHTML = createSimpleEscape("text", "reverse");

Str.escapeHTML = Deprecated.method("use appropriate escapeFor... function",
    Str.deprecateEscapeHTML);
Str.unescapeHTML = Deprecated.method("use appropriate unescapeFor... function",
    Str.deprecatedUnescapeHTML);

var escapeForSourceLine = Str.escapeForSourceLine = createSimpleEscape("text", "normal");

var unescapeWhitespace = createSimpleEscape("whitespace", "reverse");

Str.unescapeForTextNode = function(str)
{
    if (Options.get("showTextNodesWithWhitespace"))
        str = unescapeWhitespace(str);

    if (Options.get("entityDisplay") == "names")
        str = escapeForElementAttribute(str);

    return str;
};

Str.unescapeForURL = createSimpleEscape('text', 'reverse');

Str.escapeNewLines = function(value)
{
    return value.replace(/\r/gm, "\\r").replace(/\n/gm, "\\n");
};

Str.stripNewLines = function(value)
{
    return typeof(value) == "string" ? value.replace(/[\r\n]/gm, " ") : value;
};

Str.escapeSingleQuoteJS = function(value)
{
    return value.replace("\\", "\\\\", "g").replace(/\r/gm, "\\r")
                .replace(/\n/gm, "\\n").replace("'", "\\'", "g");
};

Str.reverseString = function(value)
{
    return value.split("").reverse().join("");
};

Str.escapeJS = function(value)
{
    return value.replace("\\", "\\\\", "g").replace(/\r/gm, "\\r")
        .replace(/\n/gm, "\\n").replace('"', '\\"', "g");
};

Str.cropString = function(text, limit, alternativeText)
{
    if (!alternativeText)
        alternativeText = "...";

    // Make sure it's a string.
    text = String(text);

    // Use default limit if necessary.
    if (!limit)
        limit = Options.get("stringCropLength");

    // Crop the string only if a limit is actually specified.
    if (limit <= 0)
        return text;

    // Set the limit at least to the length of the alternative text
    // plus one character of the original text.
    if (limit <= alternativeText.length)
        limit = alternativeText.length + 1;

    var halfLimit = (limit - alternativeText.length) / 2;

    if (text.length > limit)
    {
        return text.substr(0, Math.ceil(halfLimit)) + alternativeText +
            text.substr(text.length - Math.floor(halfLimit));
    }

    return text;
};

Str.cropStringEx = function(text, limit, alterText, pivot)
{
    if (!alterText)
        alterText = "...";

    // Make sure it's a string.
    text = String(text);

    // Use default limit if necessary.
    if (!limit)
        limit = Options.get("stringCropLength");

    // Crop the string only if a limit is actually specified.
    if (limit <= 0)
        return text;

    if (text.length < limit)
        return text;

    if (typeof(pivot) == "undefined")
        pivot = text.length / 2;

    var halfLimit = (limit / 2);

    // Adjust the pivot to the real center in case it's at an edge.
    if (pivot < halfLimit)
        pivot = halfLimit;

    if (pivot > text.length - halfLimit)
        pivot = text.length - halfLimit;

    // Get substring around the pivot
    var begin = Math.max(0, pivot - halfLimit);
    var end = Math.min(text.length - 1, pivot + halfLimit);
    var result = text.substring(begin, end);

    // Add alterText to the beginning or end of the result as necessary.
    if (begin > 0)
        result = alterText + result;

    if (end < text.length - 1)
        result += alterText;

    return result;
};

Str.lineBreak = function()
{
    if (System.isWin(window))
        return "\r\n";

    if (System.isMac(window))
        return "\r";

    return "\n";
};

Str.cropMultipleLines = function(text, limit)
{
    return this.escapeNewLines(this.cropString(text, limit));
};

Str.isWhitespace = function(text)
{
    return !reNotWhitespace.exec(text);
};

Str.splitLines = function(text)
{
    if (!text)
        return [];

    const reSplitLines2 = /.*(:?\r\n|\n|\r)?/mg;
    var lines;
    if (text.match)
    {
        lines = text.match(reSplitLines2);
    }
    else
    {
        var str = text+"";
        lines = str.match(reSplitLines2);
    }
    lines.pop();
    return lines;
};

Str.trim = function(text)
{
    return text.replace(/^\s*|\s*$/g, "");
};

Str.trimLeft = function(text)
{
    return text.replace(/^\s+/, "");
};

Str.trimRight = function(text)
{
    return text.replace(/\s+$/, "");
};

Str.hasPrefix = function(hay, needle)
{
    // Passing empty string is ok, but null or undefined is not.
    if (hay == null)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("Str.hasPrefix; string must not be null", {hay: hay, needle: needle});

        return false;
    }

    // This is the fastest way of testing for prefixes - (hay.indexOf(needle) === 0)
    // can be O(|hay|) in the worst case, and (hay.substr(0, needle.length) === needle)
    // unnecessarily creates a new string and might be O(|needle|) in some JavaScript
    // implementations. See the discussion in issue 3071.
    return hay.lastIndexOf(needle, 0) === 0;
};

Str.endsWith = function(str, suffix)
{
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
};

// ********************************************************************************************* //
// HTML Wrap

Str.wrapText = function(text, noEscapeHTML)
{
    var reNonAlphaNumeric = /[^A-Za-z_$0-9'"-]/;

    var html = [];
    var wrapWidth = Options.get("textWrapWidth");

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
// Indent

const reIndent = /^(\s+)/;

function getIndent(line)
{
    var m = reIndent.exec(line);
    return m ? m[0].length : 0;
}

Str.cleanIndentation = function(text)
{
    var lines = Str.splitLines(text);

    var minIndent = -1;
    for (var i = 0; i < lines.length; ++i)
    {
        var line = lines[i];
        var indent = getIndent(line);
        if (minIndent == -1 && line && !Str.isWhitespace(line))
            minIndent = indent;
        if (indent >= minIndent)
            lines[i] = line.substr(minIndent);
    }
    return lines.join("");
};

// ********************************************************************************************* //
// Formatting

//deprecated compatibility functions
Str.deprecateEscapeHTML = createSimpleEscape("text", "normal");

/**
 * Formats a number with a fixed number of decimal places considering the locale settings
 * @param {Integer} number Number to format
 * @param {Integer} decimals Number of decimal places
 * @returns {String} Formatted number
 */
Str.toFixedLocaleString = function(number, decimals)
{
    // Check whether 'number' is a valid number
    if (isNaN(parseFloat(number)))
        throw new Error("Value '" + number + "' of the 'number' parameter is not a number");

    return new Intl.NumberFormat(undefined,
        {minimumFractionDigits: decimals, maximumFractionDigits: decimals}).format(number);
};

Str.formatNumber = Deprecated.method("use <number>.toLocaleString() instead",
    function(number) { return number.toLocaleString(); });

Str.formatSize = function(bytes)
{
    var negative = (bytes < 0);
    bytes = Math.abs(bytes);

    var sizePrecision = Options.get("sizePrecision");
    if (typeof(sizePrecision) == "undefined")
    {
        Options.set("sizePrecision", 2);
        sizePrecision = 2;
    }

    // Get size precision (number of decimal places from the preferences)
    // and make sure it's within limits.
    sizePrecision = (sizePrecision > 2) ? 2 : sizePrecision;
    sizePrecision = (sizePrecision < -1) ? -1 : sizePrecision;

    var result;

    if (sizePrecision == -1)
        result = bytes + " B";

    var precision = Math.pow(10, sizePrecision);

    if (bytes == -1 || bytes == undefined)
        return "?";
    else if (bytes == 0)
        return "0 B";
    else if (bytes < 1024)
        result = bytes.toLocaleString() + " B";
    else if (Math.round(bytes / 1024 * precision) / precision < 1024)
        result = this.toFixedLocaleString(bytes / 1024, sizePrecision) + " KB";
    else
        result = this.toFixedLocaleString(bytes / (1024 * 1024), sizePrecision) + " MB";

    return negative ? "-" + result : result;
};

/**
 * Returns a formatted time string
 *
 * Examples:
 * Str.formatTime(12345678) => default formatting options => "3h 25m 45.678s"
 * Str.formatTime(12345678, "ms") => use milliseconds as min. time unit => "3h 25m 45s 678ms"
 * Str.formatTime(12345678, null, "m") => use minutes as max. time unit => "205m 45.678s"
 * Str.formatTime(12345678, "m", "h") => use minutes as min. and hours as max. time unit
 *     => "3h 25.7613m"
 *
 * @param {Integer} time Time to format in milliseconds
 * @param {Integer} [minTimeUnit=1] Minimal time unit to use in the formatted string
 *     (default is seconds)
 * @param {Integer} [maxTimeUnit=4] Maximal time unit to use in the formatted string
 *     (default is days)
 * @returns {String} Formatted time string
 */
Str.formatTime = function(time, minTimeUnit, maxTimeUnit, decimalPlaces)
{
    var time = parseInt(time);

    if (isNaN(time))
        return "";

    var timeUnits = [
        {
            unit: "ms",
            interval: 1000
        },
        {
            unit: "s",
            interval: 60
        },
        {
            unit: "m",
            interval: 60
        },
        {
            unit: "h",
            interval: 24
        },
        {
            unit: "d",
            interval: 1
        },
    ];

    if (time == -1)
    {
        return "";
    }
    else
    {
        // Get the index of the min. and max. time unit and the decimal places
        var minTimeUnitIndex = (Math.abs(time) < 1000) ? 0 : 1;
        var maxTimeUnitIndex = timeUnits.length - 1;

        for (var i=0, len=timeUnits.length; i<len; ++i)
        {
            if (timeUnits[i].unit == minTimeUnit)
                minTimeUnitIndex = i;
            if (timeUnits[i].unit == maxTimeUnit)
                maxTimeUnitIndex = i;
        }

        if (!decimalPlaces)
            decimalPlaces = (Math.abs(time) >= 60000 && minTimeUnitIndex == 1 ? 0 : 2);

        // Calculate the maximal time interval
        var timeUnitInterval = 1;
        for (var i=0; i<maxTimeUnitIndex; ++i)
            timeUnitInterval *= timeUnits[i].interval;

        var formattedString = (time < 0 ? "-" : "");
        time = Math.abs(time);
        for (var i=maxTimeUnitIndex; i>=minTimeUnitIndex; --i)
        {
            var value = time / timeUnitInterval;
            if (i != minTimeUnitIndex)
            {
                if (value < 0)
                    value = Math.ceil(value);
                else
                    value = Math.floor(value);
            }
            else
            {
                var decimalFactor = Math.pow(10, decimalPlaces);
                value = Math.round(value * decimalFactor) / decimalFactor;
            }

            if (value != 0 || (i == minTimeUnitIndex && formattedString == ""))
                formattedString += value.toLocaleString() + timeUnits[i].unit + " ";
            time %= timeUnitInterval;
            if (i != 0)
                timeUnitInterval /= timeUnits[i - 1].interval;
        }

        return formattedString.trim();
    }
};

/**
 * Formats an IPv4 or IPv6 address incl. port
 * @param {String} address IP address to format
 * @param {String} [port] IP port to format
 * @returns {String} Formatted IP address
 */
Str.formatIP = function(address, port)
{
    if (!address || address == "")
        return "";

    var result = address;
    var isIPv6Address = address.indexOf(":") != -1;
    if (isIPv6Address)
        result = "["+result+"]";

    if (port && port != "")
        result += ":"+port;

    return result;
};

/**
 * Capitalizes the first letter of a string or each word in it
 *
 * @param {String} string String to format
 * @param {Boolean} [capitalizeEachWord=false] If true, the first character of each word will be
 *     transformed to uppercase, otherwise only the very first character of the string
 * @param {Boolean} [restToLowerCase=true] If true, the rest of the string will be transformed
 *     to lower case, otherwise it will stay untouched
 * @returns {String} Converted string
 */
Str.capitalize = function(string, capitalizeEachWord, restToLowerCase)
{
    function capitalizeFirstLetter(string)
    {
        var rest = string.slice(1);

        if (restToLowerCase !== false)
            rest = rest.toLowerCase();

        return string.charAt(0).toUpperCase() + rest;
    }

    if (!capitalizeEachWord)
        return capitalizeFirstLetter(string, restToLowerCase);

    return string.split(" ").map(capitalizeFirstLetter).join(" ");
};

// ********************************************************************************************* //
// Conversions

Str.convertToUnicode = function(text, charset)
{
    if (!text)
        return "";

    try
    {
        var conv = Cc["@mozilla.org/intl/scriptableunicodeconverter"].getService(
            Ci.nsIScriptableUnicodeConverter);
        conv.charset = charset ? charset : "UTF-8";
        return conv.ConvertToUnicode(text);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("Str.convertToUnicode: fails: for charset "+charset+" conv.charset:"+
                conv.charset+" exc: "+exc, exc);
        }

        // the exception is worthless, make up a new one
        throw new Error("Firebug failed to convert to unicode using charset: "+conv.charset+
            " in @mozilla.org/intl/scriptableunicodeconverter");
    }
};

Str.convertFromUnicode = function(text, charset)
{
    if (!text)
        return "";

    try
    {
        var conv = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(
            Ci.nsIScriptableUnicodeConverter);
        conv.charset = charset ? charset : "UTF-8";
        return conv.ConvertFromUnicode(text);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
        {
            FBTrace.sysout("Str.convertFromUnicode: fails: for charset "+charset+" conv.charset:"+
                conv.charset+" exc: "+exc, exc);
        }
    }
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

Str.capitalize = function(string)
{
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// ********************************************************************************************* //

return Str;

// ********************************************************************************************* //
});
