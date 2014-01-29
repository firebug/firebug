/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function (FBTrace) {

// ********************************************************************************************* //
// StackTrace Implementation

var imported = {};

Components.utils["import"]("resource://gre/modules/commonjs/sdk/core/promise.js", imported);

// ********************************************************************************************* //
// Registration

imported.Promise.isPromise = function(object)
{
    return object && typeof object.then === "function";
};

return imported.Promise;

// ********************************************************************************************* //
});
