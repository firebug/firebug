/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

var EXPORTED_SYMBOLS = ["Property"];

// ************************************************************************************************
// Property

/**
 * Describes a property of an object. A property has a name and a value.
 * 
 * @constructor
 * @param name property name as a {@link String}
 * @type Property
 * @return a new {@link Property}
 * @version 1.0
 */
function Property(name)
{
    this.name = name;
}

/**
 * Returns the name of this property as a {@link String}.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns the name of this property as a {@link String}
 */
Property.prototype.getName = function()
{
    return this.name;
};

/**
 * Requests the value of this property asynchronously. The value will be retrieved
 * and reported back to the listener function when available. The listener may be
 * called before of after this function returns.
 * 
 * @function
 * @param listener a listener (function) that accepts an {@link ObjectReference} or
 *  <code>null</code> (indicates the value of this property is <code>null</code>) 
 */
Property.prototype.getValue = function(listener)
{
    // TODO:
};

// ************************************************************************************************
// CommonJS

exports = Property;
