/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function (FBTrace) {

// ********************************************************************************************* //
// StackTrace Implementation

var imported = {};
Components.utils["import"]("resource://gre/modules/commonjs/promise/core.js", imported);

// ********************************************************************************************* //
// Registration

return imported.Promise;

// ********************************************************************************************* //
});
