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
function ArrayReference(id, length) {
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
ArrayReference.prototype.getLength = function() {
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
ArrayReference.prototype.getValue = function(index, listener) {
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
ArrayReference.prototype.getValues = function(index, length, listener) {
	// TODO:
};