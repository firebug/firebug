/* See license.txt for terms of usage */

define([
],
function() {

"use strict";

// ********************************************************************************************* //
// Constants

const ident = {
    frame: 0,
    boxModel: 1,
    imageMap: 2,
    proxyElt: 3
};

// ********************************************************************************************* //
// Implementation

var HighlighterCache =
{
    ident: ident,

    highlighters: {
        frameArr: [],
        boxModelArr: [],
        proxyEltArr: []
    },

    get: function(type)
    {
        var node;
        var hl = this.highlighters;

        switch (type)
        {
            case ident.boxModel:
                if (hl.boxModelArr.length === 1)
                {
                    node = hl.boxModelArr[0];
                    if (!node.parentElement)
                        return node;
                }
            break;
            case ident.frame:
                if (hl.frameArr.length === 1)
                {
                    node = hl.frameArr[0];
                    if (!node.parentElement)
                        return node;
                }
            break;
            case ident.proxyElt:
                if (hl.proxyEltArr.length === 1)
                {
                    node = hl.proxyEltArr[0];
                    if (!node.parentElement)
                        return node;
                }
            break;
        }
    },

    add: function(node)
    {
        switch (node.ident)
        {
            case ident.boxModel:
                this.highlighters.boxModelArr.push(node);
            break;
            case ident.frame:
                this.highlighters.frameArr.push(node);
            break;
            case ident.proxyElt:
                this.highlighters.proxyEltArr.push(node);
            break;
        }
    },

    clear: function()
    {
        clearBoxModelCache(this.highlighters.boxModelArr);

        clearCache(this.highlighters.frameArr);
        clearCache(this.highlighters.proxyEltArr);

        this.highlighters.boxModelArr = [];
        this.highlighters.frameArr = [];
        this.highlighters.proxyEltArr = [];
    }
};

// ********************************************************************************************* //
// Helpers

function clearCache(arr)
{
    try
    {
        var i, highlighter;
        for (i = arr.length - 1; i >= 0; i--)
        {
            highlighter = arr[i];

            if (highlighter && highlighter.parentNode)
                highlighter.parentNode.removeChild(highlighter);
        }
    }
    catch (err)
    {
        FBTrace.sysout("highlighterCache.clearCache; EXCEPTION " + err, err);
    }
}

function clearBoxModelCache(arr)
{
    try
    {
        var node;
        for (var i = arr.length - 1; i >= 0; i--)
        {
            var names = ["lines", "offset", "parent"];
            for (var j=0; j<names.length; j++)
            {
                var name = names[j];
                if (name === "lines")
                {
                    var lineNames = ["bottom", "left", "top", "right"];
                    for (var k=0; k<lineNames.length; k++)
                    {
                        var lineName = lineNames[k];
                        node = arr[i].lines[lineName];

                        if (node && node.parentNode)
                            node.parentNode.removeChild(node);
                    }
                }
                else
                {
                    node = arr[i][name];
                    if (node && node.parentNode)
                        node.parentNode.removeChild(node);
                }
            }
        }
    }
    catch (err)
    {
        FBTrace.sysout("clearBoxModelCache.clearCache; EXCEPTION " + err, err);
    }
}

// ********************************************************************************************* //
// Registration

return HighlighterCache;

// ********************************************************************************************* //
});
