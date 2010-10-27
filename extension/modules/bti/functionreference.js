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
