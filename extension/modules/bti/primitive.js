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

var EXPORTED_SYMBOLS = ["Primitive"];

// ************************************************************************************************
// ObjectReference

/**
 * Describes an instance of a primitive object in a JavaScript program -
 * a number, boolean, or string.
 * 
 * @constructor
 * @param type - one of "boolean", "number", or "string"
 * @param id unique object identifier
 * @param value the value - a boolean, number or {@link String} 
 * @type Primitive
 * @augments ObjectReference
 * @return a new {@link Primitive}
 * @version 1.0
 */
function Primitive(type, id, value)
{
    ObjectReference.call(this, type, id);
    this.value = value;
}

/**
 * Subclass of {@link ObjectReference}
 */
Primitive.prototype = subclass(ObjectReference.prototype);

/**
 * Returns the underlying value of this object.
 * <table border="1">
 *  <tr>
 *		<th>Value Type</th>
 *		<th>Return Type</th>
 *  </tr>
 *	<tr>
 *		<td>boolean</td>
 *		<td>a boolean value</td>
 *	</tr>
 *	<tr>
 *		<td>number</td>
 *		<td>a number value</td>
 *	</tr>
 *	<tr>
 *		<td>string</td>
 *		<td>returns a {@link String}</td>
 *	</tr>
 * </table>
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns the underlying value - a boolean, number, or {@link String}
 */
Primitive.prototype.getValue = function()
{
    return this.value;
};

// ************************************************************************************************
// CommonJS

exports = Primitive;
