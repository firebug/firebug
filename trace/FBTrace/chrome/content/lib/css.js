/* See license.txt for terms of usage */

define([
],
function() {

// ********************************************************************************************* //
// Module Implementation

var Css = {};

// ************************************************************************************************
// CSS classes

var classNameReCache = {};

Css.hasClass = function(node, name)
{
    if (!node || node.nodeType != Node.ELEMENT_NODE || !node.className || !name)
        return false;

    if (name.indexOf(" ") != -1)
    {
        var classes = name.split(" "), len = classes.length, found=false;
        for (var i = 0; i < len; i++)
        {
            var cls = classes[i].trim();
            if (cls != "")
            {
                if (Css.hasClass(node, cls) == false)
                    return false;
                found = true;
            }
        }
        return found;
    }

    var re;
    if (name.indexOf("-") == -1)
        re = classNameReCache[name] = classNameReCache[name] || new RegExp('(^|\\s)' + name + '(\\s|$)', "g");
    else // XXXsroussey don't cache these, they are often setting values. Should be using setUserData/getUserData???
        re = new RegExp('(^|\\s)' + name + '(\\s|$)', "g");
    return node.className.search(re) != -1;
};

Css.setClass = function(node, name)
{
    if (!node || node.nodeType != Node.ELEMENT_NODE || name == '')
        return;

    if (name.indexOf(" ") != -1)
    {
        var classes = name.split(" "), len = classes.length;
        for (var i = 0; i < len; i++)
        {
            var cls = classes[i].trim();
            if (cls != "")
            {
                Css.setClass(node, cls);
            }
        }
        return;
    }
    if (!Css.hasClass(node, name))
        node.className = node.className.trim() + " " + name;
};

Css.removeClass = function(node, name)
{
    if (!node || node.nodeType != Node.ELEMENT_NODE || node.className == '' || name == '')
        return;

    if (name.indexOf(" ") != -1)
    {
        var classes = name.split(" "), len = classes.length;
        for (var i = 0; i < len; i++)
        {
            var cls = classes[i].trim();
            if (cls != "")
            {
                if (Css.hasClass(node, cls) == false)
                    Css.removeClass(node, cls);
            }
        }
        return;
    }

    var re;
    if (name.indexOf("-") == -1)
        re = classNameReCache[name] = classNameReCache[name] || new RegExp('(^|\\s)' + name + '(\\s|$)', "g");
    else // XXXsroussey don't cache these, they are often setting values. Should be using setUserData/getUserData???
        re = new RegExp('(^|\\s)' + name + '(\\s|$)', "g");

    node.className = node.className.replace(re, " ");
};

Css.toggleClass = function(elt, name)
{
    if (Css.hasClass(elt, name))
        Css.removeClass(elt, name);
    else
        Css.setClass(elt, name);
};

// ********************************************************************************************* //
// Registration

return Css;

// ********************************************************************************************* //
});
