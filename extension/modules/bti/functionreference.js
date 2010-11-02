/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

var rootPath = "";
if (typeof(require) == "undefined") {
    var chrome = typeof(Components) != "undefined";
    require = chrome ? Components.utils["import"] : function(){};
    rootPath = chrome ? "resource://firebug/bti/" : "";
}

require(rootPath + "lib.js");
require(rootPath + "objectreference.js");

var EXPORTED_SYMBOLS = ["FunctionReference"];

// ************************************************************************************************
// FunctionReference

/**
 * Describes an instance of a function object in a JavaScript program.
 * 
 * @constructor
 * @param id unique object identifier of this function (a number)
 * @param name function name
 * @type FunctionReference
 * @augments ObjectReference
 * @return a new {@link FunctionReference}
 * @version 1.0
 */
function FunctionReference(id, name)
{
    ObjectReference.call(this, "function", id);
    this.name = name;
}

/**
 * Subclass of {@link ObjectReference}
 */
FunctionReference.prototype = subclass(ObjectReference.prototype);

/**
 * Returns the name of this function.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns the name of this function
 */
FunctionReference.prototype.getName = function()
{
    return this.name;
};

// ************************************************************************************************
// CommonJS

exports = FunctionReference;
