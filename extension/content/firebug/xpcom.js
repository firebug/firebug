/* See license.txt for terms of usage */

function fbXPCOMUtils() {}

(function() {

// ************************************************************************************************
// XPCOM Utilities

var _CI = Components.interfaces;
var _CC = Components.classes;

this.CCSV = function(cName, ifaceName)
{
	if (_CC[cName])
		return _CC[cName].getService(_CI[ifaceName]);  // if fbs fails to load, the error can be _CC[cName] has no properties
	else
		throw new Error("Firebug CCSV fails for cName:"+cName);
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

}).apply(fbXPCOMUtils);
