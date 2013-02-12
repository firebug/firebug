/* See license.txt for terms of usage */

define([
    "firebug/lib/trace",
],
function (FBTrace) {

// ********************************************************************************************* //
// StackTrace Implementation

var imported = {};

try
{
    Components.utils["import"]("resource://gre/modules/commonjs/sdk/core/promise.js", imported);

}
catch (e)
{
    // Introduced in Firefox 21
    Components.utils["import"]("resource://gre/modules/commonjs/promise/core.js", imported);
}

// ********************************************************************************************* //
// Registration

return imported.Promise;

// ********************************************************************************************* //
});
