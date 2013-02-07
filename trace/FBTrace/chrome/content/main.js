/* See license.txt for terms of usage */

// ********************************************************************************************* //

var gFindBar;

// xxxHonza: hack, keep it global, but only Firebug needs it.
var FBTrace = {
    timeEnd: function() {},
    time: function() {},
};

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
    "firebug/chrome/chrome",
    "fbtrace/traceConsole",
    "firebug/lib/lib",
    "firebug/chrome/reps",
    "firebug/lib/domplate",
    "firebug/firebug",
    "fbtrace/serializer", // save to file, load from file
    "fbtrace/firebugExplorer",
    "fbtrace/traceCommandLine",
    "fbtrace/unblocker",
    "fbtrace/traceObjectInspector",

    // Overrides the default Firebug.TraceModule implementation that only
    // collects tracing listeners (customization of logs)
    "fbtrace/traceModule",
    "fbtrace/globalTab",
],
function(FBTrace, ChromeFactory, TraceConsole)
{
    if (FBTrace.DBG_INITIALIZE || FBTrace.DBG_MODULES)
        FBTrace.sysout("FBTrace; main.js require!\n");

    // Needed for XUL
    window.TraceConsole = TraceConsole;

    Firebug.Options.initialize("extensions.firebug");
    Firebug.TraceModule.initialize();

    var chrome = ChromeFactory.createFirebugChrome(window);
    chrome.initialize();
});

// ********************************************************************************************* //
