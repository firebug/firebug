/* See license.txt for terms of usage */

// Debug Logging for Firebug internals (see firebug-trace-service for more details).
var FBTrace = Components.classes["@joehewitt.com/firebug-trace-service;1"]
    .getService(Components.interfaces.nsISupports).wrappedJSObject;

// FBTrace.sysout("Hello World!")       // Log "Hello World!" into the console.
//
// if (FBTrace.DBG_ERROR)
//     FBTrace.sysout("Hello World!");  // Log "Hello World!" if the DBG_ERROR option is true.
//
// FBTrace.sysout("Hello World!", world);  // log "Hello World!" and various info about 'world' object.
// 
