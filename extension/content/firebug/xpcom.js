/* See license.txt for terms of usage */

function fbXPCOMUtils() {}

(function() {

// ************************************************************************************************
// XPCOM Utilities

var _CI = Components.interfaces;
var _CC = Components.classes;

this.CCSV = function(cName, ifaceName)
{
    try
    {
        return _CC[cName].getService(_CI[ifaceName]);  // if fbs fails to load, the error can be _CC[cName] has no properties
    }
    catch(exc)
    {
        Components.utils.reportError(cName+"@"+ifaceName+" FAILED "+exc);
        if (!_CC[cName])
            Components.utils.reportError("No Components.classes entry for "+cName);
        else if (!_CI[ifaceName])
            Components.utils.reportError("No Components.interfaces entry for "+ifaceName);
    }

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
