/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Modules

var config = Firebug.getModuleLoaderConfig();

require(config,
[
    "firebug/chrome/chrome",
    "firebug/lib/lib",
    "firebug/lib/domplate",
    "firebug/lib/options",
    "firebug/lib/xpcom",
    "firebug/firebug",
    "firebug/trace/traceModule",
    "firebug/chrome/reps",
],
function (ChromeFactory, FBL, Domplate, Options, XPCOM, Firebug)
{
    if (FBTrace.DBG_INITIALIZE || FBTrace.DBG_MODULES)
        FBTrace.sysout("FBTrace; main.js require!\n");

    Firebug.Options.initialize("extensions.firebug");
    Firebug.TraceModule.initialize();

    var chrome = ChromeFactory.createFirebugChrome(window);
    chrome.initialize();
});

// ********************************************************************************************* //
