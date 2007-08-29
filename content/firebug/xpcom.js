/* See license.txt for terms of usage */

function XPCOMUtils() {}

(function() {

// ************************************************************************************************
// XPCOM Utilities

var _CI = Components.interfaces;
var _CC = Components.classes;

this.CC = function(cName)
{
    return _CC[cName];
};

this.CI = function(ifaceName)
{
    return _CI[ifaceName];
};

this.CCSV = function(cName, ifaceName)
{
    return _CC[cName].getService(_CI[ifaceName]);        
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
