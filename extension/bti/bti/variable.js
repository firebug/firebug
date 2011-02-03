/* See license.txt for terms of usage */

// ************************************************************************************************
// Module

var EXPORTED_SYMBOLS = ["Variable"];

// ************************************************************************************************
// Variable

/**
 * Describes a variable visible in a stack frame of an execution context, or a property
 * of an object. A variable has a name and a value.
 * 
 * @constructor
 * @param name variable name as a {@link String}
 * @type Variable
 * @return a new Variable
 * @version 1.0
 */
function Variable(name)
{
    this.name = name;
}

/**
 * Returns the name of this variable as a {@link String}.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns the name of this variable as a {@link String}
 */
Variable.prototype.getName = function()
{
    return this.name;
};

/**
 * Requests the value of this variable asynchronously. The value will be retrieved
 * and reported back to the listener function when available. The listener may be
 * called before of after this function returns.
 * 
 * @function
 * @param listener a listener (function) that accepts an {@link ObjectReference} or
 *  <code>null</code> (indicates the value of this variable is <code>null</code>) 
 */
Variable.prototype.getValue = function(listener)
{
    // TODO:
};

// ************************************************************************************************
// CommonJS

exports = Variable;
