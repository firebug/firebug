/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

var EXPORTED_SYMBOLS = ["FirebugGCLICommands"];

var scope = {};
Cu["import"]("resource://firebug/firebug-trace-service.js", scope);
var FBTrace = scope.traceConsoleService.getTracer("extensions.firebug");

// ********************************************************************************************* //
// GCLI

var scope = {};

try
{
    Cu.import("resource://gre/modules/devtools/gcli.jsm", scope);
}
catch (err)
{
    if (FBTrace.DBG_ERRORS)
        FBTrace.sysout("ERROR GCLI not available " + err, err);
}

// Load the Locale module and make sure Firebug string bundle is registered
// (GCLI commands needs to be localized)
var Locale = Cu.import("resource://firebug/locale.js").Locale;
Locale.registerStringBundle("chrome://firebug/locale/firebug.properties");

if (scope.gcli) {

// ********************************************************************************************* //
// FirebugGCLICommands

var FirebugGCLICommands =
{
    startup: function()
    {
        registerCommands();
    },

    shutdown: function()
    {
        unregisterCommands();
    }
};

// ********************************************************************************************* //
// Command Implementation

/**
 * Read https://developer.mozilla.org/en/Tools/GCLI/Writing_GCLI_Commands
 * about how to implement GCLI commands.
 */
var FirebugController =
{
    openFirebug: function(args, context)
    {
        this.startFirebug(context, function(Firebug) {
            Firebug.toggleBar(true);
        });
    },

    hideFirebug: function(args, context)
    {
        this.startFirebug(context, function(Firebug) {
            Firebug.minimizeBar();
        });
    },

    closeFirebug: function(args, context)
    {
        var Firebug = context.environment.chromeDocument.defaultView.Firebug;
        if (!Firebug)
            return;

        if (!Firebug.isLoaded)
            return;

        this.startFirebug(context, function(Firebug) {
            Firebug.closeFirebug();
        });
    },

    detachFirebug: function(args, context)
    {
        this.startFirebug(context, function(Firebug) {
            Firebug.toggleDetachBar(true);
        });
    },

    attachFirebug: function(args, context)
    {
        this.startFirebug(context, function(Firebug) {
            if (Firebug.isDetached())
                Firebug.toggleDetachBar();
            Firebug.toggleBar(true);
        });
    },

    startFirebug: function(context, callback)
    {
        var Firebug = context.environment.chromeDocument.defaultView.Firebug;
        if (!Firebug)
            return;

        Firebug.browserOverlay.startFirebug(function(Firebug) {
            callback(Firebug);
        });
    }
};

// ********************************************************************************************* //
// Registration

var commands = [];

function addCommand(command)
{
    if (scope.gcli.addCommand)
        scope.gcli.addCommand(command);
    else
        scope.gcli.addItems([command]);
    commands.push(command);
}

function registerCommands()
{
    addCommand({
        name: "firebug",
        description: "Web Development Evolved"
    });

    addCommand({
        name: "firebug open",
        description: Locale.$STR("firebug.menu.tip.Open_Firebug"),
        exec: FirebugController.openFirebug.bind(FirebugController)
    });

    addCommand({
        name: "firebug hide",
        description: Locale.$STR("firebug.menu.tip.Minimize_Firebug"),
        exec: FirebugController.hideFirebug.bind(FirebugController)
    });

    addCommand({
        name: "firebug close",
        description: Locale.$STR("firebug.shortcut.tip.closeFirebug"),
        exec: FirebugController.closeFirebug.bind(FirebugController)
    });

    addCommand({
        name: "firebug detach",
        description: Locale.$STR("firebug.DetachFirebug"),
        exec: FirebugController.detachFirebug.bind(FirebugController)
    });

    addCommand({
        name: "firebug attach",
        description: Locale.$STR("firebug.AttachFirebug"),
        exec: FirebugController.attachFirebug.bind(FirebugController)
    });
}

function unregisterCommands()
{
    for (var i=0; i<commands.length; i++)
        scope.gcli.removeCommand(commands[i]);

    commands = [];
}

// ********************************************************************************************* //
}
