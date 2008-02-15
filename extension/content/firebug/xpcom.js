/* See license.txt for terms of usage */

function XPCOMUtils() {}

(function() {

// ************************************************************************************************
// XPCOM Utilities

var _CI = Components.interfaces;
var _CC = Components.classes;

this.CCSV = function(cName, ifaceName)
{
    return _CC[cName].getService(_CI[ifaceName]);  // if fbs fails to load, the error can be _CC[cName] has no properties
};

this.CCIN = function(cName, ifaceName)
{
    return _CC[cName].createInstance(_CI[ifaceName]);
};

this.QI = function(obj, iface)
{
    return obj.QueryInterface(iface);
};

// ************************************************************************************************

}).apply(XPCOMUtils);
