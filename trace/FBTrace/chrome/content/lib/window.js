/* See license.txt for terms of usage */

define([
],
function(FBTrace) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;

var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);

var Win = {};

// ********************************************************************************************* //

// Iterate over all opened firefox windows of the given type. If the callback returns true
// the iteration is stopped.
Win.iterateBrowserWindows = function(windowType, callback)
{
    var windowList = wm.getZOrderDOMWindowEnumerator(windowType, true);
    if (!windowList.hasMoreElements())
        windowList = wm.getEnumerator(windowType);

    while (windowList.hasMoreElements())
    {
        if (callback(windowList.getNext()))
            return true;
    }

    return false;
};

// ********************************************************************************************* //

return Win;

// ********************************************************************************************* //
});
