/**
 * Software License Agreement (BSD License)
 * 
 * Copyright (c) 2010 IBM Corporation.
 * All rights reserved.
 * 
 * Redistribution and use of this software in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 * 
 * * Redistributions of source code must retain the above
 *   copyright notice, this list of conditions and the
 *   following disclaimer.
 * 
 * * Redistributions in binary form must reproduce the above
 *   copyright notice, this list of conditions and the
 *   following disclaimer in the documentation and/or other
 *   materials provided with the distribution.
 * 
 * * Neither the name of IBM nor the names of its
 *   contributors may be used to endorse or promote products
 *   derived from this software without specific prior
 *   written permission of IBM.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
 * OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

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
