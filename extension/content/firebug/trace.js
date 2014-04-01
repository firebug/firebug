/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Our global trace object.

var FBTrace = {};

// ********************************************************************************************* //

(function() {

// ********************************************************************************************* //

try
{
    var scope = {};
    Components.utils["import"]("resource://firebug/fbtrace.js", scope);
    FBTrace = scope.FBTrace;

    FBTrace.time("SCRIPTTAG_TIME");
}
catch (err)
{
    Components.utils.reportError(err);
}

// ********************************************************************************************* //
// Some examples of tracing APIs

// 1) Log "Hello World!" into the console.
//    FBTrace.sysout("Hello World!")
//
// 2) Log "Hello World!" if the DBG_ERRORS option is true.
//    if (FBTrace.DBG_ERRORS)
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

// ********************************************************************************************* //
})();
