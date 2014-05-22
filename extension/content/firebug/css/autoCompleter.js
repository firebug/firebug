/* See license.txt for terms of usage */

define([
    "firebug/firebug",
    "firebug/lib/css",
    "firebug/lib/fonts",
    "firebug/lib/string",
    "firebug/lib/array",
    "firebug/css/cssModule",
],
function(Firebug, Css, Fonts, Str, Arr, CSSModule) {

// ********************************************************************************************* //
// CSS Auto-completer

var CSSAutoCompleter =
{
    getPropertyRange: function(propName, value, offset)
    {
        if (propName == "font" || propName == "font-family")
            return CSSModule.parseCSSFontFamilyValue(value, offset, propName);
        else
            return CSSModule.parseCSSValue(value, offset);
    },

    autoCompletePropertyName: function(nodeType, expr, cycle, out)
    {
        var ret = Css.getCSSPropertyNames(nodeType);
        if (!cycle && expr)
        {
            // Make some good default suggestions.
            var list = ["color", "clear", "display", "float", "margin", "overflow", "padding",
                "-moz-appearance", "border", "background", "background-color"];
            for (var i = 0; i < list.length; ++i)
            {
                if (Str.hasPrefix(list[i], expr) && ret.indexOf(list[i]) !== -1)
                {
                    out.suggestion = list[i];
                    break;
                }
            }
        }
        return ret;
    },

    autoCompletePropertyValue: function(nodeType, propName, preExpr, expr, postExpr, range, cycle, context, out)
    {
        propName = propName.toLowerCase();
        if (expr.charAt(0) === "!")
            return ["!important"];

        var keywords;
        if (range.type === "url")
        {
            // We can't complete urls yet.
            return [];
        }
        else if (range.type === "fontFamily")
        {
            keywords = Css.cssKeywords["fontFamily"].slice();
            if (context)
            {
                // Add the fonts used in this context (they might be inaccessible
                // for this element, but probably aren't).
                var fonts = Fonts.getFontsUsedInContext(context), ar = [];
                for (var i = 0; i < fonts.length; i++)
                    ar.push(fonts[i].CSSFamilyName);
                keywords = Arr.sortUnique(keywords.concat(ar));
            }

            var q = expr.charAt(0), isQuoted = (q === '"' || q === "'");
            if (!isQuoted)
            {
                // Default to ' quotes, unless " occurs somewhere.
                q = (/"/.test(preExpr + postExpr) ? '"' : "'");
            }

            // Don't complete '.
            if (expr.length <= 1 && isQuoted)
                return [];

            // When completing, quote fonts if the input is quoted; when
            // cycling, quote them instead in the way the user seems to
            // expect to have them quoted.
            var reSimple = /^[a-z][a-z0-9-]*$/i;
            var isComplex = !reSimple.test(expr.replace(/^['"]?|['"]?$/g, ""));
            var quote = function(str)
            {
                if (!cycle || isComplex !== isQuoted)
                    return (isQuoted ? q + str + q : str);
                else
                    return (reSimple.test(str) ? str : q + str + q);
            };

            keywords = keywords.slice();
            for (var i = 0; i < keywords.length; ++i)
            {
                // Treat values starting with capital letters as font names
                // that can be quoted.
                var k = keywords[i];
                if (k.charAt(0).toLowerCase() !== k.charAt(0))
                    keywords[i] = quote(k);
            }
        }
        else
        {
            var avoid;
            if (["background", "border", "font"].indexOf(propName) !== -1)
            {
                if (cycle)
                {
                    // Cycle only within the same category, if possible.
                    var cat = Css.getCSSShorthandCategory(nodeType, propName, expr);
                    if (cat)
                        return (cat in Css.cssKeywords ? Css.cssKeywords[cat] : [cat]);
                }
                else
                {
                    // Avoid repeated properties. We assume the values to be solely
                    // space-separated tokens, within a comma-separated part (like
                    // for CSS3 multiple backgrounds). This is absolutely wrong, but
                    // good enough in practice because non-tokens for which it fails
                    // likely aren't in any category.
                    // "background-position" and "background-repeat" values can occur
                    // twice, so they are special-cased.
                    avoid = [];
                    var preTokens = preExpr.split(",").reverse()[0].split(" ");
                    var postTokens = postExpr.split(",")[0].split(" ");
                    var tokens = preTokens.concat(postTokens);
                    for (var i = 0; i < tokens.length; ++i)
                    {
                        var cat = Css.getCSSShorthandCategory(nodeType, propName, tokens[i]);
                        if (cat && cat !== "position" && cat !== "bgRepeat")
                            avoid.push(cat);
                    }
                }
            }
            keywords = Css.getCSSKeywordsByProperty(nodeType, propName, avoid);
        }

        // Add the magic inherit, initial and unset values, if they are sufficiently alone.
        if (!preExpr)
            keywords = keywords.concat(["inherit", "initial", "unset"]);

        if (!cycle)
        {
            // Make some good default suggestions.
            var list = ["white", "black", "solid", "outset", "repeat"];
            for (var i = 0; i < list.length; ++i)
            {
                if (Str.hasPrefix(list[i], expr) && keywords.indexOf(list[i]) !== -1)
                {
                    out.suggestion = list[i];
                    break;
                }
            }
        }

        return this.stripCompletedParens(keywords, postExpr);
    },

    getValuePropSeparator: function(propName, range)
    {
        // For non-multi-valued properties, fail (pre-completions don't make sense,
        // and it's less risky).
        if (!Css.multiValuedProperties.hasOwnProperty(propName))
            return null;

        if (range.type === "fontFamily")
            return ",";
        return " ";
    },

    stripCompletedParens: function(list, postExpr)
    {
        // Transform completions so that they don't add additional parentheses
        // when ones already exist.
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
    },
};

// ********************************************************************************************* //
// Registration

return CSSAutoCompleter;

// ********************************************************************************************* //
});
