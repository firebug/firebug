/* See license.txt for terms of usage */

(function(scope) {

// ********************************************************************************************* //

var Cu = Components.utils;
var require = Cu.import("resource://firebug/mini-require.js").require;

var Firebug = Cu.import("chrome://firebug/content/moduleConfig.js", {}).Firebug;

// xxxHonza: get the same config as Firebug uses, but what about the 
// stuff in firebug main? It should be moved into the config I guess.
var config = Firebug.getModuleLoaderConfig();

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
    consoleService.logStringMessage("main; 2... ");

    // Load actors after the server is initialized.
    // xxxHonza: next step: implement some actors.
    //require(config, [], function() {
    //    consoleService.logStringMessage("FirebugServer; Running at port: 2929");
    //});

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
