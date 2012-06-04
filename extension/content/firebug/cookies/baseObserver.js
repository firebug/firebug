/* See license.txt for terms of usage */

define([
],
function() {

// ********************************************************************************************* //
// Base observer

var BaseObserver =
{
    QueryInterface : function (aIID) 
    {
        if (aIID.equals(nsIObserver) ||
            aIID.equals(nsISupportsWeakReference) ||
            aIID.equals(nsISupports))
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

