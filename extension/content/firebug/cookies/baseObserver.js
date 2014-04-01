/* See license.txt for terms of usage */

define([
],
function() {

// ********************************************************************************************* //
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

// ********************************************************************************************* //
// Base observer

var BaseObserver =
{
    QueryInterface : function (aIID)
    {
        if (aIID.equals(Ci.nsIObserver) ||
            aIID.equals(Ci.nsISupportsWeakReference) ||
            aIID.equals(Ci.nsISupports))
        {
            return this;
        }

        throw Components.results.NS_NOINTERFACE;
    }
};

// ********************************************************************************************* //

return BaseObserver;

// ********************************************************************************************* //
});

