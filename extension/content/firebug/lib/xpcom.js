/* See license.txt for terms of usage */

define([], function() {

// ********************************************************************************************* //
// Globals

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

// Module Object
var XPCOM = {};

// ********************************************************************************************* //
// XPCOM Utilities

/**
 * Returns required XPCOM service
 * @param {Object} cName Name of the service.
 * @param {Object} ifaceName Name of the required interface 
 */
XPCOM.CCSV = function(cName, ifaceName)
{
    try
    {
        // if fbs fails to load, the error can be Cc[cName] has no properties
        return Cc[cName].getService(Ci[ifaceName]);
    }
    catch (exc)
    {
        Cu.reportError(cName + "@" + ifaceName + " FAILED " + exc);

        if (!Cc[cName])
            Cu.reportError("XPCOM.CCSV; No Components.classes entry for " + cName);
        else if (!Ci[ifaceName])
            Cu.reportError("XPCOM.CCSV; No Components.interfaces entry for " + ifaceName);
    }
};

/**
 * Returns a new instance of required XPCOM component
 * @param {Object} cName Name of the component.
 * @param {Object} ifaceName Name of required interface.
 */
XPCOM.CCIN = function(cName, ifaceName)
{
    try
    {
        return Cc[cName].createInstance(Ci[ifaceName]);
    }
    catch (exc)
    {
        Cu.reportError(cName + "@" + ifaceName + " FAILED " + exc);

        if (!Cc[cName])
            Cu.reportError("XPCOM.CCIN; No Components.classes entry for " + cName);
        else if (!Ci[ifaceName])
            Cu.reportError("XPCOM.CCIN; No Components.interfaces entry for " + ifaceName);
    }
};

/**
 * Queries passed object for requred interface.
 * @param {Object} obj Object to query an interface for.
 * @param {Object} iface Required interface.
 */
XPCOM.QI = function(obj, iface)
{
    try
    {
        return obj.QueryInterface(iface);
    }
    catch (exc)
    {
        Cu.reportError(cName + "@" + ifaceName + " FAILED " + exc);
    }
};

// ********************************************************************************************* //

Firebug.XPCOM = XPCOM;

return XPCOM;

// ********************************************************************************************* //
});
