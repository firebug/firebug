/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

var EXPORTED_SYMBOLS = ["ObjectReference"];

// ************************************************************************************************
// ObjectReference

/**
 * Describes an instance of an object in a JavaScript program - for example a number,
 * string or object.
 * 
 * @constructor
 * @param type type of object
 * @param id unique object identifier (a number)
 * @type ObjectReference
 * @return a new {@link ObjectReference}
 * @version 1.0
 */
function ObjectReference(type, id)
{
    this.type = type;
    this.id = id;
}

/**
 * Returns the unique identifier of this object as a number.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns unique object identifier (number)
 */
ObjectReference.prototype.getId = function()
{
    return this.id;
};

/**
 * Returns the type of data this object contains as a {@link String}.
 * One of the following is returned:
 * <ul>
 * <li><code>object</code> - implies this object is an instance of {@link ObjectReference}</li>
 * <li><code>function</code> - implies this object is an instance of {@link FunctionReference}</li>
 * <li><code>boolean</code> - implies this object is an instance of {@link Primitive}</li>
 * <li><code>number</code> - implies this object is an instance of {@link Primitive}</li>
 * <li><code>string</code> - implies this object is an instance of {@link Primitive}</li>
 * <li><code>array</code> - implies this object is an instance of {@link ArrayReference}</li>
 * </ul>
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns the type of data this object contains
 */
ObjectReference.prototype.getType = function()
{
    return this.type;
};

/**
 * Requests the properties of this object asynchronously. Properties will be
 * retrieved and reported back to the listener function when available.
 * The handler may be called before or after this function returns.
 * 
 * @function
 * @param listener a listener (function) that accepts an array of {@link Property}'s
 */
ObjectReference.prototype.getProperties = function(listener)
{
};

/**
 * Requests the specified property of this object asynchronously. The property will be
 * retrieved and reported back to the listener function when available.
 * The handler may be called before or after this function returns.
 * 
 * @function
 * @param name name of the property to retrieve
 * @param listener a listener (function) that accepts a {@link Property}
 *  or <code>null</code> if the property is undefined
 */
ObjectReference.prototype.getProperty = function(name, listener)
{
};

// ************************************************************************************************
// CommonJS

exports = ObjectReference;
