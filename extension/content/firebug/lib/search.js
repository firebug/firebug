/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
    "firebug/lib/options",
],
function(FBTrace, Options) {

"use strict";

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;

var Search = {};

var finder = Search.finder = Cc["@mozilla.org/embedcomp/rangefind;1"].createInstance(Ci.nsIFind);

// ********************************************************************************************* //

/**
 * @class Searches for text in a given node.
 *
 * @constructor
 * @param {Node} rootNode Node to search
 * @param {Function} rowFinder results filter. On find this method will be called
 *      with the node containing the matched text as the first parameter. This may
 *      be undefined to return the node as is.
 */
Search.TextSearch = function(rootNode, rowFinder)
{
    var doc = rootNode.ownerDocument;
    var searchRange = null;
    var startPt = null;

    /**
     * Find the first result in the node.
     *
     * @param {String} text Text to search for
     * @param {boolean} reverse true to perform a reverse search
     * @param {boolean} caseSensitive true to perform a case sensitive search
     */
    this.find = function(text, reverse, caseSensitive)
    {
        this.text = text;

        finder.findBackwards = !!reverse;
        finder.caseSensitive = !!caseSensitive;

        var range = this.range = finder.Find(
            text, searchRange,
            startPt || searchRange,
            searchRange);

        var match = range ?  range.startContainer : null;
        return this.currentNode = (rowFinder && match ? rowFinder(match) : match);
    };

    /**
     * Find the next search result
     *
     * @param {boolean} wrapAround true to wrap the search if the end of range is reached
     * @param {boolean} sameNode true to return multiple results from the same text node
     * @param {boolean} reverse true to search in reverse
     * @param {boolean} caseSensitive true to perform a case sensitive search
     */
    this.findNext = function(wrapAround, sameNode, reverse, caseSensitive)
    {
        this.wrapped = false;
        startPt = undefined;

        if (sameNode && this.range)
        {
            startPt = this.range.cloneRange();
            if (reverse)
                startPt.setEnd(startPt.startContainer, startPt.startOffset);
            else
                startPt.setStart(startPt.startContainer, startPt.startOffset+1);
        }

        if (!startPt)
        {
            var curNode = this.currentNode ? this.currentNode : rootNode;
            startPt = doc.createRange();
            try
            {
                if (reverse)
                {
                    startPt.setStartBefore(curNode);
                }
                else
                {
                    startPt.setStartAfter(curNode);
                }
            }
            catch (e)
            {
                if (FBTrace.DBG_ERRORS)
                    FBTrace.sysout("lib.TextSearch.findNext setStartAfter fails for nodeType:"+
                        (this.currentNode?this.currentNode.nodeType:rootNode.nodeType),e);

                try
                {
                    FBTrace.sysout("setStart try\n");
                    startPt.setStart(curNode);
                    FBTrace.sysout("setStart success\n");
                }
                catch (exc)
                {
                    return;
                }
            }
        }

        var match = startPt && this.find(this.text, reverse, caseSensitive);
        if (!match && wrapAround)
        {
            this.wrapped = true;
            this.reset();
            return this.find(this.text, reverse, caseSensitive);
        }

        return match;
    };

    /**
     * Resets the instance state to the initial state.
     */
    this.reset = function()
    {
        searchRange = doc.createRange();
        searchRange.selectNode(rootNode);

        startPt = searchRange;
    };

    this.reset();
};

// ********************************************************************************************* //

Search.ReversibleIterator = function(length, start, reverse)
{
    this.length = length;
    this.index = start;
    this.reversed = !!reverse;

    this.next = function()
    {
        if (this.index === undefined || this.index === null)
        {
            this.index = this.reversed ? length : -1;
        }
        this.index += this.reversed ? -1 : 1;

        return 0 <= this.index && this.index < length;
    };

    this.reverse = function()
    {
        this.reversed = !this.reversed;
    };
};

// ********************************************************************************************* //

/**
 * @class Implements a RegExp-like object that will search for the literal value
 * of a given string, rather than the regular expression. This allows for
 * iterative literal searches without having to escape user input strings
 * to prevent invalid regular expressions from being used.
 *
 * @constructor
 * @param {String} literal Text to search for
 * @param {Boolean} reverse Truthy to preform a reverse search, falsy to perform a forward seach
 * @param {Boolean} caseSensitive Truthy to perform a case sensitive search, falsy to perform
 * a case insensitive search.
 */
Search.LiteralRegExp = function(literal, reverse, caseSensitive)
{
    var searchToken = (!caseSensitive) ? literal.toLowerCase() : literal;

    this.__defineGetter__("global", function() { return true; });
    this.__defineGetter__("multiline", function() { return true; });
    this.__defineGetter__("reverse", function() { return reverse; });
    this.__defineGetter__("ignoreCase", function() { return !caseSensitive; });
    this.lastIndex = 0;

    this.exec = function(text)
    {
        if (!text)
            return null;

        var searchText = (!caseSensitive) ? text.toLowerCase() : text,
            startIndex = (reverse ? text.length-1 : 0) + this.lastIndex,
            index;

        if (0 <= startIndex && startIndex < text.length)
            index = searchText[reverse ? "lastIndexOf" : "indexOf"](searchToken, startIndex);
        else
            index = -1;

        if (index >= 0)
        {
            var ret = [ text.substr(index, searchToken.length) ];
            ret.index = index;
            ret.input = text;
            this.lastIndex = index + (reverse ? -1*text.length : searchToken.length);
            return ret;
        }
        else
            this.lastIndex = 0;

        return null;
    };

    this.test = function(text)
    {
        if (!text)
            return false;

        var searchText = (!caseSensitive) ? text.toLowerCase() : text;
        return searchText.indexOf(searchToken) >= 0;
    };
};

// ********************************************************************************************* //

Search.ReversibleRegExp = function(regex, flags)
{
    var re = {};

    function expression(text, reverse)
    {
        return text + (reverse ? "(?![\\s\\S]*" + text + ")" : "");
    }

    function flag(flags, caseSensitive)
    {
        return (flags || "") + (caseSensitive ? "" : "i");
    }

    this.exec = function(text, reverse, caseSensitive, lastMatch)
    {
        var useRegularExpression = Options.get("searchUseRegularExpression");
        // Ensure we have a regex
        var key = (reverse ? "r" : "n") + (caseSensitive ? "n" : "i")
            + (useRegularExpression ? "r" : "n");

        if (!re[key])
        {
            try
            {
                if (useRegularExpression)
                    re[key] = new RegExp(expression(regex, reverse), flag(flags, caseSensitive));
                else
                    re[key] = new Search.LiteralRegExp(regex, reverse, caseSensitive);
            }
            catch (ex)
            {
                // The user likely entered an invalid regular expression or is in the
                // process of entering a valid one. Treat this as a plain text search
                re[key] = new Search.LiteralRegExp(regex, reverse, caseSensitive);
            }
        }

        // Modify as needed to all for iterative searches
        var indexOffset = 0;
        var searchText = text;
        if (lastMatch)
        {
            if (reverse)
            {
                searchText = text.substr(0, lastMatch.index);
            }
            else
            {
                indexOffset = lastMatch.index+lastMatch[0].length;
                searchText = text.substr(indexOffset);
            }
        }

        var curRe = re[key];
        curRe.lastIndex = 0;
        var ret = curRe.exec(searchText);
        if (ret)
        {
            ret.input = text;
            ret.index = ret.index + indexOffset;
            ret.reverse = reverse;
            ret.caseSensitive = caseSensitive;
        }
        return ret;
    };

    this.fakeMatch = function(text, reverse, caseSensitive)
    {
        var ret = [text];
        ret.index = 0;
        ret.input = text;
        ret.reverse = reverse;
        ret.caseSensitive = caseSensitive;
        return ret;
    };
};

// ********************************************************************************************* //
// Registration

return Search;

// ********************************************************************************************* //
});
