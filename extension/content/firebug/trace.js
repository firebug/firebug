/* See license.txt for terms of usage */

// The only global trace object.
var FBTrace = null;

// ************************************************************************************************

(function() {

// Debug Logging for Firebug internals (see firebug-trace-service for more details).
var FBTraceAPI = Components.classes["@joehewitt.com/firebug-trace-service;1"].getService(Components.interfaces.nsISupports).wrappedJSObject;

// Helper trace object associted with extension domain.
function _FBTrace(prefDomain) {
    this.prefDomain = prefDomain; // Modified from within a Firebug extension.
}

// Derive all properties from FBTraceAPI
for (var p in FBTraceAPI)
    _FBTrace.prototype[p] = FBTraceAPI[p];

// Override sysout function in order to mark all logs from this extension. 
// This makes possible to filter logs by source extensions.
_FBTrace.prototype.sysout = function(message, obj) {
    FBTraceAPI.dump(this.prefDomain, message, obj);
}

// Initialize global object.
FBTrace = new _FBTrace("extensions.firebug");

})();

// ************************************************************************************************
// Some examples of tracing APIs

// 1) Log "Hello World!" into the console.
//    FBTrace.sysout("Hello World!")       
//
// 2) Log "Hello World!" if the DBG_ERROR option is true.
//    if (FBTrace.DBG_ERROR)
//       FBTrace.sysout("Hello World!");  
//
// 3) Log "Hello World!" and various info about 'world' object.
//    FBTrace.sysout("Hello World!", world);  
//
// 4) Log into specific console (created by Firebug extension).
//    FBTrace.dump("firebug.extensions", "Hello World!", world);
//    FBTrace.dump("chromebug.extensions", "Hello World!", world);
//
// TODO: how to open another console.