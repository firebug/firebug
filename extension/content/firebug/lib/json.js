/* See license.txt for terms of usage */
/*global define:1*/

define([
    "firebug/lib/trace"
],
function(FBTrace) {

"use strict";

// ********************************************************************************************* //
// Constants

var Json = {};

// ********************************************************************************************* //
// JSON

Json.parseJSONString = function(jsonString, originURL)
{
    var regex, matches;
    if (FBTrace.DBG_JSONVIEWER)
        FBTrace.sysout("jsonviewer.parseJSON; " + jsonString);

    var first = firstNonWs(jsonString);
    if (first !== "[" && first !== "{")
    {
        // This (probably) isn't pure JSON. Let's try to strip various sorts
        // of XSSI protection/wrapping and see if that works better.

        // Prototype-style secure requests
        regex = /^\s*\/\*-secure-([\s\S]*)\*\/\s*$/;
        matches = regex.exec(jsonString);
        if (matches)
        {
            jsonString = matches[1];

            if (jsonString[0] === "\\" && jsonString[1] === "n")
                jsonString = jsonString.substr(2);

            if (jsonString[jsonString.length-2] === "\\" && jsonString[jsonString.length-1] === "n")
                jsonString = jsonString.substr(0, jsonString.length-2);
        }

        // Google-style (?) delimiters
        if (jsonString.indexOf("&&&START&&&") !== -1)
        {
            regex = /&&&START&&&([\s\S]*)&&&END&&&/;
            matches = regex.exec(jsonString);
            if (matches)
                jsonString = matches[1];
        }

        // while(1);, for(;;);, and )]}'
        regex = /^\s*(\)\]\}[^\n]*\n|while\s*\(1\);|for\s*\(;;\);)([\s\S]*)/;
        matches = regex.exec(jsonString);
        if (matches)
            jsonString = matches[2];

        // JSONP
        regex = /^\s*([A-Za-z0-9_$.]+\s*(?:\[.*\]|))\s*\(([\s\S]*)\)/;
        matches = regex.exec(jsonString);
        if (matches)
            jsonString = matches[2];
    }

    try
    {
        return JSON.parse(jsonString);
    }
    catch (exc) {}

    // Give up if we don't have valid start, to avoid some unnecessary overhead.
    first = firstNonWs(jsonString);
    if (first !== "[" && first !== "{" && isNaN(first) && first !== '"')
        return null;

    // Remove JavaScript comments, quote non-quoted identifiers, and merge
    // multi-line structures like |{"a": 1} \n {"b": 2}| into a single JSON
    // object [{"a": 1}, {"b": 2}].
    jsonString = pseudoJsonToJson(jsonString);

    try
    {
        return JSON.parse(jsonString);
    }
    catch (exc)
    {
        if (FBTrace.DBG_JSONVIEWER)
        {
            FBTrace.sysout("jsonviewer.parseJSON FAILS on "+originURL+" with EXCEPTION " + exc,
                {e: exc, json: jsonString});
        }
    }

    return null;
};

function firstNonWs(str)
{
    for (var i = 0, len = str.length; i < len; i++)
    {
        var ch = str[i];
        if (ch !== " " && ch !== "\n" && ch !== "\t" && ch !== "\r")
            return ch;
    }
    return "";
}

function pseudoJsonToJson(json)
{
    var ret = "";
    var at = 0, lasti = 0, lastch = "", hasMultipleParts = false;
    for (var i = 0, len = json.length; i < len; ++i)
    {
        var ch = json[i];
        if (/\s/.test(ch))
            continue;

        if (ch === '"')
        {
            // Consume a string.
            ++i;
            while (i < len)
            {
                if (json[i] === "\\")
                    ++i;
                else if (json[i] === '"')
                    break;
                ++i;
            }
        }
        else if (ch === "'")
        {
            // Convert an invalid string into a valid one.
            ret += json.slice(at, i) + "\"";
            at = i + 1;
            ++i;
            while (i < len)
            {
                if (json[i] === "\\")
                    ++i;
                else if (json[i] === "'")
                    break;
                ++i;
            }
            if (i < len)
            {
                ret += json.slice(at, i) + "\"";
                at = i + 1;
            }
        }
        else if ((ch === "[" || ch === "{") && (lastch === "]" || lastch === "}"))
        {
            // Multiple JSON messages in one... Make it into a single array by
            // inserting a comma and setting the "multiple parts" flag.
            ret += json.slice(at, i) + ",";
            hasMultipleParts = true;
            at = i;
        }
        else if (lastch === "," && (ch === "]" || ch === "}"))
        {
            // Trailing commas in arrays/objects.
            ret += json.slice(at, lasti);
            at = i;
        }
        else if (lastch === "/" && lasti === i-1)
        {
            // Some kind of comment; remove it.
            if (ch === "/")
            {

                ret += json.slice(at, i-1);
                at = i + json.slice(i).search(/\n|\r|$/);
                i = at - 1;
            }
            else if (ch === "*")
            {
                ret += json.slice(at, i-1);
                at = json.indexOf("*/", i+1) + 2;
                if (at === 1)
                    at = len;
                i = at - 1;
            }
            ch = "\0";
        }
        else if (/[a-zA-Z$_]/.test(ch) && lastch !== ":")
        {
            // Non-quoted identifier. Quote it.
            ret += json.slice(at, i) + "\"";
            at = i;
            i = i + json.slice(i).search(/[^a-zA-Z0-9$_]|$/);
            ret += json.slice(at, i) + "\"";
            at = i;
        }

        lastch = ch;
        lasti = i;
    }

    ret += json.slice(at);
    if (hasMultipleParts)
        ret = "[" + ret + "]";
    return ret;
}

// ********************************************************************************************* //

return Json;

// ********************************************************************************************* //
});
