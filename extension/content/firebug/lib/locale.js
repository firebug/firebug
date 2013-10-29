/* See license.txt for terms of usage */

define([
],
function() {

"use strict";

// ********************************************************************************************* //
// Module

// The entire localization support is implemented as a Mozilla Module so that it can be
// used before Firebug is fully loaded.
return Components.utils["import"]("resource://firebug/locale.js").Locale;

// ********************************************************************************************* //
});
