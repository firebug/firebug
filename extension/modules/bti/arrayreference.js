/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

var rootPath = "";
if (typeof(require) == "undefined") {
    var chrome = typeof(Components) != "undefined";
    require = chrome ? Components.utils["import"] : function() {};
    rootPath = chrome ? "resource://firebug/bti/" : "";
}

require(rootPath + "lib.js");
require(rootPath + "objectreference.js");

var EXPORTED_SYMBOLS = ["ArrayReference"];

// ************************************************************************************************
// ArrayReference

/**
 * Describes an instance of an array object in a JavaScript program.
 * 
 * @constructor
 * @param id unique object identifier (number)
 * @param length of the array
 * @type ArrayReference
 * @augments ObjectReference
 * @return a new {@link ArrayReference}
 * @version 1.0
 */
function ArrayReference(id, length)
{
    ObjectReference.call(this, "array", id);
    this.length = length;
}

/**
 * Subclass of {@link ObjectReference}
 */
ArrayReference.prototype = subclass(ObjectReference.prototype);

/**
 * Returns the length of this array.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns the length of this array.
 */
ArrayReference.prototype.getLength = function()
{
    return this.length;
};

/**
 * Requests the value at the specified index of this array asynchronously. The value
 * will be retrieved and reported back to the listener when available. The listener
 * may be called before after this function returns.
 * 
 * @function
 * @param index the index of the value to return
 * @param listener a listener (function) that accepts an {@link ObjectReference} or
 *  <code>null</code> (indicates the value at the specified index is <code>null</code>).
 */
ArrayReference.prototype.getValue = function(index, listener)
{
    // TODO:
};

/**
 * Requests a range of values at the specified index of this array asynchronously. The values
 * will be retrieved and reported back to the listener when available. The listener
 * may be called before after this function returns.
 * 
 * @function
 * @param index the offset to start retrieving values at
 * @param length the number of values to retrieve
 * @param listener a listener (function) that accepts an array of {@link ObjectReference} or
 *  <code>null</code> (indicates the value at the specified index is <code>null</code>).
 */
ArrayReference.prototype.getValues = function(index, length, listener)
{
    // TODO:
};

// ************************************************************************************************
// CommonJS

exports = ArrayReference;
