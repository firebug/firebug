/* See license.txt for terms of usage */

// ********************************************************************************************* //

var gFindBar;

var config =
{
    baseLoaderUrl: "resource://fbtrace-firebug/",
    baseUrl: "resource://fbtrace_rjs/",
    paths: {
        "arch": "firebug/content/bti/inProcess",
        "firebug": "firebug/content",
        "fbtrace": "content"
    },
    coreModules: ["lib/options", "lib/xpcom"],
    xhtml: true,
};

window.dump("FBTrace; main.js begin module loading\n");

require(config,
[
    "fbtrace/trace",
    "fbtrace/traceConsole",
    "fbtrace/lib/options",
    "fbtrace/traceModule",
    "firebug/firebug",
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
    //var chrome = ChromeFactory.createFirebugChrome(window);
    //chrome.initialize();

    // xxxHonza: just for debuggin, remove.
    window.setTimeout(function() {
        FBTrace.sysout("Modules ", require.Loader.getDeps());
        FBTrace.sysout("Test ", {
            a: "A",
            b: "B"
        });
    }, 1000);
});

// ********************************************************************************************* //
