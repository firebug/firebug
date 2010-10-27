/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

var EXPORTED_SYMBOLS = ["BTI"];

// ************************************************************************************************
// Imports

var BTI = {};
Components.utils.import("resource://firebug/bti/browser.js", BTI);
Components.utils.import("resource://firebug/bti/breakpoint.js", BTI);
Components.utils.import("resource://firebug/bti/browsercontext.js", BTI);
Components.utils.import("resource://firebug/bti/compilationunit.js", BTI);
Components.utils.import("resource://firebug/bti/executioncontext.js", BTI);
Components.utils.import("resource://firebug/bti/frame.js", BTI);
Components.utils.import("resource://firebug/bti/objectreference.js", BTI);
Components.utils.import("resource://firebug/bti/functionreference.js", BTI);
Components.utils.import("resource://firebug/bti/arrayreference.js", BTI);
Components.utils.import("resource://firebug/bti/primitive.js", BTI);
Components.utils.import("resource://firebug/bti/property.js", BTI);
Components.utils.import("resource://firebug/bti/variable.js", BTI);

