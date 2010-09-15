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
 * Describes a JavaScript execution context in a browser. An execution
 * context pertains to one or more compilation units (JavaScript scripts)
 * that may contain breakpoints. An execution context can suspend and resume
 * and provides stack frames when suspended.
 * 
 * @constructor
 * @param id unique execution context identifier, a {@link String} that cannot be <code>null</code>
 * @param browser the browser that contains the execution context
 * @type JavaScriptContext
 * @return a new JavaScriptContext
 * @version 1.0
 */
function JavaScriptContext(id, browser) {
	this.id = id;
	this.browser = browser;
	this.scripts = [];
	this.is_destroyed = false;
	this.is_suspended = false;
	this.frames = [];
}

//---- API ----

/**
 * Returns the unique identifier of this execution context.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns execution context identifier as a {@link String}
 */
JavaScriptContext.prototype.getId = function() {
	return this.id;
};

/**
 * Returns the browser this execution context is contained in.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a {@link Browser}
 */
JavaScriptContext.prototype.getBrowser = function() {
	return this.browser;
};

/**
 * Returns whether this execution context is currently suspended.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a boolean indicating whether this execution context is currently suspended
 */
JavaScriptContext.prototype.isSuspended = function() {
	return this.is_suspended;
};

/**
 * Returns whether this execution context currently exists. Returns <code>false</code>
 * if this execution context has been destroyed.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a boolean indicating whether this execution context currently exists
 */
JavaScriptContext.prototype.exists = function() {
	return !this.is_destroyed;
};

/**
 * Returns all breakpoints that have been created in this execution context
 * that have not been cleared.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns an array of {@link Breakpoint}'s installed in this {@link JavaScriptContext}
 */
JavaScriptContext.prototype.getBreakpoints = function() {
	// TODO: return all breakpoints from all scripts in this context
	// might call out to the browser to ensure consistency
};

/**
 * Returns all JavaScript compilation units that have been compiled (loaded) in this
 * execution context.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns an array of {@link CompilationUnit}'s
 */
JavaScriptContext.prototype.getCompilationUnits = function() {
	// return a copy of scripts so the master copy is not corrupted
	var knownScripts = [];
	for ( var i = 0; i < this.scripts.length; i++) {
		knownScripts.push(this.scripts[i]);
	}
	return knownScripts;
};

/**
 * Requests to suspend this execution context asynchronously iff this context is in a running
 * state. The request will be sent to the browser and an <code>onBreak</code> event will be
 * sent asynchronously by the {@link Browser} when the underlying execution context suspends.
 * 
 * @function
 */
JavaScriptContext.prototype.suspend = function() {
	//TODO:
};

/**
 * Requests to resume this execution context asynchronously iff this context is in a suspended
 * state. The request will be sent to the browser and an <code>onResume</code> event will be
 * sent asynchronously by the {@link Browser} when the underlying execution context resumes.
 * 
 * @function
 */
JavaScriptContext.prototype.resume = function() {
	//TODO:
};

/**
 * Requests all frames in this execution context asynchronously. Stack frames are only available
 * when an execution context is suspended. Stack frames will be retrieved from the browser (if required) and
 * reported to the listener function when available. The listener function may be called before or
 * after this function returns. If this execution context is not suspended an empty array is reported.
 * 
 * @function
 * @param listener a function that accepts an array of {@link StackFrame}'s.
 */
JavaScriptContext.prototype.getStackFrames = function(listener) {
	// TODO:
};

//---- PRIVATE ----