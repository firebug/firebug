/* See license.txt for terms of usage */

// ********************************************************************************************* //

var gFindBar;

(function() {

// ********************************************************************************************* //
// Constants

var config =
{
    baseUrl: "chrome://fbtrace/",
    paths: {
        "fbtrace": "content"
    },
};

// ********************************************************************************************* //
// Application Load

require(config,
[
    "fbtrace/trace",
    "fbtrace/traceConsole",
    "fbtrace/lib/options",
    "fbtrace/traceModule",
    "fbtrace/unblocker",
    "fbtrace/globalTab",
],
function(FBTrace, TraceConsole, Options, TraceModule)
{
    if (FBTrace.DBG_INITIALIZE || FBTrace.DBG_MODULES)
        FBTrace.sysout("FBTrace; main.js require!\n");

    // Needed for XUL. This should be the only global (singleton).
    window.TraceConsole = TraceConsole;

    Options.initialize("extensions.firebug");
    TraceModule.initialize();

    // xxxHonza: don't forget to fix the context menu.

    // xxxHonza: just for debugging, remove.
    window.setTimeout(function() {
        FBTrace.sysout("window ", window);
        FBTrace.sysout("Test ", {
            a: "A",
            b: "B"
        });
    }, 1000);
});

// ********************************************************************************************* //
})();

