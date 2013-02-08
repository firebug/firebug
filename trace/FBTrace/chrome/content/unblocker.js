/* See license.txt for terms of usage */

define([
],
function() {

// ********************************************************************************************* //
// Constants

var releaser = window.arguments[0];  // see fbtrace/components/commandLine.js

// ********************************************************************************************* //
// Implementation

function onLoad(event)
{
    window.dump("-------- " + window.location + " unblocker load -----------------\n");

    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
        .getService(Components.interfaces.nsIWindowMediator);

    var enumerator = wm.getEnumerator(null);
    while (enumerator.hasMoreElements())
    {
        var win = enumerator.getNext();
        if ((win.location.href === releaser.url) &&
            (releaser.prefDomain === win.releaser.prefDomain))
        {
            window.dump("-------- " + window.location + " blocker window found --------------\n");

            try
            {
                TraceConsole.applicationReleased = true;
                TraceConsole.releaser = releaser;
            }
            catch (err)
            {
                window.dump("-------- unblocker EXCEPTION: " + err + "\n");
            }
        }
    }

    window.dump("-------- " + window.location + " unblocker done -----------------\n");
}

// ********************************************************************************************* //
// Registration

window.addEventListener("load", onLoad, false);

return {};

// ********************************************************************************************* //
});
