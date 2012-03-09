/* See license.txt for terms of usage */

define([], function() {

// ********************************************************************************************* //
// Module

// The entire localization support is implemented in Mozilla Module so, it can be
// used yet before the Firebug is fully loaded.

return Components.utils["import"]("resource://firebug/locale.js").Locale;

// ********************************************************************************************* //
});
