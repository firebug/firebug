// *************************************************************************************************
//   Copyright (C) Joe Hewitt.                                                All Rights Reserved.
// *************************************************************************************************

const edgeSize = 2;

var highlighter = null;
var highlightBody = null;

function highlight(element)
{    
    if (!element)
    {
        if (highlightBody)
        {
            for (var edge in highlighter)
                highlightBody.removeChild(highlighter[edge]);
        
            highlightBody = null;
        }
    }
    else
    {
        var offset = getClientOffset(element);
        var w = element.offsetWidth;
        var h = element.offsetHeight;

        //element.className = "highlighted";

        highlightRect(element.ownerDocument,
                offset.x, offset.y, element.offsetWidth, element.offsetHeight,
                edgeSize, 4, 6, 1);
    }
}

function highlightRect(doc, x, y, w, h, t, r, b, l)
{
    var highlighter = getHighlighter();
    move(highlighter.top, x, y-t);
    size(highlighter.top, w, t);
    
    move(highlighter.right, x+w, y-t);
    size(highlighter.right, r, h+t+b);

    move(highlighter.bottom, x, y+h);
    size(highlighter.bottom, w, b);

    move(highlighter.left, x-l, y-t);
    size(highlighter.left, l, h+t+b);

    highlightBody = doc.body;
    
    for (var edge in highlighter)
        highlightBody.appendChild(highlighter[edge]);
}

function getHighlighter()
{
    if (!highlighter)
    {
        function createEdge(name)
        {
            var div = document.createElement("div");
            div.className = "highlighterEdge highlighter"+name;
            
            return div;
        }
        
        highlighter = 
        {
            top: createEdge("Top"),
            right: createEdge("Right"),
            bottom: createEdge("Bottom"),
            left: createEdge("Left"),
        };
    }
    
    return highlighter;
}

function getClientOffset(elt)
{
    function addOffset(elt, coords, addStyle, view)
    {
        if (addStyle)
        {
            var style = view.getComputedStyle(elt, null);
            if (style.position != "absolute")
            {
                coords.x += parseInt(style.marginLeft) + parseInt(style.borderLeftWidth);
                coords.y += parseInt(style.marginTop) + parseInt(style.borderTopWidth);
            }
        }
        
        if (elt.offsetLeft)
            coords.x += elt.offsetLeft;
        if (elt.offsetTop)
            coords.y += elt.offsetTop;
        
        if (elt.offsetParent && elt.parentNode.nodeType == 1)
            addOffset(elt.offsetParent, coords, false, view);
    }
    
    var coords = {x: 0, y: 0};
    if (elt)
        addOffset(elt, coords, false, elt.ownerDocument.defaultView);
    return coords;
}

function ddd() { console.log.apply(console, arguments); }
