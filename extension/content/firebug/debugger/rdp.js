/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function (FBTrace) {

// ********************************************************************************************* //
// Remote Debugging Protocol Types

var RDP = {};

/**
 * Set of debug protocol request types that specify the protocol request being
 * sent to the server.
 */
RDP.DebugProtocolTypes =
{
    "assign": "assign",
    "attach": "attach",
    "clientEvaluate": "clientEvaluate",
    "delete": "delete",
    "detach": "detach",
    "frames": "frames",
    "interrupt": "interrupt",
    "listTabs": "listTabs",
    "nameAndParameters": "nameAndParameters",
    "ownPropertyNames": "ownPropertyNames",
    "property": "property",
    "prototype": "prototype",
    "prototypeAndProperties": "prototypeAndProperties",
    "resume": "resume",
    "scripts": "scripts",
    "setBreakpoint": "setBreakpoint"
};

// ********************************************************************************************* //

/**
 * Set of protocol messages that affect thread state, and the
 * state the actor is in after each message.
 */
RDP.ThreadStateTypes = {
  "paused": "paused",
  "resumed": "attached",
  "detached": "detached"
};

// ********************************************************************************************* //

/**
 * Set of protocol messages that are sent by the server without a prior request
 * by the client.
 */
RDP.UnsolicitedNotifications = {
  "newSource": "newSource",
  "tabDetached": "tabDetached",
  "tabNavigated": "tabNavigated"
};

// ********************************************************************************************* //
// Registration

return RDP;

// ********************************************************************************************* //
});
