/* See license.txt for terms of usage */

define([
    "firebug/lib/trace"
],
function(FBTrace) {

"use strict";

// ********************************************************************************************* //
// Debug APIs

var Keywords = {};

// ********************************************************************************************* //
// JavaScript Parsing

Keywords.jsKeywords =
{
    "var": 1,
    "const": 1,
    "class": 1,
    "extends": 1,
    "import": 1,
    "namespace": 1,
    "function": 1,
    "debugger": 1,
    "new": 1,
    "delete": 1,
    "null": 1,
    "undefined": 1,
    "true": 1,
    "false": 1,
    "void": 1,
    "typeof": 1,
    "instanceof": 1,
    "break": 1,
    "continue": 1,
    "return": 1,
    "throw": 1,
    "try": 1,
    "catch": 1,
    "finally": 1,
    "if": 1,
    "else": 1,
    "for": 1,
    "while": 1,
    "do": 1,
    "with": 1,
    "switch": 1,
    "case": 1,
    "default": 1
};

Keywords.isJavaScriptKeyword = function(name)
{
    return name in Keywords.jsKeywords;
};

// ********************************************************************************************* //

return Keywords;

// ********************************************************************************************* //
});
