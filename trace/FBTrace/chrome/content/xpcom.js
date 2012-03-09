/* See license.txt for terms of usage */

define([], function() { with (FBL) {

// ************************************************************************************************
// Shorcuts and Services

var Cc = Components.classes;
var Ci = Components.interfaces;

// ************************************************************************************************
// Shorcuts and Services

var XPCOM =
{
    toSupportsString: function(string)
    {
        var wrapper = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
        wrapper.data = string;
        return wrapper; 
    },

    toSupportsInt32: function(number)
    {
        var wrapper = Cc["@mozilla.org/supports-PRInt32;1"].createInstance(Ci.nsISupportsPRInt32);
        wrapper.data = number;
        return wrapper; 
    }
}

// ************************************************************************************************

return XPCOM;

// ************************************************************************************************
}});
