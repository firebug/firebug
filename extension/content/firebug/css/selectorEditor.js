/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/domplate",
    "firebug/lib/locale",
    "firebug/lib/css",
    "firebug/lib/string",
    "firebug/lib/array",
],
function(Firebug, Domplate, Locale, Css, Str, Arr) {

"use strict";

// ********************************************************************************************* //
// Constants

const reSelectorChar = /[-_0-9a-zA-Z]/;

// ********************************************************************************************* //
// CSS Selector Editor

function SelectorEditor() {}

SelectorEditor.prototype = Domplate.domplate(Firebug.InlineEditor.prototype,
{
    getAutoCompleteRange: function(value, offset)
    {
        // Find the word part of an identifier.
        var reIdent = /[-_a-zA-Z0-9]*/;
        var rbefore = Str.reverseString(value.substr(0, offset));
        var after = value.substr(offset);
        var start = offset - reIdent.exec(rbefore)[0].length;
        var end = offset + reIdent.exec(after)[0].length;

        // Expand it to include '.', '#', ':', or '::'.
        if (start > 0 && ".#:".indexOf(value.charAt(start-1)) !== -1)
        {
            --start;
            if (start > 0 && value.substr(start-1, 2) === "::")
                --start;
        }
        return {start: start, end: end};
    },

    getAutoCompleteList: function(preExpr, expr, postExpr, range, cycle, context, out)
    {
        // Don't support attribute selectors, for now.
        if (preExpr.lastIndexOf("[") > preExpr.lastIndexOf("]"))
            return [];

        if (preExpr.lastIndexOf("(") > preExpr.lastIndexOf(")"))
        {
            // We are in an parenthesized expression, where we can only complete
            // for a few particular pseudo-classes that take selector-like arguments.
            var par = preExpr.lastIndexOf("("), colon = preExpr.lastIndexOf(":", par);
            if (colon === -1)
                return;
            var allowed = ["-moz-any", "not", "-moz-empty-except-children-with-localname"];
            var name = preExpr.substring(colon+1, par);
            if (allowed.indexOf(name) === -1)
                return [];
        }

        var includeTagNames = true;
        var includeIds = true;
        var includeClasses = true;
        var includePseudoClasses = true;
        var includePseudoElements = true;

        if (expr.length > 0)
        {
            includeTagNames = includeClasses = includeIds =
                includePseudoClasses = includePseudoElements = false;
            if (Str.hasPrefix(expr, "::"))
                includePseudoElements = true;
            else if (expr.charAt(0) === ":")
                includePseudoClasses = true;
            else if (expr.charAt(0) === "#")
                includeIds = true;
            else if (expr.charAt(0) === ".")
                includeClasses = true;
            else
                includeTagNames = true;
        }
        if (preExpr.length > 0 && reSelectorChar.test(preExpr.slice(-1)))
            includeTagNames = false;

        var ret = [];

        if (includeTagNames || includeIds || includeClasses)
        {
            // Traverse the DOM to get the used ids/classes/tag names that
            // are relevant as continuations.
            // (Tag names could be hard-coded, but finding which ones are
            // actually used hides annoying things like 'b'/'i' when they
            // are not used, and works in other contexts than HTML.)
            // This isn't actually that bad, performance-wise.
            var doc = context.window.document, els;
            if (preExpr && " >+~".indexOf(preExpr.slice(-1)) === -1)
            {
                try
                {
                    var preSelector = preExpr.split(",").reverse()[0];
                    els = doc.querySelectorAll(preSelector);
                }
                catch (exc)
                {
                    if (FBTrace.DBG_CSS)
                        FBTrace.sysout("Invalid previous selector part \"" + preSelector + "\"", exc);
                }
            }
            if (!els)
                els = doc.getElementsByTagName("*");
            els = [].slice.call(els);

            if (includeTagNames)
            {
                var tagMap = {};
                els.forEach(function(e)
                {
                    tagMap[e.localName] = 1;
                });
                ret.push.apply(ret, Object.keys(tagMap));
            }

            if (includeIds)
            {
                var ids = [];
                els.forEach(function(e)
                {
                    if (e.id)
                        ids.push(e.id);
                });
                ids = Arr.sortUnique(ids);
                ret.push.apply(ret, ids.map(function(cl)
                {
                    return "#" + cl;
                }));
            }

            if (includeClasses)
            {
                var clCombinationMap = Object.create(null), classes = [];
                els.forEach(function(e)
                {
                    var cl = e.className;
                    if (cl && !(cl in clCombinationMap))
                    {
                        clCombinationMap[cl] = 1;
                        classes.push.apply(classes, e.classList);
                    }
                });
                classes = Arr.sortUnique(classes);
                ret.push.apply(ret, classes.map(function(cl)
                {
                    return "." + cl;
                }));
            }
        }

        if (includePseudoClasses)
        {
            // Add the pseudo-class-looking :before, :after.
            ret.push(
                ":after",
                ":before"
            );

            ret.push.apply(ret, SelectorEditor.stripCompletedParens(Css.pseudoClasses, postExpr));
        }

        if (includePseudoElements)
        {
            ret.push.apply(ret, Css.pseudoElements);
        }

        // Don't suggest things that are already included (by way of totally-
        // incorrect-but-probably-good-enough logic).
        var rev = Str.reverseString(preExpr);
        var partInd = rev.search(/[, >+~]/);
        var lastPart = (partInd === -1 ? rev : rev.substr(0, partInd));
        lastPart = Str.reverseString(lastPart);
        if (lastPart !== "")
        {
            ret = ret.filter(function(str)
            {
                var ind = lastPart.indexOf(str);
                if (ind === -1)
                    return true;
                var before = ind-1, after = ind+str.length;
                var re = reSelectorChar;
                if (before >= 0 && re.test(str.charAt(0)) && re.test(lastPart.charAt(before)))
                    return true;
                if (after < lastPart.length && re.test(lastPart.charAt(after)))
                    return true;
                return false;
            });
        }

        // Don't suggest internal Firebug things.
        var reInternal = /^[.#]firebug[A-Z]/;
        ret = ret.filter(function(str)
        {
            return !reInternal.test(str);
        });

        if (ret.indexOf(":hover") !== -1)
            out.suggestion = ":hover";

        return ret.sort();
    },

    getAutoCompletePropSeparator: function(range, expr, prefixOf)
    {
        // For e.g. 'd|span', expand to a descendant selector; otherwise assume
        // that this is part of the same selector part.
        return (reSelectorChar.test(prefixOf.charAt(0)) ? " " : "");
    },

    autoCompleteAdjustSelection: function(value, offset)
    {
        if (offset >= 2 && value.substr(offset-2, 2) === "()")
            return offset-1;
        return offset;
    }
});


// Transform completions so that they don't add additional parentheses when
// ones already exist.
SelectorEditor.stripCompletedParens = function(list, postExpr)
{
    var c = postExpr.charAt(0), rem = 0;
    if (c === "(")
        rem = 2;
    else if (c === ")")
        rem = 1;
    else
        return list;
    return list.map(function(cl)
    {
        return (cl.slice(-2) === "()" ? cl.slice(0, -rem) : cl);
    });
};

// ********************************************************************************************* //
// Registration

return SelectorEditor;

// ********************************************************************************************* //
});
