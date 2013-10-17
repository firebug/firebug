/* See license.txt for terms of usage */

define([
],
function() {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

var System = {};

// ********************************************************************************************* //

System.copyToClipboard = function(string)
{
    var clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
    clipboard.copyString(string);
};

System.importModule = function(locations)
{
    for (var i=0; i<locations.length; i++)
    {
        try
        {
            var moduleUrl = locations[i];
            var scope = {};
            Cu["import"](moduleUrl, scope);
            return scope;
        }
        catch (err)
        {
        }
    }
};

// ********************************************************************************************* //

return System;

// ********************************************************************************************* //
});
