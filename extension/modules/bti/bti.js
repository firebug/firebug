/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

var rootPath = "";
if (typeof(require) == "undefined") {
    require = Components ? Components.utils["import"] : function(){};
    rootPath = Components ? "resource://firebug/bti/" : "";
}

var EXPORTED_SYMBOLS = ["BTI"];

// ************************************************************************************************
// Imports

var BTI = {};
require(rootPath + "browser.js", BTI);
require(rootPath + "breakpoint.js", BTI);
require(rootPath + "browsercontext.js", BTI);
require(rootPath + "compilationunit.js", BTI);
require(rootPath + "executioncontext.js", BTI);
require(rootPath + "frame.js", BTI);
require(rootPath + "objectreference.js", BTI);
require(rootPath + "functionreference.js", BTI);
require(rootPath + "arrayreference.js", BTI);
require(rootPath + "primitive.js", BTI);
require(rootPath + "property.js", BTI);
require(rootPath + "variable.js", BTI);

exports = BTI;