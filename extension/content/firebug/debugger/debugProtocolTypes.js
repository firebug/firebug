/* See license.txt for terms of usage */

define([
],
function () {

// ********************************************************************************************* //
// Constants and Services

/**
 * Set of debug protocol request types that specify the protocol request being
 * sent to the server.
 */
const DebugProtocolTypes =
{
    "assign": "assign",
    "attach": "attach",
    "clientEvaluate": "clientEvaluate",
    "delete": "delete",
    "detach": "detach",
    "frames": "frames",
    "interrupt": "interrupt",
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
// Registration

return DebugProtocolTypes;

// ********************************************************************************************* //
});
