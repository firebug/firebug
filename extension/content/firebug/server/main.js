/* See license.txt for terms of usage */

(function(scope) {

// ********************************************************************************************* //

var Cu = Components.utils;
var require = Cu.import("resource://firebug/mini-require.js").require;

var Firebug = Cu.import("chrome://firebug/content/moduleConfig.js", {}).Firebug;

// Expose require also in the server mode (extensions might also need it).
Firebug.require = require;

// xxxHonza: get the same config as Firebug uses, but what about the
// stuff in firebug main? It should be moved into the config I guess.
var config = Firebug.getModuleLoaderConfig();

Cu.import("resource://firebug/loader.js");

/**
 * Load server
 */
require(config, [
    "firebug/lib/trace",
    "firebug/server/server",
],
function(FBTrace, Server) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);


// ********************************************************************************************* //
// Initialization

try
{
    Server.initialize();
    consoleService.logStringMessage("Firebug server initialized");

    // Load actors after the server is initialized.
    // xxxHonza: next step: implement some actors.
    //require(config, [], function() {
    //    consoleService.logStringMessage("FirebugServer; Running at port: 2929");
    //});

    // xxxHonza: TODO find a better place for notifying extensions
    // This is where Firebug extension can perform server mode initialization steps.
    FirebugLoader.dispatchToScopes("firebugServerLoad", [Firebug, Server]);

    // Set back-reference for the bootstrap.js so, shutdown can be sent to the Server object.
    scope.FirebugServer = Server;
}
catch (e)
{
    Cu.reportError(e);
    //FBTrace.sysout("main.initialize; EXCEPTION " + e, e);
}

// ********************************************************************************************* //
})})(this);
