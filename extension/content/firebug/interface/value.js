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

/**
 * Describes a value referenced by a variable.
 * A value represents data in a program - for example a number, string or object.
 * 
 * @constructor
 * @param type type of value
 * @param data underlying data value, based on the type of value
 * @type Value
 * @return a new Value
 * @version 1.0
 */
function Value(type, data) {
	this.type = type;
	this.data = data;
}

/**
 * Returns the type of data this value contains as a {@link String}.
 * One of the following is returned:
 * <ul>
 * <li><code>object</code></li>
 * <li><code>function</code></li>
 * <li><code>boolean</code></li>
 * <li><code>number</code></li>
 * <li><code>string</code></li>
 * <li><code>undefined</code></li>
 * </ul>
 * <p>
 * <ul>
 * <li>TODO: is an array also a special data type?</li>
 * <li>TODO: do we need to distinguish between null and undefined?</li>
 * </ul>
 * </p>
 * @function
 * @returns the type of data this value contains
 */
Value.prototype.getType = function() {
	return this.type;
};

/**
 * Returns the underlying data associated with this value.
 * <table border="1">
 * 	<tr>
 * 		<th>Value Type</th>
 * 		<th>Return Type</th>
 *  </tr>
 *  <tr>
 *		<td>object</td>
 *		<td>an array of {@link Variable}'s representing the properties of the object</td>
 *	</tr>
 *	<tr>
 *		<td>function</td>
 *		<td>TODO</td>
 *	</tr>
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
 *	<tr>
 *		<td>undefined</td>
 *		<td>returns null</td>
 *	</tr>
 * </table>
 * 
 * @function
 * @returns the underlying data value or <code>null</code> if undefined
 */
Value.prototype.getData = function() {
	return this.data;
};