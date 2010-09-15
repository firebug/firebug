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
 * Describes a stack frame in a JavaScript execution context.
 * 
 * @constructor
 * @param index frame index (0 indicates the top frame)
 * @param context the {@link JavaScriptContext} the frame is contained in
 * @param compilationUnit the {@link CompilationUnit} this frame is associated with
 * @param functionName the name of the function the frame is associated with - a {@link String}
 * @param lineNumber the source code line number the frame is associated with 
 * @type StackFrame
 * @return a new StackFrame
 * @version 1.0
 */
function StackFrame(index, context, compilationUnit, functionName, lineNumber) {
	this.index = index;
	this.context = context;
	this.compilationUnit = compilationUnit;
	this.functionName = functionName;
	this.lineNumber = lineNumber;
}

// ---- API ----

/**
 * Returns the index of this frame in the current stack of frames.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns stack frame identifier as a {@link String}
 */
StackFrame.prototype.getIndex = function() {
	return this.index;
};

/**
 * Returns the JavaScript execution context this frame is contained in.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a {@link JavaScriptContext}
 */
StackFrame.prototype.getContext = function() {
	return this.context;
};

/**
 * Returns the compilation unit this frame is associated with.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns a {@link CompilationUnit}
 */
StackFrame.prototype.getCompilationUnit = function() {
	return this.compilationUnit;
};

/**
 * Returns the name of the function this stack frame is executing.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns function name as a {@link String}
 */
StackFrame.prototype.getFunctionName = function() {
	return this.functionName;
};

/**
 * Returns the line number within this stack frame's {@link CompilationUnit} that
 * is executing. This is where execution has suspended. For the top stack
 * frame, the line number represents the next line to be executed. For frames
 * deeper in the stack it represents the line that is currently executing
 * but has not yet completed.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns line number
 */
StackFrame.prototype.getLineNumber = function() {
	return this.lineNumber;
};

/**
 * Returns the local variables currently visible in this stack frame.
 * <p>
 * This function does not require communication with
 * the browser.
 * </p>
 * @function
 * @returns the local variables currently visible in this stack frame as an array of {@link Variable}'s
 */
StackFrame.prototype.getLocals = function() {
	// TODO: locals appear to have a name and value, but the structure of the value is not yet clear to me
};


// ---- PRIVATE ---- 