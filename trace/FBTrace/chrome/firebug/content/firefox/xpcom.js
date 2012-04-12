/* See license.txt for terms of usage */

define([], function() {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

var Xpcom = {};

// ********************************************************************************************* //
// XPCOM Utilities

/**
 * Returns required XPCOM service
 * @param {Object} cName Name of the service.
 * @param {Object} ifaceName Name of the required interface 
 */
Xpcom.CCSV = function(cName, ifaceName)
{
    try
    {
        // if fbs fails to load, the error can be Cc[cName] has no properties
        return Cc[cName].getService(Ci[ifaceName]);
    }
    catch (exc)
    {
        Cu.reportError(cName + "@" + ifaceName + " FAILED " + exc + " " +
            (exc.stack ? exc.stack : ""));

        if (!Cc[cName])
            Cu.reportError("Xpcom.CCSV; No Components.classes entry for " + cName);
        else if (!Ci[ifaceName])
            Cu.reportError("Xpcom.CCSV; No Components.interfaces entry for " + ifaceName);
    }
};

/**
 * Returns a new instance of required XPCOM component
 * @param {Object} cName Name of the component.
 * @param {Object} ifaceName Name of required interface.
 */
Xpcom.CCIN = function(cName, ifaceName)
{
    try
    {
        return Cc[cName].createInstance(Ci[ifaceName]);
    }
    catch (exc)
    {
        Cu.reportError(cName + "@" + ifaceName + " FAILED " + exc);

        if (!Cc[cName])
            Cu.reportError("Xpcom.CCIN; No Components.classes entry for " + cName);
        else if (!Ci[ifaceName])
            Cu.reportError("Xpcom.CCIN; No Components.interfaces entry for " + ifaceName);
    }
};

/**
 * Queries passed object for required interface.
 * @param {Object} obj Object to query an interface for.
 * @param {Object} iface Required interface.
 */
Xpcom.QI = function(obj, iface)
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

return Xpcom;

// ********************************************************************************************* //
});
