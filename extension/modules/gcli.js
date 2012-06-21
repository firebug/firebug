/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// ********************************************************************************************* //
// GCLI

var scope = {};

try
{
    Cu.import("resource:///modules/devtools/gcli.jsm", scope);
}
catch (err)
{
    if (FBTrace.DBG_ERROR)
        FBTrace.sysout("GCLI not available");
}

if (scope.gcli) {

// ********************************************************************************************* //
// Services

var Locale = Cu.import("resource://firebug/locale.js").Locale;

// ********************************************************************************************* //
// Command Implementation

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

        Firebug.GlobalUI.startFirebug(function(Firebug) {
            callback(Firebug);
        });
    },
}

// ********************************************************************************************* //
// Registration

scope.gcli.addCommand({
    name: "firebug",
    description: "Web Development Evolved"
});

scope.gcli.addCommand({
    name: "firebug open",
    description: Locale.$STR("firebug.menu.tip.Open_Firebug"),
    exec: FirebugController.openFirebug.bind(FirebugController)
});

scope.gcli.addCommand({
    name: "firebug hide",
    description: Locale.$STR("firebug.menu.tip.Minimize_Firebug"),
    exec: FirebugController.hideFirebug.bind(FirebugController)
});

scope.gcli.addCommand({
    name: "firebug close",
    description: Locale.$STR("firebug.shortcut.tip.closeFirebug"),
    exec: FirebugController.closeFirebug.bind(FirebugController)
});

scope.gcli.addCommand({
    name: "firebug detach",
    description: Locale.$STR("firebug.DetachFirebug"),
    exec: FirebugController.detachFirebug.bind(FirebugController)
});

scope.gcli.addCommand({
    name: "firebug attach",
    description: Locale.$STR("firebug.AttachFirebug"),
    exec: FirebugController.attachFirebug.bind(FirebugController)
});

// ********************************************************************************************* //
}
