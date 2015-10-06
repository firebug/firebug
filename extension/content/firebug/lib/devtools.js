/* See license.txt for terms of usage */
/*global define:1, Components:1, Window:1*/

define([
],
function() {

"use strict";

var Cu = Components.utils;

var exports = {};

// Support for new devtools modules path.
// See also:
// * https://wiki.mozilla.org/DevTools/Hacking
// * https://github.com/jryans/devtools-migrate/blob/master/README.md
// * https://developer.mozilla.org/en-US/docs/Tools/Contributing
// * https://bugzilla.mozilla.org/show_bug.cgi?id=912121
try {
  exports.devtools = Cu.import("resource://gre/modules/devtools/shared/Loader.jsm", {}).devtools;
  exports.DevToolsUtils = exports.devtools["require"]("devtools/shared/DevToolsUtils");
} catch(e) {
  exports.devtools = Cu.import("resource://gre/modules/devtools/Loader.jsm", {}).devtools;
  exports.DevToolsUtils = exports.devtools["require"]("devtools/toolkit/DevToolsUtils");
}

exports.require = exports.devtools["require"];

/**
 * Allows requiring a devtools module and specify alternative locations
 * to keep backward compatibility in case when the module location changes.
 * It helps Firebug to support multiple Firefox versions.
 *
 * @param {Object} devtools Reference to DevTools module.
 * @param {Array} locations List of URLs to try when importing the module.
 * @returns Scope of the imported module or an empty scope if module wasn't successfully loaded.
 */
exports.safeRequire = function(devtools, ...args) {
  for (var i=0; i<args.length; i++) {
    try {
      return devtools["require"](args[i]);
    }
    catch (err) {
    }
  }
  return {};
};

return exports;

// ********************************************************************************************* //
});
