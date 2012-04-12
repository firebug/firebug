/* See license.txt for terms of usage */

(function() {

// ********************************************************************************************* //

var releaser = window.arguments[0];  // see fbtrace/components/commandLine.js

// This value causes loader.js to pull in firebug source from Firebug
// embedded directory for the tracing console instance.
window._firebugLoadConfig =
{
    baseUrl: "chrome://fbtrace-firebug/content/",
    prefDomain: releaser.prefDomain,
};

// ********************************************************************************************* //

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
            window.dump("-------- " + window.location + " blocker window found -----------------\n");

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

window.addEventListener("load", onLoad, false);

// ********************************************************************************************* //
})();
