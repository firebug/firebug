/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/array",
    "firebug/lib/css",
    "firebug/lib/domplate",
    "firebug/lib/string",
    "firebug/chrome/window",
    "firebug/editor/inlineEditor",
    "firebug/css/autoCompleter",
],
function(Firebug, Arr, Css, Domplate, Str, Win, InlineEditor, CSSAutoCompleter) {

"use strict";

// ********************************************************************************************* //
// Constants

const reSelectorChar = /[-_0-9a-zA-Z]/;

// ********************************************************************************************* //
// CSS Selector Editor

function SelectorEditor() {}

SelectorEditor.prototype = Domplate.domplate(InlineEditor.prototype,
{
    // 'null' means every document in the context.
    doc: null,

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

        var preSelector = preExpr.split(",").reverse()[0].trimLeft();
        var hasCombinator = (preSelector && " >+~".indexOf(preSelector.slice(-1)) !== -1);

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
        var hasAnyElements = false;
        var traverseDom = function(doc)
        {
            // Traverse the DOM to get the used ids/classes/tag names that
            // are relevant as continuations.
            // (Tag names could be hard-coded, but finding which ones are
            // actually used hides annoying things like 'b'/'i' when they
            // are not used, and works in other contexts than HTML.)
            // This isn't actually that bad, performance-wise.
            var els = null;
            if (preSelector)
                els = doc.querySelectorAll(preSelector + (hasCombinator ? "*" : ""));
            else
                els = doc.getElementsByTagName("*");
            els = [].slice.call(els);
            hasAnyElements = hasAnyElements || (els.length > 0);

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
                ret.push.apply(ret, classes.map(function(cl)
                {
                    return "." + cl;
                }));
            }
        };

        try
        {
            if (this.doc)
            {
                traverseDom(this.doc);
            }
            else
            {
                Win.iterateWindows(context.window, function(win)
                {
                    traverseDom(win.document);
                });
            }
        }
        catch (exc)
        {
            if (FBTrace.DBG_CSS)
                FBTrace.sysout("Invalid previous selector part \"" + preSelector + "\"", exc);
            return [];
        }

        if (includePseudoClasses && hasAnyElements)
        {
            // Add the pseudo-class-looking :before, :after.
            ret.push(
                ":after",
                ":before"
            );

            ret.push.apply(ret, CSSAutoCompleter.stripCompletedParens(Css.pseudoClasses, postExpr));
        }

        if (includePseudoElements && hasAnyElements)
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

        return Arr.sortUnique(ret);
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


// ********************************************************************************************* //
// Registration

return SelectorEditor;

// ********************************************************************************************* //
});
